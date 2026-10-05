import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { isOwner } from '@/lib/auth';
import { itemSchema } from '@/lib/items';
import { amazonProductKey } from '@/lib/amazon';
import { errorResponse, HttpError, json, sameOrigin } from '@/lib/http';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!await isOwner()) throw new HttpError(401, 'Please sign in to import a list.');
    const raw = await request.text();
    if (raw.length > 250000) throw new HttpError(413, 'Import up to 100 items at a time.');
    const { items } = z.object({ items: z.array(itemSchema).min(1).max(100) }).parse(JSON.parse(raw));
    const sql = db();
    const existing = await sql`SELECT data->>'url' AS url, data->>'owner' AS owner FROM christmas_items`;
    const keys = new Set(existing.map(row => `${row.owner}:${amazonProductKey(row.url)}`));
    const fresh = items.filter(item => {
      const key = `${item.owner}:${amazonProductKey(item.url)}`;
      if (keys.has(key)) return false;
      keys.add(key); return true;
    });
    // Stable import IDs make retries and simultaneous imports idempotent.
    const payload = fresh.map(data => {
      const hex = createHash('sha256').update(`${data.owner}:${amazonProductKey(data.url)}`).digest('hex').slice(0,32);
      return { id: `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`, data };
    });
    const rows = payload.length ? await sql`INSERT INTO christmas_items (id, data)
      SELECT (value->>'id')::uuid, value->'data' FROM jsonb_array_elements(${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (id) DO NOTHING RETURNING id` : [];
    return json({ imported: rows.length, skipped: items.length - rows.length });
  } catch (e) { return errorResponse(e); }
}
