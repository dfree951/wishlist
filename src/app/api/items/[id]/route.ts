import { z } from 'zod';
import { db } from '@/lib/db';
import { isOwner } from '@/lib/auth';
import { itemSchema } from '@/lib/items';
import { body, errorResponse, HttpError, json, sameOrigin } from '@/lib/http';
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to edit the lists.');
    const id = z.string().uuid().parse((await context.params).id);
    const { data, version } = z.object({ data: itemSchema, version: z.number().int().positive() }).parse(await body(request));
    const rows = await db()`UPDATE christmas_items SET data = ${JSON.stringify(data)}::jsonb, version = version + 1, updated_at = now()
      WHERE id = ${id} AND version = ${version} RETURNING version`;
    if (!rows.length) throw new HttpError(409, 'This item changed in another window. Close this form and reopen it to see the latest details.');
    return json({ item: { ...data, id, version: rows[0].version } });
  } catch (e) { return errorResponse(e); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to edit the lists.');
    const id = z.string().uuid().parse((await context.params).id);
    const { version } = z.object({ version: z.number().int().positive() }).parse(await body(request));
    const rows = await db()`DELETE FROM christmas_items WHERE id = ${id} AND version = ${version} RETURNING id`;
    if (!rows.length) throw new HttpError(409, 'This item changed in another window. Refresh before removing it.');
    return json({ deleted: true });
  } catch (e) { return errorResponse(e); }
}
