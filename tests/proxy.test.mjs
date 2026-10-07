import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { readConfig, validateEnvelope, isPublicAddress, validateAddresses, validateBrowserRequest,
  formatUpstreamResponse, formatMediaResponse, MAX_BODY_BYTES, MAX_RESPONSE_BYTES } from '../server/proxy-policy.js';
import { createProxyServer } from '../server/proxy-server.js';

const fixtures = JSON.parse(readFileSync(new URL('./proxy-policy-fixtures.json', import.meta.url)));
const config = readConfig({ TASKMAP_JIRA_HOSTS: fixtures.hosts });
const base = { url: 'https://example.atlassian.net/rest/api/3/myself', auth: { username: 'person@example.com', password: 'synthetic-api-token' } };

for (const fixture of fixtures.envelopes) {
  test(`Node policy: ${fixture.name}`, () => {
    const input = { ...base, ...fixture.patch };
    const fixtureConfig = Object.hasOwn(fixture, 'hosts') ? readConfig({ TASKMAP_JIRA_HOSTS: fixture.hosts }) : config;
    if (fixture.status === 200) assert.ok(validateEnvelope(input, fixtureConfig, { media: fixture.media }));
    else assert.throws(() => validateEnvelope(input, fixtureConfig, { media: fixture.media }), (error) => error.status === fixture.status);
  });
}

test('Public addresses: IPv4, IPv6, private and reserved ranges', () => {
  for (const fixture of fixtures.addresses) assert.equal(isPublicAddress(fixture.address), fixture.public, fixture.address);
  assert.throws(() => validateAddresses([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), { status: 403 });
  assert.throws(() => validateAddresses([]), { status: 502 });
});

test('Configuration denies outbound by default and rejects wildcard hosts', () => {
  assert.throws(() => validateEnvelope(base, readConfig({})), { status: 503 });
  assert.throws(() => validateEnvelope({}, readConfig({})), { status: 400 });
  for (const host of ['*.atlassian.net', 'https://jira.example.com', '127.0.0.1', 'localhost', 'jira.example.com:443']) {
    assert.throws(() => readConfig({ TASKMAP_JIRA_HOSTS: host }));
  }
});

test('Browser origin and fetch metadata checks reject cross-origin requests', () => {
  validateBrowserRequest({ origin: 'http://localhost:3000', host: 'localhost:3000', 'sec-fetch-site': 'same-origin' }, config);
  assert.throws(() => validateBrowserRequest({ origin: 'https://attacker.example', host: 'localhost:3000' }, config), { status: 403 });
  assert.throws(() => validateBrowserRequest({ host: 'localhost:3000', 'sec-fetch-site': 'cross-site' }, config), { status: 403 });
  const explicit = readConfig({ TASKMAP_PUBLIC_ORIGIN: 'https://app.example.com' });
  validateBrowserRequest({ origin: 'https://app.example.com', host: 'localhost:8080' }, explicit);
  assert.throws(() => validateBrowserRequest({ origin: 'http://localhost:8080', host: 'localhost:8080' }, explicit), { status: 403 });
});

test('Basic and bearer tokens are validated and cannot appear in responses', () => {
  const request = validateEnvelope(base, config);
  assert.equal(request.authorization, `Basic ${Buffer.from('person@example.com:synthetic-api-token').toString('base64')}`);
  const bearer = validateEnvelope({ url: base.url, token: 'synthetic-bearer-token' }, config);
  assert.equal(bearer.authorization, 'Bearer synthetic-bearer-token');
  assert.throws(() => validateEnvelope({ url: base.url, token: 'synthetic_token\nheader' }, config), { status: 400 });
  const raw = JSON.stringify({ authorization: request.authorization, token: base.auth.password, [base.auth.password]: 'value' });
  const response = formatUpstreamResponse(401, raw, request.secrets);
  assert.ok(!response.includes(base.auth.password));
  assert.ok(!response.includes(request.authorization));
  assert.ok(JSON.parse(response).fromProxy);
  const escaped = 'a\\"secret';
  assert.equal(JSON.parse(formatUpstreamResponse(200, JSON.stringify({ value: escaped }), [escaped])).value, '[redacted]');
});

test('Upstream JSON shape, errors, redirects and empty responses', () => {
  assert.deepEqual(JSON.parse(formatUpstreamResponse(404, '{"errorMessages":["Not found"]}')), { errorMessages: ['Not found'], fromProxy: true });
  assert.deepEqual(JSON.parse(formatUpstreamResponse(200, '[]')), []);
  assert.equal(formatUpstreamResponse(204, ''), '');
  assert.match(formatUpstreamResponse(302, 'private redirect body'), /redirects are not followed/);
  assert.ok(!formatUpstreamResponse(500, '<html>private-upstream-value</html>').includes('private-upstream-value'));
});

test('PHP policy has the same rejection matrix and pins HTTPS connections', () => {
  const result = spawnSync('php', ['tests/proxy-php-runner.php'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const php = JSON.parse(result.stdout);
  fixtures.envelopes.forEach((fixture, i) => assert.equal(php.envelopes[i].status, fixture.status, `PHP: ${fixture.name}`));
  fixtures.addresses.forEach((fixture, i) => assert.equal(php.addresses[i], fixture.public, `PHP: ${fixture.address}`));
  assert.equal(php.mixedDnsStatus, 403);
  assert.equal(php.emptyDnsStatus, 502);
  assert.equal(php.transport.redirects, false);
  assert.equal(php.transport.proxy, '');
  assert.deepEqual(php.transport.pin, ['example.atlassian.net:443:8.8.8.8']);
  assert.equal(php.transport.verifyPeer, true);
  assert.equal(php.transport.verifyHost, 2);
  assert.equal(php.transport.timeout, 25000);
  assert.deepEqual(php.arrayResponse, []);
  assert.deepEqual(php.objectResponse, { errorMessages: ['Not found'], fromProxy: true });
  assert.ok(!php.redactedResponse.includes(base.auth.password));
  assert.ok(!php.redactedResponse.includes('Basic '));
  assert.ok(!JSON.stringify(php.nonJsonResponse).includes('private-upstream-value'));
  assert.match(php.redirectResponse.error, /redirects are not followed/);
  assert.equal(php.noContentResponse, '');
  assert.match(php.mediaUrl, /\?redirect=false$/);
  assert.equal(php.mediaMime, 'image/png');
  assert.deepEqual(Buffer.from(php.mediaBytes, 'base64'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.deepEqual(php.mediaRejections, { svg: 502, html: 502, secret: 502, oversize: 502 });
});

test('Media responses preserve binary PNG and reject active content, MIME mismatch, credentials and size overflow', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const request = validateEnvelope({ ...base, url: 'https://example.atlassian.net/rest/api/3/attachment/content/123?redirect=true' }, config, { media: true });
  assert.equal(request.url.search, '?redirect=false');
  assert.deepEqual(formatMediaResponse(200, png, 'image/png', request.secrets).body, png);
  assert.throws(() => formatMediaResponse(200, '<svg onload="alert(1)"/>', 'image/svg+xml'), { status: 502 });
  assert.throws(() => formatMediaResponse(200, '<html>private-upstream-value</html>', 'image/png'), { status: 502 });
  assert.throws(() => formatMediaResponse(200, Buffer.concat([png, Buffer.from(base.auth.password)]), 'image/png', request.secrets), { status: 502 });
  assert.throws(() => formatMediaResponse(200, Buffer.alloc(MAX_RESPONSE_BYTES + 1), 'image/png'), { status: 502 });
  const redirect = formatMediaResponse(303, 'private redirect response', 'image/png');
  assert.equal(redirect.status, 303);
  assert.ok(!redirect.body.includes('private redirect response'));
});

test('Local media HTTP uses authenticated GET without redirects and blocks private DNS', async (t) => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  let address = '8.8.8.8';
  let upstreamCalls = 0;
  const server = createProxyServer({ config,
    resolveHost: async () => ({ address, family: 4 }),
    upstreamRequest: async (request) => {
      upstreamCalls++;
      assert.equal(request.media, true);
      assert.equal(request.method, 'GET');
      assert.equal(request.url.search, '?redirect=false');
      assert.ok(request.authorization.startsWith('Basic '));
      return { status: 200, body: png, contentType: 'image/png' };
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/jira-media`;
  const payload = JSON.stringify({ ...base, url: 'https://example.atlassian.net/rest/api/3/attachment/content/123' });
  const post = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
  assert.equal((await fetch(url)).status, 405);
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  address = '127.0.0.1';
  assert.equal((await post()).status, 403);
  assert.equal(upstreamCalls, 1);
});

test('Local Node HTTP integration rejects invalid requests before contacting upstream', async (t) => {
  let upstreamCalls = 0;
  let dnsCalls = 0;
  let observed;
  const server = createProxyServer({ config,
    resolveHost: async () => { dnsCalls++; return { address: '8.8.8.8', family: 4 }; },
    upstreamRequest: async (request, address) => {
      upstreamCalls++;
      observed = { request, address };
      return { status: 404, body: '{"errorMessages":["Synthetic missing issue"]}' };
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${url}/api/jira-proxy`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  assert.equal((await fetch(`${url}/api/jira-proxy`, { method: 'OPTIONS' })).status, 405);
  assert.equal((await fetch(`${url}/api/unknown`)).status, 404);
  assert.equal((await post('{}', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('{invalid')).status, 400);
  assert.equal((await post(JSON.stringify(base), { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await post(JSON.stringify({ ...base, method: 'TRACE' }))).status, 405);
  assert.equal((await post(JSON.stringify({ ...base, url: 'https://127.0.0.1/rest/api/3/myself' }))).status, 403);
  assert.equal((await post('x'.repeat(MAX_BODY_BYTES + 1))).status, 413);
  assert.equal(dnsCalls, 0);
  assert.equal(upstreamCalls, 0);
  const response = await post(JSON.stringify(base), { Origin: url });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { errorMessages: ['Synthetic missing issue'], fromProxy: true });
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(dnsCalls, 1);
  assert.equal(upstreamCalls, 1);
  assert.equal(observed.address.address, '8.8.8.8');
  assert.equal(observed.request.method, 'GET');
});

test('Local PHP HTTP handler rejects malformed, oversized, cross-origin and forbidden requests', async (t) => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const process = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=0', '-S', `127.0.0.1:${port}`, 'tests/proxy-php-http-router.php'], {
    env: { ...globalThis.process.env, TASKMAP_JIRA_HOSTS: '', TASKMAP_PUBLIC_ORIGIN: '' }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  t.after(async () => {
    if (process.exitCode !== null) return;
    process.kill('SIGTERM');
    await once(process, 'exit');
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PHP HTTP server did not start.')), 5000);
    process.on('error', (error) => { clearTimeout(timeout); reject(error); });
    process.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`PHP HTTP server exited: ${code}`)); });
    process.stderr.on('data', (chunk) => {
      if (chunk.toString().includes('Development Server')) { clearTimeout(timeout); resolve(); }
    });
  });
  const url = `http://127.0.0.1:${port}/api/jira-proxy`;
  const post = (body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  const health = await fetch(url);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'OK', jiraConfigured: false });
  assert.equal((await fetch(url, { method: 'OPTIONS' })).status, 405);
  assert.equal((await post('{}', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('{invalid')).status, 400);
  assert.equal((await post(JSON.stringify(base), { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await post(JSON.stringify(base), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post(JSON.stringify({ ...base, method: 'CONNECT' }))).status, 405);
  assert.equal((await post('x'.repeat(MAX_BODY_BYTES + 1))).status, 413);
  const blocked = await post(JSON.stringify(base));
  assert.equal(blocked.status, 503);
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  const response = await blocked.text();
  assert.ok(!response.includes(base.url));
  assert.ok(!response.includes(base.auth.password));
  const mediaUrl = url.replace('jira-proxy', 'jira-media');
  assert.equal((await fetch(mediaUrl)).status, 405);
  const media = await fetch(mediaUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, url: 'https://example.atlassian.net/rest/api/3/attachment/content/123' }) });
  assert.equal(media.status, 503);
  assert.equal(media.headers.get('cache-control'), 'private, no-store');
  assert.equal(media.headers.get('cross-origin-resource-policy'), 'same-origin');
});
