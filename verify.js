'use strict';

/**
 * Offline verification — does NOT connect to Discord or Rust+.
 * Mocks the Rust+ client and feeds realistic response shapes into the
 * real statsService + onStats handler to prove the team-chat path works.
 */

const assert = require('assert');
const path = require('path');

// Force minimal env so config.js doesn't blow up.
process.env.DISCORD_TOKEN = 'x';
process.env.DISCORD_CHANNEL_ID = '0';
process.env.RUST_IP = '127.0.0.1';
process.env.RUST_PORT = '28082';
process.env.RUST_PLAYER_ID = '0';
process.env.RUST_PLAYER_TOKEN = '0';

const statsService = require('./src/statsService');
const { formatGameTime, formatTeamMember } = require('./src/utils/formatters');

// ---------- 1. formatGameTime should NOT return ??:?? for a real Rust+ time number ----------
assert.strictEqual(formatGameTime(14.5), '14:30', 'formatGameTime(14.5) should be 14:30');
assert.strictEqual(formatGameTime(0), '00:00');
assert.strictEqual(formatGameTime(23.99), '23:59');
assert.strictEqual(formatGameTime('bad'), '??:??');
assert.strictEqual(formatGameTime(undefined), '??:??');
console.log('PASS: formatGameTime');

// ---------- 2. mock RustPlusClient ----------
function makeMockClient({ connected = true, sendShouldFail = false } = {}) {
  const sent = [];
  return {
    _sent: sent,
    isConnected: () => connected,
    getTime: async () => 14.5,                        // returns a NUMBER (post-fix)
    getTeamInfo: async () => ({
      members: [
        { steamId: '1', name: 'Alice', isOnline: true,  isAlive: true,  x: 1234, y: -567 },
        { steamId: '2', name: 'Bob',   isOnline: true,  isAlive: false, x: 0, y: 0 },
        { steamId: '3', name: 'Carol', isOnline: false, isAlive: true,  x: 0, y: 0 },
        { steamId: '4', name: 'Dave',  isOnline: false, isAlive: false, x: 999, y: 999 },
        { steamId: '5', name: 'Eve',   isOnline: true,  isAlive: true,  x: 50, y: 50 },
      ],
    }),
    sendTeamMessage: async (msg) => {
      if (sendShouldFail) throw new Error('Rust+ sendTeamMessage error: not_in_team');
      sent.push(msg);
      return true;
    },
  };
}

// ---------- 3. statsService.getStats with a healthy mock ----------
(async () => {
  const client = makeMockClient();
  const stats = await statsService.getStats(client);
  assert.strictEqual(stats.connected, true);
  assert.strictEqual(stats.total, 5);
  assert.strictEqual(stats.online, 3);
  assert.strictEqual(stats.offline, 2);
  assert.strictEqual(stats.alive, 3);
  assert.strictEqual(stats.dead, 2);
  assert.strictEqual(typeof stats.time, 'number', 'stats.time should be a number, not an object');
  console.log('PASS: getStats counts');

  // ---------- 4. Game chat formatting must contain a real time, not ??:?? ----------
  const gameLine = statsService.formatStatsForGameChat(stats);
  console.log('  game chat ->', gameLine);
  assert.ok(!gameLine.includes('??:??'), 'game chat must not contain ??:?? — getTime is broken');
  assert.ok(gameLine.includes('14:30'), 'game chat should show 14:30');
  assert.ok(gameLine.includes('在線 3/5'));
  assert.ok(gameLine.includes('存活 3'));
  assert.ok(gameLine.includes('死亡 2'));
  console.log('PASS: formatStatsForGameChat');

  // ---------- 5. Discord formatting ----------
  const discordBlock = statsService.formatStatsForDiscord(stats, 'TestBot');
  assert.ok(discordBlock.includes('14:30'));
  assert.ok(discordBlock.includes('已連線'));
  console.log('PASS: formatStatsForDiscord');

  // ---------- 6. End-to-end !stats (default = both) actually calls sendTeamMessage ----------
  const commands = require('./src/commands');
  const replies = [];
  const fakeMessage = {
    author: { bot: false },
    channelId: '0',
    content: '!stats',
    reply: async (payload) => { replies.push(payload); return true; },
  };
  const ctx = {
    config: { discord: { channelId: '0', prefix: '!' }, bot: { name: 'TestBot' } },
    rustplusClient: client,
    discordClient: {},
    autoStatsService: {},
  };
  await commands.handleMessage(fakeMessage, ctx);
  assert.strictEqual(client._sent.length, 1, '!stats should send exactly one game-chat message');
  assert.ok(client._sent[0].includes('14:30'), 'sent game-chat message must include real time');
  assert.strictEqual(replies.length, 1, '!stats should reply once on Discord');
  console.log('PASS: !stats (default) -> game chat sent, discord replied');

  // ---------- 7. !stats game (game-only) ----------
  client._sent.length = 0; replies.length = 0;
  fakeMessage.content = '!stats game';
  await commands.handleMessage(fakeMessage, ctx);
  assert.strictEqual(client._sent.length, 1, '!stats game should send exactly one game-chat message');
  assert.strictEqual(replies.length, 1);
  const r = replies[0];
  const replyText = typeof r === 'string' ? r : r.content;
  assert.ok(replyText.includes('統計已傳送'), 'reply should confirm send');
  console.log('PASS: !stats game');

  // ---------- 8. !stats game when send FAILS surfaces the error ----------
  const failClient = makeMockClient({ sendShouldFail: true });
  const failCtx = { ...ctx, rustplusClient: failClient };
  replies.length = 0;
  fakeMessage.content = '!stats game';
  await commands.handleMessage(fakeMessage, failCtx);
  const failText = typeof replies[0] === 'string' ? replies[0] : replies[0].content;
  assert.ok(/失敗/.test(failText), 'send failure must be reported back to Discord, not silently swallowed');
  console.log('PASS: !stats game surfaces send failures');

  // ---------- 9. !say sends and disables mentions ----------
  client._sent.length = 0; replies.length = 0;
  fakeMessage.content = '!say @everyone hello team';
  await commands.handleMessage(fakeMessage, ctx);
  assert.strictEqual(client._sent.length, 1);
  assert.ok(client._sent[0].includes('@everyone'));   // raw msg goes to game chat
  assert.ok(client._sent[0].includes('hello team'));
  const sayReply = replies[0];
  assert.deepStrictEqual(sayReply.allowedMentions, { parse: [] }, '!say reply must disable Discord mentions');
  console.log('PASS: !say sends to game chat and suppresses Discord mentions');

  // ---------- 10. !say with empty arg ----------
  client._sent.length = 0; replies.length = 0;
  fakeMessage.content = '!say';
  await commands.handleMessage(fakeMessage, ctx);
  assert.strictEqual(client._sent.length, 0, 'empty !say must NOT send anything');
  const usageText = typeof replies[0] === 'string' ? replies[0] : replies[0].content;
  assert.ok(/用法/.test(usageText));
  console.log('PASS: empty !say is rejected');

  // ---------- 11. team member coords: hide invalid (0,0) and offline ----------
  const aliceLine = formatTeamMember({ name: 'Alice', isOnline: true,  isAlive: true,  x: 100, y: 200 });
  const bobLine   = formatTeamMember({ name: 'Bob',   isOnline: true,  isAlive: false, x: 0,   y: 0   });
  const carolLine = formatTeamMember({ name: 'Carol', isOnline: false, isAlive: true,  x: 50,  y: 50  });
  assert.ok(/位置 \(100, 200\)/.test(aliceLine));
  assert.ok(!/位置 /.test(bobLine),   'must NOT show (0,0) coords');
  assert.ok(!/位置 /.test(carolLine), 'must NOT show coords for offline member');
  console.log('PASS: formatTeamMember coords gated correctly');

  console.log('\nALL CHECKS PASSED ✅');
})().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
