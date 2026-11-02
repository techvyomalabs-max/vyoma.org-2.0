// Task 7F.8A — a narrowly-scoped, ONE-TIME script to upload the 8 Google-
// hosted blog images (identified in Task 7F.6's audit; the only non-
// already-safe-host inline images across the 19 real WordPress posts) to
// S3, and -- ONLY once every one of them is both uploaded AND
// independently read back and byte-for-byte verified -- generate
// Backend/.local-media/blog-image-production-urls.json in the exact shape
// Task 7F.7's loadProductionImageUrlMap()/buildProductionImageUrlMap()
// already expect and batch1-import.mjs already knows how to consume.
//
// Explicitly OUT of scope for this script: the ~54 already-safe-host
// (vyoma.org) inline images, any featured image, MongoDB, MediaModel, the
// admin media API, and any S3 object outside the media/blog/<slug>/
// key prefix this script owns exclusively (see OBJECT_KEY_RE below) --
// nothing here ever touches a key outside that namespace, so it can never
// collide with, or overwrite, an object created by the interactive admin
// upload flow (media.admin.controller.js), which always uses
// s3.adapter.js's own buildStorageKey() -- a DIFFERENT, randomized,
// non-nested key shape (media/<timestamp>-<hex><ext>) that can never
// produce a path under media/blog/.
//
// Reuses, UNMODIFIED: s3.adapter.js's uploadObject()/deleteObject()/
// isS3Configured() for every WRITE operation (this script adds no new
// write capability of its own), and fileSignature.js's
// matchesDeclaredFileType() for the same magic-byte check the admin
// upload API itself relies on. The one capability the existing adapter
// does not expose -- a read-back (GetObject) -- is added narrowly, here
// only, in createRealS3Ops() below, strictly for this script's own
// upload-then-verify step; s3.adapter.js itself is left untouched (Task
// 7F.8A's restriction).
//
// Modes:
//   node uploadBlogImagesToS3.mjs                 -> dry-run (default):
//                                                     makes ZERO network
//                                                     requests and writes
//                                                     NO file (not even
//                                                     the local run-state
//                                                     file) -- only reads
//                                                     the manifest and the
//                                                     8 local images, and
//                                                     prints the plan.
//   node uploadBlogImagesToS3.mjs --commit        -> performs the real
//                                                     uploads (requires
//                                                     AWS_REGION/
//                                                     AWS_S3_BUCKET/
//                                                     AWS_ACCESS_KEY_ID/
//                                                     AWS_SECRET_ACCESS_KEY
//                                                     to already be
//                                                     configured -- see
//                                                     isS3Configured()).
//                                                     Only writes
//                                                     blog-image-
//                                                     production-urls.json
//                                                     if ALL 8 images end
//                                                     THIS run's live,
//                                                     freshly-checked
//                                                     result as uploaded-
//                                                     and-verified or
//                                                     already-present-and-
//                                                     verified (never on
//                                                     trust in a prior
//                                                     run's recorded state
//                                                     alone) -- see the
//                                                     "never a partial/
//                                                     misleading mapping"
//                                                     gate in main().
//   node uploadBlogImagesToS3.mjs --commit
//        --cleanup-failed                         -> after a --commit
//                                                     run, additionally
//                                                     deletes (from S3)
//                                                     any object whose PUT
//                                                     succeeded but whose
//                                                     read-back
//                                                     verification failed
//                                                     -- so a failed run
//                                                     never leaves an
//                                                     unverified, orphaned
//                                                     object behind.
//
// Overwrite protection / anti-staleness: EVERY commit run, for EVERY
// planned item, always makes a live, authenticated S3 read of that exact
// key BEFORE ever considering a write -- the local run-state file below is
// never, by itself, sufficient grounds to skip an upload. If that read
// finds nothing, the upload proceeds normally. If it finds an object whose
// content matches the local file exactly, no PUT is issued (it is already
// correct) but it is still re-verified live. If it finds an object whose
// content DIFFERS from the local file, this script refuses to proceed for
// that item -- PutObject is never even called -- rather than silently
// overwriting whatever is actually there. This is what makes it impossible
// for a stale or since-changed/deleted local state record to cause a later
// run to trust an S3 object it never actually re-checked, and impossible
// for this script to blindly overwrite a pre-existing, unrelated object
// that happens to already occupy one of its deterministic keys.
//
// Local run-state file (Backend/.local-media/blog-image-upload-state.json,
// gitignored -- .local-media/, same as the manifest and production URL
// map): kept purely as a durable audit record of each key's last known
// outcome -- it is written after every commit run, but never trusted on
// its own to decide whether to skip a live check.
//
// Public-retrievability gate: before any URL is trusted enough to end a
// run as 'uploaded-and-verified'/'already-present-and-verified', this
// script performs a genuine, UNAUTHENTICATED HTTPS GET of that exact URL
// (see verifyPubliclyRetrievable()) and confirms the bytes it returns
// match the local file byte-for-byte. An authenticated S3 GetObject only
// proves this script's own AWS credentials can read an object back -- it
// proves nothing about whether an anonymous site visitor (the real
// audience for a URL embedded in a public blog post body) can. A bucket
// that is not actually configured for public read access on the
// media/blog/* prefix is therefore caught here, loudly, never silently
// recorded into blog-image-production-urls.json as if it were fine.
//
// ---------------------------------------------------------------------------
// AWS prerequisites (infrastructure, NOT created or modified by this script
// or this task -- documented here for the operator who will provision
// them before a real --commit run; see Task 7F.6's audit for the fuller
// comparison of hosting options):
//
//   - An S3 bucket (any region), with AWS_REGION/AWS_S3_BUCKET set to it.
//   - An IAM principal (user or role) with AWS_ACCESS_KEY_ID/
//     AWS_SECRET_ACCESS_KEY configured for this script's own execution
//     environment, scoped to LEAST PRIVILEGE:
//       - s3:PutObject   on arn:aws:s3:::<bucket>/media/blog/*   (uploads)
//       - s3:GetObject   on arn:aws:s3:::<bucket>/media/blog/*   (the
//                        upload-then-verify read-back this script adds)
//       - s3:DeleteObject on arn:aws:s3:::<bucket>/media/blog/*  (only
//                        needed if --cleanup-failed is ever used)
//     No s3:PutBucketPolicy, s3:PutObjectAcl, s3:*Tagging, or any
//     bucket-level/account-level permission is required. This script
//     never needs, and must never be granted, public-WRITE access of any
//     kind -- s3:PutObject with the principal's own credentials is
//     sufficient; a public-write bucket policy would let anyone on the
//     internet overwrite these objects and must never be used.
//   - Public READ access to the uploaded objects, since
//     s3.adapter.js's uploadObject() returns a plain
//     https://<bucket>.s3.<region>.amazonaws.com/<key> URL with no
//     signing -- i.e. the URL this script will persist into
//     blog-image-production-urls.json, and from there into a public
//     BlogPost body, must be reachable by anonymous site visitors. This
//     is ordinarily done at the BUCKET level (a bucket policy granting
//     s3:GetObject to principal "*", scoped to the media/blog/* prefix --
//     or, for the whole bucket, if it is dedicated to already-public
//     media and nothing else), NOT by granting any individual IAM
//     principal public-read -- public read is a resource (bucket) policy
//     decision, never an IAM credential's own permission. "Block Public
//     Access" at the bucket or account level must be configured to allow
//     this one, intentional, read-only public policy -- not disabled
//     wholesale.
//   - No CloudFront/CDN is required for this to work (see Task 7F.6,
//     Option B) -- it can be added later purely as a caching/performance
//     enhancement, never as a correctness requirement for this script.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

import { env, isS3Configured } from '../../../src/config/env.js';
import { uploadObject, deleteObject } from '../../../src/modules/media/s3.adapter.js';
import { matchesDeclaredFileType } from '../../../src/modules/media/fileSignature.js';
import { loadBlogImageManifest, isAlreadySafeImageHost, resolveWithinBlogMediaDir, isSafeProductionImageUrl } from './blogImageManifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPLOAD_STATE_PATH = path.resolve(__dirname, '../../../.local-media/blog-image-upload-state.json');
export const PRODUCTION_URL_MAP_OUTPUT_PATH = path.resolve(__dirname, '../../../.local-media/blog-image-production-urls.json');

// The exclusive key namespace this script ever reads or writes in S3 --
// deliberately distinct from s3.adapter.js's own buildStorageKey()
// convention (media/<timestamp>-<hex><ext>, flat, randomized) so the two
// can never collide, and narrow enough that a bug here could never produce
// a key outside media/blog/<slug>/inline-<n>.png.
const OBJECT_KEY_RE = /^media\/blog\/[a-z0-9-]+\/inline-[1-9][0-9]*\.png$/;

// ---------------------------------------------------------------------------
// Pure helpers (no I/O)
// ---------------------------------------------------------------------------

export function buildBlogImageKey(postSlug, index) {
  return `media/blog/${postSlug}/inline-${index}.png`;
}

export function assertSafeObjectKey(key) {
  if (!OBJECT_KEY_RE.test(key)) {
    throw new Error(
      `Refusing to use an S3 object key outside this script's exclusive media/blog/<slug>/inline-<n>.png namespace: "${key}"`
    );
  }
}

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Selects exactly the manifest's non-already-safe-host inline rows (the 8
// Google-hosted images, today) and assigns each a deterministic,
// per-postSlug sequential (1-based) index and object key. Every key is
// validated against OBJECT_KEY_RE before being added to the plan, and a
// (belt-and-suspenders) duplicate-key check guards against ever planning
// two uploads to the same key in one run -- unreachable under the current
// one-postSlug-counter design, but kept as an explicit invariant rather
// than an assumption.
export function planUploads(manifest) {
  const rows = (manifest?.rows || []).filter((r) => r.type === 'inline' && !isAlreadySafeImageHost(r.originalUrl));
  const perSlugCounter = new Map();
  const plan = [];
  const seenKeys = new Set();

  for (const row of rows) {
    const n = (perSlugCounter.get(row.postSlug) || 0) + 1;
    perSlugCounter.set(row.postSlug, n);
    const key = buildBlogImageKey(row.postSlug, n);

    assertSafeObjectKey(key);
    if (seenKeys.has(key)) {
      throw new Error(`Refusing to plan a duplicate upload key within the same run: "${key}"`);
    }
    seenKeys.add(key);

    plan.push({ postSlug: row.postSlug, originalUrl: row.originalUrl, localFilename: row.localFilename, key });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Local file loading / validation (no network)
// ---------------------------------------------------------------------------

export function loadAndValidateLocalImage(item) {
  const resolved = resolveWithinBlogMediaDir(item.localFilename);
  if (!resolved) {
    return { ok: false, error: `Unsafe local filename, refusing to read: ${item.localFilename}` };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `Local file missing: ${item.localFilename}` };
  }
  const buffer = fs.readFileSync(resolved);
  if (!buffer.length) {
    return { ok: false, error: `Local file is empty: ${item.localFilename}` };
  }
  if (!matchesDeclaredFileType('image/png', buffer)) {
    return { ok: false, error: `Local file does not have a valid PNG signature: ${item.localFilename}` };
  }
  return { ok: true, buffer, sha256: sha256Hex(buffer) };
}

// ---------------------------------------------------------------------------
// Run-state persistence (gitignored, same .local-media/ convention as the
// manifest and the production URL map this script eventually produces)
// ---------------------------------------------------------------------------

export function loadUploadState() {
  if (!fs.existsSync(UPLOAD_STATE_PATH)) return {};
  const raw = fs.readFileSync(UPLOAD_STATE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Upload state file at ${UPLOAD_STATE_PATH} is malformed: expected a plain object keyed by S3 object key.`);
  }
  return parsed;
}

export function saveUploadState(state) {
  fs.mkdirSync(path.dirname(UPLOAD_STATE_PATH), { recursive: true });
  fs.writeFileSync(UPLOAD_STATE_PATH, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// Retry helper -- exponential backoff, `sleep` injectable so tests never
// actually wait through real delays.
// ---------------------------------------------------------------------------

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries(fn, { maxAttempts = 3, baseDelayMs = 200, sleep = defaultSleep } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// S3 operations -- a deliberately narrow interface (isConfigured/putObject/
// getObject/deleteObject) this script depends on, never the SDK directly,
// so tests can inject a fully synthetic implementation and never construct
// a real S3Client. The REAL implementation reuses uploadObject()/
// deleteObject()/isS3Configured() from the existing, UNMODIFIED S3 adapter
// for every write; the one capability that adapter does not expose for its
// own (admin-upload) use case -- a read-back -- is added here, narrowly,
// using the same lazy-client-on-first-use pattern as s3.adapter.js itself.
// ---------------------------------------------------------------------------

export function createRealS3Ops() {
  let client = null;
  function getReadClient() {
    if (!isS3Configured()) return null;
    if (!client) {
      client = new S3Client({ region: env.s3.region, credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey } });
    }
    return client;
  }

  return {
    isConfigured: () => isS3Configured(),
    async putObject({ key, buffer, mimeType }) {
      return uploadObject({ key, buffer, mimeType });
    },
    // Returns { buffer, url } for an existing object, or null if the key
    // genuinely does not exist (NoSuchKey/404 -- the one failure mode that
    // must NEVER be retried or treated as a transient error, since it is
    // the expected, correct answer for "this key has never been uploaded
    // yet"). Any OTHER failure (network error, access denied, etc.)
    // propagates so withRetries()'s caller retries it, rather than this
    // function silently turning a real problem into a false "absent".
    async getObject({ key }) {
      const s3 = getReadClient();
      if (!s3) return null;
      try {
        const response = await s3.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
        const chunks = [];
        for await (const chunk of response.Body) chunks.push(chunk);
        return { buffer: Buffer.concat(chunks), url: `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}` };
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async deleteObject({ key }) {
      return deleteObject({ key });
    },
  };
}

// A GetObject read-back via the authenticated S3 client (above) only proves
// the bytes exist in the bucket and are readable BY THIS SCRIPT'S OWN
// credentials -- it says nothing about whether an anonymous site visitor
// (the actual audience for a URL embedded in a public blog post body) can
// retrieve it. This performs a genuine, unauthenticated HTTPS GET against
// the exact URL that would be recorded into blog-image-production-urls.json,
// so a bucket that is not actually publicly readable (e.g. "Block Public
// Access" left on, or no public-read bucket policy configured) is caught
// here, loudly, rather than only discovered later when a real site visitor
// gets an AccessDenied page. `fetchImpl` is injectable so tests never make
// a real HTTP request. Throws (never returns a boolean) so it composes
// directly with withRetries(), exactly like the upload/verify steps above.
export async function verifyPubliclyRetrievable(url, { fetchImpl = globalThis.fetch, expectedSha256 } = {}) {
  if (!isSafeProductionImageUrl(url)) {
    throw new Error(`Refusing to treat a non-https URL as publicly retrievable: ${url}`);
  }
  let response;
  try {
    response = await fetchImpl(url);
  } catch (err) {
    throw new Error(`Public (anonymous) fetch of the uploaded URL failed: ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`Public (anonymous) fetch of the uploaded URL returned HTTP ${response.status} -- it is not publicly retrievable yet.`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (expectedSha256 && sha256Hex(buffer) !== expectedSha256) {
    throw new Error('The publicly-fetched content does not match the uploaded file byte-for-byte.');
  }
}

// ---------------------------------------------------------------------------
// Core orchestration. `s3Ops`, `loadLocalImage`, and `fetchImpl` are all
// injectable so every behavior below (retries, partial failure, overwrite
// protection, duplicate-execution safety, rollback) is fully testable with
// zero filesystem/network dependency -- see uploadBlogImagesToS3.test.js.
// ---------------------------------------------------------------------------

export async function runUploadPlan(plan, { s3Ops, commit, state = {}, maxAttempts = 3, sleep, fetchImpl, loadLocalImage = loadAndValidateLocalImage } = {}) {
  const results = [];
  const nextState = { ...state };

  for (const item of plan) {
    assertSafeObjectKey(item.key); // redundant with planUploads() -- independent guard, never trust a key blindly here either

    const local = loadLocalImage(item);
    if (!local.ok) {
      results.push({ ...item, status: 'invalid-local-file', error: local.error });
      nextState[item.key] = { status: 'invalid-local-file', error: local.error };
      continue;
    }

    if (!commit) {
      results.push({ ...item, status: 'planned-dry-run', sha256: local.sha256 });
      continue;
    }

    // Overwrite-protection + anti-staleness preflight: this ALWAYS makes a
    // live S3 read before ever considering a PUT, on EVERY commit run --
    // the local state file (`state`/`nextState`) is never, by itself,
    // sufficient grounds to treat a key as already verified. This is what
    // guarantees that a stale or since-deleted/changed remote object can
    // never be trusted just because an old local record says "verified",
    // and what makes overwriting a pre-existing, unrelated object at this
    // exact deterministic key structurally impossible: if content differs,
    // this script refuses to proceed, full stop, before any PUT is issued.
    let preflight;
    try {
      // eslint-disable-next-line no-await-in-loop
      preflight = await withRetries(() => s3Ops.getObject({ key: item.key }), { maxAttempts, sleep });
    } catch (err) {
      results.push({ ...item, status: 'failed', stage: 'preflight-check', putSucceeded: false, error: err.message });
      nextState[item.key] = { status: 'failed', error: err.message };
      continue;
    }

    let uploadResult;
    if (preflight) {
      const remoteSha = sha256Hex(preflight.buffer);
      if (remoteSha !== local.sha256) {
        // An object already exists at this exact key with DIFFERENT
        // content than the local file -- refuse to overwrite it,
        // unconditionally. putObject is never even called in this branch.
        results.push({
          ...item,
          status: 'failed',
          stage: 'conflict',
          putSucceeded: false,
          error: `An object already exists at "${item.key}" with different content than the local file -- refusing to overwrite it.`,
        });
        nextState[item.key] = { status: 'failed', error: 'conflict: existing remote object content differs from the local file' };
        continue;
      }
      // Content matches exactly -- already correctly present (e.g. a
      // prior successful run, confirmed live rather than merely assumed
      // from local state). No PUT is issued; this still goes through the
      // SAME public-retrievability check below before being trusted.
      uploadResult = { url: preflight.url, alreadyPresent: true };
    } else {
      // Genuinely absent -- safe to upload.
      try {
        // eslint-disable-next-line no-await-in-loop
        uploadResult = await withRetries(() => s3Ops.putObject({ key: item.key, buffer: local.buffer, mimeType: 'image/png' }), { maxAttempts, sleep });
        if (!uploadResult || !uploadResult.url) {
          throw new Error('Upload did not return a URL (S3 not configured?)');
        }
        if (!isSafeProductionImageUrl(uploadResult.url)) {
          throw new Error(`Upload returned an unsafe (non-https) URL, refusing to trust it: ${uploadResult.url}`);
        }
      } catch (err) {
        results.push({ ...item, status: 'failed', stage: 'upload', putSucceeded: false, error: err.message });
        nextState[item.key] = { status: 'failed', error: err.message };
        continue;
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        const verifyResult = await withRetries(() => s3Ops.getObject({ key: item.key }), { maxAttempts, sleep });
        if (!verifyResult || sha256Hex(verifyResult.buffer) !== local.sha256) {
          throw new Error('Post-upload verification failed: the object read back from S3 does not match the local file byte-for-byte.');
        }
      } catch (err) {
        results.push({ ...item, status: 'failed', stage: 'verify', putSucceeded: true, url: uploadResult.url, error: err.message });
        nextState[item.key] = { status: 'failed', error: err.message, url: uploadResult.url };
        continue;
      }
    }

    // Final gate, common to BOTH the "freshly uploaded" and "already
    // present" paths: the URL this script is about to record must be
    // confirmed anonymously, publicly retrievable -- an authenticated
    // GetObject success above only proves this script's own credentials
    // can read it back, never that a real site visitor can.
    try {
      // eslint-disable-next-line no-await-in-loop
      await withRetries(() => verifyPubliclyRetrievable(uploadResult.url, { fetchImpl, expectedSha256: local.sha256 }), { maxAttempts, sleep });
    } catch (err) {
      results.push({ ...item, status: 'failed', stage: 'public-retrieval', putSucceeded: true, url: uploadResult.url, error: err.message });
      nextState[item.key] = { status: 'failed', error: err.message, url: uploadResult.url };
      continue;
    }

    const finalStatus = uploadResult.alreadyPresent ? 'already-present-and-verified' : 'uploaded-and-verified';
    results.push({ ...item, status: finalStatus, url: uploadResult.url, sha256: local.sha256 });
    nextState[item.key] = { status: finalStatus, url: uploadResult.url, sha256: local.sha256, uploadedAt: new Date().toISOString() };
  }

  return { results, nextState };
}

// Only ever meaningful to call once every item in `results` resolves to
// 'uploaded-and-verified' or 'already-present-and-verified' -- main()
// enforces that gate immediately before calling this; this function itself
// does not re-check it, so it must never be called directly on an
// unfiltered, possibly-partial result set.
export function buildProductionUrlRows(results) {
  return results.map((r) => ({ postSlug: r.postSlug, originalUrl: r.originalUrl, productionUrl: r.url }));
}

export function writeProductionUrlMap(rows) {
  fs.mkdirSync(path.dirname(PRODUCTION_URL_MAP_OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(PRODUCTION_URL_MAP_OUTPUT_PATH, JSON.stringify({ rows }, null, 2));
}

// Reverses a partial/failed run's successfully-PUT-but-never-verified
// objects (putSucceeded:true, status:'failed') by deleting them from S3,
// so a bucket never accumulates an orphaned, unverified object this script
// itself cannot account for. Never called automatically -- an operator
// opts in via --cleanup-failed -- and itself gated by the same `commit`
// flag real uploads use (a dry-run only reports what WOULD be deleted).
// Deliberately never attempts to delete a 'failed' item whose PUT itself
// never succeeded (putSucceeded:false/undefined) -- there is nothing in S3
// to delete for those, and calling delete on a key that was never written
// serves no purpose.
export async function rollbackFailedUploads(results, { s3Ops, commit }) {
  const rolledBack = [];
  for (const r of results) {
    if (r.status !== 'failed' || !r.putSucceeded) continue;
    if (!commit) {
      rolledBack.push({ key: r.key, status: 'would-delete-dry-run' });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await s3Ops.deleteObject({ key: r.key });
      rolledBack.push({ key: r.key, status: 'deleted' });
    } catch (err) {
      rolledBack.push({ key: r.key, status: 'delete-failed', error: err.message });
    }
  }
  return rolledBack;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const commit = process.argv.includes('--commit');
  const cleanupFailed = process.argv.includes('--cleanup-failed');

  console.log('='.repeat(72));
  console.log(`Blog image S3 upload — mode: ${commit ? 'COMMIT (will upload to S3)' : 'DRY-RUN (no network requests, no files written)'}`);
  console.log('='.repeat(72));

  const manifest = loadBlogImageManifest();
  if (!manifest) {
    console.error('\nABORT: Backend/.local-media/blog-image-manifest.json is absent.');
    process.exitCode = 1;
    return;
  }

  let plan;
  try {
    plan = planUploads(manifest);
  } catch (err) {
    console.error('\nABORT:', err.message);
    process.exitCode = 1;
    return;
  }

  console.log(`\n[plan] ${plan.length} upload(s) planned:`);
  for (const item of plan) console.log(`   - ${item.key}  (from "${item.postSlug}")`);

  if (plan.length !== 8) {
    console.error(`\nABORT: expected exactly 8 planned uploads (the known Google-hosted images), found ${plan.length}. Investigate before proceeding.`);
    process.exitCode = 1;
    return;
  }

  let state = {};
  try {
    state = loadUploadState();
  } catch (err) {
    console.error('\nABORT: the upload state file exists but is malformed:', err.message);
    process.exitCode = 1;
    return;
  }

  if (commit && !isS3Configured()) {
    console.error('\nABORT: --commit requires AWS_REGION/AWS_S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY to already be configured.');
    process.exitCode = 1;
    return;
  }

  const s3Ops = createRealS3Ops();
  const { results, nextState } = await runUploadPlan(plan, { s3Ops, commit, state });

  console.log('\n--- Results ---');
  for (const r of results) console.log(`   - ${r.key}: ${r.status}${r.error ? ` (${r.error})` : ''}`);

  if (!commit) {
    console.log('\n--- DRY-RUN complete: no network requests were made, no file was written. ---');
    console.log('Re-run with --commit to perform the real uploads (requires AWS_* env vars).');
    return;
  }

  saveUploadState(nextState);
  console.log(`\n[done] Upload state saved to ${UPLOAD_STATE_PATH}`);

  if (cleanupFailed) {
    const rolledBack = await rollbackFailedUploads(results, { s3Ops, commit });
    if (rolledBack.length) {
      console.log('\n--- Rollback of failed-but-partially-uploaded objects ---');
      for (const r of rolledBack) console.log(`   - ${r.key}: ${r.status}${r.error ? ` (${r.error})` : ''}`);
    }
  }

  const allOk = results.every((r) => r.status === 'uploaded-and-verified' || r.status === 'already-present-and-verified');
  if (!allOk) {
    console.error(
      '\nABORT: not every image is uploaded-and-verified yet — refusing to write blog-image-production-urls.json. ' +
        'This is the "never write a partial/misleading mapping" guarantee. Investigate the failure(s) above, then re-run ' +
        '(already-verified images from this run are skipped automatically next time).'
    );
    process.exitCode = 1;
    return;
  }

  const rows = buildProductionUrlRows(results);
  writeProductionUrlMap(rows);
  console.log(`\n[done] Wrote ${rows.length} verified production URL mapping(s) to ${PRODUCTION_URL_MAP_OUTPUT_PATH}`);
  console.log('--- COMMIT complete. ---');
}

// Same import-guard convention as every other script in this directory
// (batch1-import.mjs, panchatantra-redirect-migration.mjs): main() only
// runs on direct CLI invocation, never as a side effect of importing this
// module -- this is what makes every exported function above safe for a
// test file to import and exercise directly, with no accidental network
// call or file write.
const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exitCode = 1;
  });
}
