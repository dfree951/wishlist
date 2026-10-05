import { z } from 'zod';
import { isOwner } from '@/lib/auth';
import { lookupProduct } from '@/lib/product-lookup';
import { webUrl } from '@/lib/items';
import { body, errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
export const maxDuration = 40;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to import an item.');
    await rateLimit(request, 'lookup', 60);
    const { url, name } = z.object({ url: webUrl, name: z.string().trim().max(200).default('') }).parse(await body(request));
    try { return json({ product: await lookupProduct(url, name) }); }
    catch (e) { throw new HttpError(422, e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'The store took too long to respond. Add the details manually below.'); }
  } catch (e) { return errorResponse(e); }
}
