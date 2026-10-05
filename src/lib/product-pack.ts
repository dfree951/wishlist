// Only explicit packaging counts qualify. "32 oz", "96 fluid ounces", and
// order quantities describe something different from the number of items sold.
const packPattern = /\b(?:(?:packs?|cases?|sets?|bundles?)\s+of\s+(\d{1,4})|(\d{1,4})\s*[-–]?\s*(?:packs?|pk))\b/i;

export function packCountFromText(text: string): number | null {
  const match = text.match(packPattern);
  return match ? packQuantity(match[1] || match[2]) : null;
}

export function packQuantity(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!/^\d{1,4}$/.test(text)) return null;
  const count = Number(text);
  return count >= 1 ? count : null;
}

export function isPackProperty(name: string) {
  return /^(?:number of items|item package quantity|package quantity|pack quantity|pack size)$/i.test(name.replace(/[\u200e\u200f:]/g, '').trim());
}

export function withoutPackSize(size: string) {
  const match = size.match(packPattern);
  if (!match) return size;
  return size.replace(match[0], '').replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ').replace(/^[\s,;-]+|[\s,;-]+$/g, '').trim().replace(/^\(([^()]*)\)$/, '$1');
}
