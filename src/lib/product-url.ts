// Product, variant, seller, and location parameters are meaningful. Remove only
// established advertising parameters, with retailer-specific rules kept scoped.
const advertising = /^(?:utm_.*|gclid|gclsrc|dclid|fbclid|msclkid|gbraid|wbraid|gad_source|gad_campaignid|campaignid|adgroupid|adpos|creative|targetid|adid|matchtype|network|device|ref|ref_|tag|linkCode|camp)$/i;

export function cleanProductUrl(value: string): string {
  const url = new URL(value);
  const crate = /^(?:www\.)?(?:crateandbarrel|cb2)\.com$/.test(url.hostname);
  const sku = crate ? url.pathname.match(/\/s(\d+)\/?$/)?.[1] : undefined;
  for (const key of new Set(url.searchParams.keys())) {
    const crateAd = crate && ['a', 'pcat', 'ag'].includes(key.toLowerCase());
    const sameSku = crate && key.toLowerCase() === 'pla_sku' && url.searchParams.getAll(key).every(value => value === sku);
    const emptyStore = crate && key.toLowerCase() === 'storeid' && url.searchParams.getAll(key).every(value => !value);
    if (advertising.test(key) || crateAd || sameSku || emptyStore) url.searchParams.delete(key);
  }
  return url.href;
}

export function productMeasurements(value: string): string[] {
  return [...value.matchAll(/\b\d+(?:\.\d+)?[\s-]*(?:fl[\s-]*oz|oz|ml|liters?|tb|gb)\b/gi)]
    .map(match => match[0].replace(/-/g, ' '));
}
