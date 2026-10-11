import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanProductUrl, productMeasurements, normalizeWebsiteUrl } from '../src/lib/product-url';
import { itemSchema, webUrl } from '../src/lib/items';
import { indexedDetails, lookupProduct, sameProductListing } from '../src/lib/product-lookup';
import { parseProductHtml } from '../src/lib/product-fetch';

const clean = 'https://www.crateandbarrel.com/hip-31-oz.-large-red-wine-glass/s477338';
const tracked =
  clean +
  '?a=1552&pla_sku=477338&pcat=HSW&ag=adult&storeid=&targetid=pla-471718177139&campaignid=23702905888&adgroupid=203250578150&adpos=&creative=821520722060&device=m&matchtype=&network=g&gclsrc=aw.ds&gad_source=1&gad_campaignid=23702905888&gbraid=example&gclid=example';
const result = {
  name: 'Hip Oversized Big Red Wine Glass + Reviews | Crate & Barrel',
  url: clean,
  snippet: 'Shop the Hip wine glass.',
};

test('recognizable bare website addresses gain HTTPS without requiring www', () => {
  for (const [entered, expected] of [
    ['google.com', 'https://google.com/'],
    [' www.example.co.uk/item?color=red#photo ', 'https://www.example.co.uk/item?color=red#photo'],
    ['a.co/d/123', 'https://a.co/d/123'],
    ['//example.org/item', 'https://example.org/item'],
    ['http://example.com/item', 'http://example.com/item'],
  ]) {
    assert.equal(normalizeWebsiteUrl(entered), expected);
    assert.equal(webUrl.parse(entered), expected);
  }
  for (const entered of [
    'a wine glass',
    'google',
    'example.com is nice',
    'javascript:alert(1)',
    'ftp://example.com/item',
    'user@example.com',
  ])
    assert.equal(webUrl.safeParse(entered).success, false);
  const item = itemSchema.parse({
    owner: 'Both',
    name: 'Glass',
    price: null,
    url: 'example.com/item',
    alternatives: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        kind: 'same',
        name: 'Glass',
        price: null,
        url: 'other.example.org/item',
      },
    ],
  });
  assert.equal(item.url, 'https://example.com/item');
  assert.equal(item.alternatives[0].url, 'https://other.example.org/item');
});

test('Crate advertising links match the same product without losing meaningful options', () => {
  assert.equal(cleanProductUrl(clean + '?st=Camille%2023-Oz.&color=red'), clean + '?color=red');
  assert.ok(sameProductListing(clean + '?st=Camille%2023-Oz.', clean));
  assert.equal(cleanProductUrl(tracked), clean);
  assert.ok(sameProductListing(tracked, clean));
  assert.equal(sameProductListing(tracked, clean.replace('s477338', 's999999')), false);
  assert.equal(sameProductListing(tracked + '&color=blue', clean + '?color=red'), false);
  assert.equal(sameProductListing(tracked + '&storeid=17', clean), false);
  assert.equal(cleanProductUrl(clean + '?pla_sku=123'), clean + '?pla_sku=123');
  assert.equal(sameProductListing(tracked + '&pla_sku=123', clean), false);
  assert.equal(
    cleanProductUrl('https://store.example.com/item?a=2&color=red&utm_source=google'),
    'https://store.example.com/item?a=2&color=red',
  );
});

test('the shared Crate link recovers an exact search result and the selected 31 oz size', async () => {
  const product = await lookupProduct(tracked, '', {
    direct: async (url) => {
      assert.equal(url, clean);
      throw new Error('Blocked');
    },
    search: async () => [result],
  });
  assert.equal(product.name, 'Hip Oversized Big Red Wine Glass');
  assert.equal(product.size, '31 oz');
  assert.equal(product.price, null);
  assert.equal(product.image, '');
  assert.equal(product.checkedAt, null);
  assert.equal(
    indexedDetails({ ...result, url: clean.replace('s477338', 's999999') }, tracked),
    null,
  );
});

test('hyphenated capacities work in both direct pages and indexed titles', () => {
  assert.deepEqual(productMeasurements('Hip 31-Oz. Large Red Wine Glass'), ['31 Oz']);
  assert.deepEqual(productMeasurements('Samsung SSD 2TB'), ['2TB']);
  const details = parseProductHtml(
    '<meta property="og:title" content="Hip 31-Oz. Large Red Wine Glass">',
    clean,
  );
  assert.equal(details.size, '31 Oz');
});

test('the red Camille link keeps useful unverified hints when the store and search block access', async () => {
  const url =
    'https://www.crateandbarrel.com/camille-23-oz.-long-stem-red-wine-glass/s544517?st=Camille%2023-Oz.';
  const product = await lookupProduct(url, '', {
    direct: async () => {
      throw new Error('Blocked');
    },
    search: async () => [],
  });
  assert.equal(product.name, 'Camille 23 Oz. Long Stem Red Wine Glass');
  assert.equal(product.size, '23 Oz');
  assert.equal(product.price, null);
  assert.equal(product.image, '');
  assert.equal(product.checkedAt, null);
  assert.match(product.warning!, /read from the link/);
});
