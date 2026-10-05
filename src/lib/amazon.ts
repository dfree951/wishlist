import { load } from 'cheerio';
import { normalizeName, type ProductDetails } from './items';
import { parsePrice, validateFetchUrl } from './product-fetch';
import { packCountFromText, withoutPackSize } from './product-pack';
export function amazonListUrl(value: string) {
  const url = validateFetchUrl(value);
  if (!/^(www\.)?amazon\.(com|co\.uk|ca|de|fr|it|es|com\.au|co\.jp|in)$/.test(url.hostname)
    || !/^\/(hz\/wishlist\/ls|gp\/registry\/wishlist)\/[A-Z0-9]+/i.test(url.pathname)) {
    throw new Error('Use the full Amazon list link, such as amazon.com/hz/wishlist/ls/…');
  }
  return url;
}
export function amazonProductKey(value: string) {
  try {
    const url = new URL(value);
    if (!/(^|\.)amazon\./.test(url.hostname)) return value;
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1];
    return asin ? `${url.hostname.replace(/^www\./, '')}:${asin.toUpperCase()}` : value;
  } catch { return value; }
}
export function parseAmazonList(html: string, base: string) {
  const $ = load(html);
  const host = new URL(base).origin;
  const currency = /amazon\.co\.uk/.test(host) ? 'GBP' : /amazon\.(de|fr|it|es)/.test(host) ? 'EUR' : /amazon\.ca/.test(host) ? 'CAD' : /amazon\.com\.au/.test(host) ? 'AUD' : /amazon\.co\.jp/.test(host) ? 'JPY' : /amazon\.in/.test(host) ? 'INR' : 'USD';
  const items: ProductDetails[] = [];
  const seen = new Set<string>();
  $('li[data-itemid], li[data-id], li[id^="item_"], [data-item-id], .g-item-sortable').each((_, element) => {
    const row = $(element);
    const link = row.find('a[id^="itemName"], a[href*="/dp/"], a[href*="/gp/product/"]').filter((_, el) => Boolean($(el).attr('title') || $(el).text().trim())).first();
    const href = link.attr('href') || row.find('a[href*="/dp/"]').first().attr('href');
    if (!href) return;
    let url: URL;
    try { url = new URL(href, host); } catch { return; }
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1];
    if (!asin || url.hostname !== new URL(base).hostname) return;
    const clean = `${host}/dp/${asin.toUpperCase()}`;
    if (seen.has(clean)) return;
    const name = normalizeName(link.attr('title') || link.text() || row.find('img').first().attr('alt') || '').slice(0,200);
    if (!name) return;
    const rawPrice = row.find('[id^="itemPrice"], .a-price .a-offscreen, .a-offscreen.a-price').first().text();
    const price = currency === 'USD' ? parsePrice(rawPrice) : null;
    const imageElement = row.find('img').first();
    let image = imageElement.attr('data-src') || imageElement.attr('src') || '';
    try { image = image.trim() ? validateFetchUrl(new URL(image, host).href).href : ''; } catch { image = ''; }
    const sizeText = row.find('[id^="itemSize"], [data-size]').first().text().trim();
    items.push({ name, url: clean, image, price, currency: 'USD', size: withoutPackSize(sizeText).slice(0,100), packCount: packCountFromText(sizeText) ?? packCountFromText(link.attr('title') || link.text()), checkedAt: price === null ? null : new Date().toISOString() });
    seen.add(clean);
  });
  return { items: items.slice(0,100), title: $('#profile-list-name, #list-name').first().text().trim(),
    warning: 'Review names, sizes, and prices before importing. Amazon may only include the items loaded on this page. Imports do not stay synced with Amazon.' };
}
