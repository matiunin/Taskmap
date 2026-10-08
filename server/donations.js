import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ProxyError } from './proxy-policy.js';

export const DONATION_BODY_LIMIT = 8192;
export const DONATION_PRESETS = Object.freeze({ small: 490, medium: 2490, large: 3990 });
const MAX_INVOICE_ID = 9223372036854775807n;
const providerUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
const locales = ['ru', 'en', 'zh', 'ar', 'es'];

export function readDonationConfig(env = process.env) {
  const merchantLogin = env.TASKMAP_ROBOKASSA_MERCHANT_LOGIN || '';
  const password1 = env.TASKMAP_ROBOKASSA_PASSWORD1 || '';
  const password2 = env.TASKMAP_ROBOKASSA_PASSWORD2 || '';
  const algorithm = (env.TASKMAP_ROBOKASSA_HASH_ALGORITHM || 'md5').toLowerCase();
  const enabledValue = env.TASKMAP_DONATIONS_ENABLED || 'false';
  const testValue = env.TASKMAP_ROBOKASSA_TEST_MODE || 'true';
  const valid = ['true', 'false'].includes(enabledValue) && ['true', 'false'].includes(testValue)
    && /^[A-Za-z0-9._-]{1,100}$/.test(merchantLogin)
    && [password1, password2].every((value) => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f]/.test(value))
    && ['md5', 'sha256', 'sha512'].includes(algorithm);
  return { enabled: enabledValue === 'true' && valid, testMode: testValue !== 'false',
    merchantLogin, password1, password2, algorithm,
    dataDir: resolve(env.TASKMAP_DONATION_DATA_DIR || 'data/donations') };
}

export function publicDonationConfig(config) {
  return { enabled: config.enabled, currency: 'RUB', testMode: config.testMode,
    presets: config.enabled ? Object.entries(DONATION_PRESETS).map(([id, amount]) => ({ id, amount })) : [] };
}

export function validateDonationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !['preset', 'locale'].includes(key))
    || typeof input.preset !== 'string' || typeof input.locale !== 'string'
    || !Object.hasOwn(DONATION_PRESETS, input.preset) || !locales.includes(input.locale)) {
    throw new ProxyError(400, 'Invalid donation request.');
  }
  return { preset: input.preset, locale: input.locale };
}

export function validInvoiceId(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= MAX_INVOICE_ID;
}

export function amountInCents(value) {
  if (typeof value !== 'string') throw new ProxyError(400, 'Invalid payment notification.');
  const match = /^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,6}))?$/.exec(value);
  if (!match || /[1-9]/.test((match[2] || '').slice(2))) throw new ProxyError(400, 'Invalid payment notification.');
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0').slice(0, 2));
}

const signedParameters = (preset) => `Shp_kind=donation:Shp_preset=${preset}`;
export function checkoutSignature(config, outSum, invId, preset) {
  return createHash(config.algorithm).update(`${config.merchantLogin}:${outSum}:${invId}:${config.password1}:${signedParameters(preset)}`, 'utf8').digest('hex');
}
export function resultSignature(config, outSum, invId, preset) {
  return createHash(config.algorithm).update(`${outSum}:${invId}:${config.password2}:${signedParameters(preset)}`, 'utf8').digest('hex');
}

async function prepareStore(config) {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
}

export async function createDonation(input, config) {
  const { preset, locale } = validateDonationInput(input);
  if (!config.enabled) throw new ProxyError(503, 'Donations are not configured.');
  try { await prepareStore(config); } catch { throw new ProxyError(503, 'Donation storage is unavailable.'); }
  const amount = `${DONATION_PRESETS[preset]}.00`;
  let invId;
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = (randomBytes(8).readBigUInt64BE() & MAX_INVOICE_ID).toString();
    if (candidate === '0') continue;
    let handle;
    try {
      handle = await open(join(config.dataDir, `${candidate}.json`), 'wx', 0o600);
      const invoice = { invId: candidate, preset, amount, testMode: config.testMode,
        createdAt: new Date().toISOString(), paidAt: null };
      await handle.writeFile(JSON.stringify(invoice), 'utf8');
      await handle.sync();
      invId = candidate;
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw new ProxyError(503, 'Donation storage is unavailable.');
    } finally { await handle?.close(); }
  }
  if (!invId) throw new ProxyError(503, 'Could not create donation invoice.');
  const parameters = new URLSearchParams({ MerchantLogin: config.merchantLogin, OutSum: amount, InvId: invId,
    Description: 'Support Taskmap development', Culture: locale === 'ru' ? 'ru' : 'en', Encoding: 'utf-8',
    SignatureValue: checkoutSignature(config, amount, invId, preset), Shp_kind: 'donation', Shp_preset: preset });
  if (config.testMode) parameters.set('IsTest', '1');
  return { url: `${providerUrl}?${parameters}`, invId };
}

export function parseDonationResult(raw) {
  if (Buffer.byteLength(raw) > DONATION_BODY_LIMIT) throw new ProxyError(413, 'Payment notification is too large.');
  if (/%(?![0-9a-f]{2})/i.test(raw)) throw new ProxyError(400, 'Invalid payment notification.');
  const parameters = raw === '' ? [] : raw.split('&');
  if (parameters.length > 32) throw new ProxyError(400, 'Invalid payment notification.');
  const result = Object.create(null);
  for (const parameter of parameters) {
    const separator = parameter.indexOf('=');
    let key;
    let value;
    try {
      key = decodeURIComponent((separator < 0 ? parameter : parameter.slice(0, separator)).replace(/\+/g, ' '));
      value = decodeURIComponent((separator < 0 ? '' : parameter.slice(separator + 1)).replace(/\+/g, ' '));
    } catch { throw new ProxyError(400, 'Invalid payment notification.'); }
    if (Object.hasOwn(result, key) || /[\x00-\x1f\x7f]/.test(key + value)) throw new ProxyError(400, 'Invalid payment notification.');
    if (/^shp_/i.test(key) && !['Shp_kind', 'Shp_preset'].includes(key)) throw new ProxyError(400, 'Invalid payment notification.');
    result[key] = value;
  }
  if (!validInvoiceId(result.InvId) || result.Shp_kind !== 'donation' || !Object.hasOwn(DONATION_PRESETS, result.Shp_preset)
    || typeof result.SignatureValue !== 'string' || !/^[a-f0-9]{32,128}$/i.test(result.SignatureValue)) {
    throw new ProxyError(400, 'Invalid payment notification.');
  }
  amountInCents(result.OutSum);
  return result;
}

export async function acceptDonationResult(raw, config) {
  if (!config.enabled) throw new ProxyError(503, 'Donations are not configured.');
  const input = parseDonationResult(raw);
  const expectedSignature = resultSignature(config, input.OutSum, input.InvId, input.Shp_preset);
  const signature = input.SignatureValue.toLowerCase();
  if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new ProxyError(403, 'Invalid payment notification.');
  }
  if (Object.hasOwn(input, 'IsTest') && input.IsTest !== (config.testMode ? '1' : '0')) throw new ProxyError(403, 'Invalid payment notification.');
  try { await prepareStore(config); } catch { throw new ProxyError(503, 'Donation storage is unavailable.'); }
  const file = join(config.dataDir, `${input.InvId}.json`);
  const lock = `${file}.lock`;
  let handle;
  let temporary;
  try {
    // Exclusive per-invoice lock is shared with PHP. A leftover lock after a crash
    // fails closed; an operator may remove it after confirming no writer is active.
    handle = await open(lock, 'wx', 0o600);
    let invoice;
    try { invoice = JSON.parse(await readFile(file, 'utf8')); }
    catch { throw new ProxyError(404, 'Donation invoice was not found.'); }
    if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice)
      || Object.keys(invoice).length !== 6 || !['invId', 'preset', 'amount', 'testMode', 'createdAt', 'paidAt'].every((key) => Object.hasOwn(invoice, key))
      || typeof invoice.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(invoice.createdAt)
      || (invoice.paidAt !== null && (typeof invoice.paidAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(invoice.paidAt)))
      || invoice.invId !== input.InvId || invoice.preset !== input.Shp_preset
      || invoice.amount !== `${DONATION_PRESETS[invoice.preset]}.00` || invoice.testMode !== config.testMode
      || amountInCents(input.OutSum) !== amountInCents(invoice.amount)) throw new ProxyError(403, 'Invalid payment notification.');
    if (invoice.paidAt === null) {
      invoice.paidAt = new Date().toISOString();
      temporary = join(config.dataDir, `${input.InvId}.${randomBytes(6).toString('hex')}.tmp`);
      const updated = await open(temporary, 'wx', 0o600);
      try { await updated.writeFile(JSON.stringify(invoice), 'utf8'); await updated.sync(); }
      finally { await updated.close(); }
      await rename(temporary, file);
      temporary = undefined;
    }
    return `OK${input.InvId}`;
  } catch (error) {
    if (error instanceof ProxyError) throw error;
    if (error.code === 'EEXIST') throw new ProxyError(409, 'Donation invoice is being processed.');
    throw new ProxyError(503, 'Donation storage is unavailable.');
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    if (handle) { await handle.close(); await unlink(lock).catch(() => {}); }
  }
}
