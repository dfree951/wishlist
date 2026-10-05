import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { isOwner } from '@/lib/auth';
import { itemSchema } from '@/lib/items';
import { body, errorResponse, HttpError, json, sameOrigin } from '@/lib/http';
export async function GET(request: Request) {
  try {
    const sql = db();
    if (new URL(request.url).searchParams.get('view') === 'manage') {
      if (!await isOwner()) throw new HttpError(401, 'Please sign in to edit the lists.');
      // Purchase fields are deliberately never selected or sent to the editing view.
      const rows = await sql`SELECT id, data, version FROM christmas_items ORDER BY created_at DESC`;
      return json({ items: rows.map(r => ({ ...r.data, id: r.id, version: r.version })) });
    }
    const rows = await sql`SELECT id, data, version, purchased, purchased_at FROM christmas_items ORDER BY created_at DESC`;
    return json({ items: rows.map(r => ({ ...r.data, id: r.id, version: r.version, purchased: r.purchased, purchasedAt: r.purchased_at })) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to edit the lists.');
    const data = itemSchema.parse(await body(request));
    const id = randomUUID();
    await db()`INSERT INTO christmas_items (id, data) VALUES (${id}, ${JSON.stringify(data)}::jsonb)`;
    return json({ item: { ...data, id, version: 1 } }, 201);
  } catch (e) { return errorResponse(e); }
}
