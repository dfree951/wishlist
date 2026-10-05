import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { validSessionToken } from './session-token';
const COOKIE = 'christmas_owner';
function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Session secret is not configured.');
  return process.env.SESSION_SECRET;
}
function sign(value: string) { return createHmac('sha256', secret()).update(value).digest('hex'); }
export function validPassword(value: string) {
  const expected = createHmac('sha256', secret()).update((process.env.OWNER_PASSWORD || 'sedan').toLowerCase()).digest();
  const actual = createHmac('sha256', secret()).update(value.toLowerCase()).digest();
  return timingSafeEqual(expected, actual);
}
export async function isOwner() {
  const authorization = (await headers()).get('authorization');
  if (authorization) return authorization.startsWith('Bearer ') && validSessionToken(authorization.slice(7));
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const [expiry, signature] = token.split('.');
  if (!signature || !/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
  const expected = Buffer.from(sign(expiry));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function setOwnerSession() {
  const expiry = String(Date.now() + 30 * 86400000);
  (await cookies()).set(COOKIE, `${expiry}.${sign(expiry)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 86400,
  });
}
export async function clearOwnerSession() { (await cookies()).delete(COOKIE); }
