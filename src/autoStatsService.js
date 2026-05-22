'use strict';

const logger = require('./logger');
const statsService = require('./statsService');

/**
 * Periodically pulls stats and pushes them to Discord and/or in-game team chat.
 * Guards against multiple intervals starting in parallel.
 */
class AutoStatsService {
  constructor({ rustplusClient, discordClient, config }) {
    this.rustplusClient = rustplusClient;
    this.discordClient = discordClient;
    this.config = config;

    this.intervalHandle = null;
    this.intervalMinutes = config.autoStats.intervalMinutes;
    this.sendToDiscord = config.autoStats.sendToDiscord;
    this.sendToGame = config.autoStats.sendToGame;
  }

  isRunning() {
    return this.intervalHandle !== null;
  }

  getStatus() {
    return {
      running: this.isRunning(),
      intervalMinutes: this.intervalMinutes,
      sendToDiscord: this.sendToDiscord,
      sendToGame: this.sendToGame,
    };
  }

  start() {
    if (this.intervalHandle) {
      logger.warn('[AutoStats] start() called but already running. Ignoring.');
      return false;
    }

    const ms = Math.max(1, this.intervalMinutes) * 60 * 1000;
    logger.info(`[AutoStats] Starting (every ${this.intervalMinutes} min, discord=${this.sendToDiscord}, game=${this.sendToGame}).`);

    // Fire-and-forget: do not await inside setInterval
    this.intervalHandle = setInterval(() => {
      this._tick().catch((err) => {
        logger.error('[AutoStats] tick failed:', err.message);
      });
    }, ms);

    // Fire one tick immediately so users get instant confirmation that
    // the schedule is alive and that the game-chat path actually works.
    this._tick().catch((err) => {
      logger.error('[AutoStats] initial tick failed:', err.message);
    });

    return true;
  }

  stop() {
    if (!this.intervalHandle) {
      logger.warn('[AutoStats] stop() called but not running.');
      return false;
    }
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    logger.info('[AutoStats] Stopped.');
    return true;
  }

  async _tick() {
    if (!this.rustplusClient.isConnected()) {
      logger.warn('[AutoStats] Skipping tick: Rust+ not connected.');
      return;
    }

    const stats = await statsService.getStats(this.rustplusClient);

    if (this.sendToDiscord && this.discordClient && this.config.discord.channelId) {
      try {
        const channel = await this.discordClient.channels.fetch(this.config.discord.channelId);
        if (channel && channel.isTextBased()) {
          await channel.send({
            content: statsService.formatStatsForDiscord(stats, this.config.bot.name),
            allowedMentions: { parse: [] },
          });
        } else {
          logger.warn('[AutoStats] Discord channel not text-based or not found.');
        }
      } catch (err) {
        logger.error('[AutoStats] Failed to send Discord message:', err.message);
      }
    }

    if (this.sendToGame) {
      try {
        await this.rustplusClient.sendTeamMessage(statsService.formatStatsForGameChat(stats));
        logger.debug('[AutoStats] game chat sent.');
      } catch (err) {
        logger.error('[AutoStats] Failed to send game chat message:', err.message);
      }
    }
  }
}

module.exports = AutoStatsService;
