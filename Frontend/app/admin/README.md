# Admin Portal — reserved, not yet built

Per HLD Section 5 (Admin Portal) and Section 15 (Open Decisions), and per explicit
instruction for this migration phase, the Admin Portal is **architecture only**:
this directory intentionally holds no `page.js`/routes yet.

Future modules (LLD Section 21, "Minimum Admin Screens"), once authentication
(LLD Section 5) and the Express API are live:

- `app/admin/login/page.js`
- `app/admin/dashboard/page.js`
- `app/admin/content/[type]/page.js`
- `app/admin/media/page.js`
- `app/admin/forms/page.js`
- `app/admin/donations/page.js`
- `app/admin/redirects/page.js`
- `app/admin/settings/page.js`
- `app/admin/users/page.js`
- `app/admin/audit-logs/page.js` (Super Admin only)

Each would sit behind `middleware.js`-enforced auth + role checks (LLD Section
16), never rendered inside the `(public)` layout/route group.
