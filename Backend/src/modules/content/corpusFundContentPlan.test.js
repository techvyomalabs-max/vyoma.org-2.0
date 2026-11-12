// Regression coverage for the pure corpus-fund content migration planner
// (Phase 1 Task 6E). Every test here uses in-memory fixture objects only --
// no MongoDB, no mongodb-memory-server, no filesystem, no network. All
// candidate content below is a deliberately fake placeholder, never the
// real content-owner-approved text (which does not exist in this codebase
// yet -- see migration-decision-register.md, decision D11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planCorpusFundContentMigration } from './corpusFundContentPlan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASELINE = { body: 'Long-term endowment giving that sustains Vyoma’s programs beyond a single project cycle.' };
const CANDIDATE = { body: 'PLACEHOLDER — not content-owner approved — corpus-fund test candidate merge text.' };

function destinationAtBaseline(overrides = {}) {
  return {
    body: BASELINE.body,
    // Unrelated fields that must never be read or altered by the planner.
    title: 'Corpus Fund',
    href: '/join-us/corpus-fund',
    active: true,
    ...overrides,
  };
}

// --- Happy path: baseline + approved candidate -> ready_to_update ---

test('a destination at the known baseline with an approved candidate is planned as ready_to_update', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'ready_to_update');
  assert.deepEqual(plan.proposed, CANDIDATE);
  assert.deepEqual(plan.current, { body: BASELINE.body });
});

test('planning never mutates the input objects', () => {
  const source = { ...CANDIDATE };
  const destination = destinationAtBaseline();
  const baseline = { ...BASELINE };
  const sourceCopy = JSON.parse(JSON.stringify(source));
  const destinationCopy = JSON.parse(JSON.stringify(destination));
  const baselineCopy = JSON.parse(JSON.stringify(baseline));

  planCorpusFundContentMigration({ source, destination, baseline, approved: true });

  assert.deepEqual(source, sourceCopy, 'source must not be mutated');
  assert.deepEqual(destination, destinationCopy, 'destination must not be mutated');
  assert.deepEqual(baseline, baselineCopy, 'baseline must not be mutated');
});

// --- Approval missing ---

test('a destination at baseline with no approved flag at all is awaiting_approval', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: BASELINE });
  assert.equal(plan.status, 'awaiting_approval');
  assert.equal(plan.proposed, undefined, 'an unapproved candidate must never be proposed');
});

test('a destination at baseline with approved explicitly false is awaiting_approval', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: BASELINE, approved: false });
  assert.equal(plan.status, 'awaiting_approval');
  assert.equal(plan.proposed, undefined);
});

test('a truthy but non-boolean approved value is never treated as approval', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: BASELINE, approved: 'true' });
  assert.equal(plan.status, 'awaiting_approval');
});

// --- Missing destination ---

test('destination: null is reported as missing_destination, not an error', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: null, baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'missing_destination');
  assert.equal(plan.proposed, undefined);
});

test('destination: undefined is also reported as missing_destination', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: undefined, baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'missing_destination');
});

// --- Invalid inputs ---

test('called with no arguments at all is invalid_input', () => {
  const plan = planCorpusFundContentMigration();
  assert.equal(plan.status, 'invalid_input');
});

test('an empty source object is invalid_input (nothing to propose or compare)', () => {
  const plan = planCorpusFundContentMigration({ source: {}, destination: destinationAtBaseline(), baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a non-object source (e.g. a string) is invalid_input', () => {
  const plan = planCorpusFundContentMigration({ source: 'not an object', destination: destinationAtBaseline(), baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a destination of the wrong type (e.g. an array) is invalid_input, distinct from a missing destination', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: ['not', 'an', 'object'], baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a destination of the wrong type (e.g. a string) is invalid_input', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: 'not an object', baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a missing baseline is invalid_input', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a null baseline is invalid_input', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: null, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a non-object baseline (e.g. a number) is invalid_input', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: 42, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

// --- Prototype-pollution-key protection ---

test('a source object carrying a __proto__ own key (e.g. from JSON.parse of untrusted input) is rejected as invalid_input', () => {
  const malicious = JSON.parse('{"body": "x", "__proto__": {"polluted": true}}');
  const plan = planCorpusFundContentMigration({ source: malicious, destination: destinationAtBaseline(), baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'invalid_input');
  assert.equal(({}).polluted, undefined, 'Object.prototype must never be polluted, regardless of what this call returns');
});

test('a source object carrying a constructor own key is rejected as invalid_input', () => {
  const malicious = JSON.parse('{"body": "x", "constructor": {"polluted": true}}');
  const plan = planCorpusFundContentMigration({ source: malicious, destination: destinationAtBaseline(), baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a baseline object carrying a prototype own key is rejected as invalid_input', () => {
  const maliciousBaseline = JSON.parse('{"body": "x", "prototype": {"polluted": true}}');
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: maliciousBaseline, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a destination object carrying a __proto__ own key is rejected as invalid_input', () => {
  const maliciousDestination = JSON.parse('{"body": "x", "__proto__": {"polluted": true}}');
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: maliciousDestination, baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a non-plain-object value with a different prototype (e.g. a Date instance) is rejected as invalid_input', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: new Date(), baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a valid planning call never pollutes Object.prototype as a side effect', () => {
  planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: BASELINE, approved: true });
  assert.deepEqual(Object.keys(Object.prototype).length, 0);
});

// --- Already migrated ---

test('a destination whose content already matches the candidate is already_migrated, not re-proposed', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline({ body: CANDIDATE.body }), baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'already_migrated');
  assert.equal(plan.proposed, undefined, 'an already-migrated destination must not be proposed for another write');
});

test('running the planner twice against an already-migrated state produces identical results (safe to re-run)', () => {
  const destination = destinationAtBaseline({ body: CANDIDATE.body });
  const first = planCorpusFundContentMigration({ source: CANDIDATE, destination, baseline: BASELINE, approved: true });
  const second = planCorpusFundContentMigration({ source: CANDIDATE, destination, baseline: BASELINE, approved: true });
  assert.deepEqual(first, second);
  assert.equal(first.status, 'already_migrated');
});

// --- Admin-edited destination / baseline mismatch ---

test('a destination edited to something other than the baseline or the candidate is admin_edited', () => {
  const plan = planCorpusFundContentMigration({
    source: CANDIDATE,
    destination: destinationAtBaseline({ body: 'An administrator rewrote this through the CMS.' }),
    baseline: BASELINE,
    approved: true,
  });
  assert.equal(plan.status, 'admin_edited');
  assert.equal(plan.proposed, undefined, 'an admin-edited destination must never get a proposed value');
});

test('baseline mismatch: a destination that drifted from the recorded baseline (without matching the candidate either) is never silently overwritten', () => {
  const driftedBaseline = { body: 'A value the real destination used to have, but no longer matches exactly.' };
  const plan = planCorpusFundContentMigration({
    source: CANDIDATE,
    destination: destinationAtBaseline(), // still holds the *original* baseline text
    baseline: driftedBaseline, // caller's recorded baseline no longer matches reality
    approved: true,
  });
  assert.equal(plan.status, 'admin_edited');
  assert.equal(plan.current.body, BASELINE.body);
});

// --- Preservation of unrelated fields ---

test('fields other than those in source are never read into the plan and never appear in a proposed payload', () => {
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: BASELINE, approved: true });
  assert.deepEqual(Object.keys(plan.current), ['body']);
  assert.deepEqual(Object.keys(plan.proposed), ['body']);
});

test('a destination with unusual values in unrelated fields is still planned correctly by content alone', () => {
  const destination = destinationAtBaseline({ title: 'Something Else Entirely', href: '/unrelated', active: false });
  const plan = planCorpusFundContentMigration({ source: CANDIDATE, destination, baseline: BASELINE, approved: true });
  assert.equal(plan.status, 'ready_to_update', 'unrelated field differences must not affect the content-based plan');
});

test('a multi-field source only compares/proposes exactly those fields, leaving the rest of destination untouched', () => {
  const multiFieldBaseline = { body: BASELINE.body, note: null };
  const multiFieldCandidate = { body: CANDIDATE.body, note: 'A short approved note.' };
  const destination = destinationAtBaseline({ note: null });
  const plan = planCorpusFundContentMigration({ source: multiFieldCandidate, destination, baseline: multiFieldBaseline, approved: true });
  assert.equal(plan.status, 'ready_to_update');
  assert.deepEqual(plan.proposed, multiFieldCandidate);
  assert.deepEqual(Object.keys(plan.proposed).sort(), ['body', 'note']);
});

// --- Idempotent planning across an apply-then-replan cycle ---

test('applying a ready_to_update proposal and replanning against the new state yields already_migrated', () => {
  const firstPlan = planCorpusFundContentMigration({ source: CANDIDATE, destination: destinationAtBaseline(), baseline: BASELINE, approved: true });
  assert.equal(firstPlan.status, 'ready_to_update');

  // Simulate a caller applying firstPlan.proposed to the real destination.
  const updatedDestination = destinationAtBaseline({ ...firstPlan.proposed });
  const secondPlan = planCorpusFundContentMigration({ source: CANDIDATE, destination: updatedDestination, baseline: BASELINE, approved: true });
  assert.equal(secondPlan.status, 'already_migrated');
});

// --- No database, filesystem or network dependency ---

test('the planner module has zero imports -- no database, filesystem or network dependency is even possible', () => {
  const source = fs.readFileSync(path.join(__dirname, 'corpusFundContentPlan.js'), 'utf8');
  assert.doesNotMatch(source, /^\s*import /m, 'this module must never import anything -- it is pure, dependency-free planning logic');
});

test('the module explicitly documents that approved: true is a caller-set flag, not independent content-owner authorization', () => {
  const source = fs.readFileSync(path.join(__dirname, 'corpusFundContentPlan.js'), 'utf8');
  const flattened = source.replace(/\/\//g, ' ').replace(/\s+/g, ' ');
  assert.match(flattened, /IMPORTANT LIMITATION/);
  assert.match(flattened, /no way to verify that real content-owner sign-off actually happened/);
  assert.match(flattened, /it is NOT independent proof of authorization/);
});
