'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';

const inputClass =
  'w-full box-border rounded-md border border-[var(--border-subtle)] px-3.5 py-2.5 font-sans text-base text-charcoal';

export default function AdminLoginPage() {
  const { status, login, verifyMfa, enrollMfaSetup, enrollMfaVerify } = useAdminAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const [enrollmentToken, setEnrollmentToken] = useState(null);
  const [enrollment, setEnrollment] = useState(null); // { otpauthUri, secret }
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  // Recovery codes are shown exactly once, right after enrollment -- the
  // user must see and save them before this redirects to the dashboard, so
  // the auto-redirect is held off while they're on screen.
  useEffect(() => {
    if (status === 'authenticated' && !recoveryCodes) router.replace('/admin/dashboard');
  }, [status, router, recoveryCodes]);

  if (status === 'loading' || (status === 'authenticated' && !recoveryCodes)) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
      } else if (result.mfaEnrollmentRequired) {
        setEnrollmentToken(result.enrollmentToken);
        const setup = await enrollMfaSetup(result.enrollmentToken);
        setEnrollment(setup);
      } else {
        router.replace('/admin/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setPending(false);
    }
  };

  const handleMfa = async (e) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await verifyMfa(mfaToken, code);
      router.replace('/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid code.');
    } finally {
      setPending(false);
    }
  };

  const handleEnrollVerify = async (e) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await enrollMfaVerify(enrollmentToken, code);
      setRecoveryCodes(result.recoveryCodes);
    } catch (err) {
      setError(err.message || 'Invalid code.');
    } finally {
      setPending(false);
    }
  };

  if (recoveryCodes) {
    return (
      <div className="mx-auto mt-24 max-w-sm px-4">
        <h1 className="mb-1.5 font-sans text-h2 font-bold text-vyoma-blue">Save your recovery codes</h1>
        <p className="mb-5 font-sans text-sm text-charcoal">
          Two-factor authentication is now enabled. Store these codes somewhere safe — each can be used once if you lose
          access to your authenticator app. They will not be shown again.
        </p>
        <ul className="mb-5 grid grid-cols-2 gap-2 rounded-md border border-[var(--border-subtle)] p-3.5 font-mono text-sm text-charcoal">
          {recoveryCodes.map((rc) => (
            <li key={rc}>{rc}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => router.replace('/admin/dashboard')}
          className="rounded-md bg-vyoma-blue px-4 py-2.5 font-sans font-semibold text-white"
        >
          I've saved these — Continue
        </button>
      </div>
    );
  }

  if (enrollment) {
    return (
      <div className="mx-auto mt-24 max-w-sm px-4">
        <h1 className="mb-1.5 font-sans text-h2 font-bold text-vyoma-blue">Set up two-factor authentication</h1>
        <p className="mb-3 font-sans text-sm text-charcoal">
          This account requires two-factor authentication. Add it to an authenticator app (Google Authenticator, Authy,
          1Password, etc.) using this key, then enter the 6-digit code it generates.
        </p>
        <p className="mb-5 break-all rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle,#f5f5f5)] p-3 font-mono text-sm text-charcoal">
          {enrollment.secret}
        </p>
        <form onSubmit={handleEnrollVerify} className="flex flex-col gap-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
            required
          />
          {error && <p className="font-sans text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-vyoma-blue px-4 py-2.5 font-sans font-semibold text-white disabled:opacity-60"
          >
            {pending ? 'Verifying…' : 'Enable two-factor authentication'}
          </button>
        </form>
      </div>
    );
  }

  if (mfaToken) {
    return (
      <div className="mx-auto mt-24 max-w-sm px-4">
        <h1 className="mb-1.5 font-sans text-h2 font-bold text-vyoma-blue">Two-factor verification</h1>
        <p className="mb-5 font-sans text-sm text-charcoal">Enter the 6-digit code from your authenticator app.</p>
        <form onSubmit={handleMfa} className="flex flex-col gap-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
            required
          />
          {error && <p className="font-sans text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-vyoma-blue px-4 py-2.5 font-sans font-semibold text-white disabled:opacity-60"
          >
            {pending ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-5 font-sans text-h2 font-bold text-vyoma-blue">Admin sign in</h1>
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <input
          type="email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          required
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          required
        />
        {error && <p className="font-sans text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-vyoma-blue px-4 py-2.5 font-sans font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
