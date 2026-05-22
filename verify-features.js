'use strict';

/**
 * End-to-end mock test for ALL the new RustPlusBot-style features.
 * Runs entirely offline against a fake Rust+ client + fake Discord client.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DISCORD_TOKEN = 'x';
process.env.DISCORD_CHANNEL_ID = '0';
process.env.RUST_IP = '127.0.0.1';
process.env.RUST_PORT = '28082';
process.env.RUST_PLAYER_ID = '76561198000000001';
process.env.RUST_PLAYER_TOKEN = '0';
process.env.LOG_DEBUG = 'false';

// Use an isolated data dir so we don't pollute the project
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpb-test-'));
process.env.DATA_DIR = tmpDir;

const SRC = path.join(__dirname, 'src');

const JsonStore = require(`${SRC}/storage`);
const DeviceService = require(`${SRC}/services/deviceService`);
const TurretService = require(`${SRC}/services/turretService`);
const VendingService = require(`${SRC}/services/vendingService`);
const DeathTrackerService = require(`${SRC}/services/deathTrackerService`);
const EventTrackerService = require(`${SRC}/services/eventTrackerService`);
const TeamChatService = require(`${SRC}/services/teamChatService`);
const commands = require(`${SRC}/commands`);
const { coordsToGrid } = require(`${SRC}/utils/mapMarkers`);
const gameTime = require(`${SRC}/utils/gameTime`);

// ----------- mocks -----------
function makeRustClient(initial = {}) {
  const sentTeam = [];
  const messageHandlers = [];
  let entityState = initial.entityState || { 100001: { value: false }, 100002: { value: true }, 100003: { capacity: 24, protectionExpiry: Math.floor(Date.now() / 1000) + 3600, items: [{ itemId: -151838493, quantity: 5000, itemIsBlueprint: false }] } };
  let markers = initial.markers || [];

  return {
    _sentTeam: sentTeam,
    _messageHandlers: messageHandlers,
    _setMarkers: (m) => { markers = m; },
    _emitMessage: (msg) => { for (const h of messageHandlers) h(msg); },
    _setEntity: (id, state) => { entityState[id] = state; },

    isConnected: () => true,
    getInfo: async () => ({ name: 'Test Server', map: 'Procedural Map', mapSize: 4500, players: 100, maxPlayers: 200, queuedPlayers: 5, seed: 12345, wipeTime: Math.floor(Date.now() / 1000) - 86400 }),
    getTime: async () => 14.5,
    getTimeRaw: async () => ({ time: 14.5, sunrise: 7.0, sunset: 19.0, dayLengthMinutes: 60 }),
    getTeamInfo: async () => ({
      members: [
        { steamId: '1', name: 'Alice', isOnline: true, isAlive: true, x: 1500, y: 2000 },
        { steamId: '2', name: 'Bob', isOnline: true, isAlive: false, x: 0, y: 0 },
        { steamId: '3', name: 'Carol', isOnline: false, isAlive: true, x: 0, y: 0 },
      ],
    }),
    getMapMarkers: async () => markers,
    getEntityInfo: async (id) => {
      const s = entityState[id];
      if (!s) throw new Error(`no entity ${id}`);
      return { type: typeof s.value === 'boolean' ? 1 : 3, payload: s };
    },
    setEntityValue: async (id, value) => {
      if (!entityState[id]) entityState[id] = {};
      entityState[id].value = value;
    },
    promoteToLeader: async (sid) => { return true; },
    sendTeamMessage: async (msg) => { sentTeam.push(msg); },
    onMessage: (cb) => messageHandlers.push(cb),
    onConnected: () => {},
    onDisconnected: () => {},
  };
}

const sentDiscord = [];
const discordClient = {
  channels: {
    fetch: async () => ({
      isTextBased: () => true,
      send: async (p) => { sentDiscord.push(typeof p === 'string' ? p : p.content); },
    }),
  },
};

const config = {
  discord: { channelId: '0', prefix: '!' },
  bot: { name: 'TestBot' },
  rust: { playerId: '76561198000000001' },
  autoStats: { enabled: false, intervalMinutes: 999, sendToDiscord: true, sendToGame: true },
};

// ----------- helper: fake Discord message -----------
function makeMsg(content) {
  const replies = [];
  return {
    msg: {
      author: { bot: false },
      channelId: '0',
      content,
      reply: async (p) => { replies.push(typeof p === 'string' ? p : p.content); },
    },
    replies,
  };
}

(async () => {
  console.log('=== Test 1: storage round-trip ===');
  const storeFile = path.join(tmpDir, 'state.json');
  const store = new JsonStore(storeFile, { devices: [], turrets: [], deaths: [] });
  store.set('devices', [{ entityId: '1', name: 'a', type: 'switch' }]);
  store.flush();
  const reloaded = new JsonStore(storeFile, { devices: [] });
  assert.deepStrictEqual(reloaded.get('devices'), [{ entityId: '1', name: 'a', type: 'switch' }]);
  console.log('PASS');

  // ---------- 2. Device service ----------
  console.log('\n=== Test 2: device service ===');
  const rust = makeRustClient();
  const store2 = new JsonStore(path.join(tmpDir, 's2.json'), {});
  const deviceService = new DeviceService({ store: store2, rustplusClient: rust });

  deviceService.add({ entityId: '100001', name: 'Front Door', type: 'switch' });
  deviceService.add({ entityId: '100002', name: 'Alarm', type: 'alarm' });
  deviceService.add({ entityId: '100003', name: 'Main TC', type: 'storage' });

  assert.strictEqual(deviceService.list().length, 3);
  assert.strictEqual(deviceService.findByName('Front Door').type, 'switch');
  assert.strictEqual(deviceService.findByName('FRONT DOOR').type, 'switch'); // case-insensitive
  console.log('  PASS list/find');

  await deviceService.setSwitch('Front Door', true);
  const status1 = await deviceService.getStatus('Front Door');
  assert.strictEqual(status1.info.payload.value, true);
  console.log('  PASS setSwitch + getStatus');

  await assert.rejects(() => deviceService.setSwitch('Alarm', true), /not a smart switch/);
  console.log('  PASS reject non-switch');

  assert.throws(() => deviceService.add({ entityId: '100001', name: 'dup', type: 'switch' }), /already paired/);
  assert.throws(() => deviceService.add({ entityId: '999', name: 'Front Door', type: 'switch' }), /name "Front Door" already in use/);
  console.log('  PASS duplicate guards');

  // ---------- 3. Turret service ----------
  console.log('\n=== Test 3: turret interference ===');
  const ts = new TurretService({ store: new JsonStore(path.join(tmpDir, 't.json'), {}) });
  ts.add({ name: 't1', x: 100, y: 100 });
  ts.add({ name: 't2', x: 110, y: 100 });
  ts.add({ name: 't3', x: 200, y: 200 });
  const c = ts.check(105, 100, 30);
  assert.strictEqual(c.count, 2, 't1 and t2 should be within 30 of (105,100)');
  assert.strictEqual(c.accuracyMultiplier, 0.8);
  assert.strictEqual(c.nearby[0].name, 't1');  // sorted by distance
  console.log('  PASS check counts & accuracy');

  ts.remove('t1');
  assert.strictEqual(ts.list().length, 2);
  ts.clear();
  assert.strictEqual(ts.list().length, 0);
  console.log('  PASS remove/clear');

  // ---------- 4. Vending service ----------
  console.log('\n=== Test 4: vending search ===');
  const ITEM_SCRAP = -932201673;
  const ITEM_AK = 1545779598;
  rust._setMarkers([
    {
      id: 1, type: 3 /* VendingMachine */, x: 1500, y: 2000, name: 'Joe Shop',
      sellOrders: [
        { itemId: ITEM_AK, quantity: 1, currencyId: ITEM_SCRAP, costPerItem: 250, amountInStock: 4 },
      ],
    },
    {
      id: 2, type: 3, x: 800, y: 800, name: 'Resource Stop',
      sellOrders: [
        { itemId: ITEM_SCRAP, quantity: 100, currencyId: -1, costPerItem: 50, amountInStock: 12 },
      ],
    },
  ]);
  const vending = new VendingService({ rustplusClient: rust });
  vending.setMapSize(4500);
  vending.setItemNameMap({ [ITEM_SCRAP]: 'Scrap', [ITEM_AK]: 'Assault Rifle' });

  const res = await vending.search('rifle');
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].sellItem, 'Assault Rifle');
  assert.ok(res[0].grid, 'grid should be computed');
  console.log('  PASS search by name');

  const res2 = await vending.search('Scrap');
  assert.ok(res2.length >= 1);
  console.log('  PASS case-insensitive');

  const res3 = await vending.search('zzzzznever');
  assert.strictEqual(res3.length, 0);
  console.log('  PASS no match');

  // ---------- 5. Coords to grid ----------
  console.log('\n=== Test 5: coords -> grid ===');
  // mapSize 4500 => 31 grid rows; (0,0) = bottom-left = "A30"
  assert.strictEqual(coordsToGrid(0, 0, 4500), 'A30');
  assert.strictEqual(coordsToGrid(146.25, 4500 - 0.01, 4500), 'B0');
  console.log('  PASS');

  // ---------- 6. Game time math ----------
  console.log('\n=== Test 6: game time helpers ===');
  // current 14.5, sunset 19, dayLengthMinutes 60 -> 4.5 in-game hours = 11.25 real minutes
  const hours = gameTime.inGameHoursUntil(14.5, 19);
  assert.strictEqual(hours, 4.5);
  const realMin = gameTime.inGameHoursToRealMinutes(hours, 60);
  assert.strictEqual(realMin, 11.25);
  console.log('  PASS until-hours and real-minutes');

  assert.strictEqual(gameTime.isDaytime({ time: 14.5, sunrise: 7, sunset: 19 }), true);
  assert.strictEqual(gameTime.isDaytime({ time: 22, sunrise: 7, sunset: 19 }), false);
  console.log('  PASS isDaytime');

  // ---------- 7. Death tracker ----------
  console.log('\n=== Test 7: death tracker ===');
  const rust2 = makeRustClient();
  const store7 = new JsonStore(path.join(tmpDir, 'dt.json'), { deaths: [] });
  sentDiscord.length = 0;
  const dt = new DeathTrackerService({ rustplusClient: rust2, discordClient, config, store: store7 });

  // First: emit team change with everyone alive, to seed lastAlive
  rust2._emitMessage({ broadcast: { teamChanged: { teamInfo: { members: [
    { steamId: '1', name: 'Alice', isAlive: true, x: 100, y: 100 },
    { steamId: '2', name: 'Bob', isAlive: true, x: 200, y: 200 },
  ]}}}});

  // Now Bob dies
  rust2._emitMessage({ broadcast: { teamChanged: { teamInfo: { members: [
    { steamId: '1', name: 'Alice', isAlive: true, x: 100, y: 100 },
    { steamId: '2', name: 'Bob', isAlive: false, x: 250, y: 250 },
  ]}}}});

  // Wait for async _announce
  await new Promise((r) => setTimeout(r, 50));

  const hist = dt.history(5);
  assert.strictEqual(hist.length, 1);
  assert.strictEqual(hist[0].name, 'Bob');
  assert.ok(rust2._sentTeam.some((m) => /Bob/.test(m)), 'death should be sent to game chat');
  assert.ok(sentDiscord.some((m) => /Bob/.test(m) && /死亡/.test(m)), 'death should be sent to discord');
  console.log('  PASS death captured + announced');

  // Bob respawns then dies again
  rust2._emitMessage({ broadcast: { teamChanged: { teamInfo: { members: [
    { steamId: '2', name: 'Bob', isAlive: true, x: 250, y: 250 },
  ]}}}});
  rust2._emitMessage({ broadcast: { teamChanged: { teamInfo: { members: [
    { steamId: '2', name: 'Bob', isAlive: false, x: 300, y: 300 },
  ]}}}});
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(dt.history(5).length, 2, 'second death should be recorded');
  console.log('  PASS multiple deaths');

  // teamMessage broadcasts must NOT be treated as deaths
  const before = dt.history(99).length;
  rust2._emitMessage({ broadcast: { teamMessage: { message: { name: 'X', message: 'hi', steamId: '99' }}}});
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(dt.history(99).length, before);
  console.log('  PASS teamMessage not misread as death');

  // ---------- 8. Event tracker ----------
  console.log('\n=== Test 8: event tracker ===');
  const rust8 = makeRustClient();
  const eventTracker = new EventTrackerService({ rustplusClient: rust8, discordClient, config, intervalSeconds: 10 });
  sentDiscord.length = 0;
  rust8._sentTeam.length = 0;

  // Initial markers — first poll, NOT announced (treated as pre-existing)
  rust8._setMarkers([
    { id: 'm1', type: 8 /* PatrolHelicopter */, x: 1000, y: 1000 },
  ]);
  await eventTracker._tick();
  assert.strictEqual(sentDiscord.length, 0, 'first-poll spawns must not announce');
  console.log('  PASS first poll silent (firstPoll=true)');

  // New marker appears
  rust8._setMarkers([
    { id: 'm1', type: 8, x: 1000, y: 1000 },
    { id: 'm2', type: 5 /* CargoShip */, x: 2000, y: 4000 },
  ]);
  await eventTracker._tick();
  assert.ok(sentDiscord.some((m) => /貨輪.*出現/.test(m)), 'cargo spawn must announce');
  assert.ok(rust8._sentTeam.some((m) => /貨輪/.test(m)));
  console.log('  PASS new spawn announced');

  // Marker disappears (despawn)
  rust8._setMarkers([{ id: 'm2', type: 5, x: 2000, y: 4000 }]);
  sentDiscord.length = 0; rust8._sentTeam.length = 0;
  await eventTracker._tick();
  assert.ok(sentDiscord.some((m) => /巡邏直升機.*消失|巡邏直升機.*摧毀/.test(m)));
  console.log('  PASS despawn announced');

  // ---------- 9. Team chat in-game commands ----------
  console.log('\n=== Test 9: in-game team chat dispatcher ===');
  const rust9 = makeRustClient();
  const teamChat = new TeamChatService({
    rustplusClient: rust9,
    config,
    deviceService: new DeviceService({ store: new JsonStore(path.join(tmpDir, 'tc.json'), {}), rustplusClient: rust9 }),
    turretService: new TurretService({ store: new JsonStore(path.join(tmpDir, 'tc-t.json'), {}) }),
    vendingService: new VendingService({ rustplusClient: rust9 }),
    deathTracker: { history: () => [{ name: 'Foo' }] },
    eventTracker: null,
  });

  // Pretend a teammate types !pop
  rust9._emitMessage({ broadcast: { teamMessage: { message: { steamId: '999', name: 'Mate', message: '!pop' }}}});
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(rust9._sentTeam.some((m) => m.includes('[人數]') && m.includes('100/200')), `expected pop reply, got: ${JSON.stringify(rust9._sentTeam)}`);
  console.log('  PASS !pop responded');

  rust9._sentTeam.length = 0;
  rust9._emitMessage({ broadcast: { teamMessage: { message: { steamId: '999', name: 'Mate', message: '!time' }}}});
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(rust9._sentTeam.some((m) => m.includes('14:30')), 'time should be 14:30');
  console.log('  PASS !time responded');

  rust9._sentTeam.length = 0;
  rust9._emitMessage({ broadcast: { teamMessage: { message: { steamId: '999', name: 'Mate', message: '!night' }}}});
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(rust9._sentTeam.some((m) => /天黑.*還有/.test(m)));
  console.log('  PASS !night responded');

  rust9._sentTeam.length = 0;
  // the bot itself says !pop — must NOT loop
  rust9._emitMessage({ broadcast: { teamMessage: { message: { steamId: config.rust.playerId, name: 'Bot', message: '!pop' }}}});
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(rust9._sentTeam.length, 0, 'bot must not respond to its own messages (loop guard)');
  console.log('  PASS loop guard (own steamId ignored)');

  rust9._sentTeam.length = 0;
  rust9._emitMessage({ broadcast: { teamMessage: { message: { steamId: '999', name: 'Mate', message: '!unknown' }}}});
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(rust9._sentTeam.length, 0, 'unknown command must be silent in team chat');
  console.log('  PASS unknown-cmd silent');

  rust9._sentTeam.length = 0;
  rust9._emitMessage({ broadcast: { teamMessage: { message: { steamId: '999', name: 'Mate', message: 'hello team' }}}});
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(rust9._sentTeam.length, 0, 'non-prefixed messages must not trigger anything');
  console.log('  PASS non-prefixed silent');

  // ---------- 10. New Discord commands ----------
  console.log('\n=== Test 10: new Discord commands ===');
  const rust10 = makeRustClient();
  rust10._setMarkers([
    { id: 'h1', type: 8, x: 1000, y: 1000 },        // PatrolHeli
    { id: 'c1', type: 5, x: 2000, y: 4000 },        // Cargo
    { id: 'lc1', type: 6, x: 3000, y: 3000 },       // Locked Crate
    { id: 'v1', type: 3, x: 1500, y: 2000, name: 'Joe', sellOrders: [
      { itemId: 1545779598, quantity: 1, currencyId: -932201673, costPerItem: 250, amountInStock: 4 },
    ]},
  ]);
  const ds10 = new DeviceService({ store: new JsonStore(path.join(tmpDir, 'd10.json'), {}), rustplusClient: rust10 });
  const tsvc10 = new TurretService({ store: new JsonStore(path.join(tmpDir, 't10.json'), {}) });
  const vs10 = new VendingService({ rustplusClient: rust10 });
  vs10.setItemNameMap({ 1545779598: 'Assault Rifle', '-932201673': 'Scrap' });

  const ctx = {
    config,
    rustplusClient: rust10,
    discordClient,
    autoStatsService: { start: () => true, stop: () => true, isRunning: () => false, getStatus: () => ({}) },
    deviceService: ds10,
    turretService: tsvc10,
    vendingService: vs10,
    deathTracker: { history: () => [] },
    eventTracker: { isRunning: () => true, start: () => false, stop: () => true },
  };

  async function run(content) {
    const { msg, replies } = makeMsg(content);
    await commands.handleMessage(msg, ctx);
    return replies[0] || '';
  }

  let r;
  r = await run('!info');
  assert.ok(/伺服器資訊/.test(r) && /100\/200/.test(r), `!info: ${r}`);
  console.log('  PASS !info');

  r = await run('!pop');
  assert.ok(/人數.*100\/200/.test(r));
  console.log('  PASS !pop');

  r = await run('!day');
  assert.ok(/距離天亮/.test(r));
  console.log('  PASS !day');

  r = await run('!night');
  assert.ok(/距離天黑/.test(r));
  console.log('  PASS !night');

  r = await run('!events');
  assert.ok(/巡邏直升機/.test(r) && /貨輪/.test(r));
  console.log('  PASS !events');

  r = await run('!vend rifle');
  assert.ok(/Assault Rifle/.test(r) && /250/.test(r), `!vend: ${r}`);
  console.log('  PASS !vend');

  r = await run('!devices');
  assert.ok(/尚未配對/.test(r));
  console.log('  PASS !devices empty');

  r = await run('!pair 100001 Front Door switch');
  assert.ok(/已配對 switch/.test(r));
  assert.strictEqual(ds10.list().length, 1);
  console.log('  PASS !pair');

  r = await run('!devices');
  assert.ok(/Front Door/.test(r));
  console.log('  PASS !devices populated');

  r = await run('!on Front Door');
  assert.ok(/開啟/.test(r));
  console.log('  PASS !on');

  r = await run('!device Front Door');
  assert.ok(/開啟/.test(r));
  console.log('  PASS !device status');

  r = await run('!off Front Door');
  assert.ok(/關閉/.test(r));
  console.log('  PASS !off');

  r = await run('!unpair Front Door');
  assert.ok(/已取消配對/.test(r));
  console.log('  PASS !unpair');

  r = await run('!turret add corner 100 200');
  assert.ok(/已新增/.test(r));
  r = await run('!turret add bedroom 110 200');
  r = await run('!turret list');
  assert.ok(/corner/.test(r) && /bedroom/.test(r));
  r = await run('!turret check 105 200');
  assert.ok(/2.*命中率.*80%/s.test(r), `!turret check: ${r}`);
  console.log('  PASS !turret add/list/check');

  r = await run('!turret clear');
  r = await run('!turret list');
  assert.ok(/尚無追蹤中/.test(r));
  console.log('  PASS !turret clear');

  r = await run('!promote Alice');
  assert.ok(/升為隊長/.test(r));
  console.log('  PASS !promote by name');

  r = await run('!deaths');
  assert.ok(/啟動後尚未紀錄/.test(r));
  console.log('  PASS !deaths empty');

  r = await run('!eventtracker status');
  assert.ok(/執行中/.test(r));
  console.log('  PASS !eventtracker status');

  // help should mention new commands (the command names themselves stay English)
  r = await run('!help');
  assert.ok(/!info/.test(r) && /!vend/.test(r) && /!turret/.test(r) && /!pair/.test(r));
  console.log('  PASS !help mentions new commands');

  // ---------- 11. Disconnected guards ----------
  console.log('\n=== Test 11: disconnected guards ===');
  const rust11 = makeRustClient();
  rust11.isConnected = () => false;
  const ctx11 = { ...ctx, rustplusClient: rust11 };
  r = (await (async () => { const { msg, replies } = makeMsg('!info'); await commands.handleMessage(msg, ctx11); return replies[0] || ''; })());
  assert.ok(/未連線/.test(r), `!info while offline should warn: ${r}`);
  console.log('  PASS !info offline guarded');

  console.log('\n✅ ALL NEW-FEATURE TESTS PASSED');

  // cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})().catch((err) => { console.error('FAILED:', err); process.exit(1); });
