const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHmac } = require('node:crypto');
const { secretEquals, clientIp } = require('../src/utils/security');
const { isPublicAddress, publicLookup, safeFetchOptions } = require('../src/utils/safeFetch');

function loadModule(file, replacements, env = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, __dirname: path.dirname(filename),
    require: name => Object.hasOwn(replacements, name) ? replacements[name] : nativeRequire(name),
    Buffer, URL, console, setTimeout, clearTimeout, setInterval, clearInterval,
    process: { env, on() {} }
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return module.exports;
}

function signedToken(secret, overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'master_admin', sid: 'test-session', role: 'superadmin', exp: Date.now() + 60000, ...overrides })).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

test('secret comparison and local forwarding headers', () => {
  assert.equal(secretEquals('key', 'key'), true);
  for (const value of ['', null, {}, 'wrong']) assert.equal(secretEquals(value, 'key'), false);
  assert.equal(secretEquals('', ''), false);
  assert.equal(clientIp({ headers: { 'x-forwarded-for': 'attacker' }, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
});

test('scraper blocks internal and special addresses and disables redirects', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2002:7f00:1::', '2001:db8::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(safeFetchOptions.maxRedirects, 0);
  assert.equal(safeFetchOptions.proxy, false);
});

test('sessions fail closed for unavailable, missing, revoked and failed stores', async () => {
  const secret = 'test-secret';
  const token = signedToken(secret);
  for (const getDb of [async () => null, async () => { throw Error('offline'); },
    async () => ({ collection: () => ({ findOne: async () => null }) }),
    async () => ({ collection: () => ({ findOne: async () => ({ revoked: true }) }) }),
    async () => ({ collection: () => ({ findOne: async () => { throw Error('timeout'); } }) })]) {
    const auth = loadModule('src/services/authService.js', { './mongoService': { getDb } }, { SESSION_SECRET: secret });
    assert.equal((await auth.validateSessionToken(token)).valid, false);
  }
  const auth = loadModule('src/services/authService.js', { './mongoService': {
    getDb: async () => ({ collection: () => ({ findOne: async () => ({ revoked: false }), updateOne: async () => ({ modifiedCount: 1 }) }) })
  } }, { SESSION_SECRET: secret });
  assert.equal((await auth.validateSessionToken(token)).valid, true);
  assert.equal((await auth.validateSessionToken(signedToken(secret, { exp: undefined }))).valid, false);
  assert.equal((await auth.validateSessionToken(signedToken(secret, { exp: Date.now() - 1 }))).valid, false);
  assert.equal((await auth.validateSessionToken(token + 'tampered')).valid, false);
});

test('socket DNS lookup rejects mixed public/private answers', async t => {
  t.mock.method(require('node:dns'), 'lookup', (host, options, callback) => callback(null, [
    { address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }
  ]));
  await new Promise(resolve => publicLookup('allowed.gov.in', {}, error => {
    assert.match(error.message, /Non-public destination/);
    resolve();
  }));
});

test('rotated tokens cannot be reused', async () => {
  const records = [];
  const collection = {
    insertOne: async record => { records.push(record); },
    findOne: async filter => records.find(record => record.sessionId === filter.sessionId && record.tokenHash === filter.tokenHash),
    updateOne: async (filter, update) => {
      if (filter._id !== undefined) return { modifiedCount: 1 };
      const record = records.find(record => record.sessionId === filter.sessionId && record.tokenHash === filter.tokenHash && record.revoked === false);
      if (!record) return { modifiedCount: 0 };
      Object.assign(record, update.$set);
      return { modifiedCount: 1 };
    }
  };
  const auth = loadModule('src/services/authService.js', { './mongoService': { getDb: async () => ({ collection: () => collection }) } }, { ADMIN_API_KEY: 'master' });
  const first = await auth.loginWithMasterKey('master');
  const rotated = await auth.rotateToken(first.token);
  assert.equal((await auth.validateSessionToken(first.token)).valid, false);
  assert.equal((await auth.validateSessionToken(rotated.token)).valid, true);
  await assert.rejects(auth.rotateToken(first.token), /Invalid or revoked/);
});

test('anonymous resubscription cannot overwrite another candidate preferences', async () => {
  let writes = 0;
  const store = loadModule('src/services/notifications/subscriberStore.js', {
    './constants': { isValidEmail: () => true },
    './sentHistoryStore': { getSentJobHistory: async () => ({}) },
    '../mongoService': {
      getSubscribersFromMongo: async () => [{ email: 'victim@example.com', name: 'Victim', notifiedJobIds: [] }],
      upsertSubscriberInMongo: async () => { writes++; }
    }
  });
  await assert.rejects(store.subscribeUser({ email: 'victim@example.com', name: 'Attacker' }), /Administrator authorization/);
  assert.equal(writes, 0);
});

test('session creation cannot succeed without persistence; first admin needs master key', async () => {
  const auth = loadModule('src/services/authService.js', { './mongoService': {
    getDb: async () => ({ collection: () => ({ countDocuments: async () => 0, insertOne: async () => { throw Error('write failed'); } }) })
  } }, { ADMIN_API_KEY: 'master' });
  await assert.rejects(auth.registerAdmin('attacker', 'password123'), /Master Authorization Key/);
  await assert.rejects(auth.loginWithMasterKey('master'), /write failed/);
});

test('HTTP private endpoints require authorization; URL secrets and spoofed IPs cannot bypass controls', async () => {
  const server = loadModule('server.js', {
    './src/services/notificationService': {},
    './src/services/authService': {
      validateSessionToken: async () => ({ valid: false }), checkPermission: () => false
    },
    'node:fs': { ...fs, existsSync: () => false }
  }, { ADMIN_API_KEY: 'master' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/api/mongodb/status', '/api/admin/status', '/api/anandapkaproject/status', '/api/track-job/list?email=victim@example.com', '/api/track-job/active-timers', '/api/notifications/sent-history?email=victim@example.com', '/api/track-job/status?email=victim@example.com']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 401, route);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    for (const route of ['/api/unsubscribe', '/api/track-job/apply', '/api/track-job/schedule-timer', '/api/track-job/send-reminder-now']) {
      assert.equal((await fetch(base + route, { method: 'POST' })).status, 401, route);
    }
    assert.equal((await fetch(base + '/api/auth/verify?adminKey=master')).status, 401);
    assert.equal((await fetch(base + '/api/auth/verify', { headers: { 'x-admin-key': 'master' } })).status, 200);
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), null);
    for (const route of ['/api/subscribe', '/api/notifications/test', '/api/track-job']) {
      const response = await fetch(base + route, { method: 'POST', body: '{' });
      assert.equal(response.status, route === '/api/notifications/test' ? 500 : 400, route);
    }
    // Public endpoints share this IP's request budget with authentication.
    for (let i = 0; i < 7; i++) {
      assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', body: '{}', headers: { 'x-forwarded-for': `spoof-${i}` } })).status, 401);
    }
    assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', body: '{}', headers: { 'x-forwarded-for': 'new-spoof' } })).status, 429);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('frontend link sanitizer rejects executable schemes and escapes attributes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/js/components.js'), 'utf8');
  const helpers = source.slice(source.indexOf('export function escapeHtml'), source.indexOf('/**\n * Renders the top')).replace(/export /g, '');
  const context = vm.createContext({ URL });
  vm.runInContext(helpers, context);
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'https://user:pass@example.com', 'invalid']) assert.equal(context.safeLink(url), '#');
  assert.equal(context.safeLink('https://example.com/?a=1&b=2'), 'https://example.com/?a=1&amp;b=2');
});
