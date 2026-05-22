'use strict';

const logger = require('../logger');
const statsService = require('../statsService');
const { formatGameTime, truncateMessage } = require('../utils/formatters');
const gameTime = require('../utils/gameTime');
const { coordsToGrid, MARKER_TYPE } = require('../utils/mapMarkers');

/**
 * Listens to in-game team chat broadcasts and runs commands when the
 * message starts with the configured prefix (default `!`).
 *
 * Replies are short — they go back into team chat, which has a tight
 * length limit. Each handler returns a single string (or null to skip).
 *
 * Crucially: the bot must NOT respond to messages it sent itself,
 * otherwise it loops. We filter on `steamId === playerId` of the bot,
 * but also on a heuristic: messages whose name matches the bot's
 * registered Rust+ identity.
 */
class TeamChatService {
  constructor({ rustplusClient, config, deviceService, turretService, vendingService, deathTracker, eventTracker }) {
    this.rustplusClient = rustplusClient;
    this.config = config;
    this.deviceService = deviceService;
    this.turretService = turretService;
    this.vendingService = vendingService;
    this.deathTracker = deathTracker;
    this.eventTracker = eventTracker;
    this.botSteamId = String(config.rust.playerId);

    this.rustplusClient.onMessage((msg) => {
      this._handle(msg).catch((err) => logger.error('[TeamChat] handler error:', err.message));
    });
  }

  async _handle(msg) {
    const tm = msg && msg.broadcast && msg.broadcast.teamMessage && msg.broadcast.teamMessage.message;
    if (!tm) return;

    // Don't loop on our own messages.
    if (String(tm.steamId) === this.botSteamId) return;
    if (!tm.message || typeof tm.message !== 'string') return;

    const prefix = this.config.discord.prefix;
    if (!tm.message.startsWith(prefix)) return;

    const rest = tm.message.slice(prefix.length).trim();
    if (!rest) return;
    const tokens = rest.split(/\s+/);
    const cmd = tokens.shift().toLowerCase();
    const args = tokens;

    let reply = null;
    try {
      reply = await this._dispatch(cmd, args, tm);
    } catch (err) {
      reply = `[!${cmd}] error: ${err.message}`;
    }
    if (reply) {
      try {
        await this.rustplusClient.sendTeamMessage(truncateMessage(reply, 128));
      } catch (err) {
        logger.warn('[TeamChat] reply send failed:', err.message);
      }
    }
  }

  async _dispatch(cmd, args, tm) {
    switch (cmd) {
      case 'help':
      case 'commands':
        return '[說明] !pop !time !day !night !events !deaths !devices !on <名> !off <名> !status <名> !vend <關鍵字> !stats';
      case 'pop':
        return this._pop();
      case 'time':
        return this._time();
      case 'day':
        return this._dayNight('day');
      case 'night':
        return this._dayNight('night');
      case 'events':
        return this._events();
      case 'stats':
        return this._stats();
      case 'deaths':
        return this._deaths();
      case 'devices':
        return this._devices();
      case 'on':
        return this._switch(args, true);
      case 'off':
        return this._switch(args, false);
      case 'status':
        return this._deviceStatus(args);
      case 'vend':
        return this._vend(args);
      case 'turret':
        return this._turret(args);
      default:
        return null; // unknown -> silent (don't spam team chat)
    }
  }

  async _pop() {
    const info = await this.rustplusClient.getInfo();
    const queued = info.queuedPlayers ? ` (+${info.queuedPlayers} 排隊)` : '';
    return `[人數] ${info.players}/${info.maxPlayers}${queued}`;
  }

  async _time() {
    const t = await this.rustplusClient.getTime();
    return `[時間] ${formatGameTime(t)}`;
  }

  async _dayNight(target) {
    const raw = await this.rustplusClient.getTimeRaw();
    const targetHour = target === 'day' ? raw.sunrise : raw.sunset;
    const hours = gameTime.inGameHoursUntil(raw.time, targetHour);
    const realMin = gameTime.inGameHoursToRealMinutes(hours, raw.dayLengthMinutes);
    return `[${target === 'day' ? '天亮' : '天黑'}] 還有 ${gameTime.formatRealDuration(realMin)}`;
  }

  async _events() {
    const markers = await this.rustplusClient.getMapMarkers();
    let info = null;
    try { info = await this.rustplusClient.getInfo(); } catch (_) { /* ignore */ }
    const mapSize = info ? info.mapSize : null;

    const counts = { heli: 0, cargo: 0, ch47: 0, crate: 0, boom: 0 };
    const where = { heli: null, cargo: null, ch47: null, crate: null };

    for (const m of markers) {
      switch (m.type) {
        case MARKER_TYPE.PatrolHelicopter:
          counts.heli += 1;
          where.heli = where.heli || coordsToGrid(m.x, m.y, mapSize);
          break;
        case MARKER_TYPE.CargoShip:
          counts.cargo += 1;
          where.cargo = where.cargo || coordsToGrid(m.x, m.y, mapSize);
          break;
        case MARKER_TYPE.CH47:
          counts.ch47 += 1;
          where.ch47 = where.ch47 || coordsToGrid(m.x, m.y, mapSize);
          break;
        case MARKER_TYPE.Crate:
          counts.crate += 1;
          where.crate = where.crate || coordsToGrid(m.x, m.y, mapSize);
          break;
        case MARKER_TYPE.Explosion:
          counts.boom += 1;
          break;
        default:
          break;
      }
    }
    const total = counts.heli + counts.cargo + counts.ch47 + counts.crate + counts.boom;
    if (total === 0) return '[事件] 無';
    const parts = [];
    if (counts.heli)  parts.push(`直升機${counts.heli}${where.heli ? `(${where.heli})` : ''}`);
    if (counts.cargo) parts.push(`貨輪${counts.cargo}${where.cargo ? `(${where.cargo})` : ''}`);
    if (counts.ch47)  parts.push(`CH47×${counts.ch47}${where.ch47 ? `(${where.ch47})` : ''}`);
    if (counts.crate) parts.push(`板條箱${counts.crate}${where.crate ? `(${where.crate})` : ''}`);
    if (counts.boom)  parts.push(`爆炸${counts.boom}`);
    return `[事件] ${parts.join(' | ')}`;
  }

  async _stats() {
    const stats = await statsService.getStats(this.rustplusClient);
    return statsService.formatStatsForGameChat(stats);
  }

  _deaths() {
    const recent = this.deathTracker.history(3);
    if (recent.length === 0) return '[死亡] 無紀錄';
    return '[死亡] ' + recent.map((d) => d.name).join(', ');
  }

  _devices() {
    const list = this.deviceService.list();
    if (list.length === 0) return '[設備] 尚未配對';
    return '[設備] ' + list.map((d) => `${d.name}(${d.type})`).join(', ');
  }

  async _switch(args, value) {
    const name = args.join(' ');
    if (!name) return `[!${value ? 'on' : 'off'}] 用法: !${value ? 'on' : 'off'} <名字>`;
    await this.deviceService.setSwitch(name, value);
    return `[${value ? '開啟' : '關閉'}] ${name}`;
  }

  async _deviceStatus(args) {
    const name = args.join(' ');
    if (!name) return '[狀態] 用法: !status <名字>';
    const { device, info } = await this.deviceService.getStatus(name);
    if (device.type === 'switch' || device.type === 'alarm') {
      const v = info && info.payload && info.payload.value;
      return `[狀態] ${name} = ${v ? '開' : '關'}`;
    }
    if (device.type === 'storage') {
      const cap = info && info.payload && info.payload.capacity;
      const expiry = info && info.payload && info.payload.protectionExpiry;
      const left = expiry ? Math.max(0, expiry - Math.floor(Date.now() / 1000)) : null;
      return `[狀態] ${name} 容量=${cap || '?'} 維護=${left !== null ? Math.floor(left / 60) + '分' : '無'}`;
    }
    return `[狀態] ${name}: ${JSON.stringify(info && info.payload).slice(0, 80)}`;
  }

  async _vend(args) {
    const q = args.join(' ');
    if (!q) return '[販賣機] 用法: !vend <物品>';
    let info = null;
    try { info = await this.rustplusClient.getInfo(); } catch (_) { /* ignore */ }
    if (info) this.vendingService.setMapSize(info.mapSize);
    const results = await this.vendingService.search(q);
    if (results.length === 0) return `[販賣機] 找不到「${q}」`;
    const top = results.slice(0, 3)
      .map((r) => `${r.sellItem}×${r.sellQty}@${r.grid || '?'} 售價${r.costItem}×${r.costQty}`);
    return `[販賣機] ${top.join(' | ')}`;
  }

  _turret(args) {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'list') {
      const ts = this.turretService.list();
      if (ts.length === 0) return '[砲塔] 無';
      return '[砲塔] ' + ts.map((t) => `${t.name}(${Math.round(t.x)},${Math.round(t.y)})`).join(', ');
    }
    if (sub === 'check') {
      const x = Number(args[1]);
      const y = Number(args[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return '[砲塔] 用法: !turret check <x> <y>';
      }
      const r = this.turretService.check(x, y);
      return `[砲塔] ${r.radius}m 內: ${r.count} 座, 命中率 ~${Math.round(r.accuracyMultiplier * 100)}%`;
    }
    return '[砲塔] 用法: !turret list|check x y';
  }
}

module.exports = TeamChatService;
