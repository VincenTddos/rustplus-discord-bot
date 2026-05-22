'use strict';

const assert = require('assert');

process.env.DISCORD_TOKEN = 'x';
process.env.DISCORD_CHANNEL_ID = '0';
process.env.RUST_IP = '127.0.0.1';
process.env.RUST_PORT = '28082';
process.env.RUST_PLAYER_ID = '0';
process.env.RUST_PLAYER_TOKEN = '0';

const AutoStatsService = require('./src/autoStatsService');

const sentToGame = [];
const sentToDiscord = [];

const rustplusClient = {
  isConnected: () => true,
  getTime: async () => 14.5,
  getTeamInfo: async () => ({ members: [
    { name: 'A', isOnline: true,  isAlive: true  },
    { name: 'B', isOnline: false, isAlive: true  },
    { name: 'C', isOnline: true,  isAlive: false },
  ]}),
  sendTeamMessage: async (msg) => { sentToGame.push(msg); },
};

const discordClient = {
  channels: {
    fetch: async () => ({
      isTextBased: () => true,
      send: async (payload) => { sentToDiscord.push(payload); },
    }),
  },
};

const config = {
  discord: { channelId: '0', prefix: '!' },
  bot: { name: 'TestBot' },
  autoStats: {
    enabled: false,
    intervalMinutes: 999,           // huge so the interval doesn't fire during the test
    sendToDiscord: true,
    sendToGame: true,
  },
};

const svc = new AutoStatsService({ rustplusClient, discordClient, config });

(async () => {
  // Start: must fire one tick immediately
  const ok = svc.start();
  assert.strictEqual(ok, true);
  assert.strictEqual(svc.isRunning(), true);

  // Give the immediate tick time to complete (it's awaited internally via .catch)
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(sentToGame.length, 1, 'autostats start should fire one immediate game-chat send');
  assert.ok(sentToGame[0].includes('14:30'), 'immediate game chat must contain real time');
  assert.strictEqual(sentToDiscord.length, 1, 'autostats start should fire one immediate Discord post');
  console.log('PASS: autostats fires immediately on start');
  console.log('  game ->', sentToGame[0]);

  // Second start should be a no-op
  const ok2 = svc.start();
  assert.strictEqual(ok2, false, 'double start must be rejected');
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(sentToGame.length, 1, 'no extra send on double start');
  console.log('PASS: autostats double-start protection');

  // getStatus reflects state
  const s = svc.getStatus();
  assert.deepStrictEqual(s, {
    running: true,
    intervalMinutes: 999,
    sendToDiscord: true,
    sendToGame: true,
  });
  console.log('PASS: autostats getStatus');

  // Stop works
  const stopped = svc.stop();
  assert.strictEqual(stopped, true);
  assert.strictEqual(svc.isRunning(), false);
  console.log('PASS: autostats stop');

  // Stop again is a no-op
  const stopped2 = svc.stop();
  assert.strictEqual(stopped2, false);
  console.log('PASS: autostats double-stop protection');

  console.log('\nALL AUTOSTATS CHECKS PASSED ✅');
  process.exit(0);
})().catch((err) => { console.error('FAILED:', err); process.exit(1); });
