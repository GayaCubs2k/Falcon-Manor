// Shared search settings. Search engines stay blocked until FM_INDEXABLE=1 is set in Vercel.
// FM_SITE_URL is the final public address, used for canonical links, the sitemap and share previews.
// Without it, the project's production domain on Vercel is used (VERCEL_PROJECT_PRODUCTION_URL, set by Vercel).
const VERCEL_PROD = process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '';
export const SITE = (process.env.FM_SITE_URL || VERCEL_PROD || 'https://falcon-manor.vercel.app').replace(/\/+$/, '');
export const INDEXABLE = process.env.FM_INDEXABLE === '1';
export const NAMES = { home: 'Home', community: 'Community', homes: 'Homes', lifestyle: 'Lifestyle', relocation: 'Relocation', schools: 'Schools', news: 'News', hoa: 'HOA & Tax Rates', residents: 'Residents', realtors: 'Realtor Specialists', contact: 'Contact' };
export const VIEWS = Object.keys(NAMES);
export const pagePath = (v) => (v === 'home' ? '/' : '/' + v);
const plain = (s) => String(s).replace(/&amp;/g, '&');

export const SUMMARY = 'Half-acre estate homesites in Hockley, Texas, by Avani Communities. Falcon Manor is a thoughtfully planned residential neighborhood on Hegar Road in Waller County, with home designs expected from Chesmar Homes, Autograph Homes and Avani Homes.';

// Structured data for one page: the developer, the site, the community, the page, its breadcrumb and, on Contact, the FAQ
export function schema(view, meta, faq, image) {
  const url = SITE + pagePath(view), id = (k) => SITE + '/#' + k;
  const graph = [
    { '@type': 'Organization', '@id': id('avani'), name: 'Avani Communities', url: 'https://www.avanicommunities.com' },
    { '@type': 'WebSite', '@id': id('website'), url: SITE + '/', name: 'Falcon Manor', inLanguage: 'en-US', publisher: { '@id': id('avani') } },
    {
      '@type': 'Place', '@id': id('community'), additionalType: 'https://schema.org/Residence', name: 'Falcon Manor', description: SUMMARY, url: SITE + '/', image,
      address: { '@type': 'PostalAddress', streetAddress: 'Hegar Road', addressLocality: 'Hockley', addressRegion: 'TX', addressCountry: 'US' },
      geo: { '@type': 'GeoCoordinates', latitude: 30.126982, longitude: -95.843799 },
      containedInPlace: { '@type': 'AdministrativeArea', name: 'Waller County, Texas' },
    },
    {
      '@type': view === 'contact' ? 'ContactPage' : 'WebPage', '@id': url + '#page', url, name: plain(meta.title), description: plain(meta.desc), inLanguage: 'en-US',
      isPartOf: { '@id': id('website') }, about: { '@id': id('community') }, primaryImageOfPage: image,
    },
  ];
  if (view !== 'home') {
    graph.push({
      '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: NAMES[view], item: url },
      ],
    });
  }
  if (view === 'contact' && Array.isArray(faq) && faq.length) {
    graph.push({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f[1], acceptedAnswer: { '@type': 'Answer', text: f[2] } })) });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}
