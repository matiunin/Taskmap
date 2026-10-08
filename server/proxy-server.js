import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import { readDonationConfig, publicDonationConfig, createDonation, acceptDonationResult, DONATION_BODY_LIMIT } from './donations.js';
import { MAX_BODY_BYTES, MAX_RESPONSE_BYTES, UPSTREAM_TIMEOUT_MS, ProxyError,
  readConfig, validateBrowserRequest, validateEnvelope, validateAddresses, formatUpstreamResponse, formatMediaResponse } from './proxy-policy.js';

export async function resolvePublicHost(hostname) {
  let timer;
  try {
    return validateAddresses(await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new ProxyError(504, 'Jira DNS resolution timed out.')), 5000); }),
    ]));
  } catch (error) {
    if (error instanceof ProxyError) throw error;
    throw new ProxyError(502, 'Jira DNS resolution failed.');
  } finally { clearTimeout(timer); }
}

export function sendUpstream(request, address) {
  return new Promise((resolve, reject) => {
    // Connect to the validated address while retaining the hostname for TLS/SNI and Host.
    // agent:false prevents reuse of sockets resolved for a previous request.
    const upstream = https.request(request.url, {
      method: request.method,
      agent: false,
      lookup: (_hostname, options, callback) => callback(null,
        options.all ? [{ address: address.address, family: address.family }] : address.address,
        address.family),
      headers: {
        Accept: request.media ? 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif' : 'application/json',
        'Content-Type': 'application/json',
        Authorization: request.authorization,
        ...(request.body === undefined ? {} : { 'Content-Length': Buffer.byteLength(request.body) }),
      },
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) upstream.destroy(new ProxyError(502, 'Jira response is too large.'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode || 502, body: Buffer.concat(chunks), contentType: response.headers['content-type'] || '' }));
      response.on('error', () => reject(new ProxyError(502, 'Jira response failed.')));
    });
    const timer = setTimeout(() => upstream.destroy(new ProxyError(504, 'Jira request timed out.')), UPSTREAM_TIMEOUT_MS);
    upstream.on('close', () => clearTimeout(timer));
    upstream.on('error', (error) => reject(error instanceof ProxyError ? error : new ProxyError(502, 'Jira request failed.')));
    if (request.body !== undefined) upstream.write(request.body);
    upstream.end();
  });
}

async function readLimitedBody(request, maximum = MAX_BODY_BYTES) {
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') throw new ProxyError(415, 'Compressed bodies are not supported.');
  if (Number(request.headers['content-length']) > maximum) throw new ProxyError(413, 'Request body is too large.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximum) throw new ProxyError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new ProxyError(400, 'Invalid request encoding.'); }
}

async function readJson(request, maximum = MAX_BODY_BYTES) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || '')) {
    throw new ProxyError(415, 'Content-Type must be application/json.');
  }
  const raw = await readLimitedBody(request, maximum);
  try { return JSON.parse(raw); } catch { throw new ProxyError(400, 'Invalid JSON.'); }
}

export function createProxyServer({ config = readConfig(), resolveHost = resolvePublicHost, upstreamRequest = sendUpstream,
  donationConfig = readDonationConfig() } = {}) {
  const server = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const finish = (status, body) => { response.statusCode = status; response.end(body); };
    try {
      const path = (request.url || '').split('?')[0];
      if (['/api/donations', '/api/donations.php'].includes(path)) {
        validateBrowserRequest(request.headers, config, request.socket.encrypted);
        if (request.method === 'GET') return finish(200, JSON.stringify(publicDonationConfig(donationConfig)));
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'GET, POST');
          throw new ProxyError(405, 'Only GET and POST are supported.');
        }
        return finish(200, JSON.stringify(await createDonation(await readJson(request, DONATION_BODY_LIMIT), donationConfig)));
      }
      if (['/api/donation-result', '/api/donation-result.php'].includes(path)) {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          throw new ProxyError(405, 'Only POST is supported.');
        }
        if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || '')) {
          throw new ProxyError(415, 'Content-Type must be application/x-www-form-urlencoded.');
        }
        const acknowledgment = await acceptDonationResult(await readLimitedBody(request, DONATION_BODY_LIMIT), donationConfig);
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return finish(200, acknowledgment);
      }
      if (request.method === 'GET' && ['/api/health', '/test', '/api/jira-proxy', '/api/jira-proxy.php'].includes(path)) {
        return finish(200, JSON.stringify({ status: 'OK', jiraConfigured: config.hosts.size > 0 }));
      }
      const media = ['/api/jira-media', '/api/jira-media.php'].includes(path);
      if (!media && !['/api/jira-proxy', '/api/jira-proxy.php'].includes(path)) throw new ProxyError(404, 'Endpoint not found.');
      if (request.method !== 'POST') {
        response.setHeader('Allow', media ? 'POST' : 'GET, POST');
        throw new ProxyError(405, 'Only POST is supported for Jira requests.');
      }
      validateBrowserRequest(request.headers, config, request.socket.encrypted);
      const envelope = validateEnvelope(await readJson(request), config, { media });
      const address = await resolveHost(envelope.url.hostname);
      // Validate custom resolvers too; tests cannot accidentally enable private destinations.
      validateAddresses([address]);
      const result = await upstreamRequest(envelope, address);
      if (media) {
        const safe = formatMediaResponse(result.status, result.body, result.contentType, envelope.secrets);
        response.setHeader('Content-Type', safe.contentType);
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        return finish(safe.status, safe.body);
      }
      return finish(result.status, envelope.method === 'HEAD' ? '' : formatUpstreamResponse(result.status, result.body.toString(), envelope.secrets));
    } catch (error) {
      const known = error instanceof ProxyError;
      finish(known ? error.status : 502, JSON.stringify({ error: known ? error.message : 'Request failed.', fromProxy: true }));
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.timeout = 40000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.TASKMAP_PROXY_PORT || 3004);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid TASKMAP_PROXY_PORT.');
    createProxyServer().listen(port, '127.0.0.1', () => {
      console.log(`Taskmap Jira proxy listening on http://127.0.0.1:${port}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
