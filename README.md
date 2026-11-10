# Falcon Manor website (prototype)

Pre-sales website for **Falcon Manor by Avani Communities**, half-acre estate homesites in Hockley, Texas.

A single page with no build step, plus a few serverless functions: the AI concierge, the CMS (admin panel at `/admin`), registrations, and `api/page.js`, which serves the page with the published CMS content inlined.

## Pages

The sitemap follows the client's direction:

- Community, Lifestyle, Relocation, Schools and Contact follow crosscreekwesttx.com.
- Homes follows jordanranchtexas.com.

The pages are routes inside `page.html` (`#community`, `#homes`, `#lifestyle`, `#relocation`, `#schools`, `#contact`).

## Features

- **AI concierge:** answers with Claude, using only the 26 client-approved FAQ answers and facts already published on the site. See below.
- **Search filter:** the Find Your New Home bar on every page, the home search on Homes, and FAQ search on Contact.
- **Map pins:** the area map with 35 places, plus the interactive site map on Community.
- **Other:** enlargeable cards and a brochure flipbook with a PDF download.

## AI concierge

`api/concierge.js` sends each question to Claude with a fixed prompt. The prompt holds the approved FAQ, the published site facts and the client's rules: planned amenities, two builders only, Houston Oaks access not included, schools still being verified, and never "master-planned".

- **Knowledge:** `api/_knowledge.js` is generated from the page at build time; once the FAQ or area places are edited in the CMS, the concierge uses the published versions.
- **Checks:** answers that mention prices, school districts or "master-planned" are discarded, and the page answers instead.
- **Fallback:** with no API key, or when a request fails, the concierge falls back to the built-in rule-based engine.

### Setup

1. Create an API key at https://platform.claude.com (Settings, then API keys), and set a monthly spend limit there.
2. In Vercel, open the project, then Settings, then Environment Variables. Add `ANTHROPIC_API_KEY` with the key, for Production and Preview.
3. Redeploy (Deployments, then the latest one, then Redeploy).

### Options

`CONCIERGE_MODEL` sets the model. The default is `claude-opus-5-5`; `claude-sonnet-5-5` and `claude-haiku-5-5` cost less.

## CMS (admin panel)

Open `/admin` and sign in with the admin password. Everything is edited as a draft, previewed, then published; every published version is kept in History.

- **Pages & text:** headings, introductions and labels on every page. Write *word* for italic and **word** for bold.
- **Images:** replace any photo; the new one is used everywhere the original appears.
- **Meet our builders, News & updates, FAQ, Area map places, HOA & taxes, Additional information.** The Home menu's Additional information item appears once it has content.
- **Contact & social, Site settings:** sales contact details, social links, the Avani website link, the notice ribbon, and the brochure PDF and flipbook pages.
- **Registrations:** sign-ups from every form on the site, stored encrypted. Filter them, update their status, add notes, export CSV.
- **Media library** and **History** (restore any earlier version).

The FAQ edited here is also what the AI concierge answers from.

### Setup

1. In Vercel, open the project, then **Storage**. Create a **Blob** store and connect it to the project; this adds `BLOB_READ_WRITE_TOKEN`.
2. In **Settings, then Environment Variables**, add `ADMIN_PASSWORD` (the sign-in password) and `ADMIN_SECRET` (a long random value that protects sessions and stored registrations; don't change it later).
3. Redeploy.

Without these, the site still works with its built-in content and the forms stay in prototype mode.

## Local development

Requires Node.js 20 or later.

```
npm install
npm run dev
```

The site opens at http://localhost:3000 (set `PORT` to change it). `scripts/dev.mjs` serves it the way Vercel does: the redirects, rewrites and headers in `vercel.json`, and the `api/` functions. CMS content, uploads and registrations are stored in `.local-store/` instead of Vercel Blob.

Put local settings in `.env.local` (never committed), for example `ADMIN_PASSWORD`, `ADMIN_SECRET` and `ANTHROPIC_API_KEY`. Without `ANTHROPIC_API_KEY` the concierge uses its built-in answers.

## Before launch

- **Search engines:** set `FM_INDEXABLE=1` and `FM_SITE_URL` (the final address) in Vercel, then redeploy. robots.txt, the sitemap and the page tags follow.
- **Forms:** once the CMS storage is connected, every form is saved to Registrations in the CMS. Add email notifications or a CRM connection if Avani wants them.
- **Contact details:** add the phone, email and sales office in the CMS (Contact & social).
- **Photos:** confirm licenses. Lifestyle photos are representative stock from Unsplash. The five hero photos (three wide for desktop, two tall for phones) were supplied by the designer at 558 to 1,200 px wide and are shown enlarged, so replace them with full-size licensed originals.

## Structure

```
page.html                  the whole site (served at / by api/page.js)
admin/index.html           the CMS admin panel (/admin)
api/admin.js              CMS API (with api/_store.js, _auth.js, _content.js)
api/register.js           form registrations
api/concierge.js           AI concierge function (Claude)
api/_knowledge.js          approved FAQ and site facts, generated from the page
img/                       photos (1080/1920/3840 widths) and brochure pages
Falcon-Manor-Brochure.pdf  printable brochure
scripts/dev.mjs            local development server (npm run dev)
favicon.svg, vercel.json, package.json (robots.txt, sitemap.xml and llms.txt come from api/seo.js)
```
