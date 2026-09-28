'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';

const inputClass =
  'w-full box-border rounded-md border border-[var(--border-subtle)] px-3.5 py-2.5 font-sans text-base text-charcoal';

export default function AdminLoginPage() {
  const { status, login, verifyMfa } = useAdminAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/admin/dashboard');
  }, [status, router]);

  if (status === 'loading' || status === 'authenticated') return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
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
