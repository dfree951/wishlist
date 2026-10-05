import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Response, type fetch } from 'undici';
import { fetchProduct, parseProductHtml } from '../src/lib/product-fetch';
import { itemSchema, storeName } from '../src/lib/items';

const schema = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const stanley = 'https://www.stanley1913.com/products/tumbler';
const variants = {
  '@type': 'ProductGroup', name: 'Tumbler | 40 OZ', url: stanley,
  hasVariant: [
    { '@type': 'Product', name: 'Tumbler | 40 OZ', url: stanley + '?variant=1', image: '/blue.jpg', Color: 'Blue', offers: { price: '33.75', priceCurrency: 'USD' } },
    { '@type': 'Product', name: 'Tumbler | 40 OZ', url: stanley + '?variant=2', image: '/sage.jpg', Color: 'Sage Grey', offers: { price: '45.00', priceCurrency: 'USD' } },
  ],
};

test('Shopify-style variants use the selected color, price, and image rather than metadata defaults', () => {
  const html = '<meta property="og:price:amount" content="33.75"><meta property="og:image" content="/blue.jpg">' + schema(variants);
  const product = parseProductHtml(html, stanley + '?variant=2&country=US&currency=USD');
  assert.equal(product.price, 45); assert.equal(product.size, '40 OZ, Sage Grey'); assert.equal(product.image, 'https://www.stanley1913.com/sage.jpg');
  const unspecified = parseProductHtml(html, stanley);
  assert.equal(unspecified.price, null); assert.equal(unspecified.image, '');
  const nonexistent = parseProductHtml(html, stanley + '?variant=999');
  assert.equal(nonexistent.price, null); assert.equal(nonexistent.image, '');
});

test('size-free clothing links keep the selected color and common price without choosing the first size', () => {
  const product = parseProductHtml(schema({ '@type': 'ProductGroup', name: 'Fitness T-Shirt', hasVariant: ['XS','M','L'].map(size => ({ '@type':'Product', mpn:'DX0989-100', name:`Fitness T-Shirt - Size ${size}`, color:'White/Black', size, image:'https://static.nike.com/shirt.png', offers:{ price:32, priceCurrency:'USD' } })) }), 'https://www.nike.com/t/shirt/DX0989-100');
  assert.equal(product.name, 'Fitness T-Shirt'); assert.equal(product.size, 'White/Black'); assert.equal(product.price, 32);
});

test('full product pages include late variant schema even if early metadata appears complete', async () => {
  const html = '<meta property="og:title" content="Tumbler"><meta property="og:price:amount" content="33.75"><meta property="og:image" content="/blue.jpg">' + '<!--' + 'x'.repeat(1_100_000) + '-->' + schema(variants);
  const request: typeof fetch = async () => new Response(html, { headers: { 'Content-Type':'text/html' } });
  const product = await fetchProduct(stanley + '?variant=2', request);
  assert.equal(product.price, 45); assert.match(product.image, /sage\.jpg$/);
});

test('Apple US product price and hero image are scoped to the selected product', () => {
  const html = '<title>Buy AirPods Pro 3 - Apple</title><h1>Buy AirPods Pro 3</h1><a data-slot-name="productSelection" href="/shop/buy-airpods/airpods-pro-3"><span class="current_price">$249.00</span></a><span class="price">$19.99</span><script>window.coldSelectionImage = {"sources":[{"srcSet":"https://store.storeimages.cdn-apple.com/airpods.jpg"}]};</script>';
  const product = parseProductHtml(html, 'https://www.apple.com/shop/buy-airpods/airpods-pro-3');
  assert.equal(product.price, 249); assert.equal(product.name, 'AirPods Pro 3'); assert.match(product.image, /airpods\.jpg$/);
});

test('missing images remain empty and bot-check pages never become wish-list products', async () => {
  assert.equal(parseProductHtml('<meta property="og:title" content="Example product">', 'https://example.com/product').image, '');
  assert.throws(() => parseProductHtml('<title>Robot or human?</title>', 'https://www.walmart.com/blocked'), /blocks automatic/);
  const request: typeof fetch = async () => new Response('Access denied', { status:403 });
  await assert.rejects(fetchProduct('https://www.lego.com/product/1', request), /blocks automatic/);
});

test('priceSpecification offers and explicitly selected product offers are respected', () => {
  const priceSpec = parseProductHtml(schema({ '@type':'Product', name:'Watch', offers:{ '@type':'Offer', priceSpecification:{ price:'59.95', priceCurrency:'USD' } } }), 'https://example.com/watch');
  assert.equal(priceSpec.price, 59.95);
  const selected = parseProductHtml(schema({ '@type':'Product', name:'Watch', offers:[{ url:'https://example.com/watch?variant=1', price:10, priceCurrency:'USD' }, { url:'https://example.com/watch?variant=2', price:20, priceCurrency:'USD' }] }), 'https://example.com/watch?variant=2');
  assert.equal(selected.price, 20);
});

test('gift preferences are optional for existing items and restricted to the requested choices', () => {
  const base = { owner:'Both', name:'Gift', url:'https://a.co/d/example', price:null };
  assert.equal(itemSchema.parse(base).preference, null);
  for (const preference of ['exact','alternatives',null]) assert.equal(itemSchema.parse({ ...base, preference }).preference, preference);
  assert.equal(itemSchema.safeParse({ ...base, preference:'required' }).success, false);
  assert.equal(storeName(base.url), 'amazon.com');
  assert.equal(storeName('https://a.co.example.com/product'), 'a.co.example.com');
});
