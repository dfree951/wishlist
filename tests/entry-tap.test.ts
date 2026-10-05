import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEntryTap, movedBeyondTap, type EntryTap } from '../src/lib/entry-tap';

const tap: EntryTap = { id: 4, x: 180, y: 450, startedAt: 1000, href: '/manage', moved: false };

test('a first phone tap tolerates small finger movement', () => {
  assert.equal(isEntryTap(tap, 4, 186, 452, 1150), true);
});

test('scrolls, long presses and unrelated pointers do not trigger touch navigation', () => {
  assert.equal(isEntryTap(tap, 4, 181, 490, 1150), false);
  assert.equal(isEntryTap(tap, 4, 180, 450, 1900), false);
  assert.equal(isEntryTap(tap, 5, 180, 450, 1150), false);
  assert.equal(movedBeyondTap(tap, 180, 500), true);
  assert.equal(isEntryTap({ ...tap, moved: true }, 4, 180, 450, 1150), false);
});
