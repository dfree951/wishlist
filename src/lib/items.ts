import { z } from 'zod';

export const webUrl = z.string().trim().max(2048).url().refine(value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, 'Use an http or https link without credentials.');
export function normalizeName(value: string) {
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length > 5 && name === name.toUpperCase() && /[A-Z]/.test(name)
    ? name.toLowerCase().replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase())
    : name;
}
export const optionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['same', 'alternative']),
  name: z.string().trim().min(1, 'Add an item name.').max(200).transform(normalizeName),
  url: webUrl,
  image: z.union([webUrl, z.literal('')]).default(''),
  imageSource: z.enum(['automatic', 'manual']).default('automatic'),
  price: z.number().finite().min(0).max(1000000).nullable(),
  currency: z.literal('USD').default('USD'),
  size: z.string().trim().max(100).default(''),
  packCount: z.number().int().min(1).max(9999).nullable().default(null),
  checkedAt: z.string().datetime().nullable().default(null),
});
export const itemSchema = z.object({
  owner: z.enum(['Dan', 'Syd', 'Both']),
  preference: z.enum(['exact', 'alternatives']).nullable().default(null),
  name: z.string().trim().min(1, 'Add an item name.').max(200).transform(normalizeName),
  url: webUrl,
  image: z.union([webUrl, z.literal('')]).default(''),
  imageSource: z.enum(['automatic', 'manual']).default('automatic'),
  price: z.number().finite().min(0).max(1000000).nullable(),
  currency: z.literal('USD').default('USD'),
  size: z.string().trim().max(100).default(''),
  packCount: z.number().int().min(1).max(9999).nullable().default(null),
  notes: z.string().trim().max(2000).default(''),
  checkedAt: z.string().datetime().nullable().default(null),
  alternatives: z.array(optionSchema).max(10).default([]),
});
export type ItemData = z.infer<typeof itemSchema>;
export type Recipient = ItemData['owner'];
export const preferenceLabels = { exact: 'Exact item preferred', alternatives: 'Alternatives welcomed' } as const;
export function matchesRecipient(recipient: Recipient, filter: Recipient) {
  return filter === 'Both' || recipient === 'Both' || recipient === filter;
}
export type BuyingOption = z.infer<typeof optionSchema>;
export type Item = ItemData & { id: string; version: number; purchased?: boolean; purchasedAt?: string | null };
export type ProductDetails = Pick<ItemData, 'name'|'url'|'image'|'price'|'currency'|'size'|'packCount'|'checkedAt'> & { warning?: string };
export type ProductMatch = { name: string; url: string; snippet: string };
export function money(price: number | null, currency = 'USD') {
  if (price === null) return 'Price not listed';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(price); }
  catch { return `${currency} ${price.toFixed(2)}`; }
}
export function storeName(url: string) {
  try { const host = new URL(url).hostname.replace(/^www\./, ''); return host === 'a.co' ? 'amazon.com' : host; } catch { return 'Store'; }
}
export function lowestSameItem(item: ItemData) {
  const candidates = [{ ...item, id: 'primary', kind: 'same' as const }, ...item.alternatives.filter(a => a.kind === 'same' && (a.packCount ?? 1) === (item.packCount ?? 1))];
  return candidates.filter(a => a.price !== null && a.currency === item.currency).sort((a,b) => a.price! - b.price!)[0];
}
