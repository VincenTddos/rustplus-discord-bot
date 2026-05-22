'use strict';

const logger = require('../logger');
const { coordsToGrid } = require('../utils/mapMarkers');

/**
 * Captures team member death events. Rust+ delivers two kinds of relevant
 * broadcasts:
 *   - broadcast.teamChanged — periodic team state with isAlive/isOnline
 *   - broadcast.playerDeath  — direct death notification (steamId, position)
 *
 * Different rustplus.js versions phrase these differently; we handle the
 * most common shape and fall back to diffing teamChanged.
 */
const MAX_HISTORY = 25;

class DeathTrackerService {
  constructor({ rustplusClient, discordClient, config, store }) {
    this.rustplusClient = rustplusClient;
    this.discordClient = discordClient;
    this.config = config;
    this.store = store;
    if (!Array.isArray(this.store.get('deaths'))) this.store.set('deaths', []);
    this.lastAlive = new Map(); // steamId -> isAlive

    this.rustplusClient.onMessage((msg) => this._handle(msg));
  }

  history(limit = 5) {
    const all = this.store.get('deaths') || [];
    return all.slice(-limit).reverse();
  }

  _handle(msg) {
    try {
      const broadcast = msg && msg.broadcast;
      if (!broadcast) return;

      // Direct teamMessage — not a death, ignore.
      if (broadcast.teamMessage) return;

      if (broadcast.teamChanged && broadcast.teamChanged.teamInfo) {
        this._diffTeam(broadcast.teamChanged.teamInfo);
      }
    } catch (err) {
      logger.error('[DeathTracker] handler error:', err.message);
    }
  }

  _diffTeam(teamInfo) {
    const members = (teamInfo.members) || [];
    for (const m of members) {
      const prev = this.lastAlive.get(m.steamId);
      this.lastAlive.set(m.steamId, m.isAlive);
      if (prev === true && m.isAlive === false) {
        this._record(m);
      }
    }
  }

  _record(member) {
    const entry = {
      steamId: member.steamId,
      name: member.name,
      x: member.x,
      y: member.y,
      deathTime: member.deathTime || Date.now(),
      capturedAt: new Date().toISOString(),
    };
    const all = this.store.get('deaths') || [];
    all.push(entry);
    while (all.length > MAX_HISTORY) all.shift();
    this.store.set('deaths', all);

    logger.info(`[DeathTracker] ${member.name} died`);
    this._announce(entry);
  }

  async _announce(entry) {
    let mapSize = null;
    try {
      const info = await this.rustplusClient.getInfo();
      mapSize = info.mapSize;
    } catch (_) { /* ignore */ }
    const grid = coordsToGrid(entry.x, entry.y, mapSize);
    const where = grid ? ` at \`${grid}\`` : '';

    const discordMsg = `💀 **${entry.name}** 死亡${where}。`;
    const gameMsg = `[死亡] ${entry.name}${grid ? ` ${grid}` : ''}`;

    if (this.discordClient && this.config.discord.channelId) {
      try {
        const channel = await this.discordClient.channels.fetch(this.config.discord.channelId);
        if (channel && channel.isTextBased()) {
          await channel.send({ content: discordMsg, allowedMentions: { parse: [] } });
        }
      } catch (err) {
        logger.warn('[DeathTracker] discord send failed:', err.message);
      }
    }

    try {
      if (this.rustplusClient.isConnected()) {
        await this.rustplusClient.sendTeamMessage(gameMsg);
      }
    } catch (err) {
      logger.warn('[DeathTracker] game chat send failed:', err.message);
    }
  }
}

module.exports = DeathTrackerService;
