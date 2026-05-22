'use strict';

const logger = require('../logger');

/**
 * Manages "paired" smart devices by friendly name.
 *
 * NOTE on pairing: the official Rust+ pairing flow uses Firebase Cloud
 * Messaging (FCM) — the mobile app receives a push notification when you
 * tap "Pair" in-game. Implementing the full FCM listener inside this bot
 * would require persistent Google credentials + an FCM stack. Instead we
 * support **manual pairing**: you obtain the entityId once (via a separate
 * `rustplus.js fcm-listen` run, or by reading it off the device in-game)
 * and register it here with `add(entityId, name, type)`.
 *
 * Supported device types:
 *   "switch"  - Smart Switch (on/off)
 *   "alarm"   - Smart Alarm (notify-only; getEntityInfo gives state)
 *   "storage" - Storage Monitor (TC / fridge / box; gives items + protectionExpiry)
 */
class DeviceService {
  constructor({ store, rustplusClient }) {
    this.store = store;
    this.rustplusClient = rustplusClient;
    if (!Array.isArray(this.store.get('devices'))) {
      this.store.set('devices', []);
    }
  }

  list() {
    return [...(this.store.get('devices') || [])];
  }

  findByName(name) {
    if (!name) return null;
    const target = name.toLowerCase();
    return this.list().find((d) => d.name.toLowerCase() === target) || null;
  }

  add({ entityId, name, type }) {
    if (!entityId || !name) throw new Error('entityId and name are required');
    const id = String(entityId);
    if (!/^\d+$/.test(id)) throw new Error('entityId must be numeric');
    const t = (type || 'switch').toLowerCase();
    if (!['switch', 'alarm', 'storage'].includes(t)) {
      throw new Error('type must be switch | alarm | storage');
    }
    const devices = this.list();
    if (devices.some((d) => d.entityId === id)) {
      throw new Error(`Device with entityId ${id} already paired`);
    }
    if (devices.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Device name "${name}" already in use`);
    }
    devices.push({ entityId: id, name, type: t, addedAt: new Date().toISOString() });
    this.store.set('devices', devices);
    logger.info(`[Devices] Added ${t} "${name}" (${id})`);
    return devices[devices.length - 1];
  }

  remove(name) {
    const devices = this.list();
    const idx = devices.findIndex((d) => d.name.toLowerCase() === name.toLowerCase());
    if (idx === -1) return false;
    const [removed] = devices.splice(idx, 1);
    this.store.set('devices', devices);
    logger.info(`[Devices] Removed "${removed.name}"`);
    return true;
  }

  async setSwitch(name, value) {
    const dev = this.findByName(name);
    if (!dev) throw new Error(`No device named "${name}"`);
    if (dev.type !== 'switch') throw new Error(`"${name}" is not a smart switch`);
    await this.rustplusClient.setEntityValue(dev.entityId, value);
    return dev;
  }

  async getStatus(name) {
    const dev = this.findByName(name);
    if (!dev) throw new Error(`No device named "${name}"`);
    const info = await this.rustplusClient.getEntityInfo(dev.entityId);
    return { device: dev, info };
  }
}

module.exports = DeviceService;
