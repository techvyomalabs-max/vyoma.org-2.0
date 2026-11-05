// Shared fetch wrapper for the future Express API (LLD Section 13: API Conventions).
// Base path /api/v1, JSON in/out, { success, data, meta? } / { success, code, message } shapes.
//
// Task 7L: resolveApiBase() is called fresh inside each function below
// (never cached at module-import time) so it always reflects the real,
// current environment -- and, in production, throws a clear configuration
// error instead of silently using mock data or a default URL when
// NEXT_PUBLIC_API_BASE_URL is missing. See lib/apiConfig.js for the full
// rationale.
import { resolveApiBase } from '../lib/apiConfig.js';

export async function apiRequest(path, { method = 'GET', body } = {}) {
  const API_BASE = resolveApiBase();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // A network-level failure (backend unreachable, DNS, offline, etc.) is
    // a rejected fetch(), not an error response — surface a clear message
    // instead of the browser's raw "Failed to fetch"/"fetch failed" string.
    // Found during the Week 4 final checkpoint: this same class of bug was
    // already fixed for the admin client (lib/adminAuthApi.js) but this
    // shared public client — used by the donation flow, contact form, and
    // every page's content fetch — had never been given the same fix.
    const err = new Error('Unable to reach the server. Please try again.');
    err.networkError = true;
    throw err;
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    const err = new Error(payload?.message || `Request to ${path} failed`);
    err.status = res.status;
    err.code = payload?.code;
    err.fieldErrors = payload?.fieldErrors;
    throw err;
  }
  return payload.data;
}

// Same contract as apiRequest, but also returns `meta` ({page, limit, total}
// on a paginated list) — added for Blog's public list/pagination (Phase E),
// the first public reader that needs it. apiRequest itself is left
// untouched so every existing caller is unaffected.
export async function apiRequestWithMeta(path, { method = 'GET', body } = {}) {
  const API_BASE = resolveApiBase();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('Unable to reach the server. Please try again.');
    err.networkError = true;
    throw err;
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    const err = new Error(payload?.message || `Request to ${path} failed`);
    err.status = res.status;
    err.code = payload?.code;
    err.fieldErrors = payload?.fieldErrors;
    throw err;
  }
  return { data: payload.data, meta: payload.meta };
}
