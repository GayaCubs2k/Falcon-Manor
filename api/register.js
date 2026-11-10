// Register Your Interest and update sign-ups from the site's forms, stored for the admin's Registrations inbox.
import { storeReady, addLead } from './_store.js';
import { sameOrigin, clientIp, limited } from './_auth.js';

const FORMS = ['contact', 'updates', 'flyer', 'concierge'];
const s = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  if (!sameOrigin(req)) return res.status(403).json({ ok: false });
  if (!storeReady()) return res.status(503).json({ ok: false, off: true });
  if (limited('reg:' + clientIp(req), 8, 10 * 60e3)) return res.status(429).json({ ok: false, error: 'Too many sign-ups from this connection. Please try again later.' });

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (s(b.company, 100)) return res.status(200).json({ ok: true }); // filled only by bots
  const lead = {
    form: FORMS.includes(b.form) ? b.form : 'contact',
    first: s(b.first, 60), last: s(b.last, 60), email: s(b.email, 120).toLowerCase(), phone: s(b.phone, 30), zip: s(b.zip, 10),
    interest: s(b.interest, 80), comments: typeof b.comments === 'string' ? b.comments.trim().slice(0, 2000) : '', agent: b.agent === true,
    page: s(b.page, 30)
  };
  if (!lead.first || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return res.status(400).json({ ok: false, error: 'Please include your first name and a valid email address.' });
  try {
    await addLead(lead);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('register:', err && err.message);
    return res.status(502).json({ ok: false, error: 'We could not save your details. Please try again.' });
  }
}
