// Phase 1 Task 6I-C: pure planning/validation logic for safely updating
// `data.CAREER_ROLES` within the pages/join-us Content document -- the
// multi-role migration flagged by the Task 6I Careers Live-Content Parity
// Investigation (see Backend/scripts/wordpress/reports/
// migration-decision-register.md, decisions D4/D28, and the Senior
// Linguist / E-Learning Administrator conflicting-content-variant
// findings).
//
// This module performs NO I/O of any kind: no MongoDB connection, no
// filesystem reads/writes, no network access, no console output. It only
// ever computes what a future, separately authorized migration step WOULD
// do to CAREER_ROLES, given the current state of the array, a known
// pre-migration baseline, a set of proposed role updates/additions, and an
// explicit approval flag -- all supplied by the caller. There is
// deliberately no executable write path here, and no real WordPress/CMS
// role content is embedded in this file -- every value this module reasons
// about is passed in by the caller (production: a future migration step
// reading the real pages/join-us content and content-owner-approved role
// text; tests: fixture objects only).
//
// Unlike corpusFundContentPlan.js (Task 6E -- a single destination object,
// one field at a time) or donationSchemeContentPlan.js (Task 5A -- a fixed,
// frozen list of 3 known slugs), CAREER_ROLES is an open-ended array with
// no id field beyond `title` -- so this module takes `baseline` as an
// explicit call-time input, never a frozen module constant: the Careers
// role list is still under active content-owner review (see the decision
// register), unlike the 3 already-settled donation-scheme merge pairs.
// Every role named in `proposed` is classified independently by `title`,
// the only stable identity a CAREER_ROLES entry has.
//
// Because `data.CAREER_ROLES` is a single array field on a single Content
// document, there is no way to write "just some" roles without replacing
// the whole array -- so if even ONE named role cannot be safely migrated
// (an admin edit, a missing title, a duplicate, a role removed since the
// baseline was captured), this module refuses to propose ANY write at all,
// rather than silently applying only the safe subset. See `status:
// 'blocked'` below.

// Only a bare `{}` literal or a JSON-parsed object (prototype ===
// Object.prototype) or an explicitly null-prototype object is accepted --
// a Date, Map, class instance, or anything else with a different
// prototype is rejected, since this module only ever deals in plain data.
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Defends against prototype-pollution-shaped payloads -- e.g. role content
// that arrived via JSON.parse from an untrusted source upstream of this
// pure function, where `{"__proto__": {...}}` creates a real own property.
// Refusing to process a role carrying one of these keys at all is simpler
// and safer than trying to read/copy/compare around it.
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

function invalidInput(reason) {
  return { status: 'invalid_input', reason };
}

// A role must be a plain object, free of prototype-pollution-shaped keys,
// with a non-empty string `title` -- the only field this module treats as
// a role's identity. Every other field (dept/type/loc/desc/applyUrl/
// active/...) is opaque: never required, never type-checked, never
// individually read or compared by name here -- only ever carried through
// whole, so this module never needs to change if the role shape changes.
function isValidRole(value) {
  return isPlainObject(value) && !hasDangerousKey(value) && typeof value.title === 'string' && value.title.trim().length > 0;
}

function validateRoleList(value, { allowNullish = false } = {}) {
  if (allowNullish && (value === null || value === undefined)) return { ok: true };
  if (!Array.isArray(value)) return { ok: false };
  return { ok: value.every(isValidRole) };
}

function findDuplicateTitles(roles) {
  const seen = new Set();
  const duplicates = new Set();
  for (const role of roles) {
    if (seen.has(role.title)) duplicates.add(role.title);
    seen.add(role.title);
  }
  return [...duplicates];
}

function findByTitle(roles, title) {
  return (roles || []).filter((r) => r.title === title);
}

// Builds a dry-run migration plan for `data.CAREER_ROLES`. Pure function:
// never mutates `current`/`baseline`/`proposed`, never performs any I/O,
// never writes anywhere.
//
// Inputs (all explicit -- never read from disk/DB/network by this module):
//   `current`: the live `data.CAREER_ROLES` array from the real pages/
//     join-us Content document, or `null`/`undefined` if no pages/join-us
//     content exists yet at all. Any field on a role beyond `title` is
//     read only for comparison, never individually interpreted.
//   `baseline`: a plain array describing the known pre-migration value of
//     CAREER_ROLES, supplied by the caller -- there is no frozen constant
//     here (see the header note above).
//   `proposed`: a non-empty array of role objects this call is considering
//     migrating. Only roles named here are ever touched; every current
//     role whose title does not appear in `proposed` is guaranteed
//     untouched and is never dropped from the result.
//   `approved`: must be strictly boolean `true` for any migration to be
//     proposed. See the IMPORTANT LIMITATION note below.
//
// IMPORTANT LIMITATION: `approved: true` is nothing more than a flag the
// CALLER passes in -- this module has no way to verify that real
// content-owner sign-off actually happened behind that flag. It is a
// structural gate against *accidentally* treating unreviewed/placeholder
// role content as ready to migrate -- it is NOT independent proof of
// authorization, and must never be treated as equivalent to actual
// content-owner approval. Whoever builds a future migration step around
// this planner is responsible for only ever passing `approved: true` once
// a content owner has genuinely signed off on every role in `proposed`
// (see migration-decision-register.md, decisions D4/D28, for what that
// approval would need to cover) -- this module cannot enforce that part.
export function planJoinUsCareerRolesContentMigration({ current, baseline, proposed, approved } = {}) {
  if (!validateRoleList(current, { allowNullish: true }).ok) {
    return invalidInput(
      '`current` must be an array of role objects (each a plain object with no unsafe keys such as __proto__, constructor or prototype, and a non-empty string `title`), or null/undefined if no pages/join-us content exists yet.'
    );
  }
  if (!validateRoleList(baseline).ok) {
    return invalidInput('`baseline` must be an array of role objects (each a plain object with no unsafe keys, and a non-empty string `title`).');
  }
  if (!Array.isArray(proposed) || proposed.length === 0 || !validateRoleList(proposed).ok) {
    return invalidInput(
      '`proposed` must be a non-empty array of role objects (each a plain object with no unsafe keys such as __proto__, constructor or prototype, and a non-empty string `title`).'
    );
  }

  const proposedDuplicates = findDuplicateTitles(proposed);
  if (proposedDuplicates.length > 0) {
    return invalidInput(
      `\`proposed\` contains more than one role for the same title (${proposedDuplicates.join(
        ', '
      )}) -- refusing to guess which variant is authoritative. This is exactly the Senior Linguist / E-Learning Administrator conflicting-content-variant scenario found during the Task 6I investigation: conflicting variants must be resolved by a content owner into a single proposed role before being passed to this planner, never auto-merged here.`
    );
  }

  if (current === null || current === undefined) {
    return {
      status: 'missing_current_content',
      reason:
        "No pages/join-us content exists yet -- there is no CAREER_ROLES array to migrate into. Out of this plan's scope (mirrors corpusFundContentPlan.js's identical missing_destination case).",
    };
  }

  const entries = [];

  for (const proposedRole of proposed) {
    const { title } = proposedRole;
    const currentMatches = findByTitle(current, title);
    const baselineMatches = findByTitle(baseline, title);

    if (currentMatches.length > 1) {
      entries.push({
        title,
        status: 'duplicate_title_in_current',
        reason: `${currentMatches.length} roles in the current CAREER_ROLES array share the title "${title}" -- refusing to guess which is authoritative.`,
      });
      continue;
    }
    if (baselineMatches.length > 1) {
      entries.push({
        title,
        status: 'duplicate_title_in_baseline',
        reason: `${baselineMatches.length} roles in the baseline share the title "${title}" -- refusing to guess which is authoritative.`,
      });
      continue;
    }

    const currentRole = currentMatches[0];
    const baselineRole = baselineMatches[0];

    if (currentRole === undefined && baselineRole === undefined) {
      entries.push({
        title,
        status: 'to_add',
        reason: 'No existing role with this title in either the current content or the known baseline -- a brand-new role, not an update to an existing one.',
        proposed: { ...proposedRole },
      });
      continue;
    }

    if (currentRole === undefined && baselineRole !== undefined) {
      entries.push({
        title,
        status: 'removed_since_baseline',
        reason:
          'The baseline shows this role existed, but it is no longer present in the current CAREER_ROLES array -- it may have been deliberately removed by an administrator. Refusing to silently re-add it.',
        baseline: { ...baselineRole },
      });
      continue;
    }

    const matchesCandidate = deepEqual(currentRole, proposedRole);
    const matchesBaseline = baselineRole !== undefined && deepEqual(currentRole, baselineRole);

    if (matchesCandidate) {
      entries.push({
        title,
        status: 'already_migrated',
        reason: 'Current role content already matches the proposed content -- no change needed (safe no-op).',
        current: { ...currentRole },
      });
      continue;
    }

    if (!matchesBaseline) {
      entries.push({
        title,
        status: 'admin_edited',
        reason:
          'Current role content matches neither the known pre-migration baseline nor the proposed content -- refusing to overwrite a value that may have changed since the baseline was captured.',
        current: { ...currentRole },
      });
      continue;
    }

    entries.push({
      title,
      status: 'ready_to_update',
      reason: 'Current role content matches the known pre-migration baseline exactly, and proposed content is available.',
      current: { ...currentRole },
      proposed: { ...proposedRole },
    });
  }

  const summary = entries.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});

  const BLOCKING_STATUSES = new Set(['duplicate_title_in_current', 'duplicate_title_in_baseline', 'removed_since_baseline', 'admin_edited']);
  if (entries.some((entry) => BLOCKING_STATUSES.has(entry.status))) {
    return {
      status: 'blocked',
      reason: 'One or more roles cannot be safely migrated -- refusing to write any part of CAREER_ROLES, since it is a single array field that can only be replaced as a whole.',
      entries,
      summary,
    };
  }

  const actionable = entries.some((entry) => entry.status === 'ready_to_update' || entry.status === 'to_add');

  if (!actionable) {
    return {
      status: 'already_migrated',
      reason: 'Every proposed role already matches the current CAREER_ROLES content -- no change needed (safe no-op).',
      entries,
      summary,
    };
  }

  if (approved !== true) {
    return {
      status: 'awaiting_approval',
      reason: 'One or more roles are ready to migrate, but approved !== true -- content-owner approval is still outstanding.',
      entries,
      summary,
    };
  }

  // Never delete existing roles automatically: every current role not
  // named in `proposed` is carried forward untouched, in its original
  // position (titles not mentioned in `proposed` are never read, compared
  // or altered by this loop). Roles named in `proposed` are substituted
  // in place by their approved content; a genuinely new role (no match in
  // `current` at all) is appended at the end, in `proposed`'s order. The
  // result is a narrowly scoped, in-place update of named roles only --
  // never an implicit prune of anything this call wasn't told about, and
  // it only ever describes CAREER_ROLES itself: TRACKS,
  // VOLUNTEER_CATEGORIES, CAREER_STEPS, INTERNSHIP_OPENINGS, SEO and every
  // other pages/join-us field are never read, referenced or returned by
  // this module.
  const proposedByTitle = new Map(proposed.map((r) => [r.title, r]));
  const proposedCareerRoles = [
    ...current.map((r) => (proposedByTitle.has(r.title) ? { ...proposedByTitle.get(r.title) } : r)),
    ...proposed.filter((r) => findByTitle(current, r.title).length === 0).map((r) => ({ ...r })),
  ];

  return {
    status: 'ready_to_update',
    reason: 'All named roles are either already correct or safely migratable, and approved content is available.',
    entries,
    summary,
    proposedCareerRoles,
  };
}
