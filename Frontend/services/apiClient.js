// Shared fetch wrapper for the future Express API (LLD Section 13: API Conventions).
// Base path /api/v1, JSON in/out, { success, data, meta? } / { success, code, message } shapes.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1';

export async function apiRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.message || `Request to ${path} failed`);
  }
  return payload.data;
}
