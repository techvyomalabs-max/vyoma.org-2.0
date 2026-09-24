// Raw fetch wrappers for the existing Phase 2 Week 1 auth endpoints — no
// token storage here, that's AdminAuthContext's job. `credentials: 'include'`
// on every call is required because the refresh token travels as an
// HTTP-only cookie set by the Backend (a different origin from this
// Frontend); the browser only attaches it when the request explicitly opts
// in like this, and the Backend's CORS config already allows it
// (Backend/src/app.js: `cors({ origin: env.corsOrigin, credentials: true })`).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

// Wraps the raw `fetch` so a network-level failure (backend unreachable —
// connection refused, DNS failure, etc.) surfaces as a clear, consistent
// message instead of the browser's raw "Failed to fetch"/"fetch failed"
// string leaking straight into the UI. `err.networkError` lets a caller
// distinguish this from a normal API error response if it ever needs to.
async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    const err = new Error('Unable to reach the server. Please try again.');
    err.networkError = true;
    throw err;
  }
}

async function parseResponse(res) {
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    const err = new Error(payload?.message || 'Request failed.');
    err.status = res.status;
    err.code = payload?.code;
    err.fieldErrors = payload?.fieldErrors;
    throw err;
  }
  return payload.data;
}

export async function login(email, password) {
  const res = await safeFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseResponse(res);
}

export async function verifyMfa(mfaToken, code) {
  const res = await safeFetch(`${API_BASE}/auth/login/mfa`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaToken, code }),
  });
  return parseResponse(res);
}

export async function refreshSession() {
  const res = await safeFetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  return parseResponse(res);
}

export async function logoutSession() {
  try {
    const res = await safeFetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
    return await parseResponse(res);
  } catch {
    return null; // logout clears local state regardless of network outcome
  }
}

// Generic authenticated call for anything under /api/v1 that needs the
// bearer access token (currently just /auth/me; the same helper will back
// the admin/* resource pages in Week 4).
//
// A FormData body (media upload) is passed through as-is — the browser sets
// its own multipart Content-Type with boundary, which JSON.stringify-ing it
// (or forcing application/json) would break.
export async function authedFetch(path, accessToken, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await safeFetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    body: options.body && !isFormData ? JSON.stringify(options.body) : options.body,
  });
  if (res.status === 401) {
    const err = new Error('Unauthenticated');
    err.status = 401;
    throw err;
  }
  return parseResponse(res);
}

// Same contract as authedFetch, but also returns `meta` ({page, limit,
// total}) — added for the Blog admin list's pagination (Phase E), the first
// admin page that needs it. authedFetch itself is left untouched so every
// existing caller is unaffected.
export async function authedFetchWithMeta(path, accessToken, options = {}) {
  const res = await safeFetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    const err = new Error('Unauthenticated');
    err.status = 401;
    throw err;
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    const err = new Error(payload?.message || 'Request failed.');
    err.status = res.status;
    err.code = payload?.code;
    err.fieldErrors = payload?.fieldErrors;
    throw err;
  }
  return { data: payload.data, meta: payload.meta };
}
