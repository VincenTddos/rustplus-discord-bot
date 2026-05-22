'use strict';

const logger = require('../logger');
const { MARKER_TYPE, coordsToGrid } = require('../utils/mapMarkers');

// 空投補給的 marker name 關鍵字（Rust+ 可能送 "supply_drop"、"supplydrop" 等）
const SUPPLY_DROP_NAMES = ['supply_drop', 'supplydrop', 'supply drop', 'airdrop'];

/**
 * Polls getMapMarkers periodically and announces spawns/despawns of:
 *   - Patrol Helicopter
 *   - Cargo Ship
 *   - Chinook (CH47)
 *   - Locked Crate
 *   - Supply Drop (空頭補給)
 *   - Explosions
 *
 * Announces to:
 *   - Discord channel（若已設定）
 *   - In-game team chat
 */
class EventTrackerService {
  constructor({ rustplusClient, discordClient, config, intervalSeconds = 30 }) {
    this.rustplusClient = rustplusClient;
    this.discordClient = discordClient;
    this.config = config;
    this.intervalMs = Math.max(10, intervalSeconds) * 1000;

    // markerId -> { type, isSupplyDrop, name, x, y, firstSeenAt }
    this.known = new Map();
    this.mapSize = null;
    this.timer = null;
    this.firstPoll = true;
  }

  isRunning() {
    return this.timer !== null;
  }

  start() {
    if (this.timer) return false;
    logger.info(`[Events] Polling every ${this.intervalMs / 1000}s`);
    this.timer = setInterval(() => {
      this._tick().catch((err) => logger.error('[Events] tick failed:', err.message));
    }, this.intervalMs);
    setTimeout(() => {
      this._tick().catch((err) => logger.error('[Events] initial tick failed:', err.message));
    }, 1000);
    return true;
  }

  stop() {
    if (!this.timer) return false;
    clearInterval(this.timer);
    this.timer = null;
    return true;
  }

  async _ensureMapSize() {
    if (this.mapSize) return;
    try {
      const info = await this.rustplusClient.getInfo();
      this.mapSize = info && info.mapSize;
    } catch (err) {
      logger.debug('[Events] could not fetch mapSize:', err.message);
    }
  }

  /** 判斷這個 marker 是否為空投補給 */
  _isSupplyDrop(m) {
    const name = String(m.name || '').toLowerCase();
    if (SUPPLY_DROP_NAMES.some((k) => name.includes(k))) return true;
    // 未知 type（> 8）且名稱沒線索時，也視為潛在補給
    if (m.type > 8) return true;
    return false;
  }

  async _tick() {
    if (!this.rustplusClient.isConnected()) return;
    await this._ensureMapSize();

    let markers;
    try {
      markers = await this.rustplusClient.getMapMarkers();
    } catch (err) {
      logger.debug('[Events] getMapMarkers failed:', err.message);
      return;
    }

    const seen = new Set();
    const interesting = new Set([
      MARKER_TYPE.PatrolHelicopter,
      MARKER_TYPE.CargoShip,
      MARKER_TYPE.CH47,
      MARKER_TYPE.Crate,
      MARKER_TYPE.Explosion,
    ]);

    // 未知 type 的 marker 也記錄 debug 資訊
    const knownMax = 8;

    const announcements = [];
    for (const m of markers) {
      const supplyDrop = this._isSupplyDrop(m);
      const relevant = interesting.has(m.type) || supplyDrop;
      if (!relevant) continue;

      // debug：遇到未知 type 時印出，方便日後確認
      if (m.type > knownMax) {
        logger.debug(`[Events] 未知 marker type=${m.type} name="${m.name}" x=${m.x} y=${m.y}`);
      }

      seen.add(String(m.id));
      if (!this.known.has(String(m.id))) {
        this.known.set(String(m.id), {
          type: m.type,
          isSupplyDrop: supplyDrop,
          name: m.name || '',
          x: m.x,
          y: m.y,
          firstSeenAt: Date.now(),
        });
        if (!this.firstPoll) {
          announcements.push(this._announceSpawn(m, supplyDrop));
        }
      }
    }

    // Despawns
    for (const [id, info] of this.known.entries()) {
      if (!seen.has(id)) {
        if (!this.firstPoll) {
          announcements.push(this._announceDespawn(info));
        }
        this.known.delete(id);
      }
    }

    this.firstPoll = false;
    await Promise.all(announcements);
  }

  _gridLabel(m) {
    const g = coordsToGrid(m.x, m.y, this.mapSize);
    return g ? ` at \`${g}\`` : '';
  }

  _humanType(t, isSupplyDrop = false) {
    if (isSupplyDrop) return '空頭補給';
    switch (t) {
      case MARKER_TYPE.PatrolHelicopter: return '巡邏直升機';
      case MARKER_TYPE.CargoShip: return '貨輪';
      case MARKER_TYPE.CH47: return '支奴干 (CH47)';
      case MARKER_TYPE.Crate: return '上鎖板條箱';
      case MARKER_TYPE.Explosion: return '爆炸';
      default: return '事件';
    }
  }

  _shortType(t, isSupplyDrop = false) {
    if (isSupplyDrop) return '空頭補給';
    switch (t) {
      case MARKER_TYPE.PatrolHelicopter: return '直升機';
      case MARKER_TYPE.CargoShip: return '貨輪';
      case MARKER_TYPE.CH47: return 'CH47';
      case MARKER_TYPE.Crate: return '板條箱';
      case MARKER_TYPE.Explosion: return '爆炸';
      default: return '事件';
    }
  }

  _announceSpawn(m, isSupplyDrop = false) {
    const grid = this._gridLabel(m);
    const emoji = isSupplyDrop ? '📦' : '🚨';
    const discordMsg = `${emoji} **${this._humanType(m.type, isSupplyDrop)}** 落點${grid}。`;
    const gameMsg = `[事件] ${this._shortType(m.type, isSupplyDrop)} 落點${grid.replace(/`/g, '')}`;
    return this._broadcast(discordMsg, gameMsg);
  }

  _announceDespawn(info) {
    const notable = new Set([MARKER_TYPE.PatrolHelicopter, MARKER_TYPE.CargoShip, MARKER_TYPE.Crate]);
    if (!notable.has(info.type) && !info.isSupplyDrop) return Promise.resolve();
    const label = this._humanType(info.type, info.isSupplyDrop);
    const short = this._shortType(info.type, info.isSupplyDrop);
    return this._broadcast(
      `✅ **${label}** 已消失/被搶走。`,
      `[事件] ${short} 結束`,
    );
  }

  async _broadcast(discordMsg, gameMsg) {
    if (this.discordClient && this.config.discord.channelId) {
      try {
        const channel = await this.discordClient.channels.fetch(this.config.discord.channelId);
        if (channel && channel.isTextBased()) {
          await channel.send({ content: discordMsg, allowedMentions: { parse: [] } });
        }
      } catch (err) {
        logger.warn('[Events] discord send failed:', err.message);
      }
    }
    try {
      if (this.rustplusClient.isConnected()) {
        await this.rustplusClient.sendTeamMessage(gameMsg);
      }
    } catch (err) {
      logger.warn('[Events] game chat send failed:', err.message);
    }
  }
}

module.exports = EventTrackerService;
