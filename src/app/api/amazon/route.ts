import { z } from 'zod';
import { isOwner } from '@/lib/auth';
import { amazonListUrl, parseAmazonList } from '@/lib/amazon';
import { fetchHtml } from '@/lib/product-fetch';
import { errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
export const maxDuration = 20;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to import a list.');
    await rateLimit(request, 'amazon', 20);
    const raw = await request.text();
    if (raw.length > 3_000_000) throw new HttpError(413, 'Choose an HTML file smaller than 3 MB.');
    const { url, html } = z.object({ url: z.string().max(2048), html: z.string().max(2_900_000).optional() }).parse(JSON.parse(raw));
    try {
      const list = amazonListUrl(url);
      const result = parseAmazonList(html || await fetchHtml(list.href), list.href);
      if (!result.items.length) throw new Error('No items could be read. Check that the list is shared or public, or upload a saved HTML copy below.');
      return json(result);
    } catch (e) { throw new HttpError(422, e instanceof Error ? e.message : 'Amazon could not be read. Try a saved HTML copy below.'); }
  } catch (e) { return errorResponse(e); }
}
