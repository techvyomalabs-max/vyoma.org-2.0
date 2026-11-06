# Admin Portal

The Admin Portal is implemented. This directory holds real routes, not a
reserved/future structure — every page listed below exists and is built.

## Routes

- `app/admin/login/page.js` — login (email/password, MFA verification, MFA
  enrollment).
- `app/admin/dashboard/page.js`
- Website Content editors — one structured editor per already-migrated page
  type: `app/admin/content/home`, `about`, `our-work`, `impact`,
  `credibility`, `join-us`, `donate`, `faq`, `contact`, `blog`
  (`app/admin/content/blog/page.js` + `blog/[id]/page.js`), `testimonials`,
  `events`, `gallery`, `newsletter`, `privacy`, `terms`.
- `app/admin/content/page.js` + `app/admin/content/[...type]/page.js` — a
  generic fallback editor for any content `type` that does not yet have its
  own structured editor above. `app/admin/content/page.js` explicitly
  excludes every already-migrated type from its list (see its own comment:
  "the old editor is a fallback, not a second workflow"), so a type is never
  editable in two different places at once.
- `app/admin/media/page.js`
- `app/admin/forms/page.js` + `app/admin/forms/[id]/page.js`
- `app/admin/donations/schemes/page.js`
- `app/admin/donations/transactions/page.js` + `transactions/[id]/page.js`
- `app/admin/redirects/page.js`
- `app/admin/settings/page.js`
- `app/admin/users/page.js` — Super Admin only.
- `app/admin/audit-logs/page.js` — Super Admin only.

## Authentication and route protection

There is deliberately **no** Next.js `middleware.js` gating `/admin` — see
`components/admin/RequireAdminAuth.jsx`'s own comment: the Backend's
HTTP-only refresh cookie lives on the Backend's own origin, which Edge
Middleware running on the Frontend's origin cannot see, so a
cookie-inspecting middleware would always (incorrectly) redirect to login.
Auth is instead client-side:

- `lib/AdminAuthContext.jsx` (`AdminAuthProvider`) holds the session: a
  short-lived access token kept only in memory (never localStorage/
  sessionStorage, cleared on reload), re-established on every page load via
  a silent `/auth/refresh` call against the existing HTTP-only cookie.
  Handles login, TOTP MFA verification, MFA enrollment, logout, an
  authenticated-fetch wrapper with one silent refresh-and-retry on a 401,
  and draft-mode preview links.
- `components/admin/RequireAdminAuth.jsx` is the actual route guard:
  redirects to `/admin/login` once the context resolves to
  `unauthenticated`. Used by pages that need it (e.g.
  `app/admin/content/page.js`).
- `app/admin/layout.js` wraps every `/admin/*` route in `AdminAuthProvider`
  + `ToastProvider` + `AdminShell`.
- `components/admin/AdminShell.jsx` renders the authenticated chrome
  (top bar, role-filtered sidebar nav) only once `status === 'authenticated'`
  — otherwise it renders `children` directly, which is what lets
  `/admin/login` render with no shell, with no path-based special-casing.
  Its own `NAV` array gates **Users** and **Audit Logs** to
  `roles: ['super_admin']` so a non-super-admin never even sees a nav entry
  that would just 403 — both are also enforced on the Backend
  (`requireRole('super_admin')`) regardless of what the Frontend shows.

Do not add a `middleware.js` for this without first re-reading
`RequireAdminAuth.jsx`'s comment above — the cross-origin cookie problem it
describes still applies.
