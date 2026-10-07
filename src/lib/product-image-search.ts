import { load } from 'cheerio';
import { fetchHtml, fetchJson, safeImage, validateFetchUrl, verifyProductImage } from './product-fetch';
import { productId, sameProductListing } from './product-lookup';
import { cleanProductUrl } from './product-url';
import type { ProductImageCandidate } from './items';

export type ImageSearchInput = { name: string; size?: string; url?: string };
export type ImageSearchResult = { candidates: ProductImageCandidate[]; image: string; warning?: string };
type ImageEntry = { name: string; image: string; thumbnail: string; sourceUrl: string };
type Dependencies = { html: typeof fetchHtml; json: typeof fetchJson; verify: (url: string) => Promise<boolean> };
const defaults: Dependencies = { html: fetchHtml, json: fetchJson, verify: verifyProductImage };
const normalize = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim();
const words = (value: string) => normalize(value).split(/\s+/).filter(word => word && !/^(?:oz|fl|ml|gb|tb|in|cm|mm|of|the|and|with|for|reviews|price|long|stem|\d+(?:\.\d+)?)$/.test(word));
const colors = (value: string) => [...normalize(value).matchAll(/\b(?:black|white|red|blue|green|pink|purple|yellow|orange|brown|gray|grey|beige|navy|silver|gold|clear)\b/g)].map(match => match[0].replace('grey', 'gray'));
const measures = (value: string) => [...normalize(value).matchAll(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?(oz|ml|liters?|gb|tb|inches?|cm|mm)\b/g)].map(match => `${Number(match[1])}:${match[2].replace(/liters?/, 'l').replace(/inches?/, 'in')}`);
const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');

function productPhotoUrl(value: string) {
  const url = new URL(value);
  // Resize the asset returned by the index, never invent a product asset name.
  const asset = url.hostname === 'cb.scene7.com' ? url.pathname.match(/^\/is\/image\/Crate\/([^/]+)/)?.[1] : undefined;
  if (asset) {
    url.pathname = `/is/image/Crate/${asset}`;
    url.search = 'wid=800&hei=800&fmt=jpeg&qlt=85';
  }
  return url.href;
}

function validEntry(name: unknown, image: unknown, thumbnail: unknown, sourceUrl: unknown): ImageEntry | null {
  if (typeof name !== 'string' || typeof sourceUrl !== 'string') return null;
  try {
    const source = validateFetchUrl(sourceUrl).href;
    const original = safeImage(image, source);
    if (!original || !name.trim()) return null;
    const photo = productPhotoUrl(original);
    return { name: name.trim().slice(0, 250), image: photo, thumbnail: safeImage(thumbnail, source) || photo, sourceUrl: source };
  } catch { return null; }
}

export function parseDuckImages(value: unknown): ImageEntry[] {
  if (!value || typeof value !== 'object') return [];
  const results = (value as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, 100).flatMap(result => {
    if (!result || typeof result !== 'object') return [];
    const row = result as Record<string, unknown>;
    if (typeof row.width === 'number' && row.width < 120 || typeof row.height === 'number' && row.height < 120) return [];
    const entry = validEntry(row.title, row.image, row.thumbnail, row.url);
    return entry ? [entry] : [];
  });
}

export function parseBingImages(html: string): ImageEntry[] {
  const $ = load(html), entries: ImageEntry[] = [];
  $('a.iusc[m]').slice(0, 100).each((_, element) => {
    try {
      const row = JSON.parse($(element).attr('m') || '');
      const entry = validEntry(row.t, row.murl, row.turl, row.purl);
      if (entry) entries.push(entry);
    } catch { /* Search markup is data, never executable code. */ }
  });
  return entries;
}

export function imageQueries(input: ImageSearchInput) {
  let id = '', store = '';
  if (input.url) {
    const url = validateFetchUrl(input.url);
    id = productId(url) || '';
    store = host(url.href).split('.')[0];
  }
  const hint = [input.name, input.size || ''].join(' ').replace(/[^\p{L}\p{N} .-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  return [...new Set([[hint, store, id].filter(Boolean).join(' '), hint])].filter(Boolean);
}

export function rankImageCandidates(entries: ImageEntry[], input: ImageSearchInput): ProductImageCandidate[] {
  const requestedWords = [...new Set(words(input.name))];
  const identityWord = requestedWords.find(word => !/^(?:black|white|red|blue|green|pink|purple|yellow|orange|brown|gray|grey|beige|navy|silver|gold|clear|wine|glass|glasses|water|bottle|tumbler|cup|stainless|steel|large|small|medium|shirt|cotton|long|short|sleeve|sleeves)$/.test(word));
  const requestedMeasures = [...new Set(measures(`${input.name} ${input.size || ''}`))];
  const requestedColors = [...new Set(colors(`${input.name} ${input.size || ''}`))];
  const explicitSize = normalize(input.size || '').match(/\b(?:xxs|xs|s|m|l|xl|xxl|xxxl)\b/)?.[0];
  const seen = new Set<string>();
  const ranked = entries.flatMap(entry => {
    let sourcePath: string, imagePath: string;
    try { sourcePath = decodeURIComponent(new URL(entry.sourceUrl).pathname); imagePath = decodeURIComponent(new URL(entry.image).pathname); }
    catch { return []; }
    // Check every evidence source separately: a correct title must not hide an
    // incorrect variant filename indexed from the same retailer page.
    for (const text of [entry.name, sourcePath, imagePath]) {
      const found = measures(text);
      if (requestedMeasures.some(wanted => found.some(actual => actual.split(':')[1] === wanted.split(':')[1] && actual !== wanted))) return [];
      const foundColors = colors(text);
      if (requestedColors.length && foundColors.length && !requestedColors.every(color => foundColors.includes(color))) return [];
    }
    const exact = Boolean(input.url && sameProductListing(input.url, entry.sourceUrl));
    if (input.url && host(input.url) === host(entry.sourceUrl) && productId(new URL(input.url)) && !exact) return [];
    const text = normalize(`${entry.name} ${sourcePath}`);
    const tokens = new Set(words(text));
    const coverage = requestedWords.filter(word => tokens.has(word)).length / Math.max(1, requestedWords.length);
    if (requestedWords.length < 2 || coverage < (exact ? .7 : .85)) return [];
    const assetName = imagePath.includes('/is/image/') ? imagePath.split('/is/image/')[1].split('/').slice(1, 2).join('') : imagePath.split('/').pop() || '';
    const fileWords = words(assetName.replace(/\.[a-z]{2,5}$/i, '')).filter(word => /^[a-z]{4,}$/.test(word) && !/^(?:image|photo|product|large|small|medium|original|thumb|thumbnail|carousel|main|jpeg|webp)$/.test(word));
    if (fileWords.length >= 2 && !fileWords.some(word => requestedWords.includes(word))) return [];
    if (identityWord && fileWords.length && !words(assetName).includes(identityWord)) return [];
    const selectedSize = normalize(entry.name).match(/\bsize\s+(xxs|xs|s|m|l|xl|xxl|xxxl)\b/)?.[1];
    if (explicitSize && selectedSize && explicitSize !== selectedSize) return [];
    const evidence = normalize(`${entry.name} ${imagePath}`);
    if (!exact && (requestedMeasures.some(wanted => !measures(evidence).includes(wanted)) || requestedColors.some(color => !colors(evidence).includes(color)))) return [];
    const id = input.url ? productId(new URL(input.url)) : undefined;
    const fileIdentity = !identityWord || words(assetName).includes(identityWord);
    const fileSpecific = fileIdentity && (Boolean(id && imagePath.includes(id)) || (requestedMeasures.length > 0 && requestedMeasures.every(wanted => measures(imagePath).includes(wanted)) && requestedColors.every(color => colors(imagePath).includes(color))));
    const collection = /carafe|decanter|collection|drinkware|glasses|lifestyle|room|personaliz|monogram/i.test(imagePath);
    const confident = exact && coverage >= .85 && fileSpecific && !collection && !new URL(cleanProductUrl(input.url!)).search && (!explicitSize || selectedSize === explicitSize);
    const confidence = confident ? 'exact' as const : 'suggested' as const;
    // Scene7 uses multiple transforms for the same asset. Keep the best original
    // resolution rather than filling the chooser with duplicate crops.
    const identity = new URL(entry.image);
    const key = identity.hostname === 'cb.scene7.com' ? identity.origin + identity.pathname.split('/$')[0] : entry.image;
    const score = coverage * 40 + (exact ? 100 : 0) + (confident ? 80 : 0) + (fileSpecific ? 25 : 0) - (collection ? 15 : 0) - (/thumb/i.test(entry.image) ? 10 : 0);
    return [{ ...entry, confidence, score, key }];
  }).sort((a, b) => b.score - a.score);
  return ranked.filter(entry => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key); return true;
  }).slice(0, 8).map(({ score: _score, key: _key, ...entry }) => entry);
}

const cache = new Map<string, { expires: number; result: ImageSearchResult }>();
const inFlight = new Map<string, Promise<ImageSearchResult>>();
async function runSearch(input: ImageSearchInput, dependencies: Dependencies): Promise<ImageSearchResult> {
  let candidates: ProductImageCandidate[] = [];
  for (const query of imageQueries(input)) {
    let entries: ImageEntry[] = [];
    try {
      const page = await dependencies.html(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, { timeoutMs: 4000 });
      const token = page.match(/\bvqd\s*=\s*["']([^"']+)["']/)?.[1];
      if (token && /^[\d-]+$/.test(token)) entries = parseDuckImages(await dependencies.json(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token)}&f=,,,&p=1`, 5000));
    } catch { /* Continue with the second public image index. */ }
    candidates = rankImageCandidates(entries, input);
    if (!candidates.length) {
      try { candidates = rankImageCandidates(parseBingImages(await dependencies.html(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}`, { timeoutMs: 4000 })), input); }
      catch { /* The manual image-search link stays available. */ }
    }
    if (candidates.length) break;
  }
  const checked = await Promise.allSettled(candidates.map(async candidate => await dependencies.verify(candidate.image) ? candidate : null));
  const available = checked.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []).slice(0, 6);
  return { candidates: available, image: available.find(candidate => candidate.confidence === 'exact')?.image || '',
    ...(!available.length ? { warning: 'No matching photos are available right now. Try Google Images or upload a photo.' } : {}) };
}

export async function searchProductImages(input: ImageSearchInput, dependencies = defaults): Promise<ImageSearchResult> {
  if (input.url) validateFetchUrl(input.url);
  if (dependencies !== defaults) return runSearch(input, dependencies);
  const key = JSON.stringify([normalize(input.name), normalize(input.size || ''), input.url ? cleanProductUrl(input.url) : '']);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const task = runSearch(input, dependencies).then(result => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { result, expires: Date.now() + (result.candidates.length ? 15 * 60000 : 60000) });
    return result;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
