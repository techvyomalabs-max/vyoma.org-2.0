// WordPress -> MERN migration: the single missing Panchatantra demo-URL
// redirect (Task 7F.4A/7F.4B).
//
// Scope: create exactly ONE Redirect document —
//   /media/blog/how-the-pancatantra-teaches-without-teaching  (301)
//   -> /media/blog/how-panchatantra-teaches-without-teaching
// — confirmed in Task 7F.4A's read-only audit to be the only one of the 20
// proposed blog redirects actually missing from the Redirect collection;
// the other 19 (the real WordPress /blog-post/... redirects) already exist
// there, with destinations independently re-verified byte-for-byte correct
// against this engagement's own WXR-derived mapping.
//
// Explicitly OUT of scope (must not be touched by this script): every
// other Redirect document, BlogPost, BlogCategory, Content, image mapping,
// and CloudFront artifact regeneration (a separate, later, manual step —
// see Backend/scripts/deploy/generate-redirect-manifest.mjs — never run by
// this script).
//
// Modes:
//   node panchatantra-redirect-migration.mjs            -> dry-run (default):
//                                                           validates and
//                                                           prints the
//                                                           intended
//                                                           operation,
//                                                           writes nothing.
//   node panchatantra-redirect-migration.mjs --commit   -> performs the
//                                                           real write, only
//                                                           after the same
//                                                           validation
//                                                           passes.
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { RedirectModel } from '../../../src/modules/redirects/redirect.model.js';

export const PANCHATANTRA_REDIRECT = {
  fromPath: '/media/blog/how-the-pancatantra-teaches-without-teaching',
  toPath: '/media/blog/how-panchatantra-teaches-without-teaching',
  statusCode: 301,
  notes:
    'Demo-stub BlogPost slug (replaced by the real migrated post under a different, correctly-spelled slug — see ' +
    'Task 6I-B/7D/7F). Permanently redirected per the Task 7F content-owner-approved Decision 3.',
};

// Self-contained, narrow blocklist guard — deliberately NOT imported from
// Backend/scripts/wordpress/import/batch1-import.mjs (an unrelated module
// for an unrelated content type; importing a cross-cutting safety helper
// from it would be an unrelated coupling this narrowly-scoped script has no
// reason to introduce). Same convention, same protected name, same
// never-log-the-connection-string rule.
const PROTECTED_DB_NAMES = new Set(['vyoma_migration_dryrun']);
export function assertSafeDatabaseTarget(connection) {
  const dbName = connection?.name || connection?.db?.databaseName || null;
  if (dbName && PROTECTED_DB_NAMES.has(dbName)) {
    throw new Error(
      `Refusing to proceed: the active database ("${dbName}") is on this script's protected list and must never be read, written, reset, or reseeded by this migration.`
    );
  }
  return dbName;
}

// Insert-only via $setOnInsert — idempotent, matching this project's
// established overwrite-protection convention (Task 6I-B/6I-B3/7C). A
// rerun against a database that already has this exact fromPath makes
// zero changes, regardless of what toPath/statusCode/notes it already has
// — this script only ever creates the record if it is genuinely absent,
// never "corrects" an existing one. `fromPath` is RedirectModel's uniquely
// indexed field, so a duplicate document can never be created here even in
// a race, independent of this $setOnInsert choice.
export async function upsertPanchatantraRedirect() {
  return RedirectModel.findOneAndUpdate(
    { fromPath: PANCHATANTRA_REDIRECT.fromPath },
    {
      $setOnInsert: {
        toPath: PANCHATANTRA_REDIRECT.toPath,
        statusCode: PANCHATANTRA_REDIRECT.statusCode,
        notes: PANCHATANTRA_REDIRECT.notes,
      },
    },
    { upsert: true, new: true }
  );
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Panchatantra redirect migration — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Intended record:', PANCHATANTRA_REDIRECT);
  console.log('='.repeat(72));

  await connectDb();
  try {
    const dbName = assertSafeDatabaseTarget(mongoose.connection);
    console.log('[OK] Connected to configured MongoDB (URI value not printed; database name:', dbName || '(unknown)', ').');

    const existing = await RedirectModel.findOne({ fromPath: PANCHATANTRA_REDIRECT.fromPath }).lean();
    if (existing) {
      const matches = existing.toPath === PANCHATANTRA_REDIRECT.toPath && existing.statusCode === PANCHATANTRA_REDIRECT.statusCode;
      console.log(
        matches
          ? '[OK] A matching Redirect document already exists — this run is a no-op, as designed.'
          : `[WARNING] A Redirect document for this fromPath already exists with a DIFFERENT destination (toPath="${existing.toPath}", statusCode=${existing.statusCode}). ` +
              'This script never overwrites it — investigate manually before proceeding.'
      );
    } else {
      console.log('[plan] No existing record found — would insert exactly 1 new Redirect document.');
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    const doc = await upsertPanchatantraRedirect();
    console.log('\n[done] Redirect document:', doc.toObject());
    console.log('--- COMMIT complete. ---');
    console.log(
      '\nNOTE: this only updates the MongoDB Redirect collection (the authoring source of truth). It does NOT ' +
        'regenerate infra/cloudfront/redirect-function.generated.js, and does NOT touch any real CloudFront ' +
        'distribution — both remain separate, later, manual steps (see Backend/scripts/deploy/' +
        'generate-redirect-manifest.mjs and infra/cloudfront/README.md).'
    );
  } finally {
    await disconnectDb();
  }
}

// Same import-guard convention as batch1-import.mjs (Task 7C): main() only
// runs on direct CLI invocation, never as a side effect of importing this
// module — this is what makes upsertPanchatantraRedirect()/
// assertSafeDatabaseTarget() safe for a test file to import and exercise
// against its own disposable mongodb-memory-server connection.
const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exitCode = 1;
  });
}
