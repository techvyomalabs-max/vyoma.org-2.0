import { draftMode } from 'next/headers';

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

// Enables Next.js Draft Mode. Redesigned (see security checkpoint): the
// browser proves it's a logged-in admin by sending its OWN short-lived
// bearer token (already held in-memory by AdminAuthContext, never
// persisted) — this route forwards that token server-to-server to the
// Backend's GET /auth/me (existing auth/RBAC, nothing new) and only enables
// Draft Mode if the Backend confirms it's valid. No shared static secret is
// ever sent to or read by the browser for this step. `draftMode().enable()`
// sets an httpOnly cookie on THIS origin, invisible to JS either way.
export async function POST(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return Response.json({ error: 'Missing admin session.' }, { status: 401 });
  }

  let path;
  try {
    path = (await request.json())?.path;
  } catch {
    path = null;
  }
  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return Response.json({ error: 'path must be a site-relative path.' }, { status: 400 });
  }

  let verified;
  try {
    verified = await fetch(`${BACKEND_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return Response.json({ error: 'Could not reach the backend to verify this session.' }, { status: 502 });
  }
  if (!verified.ok) {
    return Response.json({ error: 'Not a valid admin session.' }, { status: 401 });
  }

  (await draftMode()).enable();
  return Response.json({ redirect: path });
}
