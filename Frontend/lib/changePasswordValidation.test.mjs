// Task 7D.6 — regression coverage for the admin Change Password form's
// client-side validation. Pure function, no network, no DOM, no mocking --
// mirrors the exact rules Backend/src/modules/auth/auth.controller.js's
// changePassword() enforces (both fields required, newPassword >= 10 chars),
// confirmed directly by reading that controller before writing this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateChangePasswordForm, PASSWORD_MIN_LENGTH } from './changePasswordValidation.js';

test('PASSWORD_MIN_LENGTH matches the Backend\'s own rule (10 characters)', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 10);
});

test('all three fields are required', () => {
  const errors = validateChangePasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  assert.equal(errors.currentPassword, 'Current password is required.');
  assert.equal(errors.newPassword, 'New password is required.');
  assert.equal(errors.confirmPassword, 'Please confirm your new password.');
});

test('a valid form (matching, long-enough new password) has no field errors', () => {
  const errors = validateChangePasswordForm({
    currentPassword: 'CurrentPassword123!',
    newPassword: 'BrandNewPassword1!',
    confirmPassword: 'BrandNewPassword1!',
  });
  assert.deepEqual(errors, {});
});

test('new password shorter than 10 characters is rejected, even when it matches the confirmation', () => {
  const errors = validateChangePasswordForm({
    currentPassword: 'CurrentPassword123!',
    newPassword: 'short1!',
    confirmPassword: 'short1!',
  });
  assert.equal(errors.newPassword, 'New password must be at least 10 characters.');
  assert.equal(errors.confirmPassword, undefined, 'a matching confirmation must not also report a mismatch error');
});

test('new password exactly at the minimum length (10) is accepted', () => {
  const errors = validateChangePasswordForm({
    currentPassword: 'CurrentPassword123!',
    newPassword: '1234567890',
    confirmPassword: '1234567890',
  });
  assert.equal(errors.newPassword, undefined);
});

test('confirmation mismatch is reported on the confirmation field', () => {
  const errors = validateChangePasswordForm({
    currentPassword: 'CurrentPassword123!',
    newPassword: 'BrandNewPassword1!',
    confirmPassword: 'SomethingElseEntirely1!',
  });
  assert.equal(errors.confirmPassword, 'New password and confirmation do not match.');
  assert.equal(errors.newPassword, undefined, 'the new-password field itself is valid on its own merits');
});

test('a too-short new password is reported once, not duplicated as a mismatch too, when confirmation is also blank', () => {
  const errors = validateChangePasswordForm({ currentPassword: 'x', newPassword: 'short', confirmPassword: '' });
  assert.equal(errors.newPassword, 'New password must be at least 10 characters.');
  assert.equal(errors.confirmPassword, 'Please confirm your new password.');
});

// The Backend does not require the new password to differ from the current
// one (confirmed directly in auth.controller.js — no such check exists), so
// this validator must not invent a stricter rule the Backend doesn't enforce.
test('does not require the new password to differ from the current password (the Backend has no such rule)', () => {
  const errors = validateChangePasswordForm({
    currentPassword: 'SamePassword123!',
    newPassword: 'SamePassword123!',
    confirmPassword: 'SamePassword123!',
  });
  assert.deepEqual(errors, {});
});
