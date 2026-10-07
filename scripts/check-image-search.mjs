import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'https://syd-and-dan-christmas.vercel.app';
const origin = process.env.TEST_FRONTEND_ORIGIN || 'https://dfree951.github.io';
const auth = await fetch(base + '/api/auth', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Session-Mode': 'bearer' },
  body: JSON.stringify({ password: process.env.OWNER_PASSWORD || 'sedan' }),
});
assert.equal(auth.status, 200, 'Sign-in failed');
const { token } = await auth.json();
assert.ok(token);
const headers = { 'Content-Type': 'application/json', Origin: origin, Authorization: `Bearer ${token}` };
const samples = [
  { name: 'Camille 23 Oz. Long Stem Red Wine Glass', size: '23 Oz', asset: /CamilleRedWine23oz/, url: 'https://www.crateandbarrel.com/camille-23-oz.-long-stem-red-wine-glass/s544517?st=Camille%2023-Oz.' },
  { name: 'Camille 13 Oz. Long Stem White Wine Glass', size: '13 Oz', asset: /Camille(?:WhiteWine13oz|_LongStemWineGlass_330817)/, url: 'https://www.crateandbarrel.com/camille-13-oz.-long-stem-white-wine-glass/s330817?a=1552&pla_sku=330817&storeid=' },
];
for (const { asset, ...sample } of samples) {
  const response = await fetch(base + '/api/product', { method: 'POST', headers, body: JSON.stringify(sample), signal: AbortSignal.timeout(75000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const { product } = await response.json();
  assert.match(product.image, asset, 'The selected glass must have its own matching photo');
  assert.ok(product.imageCandidates?.length);
  const photo = await fetch(product.image, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
  assert.ok(photo.ok); assert.match(photo.headers.get('content-type'), /^image\//);
  console.log(JSON.stringify({ name: product.name, size: product.size, image: product.image, candidates: product.imageCandidates.length, price: product.price, status: response.status }));
}
const noAuth = await fetch(base + '/api/product/images', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(samples[0]) });
assert.equal(noAuth.status, 401);
const unsafe = await fetch(base + '/api/product/images', { method: 'POST', headers, body: JSON.stringify({ name: samples[0].name, url: 'http://127.0.0.1/private' }) });
assert.ok([400, 422].includes(unsafe.status), 'Private destinations should produce a validation response');
console.log('Image search verified with the Pages bearer-session flow. No wish-list items created or changed.');
