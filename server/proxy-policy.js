import { BlockList, isIP } from 'node:net';

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const UPSTREAM_TIMEOUT_MS = 25000;

export class ProxyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const blocked = new BlockList();
for (const cidr of ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
  '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
  '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
  '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4']) {
  const [address, prefix] = cidr.split('/');
  blocked.addSubnet(address, Number(prefix), 'ipv4');
}
for (const cidr of ['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20', '2620:4f:8000::/48']) {
  const [address, prefix] = cidr.split('/');
  blocked.addSubnet(address, Number(prefix), 'ipv6');
}
const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  return family === 6 && globalIPv6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

const isHostname = (host) => typeof host === 'string' && host.length <= 253
  && !isIP(host) && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host);

export function readConfig(env = process.env) {
  const hosts = String(env.TASKMAP_JIRA_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (hosts.some((host) => !isHostname(host))) throw new Error('TASKMAP_JIRA_HOSTS must contain exact hostnames without URLs, ports, or wildcards.');
  const publicOrigin = env.TASKMAP_PUBLIC_ORIGIN || '';
  if (publicOrigin) {
    let origin;
    try { origin = new URL(publicOrigin); } catch { throw new Error('TASKMAP_PUBLIC_ORIGIN must be an HTTP(S) origin.'); }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== publicOrigin) {
      throw new Error('TASKMAP_PUBLIC_ORIGIN must be an HTTP(S) origin without a path.');
    }
  }
  return { hosts: new Set(hosts), publicOrigin };
}

export function validateBrowserRequest(headers, config, encrypted = false) {
  const fetchSite = headers['sec-fetch-site'];
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) throw new ProxyError(403, 'Cross-origin requests are not allowed.');
  const origin = headers.origin;
  if (origin) {
    const expected = config.publicOrigin || `${encrypted ? 'https' : 'http'}://${headers.host}`;
    if (origin !== expected) throw new ProxyError(403, 'Cross-origin requests are not allowed.');
  }
}

export function validateEnvelope(input, config, { media = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProxyError(400, 'Expected a JSON object.');
  const fields = media ? ['url', 'auth', 'token'] : ['url', 'method', 'auth', 'token', 'data'];
  if (Object.keys(input).some((key) => !fields.includes(key))) {
    throw new ProxyError(400, 'Unsupported request field.');
  }
  const method = input.method === undefined ? 'GET' : input.method;
  if (typeof method !== 'string' || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) {
    throw new ProxyError(405, 'Upstream method is not allowed.');
  }
  const rawUrl = input.url;
  if (typeof rawUrl !== 'string' || rawUrl.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(rawUrl)) {
    throw new ProxyError(400, 'Invalid Jira URL.');
  }
  let url;
  try { url = new URL(rawUrl); } catch { throw new ProxyError(400, 'Invalid Jira URL.'); }
  if (config.hosts.size === 0) throw new ProxyError(503, 'Configure TASKMAP_JIRA_HOSTS before using Jira.');
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')
    || !isHostname(url.hostname) || !config.hosts.has(url.hostname)) {
    throw new ProxyError(403, 'Jira URL is not allowed. Configure TASKMAP_JIRA_HOSTS with your exact Jira host.');
  }
  const rawPath = rawUrl.replace(/^https:\/\/[^/]+/i, '').split('?')[0];
  let path;
  try { path = decodeURIComponent(rawPath); } catch { throw new ProxyError(400, 'Invalid URL path.'); }
  if (!path || /[\\%\x00-\x20\x7f]/.test(path) || path.includes('//')
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path) || /%2f|%5c/i.test(rawPath)) {
    throw new ProxyError(403, 'Jira path is not allowed.');
  }
  const jiraRest = /^\/rest\/(?:api\/[23]|agile\/1\.0)\/[^?#]+$/.test(path);
  const tenantInfo = path === '/_edge/tenant_info' && method === 'GET';
  const automation = /^\/gateway\/api\/automation\/public\/jira\/[a-zA-Z0-9-]+\/rest\/v1\/rule\/manual\/(?:search|[a-zA-Z0-9-]+\/invocation)$/.test(path) && method === 'POST';
  if (media) {
    if (!/^(?:\/jira)?\/rest\/api\/[23]\/attachment\/content\/[0-9]{1,20}$/.test(path)) {
      throw new ProxyError(403, 'Jira attachment path is not allowed.');
    }
    for (const [key, value] of url.searchParams) {
      if (key === 'redirect' && ['true', 'false'].includes(value)) continue;
      throw new ProxyError(403, 'Jira attachment query is not allowed.');
    }
    // Jira can return attachment bytes directly; never follow signed CDN redirects.
    url.searchParams.set('redirect', 'false');
  } else if (!jiraRest && !tenantInfo && !automation) throw new ProxyError(403, 'Jira path is not allowed.');

  let authorization;
  let secrets;
  if (input.token !== undefined && input.auth !== undefined) throw new ProxyError(400, 'Choose one authentication method.');
  if (input.token !== undefined) {
    if (typeof input.token !== 'string' || !input.token || input.token.length > 8192 || /[\x00-\x20\x7f]/.test(input.token)) {
      throw new ProxyError(400, 'Invalid bearer token.');
    }
    authorization = `Bearer ${input.token}`;
    secrets = [input.token, authorization];
  } else {
    const auth = input.auth;
    if (!auth || typeof auth !== 'object' || Array.isArray(auth)
      || Object.keys(auth).some((key) => !['username', 'password'].includes(key))
      || typeof auth.username !== 'string' || !auth.username || auth.username.length > 320 || /[:\x00-\x1f\x7f]/.test(auth.username)
      || typeof auth.password !== 'string' || !auth.password || auth.password.length > 4096 || /[\x00-\x1f\x7f]/.test(auth.password)) {
      throw new ProxyError(400, 'Jira username and API token are required.');
    }
    const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    authorization = `Basic ${encoded}`;
    secrets = [auth.password, encoded, authorization];
  }
  const hasData = Object.hasOwn(input, 'data') && input.data !== null;
  if (hasData && ['GET', 'HEAD'].includes(method)) throw new ProxyError(400, 'GET and HEAD must not include data.');
  return { url, method, authorization, secrets, media, body: hasData ? JSON.stringify(input.data) : undefined };
}

export function validateAddresses(addresses) {
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > 64) throw new ProxyError(502, 'Jira DNS resolution failed.');
  if (addresses.some(({ address }) => !isPublicAddress(address))) throw new ProxyError(403, 'Jira must resolve only to public IP addresses.');
  return addresses[0];
}

export function formatUpstreamResponse(status, raw, secrets = []) {
  if (status === 204 || status === 304) return '';
  if (status >= 300 && status < 400) return JSON.stringify({ error: 'Jira redirects are not followed.', fromProxy: true });
  let payload;
  try { payload = JSON.parse(raw); } catch {
    return JSON.stringify({ error: 'Jira returned a non-JSON response.', fromProxy: true });
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) payload.fromProxy = true;
  const sorted = [...secrets].sort((a, b) => b.length - a.length);
  const redact = (text) => sorted.reduce((value, secret) => value.split(secret).join('[redacted]'), text);
  const sanitize = (value, depth = 0) => {
    if (depth > 512) throw new ProxyError(502, 'Jira response is too deeply nested.');
    if (typeof value === 'string') return redact(value);
    if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
    if (value && typeof value === 'object') {
      const result = Object.create(null);
      for (const [key, item] of Object.entries(value)) result[redact(key)] = sanitize(item, depth + 1);
      return result;
    }
    return value;
  };
  return JSON.stringify(sanitize(payload));
}

export function formatMediaResponse(status, raw, contentType, secrets = []) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (bytes.length > MAX_RESPONSE_BYTES) throw new ProxyError(502, 'Jira response is too large.');
  if (status < 200 || status >= 300) return {
    status, contentType: 'application/json; charset=utf-8', body: formatUpstreamResponse(status, bytes.toString('utf8'), secrets),
  };
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  const matches = {
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    'image/gif': ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')),
    'image/webp': bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP',
    'image/bmp': bytes.subarray(0, 2).toString('ascii') === 'BM',
    'image/avif': bytes.subarray(4, 8).toString('ascii') === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 32).toString('ascii')),
  };
  if (!matches[mime]) throw new ProxyError(502, 'Jira returned an unsupported or invalid image.');
  if (secrets.some((secret) => bytes.includes(Buffer.from(secret)))) throw new ProxyError(502, 'Jira returned an invalid image.');
  return { status, contentType: mime, body: bytes };
}
