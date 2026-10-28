// Regression coverage for the pure donation-scheme content migration
// planner (Phase 1 Task 5A). Every test here uses in-memory fixture arrays
// only -- no MongoDB, no mongodb-memory-server, no filesystem, no network.
// All candidate content below is a deliberately fake placeholder, never the
// real content-owner-approved text (which does not exist in this codebase
// yet -- see migration-decision-register.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planDonationSchemeContentMigration, formatDryRunReport, KNOWN_BASELINE, TARGET_SLUGS } from './donationSchemeContentPlan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASELINE = KNOWN_BASELINE;

function schemeAtBaseline(slug, overrides = {}) {
  return {
    slug,
    description: BASELINE[slug].description,
    note: BASELINE[slug].note,
    // Unrelated fields that must never be read or altered by the planner.
    amountOptions: [1000, 2500, 5000],
    status: 'active',
    displayOrder: 3,
    paymentMode: 'razorpay',
    image: { url: 'https://example.test/photo.jpg' },
    ...overrides,
  };
}

function allSchemesAtBaseline() {
  return [
    { slug: 'guru-dakshina', description: 'unrelated scheme, unaffected', note: null },
    schemeAtBaseline('vidya-danam'),
    schemeAtBaseline('grantha-danam'),
    schemeAtBaseline('sabha-ujjivanam'),
    { slug: 'anna-danam', description: 'another unrelated scheme', note: null },
  ];
}

const PLACEHOLDER_CANDIDATES = {
  'vidya-danam': { description: 'PLACEHOLDER — not content-owner approved — vidya-danam test candidate', note: null, approved: true },
  'grantha-danam': { description: 'PLACEHOLDER — not content-owner approved — grantha-danam test candidate', note: null, approved: true },
  'sabha-ujjivanam': { description: 'PLACEHOLDER — not content-owner approved — sabha-ujjivanam test candidate', note: null, approved: true },
};

test('TARGET_SLUGS is exactly the 3 flagged merge-pair schemes', () => {
  assert.deepEqual(TARGET_SLUGS, ['vidya-danam', 'grantha-danam', 'sabha-ujjivanam']);
});

// --- Happy path: baseline + approved candidate -> ready_to_update ---

test('a scheme at the known baseline with an approved candidate is planned as ready_to_update', () => {
  const plan = planDonationSchemeContentMigration(allSchemesAtBaseline(), PLACEHOLDER_CANDIDATES);
  const entry = plan.entries.find((e) => e.slug === 'vidya-danam');
  assert.equal(entry.status, 'ready_to_update');
  assert.equal(entry.proposed.description, PLACEHOLDER_CANDIDATES['vidya-danam'].description);
  assert.equal(entry.current.description, BASELINE['vidya-danam'].description);
});

test('planning never mutates the input arrays/objects', () => {
  const schemes = allSchemesAtBaseline();
  const schemesCopy = JSON.parse(JSON.stringify(schemes));
  const candidates = PLACEHOLDER_CANDIDATES;
  const candidatesCopy = JSON.parse(JSON.stringify(candidates));

  planDonationSchemeContentMigration(schemes, candidates);

  assert.deepEqual(schemes, schemesCopy, 'currentSchemes must not be mutated');
  assert.deepEqual(candidates, candidatesCopy, 'candidates must not be mutated');
});

// --- Baseline mismatch: an administrator edit must be rejected ---

test('a scheme whose current content matches neither the baseline nor the candidate is rejected as admin_edited', () => {
  const schemes = allSchemesAtBaseline().map((s) =>
    s.slug === 'grantha-danam' ? { ...s, description: 'An administrator rewrote this through the CMS.' } : s
  );
  const plan = planDonationSchemeContentMigration(schemes, PLACEHOLDER_CANDIDATES);
  const entry = plan.entries.find((e) => e.slug === 'grantha-danam');
  assert.equal(entry.status, 'admin_edited');
  assert.equal(entry.proposed, undefined, 'an admin-edited scheme must never get a proposed value');
});

test('a scheme whose note (not description) was edited by an administrator is also rejected as admin_edited', () => {
  const schemes = allSchemesAtBaseline().map((s) =>
    s.slug === 'sabha-ujjivanam' ? { ...s, note: 'An administrator added this note through the CMS.' } : s
  );
  const plan = planDonationSchemeContentMigration(schemes, PLACEHOLDER_CANDIDATES);
  const entry = plan.entries.find((e) => e.slug === 'sabha-ujjivanam');
  assert.equal(entry.status, 'admin_edited');
});

// --- Missing scheme ---

test('a target slug with no matching document is reported as missing_scheme', () => {
  const schemes = allSchemesAtBaseline().filter((s) => s.slug !== 'grantha-danam');
  const plan = planDonationSchemeContentMigration(schemes, PLACEHOLDER_CANDIDATES);
  const entry = plan.entries.find((e) => e.slug === 'grantha-danam');
  assert.equal(entry.status, 'missing_scheme');
  assert.equal(entry.proposed, undefined);
});

// --- Duplicate slug ---

test('two documents sharing the same target slug are reported as duplicate_slug, not guessed at', () => {
  const schemes = [...allSchemesAtBaseline(), schemeAtBaseline('vidya-danam', { description: 'a second, conflicting vidya-danam document' })];
  const plan = planDonationSchemeContentMigration(schemes, PLACEHOLDER_CANDIDATES);
  const entry = plan.entries.find((e) => e.slug === 'vidya-danam');
  assert.equal(entry.status, 'duplicate_slug');
  assert.equal(entry.proposed, undefined);
});

// --- Idempotency: already-migrated content is a safe no-op ---

test('a scheme whose current content already matches the approved candidate is reported as already_migrated, not re-proposed', () => {
  const schemes = allSchemesAtBaseline().map((s) =>
    s.slug === 'vidya-danam' ? { ...s, description: PLACEHOLDER_CANDIDATES['vidya-danam'].description, note: PLACEHOLDER_CANDIDATES['vidya-danam'].note } : s
  );
  const plan = planDonationSchemeContentMigration(schemes, PLACEHOLDER_CANDIDATES);
  const entry = plan.entries.find((e) => e.slug === 'vidya-danam');
  assert.equal(entry.status, 'already_migrated');
  assert.equal(entry.proposed, undefined, 'an already-migrated scheme must not be proposed for another write');
});

test('running the planner twice against an already-migrated state produces identical results (safe to re-run)', () => {
  const schemes = allSchemesAtBaseline().map((s) =>
    TARGET_SLUGS.includes(s.slug) ? { ...s, description: PLACEHOLDER_CANDIDATES[s.slug].description, note: PLACEHOLDER_CANDIDATES[s.slug].note } : s
  );
  const first = planDonationSchemeContentMigration(schemes, PLACEHOLDER_CANDIDATES);
  const second = planDonationSchemeContentMigration(schemes, PLACEHOLDER_CANDIDATES);
  assert.deepEqual(first, second);
  assert.ok(first.entries.every((e) => e.status === 'already_migrated'));
});

// --- Rejection of unapproved content ---

test('candidate content without approved: true is never proposed, even if the text itself looks real', () => {
  const unapproved = {
    'vidya-danam': { description: 'Looks like real approved copy but was never signed off.', note: null },
  };
  const plan = planDonationSchemeContentMigration(allSchemesAtBaseline(), unapproved);
  const entry = plan.entries.find((e) => e.slug === 'vidya-danam');
  assert.equal(entry.status, 'awaiting_approval');
  assert.equal(entry.proposed, undefined);
});

test('candidate content explicitly marked approved: false is never proposed', () => {
  const explicitlyUnapproved = {
    'vidya-danam': { description: 'Draft text, explicitly not approved yet.', note: null, approved: false },
  };
  const plan = planDonationSchemeContentMigration(allSchemesAtBaseline(), explicitlyUnapproved);
  const entry = plan.entries.find((e) => e.slug === 'vidya-danam');
  assert.equal(entry.status, 'awaiting_approval');
});

test('the module explicitly documents that approved: true is a caller-set flag, not independent content-owner authorization', () => {
  const source = fs.readFileSync(path.join(__dirname, 'donationSchemeContentPlan.js'), 'utf8');
  // Normalize away comment markers/line-wrapping so this assertion isn't
  // fragile to reformatting -- it only cares that the substance is present.
  const flattened = source.replace(/\/\//g, ' ').replace(/\s+/g, ' ');
  assert.match(flattened, /IMPORTANT LIMITATION/);
  assert.match(flattened, /no way to verify that real content-owner sign-off actually happened/);
  assert.match(flattened, /it is NOT independent proof of authorization/);
});

test('a target slug with no candidate entry at all is awaiting_approval', () => {
  const plan = planDonationSchemeContentMigration(allSchemesAtBaseline(), {});
  for (const slug of TARGET_SLUGS) {
    const entry = plan.entries.find((e) => e.slug === slug);
    assert.equal(entry.status, 'awaiting_approval');
  }
});

// --- Unrelated-field preservation ---

test('fields other than description/note are never read into the plan and never appear in a proposed payload', () => {
  const plan = planDonationSchemeContentMigration(allSchemesAtBaseline(), PLACEHOLDER_CANDIDATES);
  for (const entry of plan.entries) {
    if (entry.current) assert.deepEqual(Object.keys(entry.current).sort(), ['description', 'note']);
    if (entry.proposed) assert.deepEqual(Object.keys(entry.proposed).sort(), ['description', 'note']);
  }
});

test('a scheme with unusual values in unrelated fields (different amountOptions, status, displayOrder) is still planned correctly by content alone', () => {
  const schemes = allSchemesAtBaseline().map((s) =>
    s.slug === 'vidya-danam' ? { ...s, amountOptions: [1, 2, 3], status: 'inactive', displayOrder: 999, paymentMode: 'something-else' } : s
  );
  const plan = planDonationSchemeContentMigration(schemes, PLACEHOLDER_CANDIDATES);
  const entry = plan.entries.find((e) => e.slug === 'vidya-danam');
  assert.equal(entry.status, 'ready_to_update', 'unrelated field differences must not affect the content-based plan');
});

// --- Non-target schemes are never touched ---

test('schemes outside the 3 target slugs never appear in the plan at all', () => {
  const plan = planDonationSchemeContentMigration(allSchemesAtBaseline(), PLACEHOLDER_CANDIDATES);
  const slugs = plan.entries.map((e) => e.slug);
  assert.deepEqual(slugs.sort(), [...TARGET_SLUGS].sort());
  assert.ok(!slugs.includes('guru-dakshina'));
  assert.ok(!slugs.includes('anna-danam'));
});

// --- Summary + report formatting ---

test('the plan summary counts each status correctly', () => {
  const schemes = allSchemesAtBaseline().filter((s) => s.slug !== 'sabha-ujjivanam'); // missing_scheme
  const candidates = {
    'vidya-danam': PLACEHOLDER_CANDIDATES['vidya-danam'], // ready_to_update
    // grantha-danam: no candidate -> awaiting_approval
  };
  const plan = planDonationSchemeContentMigration(schemes, candidates);
  assert.deepEqual(plan.summary, { ready_to_update: 1, awaiting_approval: 1, missing_scheme: 1 });
});

test('formatDryRunReport produces a readable string and performs no I/O (pure string return)', () => {
  const plan = planDonationSchemeContentMigration(allSchemesAtBaseline(), PLACEHOLDER_CANDIDATES);
  const report = formatDryRunReport(plan);
  assert.equal(typeof report, 'string');
  assert.match(report, /DRY RUN \(no writes performed\)/);
  assert.match(report, /vidya-danam: ready_to_update/);
  assert.match(report, /Summary: /);
});
