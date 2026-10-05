type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const list = (value: unknown): Data[] => (Array.isArray(value) ? value : [value]).map(record).filter(v => Object.keys(v).length);
const types = (value: Data) => (Array.isArray(value['@type']) ? value['@type'] : [value['@type']]).map(v => String(v).split(/[\/#]/).pop());
const common = (values: unknown[]) => values.length && values[0] !== undefined && values.every(v => JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : undefined;

function urls(product: Data) {
  return [product.url, product['@id'], ...list(product.offers).map(o => o.url)].filter(v => typeof v === 'string') as string[];
}

function score(product: Data, target: URL, canonical: URL) {
  let best = 0;
  for (const value of urls(product)) {
    try {
      const candidate = new URL(value, target);
      if (candidate.hostname !== target.hostname) continue;
      let rank = candidate.pathname === target.pathname || candidate.pathname === canonical.pathname ? 10 : 0;
      if (target.hash && candidate.hash === target.hash) rank += 100;
      for (const [key, selected] of target.searchParams) {
        if (candidate.searchParams.has(key)) rank += candidate.searchParams.get(key) === selected ? 1000 : -1000;
      }
      best = Math.max(best, rank);
    } catch { /* Ignore malformed schema URLs. */ }
  }
  // Some stores use different slugs in schema URLs but the same style identifier.
  if (product.mpn && target.pathname.split('/').pop() === String(product.mpn)) best += 20;
  return best;
}

function chooseOffer(product: Data, target: URL, canonical: URL) {
  const offers = list(product.offers).filter(o => o.price !== undefined || record(o.priceSpecification).price !== undefined);
  if (!offers.length) return {};
  const ranks = offers.map(o => score(o, target, canonical));
  const max = Math.max(...ranks);
  const matches = offers.filter((_, i) => ranks[i] === max);
  if (matches.length === 1) return matches[0];
  const prices = matches.map(o => String(o.price ?? record(o.priceSpecification).price));
  const currencies = matches.map(o => o.priceCurrency ?? record(o.priceSpecification).priceCurrency);
  return common(prices) !== undefined && common(currencies) !== undefined ? matches[0] : {};
}

export function structuredProduct(roots: unknown[], url: string, canonicalUrl = url): { product: Data; offer: Data; variants: boolean } {
  const target = new URL(url);
  let canonical = target;
  try { const candidate = new URL(canonicalUrl, target); if (candidate.hostname === target.hostname) canonical = candidate; } catch { /* Keep original URL. */ }
  const products: Data[] = [], groups: Data[] = [];
  function visit(value: unknown, depth = 0) {
    if (depth > 15 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(v => visit(v, depth + 1)); return; }
    const data = record(value), kind = types(data);
    if (kind.includes('ItemList') || kind.includes('BreadcrumbList')) return;
    if (kind.includes('ProductGroup')) { groups.push(data); return; }
    if (kind.includes('Product')) { products.push(data); return; }
    for (const [key, child] of Object.entries(data)) if (key !== '@context') visit(child, depth + 1);
  }
  roots.forEach(root => visit(root));
  const rankedGroups = groups.sort((a,b) => score(b,target,canonical) - score(a,target,canonical));
  const group = rankedGroups[0];
  let candidates = group ? list(group.hasVariant) : products;
  if (!candidates.length) return { product: group || {}, offer: chooseOffer(group || {}, target, canonical), variants: false };
  const ranks = candidates.map(p => score(p, target, canonical));
  const max = Math.max(...ranks);
  candidates = candidates.filter((_,i) => ranks[i] === max);
  // Never use another variant when the URL contains an explicit variant selector.
  for (const key of ['variant', 'sku', 'pid', 'size', 'color']) {
    const selected = target.searchParams.get(key);
    if (!selected) continue;
    const matching = candidates.filter(p => urls(p).some(value => {
      try { return new URL(value, target).searchParams.get(key) === selected; } catch { return false; }
    }));
    if (matching.length) candidates = matching;
    else if (group) candidates = [];
  }
  if (candidates.length === 1) {
    const product = { ...group, ...candidates[0] };
    return { product, offer: chooseOffer(product, target, canonical), variants: !!group || list(product.offers).length > 1 };
  }
  // A size-free Nike link can have many schema variants. Only import fields that
  // agree across them; selecting the first one would silently choose size XS.
  const product: Data = { name: group?.name || common(candidates.map(p => p.name)) };
  for (const field of ['image', 'size', 'color', 'Color', 'additionalProperty']) product[field] = common(candidates.map(p => p[field]));
  const offers = candidates.map(p => chooseOffer(p, target, canonical));
  const price = common(offers.map(o => o.price ?? record(o.priceSpecification).price));
  const priceCurrency = common(offers.map(o => o.priceCurrency ?? record(o.priceSpecification).priceCurrency));
  return { product, offer: price !== undefined ? { price, priceCurrency } : {}, variants: true };
}
