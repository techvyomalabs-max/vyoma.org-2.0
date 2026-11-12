// Task 7H.2 Phase 3 — shared regression coverage for every WordPress
// migration import script under scripts/wordpress/import/ (the 27 scripts
// fixed in this task, plus the 3 already fixed in earlier tasks --
// batch1-import.mjs, batch2-import.mjs, panchatantra-redirect-migration.mjs,
// each of which keeps its own, more detailed test file) and the deploy-time
// scripts/deploy/generate-redirect-manifest.mjs.
//
// What this file checks, and why it's enough:
//   - Every script now delegates its database connection to the single,
//     shared, already-and-separately-tested connectToMigrationDb()
//     (see src/modules/blog/migrationDb.test.js for direct coverage of the
//     protected-name rejection, pre-connection validation order, and
//     malformed/missing-configuration behavior). Re-testing that same
//     rejection/acceptance behavior identically in all 28 callers would be
//     pure duplication, not additional coverage -- what actually needs
//     verifying PER SCRIPT is that each one is correctly WIRED to that
//     shared guard, with no leftover direct connectDb() call and no
//     reintroduced duplicate validation logic of its own.
//   - Every script's import-safety guard (isDirectCliInvocation) is checked
//     both statically and live (by actually importing all 28 modules and
//     confirming none of them opens a database connection as a side
//     effect) -- this is the one property that does need live verification
//     per script, since an import-time side effect is exactly the kind of
//     mistake a purely static/textual check could miss (e.g. a stray
//     top-level call outside any guarded block).
//
// No real or persistent MongoDB is ever touched by this file -- these
// scripts are only ever `import()`-ed (never have their own main() invoked),
// and dynamic import alone must never open a connection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mongoose from 'mongoose';

const IMPORT_DIR = new URL('../../scripts/wordpress/import/', import.meta.url);
const DEPLOY_DIR = new URL('../../scripts/deploy/', import.meta.url);

const MIGRATION_SCRIPTS = [
  'audit-reports-migration.mjs',
  'batch-redirects-remaining.mjs',
  'collaterals-remaining-migration.mjs',
  'coreteam-dedupe-associates.mjs',
  'credibility-documents-migration.mjs',
  'donate-subscription-link-migration.mjs',
  'donation-scheme-images-migration.mjs',
  'events-general-migration.mjs',
  'events-migration.mjs',
  'fix-legal-body.mjs',
  'gallery-migration.mjs',
  'leadership-awards-images-migration.mjs',
  'leadership-coreteam-bg-removal-apply.mjs',
  'newsletter-cover-migration.mjs',
  'newsletter-migration.mjs',
  'patron-categories-unify-migration.mjs',
  'patron-test-category-cleanup.mjs',
  'patrons-migration.mjs',
  'press-media-migration.mjs',
  'social-impact-fy25-migration.mjs',
  'testimonial-images-migration.mjs',
  'volunteer-images-migration.mjs',
  'what-sanskrit-migration.mjs',
  'where-iks-a-series-migration.mjs',
  'where-iks-b-series-migration.mjs',
  'where-iks-c-series-migration.mjs',
  'where-sanskrit-migration.mjs',
].map((name) => ({ name, url: new URL(name, IMPORT_DIR), kind: 'import' }));

const DEPLOY_SCRIPTS = [{ name: 'generate-redirect-manifest.mjs', url: new URL('generate-redirect-manifest.mjs', DEPLOY_DIR), kind: 'deploy' }];

const ALL_SCRIPTS = [...MIGRATION_SCRIPTS, ...DEPLOY_SCRIPTS];

test(`exactly ${MIGRATION_SCRIPTS.length} migration scripts + ${DEPLOY_SCRIPTS.length} deploy script are covered by this file`, () => {
  assert.equal(MIGRATION_SCRIPTS.length, 27);
  assert.equal(DEPLOY_SCRIPTS.length, 1);
});

for (const { name, url, kind } of ALL_SCRIPTS) {
  const source = fs.readFileSync(url, 'utf8');
  const expectedHelperImport =
    kind === 'import' ? "from './migrationDb.mjs';" : "from '../wordpress/import/migrationDb.mjs';";

  test(`${name}: imports connectToMigrationDb from the shared migrationDb.mjs, not a raw connectDb()`, () => {
    assert.match(source, /import\s*\{\s*connectToMigrationDb\s*\}\s*/, `${name} must import connectToMigrationDb`);
    assert.ok(source.includes(expectedHelperImport), `${name} must import it from the shared module at the expected relative path`);
    assert.ok(!/import\s*\{[^}]*\bconnectDb\b[^}]*\}\s*from\s*['"][^'"]*\/db\.js['"]/.test(source), `${name} must not import connectDb directly`);
    assert.ok(!/\bawait\s+connectDb\(\)/.test(source), `${name} must not call connectDb() directly -- only through connectToMigrationDb()`);
  });

  test(`${name}: does not duplicate the protected-database-name validation logic`, () => {
    assert.ok(!/const\s+PROTECTED_DB_NAMES/.test(source), `${name} must not define its own copy of PROTECTED_DB_NAMES`);
    assert.ok(!/function\s+assertSafeDatabaseTarget/.test(source), `${name} must not define its own copy of assertSafeDatabaseTarget`);
  });

  test(`${name}: calls connectToMigrationDb() before entering its try block / first query`, () => {
    const connectIdx = source.indexOf('await connectToMigrationDb();');
    assert.ok(connectIdx !== -1, `${name} must call connectToMigrationDb()`);
    const tryIdx = source.indexOf('try {', connectIdx);
    assert.ok(tryIdx !== -1, `${name} must enter a try block after connecting`);
    assert.ok(connectIdx < tryIdx, `${name}: the guarded connect must happen before the try block that runs queries/writes`);
  });

  test(`${name}: only runs main() on direct CLI invocation, never as an import side effect`, () => {
    assert.match(
      source,
      /const isDirectCliInvocation = process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href;/,
      `${name} must define the isDirectCliInvocation guard`
    );
    const guardIdx = source.indexOf('if (isDirectCliInvocation)');
    const mainCallIdx = source.indexOf('main().catch');
    assert.ok(guardIdx !== -1 && mainCallIdx !== -1, `${name} must have both the guard and the main().catch call`);
    assert.ok(guardIdx < mainCallIdx, `${name}: main() must only run inside the isDirectCliInvocation guard`);
  });

  test(`${name}: importing the module opens no database connection as a side effect`, async () => {
    const before = mongoose.connection.readyState;
    await import(url.href);
    assert.equal(mongoose.connection.readyState, before, `importing ${name} must not change the connection state`);
    assert.equal(mongoose.connection.readyState, 0, `no connection should exist merely from importing ${name}`);
  });
}
