import { z } from 'zod';
import { db } from '@/lib/db';
import { body, errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    await rateLimit(request, 'purchase', 120);
    const id = z.string().uuid().parse((await context.params).id);
    const { purchased } = z.object({ purchased: z.boolean() }).parse(await body(request));
    const rows = await db()`UPDATE christmas_items SET purchased = ${purchased}, purchased_at = CASE WHEN ${purchased} THEN now() ELSE NULL END
      WHERE id = ${id} AND purchased = ${!purchased} RETURNING id`;
    if (!rows.length) throw new HttpError(409, purchased ? 'Someone already marked this item purchased, or it was removed. The list has been refreshed.' : 'This item is already available, or it was removed. The list has been refreshed.');
    return json({ purchased });
  } catch (e) { return errorResponse(e); }
}
