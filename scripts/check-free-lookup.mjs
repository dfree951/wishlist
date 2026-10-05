import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const auth = await fetch(base + '/api/auth', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ password: process.env.OWNER_PASSWORD || 'sedan' }),
});
assert.equal(auth.status, 200);
const cookie = auth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const samples = [
  { name: 'Stanley Quencher Pool 40 oz', url: 'https://www.walmart.com/ip/15880817975' },
  { name: 'AirPods Pro 3', url: 'https://www.apple.com/shop/buy-airpods/airpods-pro-3' },
];
for (const sample of samples) {
  const start = Date.now();
  const response = await fetch(base + '/api/product', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    body: JSON.stringify(sample), signal: AbortSignal.timeout(40_000),
  });
  const data = await response.json();
  if (sample.url.includes('walmart')) {
    assert.ok([200, 422].includes(response.status));
    if (response.ok) {
      assert.match(data.product.name, /Stanley.*Quencher/i);
      if (data.product.warning?.includes('search results')) assert.equal(data.product.checkedAt, null);
    } else assert.match(data.error, /Couldn’t fetch details automatically/);
  } else {
    assert.equal(response.status, 200);
    assert.equal(data.product.name, 'AirPods Pro 3');
    assert.ok(data.product.price > 0); assert.ok(data.product.image);
  }
  console.log(JSON.stringify({ store: new URL(sample.url).hostname, status: response.status, milliseconds: Date.now() - start, ...data }));
}
