// Admin API for /admin. One endpoint, the action in ?a=…; everything but session and login needs a signed-in admin.
import { handleUpload } from '@vercel/blob/client';
import { authReady, checkPassword, startSession, endSession, isAdmin, sameOrigin, clientIp, limited } from './_auth.js';
import { hasBlob, storeReady, getContent, listVersions, readVersion, saveContent, listMedia, deleteMedia, writeLocalMedia, listLeads, updateLead, deleteLead } from './_store.js';
import { clean } from './_content.js';

const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf'];
const send = (res, code, body) => res.status(code).json(body);

function status() {
  return { password: authReady(), store: storeReady(), blob: hasBlob(), local: !hasBlob() && storeReady(), ai: !!process.env.ANTHROPIC_API_KEY, secret: !!process.env.ADMIN_SECRET };
}
function readRaw(req) {
  return new Promise((ok, fail) => { const parts = []; let n = 0; req.on('data', (c) => { n += c.length; if (n > 20e6) { fail(new Error('too large')); req.destroy(); } else parts.push(c); }); req.on('end', () => ok(Buffer.concat(parts))); req.on('error', fail); });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const a = String((req.query && req.query.a) || '');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const post = req.method === 'POST' || req.method === 'PUT';
  if (post && !sameOrigin(req)) return send(res, 403, { error: 'Requests must come from this site.' });

  try {
    if (a === 'session') return send(res, 200, { configured: status(), authed: isAdmin(req) });
    if (a === 'login' && post) {
      if (!authReady()) return send(res, 503, { error: 'Set ADMIN_PASSWORD in the Vercel project first.' });
      if (limited('login:' + clientIp(req), 6, 10 * 60e3)) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      if (!checkPassword(String(body.password || ''))) return send(res, 401, { error: 'That password is not correct.' });
      startSession(res);
      return send(res, 200, { ok: true });
    }
    if (a === 'logout' && post) { endSession(res); return send(res, 200, { ok: true }); }

    if (!isAdmin(req)) return send(res, 401, { error: 'Please sign in again.' });
    if (!storeReady()) return send(res, 503, { error: 'Storage is not connected. Add a Vercel Blob store to the project.' });

    if (a === 'content' && req.method === 'GET') {
      const [content, versions] = await Promise.all([getContent(true), listVersions()]);
      return send(res, 200, { content, versions: versions.map((v) => ({ pathname: v.pathname, ts: v.ts, size: v.size })) });
    }
    if (a === 'version' && req.method === 'GET') {
      const doc = await readVersion(String(req.query.p || ''));
      return doc ? send(res, 200, { content: doc }) : send(res, 404, { error: 'That version no longer exists.' });
    }
    if (a === 'save' && post) {
      if (JSON.stringify(body.content || {}).length > 1.5e6) return send(res, 413, { error: 'The content is too large to save.' });
      const doc = await saveContent(clean(body.content), { note: body.note });
      return send(res, 200, { ok: true, savedAt: doc._meta.savedAt });
    }
    if (a === 'restore' && post) {
      const old = await readVersion(String(body.pathname || ''));
      if (!old) return send(res, 404, { error: 'That version no longer exists.' });
      const doc = await saveContent(clean(old), { note: 'Restored the version from ' + new Date(old._meta ? old._meta.savedAt : Date.now()).toISOString() });
      return send(res, 200, { ok: true, savedAt: doc._meta.savedAt });
    }
    if (a === 'leads' && req.method === 'GET') return send(res, 200, { leads: await listLeads() });
    if (a === 'lead' && post) {
      const status = ['new', 'contacted', 'closed'].includes(body.status) ? body.status : undefined;
      const rec = await updateLead(String(body.id || ''), { status, note: body.note });
      return rec ? send(res, 200, { lead: rec }) : send(res, 404, { error: 'That registration was not found.' });
    }
    if (a === 'lead-delete' && post) return (await deleteLead(String(body.id || ''))) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'That registration was not found.' });
    if (a === 'media' && req.method === 'GET') return send(res, 200, { files: await listMedia() });
    if (a === 'media-delete' && post) return (await deleteMedia(String(body.url || ''))) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'That file was not found.' });

    // Uploads go straight from the browser to Vercel Blob; this hands out a short-lived token
    if (a === 'upload' && post) {
      if (!hasBlob()) return send(res, 503, { error: 'Uploads need a Vercel Blob store.' });
      const out = await handleUpload({
        body, request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!/^media\/[\w.\-]+$/.test(pathname)) throw new Error('Invalid file name.');
          return { allowedContentTypes: UPLOAD_TYPES, maximumSizeInBytes: 25 * 1024 * 1024, addRandomSuffix: true };
        }
      });
      return send(res, 200, out);
    }
    // Local development only: the file arrives in the request body
    if (a === 'upload-local' && req.method === 'PUT') {
      if (hasBlob()) return send(res, 400, { error: 'Use the Blob upload.' });
      const type = String(req.headers['content-type'] || '');
      if (!UPLOAD_TYPES.includes(type)) return send(res, 415, { error: 'That file type is not allowed.' });
      const buf = Buffer.isBuffer(req.body) ? req.body : await readRaw(req);
      const r = await writeLocalMedia(String(req.query.name || 'file'), buf);
      return send(res, 200, { url: r.url, pathname: r.pathname });
    }
    return send(res, 404, { error: 'Unknown action.' });
  } catch (err) {
    console.error('admin:', a, err && err.message);
    return send(res, 500, { error: 'Something went wrong: ' + (err && err.message ? err.message : 'unknown error') });
  }
}
