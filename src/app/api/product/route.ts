import { z } from 'zod';
import { isOwner } from '@/lib/auth';
import { lookupProduct } from '@/lib/product-lookup';
import { webUrl } from '@/lib/items';
import { searchProductImages } from '@/lib/product-image-search';
import { body, errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
export const maxDuration = 75;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to import an item.');
    await rateLimit(request, 'lookup', 60);
    const { url, name, size, findImage } = z.object({ url: webUrl, name: z.string().trim().max(200).default(''), size: z.string().trim().max(100).default(''), findImage: z.boolean().default(true) }).parse(await body(request));
    try {
      const product = await lookupProduct(url, name);
      if (findImage && !product.image && product.name) {
        const photos = await searchProductImages({ name: product.name, size: size || product.size, url: product.url });
        product.imageCandidates = photos.candidates;
        if (photos.image) {
          product.image = photos.image;
          product.warning = 'A matching photo was found in image search. Check it before saving.'
            + (product.price === null ? ' Price could not be retrieved.' : '')
            + (product.warning?.includes('read from the link') ? ' Name and size were read from the link; check them too.' : '');
        }
      }
      return json({ product });
    }
    catch (e) { throw new HttpError(422, e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'The store took too long to respond. Add the details manually below.'); }
  } catch (e) { return errorResponse(e); }
}
