import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { readConfig } from '../server/proxy-policy.js';
import { createProxyServer } from '../server/proxy-server.js';
import { readDonationConfig, publicDonationConfig, validateDonationInput, createDonation, acceptDonationResult,
  amountInCents, checkoutSignature, resultSignature, validInvoiceId, DONATION_PRESETS } from '../server/donations.js';

const syntheticEnv = {
  TASKMAP_DONATIONS_ENABLED: 'true', TASKMAP_ROBOKASSA_MERCHANT_LOGIN: 'synthetic_donation_store',
  TASKMAP_ROBOKASSA_PASSWORD1: 'synthetic_password_one', TASKMAP_ROBOKASSA_PASSWORD2: 'synthetic_password_two',
  TASKMAP_ROBOKASSA_TEST_MODE: 'true', TASKMAP_ROBOKASSA_HASH_ALGORITHM: 'md5',
};

async function temporaryConfig(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'taskmap-donations-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { ...syntheticEnv, TASKMAP_DONATION_DATA_DIR: directory, ...overrides };
  return { env, config: readDonationConfig(env), directory };
}

function php(command, env, input = {}) {
  const result = spawnSync('php', ['tests/donation-php-runner.php'], {
    input: JSON.stringify({ command, env, ...input }), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function notification(config, invId, preset = 'small', amount = `${DONATION_PRESETS[preset]}.000000`, patch = {}) {
  return new URLSearchParams({ OutSum: amount, InvId: invId, Shp_kind: 'donation', Shp_preset: preset,
    SignatureValue: resultSignature(config, amount, invId, preset), ...patch }).toString();
}

test('Donation config is disabled by default, exposes no secrets and rejects malformed switches', () => {
  assert.deepEqual(publicDonationConfig(readDonationConfig({})), { enabled: false, currency: 'RUB', testMode: true, presets: [] });
  assert.deepEqual(php('config', {}).value, publicDonationConfig(readDonationConfig({})));
  for (const name of ['TASKMAP_DONATIONS_ENABLED', 'TASKMAP_ROBOKASSA_TEST_MODE']) {
    for (const value of ['0', '1', 'invalid']) {
      const env = { ...syntheticEnv, [name]: value };
      assert.equal(publicDonationConfig(readDonationConfig(env)).enabled, false);
      assert.equal(php('config', env).value.enabled, false);
    }
  }
  for (const name of ['TASKMAP_ROBOKASSA_PASSWORD1', 'TASKMAP_ROBOKASSA_PASSWORD2', 'TASKMAP_ROBOKASSA_MERCHANT_LOGIN']) {
    const env = { ...syntheticEnv, [name]: '' };
    assert.equal(publicDonationConfig(readDonationConfig(env)).enabled, false);
    assert.equal(php('config', env).value.enabled, false);
  }
  const result = publicDonationConfig(readDonationConfig(syntheticEnv));
  assert.deepEqual(Object.keys(result).sort(), ['currency', 'enabled', 'presets', 'testMode']);
  assert.deepEqual(result, php('config', syntheticEnv).value);
  assert.ok(!JSON.stringify(result).includes('synthetic_'));
});

test('Node and PHP reject array/object/scalar presets, extra amount and identity inputs', () => {
  for (const input of [null, [], 490, 'small', {}, { preset: ['small'], locale: 'en' },
    { preset: {}, locale: 'en' }, { preset: true, locale: 'en' }, { preset: 'small', locale: ['en'] },
    { preset: 'small', locale: 'xx' }, { preset: 'zero', locale: 'ru' },
    { preset: 'small', locale: 'ru', amount: 0 }, { preset: 'small', locale: 'ru', email: 'person@example.com' },
    { preset: 'small', locale: 'ru', jiraAuth: {} }]) {
    assert.throws(() => validateDonationInput(input), { status: 400 });
    assert.equal(php('create', syntheticEnv, { input }).status, 400);
  }
});

test('MD5, SHA256 and SHA512 checkout/result signatures have Node/PHP parity', () => {
  // Independently computed with Python hashlib from the documented literal formats:
  // https://docs.robokassa.ru/ru/pay-interface
  // https://docs.robokassa.ru/ru/notifications-and-redirects
  const vectors = {
    md5: {
      checkout: 'b1998fce660e12b53b98d1ab6dd9d522',
      result: '7935b69849c2129eca34e07c593cf4d8',
    },
    sha256: {
      checkout: 'bf4bca83fe241bf4890f863e08c25303316890d4128a16652e0ab707513e3cd7',
      result: '672c04c774cce786cdb17a455960263f48376294a65547e431fce2548dabe573',
    },
    sha512: {
      checkout: '44d7805fdb871556e3e6f71d521ed6d207138723d64c4c347f5333fcdfd6f9acca389530c4e769755239e66d9c3ed7911aa0684a6510b9f0a578ae04372c94d1',
      result: '68dc2bcf75fc594b2b77eb3b677757e6cdfbceb89133154cc133b00a62e28172a98c2c90bc9afef967bb9a33a9497a83ab9422fea12ba7b220195b3354c8c432',
    },
  };
  for (const algorithm of ['md5', 'sha256', 'sha512']) {
    const env = { ...syntheticEnv, TASKMAP_ROBOKASSA_HASH_ALGORITHM: algorithm };
    const config = readDonationConfig(env);
    const expected = vectors[algorithm];
    assert.equal(checkoutSignature(config, '490.00', '123', 'small'), expected.checkout);
    assert.equal(resultSignature(config, '490.000000', '123', 'small'), expected.result);
    const checkout = php('signature', env, { amount: '490.00', invId: '123', preset: 'small' }).value.checkout;
    const result = php('signature', env, { amount: '490.000000', invId: '123', preset: 'small' }).value.result;
    assert.equal(checkout, expected.checkout);
    assert.equal(result, expected.result);
  }
});

test('Money compares exact cents without floating point or tiny-fraction rounding', () => {
  for (const value of ['490', '490.0', '490.00', '490.000000']) {
    assert.equal(amountInCents(value), 49000n);
    assert.equal(php('cents', syntheticEnv, { amount: value }).value, 49000);
  }
  for (const value of ['-490', '+490', '0490.00', '4.9e2', '490,00', 'NaN', '490.000001', '490.009', '490.0000000', ' 490.00', '490.00 ', '']) {
    assert.throws(() => amountInCents(value), { status: 400 });
    assert.equal(php('cents', syntheticEnv, { amount: value }).status, 400);
  }
  assert.equal(validInvoiceId('9223372036854775807'), true);
  for (const value of ['0', '01', '../123', '9223372036854775808', '123.0', 123]) assert.equal(validInvoiceId(value), false);
});

test('Three exact presets create private minimal invoices and safe one-off checkout URLs', async (t) => {
  const { config, env, directory } = await temporaryConfig(t);
  const ids = new Set();
  for (const [preset, amount] of Object.entries(DONATION_PRESETS)) {
    for (const runtime of ['node', 'php']) {
      const result = runtime === 'node' ? await createDonation({ preset, locale: 'zh' }, config)
        : php('create', env, { input: { preset, locale: 'zh' } }).value;
      assert.equal(validInvoiceId(result.invId), true);
      assert.equal(ids.has(result.invId), false);
      ids.add(result.invId);
      const url = new URL(result.url);
      assert.equal(url.origin, 'https://auth.robokassa.ru');
      assert.equal(url.pathname, '/Merchant/Index.aspx');
      assert.equal(url.searchParams.get('OutSum'), `${amount}.00`);
      assert.equal(url.searchParams.get('Culture'), 'en');
      assert.equal(url.searchParams.get('IsTest'), '1');
      assert.equal(url.searchParams.get('Shp_kind'), 'donation');
      assert.equal(url.searchParams.get('Shp_preset'), preset);
      assert.equal(url.searchParams.get('SignatureValue'), checkoutSignature(config, `${amount}.00`, result.invId, preset));
      for (const key of ['Recurring', 'Token', 'Email', 'Shp_email', 'Shp_jira']) assert.equal(url.searchParams.has(key), false);
      assert.ok(!result.url.includes(config.password1));
      assert.ok(!result.url.includes(config.password2));
      const file = join(directory, `${result.invId}.json`);
      const invoice = JSON.parse(await readFile(file, 'utf8'));
      assert.deepEqual(Object.keys(invoice).sort(), ['amount', 'createdAt', 'invId', 'paidAt', 'preset', 'testMode']);
      assert.equal(invoice.amount, `${amount}.00`);
      assert.equal(invoice.paidAt, null);
      assert.equal((await stat(file)).mode & 0o777, 0o600);
    }
  }
  assert.equal((await readdir(directory)).length, 6);
  await assert.rejects(createDonation({ preset: 'small', locale: 'ru' }, readDonationConfig({})), { status: 503 });
  assert.equal(php('create', {}, { input: { preset: 'small', locale: 'ru' } }).status, 503);
});

test('Verified callbacks are idempotent across Node/PHP and store only donation paid status', async (t) => {
  const { config, env, directory } = await temporaryConfig(t);
  const { invId } = await createDonation({ preset: 'small', locale: 'ru' }, config);
  const raw = notification(config, invId, 'small', '490.000000', { Email: 'person@example.com', Fee: '0.000000', IsTest: '1' });
  assert.equal(await acceptDonationResult(raw, config), `OK${invId}`);
  const first = await readFile(join(directory, `${invId}.json`), 'utf8');
  assert.equal(php('callback', env, { raw }).value, `OK${invId}`);
  assert.equal(await acceptDonationResult(raw, config), `OK${invId}`);
  assert.equal(await readFile(join(directory, `${invId}.json`), 'utf8'), first);
  assert.ok(JSON.parse(first).paidAt);
  assert.ok(!first.includes('person@example.com'));
  assert.ok(!first.includes('synthetic_password'));
  assert.deepEqual(await readdir(directory), [`${invId}.json`]);
  const created = php('create', env, { input: { preset: 'large', locale: 'ar' } }).value;
  assert.equal(php('callback', env, { raw: notification(config, created.invId, 'large') }).value, `OK${created.invId}`);
  assert.equal(await acceptDonationResult(notification(config, created.invId, 'large'), config), `OK${created.invId}`);
});

test('Callbacks reject tampering, unknown invoices, extra Shp fields and test-mode mismatch', async (t) => {
  const { config, env, directory } = await temporaryConfig(t);
  const { invId } = await createDonation({ preset: 'small', locale: 'en' }, config);
  const cases = [
    [notification(config, invId, 'small', '0.00'), 403],
    [notification(config, invId, 'small', '2490.00'), 403],
    [notification(config, invId, 'medium', '2490.00'), 403],
    [notification(config, invId, 'small', '490.000001'), 400],
    [notification(config, invId, 'small', '490.00', { SignatureValue: '0'.repeat(32) }), 403],
    [notification(config, invId, 'small', '490.00', { Shp_kind: 'subscription' }), 400],
    [notification(config, invId, 'small', '490.00', { Shp_email: 'person@example.com' }), 400],
    [notification(config, invId, 'small', '490.00', { Shp_extra: 'synthetic_value' }), 400],
    [notification(config, invId, 'small', '490.00', { IsTest: '0' }), 403],
    [notification(config, '1'), 404],
    [notification(config, '../123'), 400],
    [`${notification(config, invId)}&InvId=${invId}`, 400],
    [`${notification(config, invId)}&Email=%C0`, 400],
  ];
  for (const [raw, status] of cases) {
    await assert.rejects(acceptDonationResult(raw, config), { status });
    assert.equal(php('callback', env, { raw }).status, status);
  }
  const liveEnv = { ...env, TASKMAP_ROBOKASSA_TEST_MODE: 'false' };
  await assert.rejects(acceptDonationResult(notification(config, invId), readDonationConfig(liveEnv)), { status: 403 });
  assert.equal(php('callback', liveEnv, { raw: notification(config, invId) }).status, 403);
  assert.equal(JSON.parse(await readFile(join(directory, `${invId}.json`), 'utf8')).paidAt, null);
  assert.deepEqual(await readdir(directory), [`${invId}.json`]);
});

test('Concurrent callbacks serialize the invoice and a retried callback receives the same acknowledgment', async (t) => {
  const { config, directory } = await temporaryConfig(t);
  const { invId } = await createDonation({ preset: 'medium', locale: 'ru' }, config);
  const raw = notification(config, invId, 'medium');
  const outcomes = await Promise.allSettled([acceptDonationResult(raw, config), acceptDonationResult(raw, config)]);
  assert.ok(outcomes.some((result) => result.status === 'fulfilled' && result.value === `OK${invId}`));
  outcomes.forEach((result) => { if (result.status === 'rejected') assert.equal(result.reason.status, 409); });
  assert.equal(await acceptDonationResult(raw, config), `OK${invId}`);
  assert.deepEqual(await readdir(directory), [`${invId}.json`]);
});

async function exerciseHttp(base, config) {
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  const result = await fetch(`${base}/api/donations`);
  assert.deepEqual(await result.json(), publicDonationConfig(config));
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${base}/api/donations`, { headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await post('/api/donations', JSON.stringify({ preset: 'small', locale: 'en' }), { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await post('/api/donations', '{}', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/donations', 'x'.repeat(8193))).status, 413);
  const createdResponse = await post('/api/donations', JSON.stringify({ preset: 'small', locale: 'en' }));
  assert.equal(createdResponse.status, config.enabled ? 200 : 503);
  if (!config.enabled) return;
  const { invId, url } = await createdResponse.json();
  assert.equal(new URL(url).origin, 'https://auth.robokassa.ru');
  assert.equal((await fetch(`${base}/api/donation-result`)).status, 405);
  assert.equal((await post('/api/donation-result', '{}')).status, 415);
  const callback = await post('/api/donation-result', notification(config, invId), { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://provider.example' });
  assert.equal(callback.status, 200);
  assert.equal(await callback.text(), `OK${invId}`);
  assert.equal(callback.headers.get('content-type'), 'text/plain; charset=utf-8');
}

test('Node HTTP donations require no Jira config, enforce origin/body limits and accept signature-authenticated callbacks', async (t) => {
  const { config } = await temporaryConfig(t);
  for (const donationConfig of [readDonationConfig({}), config]) {
    const server = createProxyServer({ config: readConfig({}), donationConfig });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try { await exerciseHttp(`http://127.0.0.1:${server.address().port}`, donationConfig); }
    finally { await new Promise((resolve) => server.close(resolve)); }
  }
});

test('PHP HTTP uses the same standalone donation contract and callback authentication', async (t) => {
  const { config, env } = await temporaryConfig(t);
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const process = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=0', '-S', `127.0.0.1:${port}`, 'tests/proxy-php-http-router.php'], {
    env: { ...globalThis.process.env, ...env, TASKMAP_JIRA_HOSTS: '', TASKMAP_PUBLIC_ORIGIN: '' }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  t.after(async () => { if (process.exitCode === null) { process.kill('SIGTERM'); await once(process, 'exit'); } });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Synthetic PHP server did not start.')), 5000);
    process.on('error', (error) => { clearTimeout(timeout); reject(error); });
    process.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Synthetic PHP server exited: ${code}`)); });
    process.stderr.on('data', (chunk) => { if (chunk.toString().includes('Development Server')) { clearTimeout(timeout); resolve(); } });
  });
  await exerciseHttp(`http://127.0.0.1:${port}`, config);
});
