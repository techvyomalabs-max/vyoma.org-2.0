import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from './apiResponse.js';
import { expectScalarQueryParam } from './queryValidation.js';

test('expectScalarQueryParam: undefined (param not supplied) passes through as undefined', () => {
  assert.equal(expectScalarQueryParam(undefined, 'category'), undefined);
});

test('expectScalarQueryParam: a plain string is returned unchanged', () => {
  assert.equal(expectScalarQueryParam('sanskrit', 'category'), 'sanskrit');
});

test('expectScalarQueryParam: an empty string is returned unchanged (not rejected)', () => {
  assert.equal(expectScalarQueryParam('', 'category'), '');
});

test('expectScalarQueryParam: an operator-shaped object (qs bracket-syntax result) is rejected', () => {
  // This is exactly what Express's default `qs` parser produces from
  // ?category[$regex]=.*&category[$options]=i
  const malicious = { $regex: '.*', $options: 'i' };
  assert.throws(() => expectScalarQueryParam(malicious, 'category'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.match(err.message, /category/);
    return true;
  });
});

test('expectScalarQueryParam: a repeated-key array (qs result from ?category=a&category=b) is rejected', () => {
  assert.throws(() => expectScalarQueryParam(['a', 'b'], 'category'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return true;
  });
});

test('expectScalarQueryParam: a number is rejected (query values should only ever be strings or undefined)', () => {
  assert.throws(() => expectScalarQueryParam(5, 'limit'), (err) => err instanceof ApiError && err.status === 422);
});

test('expectScalarQueryParam: a boolean is rejected', () => {
  assert.throws(() => expectScalarQueryParam(true, 'flag'), (err) => err instanceof ApiError && err.status === 422);
});

test('expectScalarQueryParam: null is rejected', () => {
  assert.throws(() => expectScalarQueryParam(null, 'category'), (err) => err instanceof ApiError && err.status === 422);
});
