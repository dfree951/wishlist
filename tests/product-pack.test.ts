import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProductHtml } from '../src/lib/product-fetch';
import { parseAmazonList } from '../src/lib/amazon';
import { packCountFromText } from '../src/lib/product-pack';
import { itemSchema, lowestSameItem } from '../src/lib/items';

const url = 'https://www.amazon.com/Best-Maid-Ounce-Glass-Pickles/dp/B0G547VYM8';

test('extracts the pickle three-pack independently of its jar size', () => {
  const product = parseProductHtml('<span id="productTitle">Best Maid 32 Ounce Glass Jar Pickles - Delicious and Crisp with Every Bite (3 Pack, Sour Pickles)</span><div id="variation_size_name"><span class="selection">32 oz (Pack of 3)</span></div>', url);
  assert.equal(product.packCount, 3);
  assert.equal(product.size, '32 oz');
  assert.equal(packCountFromText('Coffee, 6-pack'), 6);
  assert.equal(packCountFromText('Pack of 12'), 12);
});

test('selected packaging takes precedence over a generic product title', () => {
  const product = parseProductHtml('<span id="productTitle">Pickles (3 Pack)</span><span id="inline-twister-expanded-dimension-text-number_of_items">6</span>', url);
  assert.equal(product.packCount, 6);
});

test('reads explicit package properties but ignores weights and unrelated recommendations', () => {
  const base = '<span id="productTitle">Pickles</span><aside>Recommended: Pickles 12 Pack</aside>';
  assert.equal(parseProductHtml(base + '<table id="productOverview_feature_div"><tr><td>Unit Count</td><td>96 Fl Oz</td></tr></table>', url).packCount, null);
  assert.equal(parseProductHtml(base + '<table id="productDetails_detailBullets_sections1"><tr><th>Item Package Quantity</th><td>3</td></tr></table>', url).packCount, 3);
  assert.equal(packCountFromText('SSD 990 PRO 2TB'), null);
  assert.equal(packCountFromText('Pickles 32 oz'), null);
  assert.equal(packCountFromText('Vitamins 90 count'), null);
  const json = { '@type': 'Product', name: 'Pickles', additionalProperty: { '@type': 'PropertyValue', name: 'Number of Items', value: 3 } };
  assert.equal(parseProductHtml(`<script type="application/ld+json">${JSON.stringify(json)}</script>`, 'https://shop.example.com/pickles').packCount, 3);
});

test('Amazon list imports keep pack quantity and size separate', () => {
  const list = parseAmazonList('<li id="item_1"><a id="itemName_1" href="/dp/B0G547VYM8">Pickles (3 Pack)</a><span id="itemSize_1">32 oz (Pack of 3)</span></li>', 'https://www.amazon.com/hz/wishlist/ls/ABC');
  assert.equal(list.items[0].packCount, 3);
  assert.equal(list.items[0].size, '32 oz');
});

test('old records remain valid; price comparisons do not substitute a smaller pack', () => {
  const input = { owner: 'Dan', name: 'Pickles', url, price: 36.99, packCount: 3,
    alternatives: [{ id: '6a875bda-9d7c-4647-9cc9-4af8723b0555', kind: 'same', name: 'Pickles', url: 'https://example.com/single', price: 12, packCount: 1 }] };
  assert.equal(lowestSameItem(itemSchema.parse(input))?.price, 36.99);
  assert.equal(itemSchema.parse({ ...input, packCount: undefined }).packCount, null);
  assert.equal(itemSchema.safeParse({ ...input, packCount: 0 }).success, false);
});
