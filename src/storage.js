'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Tiny JSON file storage. Loads once, writes are debounced so rapid
 * updates (e.g. event polls) don't hammer the disk.
 *
 * Used by deviceService, turretService, deathTracker, and eventTracker.
 */
class JsonStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = defaults;
    this.data = { ...defaults };
    this.writeTimer = null;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = { ...this.defaults, ...parsed };
        logger.debug(`[Storage] Loaded ${this.filePath}`);
      } else {
        // Ensure parent dir exists; touch the file with defaults.
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.defaults, null, 2));
        logger.info(`[Storage] Initialized ${this.filePath}`);
      }
    } catch (err) {
      logger.error(`[Storage] Failed to load ${this.filePath}:`, err.message);
      this.data = { ...this.defaults };
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this._scheduleWrite();
  }

  update(fn) {
    fn(this.data);
    this._scheduleWrite();
  }

  all() {
    return this.data;
  }

  _scheduleWrite() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
        fs.renameSync(tmp, this.filePath);
      } catch (err) {
        logger.error(`[Storage] Failed to write ${this.filePath}:`, err.message);
      }
    }, 250);
  }

  /**
   * Force a synchronous flush — used at shutdown.
   */
  flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      logger.error(`[Storage] flush failed for ${this.filePath}:`, err.message);
    }
  }
}

module.exports = JsonStore;
