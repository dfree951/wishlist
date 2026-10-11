import { z } from 'zod';
import { db } from '@/lib/db';
import { purchaseSchema } from '@/lib/items';
import { body, errorResponse, HttpError, json, rateLimit, sameOrigin } from '@/lib/http';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    await rateLimit(request, 'purchase', 120);
    const id = z.string().uuid().parse((await context.params).id);
    const { purchased, quantity } = purchaseSchema.parse(await body(request));
    const sql = db();
    // The internal count is removed from owner reads and preserved by owner edits.
    // Legacy purchased items imply their entire desired quantity was purchased.
    const rows = purchased
      ? await sql`UPDATE christmas_items SET
          data = jsonb_set(data, '{_purchasedQuantity}', to_jsonb(COALESCE((data->>'_purchasedQuantity')::integer, CASE WHEN purchased THEN COALESCE((data->>'packCount')::integer, 1) ELSE 0 END) + ${quantity ?? 1})),
          purchased = COALESCE((data->>'_purchasedQuantity')::integer, CASE WHEN purchased THEN COALESCE((data->>'packCount')::integer, 1) ELSE 0 END) + ${quantity ?? 1} >= COALESCE((data->>'packCount')::integer, 1),
          purchased_at = now()
        WHERE id = ${id} AND COALESCE(data->>'unlimitedPurchases', 'false') <> 'true'
          AND COALESCE((data->>'_purchasedQuantity')::integer, CASE WHEN purchased THEN COALESCE((data->>'packCount')::integer, 1) ELSE 0 END) < COALESCE((data->>'packCount')::integer, 1)
        RETURNING purchased, (data->>'_purchasedQuantity')::integer AS quantity`
      : await sql`UPDATE christmas_items SET
          data = jsonb_set(data, '{_purchasedQuantity}', to_jsonb(GREATEST(0, COALESCE((data->>'_purchasedQuantity')::integer, CASE WHEN purchased THEN COALESCE((data->>'packCount')::integer, 1) ELSE 0 END) - ${quantity ?? 99999}))),
          purchased = GREATEST(0, COALESCE((data->>'_purchasedQuantity')::integer, CASE WHEN purchased THEN COALESCE((data->>'packCount')::integer, 1) ELSE 0 END) - ${quantity ?? 99999}) >= COALESCE((data->>'packCount')::integer, 1),
          purchased_at = CASE WHEN COALESCE((data->>'_purchasedQuantity')::integer, CASE WHEN purchased THEN COALESCE((data->>'packCount')::integer, 1) ELSE 0 END) > ${quantity ?? 99999} THEN purchased_at ELSE NULL END
        WHERE id = ${id} AND COALESCE(data->>'unlimitedPurchases', 'false') <> 'true'
          AND COALESCE((data->>'_purchasedQuantity')::integer, CASE WHEN purchased THEN COALESCE((data->>'packCount')::integer, 1) ELSE 0 END) > 0
        RETURNING purchased, (data->>'_purchasedQuantity')::integer AS quantity`;
    if (!rows.length) throw new HttpError(409, purchased ? 'Someone already marked this item purchased, or it was removed. The list has been refreshed.' : 'This item is already available, or it was removed. The list has been refreshed.');
    return json({ purchased: rows[0].purchased, purchasedQuantity: rows[0].quantity });
  } catch (e) { return errorResponse(e); }
}
