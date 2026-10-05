import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDetails, indexedQueries, lookupProduct, sameProductListing } from '../src/lib/product-lookup';
import type { ProductDetails, ProductMatch } from '../src/lib/items';

const url = 'https://www.walmart.com/ip/15880817975';
const match: ProductMatch = {
  url: 'https://www.walmart.com/ip/Stanley-Quencher-H2-0-FlowState-40oz-Stainless-Steel-Vacuum-Insulated-Tumbler-with-Lid-and-Straw-Pool/15880817975',
  name: 'Stanley Quencher H2.0 FlowState 40oz Stainless Steel Vacuum-Insulated ...',
  snippet: 'Buy Stanley Quencher H2.0 FlowState 40oz Stainless Steel Vacuum-Insulated Tumbler with Lid and Straw - Pool at Walmart.com',
};
const blocked = async (): Promise<ProductDetails> => { throw new Error('Blocked'); };

test('the Walmart search fallback matches the product ID despite its longer indexed URL', async () => {
  const queries: string[] = [];
  const product = await lookupProduct(url, 'Stanley Quencher Pool 40 oz', {
    direct: blocked, search: async query => { queries.push(query); return [match]; },
  });
  assert.equal(product.name, 'Stanley Quencher H2.0 FlowState 40oz Stainless Steel Vacuum-Insulated Tumbler with Lid and Straw - Pool');
  assert.equal(product.url, url); assert.equal(product.size, '40oz');
  assert.equal(product.price, null); assert.equal(product.image, ''); assert.equal(product.checkedAt, null);
  assert.match(product.warning!, /search results/);
  assert.match(queries[0], /Stanley Quencher Pool 40 oz 15880817975/);
});

test('matching rejects different items, store subdomains, variants, and sellers', () => {
  assert.ok(sameProductListing(url, match.url));
  assert.ok(sameProductListing(url + '?utm_source=test', match.url));
  for (const other of [match.url.replace('15880817975', '20185414330'), match.url.replace('www.', 'business.'), match.url.replace('walmart.com', 'walmart.com.evil.example')]) {
    assert.equal(sameProductListing(url, other), false);
    assert.equal(indexedDetails({ ...match, url: other }, url), null);
  }
  const variant = 'https://store.example.com/products/cup?variant=blue';
  assert.equal(sameProductListing(variant, variant.replace('blue', 'green')), false);
  assert.equal(sameProductListing(variant, variant.split('?')[0]), false);
  assert.equal(sameProductListing(url + '?selectedSellerId=1', url + '?selectedSellerId=2'), false);
  assert.equal(sameProductListing(url, 'http://127.0.0.1/ip/15880817975'), false);
  assert.ok(sameProductListing('https://target.com/p/-/A-84292138', 'https://www.target.com/p/lego-orchid/-/A-84292138'));
});

test('indexed pack and size are extracted from the matching product name, not unrelated description text', () => {
  const product = indexedDetails({ ...match, name: 'Pickles 32 oz (Pack of 3) - Walmart.com', snippet: 'Other sizes include 80 oz, 12 pack.' }, url)!;
  assert.equal(product.size, '32 oz'); assert.equal(product.packCount, 3);
  assert.equal(product.name, 'Pickles 32 oz (Pack of 3)');
});

test('only explicitly labeled, unambiguous USD prices are accepted and remain unchecked', () => {
  const product = indexedDetails({ ...match, snippet: 'Current price: $36.99. In stock.' }, url)!;
  assert.equal(product.price, 36.99); assert.equal(product.checkedAt, null);
  for (const snippet of ['$36.99', 'Price: $10...','Price: $36.99, shipping $5.00', 'Price: $2.99 per oz', 'Price: $36.99–49.99', 'Price: $36.99 CAD', 'From price: $36.99', 'Price: $36.99, save $10', 'Price: $36.99 per month']) {
    assert.equal(indexedDetails({ ...match, snippet }, url)!.price, null, snippet);
  }
});

test('complete direct product details skip search and partial results retain authoritative values', async () => {
  const complete: ProductDetails = { name: 'Store name', url, price: 45, image: 'https://example.com/image.jpg', currency: 'USD', size: '40 oz', packCount: 1, checkedAt: new Date().toISOString() };
  let searches = 0;
  const search = async () => { searches++; return [{ ...match, snippet: 'Price: $35.00' }]; };
  assert.deepEqual(await lookupProduct(url, '', { direct: async () => complete, search }), complete);
  assert.equal(searches, 0);
  const recovered = await lookupProduct(url, '', { direct: async () => ({ ...complete, price: null, checkedAt: null }), search });
  assert.equal(recovered.price, 35); assert.equal(recovered.checkedAt, null);
  assert.equal(recovered.name, complete.name); assert.equal(recovered.image, complete.image); assert.equal(recovered.size, complete.size);
});

test('a selected name-search result can be reused without a second search request', async () => {
  const product = await lookupProduct(url, '', { direct: blocked, cached: () => [match], search: async () => { assert.fail('Unnecessary second search'); } });
  assert.equal(product.size, '40oz');
});

test('lookup failures remain honest, reject unsafe URLs, and bound search attempts', async () => {
  let attempts = 0;
  await assert.rejects(lookupProduct(url, 'Stanley', { direct: blocked, search: async () => { attempts++; return [{ ...match, url: match.url.replace('15880817975', '1') }]; } }), /Couldn’t fetch/);
  assert.equal(attempts, 2);
  await assert.rejects(lookupProduct('http://127.0.0.1/item', '', { direct: async () => assert.fail('Unsafe fetch'), search: async () => assert.fail('Unsafe search') }));
  assert.doesNotThrow(() => indexedQueries('https://example.com/products/invalid%item'));
});
