import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowedOrigin } from '../src/lib/origins';
import { createSessionToken, validSessionToken } from '../src/lib/session-token';

test('origin policy permits the Pages site and same-origin clients, rejecting lookalikes', () => {
  const previous = process.env.FRONTEND_ORIGINS;
  process.env.FRONTEND_ORIGINS = 'https://dfree951.github.io';
  try {
    const request = (origin?: string) => new Request('https://api.example/api/items', { headers: origin ? { origin } : {} });
    assert.equal(allowedOrigin(request('https://dfree951.github.io')), true);
    assert.equal(allowedOrigin(request('https://api.example')), true);
    assert.equal(allowedOrigin(request()), true);
    for (const origin of ['null', 'https://evil.example', 'https://dfree951.github.io.evil.example', 'http://dfree951.github.io']) {
      assert.equal(allowedOrigin(request(origin)), false);
    }
  } finally {
    if (previous === undefined) delete process.env.FRONTEND_ORIGINS;
    else process.env.FRONTEND_ORIGINS = previous;
  }
});

test('browser sessions reject tampering, expiry, extra fields, and old signing secrets', () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-signing-secret-at-least-32-characters';
  try {
    const now = 1800000000000;
    const token = createSessionToken(now);
    assert.equal(validSessionToken(token, now), true);
    assert.equal(validSessionToken(token, now + 8 * 3600000), false);
    assert.equal(validSessionToken(token, now - 1), false);
    assert.equal(validSessionToken(`${token}.extra`, now), false);
    assert.equal(validSessionToken(token.slice(0, -1), now), false);
    const [expiry, signed] = token.split('.');
    assert.equal(validSessionToken(`${expiry}.${signed[0] === 'a' ? 'b' : 'a'}${signed.slice(1)}`, now), false);
    process.env.SESSION_SECRET = 'another-signing-secret-at-least-32-characters';
    assert.equal(validSessionToken(token, now), false);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
