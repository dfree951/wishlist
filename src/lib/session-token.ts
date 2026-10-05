import { createHmac, timingSafeEqual } from 'node:crypto';

const lifetime = 8 * 60 * 60 * 1000;
function signingSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Session secret is not configured.');
  return secret;
}
function signature(expiry: string) {
  return createHmac('sha256', signingSecret()).update(`wishlist-browser:${expiry}`).digest('hex');
}
export function createSessionToken(now = Date.now()) {
  const expiry = String(now + lifetime);
  return `${expiry}.${signature(expiry)}`;
}
export function validSessionToken(token: string, now = Date.now()) {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expiry, signed] = parts;
  if (!/^\d{13}$/.test(expiry) || !/^[a-f0-9]{64}$/.test(signed)) return false;
  if (Number(expiry) <= now || Number(expiry) > now + lifetime) return false;
  return timingSafeEqual(Buffer.from(signature(expiry)), Buffer.from(signed));
}
