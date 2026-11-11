'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { validateChangePasswordForm } from '@/lib/changePasswordValidation';

// Matches the existing Admin Dashboard's own form conventions exactly (see
// components/admin/settings/SettingsForm.jsx) -- same input/label/error
// classes, same bordered-section layout, same button style.
const inputClass = 'w-full box-border rounded-md border border-[var(--border-subtle)] px-2.5 py-2 font-sans text-sm text-charcoal';
const labelClass = 'mb-1 block font-sans text-xs font-bold text-charcoal/60';
const errorClass = 'mt-1 font-sans text-xs text-red-600';

// How long the "password changed" confirmation stays on screen before this
// clears the local session (which hands off to RequireAdminAuth's existing
// redirect-to-login effect) -- long enough to read, short enough that an
// admin who already knows what happened isn't kept waiting.
const REDIRECT_DELAY_MS = 2000;

const FIELDS = [
  { name: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
  { name: 'newPassword', label: 'New password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
];

export function ChangePasswordForm() {
  const { changePassword, clearLocalSession } = useAdminAuth();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const redirectTimerRef = useRef(null);

  // A page navigating away mid-countdown (unlikely, but this component can
  // be unmounted) must not leave a stray timer trying to update state on an
  // unmounted component.
  useEffect(() => () => clearTimeout(redirectTimerRef.current), []);

  const setField = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || succeeded) return; // prevent repeated submissions while processing or after success

    setFormError(null);
    const errors = validateChangePasswordForm(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      // Never keep submitted password values in state longer than needed.
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSucceeded(true);
      redirectTimerRef.current = setTimeout(clearLocalSession, REDIRECT_DELAY_MS);
    } catch (err) {
      if (err.code === 'INVALID_CREDENTIALS') {
        setFieldErrors({ currentPassword: 'Current password is incorrect.' });
      } else if (err.code === 'VALIDATION_ERROR') {
        setFormError(err.message || 'Please check your new password and try again.');
      } else if (err.networkError) {
        setFormError('Unable to reach the server. Please check your connection and try again.');
      } else if (err.code === 'UNAUTHENTICATED') {
        setFormError('Your session has expired. Please sign in again.');
      } else {
        setFormError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (succeeded) {
    return (
      <div className="rounded-md border border-[var(--border-subtle)] p-4" role="status">
        <p className="font-sans text-sm font-semibold text-green-700">Password changed successfully.</p>
        <p className="mt-1 font-sans text-sm text-charcoal/70">For your security, you&apos;ve been signed out. Redirecting you to sign in again&hellip;</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="rounded-md border border-[var(--border-subtle)] p-4">
        <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">Change password</h2>

        {FIELDS.map(({ name, label, autoComplete }) => (
          <div key={name} className="mb-3 last:mb-0">
            <label htmlFor={`change-password-${name}`} className={labelClass}>
              {label}
            </label>
            <input
              id={`change-password-${name}`}
              type={showPasswords ? 'text' : 'password'}
              autoComplete={autoComplete}
              value={values[name]}
              onChange={(e) => setField(name, e.target.value)}
              className={inputClass}
              aria-invalid={fieldErrors[name] ? 'true' : 'false'}
              aria-describedby={fieldErrors[name] ? `change-password-${name}-error` : undefined}
            />
            {fieldErrors[name] && (
              <p id={`change-password-${name}-error`} className={errorClass}>
                {fieldErrors[name]}
              </p>
            )}
          </div>
        ))}

        <label className="mt-3 flex items-center gap-2 font-sans text-xs text-charcoal/60">
          <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
          Show passwords
        </label>
      </div>

      {formError && <p className={errorClass}>{formError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-vyoma-blue px-4 py-2.5 font-sans font-semibold text-white disabled:opacity-60"
      >
        {submitting ? 'Changing password…' : 'Change password'}
      </button>
    </form>
  );
}
