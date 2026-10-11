// Product, variant, seller, and location parameters are meaningful. Remove only
// established advertising parameters, with retailer-specific rules kept scoped.
const advertising =
  /^(?:utm_.*|gclid|gclsrc|dclid|fbclid|msclkid|gbraid|wbraid|gad_source|gad_campaignid|campaignid|adgroupid|adpos|creative|targetid|adid|matchtype|network|device|ref|ref_|tag|linkCode|camp)$/i;

export const hasUnsafeUrlCharacters = (value: string) =>
  /[\u0000-\u001f\u007f\\\u202a-\u202e\u2066-\u2069]|%(?:00|0a|0d)/i.test(value);

export function normalizeWebsiteUrl(value: string): string {
  const entered = value.trim();
  if (hasUnsafeUrlCharacters(entered)) return entered;
  if (/^https?:\/\//i.test(entered)) return entered;
  const bare = entered.replace(/^\/\//, '');
  if (
    /\s/.test(bare) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#]|$)/i.test(bare)
  )
    return entered;
  try {
    const url = new URL(`https://${bare}`);
    if (url.username || url.password) return entered;
    return url.href;
  } catch {
    return entered;
  }
}

export function cleanProductUrl(value: string): string {
  const url = new URL(value);
  const crate = /^(?:www\.)?(?:crateandbarrel|cb2)\.com$/.test(url.hostname);
  const sku = crate ? url.pathname.match(/\/s(\d+)\/?$/)?.[1] : undefined;
  for (const key of new Set(url.searchParams.keys())) {
    const crateAd = crate && ['a', 'pcat', 'ag', 'st'].includes(key.toLowerCase());
    const sameSku =
      crate &&
      key.toLowerCase() === 'pla_sku' &&
      url.searchParams.getAll(key).every((value) => value === sku);
    const emptyStore =
      crate &&
      key.toLowerCase() === 'storeid' &&
      url.searchParams.getAll(key).every((value) => !value);
    if (advertising.test(key) || crateAd || sameSku || emptyStore) url.searchParams.delete(key);
  }
  return url.href;
}

export function productMeasurements(value: string): string[] {
  return [...value.matchAll(/\b\d+(?:\.\d+)?[\s-]*(?:fl[\s-]*oz|oz|ml|liters?|tb|gb)\b/gi)].map(
    (match) => match[0].replace(/-/g, ' '),
  );
}
