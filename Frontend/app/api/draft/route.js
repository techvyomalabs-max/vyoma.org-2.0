import { draftMode } from 'next/headers';
import { resolveApiBase } from '../../../lib/apiConfig.js';

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

  // Task 7V.2: resolveApiBase() moved from module scope into this handler.
  // Next.js evaluates a Route Handler's module body during `next build`'s
  // page-data-collection phase regardless of any dynamic-rendering setting
  // (unlike page components, which can defer via `export const dynamic =
  // 'force-dynamic'`) -- so the module-level `const BACKEND_BASE =
  // resolveApiBase(...)` this used to be made resolveApiBase()'s intentional
  // production-config-error throw (Task 7L) crash the entire build the
  // moment NEXT_PUBLIC_API_BASE_URL was genuinely unset, confirmed by direct
  // testing in Task 7V.1. Calling it here instead means the exact same
  // clear error is thrown only when a real request actually needs the
  // backend -- never silently falling back to localhost or mock data,
  // exactly as before, just no longer able to fail the build itself.
  let backendBase;
  try {
    // Task 7D.11 fix: no longer passes `process.env` explicitly (see
    // lib/apiConfig.js's header comment) -- this Route Handler only ever
    // runs server-side, so it was never actually broken in practice, but
    // the pattern itself was misleading and is fixed here for consistency.
    backendBase = resolveApiBase(undefined, 'http://localhost:4000/api/v1');
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  let verified;
  try {
    verified = await fetch(`${backendBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    return Response.json({ error: 'Could not reach the backend to verify this session.' }, { status: 502 });
  }
  if (!verified.ok) {
    return Response.json({ error: 'Not a valid admin session.' }, { status: 401 });
  }

  (await draftMode()).enable();
  return Response.json({ redirect: path });
}
