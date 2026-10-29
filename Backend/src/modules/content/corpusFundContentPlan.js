// Phase 1 Task 6E: pure planning/validation logic for a single, one-off
// content migration -- evaluating whether WordPress `samrakshananidhi`
// content should be merged into the existing `/join-us/corpus-fund`
// destination (see Backend/scripts/wordpress/reports/migration-decision-
// register.md, decision D11).
//
// This module performs NO I/O of any kind: no MongoDB connection, no
// filesystem reads/writes, no network access, no console output. It only
// ever computes what a future, separately authorized migration step WOULD
// do, given explicit source content, destination content, baseline
// information and an approval flag -- all supplied by the caller. There is
// deliberately no executable write path here (Task 6E scope is planning
// only), and no real WordPress/CMS content is embedded in this file --
// every value this module reasons about is passed in by the caller
// (production: a future migration step reading the real WordPress export
// and the real corpus-fund content; tests: fixture objects only).
//
// Unlike donationSchemeContentPlan.js (Task 5A), this is a single
// source -> single destination migration, not a fixed list of known slugs
// with a frozen baseline constant -- so `source`, `baseline` and `approved`
// are all explicit call-time inputs here, not constants owned by this
// module.

// Only a bare `{}` literal or a JSON-parsed object (prototype ===
// Object.prototype) or an explicitly null-prototype object is accepted --
// a Date, Map, class instance, or anything else with a different
// prototype is rejected, since this module only ever deals in plain data.
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Defends against prototype-pollution-shaped payloads -- e.g. content that
// arrived via JSON.parse from an untrusted source upstream of this pure
// function, where `{"__proto__": {...}}` creates a real own property
// (unlike the `{ __proto__: ... }` object-literal shorthand, which sets
// the prototype instead). Refusing to process an object carrying one of
// these keys at all is simpler and safer than trying to read/copy/compare
// around it.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function hasDangerousKey(value) {
  return Object.keys(value).some((key) => DANGEROUS_KEYS.has(key));
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

// Restricts `obj` to exactly `keys`, reading missing keys as `undefined`
// rather than throwing -- lets `destination`/`baseline` be partial or even
// `{}` without this module ever touching a field it wasn't asked about.
// Reads only OWN properties (never inherited ones, e.g. a bare `.toString`)
// and only ever assigns into `picked` under a key drawn from `source`'s own
// (already dangerous-key-checked) field list, so `picked[key] = ...` can
// never resolve to `picked.__proto__ = ...`.
function pickKeys(obj, keys) {
  const picked = {};
  for (const key of keys) {
    picked[key] = Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
  }
  return picked;
}

function invalidInput(reason) {
  return { status: 'invalid_input', reason };
}

// Builds a dry-run migration plan for the corpus-fund destination. Pure
// function: never mutates any input, never performs any I/O, never writes
// anywhere.
//
// Inputs (all required, all explicit -- never read from disk/DB/network by
// this module):
//   `source`: a non-empty plain object of the proposed candidate fields,
//     e.g. `{ body: '...' }` -- only the fields present here are ever
//     compared or proposed. Any other field the real destination holds
//     (title, href, active, ...) is guaranteed untouched by this plan: it
//     is never read, never compared, and never appears in `proposed`.
//   `destination`: the destination's current content, restricted to
//     whatever fields the caller chooses to pass -- or `null`/`undefined`
//     if no destination content exists yet at all.
//   `baseline`: a plain object describing the known pre-migration value of
//     the destination's fields, supplied by the caller (there is no frozen
//     constant here, since this is a one-off migration, not a fixed set of
//     known slugs like donationSchemeContentPlan.js's `KNOWN_BASELINE`).
//   `approved`: must be strictly boolean `true` for a migration to be
//     proposed. See the IMPORTANT LIMITATION note below.
//
// IMPORTANT LIMITATION: `approved: true` is nothing more than a flag the
// CALLER passes in -- this module has no way to verify that real
// content-owner sign-off actually happened behind that flag. It is a
// structural gate against *accidentally* treating unreviewed/placeholder
// text as ready to migrate -- it is NOT independent proof of
// authorization, and must never be treated as equivalent to actual
// content-owner approval. Whoever builds a future migration step around
// this planner is responsible for only ever passing `approved: true` once
// a content owner has genuinely signed off on the proposed corpus-fund
// text (see migration-decision-register.md, decision D11, for what that
// approval would need to cover) -- this module cannot enforce that part.
export function planCorpusFundContentMigration({ source, destination, baseline, approved } = {}) {
  if (!isPlainObject(source) || Object.keys(source).length === 0 || hasDangerousKey(source)) {
    return invalidInput(
      '`source` must be a non-empty plain object describing the proposed candidate fields, with no unsafe keys such as __proto__, constructor or prototype.'
    );
  }
  if (destination !== null && destination !== undefined && (!isPlainObject(destination) || hasDangerousKey(destination))) {
    return invalidInput(
      '`destination` must be a plain object (or null/undefined if no destination content exists yet), with no unsafe keys such as __proto__, constructor or prototype.'
    );
  }
  if (!isPlainObject(baseline) || hasDangerousKey(baseline)) {
    return invalidInput(
      '`baseline` must be a plain object describing the known pre-migration value of the destination fields, with no unsafe keys such as __proto__, constructor or prototype.'
    );
  }

  if (destination === null || destination === undefined) {
    return {
      status: 'missing_destination',
      reason:
        "No destination content exists yet for corpus-fund -- migrating here would be a new-content creation, not an update to an existing field, and is out of this plan's scope.",
    };
  }

  // Only ever compare/propose the exact fields the caller is proposing to
  // change -- never the destination's full field set.
  const fields = Object.keys(source);
  const currentValue = pickKeys(destination, fields);
  const baselineValue = pickKeys(baseline, fields);

  const matchesBaseline = deepEqual(currentValue, baselineValue);
  const matchesCandidate = deepEqual(currentValue, source);

  if (!matchesBaseline && !matchesCandidate) {
    return {
      status: 'admin_edited',
      reason:
        'Current destination content matches neither the known pre-migration baseline nor the proposed candidate content -- refusing to overwrite a value that may have changed since the baseline was captured.',
      current: currentValue,
    };
  }

  if (matchesCandidate) {
    return {
      status: 'already_migrated',
      reason: 'Current destination content already matches the proposed candidate content -- no change needed (safe no-op).',
      current: currentValue,
    };
  }

  // matchesBaseline is true from here on.
  if (approved !== true) {
    return {
      status: 'awaiting_approval',
      reason: 'Current destination content matches the known pre-migration baseline, but approved !== true -- content-owner approval is still outstanding.',
      current: currentValue,
    };
  }

  return {
    status: 'ready_to_update',
    reason: 'Current destination content matches the known pre-migration baseline exactly, and approved candidate content is available.',
    current: currentValue,
    proposed: { ...source },
  };
}
