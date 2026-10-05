import { load } from 'cheerio';
import { fetchHtml, validateFetchUrl } from './product-fetch';
import type { ProductMatch } from './items';

export type SearchInput = { name: string; size?: string; notes?: string };
export function productQuery(input: SearchInput) {
  return [input.name, input.size || '', input.notes || ''].map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ').slice(0, 700);
}
export function parseSearchEntries(html: string): ProductMatch[] {
  const $ = load(html);
  const matches: ProductMatch[] = [];
  const seen = new Set<string>();
  $('.result').each((_, element) => {
    const row = $(element);
    const anchor = row.find('.result__a').first();
    const title = anchor.text().replace(/\s+/g, ' ').trim().slice(0, 250);
    const snippet = row.find('.result__snippet').text().replace(/\s+/g, ' ').trim().slice(0, 1000);
    const href = anchor.attr('href');
    if (!title || !href) return;
    try {
      const wrapped = new URL(href, 'https://duckduckgo.com');
      const url = validateFetchUrl(wrapped.hostname === 'duckduckgo.com' ? wrapped.searchParams.get('uddg') || '' : wrapped.href);
      if (/(^|\.)duckduckgo\.com$/.test(url.hostname) || /\/(feed|rss)\/?$/.test(url.pathname) || /\.(pdf|xml)$/i.test(url.pathname)) return;
      url.hash = '';
      if (seen.has(url.href)) return;
      seen.add(url.href);
      matches.push({ name: title, url: url.href, snippet });
    } catch { /* Ignore malformed, non-web, or private destination links. */ }
  });
  return matches.slice(0, 15);
}

function rankMatches(entries: ProductMatch[], input: SearchInput): ProductMatch[] {
  const words = input.name.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return entries.map(match => {
      const text = `${match.name} ${match.snippet}`.toLowerCase();
      const coverage = words.filter(word => text.includes(word)).length / Math.max(1, words.length);
      if (coverage < .5) return { ...match, score: -1 };
      const requestedSize = input.size?.toLowerCase().replace(/\bfl\.?\s*/g, '').replace(/\s+/g, '') || '';
      const sizeMatch = requestedSize && text.replace(/\bfl\.?\s*/g, '').replace(/\s+/g, '').includes(requestedSize);
      const path = new URL(match.url).pathname;
      const score = coverage * 10 + (sizeMatch ? 5 : 0) + (/\/(dp|product|products|ip|p)\//.test(path) ? 3 : 0) - (/category|search/.test(path) ? 2 : 0);
      return { ...match, score };
  }).filter(match => match.score >= 0).sort((a, b) => b.score - a.score).slice(0, 5).map(({ score: _score, ...match }) => ({ ...match, snippet: match.snippet.slice(0, 350) }));
}
export function parseSearchResults(html: string, input: SearchInput): ProductMatch[] {
  return rankMatches(parseSearchEntries(html), input);
}

// Reuse successful public results briefly to reduce requests to the free search.
const cache = new Map<string, { expires: number; matches: ProductMatch[] }>();
export function cachedSearchEntries(): ProductMatch[] {
  return [...cache.values()].filter(entry => entry.expires > Date.now()).flatMap(entry => entry.matches);
}
export async function searchEntries(query: string): Promise<ProductMatch[]> {
  const cached = cache.get(query);
  if (cached && cached.expires > Date.now()) return cached.matches;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
  const html = await fetchHtml(url);
  if (/anomaly\.js|bots use DuckDuckGo|challenge-form|anomaly-modal/i.test(html)) {
    throw new Error('Product search is temporarily unavailable. Try again or paste a product link.');
  }
  const matches = parseSearchEntries(html);
  if (matches.length) {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(query, { expires: Date.now() + 15 * 60_000, matches });
  }
  return matches;
}
export async function searchProducts(input: SearchInput) {
  const query = productQuery(input);
  return { query, matches: rankMatches(await searchEntries(query), input) };
}
