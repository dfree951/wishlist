import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.argv[2] || 'http://localhost:3000';
const origin = 'https://dfree951.github.io';
let token = '';
let createdId;
async function request(path, method = 'GET', data, authenticated = false) {
  const response = await fetch(base + path, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Session-Mode': 'bearer',
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  return { response, data: await response.json() };
}
try {
  const preflight = await fetch(base + '/api/auth', { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,x-session-mode,authorization',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/i);
  const hostile = await fetch(base + '/api/auth', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(hostile.status, 403);
  assert.equal(hostile.headers.has('access-control-allow-origin'), false);
  assert.equal((await request('/api/items?view=manage')).response.status, 401);
  const login = await request('/api/auth', 'POST', { password: process.env.OWNER_PASSWORD });
  assert.equal(login.response.status, 200);
  assert.equal(login.response.headers.has('set-cookie'), false);
  assert.equal(typeof login.data.token, 'string');
  token = login.data.token;
  assert.equal((await request('/api/auth', 'GET', undefined, true)).data.authenticated, true);
  const originalToken = token;
  token = token + '.invalid';
  assert.equal((await request('/api/items?view=manage', 'GET', undefined, true)).response.status, 401);
  token = originalToken;
  const sample = { owner: 'Dan', name: `TEST ONLY: Pages connection ${randomUUID()}`, url: 'https://example.com/test',
    price: 1, currency: 'USD', image: '', size: '', notes: 'Temporary split-hosting verification', alternatives: [] };
  const created = await request('/api/items', 'POST', sample, true);
  assert.equal(created.response.status, 201);
  createdId = created.data.item.id;
  assert.equal((await request(`/api/items/${createdId}/purchase`, 'POST', { purchased: true })).response.status, 200);
  const publicList = await request('/api/items');
  assert.equal(publicList.data.items.find(item => item.id === createdId).purchased, true);
  const ownerList = await request('/api/items?view=manage', 'GET', undefined, true);
  assert.equal('purchased' in ownerList.data.items.find(item => item.id === createdId), false);
  assert.equal((await request(`/api/items/${createdId}`, 'PUT', { data: { ...sample, notes: 'Edited test' }, version: 1 }, true)).response.status, 200);
  assert.equal((await request(`/api/items/${createdId}/purchase`, 'POST', { purchased: false })).response.status, 200);
  assert.equal((await request('/api/product', 'POST', { url: 'http://127.0.0.1' }, true)).response.status, 422);
  // Invalid upload payload reaches authenticated validation without writing a Blob.
  assert.equal((await request('/api/images', 'POST', {}, true)).response.status, 400);
  console.log('PASS: CORS/preflight, hostile origins, bearer login, tampered token, CRUD, purchase/undo, owner privacy, product and upload authorization.');
} finally {
  if (createdId) {
    const list = await request('/api/items?view=manage', 'GET', undefined, true);
    const item = list.data.items?.find(item => item.id === createdId);
    if (item) assert.equal((await request(`/api/items/${createdId}`, 'DELETE', { version: item.version }, true)).response.status, 200);
    console.log('Temporary test item removed.');
  }
  if (token) assert.equal((await request('/api/auth', 'DELETE', undefined, true)).response.status, 200);
}
