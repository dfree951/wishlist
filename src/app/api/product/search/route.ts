import { z } from 'zod';
import { isOwner } from '@/lib/auth';
import { body, errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
import { searchProducts } from '@/lib/product-search';
export const maxDuration = 20;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to find an item.');
    const input = z.object({
      name: z.string().trim().min(2, 'Enter an item name first.').max(200),
      size: z.string().trim().max(100).default(''),
      notes: z.string().trim().max(500).default(''),
    }).parse(await body(request));
    await rateLimit(request, 'product-search', 30);
    try { return json(await searchProducts(input)); }
    catch { throw new HttpError(422, 'Product search is temporarily unavailable. Try again or paste a product link.'); }
  } catch (error) { return errorResponse(error); }
}
