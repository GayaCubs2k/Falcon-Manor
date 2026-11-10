// Serves each page of the site at its own address, with its own title, description, canonical link, share tags and
// structured data, and the latest published CMS content inlined so the page renders it on first paint.
// If anything fails, the page is served exactly as built.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getContent, storeReady } from './_store.js';
import { clean } from './_content.js';
import { FAQ } from './_knowledge.js';
import { SITE, INDEXABLE, VIEWS, pagePath, schema } from './_seo.js';

let HTML = '';
try { HTML = readFileSync(path.join(process.cwd(), 'page.html'), 'utf8'); } catch (e) { console.error('page: page.html missing', e.message); }

// Titles and descriptions live on the views in the page, so there is one place to edit them
const META = {};
for (const m of HTML.matchAll(/<div class="view(?: active)?" data-view="([a-z]+)" data-title="([^"]*)" data-desc="([^"]*)"/g)) META[m[1]] = { title: m[2], desc: m[3] };
const OG = (HTML.match(/<meta property="og:image" content="([^"]*)"/) || [])[1] || '';
const at = OG ? HTML.indexOf('src="' + OG + '" alt="') : -1;
const OG_ALT = at < 0 ? 'Falcon Manor' : HTML.slice(at + OG.length + 12, HTML.indexOf('"', at + OG.length + 12));

function forView(html, view, faq) {
  const m = META[view];
  if (!m) return html;
  const url = SITE + pagePath(view), image = SITE + '/' + OG.replace(/^\/+/, '');
  const robots = INDEXABLE ? 'index, follow, max-image-preview:large' : 'noindex, nofollow';
  const tags = [
    `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Falcon Manor">',
    '<meta property="og:locale" content="en_US">',
    `<meta property="og:url" content="${url}">`,
    '<meta property="og:image:width" content="1920">',
    '<meta property="og:image:height" content="1080">',
    `<meta property="og:image:alt" content="${OG_ALT}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${m.title}">`,
    `<meta name="twitter:description" content="${m.desc}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<script type="application/ld+json">${schema(view, m, faq, image)}</script>`,
  ].join('\n');
  // Replacements use functions so a $ in the text (the HOA fees) is never read as a pattern
  let out = html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${m.title}</title>`)
    .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${m.desc}">`)
    .replace(/<meta name="robots"[^>]*>/, () => `<meta name="robots" content="${robots}">`)
    .replace(/<meta property="og:title"[^>]*>/, () => `<meta property="og:title" content="${m.title}">`)
    .replace(/<meta property="og:description"[^>]*>/, () => `<meta property="og:description" content="${m.desc}">`)
    .replace(/<meta property="og:image"[^>]*>/, () => `<meta property="og:image" content="${image}">`)
    .replace('</head>', () => tags + '\n</head>');
  if (view !== 'home') {
    out = out
      .replace('<div class="view active" data-view="home"', '<div class="view" data-view="home"')
      .replace(`<div class="view" data-view="${view}"`, `<div class="view active" data-view="${view}"`)
      .replace(/<link rel="preload" as="image"[^>]*>\n?/g, '');
  }
  return out;
}

export default async function handler(req, res) {
  const asked = String((req.query && req.query.view) || 'home');
  const view = VIEWS.includes(asked) ? asked : 'home';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
  if (!INDEXABLE) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  let content = null;
  try { const doc = await getContent(); if (doc) content = clean(doc); } catch (e) { console.error('page: content', e.message); }
  const data = JSON.stringify({ content, live: { forms: storeReady(), ai: !!process.env.ANTHROPIC_API_KEY } }).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
  const faq = content && Array.isArray(content.faq) && content.faq.length ? content.faq : FAQ;
  let html = HTML;
  try { html = forView(HTML, view, faq); } catch (e) { console.error('page: head', e.message); }
  res.status(200).send(html.replace('<body>', () => '<body>\n<script>window.FM_CMS=' + data + ';</script>'));
}
