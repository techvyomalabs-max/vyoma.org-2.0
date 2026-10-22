# `.local-media/` — local development image assets

`Backend/.local-media/` holds image files used only in local development:

- `.local-media/blog/` — original WordPress blog images staged locally so the
  migrated blog posts' inline images and featured images can be previewed and
  published without depending on their original (and in a few cases,
  third-party) source URLs.
- `.local-media/processed/` — background-removed Leadership/Core Team photos.

**These files are intentionally excluded from Git** (`.gitignore`). They are
real, potentially large binary assets with no reason to live in source
control, and the project's own `/local-media/*` static routes are explicitly
gated to local development only (see `Backend/src/app.js`) — they are never
mounted in production.

**A fresh clone of this repository will not contain `.local-media/`.** Any
blog post or profile photo whose URL points at `/local-media/...` will 404
until that directory is populated — either by re-running the relevant staging
script, or by copying the directory over from a machine that already has it.

**Production requires permanent image hosting.** The intended path is S3 (see
`Backend/src/modules/photoProcessing/` for the existing local-dev storage
adapter and its production counterpart), with the affected content records
updated to reference the permanent URLs once that's in place — `/local-media/`
is a development convenience, not a deployment target.
