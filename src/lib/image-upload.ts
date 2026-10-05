import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 3_500_000;

export async function normalizeUpload(bytes: Uint8Array) {
  if (!bytes.length) throw new Error('Choose an image to upload.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('This image is too large. Choose a smaller image.');
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(metadata.format || '')) {
      throw new Error('Unsupported image');
    }
    // Re-encoding also removes EXIF location data and any extra file content.
    return await image.rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer();
  } catch {
    throw new Error('This image could not be read. Choose a JPG, PNG, WebP, or GIF image.');
  }
}
