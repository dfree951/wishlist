import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemSchema, type ProductDetails } from '../src/lib/items';
import { mergeProductDetails, withProductUrl } from '../src/lib/product-editor';

const old = itemSchema.parse({ owner: 'Dan', name: 'Pickles', url: 'https://www.amazon.com/dp/B0G547VYM8', price: 36.99, size: '32 oz', packCount: 3, image: 'https://example.com/old.jpg' });
const product: ProductDetails = { name: 'Best Maid Hamburger Slices 80oz Pickles', url: 'https://www.amazon.com/dp/B00K4JSWPM', price: 20.99, currency: 'USD', size: '80 Fl Oz', packCount: 1, image: 'https://example.com/new.jpg', checkedAt: '2026-10-05T17:00:00.000Z' };

test('changing a listing clears stale price, pack, size, and automatic photo before lookup', () => {
  const changed = withProductUrl(old, 'https://a.co/d/0dXglrCs');
  assert.equal(changed.price, null); assert.equal(changed.packCount, null);
  assert.equal(changed.size, ''); assert.equal(changed.image, '');
  const updated = mergeProductDetails(changed, changed, product);
  assert.equal(updated.price, 20.99); assert.equal(updated.packCount, 1); assert.equal(updated.size, '80 Fl Oz');
  const unreadable = mergeProductDetails(old, old, { ...product, price: null, packCount: null, size: '', checkedAt: null });
  assert.equal(unreadable.price, null); assert.equal(unreadable.packCount, null); assert.equal(unreadable.size, '');
});

test('lookup retains uploaded images and edits made while waiting; ignores responses for old links', () => {
  const manual = { ...old, imageSource: 'manual' as const };
  const changed = withProductUrl(manual, product.url);
  assert.equal(changed.image, old.image);
  const latest = { ...changed, price: 18, size: 'Custom size', packCount: 2, name: 'Custom name' };
  const result = mergeProductDetails(latest, changed, product);
  assert.equal(result.image, old.image); assert.equal(result.price, 18);
  assert.equal(result.packCount, 2); assert.equal(result.size, 'Custom size'); assert.equal(result.name, 'Custom name');
  assert.equal(result.checkedAt, null);
  assert.deepEqual(mergeProductDetails(changed, old, product), changed);
});

test('name searches retain entered details for a first link and replace details from a previous listing', () => {
  const initial = { ...old, url: '', price: null, image: '', size: '80 oz', packCount: null };
  const linked = withProductUrl(initial, product.url);
  // Typing a first URL character by character must retain the search details.
  const typing = withProductUrl({ ...initial, url: 'https:' }, 'https://a.co', '');
  assert.equal(typing.size, '80 oz');
  const result = mergeProductDetails(linked, linked, product, true);
  assert.equal(result.name, 'Pickles'); assert.equal(result.size, '80 oz');
  assert.equal(result.price, 20.99); assert.equal(result.packCount, 1);
  const replacement = withProductUrl(old, product.url);
  assert.equal(mergeProductDetails(replacement, replacement, product, true).price, 20.99);
});
