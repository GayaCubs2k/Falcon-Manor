// Admin sign-in: one password (ADMIN_PASSWORD) and a signed, HttpOnly session cookie.
import crypto from 'node:crypto';

const COOKIE = 'fm_admin';
const HOURS = 8;
export const authReady = () => !!process.env.ADMIN_PASSWORD;
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
const secret = () => hash('fm-session:' + (process.env.ADMIN_SECRET || '') + ':' + (process.env.ADMIN_PASSWORD || ''));
const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export function checkPassword(pw) {
  return authReady() && crypto.timingSafeEqual(hash('pw:' + pw), hash('pw:' + process.env.ADMIN_PASSWORD));
}
export function startSession(res) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + HOURS * 3600e3 })).toString('base64url');
  res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${HOURS * 3600}`);
}
export function endSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}
export function isAdmin(req) {
  if (!authReady()) return false;
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)').exec(req.headers.cookie || '');
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp > Date.now(); } catch { return false; }
}
// Requests that change anything must come from this site's own pages
export function sameOrigin(req) {
  try { return new URL(req.headers.origin).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch { return false; }
}
export function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
}
// A light per-instance limiter: at most `max` calls per key within `ms`
const buckets = new Map();
export function limited(key, max, ms) {
  const now = Date.now(), recent = (buckets.get(key) || []).filter((t) => now - t < ms);
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 2000) buckets.delete(buckets.keys().next().value);
  return recent.length > max;
}
