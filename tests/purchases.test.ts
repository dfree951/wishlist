import assert from 'node:assert/strict';
import test from 'node:test';
import { purchaseProgress, purchaseSchema } from '../src/lib/items';

test('partial, full, and excess purchases calculate remaining quantities', () => {
  assert.deepEqual(purchaseProgress({ packCount: 4, purchased: false, purchasedQuantity: 2 }), {
    desired: 4,
    purchased: 2,
    remaining: 2,
  });
  assert.equal(purchaseProgress({ packCount: 4, purchasedQuantity: 4 }).remaining, 0);
  assert.deepEqual(purchaseProgress({ packCount: 4, purchasedQuantity: 6 }), {
    desired: 4,
    purchased: 6,
    remaining: 0,
  });
});
test('existing purchase flags retain their meaning without a stored count', () => {
  assert.deepEqual(purchaseProgress({ packCount: 4, purchased: true }), {
    desired: 4,
    purchased: 4,
    remaining: 0,
  });
  assert.deepEqual(purchaseProgress({ packCount: null, purchased: true }), {
    desired: 1,
    purchased: 1,
    remaining: 0,
  });
  assert.equal(purchaseProgress({ packCount: 4, purchased: false }).remaining, 4);
});
test('purchase quantities only accept bounded positive integers', () => {
  for (const quantity of [0, -1, 1.5, 10000, '2', null])
    assert.equal(purchaseSchema.safeParse({ purchased: true, quantity }).success, false);
  assert.deepEqual(
    purchaseSchema.parse({ purchased: true, quantity: 2, _purchasedQuantity: 999 }),
    { purchased: true, quantity: 2 },
  );
  assert.deepEqual(purchaseSchema.parse({ purchased: false }), { purchased: false });
});
