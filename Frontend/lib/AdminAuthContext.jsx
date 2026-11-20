'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  login as apiLogin,
  verifyMfa as apiVerifyMfa,
  enrollMfaSetup as apiEnrollMfaSetup,
  enrollMfaVerify as apiEnrollMfaVerify,
  refreshSession,
  logoutSession,
  authedFetch,
  authedFetchWithMeta,
  changePassword as apiChangePassword,
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
    // { mfaRequired: true, mfaToken } — already-enrolled account, caller
    // shows the TOTP step. { mfaEnrollmentRequired: true, enrollmentToken }
    // — role.mfaRequired but never enrolled, caller shows the enrollment
    // step. Neither case has issued a real session yet, so neither must
    // fall through to the accessToken/authenticated branch below.
    if (result.mfaRequired || result.mfaEnrollmentRequired) return result;
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

  const enrollMfaSetup = useCallback(async (enrollmentToken) => apiEnrollMfaSetup(enrollmentToken), []);

  const enrollMfaVerify = useCallback(async (enrollmentToken, code) => {
    const result = await apiEnrollMfaVerify(enrollmentToken, code);
    accessTokenRef.current = result.accessToken;
    setUser(result.user);
    setStatus('authenticated');
    return result; // includes recoveryCodes — the caller must show these exactly once
  }, []);

  // Task 7D.6 — extracted so changePassword() below can clear local session
  // state the same way logout() does, WITHOUT also calling logoutSession()
  // (POST /auth/logout): a successful password change already invalidates
  // the refresh token server-side (Backend/.../auth.controller.js
  // changePassword(): refreshTokenVersion += 1), so sending that
  // now-already-invalidated refresh token again would be a pointless extra
  // round trip, not a real second invalidation.
  const clearLocalSession = useCallback(() => {
    accessTokenRef.current = null;
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutSession();
    clearLocalSession();
  }, [clearLocalSession]);

  // Task 7D.6 — POST /api/v1/auth/password/change. On success, the Backend
  // has already invalidated this session server-side (refreshTokenVersion
  // bumped), but this deliberately does NOT clear local state itself: the
  // Change Password form needs to show a confirmation message first, then
  // call clearLocalSession() (exposed below) itself once the admin has had
  // a moment to read it. Clearing immediately here would flip `status` to
  // 'unauthenticated' before the form could render anything, and
  // RequireAdminAuth's existing redirect effect would navigate away almost
  // instantly -- the user would never see a confirmation at all.
  //
  // On a genuinely expired/invalid access token (code: UNAUTHENTICATED, from
  // requireAuth itself -- NOT the same as a wrong current password, which is
  // INVALID_CREDENTIALS and is simply rethrown for the form to display), this
  // attempts exactly one silent refresh-and-retry, matching apiFetch's own
  // existing contract elsewhere in this file. If that retry also fails,
  // there really is no session left to show a confirmation for, so it's
  // cleared immediately and the retry's own error is thrown.
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      return await apiChangePassword(accessTokenRef.current, currentPassword, newPassword);
    } catch (err) {
      if (err.code !== 'UNAUTHENTICATED') throw err;
      try {
        const session = await refreshSession();
        accessTokenRef.current = session.accessToken;
        setUser(session.user);
        return await apiChangePassword(accessTokenRef.current, currentPassword, newPassword);
      } catch (retryErr) {
        clearLocalSession();
        throw retryErr;
      }
    }
  }, [clearLocalSession]);

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
    <AdminAuthContext.Provider
      value={{
        status,
        user,
        login,
        verifyMfa,
        enrollMfaSetup,
        enrollMfaVerify,
        logout,
        changePassword,
        clearLocalSession,
        apiFetch,
        apiFetchWithMeta,
        enablePreview,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider.');
  return ctx;
}
