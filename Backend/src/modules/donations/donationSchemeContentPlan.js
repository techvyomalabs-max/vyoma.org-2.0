// Phase 1 Task 5A: pure planning/validation logic for the donation-scheme
// content migration (the 3 flagged WordPress merge pairs -- see
// Backend/scripts/wordpress/reports/migration-decision-register.md §1/§2).
//
// This module performs NO I/O of any kind: no MongoDB connection, no
// filesystem writes, no network access, no console output. It only ever
// computes what a future, separately authorized --commit script WOULD do,
// given the current state of the 3 target schemes and an explicitly
// approved candidate value supplied by the caller. There is deliberately
// no executable write path here yet (Task 5A scope).
//
// No unapproved donation-scheme content is embedded in this file --
// candidate text is always supplied by the caller (production: a future
// migration script with content-owner-approved text; tests: placeholder
// fixtures only, per Task 5A's explicit instruction).
export const TARGET_SLUGS = Object.freeze(['vidya-danam', 'grantha-danam', 'sabha-ujjivanam']);

// Frozen snapshot of scripts/seedData/donate.js's CURRENT (pre-migration)
// description/note values for the 3 target schemes, captured 2026-10-28
// during the Phase 1 Task 5 investigation. This is a deliberate point-in-
// time snapshot, not a live reference to that file: its only purpose is
// detecting whether a scheme's current stored value has drifted from this
// known starting point (an administrator edit through the CMS, or an
// already-completed migration) -- it must NEVER be updated just because
// scripts/seedData/donate.js changes later, since that would defeat its
// entire reason for existing. If the real baseline content is ever
// intentionally changed outside of this migration, this constant needs a
// deliberate, separate review, not an automatic sync.
export const KNOWN_BASELINE = Object.freeze({
  'vidya-danam': Object.freeze({
    description: 'Fund free Sanskrit e-learning courses — ₹1,000 sponsors one student, one course, one month.',
    note: null,
  }),
  'grantha-danam': Object.freeze({
    description: 'Sponsor the publishing and printing of Sanskrit learning materials, including in memory of a loved one.',
    note: null,
  }),
  'sabha-ujjivanam': Object.freeze({
    description: 'Support grassroots Sanskrit learning through five established Samskrita Sabhas — ₹10,000/month per sponsorship.',
    note: null,
  }),
});

function normalizeNote(note) {
  return note || null;
}

function sameContent(a, b) {
  return a.description === b.description && normalizeNote(a.note) === normalizeNote(b.note);
}

// Builds a dry-run migration plan for the 3 target slugs. Pure function:
// never mutates `currentSchemes`/`candidates`, never performs any I/O,
// never writes anywhere.
//
// `currentSchemes`: array of { slug, description, note, ...anythingElse }
//   -- as currently read from DonationSchemeModel (or a test fixture). Any
//   field beyond slug/description/note is read nowhere in this function and
//   never appears in a proposed update payload -- every other field
//   (amountOptions, status, displayOrder, image, paymentMode, ...) is
//   guaranteed untouched by this plan, by construction.
// `candidates`: { [slug]: { description, note?, approved: true } } --
//   replacement content supplied by the caller. A missing entry, or one
//   whose `approved` property is not strictly `true`, is treated as "not
//   yet approved" and is never included in a proposed write, even if it
//   carries real-looking text.
//
//   IMPORTANT LIMITATION: `approved: true` is nothing more than a flag the
//   CALLER sets on the object it passes in -- this module has no way to
//   verify that real content-owner sign-off actually happened behind that
//   flag. It is a structural gate against *accidentally* including
//   unreviewed/placeholder text in a plan (e.g. a draft value left lying
//   around, or a test fixture used by mistake) -- it is NOT independent
//   proof of authorization, and it must never be treated as equivalent to
//   actual content-owner approval. Whoever builds the future --commit
//   script's candidate object is the one responsible for only ever setting
//   `approved: true` on text that a content owner has genuinely signed off
//   on (see migration-decision-register.md for what that approval covers
//   for each of the 3 target slugs); this module cannot enforce that part.
export function planDonationSchemeContentMigration(currentSchemes, candidates = {}) {
  const entries = [];

  for (const slug of TARGET_SLUGS) {
    const matches = currentSchemes.filter((s) => s.slug === slug);

    if (matches.length === 0) {
      entries.push({
        slug,
        status: 'missing_scheme',
        reason: `No DonationScheme document found with slug "${slug}".`,
      });
      continue;
    }
    if (matches.length > 1) {
      entries.push({
        slug,
        status: 'duplicate_slug',
        reason: `${matches.length} DonationScheme documents share slug "${slug}" -- refusing to guess which is authoritative.`,
      });
      continue;
    }

    const current = matches[0];
    const baseline = KNOWN_BASELINE[slug];
    const candidate = candidates[slug];
    const currentValue = { description: current.description, note: normalizeNote(current.note) };

    const matchesBaseline = sameContent(currentValue, baseline);
    const matchesCandidate = candidate ? sameContent(currentValue, candidate) : false;

    if (!matchesBaseline && !matchesCandidate) {
      entries.push({
        slug,
        status: 'admin_edited',
        reason:
          'Current description/note matches neither the known pre-migration baseline nor the approved candidate -- refusing to overwrite a value that may have been edited by an administrator.',
        current: currentValue,
      });
      continue;
    }

    if (matchesCandidate) {
      entries.push({
        slug,
        status: 'already_migrated',
        reason: 'Current description/note already matches the approved candidate content -- no change needed (safe no-op).',
        current: currentValue,
      });
      continue;
    }

    // matchesBaseline is true from here on.
    if (!candidate || candidate.approved !== true) {
      entries.push({
        slug,
        status: 'awaiting_approval',
        reason: candidate
          ? 'Candidate content was supplied but is not marked approved: true -- refusing to include unapproved content in the plan.'
          : 'No candidate content supplied yet for this slug -- content-owner approval is still outstanding.',
        current: currentValue,
      });
      continue;
    }

    entries.push({
      slug,
      status: 'ready_to_update',
      reason: 'Current description/note matches the known pre-migration baseline exactly, and approved candidate content is available.',
      current: currentValue,
      proposed: { description: candidate.description, note: normalizeNote(candidate.note) },
    });
  }

  const summary = entries.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});

  return { entries, summary };
}

// Pure text formatter for a human-readable dry-run report -- no
// console.log, no file writes. A future, separately authorized --commit
// script can print or save this string itself; this function only ever
// computes it.
export function formatDryRunReport(plan) {
  const lines = [];
  lines.push('Donation-scheme content migration -- DRY RUN (no writes performed)');
  lines.push('='.repeat(72));
  for (const entry of plan.entries) {
    lines.push(`- ${entry.slug}: ${entry.status}`);
    lines.push(`    ${entry.reason}`);
    if (entry.current) {
      lines.push(`    current description:  "${entry.current.description}"`);
    }
    if (entry.proposed) {
      lines.push(`    proposed description: "${entry.proposed.description}"`);
    }
  }
  lines.push('-'.repeat(72));
  lines.push(`Summary: ${JSON.stringify(plan.summary)}`);
  return lines.join('\n');
}
