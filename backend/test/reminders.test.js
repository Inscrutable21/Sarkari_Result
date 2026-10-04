const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, dependencies, env = {}) {
  const module = { exports: {} };
  const filename = path.resolve(__dirname, '../src/services/notifications', file);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process: { env }, console: { log() {}, warn() {}, error() {} },
    require(name) { if (!(name in dependencies)) throw Error(`Unexpected dependency ${name}`); return dependencies[name]; }
  }, { filename });
  return module.exports;
}

test('missing SMTP credentials fail instead of recording preview mail as delivered', async () => {
  const transport = load('emailTransporter.js', {
    nodemailer: { createTransport() { throw Error('Must not create a test transport'); } },
    '../mongoService': {}
  });
  await assert.rejects(transport.getTransporter(), /Email delivery is not configured/);
});

test('custom SMTP host is respected even for a Gmail sender', async () => {
  let options;
  const transport = load('emailTransporter.js', {
    nodemailer: { createTransport(config) { options = config; return {}; } }, '../mongoService': {}
  }, { SMTP_HOST: 'relay.example.com', SMTP_PORT: '587', EMAIL_USER: 'sender@gmail.com', EMAIL_APP_PASSWORD: 'password' });
  await transport.getTransporter();
  assert.equal(options.host, 'relay.example.com');
  assert.equal(options.secure, false);
});

function dispatcher(tracks, sendMail) {
  const writes = [];
  const logs = [];
  const service = load('dispatcher.js', {
    nodemailer: {}, '../mongoService': {},
    './emailTransporter': { getTransporter: async () => ({ sendMail }), logEmailDispatch: async entry => logs.push(entry) },
    './emailTemplates': { buildJobReminderEmailHtml: () => '', buildJobAlertEmailHtml: () => '' },
    './sentHistoryStore': {}, './subscriberStore': {},
    './jobTrackerStore': { getTrackedJobs: async () => tracks, saveTrackedJobs: async list => writes.push(list), calculateDaysLeft: () => 5 },
    './constants': { isDateTodayIST: () => true }
  });
  return { service, writes, logs };
}

test('failed SMTP delivery remains pending and a retry only sends failed recipients', async () => {
  const tracks = [{ email: 'good@example.com', active: true }, { email: 'retry@example.com', active: true }];
  let fail = true;
  const sends = [];
  const { service, logs } = dispatcher(tracks, async mail => {
    sends.push(mail.to);
    if (fail && mail.to === 'retry@example.com') throw Error('SMTP temporarily unavailable');
    return { accepted: [mail.to], messageId: 'smtp-id' };
  });
  const first = await service.sendDailyJobReminders();
  assert.equal(first.dispatched, 1);
  assert.equal(first.failed, 1);
  assert.equal(tracks[1].lastReminderSentAt, undefined);
  fail = false;
  const retry = await service.sendDailyJobReminders();
  assert.equal(retry.failed, 0);
  assert.equal(retry.dispatched, 1);
  assert.equal(retry.skippedAlreadySentToday, 1);
  assert.deepEqual(sends, ['good@example.com', 'retry@example.com', 'retry@example.com']);
  assert.equal(logs.length, 2);
});

test('SMTP recipient rejection cannot mark a reminder delivered', async () => {
  const track = { email: 'rejected@example.com', active: true };
  const { service, logs } = dispatcher([track], async () => ({ accepted: [], rejected: [track.email] }));
  const result = await service.sendDailyJobReminders();
  assert.equal(result.failed, 1);
  assert.equal(track.lastReminderSentAt, undefined);
  assert.equal(logs.length, 0);
});

test('scheduled batch reports partial failure instead of completing the day', async () => {
  const batch = load('scheduledBatch.js', {
    './dispatcher': { sendDailyJobReminders: async () => ({ dispatched: 1, failed: 1 }), dispatchAllNotifications: async () => ({ dispatched: 0 }) }
  });
  await assert.rejects(batch.runScheduledBatch(), /retry required/);
});

test('successful scheduled batch completes when recipients are already sent', async () => {
  const batch = load('scheduledBatch.js', {
    './dispatcher': { sendDailyJobReminders: async () => ({ dispatched: 0, failed: 0, skippedAlreadySentToday: 2 }), dispatchAllNotifications: async () => ({ dispatched: 0 }) }
  });
  const result = await batch.runScheduledBatch();
  assert.equal(result.summary.skippedAlreadySentToday, 2);
});

test('scheduled batch retries a transient failure and totals successful deliveries', async () => {
  let calls = 0;
  const batch = load('scheduledBatch.js', {
    './dispatcher': {
      sendDailyJobReminders: async () => (++calls === 1 ? { dispatched: 1, failed: 1 } : { dispatched: 1, failed: 0 }),
      dispatchAllNotifications: async () => ({ dispatched: 0 })
    }
  });
  const result = await batch.runScheduledBatch();
  assert.equal(result.attempts, 2);
  assert.equal(result.summary.dispatched, 2);
});
