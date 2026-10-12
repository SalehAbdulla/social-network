import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNotFound, isUnauthorized } from './httpError.ts';

// An axios-shaped rejection — the only shape these helpers inspect. `isNotFound`
// is what lets a page tell a missing resource (404, render the one not-found
// page) apart from any other failure (keep the surface's own error state).
const axiosError = (status: number) => Object.assign(new Error('request failed'), {
  isAxiosError: true,
  response: { status, data: { success: false, error: 'not found' } },
});

test('isNotFound is true only for a 404 response', () => {
  assert.equal(isNotFound(axiosError(404)), true);
  assert.equal(isNotFound(axiosError(403)), false);
  assert.equal(isNotFound(axiosError(500)), false);
});

test('isNotFound ignores an error that is not an axios response', () => {
  assert.equal(isNotFound(new Error('boom')), false);
  assert.equal(isNotFound(undefined), false);
});

test('isUnauthorized stays scoped to a 401, never a 404', () => {
  assert.equal(isUnauthorized(axiosError(401)), true);
  assert.equal(isUnauthorized(axiosError(404)), false);
});
