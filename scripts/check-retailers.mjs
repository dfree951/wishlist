import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const base = process.env.TEST_BASE_URL || 'https://syd-and-dan-christmas.vercel.app';
const output = process.argv[2] || 'test-results/retailer-checks.json';
const samples = JSON.parse(await readFile(new URL('./retailer-samples.json', import.meta.url), 'utf8'));
const auth = await fetch(base + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.OWNER_PASSWORD || 'sedan' }) });
assert.equal(auth.status, 200, 'Sign-in failed');
const cookie = auth.headers.get('set-cookie').split(';')[0];
const results = [];
let next = 0;
async function worker() {
  while (next < samples.length) {
    const sample = samples[next++];
    const started = Date.now();
    try {
      const response = await fetch(base + '/api/product', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: sample.url }), signal: AbortSignal.timeout(25000) });
      const result = { ...sample, status: response.status, milliseconds: Date.now() - started, ...await response.json() };
      if (result.product?.image) {
        try {
          const image = await fetch(result.product.image, { method: 'HEAD', signal: AbortSignal.timeout(7000) });
          result.imageCheck = { status: image.status, contentType: image.headers.get('content-type'), valid: image.ok && /^image\//.test(image.headers.get('content-type') || '') };
        } catch (error) { result.imageCheck = { valid: false, error: error.message }; }
      }
      results.push(result);
      console.log(JSON.stringify({ store: result.store, status: result.status, name: result.product?.name, price: result.product?.price, imageVerified: result.imageCheck?.valid, size: result.product?.size, packCount: result.product?.packCount, warning: result.product?.warning, error: result.error }));
    } catch (error) { results.push({ ...sample, error: error.message }); console.log(sample.store + ': ' + error.message); }
  }
}
await Promise.all([worker(), worker(), worker()]);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), base, results }, null, 2));
console.log('Results saved to ' + output + '. No wish-list items created or changed.');
