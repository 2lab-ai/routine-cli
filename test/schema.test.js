import test from 'node:test';
import assert from 'node:assert/strict';

import { validateRoutine } from '../src/schema.js';

test('validateRoutine: valid routine passes', () => {
  const routine = {
    name: 'ok',
    steps: [{ name: 'hello', type: 'exec', command: 'echo hi' }]
  };

  const res = validateRoutine(routine);
  assert.equal(res.success, true);
  assert.ok(res.data);
  assert.equal(res.data.name, 'ok');
});

test('validateRoutine: missing steps fails', () => {
  const routine = { name: 'bad' };
  const res = validateRoutine(routine);
  assert.equal(res.success, false);
  assert.ok(Array.isArray(res.errors));
  assert.ok(res.errors.length > 0);
});
