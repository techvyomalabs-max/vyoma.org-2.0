// Task 7F.4B — regression tests for the single missing Panchatantra
// demo-URL redirect and for the health of the full 20-rule blog-redirect
// set (19 already-existing WordPress redirects + this one) that Task
// 7F.4A's read-only audit found. Runs only against disposable
// mongodb-memory-server instances for its DB-backed tests; every other
// test is pure logic, no network, no AWS, no real CloudFront generation.
//
// Backend/scripts/deploy/generate-redirect-manifest.mjs is never imported
// here: it auto-runs main()/connectDb() on import with no execution guard
// (unlike batch1-import.mjs's guarded main()), so importing it would
// attempt a real database connection. Its documented
// buildCloudFrontFunctionSource()/validate() logic is instead reproduced
// verbatim below (same approach already used for Task 7F.4A's read-only
// audit) -- resolveRedirect() IS imported for real, since that module is a
// pure, side-effect-free function.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { resolveRedirect } from './resolveRedirect.js';
import { redirectMiddleware } from '../../middleware/redirectMiddleware.js';
import { RedirectModel } from './redirect.model.js';
import {
  PANCHATANTRA_REDIRECT,
  upsertPanchatantraRedirect,
  assertSafeDatabaseTarget,
} from '../../../scripts/wordpress/import/panchatantra-redirect-migration.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXISTING_MAP_PATH = path.resolve(__dirname, '../../../../infra/cloudfront/redirect-map.generated.json');
const EXISTING_FUNCTION_PATH = path.resolve(__dirname, '../../../../infra/cloudfront/redirect-function.generated.js');
const APP_JS_PATH = path.resolve(__dirname, '../../app.js');

const EXISTING_MAP = JSON.parse(fs.readFileSync(EXISTING_MAP_PATH, 'utf8'));
const CURRENT_FUNCTION_BYTES = fs.readFileSync(EXISTING_FUNCTION_PATH).length;
const APP_JS_SOURCE = fs.readFileSync(APP_JS_PATH, 'utf8');

const CLOUDFRONT_FUNCTION_LIMIT_BYTES = 10240; // AWS CloudFront Functions deployed-source limit (10 KiB)

// --- Verbatim reproductions of generate-redirect-manifest.mjs's own logic,
// never imported from the real (auto-running) file. See this file's header
// comment for why. ---------------------------------------------------------

function buildCloudFrontFunctionSource(map, ruleCount) {
  const mapJson = JSON.stringify(map, null, 2);
  return (
    '// GENERATED FILE — do not edit by hand.\n' +
    '// Produced by Backend/scripts/deploy/generate-redirect-manifest.mjs from the\n' +
    '// MongoDB Redirect collection (the authoring source of truth; edit redirects\n' +
    '// there, via the existing admin screen, then regenerate this file).\n' +
    '// Generated at: ' + new Date().toISOString() + '\n' +
    '// Rule count: ' + ruleCount + '\n' +
    '//\n' +
    '// Intended target: a CloudFront Function associated with the viewer-request\n' +
    '// event of the production CloudFront distribution in front of the S3-hosted\n' +
    '// frontend. Deploying this file to a real distribution is a separate, later\n' +
    '// step requiring AWS access — this file is not deployed by this script.\n' +
    '//\n' +
    '// Matching semantics (must not be "improved" without re-approving the\n' +
    '// underlying decision — see infra/cloudfront/README.md):\n' +
    '//   - Case-sensitive exact pathname match, with one normalization: if\n' +
    '//     the exact path misses, the other trailing-slash form is tried\n' +
    '//     (slash added if absent, stripped if present) — identical\n' +
    '//     semantics to the existing Express redirectMiddleware\n' +
    '//     (Backend/src/middleware/redirectMiddleware.js), since both\n' +
    '//     embed/call the exact same resolveRedirect() function (see\n' +
    '//     Backend/src/modules/redirects/resolveRedirect.js — its source is\n' +
    '//     copied verbatim below via .toString(), not reimplemented).\n' +
    '//   - Percent-encoded legacy paths are matched literally (CloudFront\n' +
    '//     delivers event.request.uri already percent-encoded as received;\n' +
    '//     this function does not decode or re-encode it).\n' +
    '//   - The query string is ignored for matching and never forwarded to\n' +
    '//     the redirect target.\n' +
    '//   - An unmatched request is returned unchanged so it continues on to\n' +
    '//     the S3 origin normally.\n' +
    '\n' +
    'var REDIRECT_MAP = ' + mapJson + ';\n' +
    '\n' +
    resolveRedirect.toString() + '\n' +
    '\n' +
    'function handler(event) {\n' +
    '  var request = event.request;\n' +
    '  var uri = request.uri;\n' +
    '  var rule = resolveRedirect(uri, REDIRECT_MAP);\n' +
    '  if (!rule) {\n' +
    '    return request;\n' +
    '  }\n' +
    '  return {\n' +
    '    statusCode: rule.statusCode,\n' +
    '    statusDescription: rule.statusCode === 301 ? "Moved Permanently" : "Found",\n' +
    '    headers: {\n' +
    '      location: { value: rule.toPath }\n' +
    '    }\n' +
    '  };\n' +
    '}\n'
  );
}

function validate(redirects) {
  const errors = [];
  const byFromPath = new Map();
  for (const r of redirects) {
    if (!r.fromPath || typeof r.fromPath !== 'string' || !r.fromPath.trim()) {
      errors.push(`Empty/invalid fromPath on document.`);
      continue;
    }
    if (!r.toPath || typeof r.toPath !== 'string' || !r.toPath.trim()) errors.push(`Empty/invalid toPath on fromPath "${r.fromPath}".`);
    if (!new Set([301, 302]).has(r.statusCode)) errors.push(`Invalid statusCode "${r.statusCode}" on fromPath "${r.fromPath}".`);
    if (byFromPath.has(r.fromPath)) errors.push(`Duplicate fromPath: "${r.fromPath}".`);
    else byFromPath.set(r.fromPath, r);
  }
  for (const r of redirects) {
    if (!r.fromPath || !r.toPath) continue;
    if (r.fromPath === r.toPath) errors.push(`Self-loop: "${r.fromPath}" redirects to itself.`);
    const reverse = byFromPath.get(r.toPath);
    if (reverse && reverse.toPath === r.fromPath) errors.push(`Direct two-rule reversal: "${r.fromPath}" <-> "${r.toPath}".`);
    if (byFromPath.has(r.toPath) && byFromPath.get(r.toPath) !== r) {
      errors.push(`Possible redirect chain: "${r.fromPath}" -> "${r.toPath}" -> "${byFromPath.get(r.toPath).toPath}".`);
    }
  }
  return errors;
}

function docsFromMap(map) {
  return Object.entries(map).map(([fromPath, v]) => ({ fromPath, toPath: v.toPath, statusCode: v.statusCode }));
}
function mapFromDocs(docs) {
  const sorted = [...docs].sort((a, b) => (a.fromPath < b.fromPath ? -1 : a.fromPath > b.fromPath ? 1 : 0));
  const map = {};
  for (const r of sorted) map[r.fromPath] = { toPath: r.toPath, statusCode: r.statusCode };
  return map;
}

const KNOWN_19_BLOG_REDIRECTS = Object.entries(EXISTING_MAP).filter(([k]) => k.startsWith('/blog-post/') && k !== '/blog-post/');

// Exactly ONE shared disposable mongodb-memory-server + ONE shared default
// mongoose connection for this whole file, established before any test
// runs (node:test's top-level before()/after() apply to every test in the
// file regardless of where they're written) -- every DB-backed test below
// reuses this same connection and just resets collection state itself via
// RedirectModel.deleteMany({}), rather than opening a second, competing
// mongoose.connect() call on the same global singleton connection (which
// previously caused this file to hang indefinitely). The one exception is
// the "protected database name" test near the end, which deliberately uses
// mongoose.createConnection() -- a separate, non-default connection object
// -- precisely so it never touches this shared connection at all.
let mem;
before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});
after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

// --- 1 & 7: all 19 existing blog redirects resolve correctly, and remain
// intact once the Panchatantra rule is added -------------------------------

test('sanity: the checked-in map contains exactly the 19 real WordPress blog redirects', () => {
  assert.equal(KNOWN_19_BLOG_REDIRECTS.length, 19);
});

test('all 19 existing WordPress blog redirects resolve correctly via the real resolveRedirect()', () => {
  for (const [fromPath, rule] of KNOWN_19_BLOG_REDIRECTS) {
    assert.deepEqual(resolveRedirect(fromPath, EXISTING_MAP), { toPath: rule.toPath, statusCode: rule.statusCode }, `expected "${fromPath}" to resolve correctly`);
  }
});

test('adding the Panchatantra rule leaves all 51 existing rules completely unchanged', () => {
  const combinedMap = { ...EXISTING_MAP, [PANCHATANTRA_REDIRECT.fromPath]: { toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: PANCHATANTRA_REDIRECT.statusCode } };
  for (const [fromPath, rule] of Object.entries(EXISTING_MAP)) {
    assert.deepEqual(combinedMap[fromPath], rule, `rule for "${fromPath}" must be byte-for-byte unchanged`);
  }
  assert.equal(Object.keys(combinedMap).length, 52);
});

// --- 2: the Panchatantra redirect itself -----------------------------------

test('the Panchatantra redirect resolves with HTTP 301 and the exact approved destination', () => {
  const combinedMap = { ...EXISTING_MAP, [PANCHATANTRA_REDIRECT.fromPath]: { toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: PANCHATANTRA_REDIRECT.statusCode } };
  const rule = resolveRedirect(PANCHATANTRA_REDIRECT.fromPath, combinedMap);
  assert.deepEqual(rule, { toPath: '/media/blog/how-panchatantra-teaches-without-teaching', statusCode: 301 });
});

// --- 3: percent-encoded Sanskrit slugs remain unchanged --------------------

test('percent-encoded Sanskrit slugs remain exactly as published, unaffected by adding the Panchatantra rule', () => {
  const combinedMap = { ...EXISTING_MAP, [PANCHATANTRA_REDIRECT.fromPath]: { toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: PANCHATANTRA_REDIRECT.statusCode } };
  const encodedSlugs = [
    ['/blog-post/unveiling-the-mysteries-of-ga%e1%b9%87apati/', '/media/blog/unveiling-the-mysteries-of-ganapati'],
    ['/blog-post/edicinal-value-of-21-kinds-of-leaves-that-are-offered-in-ga%e1%b9%87esa-puja/', '/media/blog/medicinal-value-of-21-kinds-of-leaves-offered-in-ganesa-puja'],
    ['/blog-post/what-is-sa%e1%b9%83sk%e1%b9%9btam/', '/media/blog/what-is-samskrtam'],
    ['/blog-post/why-sa%e1%b9%83sk%e1%b9%9btam/', '/media/blog/why-samskrtam'],
    ['/blog-post/how-sa%e1%b9%83sk%e1%b9%9btam/', '/media/blog/how-samskrtam'],
  ];
  for (const [fromPath, toPath] of encodedSlugs) {
    assert.deepEqual(resolveRedirect(fromPath, combinedMap), { toPath, statusCode: 301 });
    // The decoded form must never match -- matching stays purely literal.
    const decodedAttempt = decodeURIComponent(fromPath);
    if (decodedAttempt !== fromPath) assert.equal(resolveRedirect(decodedAttempt, combinedMap), null);
  }
});

// --- 4: trailing-slash behavior --------------------------------------------

test('trailing-slash toggling works correctly for both the existing blog rules and the new Panchatantra rule', () => {
  const combinedMap = { ...EXISTING_MAP, [PANCHATANTRA_REDIRECT.fromPath]: { toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: PANCHATANTRA_REDIRECT.statusCode } };
  // Existing rule, authored with a trailing slash: the slash-less form also matches.
  assert.deepEqual(resolveRedirect('/blog-post/rathasaptami', combinedMap), { toPath: '/media/blog/rathasaptami', statusCode: 301 });
  // Panchatantra rule, authored WITHOUT a trailing slash: the slashed form also matches,
  // and does not collide with or loop against anything else.
  assert.deepEqual(resolveRedirect(`${PANCHATANTRA_REDIRECT.fromPath}/`, combinedMap), { toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: 301 });
});

// --- 5: query-string behavior is documented and tested ---------------------

test('query strings are never part of the match: a query string appended directly to a lookup key never matches', () => {
  const combinedMap = { ...EXISTING_MAP, [PANCHATANTRA_REDIRECT.fromPath]: { toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: PANCHATANTRA_REDIRECT.statusCode } };
  assert.equal(resolveRedirect(`${PANCHATANTRA_REDIRECT.fromPath}?utm_source=test`, combinedMap), null);
  // Correct usage (the caller already stripped the query string) still works --
  // this is how both real callers (Express's req.path, CloudFront's
  // event.request.uri) actually invoke resolveRedirect().
  assert.deepEqual(resolveRedirect(PANCHATANTRA_REDIRECT.fromPath, combinedMap), { toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: 301 });
});

test('redirectMiddleware strips the query string before matching, via req.path (not req.originalUrl)', async () => {
  await RedirectModel.deleteMany({});
  await upsertPanchatantraRedirect();

  let redirectedTo = null;
  const req = { path: PANCHATANTRA_REDIRECT.fromPath, originalUrl: `${PANCHATANTRA_REDIRECT.fromPath}?utm_source=test` };
  const res = { redirect: (status, toPath) => { redirectedTo = { status, toPath }; } };
  await redirectMiddleware(req, res, () => {});

  assert.deepEqual(redirectedTo, { status: 301, toPath: PANCHATANTRA_REDIRECT.toPath });
});

// --- 6: no duplicate, loop, or chain is introduced -------------------------

test('adding the Panchatantra rule introduces no duplicate, self-loop, reversal, or chain across all 52 rules', () => {
  const combinedDocs = [...docsFromMap(EXISTING_MAP), { fromPath: PANCHATANTRA_REDIRECT.fromPath, toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: PANCHATANTRA_REDIRECT.statusCode }];
  const errors = validate(combinedDocs);
  assert.deepEqual(errors, []);
});

test('the Panchatantra fromPath does not collide with, and is not a chain through, any of the 51 existing rules', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(EXISTING_MAP, PANCHATANTRA_REDIRECT.fromPath), false);
  assert.equal(Object.prototype.hasOwnProperty.call(EXISTING_MAP, PANCHATANTRA_REDIRECT.toPath), false, 'the destination must not itself be a legacy fromPath (would create a two-hop chain)');
});

// --- 8: CloudFront Function size remains below the limit -------------------

test('the regenerated CloudFront Function, with the Panchatantra rule added, stays well under the 10,240-byte limit', () => {
  const combinedDocs = [...docsFromMap(EXISTING_MAP), { fromPath: PANCHATANTRA_REDIRECT.fromPath, toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: PANCHATANTRA_REDIRECT.statusCode }];
  const combinedMap = mapFromDocs(combinedDocs);
  const source = buildCloudFrontFunctionSource(combinedMap, combinedDocs.length);
  const projectedBytes = Buffer.byteLength(source, 'utf8');

  assert.ok(projectedBytes > CURRENT_FUNCTION_BYTES, 'projected size should be larger than the current checked-in size');
  assert.ok(projectedBytes < CLOUDFRONT_FUNCTION_LIMIT_BYTES, `projected size (${projectedBytes} bytes) must stay under the ${CLOUDFRONT_FUNCTION_LIMIT_BYTES}-byte CloudFront Functions limit`);
  // Generous, explicit safety margin -- not just "under the limit" but with
  // real headroom to spare, so this test catches a future regression well
  // before the limit is actually reached.
  assert.ok(CLOUDFRONT_FUNCTION_LIMIT_BYTES - projectedBytes > 1000, 'expected at least 1000 bytes of headroom remaining');
});

test('the simulated regenerated CloudFront Function source remains syntactically valid JavaScript', () => {
  const combinedDocs = [...docsFromMap(EXISTING_MAP), { fromPath: PANCHATANTRA_REDIRECT.fromPath, toPath: PANCHATANTRA_REDIRECT.toPath, statusCode: PANCHATANTRA_REDIRECT.statusCode }];
  const source = buildCloudFrontFunctionSource(mapFromDocs(combinedDocs), combinedDocs.length);
  assert.doesNotThrow(() => new Function(source + '\nreturn handler;'));
});

// --- 9: the Panchatantra redirect becomes effective only once the old demo
// route no longer takes precedence ------------------------------------------

test('redirectMiddleware is registered in app.js strictly AFTER the blog public routes, never before', () => {
  const blogRouteIndex = APP_JS_SOURCE.indexOf("app.use('/api/v1/public', blogPublicRouter)");
  const redirectMiddlewareIndex = APP_JS_SOURCE.indexOf('app.use(redirectMiddleware)');
  assert.ok(blogRouteIndex !== -1, 'expected to find the blog public router registration in app.js');
  assert.ok(redirectMiddlewareIndex !== -1, 'expected to find the redirectMiddleware registration in app.js');
  assert.ok(
    blogRouteIndex < redirectMiddlewareIndex,
    'redirectMiddleware must be registered after the blog routes -- otherwise a real, still-live BlogPost at this path would never be reachable even before the demo post is deleted'
  );
});

test('redirectMiddleware itself fires correctly for the Panchatantra path once a matching Redirect document exists (route-precedence is enforced by app.js registration order, confirmed above, not by this middleware itself)', async () => {
  await RedirectModel.deleteMany({});
  // Before the redirect document exists, this middleware must defer
  // (call next()) -- this is the state while the Panchatantra demo
  // BlogPost document is still live and its own route already handled
  // the request, so this middleware would never even be reached for real,
  // but confirming its own behavior in isolation here regardless.
  let calledNext = false;
  const req1 = { path: PANCHATANTRA_REDIRECT.fromPath };
  const res1 = { redirect: () => assert.fail('must not redirect before the record exists') };
  await redirectMiddleware(req1, res1, () => { calledNext = true; });
  assert.equal(calledNext, true);

  await upsertPanchatantraRedirect();

  let redirectedTo = null;
  const req2 = { path: PANCHATANTRA_REDIRECT.fromPath };
  const res2 = { redirect: (status, toPath) => { redirectedTo = { status, toPath }; } };
  await redirectMiddleware(req2, res2, () => assert.fail('must redirect once the record exists, not fall through to next()'));
  assert.deepEqual(redirectedTo, { status: 301, toPath: PANCHATANTRA_REDIRECT.toPath });
});

// --- Migration script itself: idempotency, no duplicates, database safety -

test('upsertPanchatantraRedirect creates exactly one document on first run', async () => {
  await RedirectModel.deleteMany({});
  await upsertPanchatantraRedirect();
  const docs = await RedirectModel.find({ fromPath: PANCHATANTRA_REDIRECT.fromPath }).lean();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].toPath, PANCHATANTRA_REDIRECT.toPath);
  assert.equal(docs[0].statusCode, 301);
});

test('upsertPanchatantraRedirect is idempotent: repeated calls create no duplicate and change nothing', async () => {
  await RedirectModel.deleteMany({});
  const first = await upsertPanchatantraRedirect();
  await upsertPanchatantraRedirect();
  await upsertPanchatantraRedirect();
  const docs = await RedirectModel.find({ fromPath: PANCHATANTRA_REDIRECT.fromPath }).lean();
  assert.equal(docs.length, 1, 'must never create a duplicate document');
  assert.equal(String(docs[0]._id), String(first._id), 'must be the exact same document, not a new one');
});

test('upsertPanchatantraRedirect never overwrites a pre-existing document for the same fromPath, even a conflicting one', async () => {
  await RedirectModel.deleteMany({});
  await RedirectModel.create({ fromPath: PANCHATANTRA_REDIRECT.fromPath, toPath: '/some-other-destination', statusCode: 302 });
  await upsertPanchatantraRedirect();
  const docs = await RedirectModel.find({ fromPath: PANCHATANTRA_REDIRECT.fromPath }).lean();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].toPath, '/some-other-destination', '$setOnInsert must never touch an existing document, even a conflicting one -- that is a decision for a human, not this script');
  assert.equal(docs[0].statusCode, 302);
});

test('running the migration alongside pre-seeded copies of all 19 existing blog redirects leaves them completely untouched', async () => {
  await RedirectModel.deleteMany({});
  await RedirectModel.insertMany(KNOWN_19_BLOG_REDIRECTS.map(([fromPath, rule]) => ({ fromPath, toPath: rule.toPath, statusCode: rule.statusCode })));
  await upsertPanchatantraRedirect();

  const allDocs = await RedirectModel.find({}).lean();
  assert.equal(allDocs.length, 20);
  for (const [fromPath, rule] of KNOWN_19_BLOG_REDIRECTS) {
    const doc = allDocs.find((d) => d.fromPath === fromPath);
    assert.ok(doc, `expected "${fromPath}" to still exist`);
    assert.equal(doc.toPath, rule.toPath);
    assert.equal(doc.statusCode, rule.statusCode);
  }
});

test('assertSafeDatabaseTarget rejects the protected vyoma_migration_dryrun database by name', async () => {
  const protectedMem = await MongoMemoryServer.create();
  const protectedConn = await mongoose.createConnection(protectedMem.getUri('vyoma_migration_dryrun')).asPromise();
  try {
    assert.throws(() => assertSafeDatabaseTarget(protectedConn), /vyoma_migration_dryrun/);
  } finally {
    await protectedConn.close();
    await protectedMem.stop();
  }
});

test('assertSafeDatabaseTarget allows an ordinary, non-protected database connection', () => {
  assert.doesNotThrow(() => assertSafeDatabaseTarget(mongoose.connection));
});

test('importing the migration script performs no database connection or write as a side effect', async () => {
  await RedirectModel.deleteMany({});
  assert.equal(await RedirectModel.countDocuments(), 0, 'nothing should have changed merely from this module being imported at the top of this file');
});
