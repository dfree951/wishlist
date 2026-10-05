import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { MAX_UPLOAD_BYTES, normalizeUpload } from '../src/lib/image-upload';
import { itemSchema } from '../src/lib/items';

test('uploaded photos are resized and served as real WebP images', async () => {
  const source = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#7a8869' } }).jpeg().toBuffer();
  const output = await normalizeUpload(source);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 1067);
  assert.ok(output.length < source.length);
});

test('photo orientation is applied and metadata is stripped', async () => {
  const source = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#ffffff' } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const metadata = await sharp(await normalizeUpload(source)).metadata();
  assert.equal(metadata.width, 200);
  assert.equal(metadata.height, 100);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
});

test('empty, oversized, corrupt and SVG files cannot be published as photos', async () => {
  await assert.rejects(normalizeUpload(new Uint8Array()), /Choose an image/);
  await assert.rejects(normalizeUpload(new Uint8Array(MAX_UPLOAD_BYTES + 1)), /too large/);
  await assert.rejects(normalizeUpload(Buffer.from('not an image')), /could not be read/);
  await assert.rejects(normalizeUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')), /could not be read/);
});

test('manual image choice is persisted, and older items default to automatic sourcing', () => {
  const item = { owner: 'Both', name: 'Example', url: 'https://example.com/item', price: null, image: 'https://example.public.blob.vercel-storage.com/wishlist/photo.webp' };
  assert.equal(itemSchema.parse(item).imageSource, 'automatic');
  assert.equal(itemSchema.parse({ ...item, imageSource: 'manual' }).imageSource, 'manual');
});
