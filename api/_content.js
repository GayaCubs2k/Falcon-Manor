// The CMS document shape. clean() keeps only known fields, with types and lengths checked,
// so nothing unexpected is ever stored or sent to the page.
const PLACE_CATS = ['Shopping', 'Restaurants', 'Grocery', 'Parks', 'Entertainment', 'Fitness', 'Medical', 'Daycares', 'Schools', 'Hardware'];
const LOT_STATUS = ['coming', 'available', 'reserved', 'sold', 'model', 'hold'];
// The seven approved styles in the Falcon Manor Builder Design Guidelines
const LOT_STYLES = ['Modern Farmhouse', 'Texas Hill Country', 'French Country', 'Modern Prairie', 'Traditional', 'Mediterranean', 'Contemporary'];
const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');
// Images and files: https, the site's own img/ folder, or local development uploads
const asset = (v) => { const s = str(v, 600).trim(); return /^(https:\/\/|img\/[\w.\-]+(\?v=\d+)?$|\/__local\/)/i.test(s) && !/[\s"'<>]/.test(s) ? s : ''; };
const link = (v) => { const s = str(v, 600).trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : ''; };
const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : null);

function map(obj, maxKeys, keyMax, fn) {
  const out = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const k of Object.keys(obj).slice(0, maxKeys)) {
    const key = str(k, keyMax);
    const v = fn(obj[k]);
    if (key && v) out[key] = v;
  }
  return out;
}
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function clean(c) {
  c = c && typeof c === 'object' ? c : {};
  const s = c.settings || {};
  const out = {
    texts: map(c.texts, 600, 140, (v) => str(v, 4000).trim()),
    images: map(c.images, 300, 140, asset),
    faq: arr(c.faq, 200).filter((f) => Array.isArray(f) && Number.isInteger(f[0]) && f[0] >= 0 && f[0] <= 6 && str(f[1], 300).trim() && str(f[2], 2500).trim())
      .map((f) => [f[0], str(f[1], 300).trim(), str(f[2], 2500).trim()]),
    news: arr(c.news, 100).filter((n) => n && str(n.t, 160).trim()).map((n) => ({
      cat: str(n.cat, 60).trim() || 'News', t: str(n.t, 160).trim(), d: str(n.d, 1500).trim(), img: asset(n.img), alt: str(n.alt, 160),
      vis: ['plan', 'mark', 'quote'].includes(n.vis) ? n.vis : '', date: str(n.date, 40).trim(), link: /^#[a-z]+(:[a-z-]+)?$/.test(str(n.link, 60)) ? n.link : link(n.link), status: n.status === 'draft' ? 'draft' : 'published'
    })),
    videos: arr(c.videos, 40).filter((v) => v && str(v.t, 140).trim()).map((v) => ({
      page: ['news', 'lifestyle'].includes(v.page) ? v.page : 'schools', t: str(v.t, 140).trim(), d: str(v.d, 600).trim(),
      url: /^https:\/\//i.test(link(v.url)) ? link(v.url) : '', img: asset(v.img)
    })),
    meet: arr(c.meet, 8).filter((b) => b && str(b.name, 80).trim()).map((b) => ({
      id: str(b.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'builder', name: str(b.name, 80).trim(), title: str(b.title, 140).trim(), text: str(b.text, 1500).trim(), logo: asset(b.logo), url: link(b.url)
    })),
    places: arr(c.places, 300).filter((p) => Array.isArray(p) && str(p[0], 80).trim() && PLACE_CATS.includes(p[1]) && num(p[2], 20, 480) !== null && num(p[3], 140, 490) !== null)
      .map((p) => { const r = [str(p[0], 80).trim(), p[1], num(p[2], 20, 480), num(p[3], 140, 490)]; const note = str(p[4], 160).trim(); if (note) r.push(note); return r; }),
    social: map(c.social, 4, 20, link),
    settings: {
      avaniUrl: link(s.avaniUrl), phone: str(s.phone, 40).trim(), email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(str(s.email, 120).trim()) ? str(s.email, 120).trim() : '',
      office: str(s.office, 300).trim(), hours: str(s.hours, 200).trim(), ribbonText: str(s.ribbonText, 300).trim(), ribbonHide: s.ribbonHide === true,
      brochurePdf: asset(s.brochurePdf), brochurePages: arr(s.brochurePages, 6).map(asset),
      mapboxToken: /^pk\.[\w.-]{20,400}$/.test(str(s.mapboxToken, 420).trim()) ? str(s.mapboxToken, 420).trim() : '',
      schoolsVideo: /^https:\/\//i.test(link(s.schoolsVideo)) ? link(s.schoolsVideo) : ''
    },
    // Site map homesites: only the fields Avani edits; geometry stays in the page
    lots: arr(c.lots, 300).filter((l) => l && /^(S\d-B\d{1,2}-L\d{1,3}|F\d{1,3})$/.test(str(l.id, 20))).map((l) => ({
      id: str(l.id, 20), status: LOT_STATUS.includes(l.status) ? l.status : 'coming', builder: ['chesmar', 'autograph', 'avani'].includes(l.builder) ? l.builder : '',
      price: str(l.price, 40).trim(), note: str(l.note, 300).trim(),
      phase: [1, 2, 3].includes(+l.phase) ? +l.phase : 0, style: LOT_STYLES.includes(l.style) ? l.style : '',
      avail: l.avail === 'ready' ? 'ready' : 'coming', beds: Math.min(12, Math.max(0, parseInt(l.beds, 10) || 0))
    })),
    more: { title: str(c.more && c.more.title, 120).trim(), body: str(c.more && c.more.body, 6000).trim() },
    hoa: str(c.hoa, 3000).trim(),
    taxes: str(c.taxes, 3000).trim()
  };
  out.social = Object.fromEntries(Object.entries(out.social).filter(([k]) => ['instagram', 'facebook', 'x', 'linkedin'].includes(k)));
  return out;
}
