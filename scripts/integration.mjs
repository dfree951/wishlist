import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
let cookie = '';
const created = [];
async function request(path, method = 'GET', data, auth = false) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: cookie } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const value = await res.json();
  return { res, value };
}
try {
  let r = await request('/api/items?view=manage');
  assert.equal(r.res.status, 401);
  r = await request('/api/items', 'POST', {}, false);
  assert.equal(r.res.status, 401);
  r = await request('/api/auth', 'POST', { password: 'wrong-password' });
  assert.equal(r.res.status, 401);
  r = await request('/api/auth', 'POST', { password: 'SeDaN' });
  assert.equal(r.res.status, 200);
  cookie = r.res.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie);
  const sample = {
    owner: 'Dan',
    preference: 'exact',
    name: 'TEST ONLY: integration gift',
    url: 'https://example.com/test-gift',
    price: 19.5,
    currency: 'USD',
    image: '',
    size: 'M',
    notes: 'Temporary integration test',
    alternatives: [],
  };
  r = await request('/api/items', 'POST', sample, true);
  assert.equal(r.res.status, 201);
  const item = r.value.item;
  created.push(item.id);
  r = await request('/api/items');
  assert.equal(r.value.items.find((i) => i.id === item.id)?.preference, 'exact');
  const purchases = await Promise.all([
    request(`/api/items/${item.id}/purchase`, 'POST', { purchased: true }),
    request(`/api/items/${item.id}/purchase`, 'POST', { purchased: true }),
  ]);
  assert.deepEqual(purchases.map((p) => p.res.status).sort(), [200, 409]);
  r = await request('/api/items');
  assert.equal(r.value.items.find((i) => i.id === item.id).purchased, true);
  r = await request('/api/items?view=manage', 'GET', undefined, true);
  const managed = r.value.items.find((i) => i.id === item.id);
  assert.ok(managed);
  assert.equal('purchased' in managed, false);
  assert.equal('purchasedAt' in managed, false);
  r = await request(
    `/api/items/${item.id}`,
    'PUT',
    { data: { ...sample, preference: 'alternatives', name: 'TEST ONLY: edited gift' }, version: 1 },
    true,
  );
  assert.equal(r.res.status, 200);
  r = await request(`/api/items/${item.id}`, 'PUT', { data: sample, version: 1 }, true);
  assert.equal(r.res.status, 409);
  r = await request('/api/items');
  assert.equal(r.value.items.find((i) => i.id === item.id).purchased, true);
  assert.equal(r.value.items.find((i) => i.id === item.id).preference, 'alternatives');
  r = await request(`/api/items/${item.id}/purchase`, 'POST', { purchased: false });
  assert.equal(r.res.status, 200);
  r = await request(`/api/items/${item.id}/purchase`, 'POST', { purchased: true });
  assert.equal(r.res.status, 200);
  r = await request(
    `/api/items/${item.id}`,
    'PUT',
    { data: { ...sample, unlimitedPurchases: true }, version: 2 },
    true,
  );
  assert.equal(r.res.status, 200);
  r = await request('/api/items');
  const repeat = r.value.items.find((i) => i.id === item.id);
  assert.equal(repeat.unlimitedPurchases, true);
  assert.equal(repeat.purchased, false);
  assert.equal(repeat.purchasedAt, null);
  r = await request(`/api/items/${item.id}/purchase`, 'POST', { purchased: true });
  assert.equal(r.res.status, 409);
  const quantified = { ...sample, name: 'TEST ONLY: quantity gift', packCount: 4 };
  r = await request('/api/items', 'POST', quantified, true);
  assert.equal(r.res.status, 201);
  const quantifiedId = r.value.item.id;
  created.push(quantifiedId);
  for (const quantity of [0, -1, 1.5, 10000, '2']) {
    r = await request(`/api/items/${quantifiedId}/purchase`, 'POST', { purchased: true, quantity });
    assert.equal(r.res.status, 400);
  }
  r = await request(`/api/items/${quantifiedId}/purchase`, 'POST', {
    purchased: true,
    quantity: 2,
  });
  assert.equal(r.res.status, 200);
  assert.equal(r.value.purchased, false);
  assert.equal(r.value.purchasedQuantity, 2);
  r = await request('/api/items');
  let partial = r.value.items.find((i) => i.id === quantifiedId);
  assert.equal(partial.purchasedQuantity, 2);
  assert.equal(partial.purchased, false);
  assert.equal('_purchasedQuantity' in partial, false);
  r = await request('/api/items?view=manage', 'GET', undefined, true);
  const privateItem = r.value.items.find((i) => i.id === quantifiedId);
  assert.equal('purchasedQuantity' in privateItem, false);
  assert.equal('_purchasedQuantity' in privateItem, false);
  r = await request(
    `/api/items/${quantifiedId}`,
    'PUT',
    { data: { ...quantified, name: 'TEST ONLY: edited quantity gift' }, version: 1 },
    true,
  );
  assert.equal(r.res.status, 200);
  const increments = await Promise.all([
    request(`/api/items/${quantifiedId}/purchase`, 'POST', { purchased: true, quantity: 1 }),
    request(`/api/items/${quantifiedId}/purchase`, 'POST', { purchased: true, quantity: 1 }),
  ]);
  assert.deepEqual(
    increments.map((p) => p.res.status),
    [200, 200],
  );
  r = await request('/api/items');
  partial = r.value.items.find((i) => i.id === quantifiedId);
  assert.equal(partial.purchasedQuantity, 4);
  assert.equal(partial.purchased, true);
  r = await request(`/api/items/${quantifiedId}/purchase`, 'POST', {
    purchased: true,
    quantity: 1,
  });
  assert.equal(r.res.status, 409);
  r = await request(`/api/items/${quantifiedId}/purchase`, 'POST', {
    purchased: false,
    quantity: 1,
  });
  assert.equal(r.res.status, 200);
  assert.equal(r.value.purchasedQuantity, 3);
  assert.equal(r.value.purchased, false);
  r = await request(`/api/items/${quantifiedId}/purchase`, 'POST', { purchased: false });
  assert.equal(r.res.status, 200);
  assert.equal(r.value.purchasedQuantity, 0);
  r = await request(`/api/items/${quantifiedId}/purchase`, 'POST', {
    purchased: true,
    quantity: 6,
  });
  assert.equal(r.res.status, 200);
  assert.equal(r.value.purchasedQuantity, 6);
  assert.equal(r.value.purchased, true);
  r = await request(
    `/api/items/${quantifiedId}`,
    'PUT',
    { data: { ...quantified, packCount: 8 }, version: 2 },
    true,
  );
  assert.equal(r.res.status, 200);
  r = await request('/api/items');
  partial = r.value.items.find((i) => i.id === quantifiedId);
  assert.equal(partial.purchasedQuantity, 6);
  assert.equal(partial.purchased, false);
  r = await request('/api/product', 'POST', { url: 'http://127.0.0.1:3000' }, true);
  assert.equal(r.res.status, 422);
  const html = await readFile(
    new URL('../tests/fixtures/amazon-list.html', import.meta.url),
    'utf8',
  );
  r = await request(
    '/api/amazon',
    'POST',
    { url: 'https://www.amazon.com/hz/wishlist/ls/TESTIMPORT', html },
    true,
  );
  assert.equal(r.res.status, 200);
  assert.equal(r.value.items.length, 2);
  const importItems = r.value.items.map((i) => ({
    ...i,
    owner: 'Syd',
    notes: 'Temporary integration import',
    alternatives: [],
  }));
  r = await request('/api/amazon/import', 'POST', { items: importItems }, true);
  assert.equal(r.res.status, 200);
  assert.equal(r.value.imported, 2);
  let list = await request('/api/items?view=manage', 'GET', undefined, true);
  created.push(
    ...list.value.items.filter((i) => i.notes === 'Temporary integration import').map((i) => i.id),
  );
  r = await request('/api/amazon/import', 'POST', { items: importItems }, true);
  assert.equal(r.value.imported, 0);
  assert.equal(r.value.skipped, 2);
  const hostile = await fetch(base + '/api/items/' + item.id + '/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ purchased: true }),
  });
  assert.equal(hostile.status, 403);
  console.log(
    'PASS: auth, public access, shared persistence, atomic purchase, owner privacy, edit conflicts, undo, SSRF, Amazon preview/import, duplicate skip, origin checks.',
  );
} finally {
  const list = await request('/api/items?view=manage', 'GET', undefined, true);
  for (const id of created) {
    const item = list.value.items?.find((i) => i.id === id);
    if (item) await request(`/api/items/${id}`, 'DELETE', { version: item.version }, true);
  }
  if (cookie) await request('/api/auth', 'DELETE', undefined, true);
  console.log('Temporary test items removed.');
}
