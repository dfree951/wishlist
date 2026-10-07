import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';
import { load } from 'cheerio';
import { normalizeName, type ProductDetails, webUrl } from './items';
import { isPackProperty, packCountFromText, packQuantity, withoutPackSize } from './product-pack';
import { structuredProduct } from './structured-product';
import { cleanProductUrl, productMeasurements } from './product-url';

export function publicAddress(address: string) {
  try { return ipaddr.process(address.replace(/^\[|\]$/g, '')).range() === 'unicast'; }
  catch { return false; }
}
export function validateFetchUrl(value: string) {
  const url = new URL(webUrl.parse(value));
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Use a standard product web link.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || !host.includes('.') && !isIP(host) || isIP(host) && !publicAddress(host)) {
    throw new Error('Use a public store link.');
  }
  return url;
}

// Validate DNS at connection time, not just before fetching, to prevent rebinding.
const dispatcher = new Agent({ connect: { lookup(hostname, options, callback) {
  lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, '', 4);
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) return callback(new Error('Use a public store link.'), '', 4);
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (error: Error | null, results: { address: string; family: number }[]) => void)(null, addresses);
    } else callback(null, addresses[0].address, addresses[0].family);
  });
} } });

export function safeImage(value: unknown, base: string): string {
  if (Array.isArray(value)) {
    for (const candidate of value) { const image = safeImage(candidate, base); if (image) return image; }
    return '';
  }
  if (value && typeof value === 'object') return safeImage((value as Record<string, unknown>).url || (value as Record<string, unknown>).contentUrl, base);
  if (typeof value !== 'string' || !value.trim()) return '';
  try { return validateFetchUrl(new URL(value, base).href).href; } catch { return ''; }
}
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  let text = value.trim().replace(/[^\d.,]/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (/^\d+,\d{2}$/.test(text)) text = text.replace(',', '.');
  else text = text.replace(/,/g, '');
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 1000000 ? number : null;
}
export function parseProductHtml(html: string, url: string): ProductDetails {
  const $ = load(html);
  const hostname = new URL(url).hostname;
  const amazon = /(^|\.)amazon\.(com|co\.uk|ca|de|fr|it|es|com\.au|co\.jp|in)$/.test(hostname);
  const pageTitle = $('title').first().text().trim();
  if (/^(?:robot or human\??|access denied|robot check|just a moment[.!…]*|.*captcha.*|verify (?:you are|you're) human|pardon our interruption)$/i.test(pageTitle)
    || /\/(?:blocked|captcha)(?:\/|$)/.test(new URL(url).pathname)) {
    throw new Error('This store blocks automatic lookups. Enter the details manually below.');
  }
  const firstText = (selectors: string[]) => {
    for (const selector of selectors) {
      const text = $(selector).first().text().replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return '';
  };
  // Scope prices to the main product. A page-wide .a-price selector also matches
  // recommendations, crossed-out list prices, and installment amounts.
  const amazonPrice = amazon ? firstText([
    '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
    '#corePriceDisplay_mobile_feature_div .priceToPay .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen',
    '#corePriceDisplay_mobile_feature_div .a-price:not(.a-text-price) .a-offscreen',
    '#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen',
    '#priceblock_ourprice', '#priceblock_dealprice',
  ]) : '';
  const amazonSize = amazon ? ['size_name', 'color_name', 'style_name'].map(dimension => firstText([
    `#inline-twister-expanded-dimension-text-${dimension}`,
    `#variation_${dimension} .selection`,
    `#native_dropdown_selected_${dimension} option[selected]`,
  ])).filter(Boolean).join(', ') : '';
  const amazonImage = amazon ? $('#landingImage, #imgBlkFront, #main-image').first() : null;
  const amazonCurrency = /amazon\.co\.uk$/.test(new URL(url).hostname) ? 'GBP'
    : /amazon\.(de|fr|it|es)$/.test(new URL(url).hostname) ? 'EUR'
    : /amazon\.ca$/.test(new URL(url).hostname) ? 'CAD'
    : /amazon\.com\.au$/.test(new URL(url).hostname) ? 'AUD'
    : /amazon\.co\.jp$/.test(new URL(url).hostname) ? 'JPY'
    : /amazon\.in$/.test(new URL(url).hostname) ? 'INR' : 'USD';
  const meta = (key: string) => $(`meta[property="${key}"], meta[name="${key}"]`).first().attr('content')?.trim() || '';
  const roots: unknown[] = [];
  $('script[type="application/ld+json"], script[type="application/json"]').each((_, element) => {
    try { roots.push(JSON.parse($(element).text())); } catch { /* Some stores emit invalid JSON-LD. */ }
  });
  const { product, offer, variants } = structuredProduct(roots, url, $('link[rel="canonical"]').attr('href'));
  // Read microdata only inside the selected product, never recommendation cards.
  const scopes = $('[itemscope][itemtype*="schema.org/Product"]').filter((_, element) => {
    const itemid = $(element).attr('itemid');
    if (!itemid) return false;
    try { return cleanProductUrl(new URL(itemid, url).href) === cleanProductUrl(url); } catch { return false; }
  });
  const allScopes = $('[itemscope][itemtype*="schema.org/Product"]');
  const scope = scopes.length === 1 ? scopes.first() : allScopes.length === 1 && !allScopes.attr('itemid') ? allScopes.first() : $();
  const field = (key: string) => {
    const element = scope.find(`[itemprop="${key}"]`).filter((_, candidate) =>
      $(candidate).closest('[itemscope][itemtype*="schema.org/Product"]')[0] === scope[0]).first();
    return element.attr('content') || element.attr('href') || element.attr('src') || element.text().trim();
  };
  let storePrice = '', storeImage = '', storeName = '';
  if (/(^|\.)apple\.com$/.test(hostname) && new URL(url).pathname.startsWith('/shop/')) {
    storeName = $('h1').first().text().trim().replace(/^Buy\s+/, '');
    $('a[data-slot-name="productSelection"]').each((_, element) => {
      try {
        if (new URL($(element).attr('href') || '', url).pathname === new URL(url).pathname) storePrice = $(element).find('.current_price').first().text().trim();
      } catch { /* Skip malformed links. */ }
    });
    // This is JSON emitted by Apple's page, not executable JavaScript.
    const hero = html.match(/window\.coldSelectionImage\s*=\s*(\{[^\n]+\})\s*(?:;|\n)/);
    try { storeImage = hero ? JSON.parse(hero[1]).sources?.[0]?.srcSet || '' : ''; } catch { /* The image remains optional. */ }
  }
  const priceSpec = offer.priceSpecification as Record<string, unknown> | undefined;
  // Generic metadata can contain the cheapest variant, not the one in the URL.
  const rawPrice = amazonPrice || storePrice || (offer.price ?? priceSpec?.price ?? (!variants && (meta('product:price:amount') || meta('og:price:amount') || (!amazon && field('price')))));
  const parsedPrice = parsePrice(rawPrice);
  const rawName = (amazon && firstText(['#productTitle', '#title'])) || storeName || (typeof product.name === 'string' ? product.name : field('name') || meta('og:title') || meta('twitter:title') || firstText(['main h1', 'h1']) || pageTitle);
  const name = normalizeName(rawName).slice(0, 200);
  const currency = String(amazonPrice ? amazonCurrency : offer.priceCurrency || priceSpec?.priceCurrency || field('priceCurrency') || meta('product:price:currency') || meta('og:price:currency') || (amazon ? amazonCurrency : 'USD')).toUpperCase();
  const price = currency === 'USD' ? parsedPrice : null;
  const scalar = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const measurements = productMeasurements(rawName);
  const size = amazonSize || [...new Set([scalar(product.size) || field('size') || (measurements.length === 1 ? measurements[0] : ''), scalar(product.color || product.Color) || field('color')].filter(Boolean))].join(', ');
  const selectedPack = amazon ? firstText([
    '#inline-twister-expanded-dimension-text-number_of_items',
    '#variation_number_of_items .selection',
    '#inline-twister-expanded-dimension-text-item_package_quantity',
    '#variation_item_package_quantity .selection',
  ]) : '';
  let packCount = packQuantity(selectedPack) ?? packCountFromText(selectedPack) ?? packCountFromText(size) ?? packCountFromText(rawName);
  const properties = Array.isArray(product.additionalProperty) ? product.additionalProperty : [product.additionalProperty];
  for (const property of properties) {
    if (packCount !== null || !property || typeof property !== 'object') continue;
    const p = property as Record<string, unknown>;
    if (isPackProperty(String(p.name || ''))) packCount = packQuantity(p.value) ?? packCountFromText(String(p.value || ''));
  }
  if (amazon && packCount === null) {
    $('#productOverview_feature_div tr, #productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #detailBullets_feature_div li').each((_, row) => {
      if (packCount !== null) return;
      const fields = $(row).find('th, td');
      const label = fields.length ? fields.first().text() : $(row).find('.a-text-bold').first().text();
      const value = fields.length ? fields.last().text() : $(row).text().replace(label, '');
      if (isPackProperty(label)) packCount = packQuantity(value) ?? packCountFromText(value);
    });
  }
  const image = safeImage([amazonImage?.attr('data-old-hires'), amazonImage?.attr('data-src'), amazonImage?.attr('src'), storeImage, product.image, ...(!variants ? [field('image'), meta('og:image'), meta('twitter:image')] : [])], url);
  const parts = [];
  if (!name) parts.push('a name');
  if (!image) parts.push('an image');
  if (price === null) parts.push('a price');
  return { name, image, price, currency: 'USD', size: withoutPackSize(size).slice(0,100), packCount, url,
    checkedAt: price === null ? null : new Date().toISOString(),
    ...(parts.length ? { warning: currency !== 'USD' ? 'The store lists a non-USD price. Enter the USD price below.' : `Couldn’t read ${parts.join(' or ')} from this page. You can enter it below.` } : {}) };
}
type HtmlReadOptions = { allowPartial?: boolean; enough?: (html: string) => boolean; timeoutMs?: number };

export async function readHtml(reader: ReadableStreamDefaultReader<Uint8Array>, options: HtmlReadOptions = {}): Promise<string> {
  const chunks: Uint8Array[] = [];
  const limit = options.allowPartial ? 6_000_000 : 2_500_000;
  let size = 0;
  let nextCheck = 1_000_000;
  const text = () => Buffer.concat(chunks).toString('utf8');
  // Do not let Cheerio repair half of a price/name text node into a usable value.
  const partialText = () => { const html = text(); return html.slice(0, html.lastIndexOf('>') + 1); };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return text();
      const remaining = limit - size;
      chunks.push(chunk.value.subarray(0, remaining));
      size += Math.min(chunk.value.length, remaining);
      if (size >= nextCheck && options.enough) {
        const html = partialText();
        if (options.enough(html)) { await reader.cancel(); return html; }
        nextCheck *= 2;
      }
      if (size >= limit) {
        await reader.cancel();
        if (options.allowPartial) return partialText();
        throw new Error('This page is too large to import. Add its details manually.');
      }
    }
  } catch (error) {
    // A large/slow page's useful prefix should survive a later stream timeout.
    await reader.cancel().catch(() => {});
    if (options.allowPartial && size) return partialText();
    throw error;
  }
}

type PageReadOptions = Omit<HtmlReadOptions, 'enough'> & { enough?: (html: string, url: string) => boolean };

async function fetchPage(value: string, options: PageReadOptions = {}, request: typeof fetch = fetch): Promise<{ html: string; url: string }> {
  let url = validateFetchUrl(value);
  const signal = AbortSignal.timeout(options.timeoutMs ?? 10000);
  for (let redirects = 0; redirects < 5; redirects++) {
    let response;
    try {
      response = await request(url, { dispatcher, redirect: 'manual', signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChristmasWishlist/1.0)', Accept: 'text/html,application/xhtml+xml' } });
    } catch {
      throw new Error(signal.aborted ? 'The store took too long to respond. Enter the details manually below.' : 'Couldn’t connect to this store. Enter the details manually below.');
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('The store returned an invalid redirect.');
      url = validateFetchUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !/text\/html|application\/xhtml/.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel();
      throw new Error([403, 429].includes(response.status) ? 'This store blocks automatic lookups. Enter the details manually below.' : 'This store could not provide product details. Enter them manually below.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The store returned an empty page.');
    const html = await readHtml(reader, { ...options, enough: options.enough ? html => options.enough!(html, url.href) : undefined });
    return { html, url: url.href };
  }
  throw new Error('This link redirects too many times. Use the final product link.');
}
export async function fetchHtml(value: string, options: HtmlReadOptions = {}): Promise<string> {
  return (await fetchPage(value, options)).html;
}

export async function fetchProduct(value: string, request: typeof fetch = fetch): Promise<ProductDetails> {
  validateFetchUrl(value);
  const page = await fetchPage(cleanProductUrl(value), {
    allowPartial: true,
    enough: (html, url) => {
      // Other stores often put selected-variant schema at the end of the page.
      if (!/(^|\.)amazon\./.test(new URL(url).hostname)) return false;
      const product = parseProductHtml(html, url);
      return Boolean(product.name && product.image && product.price !== null);
    },
  }, request);
  // Retailer-specific parsing must use the destination, including for a.co links.
  const parsed = parseProductHtml(page.html, page.url);
  if (/access denied|robot check|just a moment|captcha/i.test(parsed.name)) throw new Error('This store blocks automatic lookups. Add the details manually below.');
  return parsed;
}
