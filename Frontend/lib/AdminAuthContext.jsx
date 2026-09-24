'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  login as apiLogin,
  verifyMfa as apiVerifyMfa,
  refreshSession,
  logoutSession,
  authedFetch,
  authedFetchWithMeta,
} from './adminAuthApi';

// Week 3 Decision W3-1: the access token lives ONLY in this ref (in-memory,
// cleared on every page reload) — never localStorage/sessionStorage. A fresh
// page load always re-establishes the session via a silent /auth/refresh
// call, which succeeds or fails based solely on the existing HTTP-only
// refresh cookie already set by the Backend (Week 1). No second auth
// mechanism is introduced; this is the same JWT design, just consumed
// correctly from a client-side app instead of curl.
const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'authenticated' | 'unauthenticated'
  const [user, setUser] = useState(null);
  const accessTokenRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await refreshSession();
        if (cancelled) return;
        accessTokenRef.current = session.accessToken;
        setUser(session.user);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        accessTokenRef.current = null;
        setUser(null);
        setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await apiLogin(email, password);
    if (result.mfaRequired) return result; // { mfaRequired: true, mfaToken } — caller shows the MFA step
    accessTokenRef.current = result.accessToken;
    setUser(result.user);
    setStatus('authenticated');
    return result;
  }, []);

  const verifyMfa = useCallback(async (mfaToken, code) => {
    const result = await apiVerifyMfa(mfaToken, code);
    accessTokenRef.current = result.accessToken;
    setUser(result.user);
    setStatus('authenticated');
    return result;
  }, []);

  const logout = useCallback(async () => {
    await logoutSession();
    accessTokenRef.current = null;
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Authenticated fetch with one silent-refresh-and-retry on a 401. The
  // access token is short-lived (~15min per auth.service.js) by design; this
  // is what makes a long admin session safe without ever persisting it.
  const apiFetch = useCallback(async (path, options) => {
    try {
      return await authedFetch(path, accessTokenRef.current, options);
    } catch (err) {
      if (err.status !== 401) throw err;
      try {
        const session = await refreshSession();
        accessTokenRef.current = session.accessToken;
        setUser(session.user);
        return await authedFetch(path, accessTokenRef.current, options);
      } catch {
        accessTokenRef.current = null;
        setUser(null);
        setStatus('unauthenticated');
        throw err;
      }
    }
  }, []);

  // Same one-retry-on-401 contract as apiFetch, but also returns `meta` —
  // for paginated admin lists (Blog, Phase E) that need {page, limit, total}
  // alongside the items.
  const apiFetchWithMeta = useCallback(async (path, options) => {
    try {
      return await authedFetchWithMeta(path, accessTokenRef.current, options);
    } catch (err) {
      if (err.status !== 401) throw err;
      try {
        const session = await refreshSession();
        accessTokenRef.current = session.accessToken;
        setUser(session.user);
        return await authedFetchWithMeta(path, accessTokenRef.current, options);
      } catch {
        accessTokenRef.current = null;
        setUser(null);
        setStatus('unauthenticated');
        throw err;
      }
    }
  }, []);

  // Enables Draft Mode for a "Preview draft" link — see app/api/draft/
  // route.js's security note. The access token never leaves this context;
  // callers only ever get back a path to open, never the token itself.
  const enablePreview = useCallback(async (path) => {
    const res = await fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessTokenRef.current}` },
      body: JSON.stringify({ path }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || 'Could not start the preview.');
    return payload.redirect;
  }, []);

  return (
    <AdminAuthContext.Provider value={{ status, user, login, verifyMfa, logout, apiFetch, apiFetchWithMeta, enablePreview }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider.');
  return ctx;
}
