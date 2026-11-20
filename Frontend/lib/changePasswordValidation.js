// Task 7D.6 — pure, dependency-free client-side validation for the admin
// Change Password form, mirroring the Backend's own rules exactly
// (Backend/src/modules/auth/auth.controller.js changePassword(): both
// fields required, newPassword must be at least 10 characters). This exists
// only to give the admin immediate, specific field-level feedback before a
// round trip -- the Backend remains the final authority on every one of
// these rules, and this file introduces no rule stricter or weaker than it.
//
// The Backend does NOT require the new password to differ from the current
// one (confirmed directly by reading changePassword() -- no such check
// exists), so this validator deliberately does not invent one either.
export const PASSWORD_MIN_LENGTH = 10;

// Returns a { fieldName: message } object -- empty when the form is valid.
export function validateChangePasswordForm({ currentPassword, newPassword, confirmPassword }) {
  const fieldErrors = {};

  if (!currentPassword) {
    fieldErrors.currentPassword = 'Current password is required.';
  }

  if (!newPassword) {
    fieldErrors.newPassword = 'New password is required.';
  } else if (newPassword.length < PASSWORD_MIN_LENGTH) {
    fieldErrors.newPassword = `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = 'Please confirm your new password.';
  } else if (newPassword && confirmPassword !== newPassword) {
    fieldErrors.confirmPassword = 'New password and confirmation do not match.';
  }

  return fieldErrors;
}
