import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { itemSchema, webUrl } from '../src/lib/items';
import { body, HttpError } from '../src/lib/http';
import { parseProductHtml, safeImage, validateFetchUrl } from '../src/lib/product-fetch';

test('URL normalization does not enable scripts, credentials, control characters or private fetches', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'https://user:password@example.com',
    'https://example.com/\nitem',
    'https://example.com/\\item',
    'https://example.com/%0d%0aSet-Cookie:bad',
    'https://exam\u202eple.com',
  ]) {
    assert.equal(webUrl.safeParse(url).success, false, url);
    assert.equal(safeImage(url, 'https://example.com'), '', url);
  }
  for (const url of [
    'http://127.0.0.1',
    'http://[::ffff:127.0.0.1]',
    'http://169.254.169.254',
    'http://localhost',
    'http://2130706433',
  ])
    assert.throws(() => validateFetchUrl(url));
});

test('untrusted metadata remains escaped text and cannot set arbitrary item properties', () => {
  const name = '<img src=x onerror=alert(1)>',
    notes = "'; DROP TABLE christmas_items; --";
  const parsed = parseProductHtml(
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, image: 'javascript:alert(1)' })}</script>`,
    'https://example.com/item',
  );
  assert.equal(parsed.name, name);
  assert.equal(parsed.image, '');
  const injected = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"purchased":true}',
  );
  const item = itemSchema.parse({
    ...injected,
    owner: 'Both',
    name,
    notes,
    url: 'example.com/item',
    price: null,
  });
  assert.equal('purchased' in item, false);
  assert.equal(Object.hasOwn(item, '__proto__'), false);
  assert.equal(Object.hasOwn(item, 'constructor'), false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  const markup = renderToStaticMarkup(createElement('p', null, item.name, item.notes));
  assert.ok(!markup.includes('<img'));
  assert.ok(markup.includes('&lt;img'));
  assert.equal(item.notes, notes);
});

test('request parsing stops oversized streams without trusting Content-Length', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(30000).fill(32));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request('https://example.com', {
    method: 'POST',
    body: stream,
    duplex: 'half',
    headers: { 'Content-Length': '2' },
  } as RequestInit);
  await assert.rejects(
    body(request),
    (error) => error instanceof HttpError && error.status === 413,
  );
  assert.equal(canceled, true);
  assert.deepEqual(
    await body(new Request('https://example.com', { method: 'POST', body: '{"name":"Café"}' })),
    { name: 'Café' },
  );
});
