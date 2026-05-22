'use strict';

const logger = require('./logger');
const statsService = require('./statsService');
const {
  formatGameTime,
  formatTeamMember,
  truncateMessage,
} = require('./utils/formatters');

const MAX_GAME_CHAT_LENGTH = 128;

/**
 * Build the help text dynamically so it stays in sync.
 */
function buildHelp(prefix) {
  return [
    '**📖 指令列表**',
    '__基本__',
    `\`${prefix}help\` · \`${prefix}ping\` · \`${prefix}status\` · \`${prefix}connect\` · \`${prefix}disconnect\` · \`${prefix}reconnect\``,
    '__伺服器 / 時間__',
    `\`${prefix}info\` · \`${prefix}pop\` · \`${prefix}time\` · \`${prefix}day\` · \`${prefix}night\``,
    '__隊伍__',
    `\`${prefix}team\` · \`${prefix}stats [dc|game]\` · \`${prefix}say <訊息>\` · \`${prefix}promote <名字>\` · \`${prefix}deaths\``,
    '__自動統計__',
    `\`${prefix}autostats on|off|status\``,
    '__事件 / 地圖__',
    `\`${prefix}events\` · \`${prefix}eventtracker on|off|status\` · \`${prefix}vend <關鍵字>\``,
    '__智能設備__',
    `\`${prefix}devices\` · \`${prefix}pair <id> <名字> [類型]\` · \`${prefix}unpair <名字>\` · \`${prefix}on <名字>\` · \`${prefix}off <名字>\` · \`${prefix}device <名字>\` · \`${prefix}upkeep <名字>\``,
    '__砲塔干擾__',
    `\`${prefix}turret add <名字> <x> <y>\` · \`${prefix}turret list\` · \`${prefix}turret remove <名字>\` · \`${prefix}turret check <x> <y>\` · \`${prefix}turret clear\``,
  ].join('\n');
}

/**
 * Restrict commands to the configured channel (and ignore bots).
 * Returns true if the message should be processed.
 */
function shouldHandle(message, config) {
  if (message.author.bot) return false;
  if (message.channelId !== config.discord.channelId) return false;
  if (!message.content || !message.content.startsWith(config.discord.prefix)) return false;
  return true;
}

/**
 * Parse a message into { command, args }.
 */
function parse(message, prefix) {
  const raw = message.content.slice(prefix.length).trim();
  const tokens = raw.length === 0 ? [] : raw.split(/\s+/);
  const command = (tokens.shift() || '').toLowerCase();
  return { command, args: tokens, raw };
}

/**
 * Main entry point. Pass deps via context so handlers stay testable.
 */
async function handleMessage(message, ctx) {
  const { config } = ctx;
  if (!shouldHandle(message, config)) return;

  const { command, args } = parse(message, config.discord.prefix);
  if (!command) return;

  try {
    switch (command) {
      case 'help':
        return await onHelp(message, ctx);
      case 'ping':
        return await onPing(message);
      case 'status':
        return await onStatus(message, ctx);
      case 'time':
        return await onTime(message, ctx);
      case 'team':
        return await onTeam(message, ctx);
      case 'stats':
        return await onStats(message, ctx, args);
      case 'say':
        return await onSay(message, ctx, args);
      case 'autostats':
        return await onAutoStats(message, ctx, args);
      case 'connect':
        return await onConnect(message, ctx);
      case 'disconnect':
        return await onDisconnect(message, ctx);
      case 'reconnect':
        return await onReconnect(message, ctx);
      // ---- new ----
      case 'info':
        return await onInfo(message, ctx);
      case 'pop':
        return await onPop(message, ctx);
      case 'day':
        return await onDayNight(message, ctx, 'day');
      case 'night':
        return await onDayNight(message, ctx, 'night');
      case 'events':
        return await onEvents(message, ctx);
      case 'eventtracker':
        return await onEventTracker(message, ctx, args);
      case 'vend':
        return await onVend(message, ctx, args);
      case 'devices':
        return await onDevices(message, ctx);
      case 'pair':
        return await onPair(message, ctx, args);
      case 'unpair':
        return await onUnpair(message, ctx, args);
      case 'on':
        return await onSwitch(message, ctx, args, true);
      case 'off':
        return await onSwitch(message, ctx, args, false);
      case 'device':
        return await onDeviceStatus(message, ctx, args);
      case 'upkeep':
        return await onUpkeep(message, ctx, args);
      case 'promote':
        return await onPromote(message, ctx, args);
      case 'deaths':
        return await onDeaths(message, ctx);
      case 'turret':
        return await onTurret(message, ctx, args);
      default:
        return await message.reply(`未知指令。請使用 \`${config.discord.prefix}help\` 查看說明。`);
    }
  } catch (err) {
    logger.error(`Command "${command}" failed:`, err.message);
    try {
      await message.reply(`❌ 錯誤: ${err.message}`);
    } catch (_) {
      /* swallow secondary error */
    }
  }
}

// ===================== handlers =====================

async function onHelp(message, ctx) {
  await message.reply(buildHelp(ctx.config.discord.prefix));
}

async function onPing(message) {
  await message.reply('🏓 pong');
}

async function onStatus(message, ctx) {
  const connected = ctx.rustplusClient.isConnected();
  await message.reply(`Rust+: ${connected ? '🟢 已連線' : '🔴 未連線'}`);
}

async function onTime(message, ctx) {
  if (!ctx.rustplusClient.isConnected()) {
    await message.reply('⚠️ Rust+ 未連線。');
    return;
  }
  const time = await ctx.rustplusClient.getTime();
  await message.reply(`🕒 遊戲內時間: \`${formatGameTime(time)}\``);
}

async function onTeam(message, ctx) {
  if (!ctx.rustplusClient.isConnected()) {
    await message.reply('⚠️ Rust+ 未連線。');
    return;
  }
  const teamInfo = await ctx.rustplusClient.getTeamInfo();
  const members = (teamInfo && teamInfo.members) || [];
  if (members.length === 0) {
    await message.reply('找不到隊員。');
    return;
  }
  const lines = ['👥 **隊員列表**', ...members.map(formatTeamMember)];
  await message.reply(lines.join('\n'));
}

async function onStats(message, ctx, args) {
  const target = (args[0] || '').toLowerCase(); // '', 'dc', 'game'
  const sendDiscord = target !== 'game';
  const sendGame = target !== 'dc';

  // Game-only mode requires a live Rust+ connection; otherwise nothing happens.
  if (!sendDiscord && !ctx.rustplusClient.isConnected()) {
    await message.reply('⚠️ Rust+ 未連線，無法傳送到遊戲團隊聊天。');
    return;
  }

  let stats;
  try {
    stats = await statsService.getStats(ctx.rustplusClient);
  } catch (err) {
    await message.reply(`❌ 取得統計失敗: ${err.message}`);
    return;
  }

  let gameOk = true;
  let gameErr = null;
  if (sendGame) {
    if (!ctx.rustplusClient.isConnected()) {
      gameOk = false;
      gameErr = 'Rust+ 未連線';
    } else {
      try {
        await ctx.rustplusClient.sendTeamMessage(statsService.formatStatsForGameChat(stats));
      } catch (err) {
        gameOk = false;
        gameErr = err.message;
        logger.warn('[stats] game chat send failed:', err.message);
      }
    }
  }

  if (sendDiscord) {
    let body = statsService.formatStatsForDiscord(stats, ctx.config.bot.name);
    if (sendGame) {
      body += gameOk
        ? '\n\n📨 已同步傳送到遊戲團隊聊天。'
        : `\n\n⚠️ 遊戲聊天傳送失敗: ${gameErr}`;
    }
    await message.reply({ content: body, allowedMentions: { parse: [] } });
  } else {
    // game-only mode
    await message.reply(gameOk
      ? '✅ 統計已傳送到遊戲團隊聊天。'
      : `❌ 傳送到遊戲團隊聊天失敗: ${gameErr}`);
  }
}

async function onSay(message, ctx, args) {
  const text = args.join(' ');
  const safe = truncateMessage(text, MAX_GAME_CHAT_LENGTH);
  if (!safe) {
    await message.reply(`⚠️ 用法: \`${ctx.config.discord.prefix}say <訊息>\``);
    return;
  }
  if (!ctx.rustplusClient.isConnected()) {
    await message.reply('⚠️ Rust+ 未連線。');
    return;
  }
  await ctx.rustplusClient.sendTeamMessage(safe);

  // Escape backticks so user input can't break the inline-code span,
  // and disable mention parsing so `!say @everyone` doesn't actually ping.
  const echo = safe.replace(/`/g, "ʼ");
  await message.reply({
    content: `📨 已傳送到團隊聊天: \`${echo}\``,
    allowedMentions: { parse: [] },
  });
}

async function onAutoStats(message, ctx, args) {
  const sub = (args[0] || '').toLowerCase();
  const { autoStatsService } = ctx;

  if (sub === 'on') {
    const started = autoStatsService.start();
    await message.reply(started ? '✅ 自動統計已啟用。' : 'ℹ️ 自動統計已在執行中。');
    return;
  }
  if (sub === 'off') {
    const stopped = autoStatsService.stop();
    await message.reply(stopped ? '🛑 自動統計已停用。' : 'ℹ️ 自動統計目前未執行。');
    return;
  }
  if (sub === 'status') {
    const s = autoStatsService.getStatus();
    await message.reply([
      '⚙️ **自動統計狀態**',
      `執行中: ${s.running ? '是' : '否'}`,
      `間隔: ${s.intervalMinutes} 分鐘`,
      `傳送到 Discord: ${s.sendToDiscord ? '是' : '否'}`,
      `傳送到遊戲: ${s.sendToGame ? '是' : '否'}`,
    ].join('\n'));
    return;
  }
  await message.reply(`用法: \`${ctx.config.discord.prefix}autostats on|off|status\``);
}

async function onConnect(message, ctx) {
  if (ctx.rustplusClient.isConnected()) {
    await message.reply('ℹ️ 已經連線。');
    return;
  }
  ctx.rustplusClient.connect();
  await message.reply('🔌 連線中...');
}

async function onDisconnect(message, ctx) {
  ctx.rustplusClient.disconnect();
  await message.reply('🛑 已斷線。');
}

async function onReconnect(message, ctx) {
  ctx.rustplusClient.reconnect();
  await message.reply('🔄 重新連線中...');
}

// ============= NEW HANDLERS =============

const gameTime = require('./utils/gameTime');
const { coordsToGrid, MARKER_TYPE } = require('./utils/mapMarkers');

function reqConnected(ctx) {
  if (!ctx.rustplusClient.isConnected()) {
    const e = new Error('Rust+ 未連線。');
    e.userFacing = true;
    throw e;
  }
}

async function onInfo(message, ctx) {
  reqConnected(ctx);
  const info = await ctx.rustplusClient.getInfo();
  const wipe = info.wipeTime ? new Date(info.wipeTime * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '?';
  await message.reply([
    '🗺️ **伺服器資訊**',
    `名稱: \`${info.name || '?'}\``,
    `地圖: \`${info.map || '?'}\` (大小 ${info.mapSize || '?'})`,
    `玩家: \`${info.players}/${info.maxPlayers}\`${info.queuedPlayers ? ` (+${info.queuedPlayers} 排隊中)` : ''}`,
    `Seed: \`${info.seed || '?'}\``,
    `重置時間: \`${wipe}\``,
  ].join('\n'));
}

async function onPop(message, ctx) {
  reqConnected(ctx);
  const info = await ctx.rustplusClient.getInfo();
  const queued = info.queuedPlayers ? ` (+${info.queuedPlayers} 排隊中)` : '';
  await message.reply(`👥 人數: \`${info.players}/${info.maxPlayers}\`${queued}`);
}

async function onDayNight(message, ctx, target) {
  reqConnected(ctx);
  const raw = await ctx.rustplusClient.getTimeRaw();
  const targetHour = target === 'day' ? raw.sunrise : raw.sunset;
  const hours = gameTime.inGameHoursUntil(raw.time, targetHour);
  const realMin = gameTime.inGameHoursToRealMinutes(hours, raw.dayLengthMinutes);
  const label = target === 'day' ? '🌅 距離天亮' : '🌙 距離天黑';
  await message.reply(`${label} 還有 \`${gameTime.formatRealDuration(realMin)}\` (目前 ${formatGameTime(raw.time)})。`);
}

async function onEvents(message, ctx) {
  reqConnected(ctx);
  const markers = await ctx.rustplusClient.getMapMarkers();
  let mapSize = null;
  try { mapSize = (await ctx.rustplusClient.getInfo()).mapSize; } catch (_) { /* ignore */ }

  const groups = {
    [MARKER_TYPE.PatrolHelicopter]: [],
    [MARKER_TYPE.CargoShip]: [],
    [MARKER_TYPE.CH47]: [],
    [MARKER_TYPE.Crate]: [],
    [MARKER_TYPE.Explosion]: [],
  };
  for (const m of markers) {
    if (groups[m.type]) groups[m.type].push(m);
  }

  const fmt = (label, arr) => arr.length === 0
    ? `${label}: —`
    : `${label}: ${arr.map((m) => coordsToGrid(m.x, m.y, mapSize) || '?').join(', ')}`;

  await message.reply([
    '🚨 **進行中的事件**',
    fmt('巡邏直升機', groups[MARKER_TYPE.PatrolHelicopter]),
    fmt('貨輪', groups[MARKER_TYPE.CargoShip]),
    fmt('支奴干 (CH47)', groups[MARKER_TYPE.CH47]),
    fmt('上鎖板條箱', groups[MARKER_TYPE.Crate]),
    fmt('爆炸', groups[MARKER_TYPE.Explosion]),
  ].join('\n'));
}

async function onEventTracker(message, ctx, args) {
  const sub = (args[0] || '').toLowerCase();
  const svc = ctx.eventTracker;
  if (!svc) { await message.reply('⚠️ 事件追蹤器未設定。'); return; }
  if (sub === 'on') {
    const ok = svc.start();
    await message.reply(ok ? '✅ 事件追蹤器已啟動。' : 'ℹ️ 已在執行中。');
    return;
  }
  if (sub === 'off') {
    const ok = svc.stop();
    await message.reply(ok ? '🛑 事件追蹤器已停止。' : 'ℹ️ 目前未執行。');
    return;
  }
  if (sub === 'status') {
    await message.reply(`事件追蹤器: ${svc.isRunning() ? '🟢 執行中' : '⚪ 已停止'}`);
    return;
  }
  await message.reply(`用法: \`${ctx.config.discord.prefix}eventtracker on|off|status\``);
}

async function onVend(message, ctx, args) {
  const q = args.join(' ');
  if (!q) { await message.reply(`用法: \`${ctx.config.discord.prefix}vend <物品名稱>\``); return; }
  reqConnected(ctx);
  let mapSize = null;
  try { mapSize = (await ctx.rustplusClient.getInfo()).mapSize; } catch (_) { /* ignore */ }
  ctx.vendingService.setMapSize(mapSize);

  const results = await ctx.vendingService.search(q);
  if (results.length === 0) {
    await message.reply(`🔎 找不到符合 \`${q}\` 的販賣機。`);
    return;
  }
  const top = results.slice(0, 10).map((r) => {
    const where = r.grid ? `\`${r.grid}\`` : '?';
    return `• ${where} — **${r.sellItem}** ×${r.sellQty},售價 **${r.costItem}** ×${r.costQty} (庫存 ${r.stock})`;
  });
  await message.reply([`🛒 **販賣機搜尋: \`${q}\`** (前 ${top.length} / 共 ${results.length} 筆)`, ...top].join('\n'));
}

async function onDevices(message, ctx) {
  const list = ctx.deviceService.list();
  if (list.length === 0) {
    await message.reply(`尚未配對任何設備。請使用 \`${ctx.config.discord.prefix}pair <entityId> <名字> [switch|alarm|storage]\`。`);
    return;
  }
  const lines = list.map((d) => `• \`${d.name}\` — ${d.type} (id ${d.entityId})`);
  await message.reply([`🔌 **已配對設備** (共 ${list.length} 個)`, ...lines].join('\n'));
}

async function onPair(message, ctx, args) {
  const [id, ...rest] = args;
  if (!id || rest.length === 0) {
    await message.reply(`用法: \`${ctx.config.discord.prefix}pair <entityId> <名字> [switch|alarm|storage]\``);
    return;
  }
  let type = 'switch';
  let nameTokens = rest;
  const last = rest[rest.length - 1].toLowerCase();
  if (['switch', 'alarm', 'storage'].includes(last)) {
    type = last;
    nameTokens = rest.slice(0, -1);
  }
  const name = nameTokens.join(' ').trim();
  if (!name) {
    await message.reply('⚠️ 請提供名字。');
    return;
  }
  const dev = ctx.deviceService.add({ entityId: id, name, type });
  await message.reply(`✅ 已配對 ${dev.type} \`${dev.name}\` (id ${dev.entityId})。`);
}

async function onUnpair(message, ctx, args) {
  const name = args.join(' ').trim();
  if (!name) { await message.reply('用法: `!unpair <名字>`'); return; }
  const ok = ctx.deviceService.remove(name);
  await message.reply(ok ? `🗑️ 已取消配對 \`${name}\`。` : `⚠️ 找不到名為 \`${name}\` 的設備。`);
}

async function onSwitch(message, ctx, args, value) {
  const name = args.join(' ').trim();
  if (!name) { await message.reply(`用法: \`${ctx.config.discord.prefix}${value ? 'on' : 'off'} <名字>\``); return; }
  reqConnected(ctx);
  await ctx.deviceService.setSwitch(name, value);
  await message.reply(`${value ? '🟢' : '⚪'} \`${name}\` 已設為 **${value ? '開啟' : '關閉'}**。`);
}

async function onDeviceStatus(message, ctx, args) {
  const name = args.join(' ').trim();
  if (!name) { await message.reply('用法: `!device <名字>`'); return; }
  reqConnected(ctx);
  const { device, info } = await ctx.deviceService.getStatus(name);
  const payload = (info && info.payload) || {};

  if (device.type === 'switch' || device.type === 'alarm') {
    await message.reply(`${device.type === 'switch' ? '🔌' : '🚨'} \`${device.name}\` (${device.type}) → **${payload.value ? '開啟' : '關閉'}**`);
    return;
  }
  if (device.type === 'storage') {
    const expiry = payload.protectionExpiry;
    const now = Math.floor(Date.now() / 1000);
    const left = expiry && expiry > now ? expiry - now : 0;
    const hrs = Math.floor(left / 3600);
    const mins = Math.floor((left % 3600) / 60);
    const items = (payload.items) || [];
    const itemLines = items.slice(0, 10).map((it) => `  - 物品 ${it.itemId} × ${it.quantity}${it.itemIsBlueprint ? ' [藍圖]' : ''}`);
    await message.reply([
      `📦 \`${device.name}\` (儲存監視器)`,
      `容量: ${payload.capacity || '?'} 格`,
      `工具櫃剩餘維護: ${hrs}小時 ${mins}分鐘`,
      itemLines.length ? `物品 (共 ${items.length} 種):\n${itemLines.join('\n')}` : '物品: (無)',
    ].join('\n'));
    return;
  }
  await message.reply(`\`${device.name}\` 原始資料: \`${JSON.stringify(payload).slice(0, 200)}\``);
}

async function onUpkeep(message, ctx, args) {
  // Sugar over !device <name> for storage type.
  return onDeviceStatus(message, ctx, args);
}

async function onPromote(message, ctx, args) {
  const name = args.join(' ').trim();
  if (!name) { await message.reply('用法: `!promote <隊員名字或 steamId>`'); return; }
  reqConnected(ctx);

  let steamId = null;
  if (/^\d{15,20}$/.test(name)) {
    steamId = name;
  } else {
    const team = await ctx.rustplusClient.getTeamInfo();
    const target = (team.members || []).find((m) => (m.name || '').toLowerCase() === name.toLowerCase());
    if (!target) { await message.reply(`⚠️ 找不到名為 \`${name}\` 的隊員。`); return; }
    steamId = target.steamId;
  }
  await ctx.rustplusClient.promoteToLeader(steamId);
  await message.reply(`👑 已將 \`${name}\` 升為隊長。`);
}

async function onDeaths(message, ctx) {
  const recent = ctx.deathTracker.history(5);
  if (recent.length === 0) {
    await message.reply('💀 啟動後尚未紀錄任何隊員死亡。');
    return;
  }
  let mapSize = null;
  try { mapSize = (await ctx.rustplusClient.getInfo()).mapSize; } catch (_) { /* ignore */ }
  const lines = recent.map((d) => {
    const grid = coordsToGrid(d.x, d.y, mapSize);
    const when = new Date(d.capturedAt).toISOString().replace('T', ' ').slice(0, 19);
    return `• \`${d.name}\` — ${grid || '?'} 於 ${when} UTC`;
  });
  await message.reply([`💀 **最近隊員死亡** (共 ${recent.length} 筆)`, ...lines].join('\n'));
}

async function onTurret(message, ctx, args) {
  const sub = (args[0] || '').toLowerCase();
  const svc = ctx.turretService;
  const prefix = ctx.config.discord.prefix;

  if (sub === 'add') {
    const name = args[1];
    const x = Number(args[2]);
    const y = Number(args[3]);
    if (!name || !Number.isFinite(x) || !Number.isFinite(y)) {
      await message.reply(`用法: \`${prefix}turret add <名字> <x> <y>\``);
      return;
    }
    const t = svc.add({ name, x, y });
    await message.reply(`✅ 砲塔 \`${t.name}\` 已新增於 (${Math.round(t.x)}, ${Math.round(t.y)})。`);
    return;
  }
  if (sub === 'remove' || sub === 'rm') {
    const name = args.slice(1).join(' ').trim();
    if (!name) { await message.reply(`用法: \`${prefix}turret remove <名字>\``); return; }
    const ok = svc.remove(name);
    await message.reply(ok ? `🗑️ 已移除 \`${name}\`。` : `⚠️ 找不到名為 \`${name}\` 的砲塔。`);
    return;
  }
  if (sub === 'list') {
    const list = svc.list();
    if (list.length === 0) { await message.reply('尚無追蹤中的砲塔。'); return; }
    await message.reply(['🔫 **追蹤中的砲塔**', ...list.map((t) => `• \`${t.name}\` — (${Math.round(t.x)}, ${Math.round(t.y)})`)].join('\n'));
    return;
  }
  if (sub === 'check') {
    const x = Number(args[1]);
    const y = Number(args[2]);
    const r = Number(args[3]) || undefined;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      await message.reply(`用法: \`${prefix}turret check <x> <y> [半徑]\``);
      return;
    }
    const result = svc.check(x, y, r);
    const lines = result.nearby.map((t) => `  - \`${t.name}\` (距離 ${Math.round(t.distance)}m)`);
    await message.reply([
      `🎯 (${Math.round(x)}, ${Math.round(y)}) 周圍 ${result.radius}m 內:`,
      `砲塔數: **${result.count}** → 命中率 ~**${Math.round(result.accuracyMultiplier * 100)}%**`,
      ...lines,
    ].join('\n'));
    return;
  }
  if (sub === 'clear') {
    svc.clear();
    await message.reply('🧹 已清除所有砲塔。');
    return;
  }
  await message.reply(`用法: \`${prefix}turret add|remove|list|check|clear ...\``);
}

module.exports = {
  handleMessage,
  buildHelp,
};
