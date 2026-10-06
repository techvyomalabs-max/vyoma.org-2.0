// Pre-AWS redirect deployment prep — generation step only.
//
// READ-ONLY against MongoDB: connects using this project's existing
// connectDb() convention, reads every Redirect document, validates the
// full set, and writes a CloudFront-Function-compatible JS artifact to
// infra/cloudfront/. Never creates, updates, or deletes a Redirect (or any
// other) MongoDB document. Does not touch AWS/CloudFront/S3 in any way —
// this only produces a local file; deploying it is a separate, later step
// that requires real AWS access (see infra/cloudfront/README.md).
//
// MongoDB remains the authoring source of truth (via the existing admin
// Redirect CRUD screen, unchanged) — this script is a one-way export run
// whenever that collection changes and a fresh deploy is needed.
//
// Usage: node scripts/deploy/generate-redirect-manifest.mjs
// (no --commit/--dry-run distinction — this script never writes to Mongo
// at all, in either mode; it only ever reads Mongo and writes a local file)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../src/config/db.js';
import { RedirectModel } from '../../src/modules/redirects/redirect.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../infra/cloudfront');
const OUT_FUNCTION_PATH = path.join(OUT_DIR, 'redirect-function.generated.js');
const OUT_MAP_JSON_PATH = path.join(OUT_DIR, 'redirect-map.generated.json');

const VALID_STATUS_CODES = new Set([301, 302]);

// --- Validation -------------------------------------------------------------
// Mirrors the same safety checks already used for every prior redirect
// batch in this project (Batch 2, the remaining-redirects batch) — fails
// loudly and clearly rather than silently dropping or "fixing" bad data.
function validate(redirects) {
  const errors = [];

  const byFromPath = new Map();
  for (const r of redirects) {
    if (!r.fromPath || typeof r.fromPath !== 'string' || !r.fromPath.trim()) {
      errors.push(`Empty/invalid fromPath on document _id=${r._id}.`);
      continue;
    }
    if (!r.toPath || typeof r.toPath !== 'string' || !r.toPath.trim()) {
      errors.push(`Empty/invalid toPath on fromPath "${r.fromPath}".`);
    }
    if (!VALID_STATUS_CODES.has(r.statusCode)) {
      errors.push(`Invalid statusCode "${r.statusCode}" on fromPath "${r.fromPath}" (must be 301 or 302).`);
    }
    if (byFromPath.has(r.fromPath)) {
      errors.push(`Duplicate fromPath: "${r.fromPath}".`);
    } else {
      byFromPath.set(r.fromPath, r);
    }
  }

  for (const r of redirects) {
    if (!r.fromPath || !r.toPath) continue;
    if (r.fromPath === r.toPath) {
      errors.push(`Self-loop: "${r.fromPath}" redirects to itself.`);
    }
    const reverse = byFromPath.get(r.toPath);
    if (reverse && reverse.toPath === r.fromPath) {
      errors.push(`Direct two-rule reversal: "${r.fromPath}" <-> "${r.toPath}".`);
    }
    // Chain: this rule's destination is ALSO someone else's legacy source —
    // not necessarily wrong (a destination path can coincidentally also be
    // a fromPath for an unrelated rule), but flagged for visibility since a
    // genuine chain here would mean two hops are needed to reach the final
    // page, which this single-lookup CloudFront Function cannot resolve.
    if (byFromPath.has(r.toPath) && byFromPath.get(r.toPath) !== r) {
      errors.push(`Possible redirect chain: "${r.fromPath}" -> "${r.toPath}", and "${r.toPath}" is itself a fromPath -> "${byFromPath.get(r.toPath).toPath}".`);
    }
  }

  return errors;
}

async function main() {
  console.log('='.repeat(72));
  console.log('Redirect manifest generator — READ-ONLY against MongoDB, writes local files only');
  console.log('='.repeat(72));

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const redirects = await RedirectModel.find({}).lean();
    console.log(`[OK] Read ${redirects.length} Redirect document(s).`);

    const errors = validate(redirects);
    if (errors.length) {
      console.error('\nVALIDATION FAILED — generation aborted, no file was written:');
      for (const e of errors) console.error(' -', e);
      process.exitCode = 1;
      return;
    }
    console.log('[OK] All redirects pass validation (no duplicates/empty fields/invalid status/self-loops/reversals/chains).');

    // Deterministic sort — same output every run given the same data, so a
    // regenerated artifact only diffs when the underlying rules actually
    // changed, not due to arbitrary Mongo ordering.
    const sorted = [...redirects].sort((a, b) => (a.fromPath < b.fromPath ? -1 : a.fromPath > b.fromPath ? 1 : 0));

    const map = {};
    for (const r of sorted) {
      map[r.fromPath] = { toPath: r.toPath, statusCode: r.statusCode };
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Plain JSON copy of the map — not consumed by CloudFront itself, but
    // useful for the local validation script and for diffing what changed
    // between generations without reading the embedded-map JS.
    fs.writeFileSync(OUT_MAP_JSON_PATH, JSON.stringify(map, null, 2) + '\n');
    console.log(`[OK] Wrote ${OUT_MAP_JSON_PATH}`);

    const functionSource = buildCloudFrontFunctionSource(map, sorted.length);
    fs.writeFileSync(OUT_FUNCTION_PATH, functionSource);
    console.log(`[OK] Wrote ${OUT_FUNCTION_PATH}`);
    console.log(`     Generated function size: ${Buffer.byteLength(functionSource, 'utf8')} bytes.`);

    console.log('\nThis script made no MongoDB writes and took no AWS action. The generated');
    console.log('file(s) above are local artifacts only — deploying them to a real CloudFront');
    console.log('distribution is a separate, later step requiring AWS access.');
  } finally {
    await disconnectDb();
  }
}

// Conservative, CloudFront-Functions-compatible JS: no template literals,
// no AWS SDK calls (none are permitted in the CloudFront Functions runtime
// anyway), no network/file access — a single embedded object literal plus
// a plain `handler(event)` function, which is exactly the shape CloudFront
// Functions requires.
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
    '//   - Exact pathname match only, case-sensitive, no trailing-slash\n' +
    '//     normalization — identical semantics to the existing Express\n' +
    '//     redirectMiddleware (Backend/src/middleware/redirectMiddleware.js).\n' +
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
    'function handler(event) {\n' +
    '  var request = event.request;\n' +
    '  var uri = request.uri;\n' +
    '  var rule = REDIRECT_MAP[uri];\n' +
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

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
