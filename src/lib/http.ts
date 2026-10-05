import { createHash } from 'node:crypto';
import { ZodError } from 'zod';
import { db } from './db';
import { allowedOrigin } from './origins';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message || 'Check the form fields.' }, 400);
  if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
  console.error(error instanceof Error ? error.message : 'Request failed');
  return json({ error: 'Unable to save or load the list. Please try again.' }, 503);
}
export async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 50000) throw new HttpError(413, 'This request is too large.');
  return JSON.parse(raw);
}
export function sameOrigin(request: Request) {
  if (!allowedOrigin(request)) throw new HttpError(403, 'Please use this app to make changes.');
}
export async function rateLimit(request: Request, action: string, limit: number, minutes = 15) {
  const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'local';
  const hash = createHash('sha256').update(ip.split(',')[0].trim()).digest('hex').slice(0, 32);
  const key = `${action}:${hash}`;
  const sql = db();
  const rows = await sql`INSERT INTO christmas_rate_limits (key, hits, expires_at)
    VALUES (${key}, 1, now() + ${minutes} * interval '1 minute')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN christmas_rate_limits.expires_at < now() THEN 1 ELSE christmas_rate_limits.hits + 1 END,
      expires_at = CASE WHEN christmas_rate_limits.expires_at < now() THEN now() + ${minutes} * interval '1 minute' ELSE christmas_rate_limits.expires_at END
    RETURNING hits`;
  if (rows[0].hits > limit) throw new HttpError(429, 'Too many attempts. Please try again in a few minutes.');
}
