# WordPress migration — scaffold only

This folder holds the tooling for migrating content from the production
WordPress site into this project's MongoDB-backed CMS. **Nothing in here
runs an import yet** — this commit only lays out where each stage of that
work will live.

## Folder purpose

- **`inventory/`** — read-only discovery output: what exists on the live
  WordPress site (pages, posts, media, menus, categories/tags, SEO
  metadata, custom post types, plugins). Populated by scripts that only
  *read* from WordPress's public REST API or an exported WXR file — never
  writes back to WordPress.
- **`parsers/`** — code that reads raw WordPress export formats (WXR/XML,
  a SQL dump, or REST API JSON) and turns them into plain in-memory
  records. No knowledge of this project's Mongoose models lives here —
  parsers only understand WordPress's shape.
- **`transforms/`** — code that maps parsed WordPress records onto this
  project's content shapes (e.g. a WordPress post → a `BlogPost` document,
  a WordPress page → a `pages/*` Content document). This is also where the
  redirect-mapping proposal (old WordPress URL → new route) gets built.
- **`import/`** — code that actually writes transformed records into
  MongoDB via the existing models/APIs. Everything here must support a
  `--dry-run` mode that reports what *would* change without writing
  anything, so a review step can happen before any real write.
- **`reports/`** — output of dry runs and post-import reconciliation
  (counts in vs. counts out, anything that couldn't be mapped, anything
  flagged for manual review). Human-readable, checked into git so the
  migration has a paper trail.

## Migration order

1. **Backup** — a full WordPress export (WXR + database dump + uploads)
   taken *before* anything else, stored under `Backend/.migration-data/`
   (never committed — see below).
2. **Inventory** — read-only discovery against the live site and/or the
   backup, written to `inventory/`.
3. **Mapping** — the proposed WordPress → new-site mapping (content
   fields, URLs/redirects, taxonomies), reviewed and approved before use.
4. **Dry Run** — `import/` scripts run in `--dry-run` mode against the
   approved mapping; nothing is written to MongoDB; output goes to
   `reports/`.
5. **Review** — the dry-run report is checked by a human against the
   approved mapping before any real import runs.
6. **Import** — the same scripts run for real, writing into MongoDB via
   the existing models/APIs.
7. **Media Migration** — uploaded files moved into real storage (S3, once
   available) and re-linked to their imported records.
8. **SEO/Redirect Validation** — confirm every legacy URL either still
   resolves or 301s to its mapped destination, and that per-page SEO
   metadata carried over correctly.
9. **UAT** — user acceptance testing on the fully imported content before
   the new site is considered the system of record.

## `.migration-data/` is local-only

`Backend/.migration-data/` is where raw WordPress exports and backups
(`wordpress-export.xml`, `wordpress-database.sql`, `wp-content-uploads/`,
etc.) get placed during migration work. It is listed in
`Backend/.gitignore` and **must never be committed** — it can contain a
full copy of production content, uploaded media, and potentially
sensitive data (author accounts, form submissions, etc.) that has no
business being in this repository's history.

## WordPress stays read-only

Every step up through Dry Run must only *read* from WordPress (its public
REST API, its sitemap, or a native export you take yourself) or from the
local backup — nothing in this migration touches the live WordPress
site's own data. The production WordPress instance must remain read-only
throughout migration preparation, right up until the new site is ready to
fully replace it.
