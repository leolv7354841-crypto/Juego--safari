import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NET } from '../js/core/config.ts';
import { TICK } from '../js/net/netcode.ts';

test('TICK sale de NET.tickHz', () => {
  assert.equal(TICK, 1 / NET.tickHz);
});
