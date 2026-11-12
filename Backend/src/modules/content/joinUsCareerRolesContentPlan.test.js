// Regression coverage for the pure join-us CAREER_ROLES content migration
// planner (Phase 1 Task 6I-C). Every test here uses in-memory fixture
// objects only -- no MongoDB, no mongodb-memory-server, no filesystem (other
// than reading this module's own source text to confirm it is
// dependency-free), no network. All proposed role text below is a
// deliberately fake placeholder, never the real content-owner-approved text
// (which does not exist in this codebase yet -- see
// migration-decision-register.md, decisions D4/D28).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planJoinUsCareerRolesContentMigration } from './joinUsCareerRolesContentPlan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASELINE_ROLE = { title: 'Senior Linguist', dept: 'Academics', type: 'Full-time', loc: 'Bengaluru', desc: null, applyUrl: null, active: true };
const PROPOSED_ROLE = {
  title: 'Senior Linguist',
  dept: 'Academics',
  type: 'Full-time',
  loc: 'Bengaluru',
  desc: 'PLACEHOLDER — not content-owner approved — test candidate description for Senior Linguist.',
  applyUrl: 'https://example.com/apply/senior-linguist',
  active: true,
};
const OTHER_ROLE = { title: 'GM Operations', dept: 'Operations', type: 'Full-time', loc: 'Bengaluru', desc: null, applyUrl: null, active: true };
const ANOTHER_ROLE = { title: 'Director Strategy', dept: 'Operations', type: 'Full-time', loc: 'Bengaluru', desc: null, applyUrl: null, active: true };

function baselineRoles() {
  return [BASELINE_ROLE, OTHER_ROLE, ANOTHER_ROLE];
}

function currentAtBaseline() {
  return [{ ...BASELINE_ROLE }, { ...OTHER_ROLE }, { ...ANOTHER_ROLE }];
}

// --- 1. Valid proposed update -> ready_to_update ---

test('a role at the known baseline with an approved proposal is planned as ready_to_update', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'ready_to_update');
  assert.equal(plan.summary.ready_to_update, 1);
  const entry = plan.entries.find((e) => e.title === 'Senior Linguist');
  assert.equal(entry.status, 'ready_to_update');
  assert.deepEqual(entry.proposed, PROPOSED_ROLE);
});

test('unrelated roles not named in proposed are carried through untouched in proposedCareerRoles', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  const other = plan.proposedCareerRoles.find((r) => r.title === 'GM Operations');
  const another = plan.proposedCareerRoles.find((r) => r.title === 'Director Strategy');
  assert.deepEqual(other, OTHER_ROLE);
  assert.deepEqual(another, ANOTHER_ROLE);
  const updated = plan.proposedCareerRoles.find((r) => r.title === 'Senior Linguist');
  assert.deepEqual(updated, PROPOSED_ROLE);
  assert.equal(plan.proposedCareerRoles.length, 3);
});

test('a brand-new role (absent from both current and baseline) is planned as to_add and appended', () => {
  const newRole = { title: 'Community Manager', dept: 'Outreach', type: 'Full-time', loc: 'Bengaluru', desc: 'PLACEHOLDER — test fixture.', applyUrl: null, active: true };
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [newRole], approved: true });
  assert.equal(plan.status, 'ready_to_update');
  const entry = plan.entries.find((e) => e.title === 'Community Manager');
  assert.equal(entry.status, 'to_add');
  assert.equal(plan.proposedCareerRoles.length, 4);
  assert.deepEqual(plan.proposedCareerRoles[3], newRole);
  // Existing roles are still present and untouched.
  assert.deepEqual(plan.proposedCareerRoles.find((r) => r.title === 'Senior Linguist'), BASELINE_ROLE);
});

// --- 2. Missing approval -> awaiting_approval ---

test('a role ready to migrate with no approved flag at all is awaiting_approval', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [PROPOSED_ROLE] });
  assert.equal(plan.status, 'awaiting_approval');
});

test('approved explicitly false is awaiting_approval', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: false });
  assert.equal(plan.status, 'awaiting_approval');
});

test('a truthy but non-boolean approved value is never treated as approval', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: 'true' });
  assert.equal(plan.status, 'awaiting_approval');
});

test('awaiting_approval never includes a proposedCareerRoles payload', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: false });
  assert.equal(plan.proposedCareerRoles, undefined);
});

// --- 3. Existing admin edits / roles removed since baseline -> blocked ---

test('a role edited to something other than the baseline or the proposed content is blocked with an admin_edited entry', () => {
  const adminEdited = { ...BASELINE_ROLE, desc: 'An admin wrote this directly through the CMS.' };
  const current = [adminEdited, { ...OTHER_ROLE }, { ...ANOTHER_ROLE }];
  const plan = planJoinUsCareerRolesContentMigration({ current, baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'blocked');
  const entry = plan.entries.find((e) => e.title === 'Senior Linguist');
  assert.equal(entry.status, 'admin_edited');
  assert.deepEqual(entry.current, adminEdited);
});

test('blocked status never includes a proposedCareerRoles payload, even when other named roles in the same call are fine', () => {
  const adminEdited = { ...BASELINE_ROLE, desc: 'An admin wrote this directly through the CMS.' };
  const proposedOther = { ...OTHER_ROLE, desc: 'PLACEHOLDER — test fixture update for GM Operations.' };
  const current = [adminEdited, { ...OTHER_ROLE }, { ...ANOTHER_ROLE }];
  const plan = planJoinUsCareerRolesContentMigration({ current, baseline: baselineRoles(), proposed: [PROPOSED_ROLE, proposedOther], approved: true });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.proposedCareerRoles, undefined);
  assert.equal(plan.entries.find((e) => e.title === 'GM Operations').status, 'ready_to_update');
});

test('a role the baseline shows as existing, but missing from current, is blocked as removed_since_baseline rather than silently re-added', () => {
  const current = [{ ...OTHER_ROLE }, { ...ANOTHER_ROLE }]; // Senior Linguist deliberately absent
  const plan = planJoinUsCareerRolesContentMigration({ current, baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'blocked');
  const entry = plan.entries.find((e) => e.title === 'Senior Linguist');
  assert.equal(entry.status, 'removed_since_baseline');
  assert.deepEqual(entry.baseline, BASELINE_ROLE);
});

// --- 4. Already-migrated content -> already_migrated ---

test('a role whose current content already matches the proposed content is already_migrated, not re-proposed', () => {
  const current = [{ ...PROPOSED_ROLE }, { ...OTHER_ROLE }, { ...ANOTHER_ROLE }];
  const plan = planJoinUsCareerRolesContentMigration({ current, baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'already_migrated');
  assert.equal(plan.entries.find((e) => e.title === 'Senior Linguist').status, 'already_migrated');
});

test('running the planner twice against an already-migrated state produces identical results (safe to re-run)', () => {
  const current = [{ ...PROPOSED_ROLE }, { ...OTHER_ROLE }, { ...ANOTHER_ROLE }];
  const first = planJoinUsCareerRolesContentMigration({ current, baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  const second = planJoinUsCareerRolesContentMigration({ current, baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.deepEqual(first, second);
});

// --- 5. Invalid inputs -> invalid_input ---

test('called with no arguments at all is invalid_input', () => {
  const plan = planJoinUsCareerRolesContentMigration();
  assert.equal(plan.status, 'invalid_input');
});

test('an empty proposed array is invalid_input', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('proposed: undefined is invalid_input', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a non-array proposed (e.g. a plain object) is invalid_input', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: PROPOSED_ROLE, approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a non-array current (e.g. a string) is invalid_input, distinct from missing current content', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: 'not-an-array', baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('current: null is reported as missing_current_content, not an error', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: null, baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'missing_current_content');
});

test('current: undefined is also reported as missing_current_content', () => {
  const plan = planJoinUsCareerRolesContentMigration({ baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'missing_current_content');
});

test('a non-array baseline (e.g. a number) is invalid_input', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: 42, proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a role missing a title is invalid_input', () => {
  const malformed = { dept: 'Academics', desc: null };
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [malformed], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a role with an empty-string title is invalid_input', () => {
  const malformed = { ...PROPOSED_ROLE, title: '   ' };
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [malformed], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a non-plain-object role entry (e.g. a Date instance) is invalid_input', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [new Date()], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

// --- 6. Dangerous object keys -> invalid_input, never processed ---

test('a proposed role carrying a __proto__ own key (e.g. from JSON.parse of untrusted input) is rejected as invalid_input', () => {
  const malicious = JSON.parse('{"title": "Senior Linguist", "__proto__": {"polluted": true}}');
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [malicious], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a current role carrying a constructor own key is rejected as invalid_input', () => {
  const malicious = JSON.parse('{"title": "Senior Linguist", "constructor": {"polluted": true}}');
  const plan = planJoinUsCareerRolesContentMigration({ current: [malicious, { ...OTHER_ROLE }], baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a baseline role carrying a prototype own key is rejected as invalid_input', () => {
  const malicious = JSON.parse('{"title": "Senior Linguist", "prototype": {"polluted": true}}');
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: [malicious, { ...OTHER_ROLE }], proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a valid planning call never pollutes Object.prototype as a side effect', () => {
  planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

// --- 7. Duplicate and conflicting role entries -> never silently merged ---

test('two conflicting proposed variants for the same title (the Senior Linguist / E-Learning Administrator scenario) are rejected as invalid_input, never silently merged', () => {
  const variantA = { ...PROPOSED_ROLE, desc: 'PLACEHOLDER — variant A description.' };
  const variantB = { ...PROPOSED_ROLE, desc: 'PLACEHOLDER — variant B description, conflicting with A.' };
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [variantA, variantB], approved: true });
  assert.equal(plan.status, 'invalid_input');
  assert.match(plan.reason, /Senior Linguist/);
});

test('two identical proposed entries for the same title are still rejected as invalid_input (ambiguous duplicate, not silently deduplicated)', () => {
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [PROPOSED_ROLE, { ...PROPOSED_ROLE }], approved: true });
  assert.equal(plan.status, 'invalid_input');
});

test('a duplicate title already present in current is blocked as duplicate_title_in_current', () => {
  const current = [{ ...BASELINE_ROLE }, { ...BASELINE_ROLE, desc: 'A second, conflicting Senior Linguist row already in the database.' }, { ...OTHER_ROLE }];
  const plan = planJoinUsCareerRolesContentMigration({ current, baseline: baselineRoles(), proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.entries.find((e) => e.title === 'Senior Linguist').status, 'duplicate_title_in_current');
});

test('a duplicate title in the baseline is blocked as duplicate_title_in_baseline', () => {
  const baseline = [{ ...BASELINE_ROLE }, { ...BASELINE_ROLE, desc: 'A second, conflicting baseline snapshot row.' }, { ...OTHER_ROLE }];
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline, proposed: [PROPOSED_ROLE], approved: true });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.entries.find((e) => e.title === 'Senior Linguist').status, 'duplicate_title_in_baseline');
});

// --- 8. Preservation of unrelated content fields ---

test('fields on a role other than title are never required or type-checked, and are carried through whole', () => {
  const sparseRole = { title: 'Minimal Role' };
  const plan = planJoinUsCareerRolesContentMigration({ current: currentAtBaseline(), baseline: baselineRoles(), proposed: [sparseRole], approved: true });
  assert.equal(plan.status, 'ready_to_update');
  assert.deepEqual(plan.proposedCareerRoles.find((r) => r.title === 'Minimal Role'), sparseRole);
});

test('unexpected extra properties passed alongside current/baseline/proposed/approved are ignored, never echoed into the plan', () => {
  const plan = planJoinUsCareerRolesContentMigration({
    current: currentAtBaseline(),
    baseline: baselineRoles(),
    proposed: [PROPOSED_ROLE],
    approved: true,
    TRACKS: [{ title: 'Volunteer', href: '/join-us/volunteer' }],
    VOLUNTEER_CATEGORIES: [{ title: 'Technical' }],
  });
  assert.equal(plan.status, 'ready_to_update');
  assert.equal(JSON.stringify(plan).includes('Volunteer'), false);
  assert.equal(JSON.stringify(plan).includes('Technical'), false);
});

// --- 9. No mutation of inputs ---

test('planning never mutates the current, baseline or proposed arrays or their role objects', () => {
  const current = currentAtBaseline();
  const baseline = baselineRoles();
  const proposed = [{ ...PROPOSED_ROLE }];
  const currentSnapshot = JSON.parse(JSON.stringify(current));
  const baselineSnapshot = JSON.parse(JSON.stringify(baseline));
  const proposedSnapshot = JSON.parse(JSON.stringify(proposed));

  planJoinUsCareerRolesContentMigration({ current, baseline, proposed, approved: true });

  assert.deepEqual(current, currentSnapshot);
  assert.deepEqual(baseline, baselineSnapshot);
  assert.deepEqual(proposed, proposedSnapshot);
});

test('role objects returned in the plan are independent copies, not live references into the input arrays', () => {
  const current = currentAtBaseline();
  const proposed = [{ ...PROPOSED_ROLE }];
  const plan = planJoinUsCareerRolesContentMigration({ current, baseline: baselineRoles(), proposed, approved: true });

  const returnedRole = plan.proposedCareerRoles.find((r) => r.title === 'Senior Linguist');
  returnedRole.desc = 'mutated after the fact';
  assert.notEqual(proposed[0].desc, 'mutated after the fact');
});

// --- 10. No database or external dependencies ---

test('the planner module has zero imports -- no database, filesystem or network dependency is even possible', () => {
  const source = fs.readFileSync(path.join(__dirname, 'joinUsCareerRolesContentPlan.js'), 'utf8');
  assert.doesNotMatch(source, /^\s*import /m, 'this module must never import anything -- it is pure, dependency-free planning logic');
});

test('the module explicitly documents that approved: true is a caller-set flag, not independent content-owner authorization', () => {
  const source = fs.readFileSync(path.join(__dirname, 'joinUsCareerRolesContentPlan.js'), 'utf8');
  const flattened = source.replace(/\/\//g, ' ').replace(/\s+/g, ' ');
  assert.match(flattened, /IMPORTANT LIMITATION/);
  assert.match(flattened, /no way to verify that real content-owner sign-off actually happened/);
  assert.match(flattened, /it is NOT independent proof of authorization/);
});
