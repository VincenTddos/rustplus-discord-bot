'use strict';

const RustPlus = require('@liamcottle/rustplus.js');
const logger = require('./logger');

/**
 * Wraps the rustplus.js library with:
 *   - Promise-based methods (getTime, getTeamInfo, sendTeamMessage)
 *   - Connection state tracking
 *   - Auto-reconnect with exponential backoff
 *   - Event subscription helpers (onConnected, onDisconnected, onMessage)
 *
 * NOTE: This client only uses the official Rust+ Companion App API
 * (the same API the mobile app uses). It does not read game memory,
 * intercept packets, or bypass any anti-cheat.
 */

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_GAME_CHAT_LENGTH = 128;

class RustPlusClient {
  constructor({ ip, port, playerId, playerToken }) {
    this.ip = ip;
    this.port = port;
    this.playerId = playerId;
    this.playerToken = playerToken;

    this.rustplus = null;
    this.connected = false;

    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    // External callbacks
    this._onConnectedHandlers = [];
    this._onDisconnectedHandlers = [];
    this._onMessageHandlers = [];
  }

  // ---------- public API ----------

  isConnected() {
    return this.connected;
  }

  /**
   * Open a Rust+ connection. Safe to call multiple times; existing
   * sockets are torn down first.
   */
  connect() {
    this.shouldReconnect = true;
    this._teardown();

    logger.info(`[Rust+] Connecting to ${this.ip}:${this.port} ...`);

    this.rustplus = new RustPlus(this.ip, this.port, this.playerId, this.playerToken);

    this.rustplus.on('connecting', () => {
      logger.info('[Rust+] Connecting...');
    });

    this.rustplus.on('connected', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info('[Rust+] Connected.');
      this._onConnectedHandlers.forEach((cb) => this._safeCall(cb));
    });

    this.rustplus.on('disconnected', () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        logger.warn('[Rust+] Disconnected.');
      }
      this._onDisconnectedHandlers.forEach((cb) => this._safeCall(cb));
      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    });

    this.rustplus.on('error', (err) => {
      logger.error('[Rust+] Socket error:', err && err.message ? err.message : err);
    });

    this.rustplus.on('message', (message) => {
      this._onMessageHandlers.forEach((cb) => this._safeCall(cb, message));
    });

    try {
      this.rustplus.connect();
    } catch (err) {
      logger.error('[Rust+] connect() threw:', err.message);
      if (this.shouldReconnect) this._scheduleReconnect();
    }
  }

  /**
   * Manual disconnect. Disables auto-reconnect until connect() is called again.
   */
  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._teardown();
    logger.info('[Rust+] Manually disconnected.');
  }

  /**
   * Manual reconnect: tear down and reconnect immediately.
   */
  reconnect() {
    logger.info('[Rust+] Manual reconnect requested.');
    this.shouldReconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connect();
  }

  /**
   * Returns the current in-game time as a float (e.g. 14.5 = 14:30).
   * Rust+ wraps it as response.time.time — pulling out just the number
   * keeps consumers (formatGameTime, statsService) honest.
   */
  getTime() {
    return this._request('getTime', (cb) => this.rustplus.getTime(cb), (msg) => {
      const t = msg && msg.response && msg.response.time;
      if (t && typeof t.time === 'number') return t.time;
      throw new Error('Invalid getTime response');
    });
  }

  /**
   * Returns the full time payload: { time, sunrise, sunset, dayLengthMinutes }.
   * Used for "time until day/night" calculations.
   */
  getTimeRaw() {
    return this._request('getTimeRaw', (cb) => this.rustplus.getTime(cb), (msg) => {
      const t = msg && msg.response && msg.response.time;
      if (t && typeof t.time === 'number') return t;
      throw new Error('Invalid getTime response');
    });
  }

  /**
   * Returns the team info object (members, leaderSteamId, etc).
   */
  getTeamInfo() {
    return this._request('getTeamInfo', (cb) => this.rustplus.getTeamInfo(cb), (msg) => {
      const ti = msg && msg.response && msg.response.teamInfo;
      if (ti) return ti;
      throw new Error('Invalid getTeamInfo response');
    });
  }

  /**
   * Server info: { name, headerImage, url, map, mapSize, wipeTime, players, maxPlayers, queuedPlayers, seed, salt }
   */
  getInfo() {
    return this._request('getInfo', (cb) => this.rustplus.getInfo(cb), (msg) => {
      const info = msg && msg.response && msg.response.info;
      if (info) return info;
      throw new Error('Invalid getInfo response');
    });
  }

  /**
   * Map data (monuments, jpgImage, oceanMargin, ...). Heavy — call sparingly.
   */
  getMap() {
    return this._request('getMap', (cb) => this.rustplus.getMap(cb), (msg) => {
      const m = msg && msg.response && msg.response.map;
      if (m) return m;
      throw new Error('Invalid getMap response');
    });
  }

  /**
   * All current map markers (events, vending machines, players, etc).
   * Returns an array of { id, type, x, y, ... } markers.
   */
  getMapMarkers() {
    return this._request('getMapMarkers', (cb) => this.rustplus.getMapMarkers(cb), (msg) => {
      const r = msg && msg.response && msg.response.mapMarkers;
      if (r && Array.isArray(r.markers)) return r.markers;
      throw new Error('Invalid getMapMarkers response');
    });
  }

  /**
   * Smart device state. payload depends on device type:
   *   Smart Switch:  { value: bool }
   *   Smart Alarm:   { value: bool }
   *   Storage Monitor: { capacity, hasProtection, protectionExpiry, items: [{itemId, quantity, itemIsBlueprint}] }
   */
  getEntityInfo(entityId) {
    const id = Number(entityId);
    if (!Number.isFinite(id)) {
      return Promise.reject(new Error('getEntityInfo: invalid entityId'));
    }
    return this._request('getEntityInfo', (cb) => this.rustplus.getEntityInfo(id, cb), (msg) => {
      const e = msg && msg.response && msg.response.entityInfo;
      if (e) return e;
      throw new Error('Invalid getEntityInfo response');
    });
  }

  /**
   * Toggle a Smart Switch on/off (or set its value).
   */
  setEntityValue(entityId, value) {
    const id = Number(entityId);
    if (!Number.isFinite(id)) {
      return Promise.reject(new Error('setEntityValue: invalid entityId'));
    }
    return this._request(
      'setEntityValue',
      (cb) => this.rustplus.setEntityValue(id, !!value, cb),
      () => true,
    );
  }

  /**
   * Promote a team member (by steamId) to team leader. Only the current
   * leader can do this — server will reply with an error otherwise.
   */
  promoteToLeader(steamId) {
    const id = String(steamId);
    if (!id) return Promise.reject(new Error('promoteToLeader: invalid steamId'));
    return this._request(
      'promoteToLeader',
      (cb) => this.rustplus.promoteToLeader(id, cb),
      () => true,
    );
  }

  /**
   * Recent in-game team chat history (Rust+ caches a small window).
   * Useful at startup to catch anything sent while the bot was offline.
   */
  getTeamChat() {
    return this._request('getTeamChat', (cb) => this.rustplus.getTeamChat(cb), (msg) => {
      const r = msg && msg.response && msg.response.teamChat;
      if (r && Array.isArray(r.messages)) return r.messages;
      throw new Error('Invalid getTeamChat response');
    });
  }

  /**
   * Send a message to the in-game team chat.
   * The message is rejected if empty, and truncated if over the safe length.
   */
  sendTeamMessage(message) {
    if (typeof message !== 'string' || message.trim().length === 0) {
      return Promise.reject(new Error('sendTeamMessage: empty message'));
    }
    let text = message.trim();
    if (text.length > MAX_GAME_CHAT_LENGTH) {
      text = text.slice(0, MAX_GAME_CHAT_LENGTH - 1) + '…';
    }
    return this._request(
      'sendTeamMessage',
      (cb) => this.rustplus.sendTeamMessage(text, cb),
      () => true,
    );
  }

  // ---------- subscriptions ----------

  onConnected(cb) {
    if (typeof cb === 'function') this._onConnectedHandlers.push(cb);
  }

  onDisconnected(cb) {
    if (typeof cb === 'function') this._onDisconnectedHandlers.push(cb);
  }

  onMessage(cb) {
    if (typeof cb === 'function') this._onMessageHandlers.push(cb);
  }

  // ---------- internal ----------

  _request(name, callerFn, parseFn) {
    return new Promise((resolve, reject) => {
      if (!this.rustplus || !this.connected) {
        return reject(new Error(`Rust+ not connected (cannot run ${name})`));
      }

      let settled = false;
      const finish = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => reject(new Error(`Rust+ ${name} timed out after ${REQUEST_TIMEOUT_MS}ms`)));
      }, REQUEST_TIMEOUT_MS);

      try {
        callerFn((message) => {
          try {
            // Rust+ responses can carry an inline error (e.g. invalid token,
            // not in a team, target not found). If we ignore this we will
            // silently report success when the server actually refused.
            if (message && message.response && message.response.error) {
              const code = (message.response.error.error) || 'unknown';
              throw new Error(`Rust+ ${name} error: ${code}`);
            }
            const value = parseFn(message);
            finish(() => resolve(value));
          } catch (parseErr) {
            finish(() => reject(parseErr));
          }
          return true; // mark as handled in rustplus.js
        });
      } catch (err) {
        finish(() => reject(err));
      }
    });
  }

  _teardown() {
    if (this.rustplus) {
      try {
        this.rustplus.removeAllListeners();
      } catch (_) {
        /* noop */
      }
      try {
        this.rustplus.disconnect();
      } catch (_) {
        /* noop */
      }
    }
    this.rustplus = null;
    this.connected = false;
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;

    // Exponential backoff capped at 60s
    const delay = Math.min(60_000, 2_000 * Math.pow(2, this.reconnectAttempts - 1));
    logger.warn(`[Rust+] Reconnect attempt ${this.reconnectAttempts} scheduled in ${Math.round(delay / 1000)}s`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect) return;
      this.connect();
    }, delay);
  }

  _safeCall(cb, ...args) {
    try {
      cb(...args);
    } catch (err) {
      logger.error('[Rust+] Listener error:', err.message);
    }
  }
}

module.exports = RustPlusClient;
