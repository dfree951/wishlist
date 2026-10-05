import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { isOwner } from '@/lib/auth';
import { errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
import { MAX_UPLOAD_BYTES, normalizeUpload } from '@/lib/image-upload';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to upload an image.');
    await rateLimit(request, 'image-upload', 30);
    if (Number(request.headers.get('content-length')) > 4_000_000) throw new HttpError(413, 'This image is too large. Choose a smaller image.');
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new HttpError(400, 'Choose an image to upload.');
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) throw new HttpError(400, 'Choose an image to upload.');
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'This image is too large. Choose a smaller image.');
    let image: Buffer;
    try { image = await normalizeUpload(new Uint8Array(await file.arrayBuffer())); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'This image could not be read.'); }
    const blob = await put(`wishlist/${randomUUID()}.webp`, image, {
      access: 'public', contentType: 'image/webp', addRandomSuffix: false,
      cacheControlMaxAge: 31536000,
    });
    return json({ url: blob.url }, 201);
  } catch (error) { return errorResponse(error); }
}
