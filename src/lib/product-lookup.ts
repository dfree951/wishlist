import { normalizeName, type ProductDetails, type ProductMatch } from './items';
import { fetchProduct, parsePrice, validateFetchUrl } from './product-fetch';
import { packCountFromText, withoutPackSize } from './product-pack';
import { cachedSearchEntries, searchEntries } from './product-search';
import { cleanProductUrl, productMeasurements } from './product-url';

const host = (url: URL) => url.hostname.replace(/^www\./, '');
function productId(url: URL): string | undefined {
  const path = url.pathname;
  switch (host(url)) {
    case 'walmart.com': return path.match(/^\/ip\/(?:[^/]+\/)?(\d+)\/?$/)?.[1];
    case 'target.com': return path.match(/\/A-(\d+)\/?$/)?.[1];
    case 'amazon.com': return path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase();
    case 'bestbuy.com': return path.match(/\/(\d+)(?:\.p)?\/?$/)?.[1];
    case 'rei.com': return path.match(/^\/product\/(\d+)(?:\/|$)/)?.[1];
    case 'etsy.com': return path.match(/^\/listing\/(\d+)(?:\/|$)/)?.[1];
    case 'crateandbarrel.com':
    case 'cb2.com': return path.match(/\/s(\d+)\/?$/)?.[1];
  }
}
function options(url: URL) {
  // Retain variant, seller, currency, and unknown parameters. Ignore only tracking.
  return [...new URL(cleanProductUrl(url.href)).searchParams]
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
}
export function sameProductListing(requested: string, result: string) {
  try {
    const a = validateFetchUrl(requested), b = validateFetchUrl(result);
    if (host(a) !== host(b) || JSON.stringify(options(a)) !== JSON.stringify(options(b))) return false;
    if (a.hash && a.hash !== b.hash) return false;
    const id = productId(a);
    return id ? id === productId(b) : a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
  } catch { return false; }
}

export function indexedQueries(value: string, name = '') {
  const url = validateFetchUrl(value);
  const id = productId(url);
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch { /* Keep malformed escapes as URL text. */ }
  const words = path.split('/').filter(part => part.length > 12 && /[a-z]{3}/i.test(part))
    .join(' ').replace(/[-_+]/g, ' ').replace(/[^\p{L}\p{N} .]/gu, ' ').trim().slice(0, 200);
  const hint = words || name.replace(/[^\p{L}\p{N} .]/gu, ' ').trim().slice(0, 200);
  // A product name plus its ID is more useful than an ID-only search.
  const primary = `site:${host(url)}${host(url) === 'walmart.com' ? '/ip' : ''} ${hint} ${id || ''}`.replace(/\s+/g, ' ').trim();
  const exact = `site:${host(url)} "${id || url.pathname}"`;
  return [...new Set([hint ? primary : exact, exact])];
}

function indexedPrice(text: string, url: string): number | null {
  // Unlabelled dollar amounts might be shipping, discounts, installments, or
  // another variant. Only an explicit, unambiguous USD product price is usable.
  if (/\b(?:CAD|AUD|NZD|SGD|HKD|MXN)|[£€]|(?:CA|AU|NZ|SG|HK)\$|coupon|shipping|installment|per (?:month|oz|ounce|lb|pound)|\/(?:mo|oz|lb)\b|starting|as low as|\b(?:from|was|save|off|used|refurbished)\b/i.test(text)) return null;
  const dollars = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)];
  if (dollars.length !== 1 || /\$[\d,.]+\s*[-–]/.test(text)) return null;
  const label = text.match(/\b(?:(?:current|sale)\s+)?price\s*:?\s*(?:USD\s*)?\$\s*([\d,]+(?:\.\d{2})?)(?!\d|[,.]\d|\.\.)/i);
  if (!label) return null;
  const parsed = new URL(url);
  const usdStore = ['walmart.com', 'target.com', 'amazon.com', 'bestbuy.com', 'rei.com'].includes(host(parsed));
  if (!/\bUSD\b/i.test(text) && !usdStore) return null;
  return parsePrice(label[1]);
}

export function indexedDetails(match: ProductMatch, url: string): ProductDetails | null {
  if (!sameProductListing(url, match.url)) return null;
  let name = match.name;
  // Walmart's indexed description sometimes has the full name when the title
  // is truncated. Do not use unrelated description text as a product name.
  if (/\.\.\.|…/.test(name) && host(new URL(url)) === 'walmart.com') {
    const full = match.snippet.match(/^Buy (.+?) at (?:www\.)?Walmart\.com(?:\s|$)/i)?.[1];
    if (full && full.toLowerCase().startsWith(name.replace(/(?:\.\.\.|…).*/, '').trim().toLowerCase())) name = full;
  }
  name = normalizeName(name.replace(/\s+(?:-|\|)\s+(?:Walmart(?:\.com)?|Target|Amazon(?:\.com)?|Best Buy|REI(?: Co-op)?|Crate\s*(?:&|and)\s*Barrel|CB2)\s*$/i, '').replace(/\s+\+\s+Reviews$/i, '')).slice(0, 200);
  if (!name || /captcha|robot or human|access denied/i.test(name)) return null;
  let measurements = productMeasurements(name);
  // Crate's indexed title can omit the size; its matched SKU's descriptive URL
  // still names the selected size. Never borrow measurements from other results.
  if (!measurements.length && /^(?:crateandbarrel|cb2)\.com$/.test(host(new URL(url)))) {
    measurements = productMeasurements(new URL(match.url).pathname);
  }
  return {
    name, url, image: '', currency: 'USD', price: indexedPrice(match.snippet, url),
    size: measurements.length === 1 ? withoutPackSize(measurements[0]) : '',
    packCount: packCountFromText(name), checkedAt: null,
    warning: 'Details found in search results. Check them before saving.',
  };
}

type LookupDependencies = {
  direct: (url: string) => Promise<ProductDetails>;
  search: (query: string) => Promise<ProductMatch[]>;
  cached?: () => ProductMatch[];
};
export async function lookupProduct(url: string, name = '', dependencies: LookupDependencies = { direct: fetchProduct, search: searchEntries, cached: cachedSearchEntries }): Promise<ProductDetails> {
  validateFetchUrl(url);
  url = cleanProductUrl(url);
  let direct: ProductDetails | undefined;
  try { direct = await dependencies.direct(url); } catch { /* Try the public search index next. */ }
  if (direct?.name && direct.image && direct.price !== null) return direct;
  const destination = direct?.url || url;
  function recover(matches: ProductMatch[]) {
    for (const match of matches) {
      const indexed = indexedDetails(match, destination);
      if (!indexed) continue;
      if (!direct) return indexed;
      const merged = { ...direct,
        name: direct.name || indexed.name,
        price: direct.price ?? indexed.price,
        size: direct.size || indexed.size,
        packCount: direct.packCount ?? indexed.packCount,
      };
      if (merged.name !== direct.name || merged.price !== direct.price || merged.size !== direct.size || merged.packCount !== direct.packCount) {
        return { ...merged, warning: indexed.warning, checkedAt: direct.price === null ? null : direct.checkedAt };
      }
      return direct;
    }
  }
  const cached = recover(dependencies.cached?.() || []);
  if (cached) return cached;
  for (const query of indexedQueries(destination, direct?.name || name)) {
    let matches: ProductMatch[];
    try { matches = await dependencies.search(query); } catch { break; }
    const recovered = recover(matches);
    if (recovered) return recovered;
  }
  if (direct) return direct;
  throw new Error(name.trim()
    ? 'Couldn’t fetch details automatically. Enter any missing details below.'
    : 'Couldn’t fetch details automatically. Add an item name and try again, or enter the details below.');
}
