// Local development server: serves the site the way Vercel does (vercel.json redirects, rewrites and headers,
// the api/ functions with Vercel's req/res helpers) and stores CMS content, uploads and registrations in a local folder.
// Usage: npm run dev   (PORT, FM_LOCAL_STORE, ADMIN_PASSWORD, ADMIN_SECRET, ANTHROPIC_API_KEY are read from the environment or .env.local)
import http from 'node:http';
import { promises as fs, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

// .env.local (never committed) for local secrets
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
process.env.FM_LOCAL_STORE ||= path.join(ROOT, '.local-store');
const PORT = +process.env.PORT || 3000;
const config = JSON.parse(readFileSync('vercel.json', 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary'
};

// Vercel path patterns: /:name, /:name(a|b), /(.*)
function compile(source) {
  const names = [];
  const re = source.replace(/[.+?^${}[\]\\]/g, '\\$&').replace(/:(\w+)(\([^)]*\))?|\((\.\*)\)/g, (_, name, group, star) => {
    if (star) { names.push(String(names.length)); return '(.*)'; }
    names.push(name);
    return group ? group : '([^/]+)';
  });
  const rx = new RegExp('^' + re + '$');
  return (p) => { const m = rx.exec(p); if (!m) return null; const out = {}; names.forEach((n, i) => { out[n] = decodeURIComponent(m[i + 1]); }); return out; };
}
const fill = (dest, params) => dest.replace(/:(\w+)/g, (_, n) => encodeURIComponent(params[n] ?? ''));
const redirects = (config.redirects || []).map((r) => ({ ...r, match: compile(r.source) }));
const rewrites = (config.rewrites || []).map((r) => ({ ...r, match: compile(r.source) }));
const headers = (config.headers || []).map((h) => ({ ...h, match: compile(h.source) }));

async function fileFor(p) {
  const safe = path.normalize(decodeURIComponent(p)).replace(/^([\\/])+/, '');
  if (safe.startsWith('..') || /(^|[\\/])(node_modules|\.git|\.env|\.local-store|scripts)([\\/]|$)/.test(safe)) return null;
  const full = path.join(ROOT, safe);
  try { const st = await fs.stat(full); if (st.isFile()) return full; } catch {}
  return null;
}

const fnCache = new Map();
async function runFunction(name, req, res, query) {
  const file = path.join(ROOT, 'api', name + '.js');
  if (name.startsWith('_') || !existsSync(file)) return false;
  if (!fnCache.has(file)) fnCache.set(file, (await import(pathToFileURL(file).href)).default);
  const handler = fnCache.get(file);

  req.query = query;
  const type = String(req.headers['content-type'] || '');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && (type.includes('json') || type.includes('text/plain') || type.includes('urlencoded'))) {
    const parts = []; for await (const c of req) parts.push(c);
    const raw = Buffer.concat(parts).toString('utf8');
    try { req.body = type.includes('urlencoded') ? Object.fromEntries(new URLSearchParams(raw)) : type.includes('json') ? (raw ? JSON.parse(raw) : {}) : raw; }
    catch { res.statusCode = 400; res.end('Invalid JSON'); return true; }
  }
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => {
    if (typeof b === 'object' && !Buffer.isBuffer(b)) return res.json(b);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(b); return res;
  };
  try { await handler(req, res); }
  catch (e) { console.error('api/' + name + ':', e); if (!res.headersSent) { res.statusCode = 500; res.end('Function error'); } }
  return true;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  let p = url.pathname;
  const query = Object.fromEntries(url.searchParams);
  const t = Date.now();
  res.on('finish', () => console.log(res.statusCode, req.method, req.url, Date.now() - t + 'ms'));

  for (const h of headers) if (h.match(p)) for (const { key, value } of h.headers) res.setHeader(key, value);
  if (config.trailingSlash === false && p.length > 1 && p.endsWith('/')) { res.writeHead(308, { Location: p.slice(0, -1) + url.search }); return res.end(); }
  for (const r of redirects) { const m = r.match(p); if (m) { res.writeHead(r.permanent ? 308 : 307, { Location: fill(r.destination, m) }); return res.end(); } }

  // Static files win over rewrites, as on Vercel
  let file = await fileFor(p);
  if (!file) {
    for (const r of rewrites) {
      const m = r.match(p);
      if (!m) continue;
      const dest = new URL(fill(r.destination, m), 'http://x');
      p = dest.pathname;
      for (const [k, v] of dest.searchParams) query[k] = v;
      break;
    }
    file = await fileFor(p);
  }
  try {
    if (!file && p.startsWith('/api/') && await runFunction(p.slice(5).replace(/\.js$/, ''), req, res, query)) return;
    if (!file && p.startsWith('/__local/')) {
      const f = path.join(process.env.FM_LOCAL_STORE, path.normalize(decodeURIComponent(p.slice(9))).replace(/^(\.\.[\\/])+/, ''));
      if (f.startsWith(process.env.FM_LOCAL_STORE) && existsSync(f)) file = f;
    }
    if (!file) { res.statusCode = 404; file = path.join(ROOT, '404.html'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.end('Server error'); }
  }
}).listen(PORT, () => {
  console.log(`Falcon Manor dev server: http://localhost:${PORT}`);
  console.log(`  storage: ${process.env.FM_LOCAL_STORE}  admin password: ${process.env.ADMIN_PASSWORD ? 'set' : 'not set'}  Claude API key: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'not set (rule-based concierge)'}`);
});
