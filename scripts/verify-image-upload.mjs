import assert from 'node:assert/strict';
import sharp from 'sharp';
import { del } from '@vercel/blob';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
let cookie = '', imageUrl = '', item;
const photo = await sharp({ create: { width: 2200, height: 1200, channels: 3, background: '#254736' } }).png().toBuffer();
function form(bytes = photo) { const body = new FormData(); body.set('image', new Blob([bytes], { type: 'image/png' }), 'upload-test.png'); return body; }
async function upload(body, headers = {}) { return fetch(base + '/api/images', { method: 'POST', headers, body }); }
async function api(path, method = 'GET', data) {
  const response = await fetch(base + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json(); assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`); return result;
}
try {
  assert.equal((await upload(form())).status, 401);
  const auth = await fetch(base + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'SeDaN' }) });
  assert.equal(auth.status, 200); cookie = auth.headers.get('set-cookie').split(';')[0];
  assert.equal((await upload(form(), { Cookie: cookie, Origin: 'https://example.com' })).status, 403);
  assert.equal((await upload(form('not an image'), { Cookie: cookie })).status, 400);
  const uploaded = await upload(form(), { Cookie: cookie, Origin: base });
  const result = await uploaded.json(); assert.equal(uploaded.status, 201, JSON.stringify(result)); imageUrl = result.url;
  const publicPhoto = await fetch(imageUrl); assert.equal(publicPhoto.status, 200); assert.match(publicPhoto.headers.get('content-type'), /image\/webp/);
  const metadata = await sharp(Buffer.from(await publicPhoto.arrayBuffer())).metadata(); assert.equal(metadata.width, 1600); assert.equal(metadata.exif, undefined);
  item = (await api('/api/items', 'POST', { owner: 'Both', name: 'TEST ONLY: uploaded image', url: 'https://example.com/upload-test', price: null, image: imageUrl, imageSource: 'manual', notes: 'Temporary image upload verification' })).item;
  const publicList = await fetch(base + '/api/items').then(r => r.json());
  const saved = publicList.items.find(i => i.id === item.id); assert.equal(saved.image, imageUrl); assert.equal(saved.imageSource, 'manual');
  console.log('PASS: upload authentication, origin checks, invalid file rejection, real image resizing, public image access, shared item persistence.');
} finally {
  if (item) await api('/api/items/' + item.id, 'DELETE', { version: item.version });
  if (imageUrl) await del(imageUrl);
  if (cookie) await api('/api/auth', 'DELETE');
  console.log('Temporary image and item removed.');
}
