import { z } from 'zod';
import { isOwner } from '@/lib/auth';
import { body, errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
import { webUrl } from '@/lib/items';
import { searchProductImages } from '@/lib/product-image-search';
import { validateFetchUrl } from '@/lib/product-fetch';

export const maxDuration = 35;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to find a photo.');
    const input = z.object({
      name: z.string().trim().min(2, 'Enter an item name first.').max(200),
      size: z.string().trim().max(100).default(''),
      url: z.union([webUrl, z.literal('')]).default(''),
    }).parse(await body(request));
    if (input.url) {
      try { validateFetchUrl(input.url); }
      catch { throw new HttpError(400, 'Use a public product link.'); }
    }
    await rateLimit(request, 'image-search', 30);
    return json(await searchProductImages(input));
  } catch (error) { return errorResponse(error); }
}
