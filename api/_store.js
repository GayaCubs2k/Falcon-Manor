// CMS storage: Vercel Blob when BLOB_READ_WRITE_TOKEN is set, or a local folder (FM_LOCAL_STORE) for development.
// Layout: cms/content/v-<time>-<id>.json (every published version), media/* (uploads),
// leads/<id>/<time>.json (registrations, encrypted at rest).
import { put, list, del } from '@vercel/blob';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const LOCAL = process.env.FM_LOCAL_STORE || '';
export const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const storeReady = () => hasBlob() || !!LOCAL;
const rand = () => crypto.randomBytes(5).toString('hex');
const KEEP_VERSIONS = 60;

// ---------- the two backends ----------
async function write(pathname, body, contentType) {
  if (hasBlob()) return put(pathname, body, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });
  const file = path.join(LOCAL, pathname);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
  return { url: '/__local/' + pathname, pathname };
}
async function walk(dir, base, out) {
  let names = [];
  try { names = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of names) {
    const full = path.join(dir, d.name), rel = base ? base + '/' + d.name : d.name;
    if (d.isDirectory()) await walk(full, rel, out);
    else { const st = await fs.stat(full); out.push({ url: '/__local/' + rel, pathname: rel, size: st.size, uploadedAt: st.mtimeMs }); }
  }
  return out;
}
export async function listFiles(prefix) {
  if (hasBlob()) {
    let out = [], cursor;
    do {
      const r = await list({ prefix, cursor, limit: 1000 });
      out = out.concat(r.blobs.map((b) => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: new Date(b.uploadedAt).getTime() })));
      cursor = r.hasMore ? r.cursor : null;
    } while (cursor);
    return out;
  }
  if (!LOCAL) return [];
  const all = await walk(path.join(LOCAL, prefix.split('/').slice(0, -1).join('/')), prefix.split('/').slice(0, -1).join('/'), []);
  return all.filter((f) => f.pathname.startsWith(prefix));
}
async function read(item) {
  if (hasBlob()) {
    const r = await fetch(item.url, { cache: 'no-store' });
    if (!r.ok) throw new Error('Could not read ' + item.pathname + ' (' + r.status + ')');
    return Buffer.from(await r.arrayBuffer());
  }
  return fs.readFile(path.join(LOCAL, item.pathname));
}
export async function removeFiles(items) {
  if (!items.length) return;
  if (hasBlob()) return del(items.map((i) => i.url));
  for (const i of items) await fs.rm(path.join(LOCAL, i.pathname), { force: true });
}

// ---------- published content ----------
let cache = { t: 0, doc: undefined };
export async function listVersions() {
  const items = await listFiles('cms/content/');
  return items.map((i) => ({ ...i, ts: +(/v-(\d+)/.exec(i.pathname) || [])[1] || i.uploadedAt })).sort((a, b) => b.ts - a.ts);
}
// The latest published content, cached briefly per instance
export async function getContent(fresh) {
  if (!storeReady()) return null;
  if (!fresh && cache.doc !== undefined && Date.now() - cache.t < 15000) return cache.doc;
  const v = (await listVersions())[0];
  const doc = v ? JSON.parse((await read(v)).toString('utf8')) : null;
  cache = { t: Date.now(), doc };
  return doc;
}
export async function readVersion(pathname) {
  const v = (await listVersions()).find((x) => x.pathname === pathname);
  return v ? JSON.parse((await read(v)).toString('utf8')) : null;
}
export async function saveContent(content, meta) {
  const ts = Date.now();
  const doc = { ...content, _meta: { savedAt: ts, note: String(meta.note || '').slice(0, 140) } };
  await write(`cms/content/v-${ts}-${rand()}.json`, JSON.stringify(doc), 'application/json');
  cache = { t: Date.now(), doc };
  const old = (await listVersions()).slice(KEEP_VERSIONS);
  if (old.length) await removeFiles(old);
  return doc;
}

// ---------- uploads ----------
export async function listMedia() {
  return (await listFiles('media/')).sort((a, b) => b.uploadedAt - a.uploadedAt);
}
export async function deleteMedia(url) {
  const item = (await listFiles('media/')).find((f) => f.url === url);
  if (!item) return false;
  await removeFiles([item]);
  return true;
}
export async function writeLocalMedia(name, buf) {
  const safe = String(name).toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/^-+/, '').slice(-80) || 'file';
  return write(`media/${rand()}-${safe}`, buf);
}

// ---------- registrations (encrypted at rest) ----------
function leadKey() {
  return crypto.createHash('sha256').update('fm-leads:' + (process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || 'local-dev')).digest();
}
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', leadKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
}
function open(buf) {
  const o = JSON.parse(buf.toString('utf8')), d = crypto.createDecipheriv('aes-256-gcm', leadKey(), Buffer.from(o.iv, 'base64'));
  d.setAuthTag(Buffer.from(o.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(o.data, 'base64')), d.final()]).toString('utf8'));
}
const validId = (id) => /^[a-z0-9]{6,40}$/.test(String(id));
export async function addLead(lead) {
  const id = Date.now().toString(36) + rand();
  const rec = { ...lead, id, createdAt: Date.now(), status: 'new', note: '' };
  await write(`leads/${id}/${Date.now()}.json`, seal(rec), 'application/json');
  return rec;
}
async function latestPerLead(items) {
  const byId = {};
  for (const it of items) {
    const m = /^leads\/([a-z0-9]+)\/(\d+)\.json$/.exec(it.pathname);
    if (!m) continue;
    if (!byId[m[1]] || +m[2] > byId[m[1]].t) byId[m[1]] = { t: +m[2], it };
  }
  return byId;
}
export async function listLeads() {
  const byId = await latestPerLead(await listFiles('leads/'));
  const ids = Object.keys(byId), out = [];
  for (let i = 0; i < ids.length; i += 8) {
    const chunk = await Promise.all(ids.slice(i, i + 8).map(async (id) => {
      try { return open(await read(byId[id].it)); } catch { return { id, createdAt: byId[id].t, status: 'unreadable', note: 'This entry could not be decrypted (the ADMIN_SECRET may have changed).' }; }
    }));
    out.push(...chunk);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
export async function updateLead(id, patch) {
  if (!validId(id)) return null;
  const items = await listFiles(`leads/${id}/`), byId = await latestPerLead(items);
  if (!byId[id]) return null;
  const cur = open(await read(byId[id].it));
  const next = { ...cur, status: patch.status || cur.status, note: patch.note != null ? String(patch.note).slice(0, 2000) : cur.note, updatedAt: Date.now() };
  await write(`leads/${id}/${Date.now()}.json`, seal(next), 'application/json');
  await removeFiles(items);
  return next;
}
export async function deleteLead(id) {
  if (!validId(id)) return false;
  const items = await listFiles(`leads/${id}/`);
  await removeFiles(items);
  return items.length > 0;
}
