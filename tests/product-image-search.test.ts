import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Response, type fetch } from 'undici';
import { imageQueries, parseBingImages, parseDuckImages, rankImageCandidates, searchProductImages } from '../src/lib/product-image-search';
import { verifyProductImage } from '../src/lib/product-fetch';

const url = 'https://www.crateandbarrel.com/camille-23-oz.-long-stem-red-wine-glass/s544517';
const input = { name: 'Camille 23 Oz. Long Stem Red Wine Glass', size: '23 Oz', url };
const photo = 'https://cb.scene7.com/is/image/Crate/CamilleRedWine23ozSSS21';
const row = (image = photo, source = url) => ({ title: 'Camille 23-Oz. Long-Stem Wine Glass - Red + Reviews | Crate & Barrel', image, thumbnail: 'https://images.example.com/thumb.jpg', url: source, width: 800, height: 800 });

test('matching requires product identity, capacity, color and photo filename evidence', () => {
  const entries = parseDuckImages({ results: [
    row(photo + '?$web_pdp_main_carousel_thumb_med$'), row(photo + '?$web_pdp_main_carousel_med$'),
    row(photo.replace('RedWine23oz', 'WhiteWine13oz')),
    row(photo.replace('Camille', 'Edge')),
    row('https://cb.scene7.com/is/image/Crate/RabbitWingedCorkscrewSHS16'),
    row('https://cb.scene7.com/is/image/Crate/VinturiRedWineAeratorDG17'),
    row('https://cb.scene7.com/is/image/Crate/CamilleWineGlassesNC15'),
    row(photo, url.replace('s544517', 's999999')),
  ] });
  const candidates = rankImageCandidates(entries, input);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].confidence, 'exact');
  assert.equal(candidates[0].image, photo + '?wid=800&hei=800&fmt=jpeg&qlt=85');
  assert.equal(candidates[1].confidence, 'suggested');
  assert.match(candidates[1].image, /WineGlasses/);
});

test('the white-glass page cannot auto-select the similarly sized Edge collection image', () => {
  const white = { name: 'Camille 13 Oz. Long Stem White Wine Glass', size: '13 Oz', url: url.replace('23-oz.', '13-oz.').replace('red-wine', 'white-wine').replace('s544517', 's330817') };
  const entries = parseDuckImages({ results: ['EdgeWhiteWine13ozSSS21', 'CamilleWhiteWine13ozSSS21'].map(asset => ({ ...row(), title: white.name, url: white.url, image: 'https://cb.scene7.com/is/image/Crate/' + asset })) });
  const candidates = rankImageCandidates(entries, white);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].confidence, 'exact');
  assert.match(candidates[0].image, /CamilleWhiteWine13oz/);
});

test('off-store matches need strong name and variant evidence and always require selection', () => {
  const entries = parseDuckImages({ results: [row('https://images.example.com/CamilleRedWine23oz.jpg', 'https://store.example.com/camille-red-wine-glass'), { ...row(), title: 'Camille 23 Oz. Red Wine Glass', url: 'https://store.example.com/camille', image: 'https://images.example.com/CamilleBlueWine23oz.jpg' }] });
  const candidates = rankImageCandidates(entries, input);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].confidence, 'suggested');
  const variantUrl = url + '?color=red';
  assert.equal(rankImageCandidates(parseDuckImages({ results: [row(photo, variantUrl)] }), { ...input, url: variantUrl })[0].confidence, 'suggested');
});

test('image parsers reject invalid data, private destinations and icon-sized images', () => {
  for (const data of [null, 'broken', {}, { results: 'broken' }]) assert.deepEqual(parseDuckImages(data), []);
  assert.deepEqual(parseDuckImages({ results: [row('http://127.0.0.1/photo'), row(photo, 'http://10.0.0.1/product'), { ...row(), width: 32 }, { ...row(), image: 'data:image/png;base64,abc' }] }), []);
  const metadata = JSON.stringify({ t: input.name, murl: photo, turl: 'https://images.example.com/thumb.jpg', purl: url }).replace(/"/g, '&quot;');
  assert.equal(parseBingImages(`<a class="iusc" m="${metadata}"></a><a class="iusc" m="invalid"></a>`).length, 1);
});

test('blocked free providers fall back and verified images alone can be auto-filled', async () => {
  const result = await searchProductImages(input, {
    html: async value => {
      if (value.includes('duckduckgo')) throw new Error('Blocked');
      return `<a class="iusc" m='${JSON.stringify({ t: input.name, murl: photo, turl: photo, purl: url })}'></a>`;
    },
    json: async () => assert.fail('No token'), verify: async () => true,
  });
  assert.equal(result.candidates.length, 1); assert.ok(result.image);
  const unavailable = await searchProductImages(input, {
    html: async () => 'vqd="4-123"', json: async () => ({ results: [row()] }), verify: async () => false,
  });
  assert.deepEqual(unavailable.candidates, []); assert.equal(unavailable.image, ''); assert.match(unavailable.warning!, /Google Images/);
});

test('unsafe input never reaches a search provider and queries include the listing SKU', async () => {
  assert.match(imageQueries(input)[0], /544517/);
  await assert.rejects(searchProductImages({ ...input, url: 'http://127.0.0.1/product' }, { html: async () => assert.fail('Unsafe search'), json: async () => assert.fail('Unsafe search'), verify: async () => assert.fail('Unsafe image') }));
});

test('image verification checks content type, handles HEAD fallback and rejects private redirects', async () => {
  const image: typeof fetch = async () => new Response(null, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '1000' } });
  assert.equal(await verifyProductImage(photo, image), true);
  assert.equal(await verifyProductImage(photo, async () => new Response(null, { headers: { 'Content-Type': 'text/html' } })), false);
  let requests = 0;
  assert.equal(await verifyProductImage(photo, async (_url, options) => {
    if (++requests === 1) { assert.equal(options?.method, 'HEAD'); return new Response(null, { status: 405 }); }
    assert.equal(options?.method, 'GET'); assert.equal((options?.headers as Record<string, string>).Range, 'bytes=0-0'); return image(_url, options);
  }), true);
  requests = 0;
  assert.equal(await verifyProductImage(photo, async () => { requests++; return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }); }), false);
  assert.equal(requests, 1);
});
