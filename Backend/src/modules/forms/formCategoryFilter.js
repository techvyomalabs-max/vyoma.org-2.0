// Admin Forms — category filter clause builder (fixed, server-controlled
// subject-matching rules, never built from a request value). Every clause
// is expressed via $expr/aggregation operators so it examines
// `values.subject`'s actual top-level BSON type and value directly --
// never MongoDB's implicit array-element-match behavior that a plain
// `{'values.subject': ...}` query filter would apply, which `values` (a
// Mixed field, free-form user-submitted data) could otherwise be shaped to
// exploit (e.g. a submission whose `subject` happens to be an array
// containing a known literal as one element).
//
// Internships/Careers use an anchored, hardcoded regex (never interpolating
// a role name) to match both the general subject and any dynamic,
// CMS-driven role-specific subject (InternshipApplyButton.jsx/
// CareersBoard.jsx's ApplyButton) without ever enumerating role names.

function exactSubjectExpr(literal) {
  return { $and: [{ $eq: [{ $type: '$values.subject' }, 'string'] }, { $eq: ['$values.subject', literal] }] };
}

// $cond, not $and, for the regex case -- explicit, documented branch
// evaluation (only the taken branch of `then`/`else` is ever evaluated),
// rather than relying on $and's own evaluation-order behavior to keep
// $regexMatch from ever receiving a non-string `input`. Returns false
// outright (never evaluating $regexMatch at all) for a missing, null,
// numeric, boolean, object or array values.subject.
//
// `options: 's'` (dotall) lets `.` match a literal newline too, so a
// genuine multiline CMS role name (however it got there -- paste, future
// bulk import, a future non-single-line editor) still matches correctly,
// not just the role names a plain <input type="text"> field can produce
// today.
function regexSubjectExpr(pattern) {
  return {
    $cond: {
      if: { $eq: [{ $type: '$values.subject' }, 'string'] },
      then: { $regexMatch: { input: '$values.subject', regex: pattern, options: 's' } },
      else: false,
    },
  };
}

// Internships: exactly "Internships" (the general Apply Now CTA), or
// "Internships - <role>" where <role> contains at least one non-whitespace
// character -- `.*\S.*` (with dotall) requires a genuine \S somewhere in
// the role segment, so "Internships - " and "Internships -    " (empty or
// whitespace-only role) do NOT match here, and correctly fall through to
// Other/Unknown instead (that complement is computed automatically, not
// hand-maintained -- see otherUnknownExpr() below). Careers: the same
// shape, its own ": " separator (CareersBoard.jsx's convention, distinct
// from Internships' " - ").
//
// Anchored with `\z`, not `$`. MongoDB's $regexMatch uses a PCRE-based
// engine where a plain `$` (even without the "m"/multiline option) matches
// either the absolute end of the string OR immediately before a single
// trailing "\n" -- real, verified behavior (confirmed against a real,
// disposable MongoMemoryServer instance, not simulated in JavaScript,
// whose own `$` semantics differ and would NOT have shown this), which let
// a submitted subject of literally "Internships\n" or "Careers\n"
// incorrectly match. `\z` is PCRE's "truly the absolute end of the
// string, never before a trailing newline" anchor -- this is a MongoDB/
// PCRE-only escape sequence, meaningful only because this string is
// handed to $regexMatch's own engine, never compiled as a JavaScript
// RegExp anywhere in this codebase.
const INTERNSHIPS_PATTERN = '^Internships( - .*\\S.*)?\\z';
const CAREERS_PATTERN = '^Careers(: .*\\S.*)?\\z';

// A Map, deliberately -- not a plain object literal. A plain object's
// bracket lookup walks the JS prototype chain, so KNOWN_CATEGORY_EXPRS['__proto__']
// would resolve to Object.prototype itself (truthy), not undefined, which
// would make buildCategoryFilter('__proto__') return a nonsense, unsafe
// $expr fragment instead of null. A Map has no prototype-chain lookup
// behavior at all, so an unrecognized or dangerous key can only ever
// resolve to `undefined`.
const KNOWN_CATEGORY_EXPRS = new Map([
  ['internships', regexSubjectExpr(INTERNSHIPS_PATTERN)],
  ['careers', regexSubjectExpr(CAREERS_PATTERN)],
  ['volunteering', exactSubjectExpr('Volunteering')],
  ['institutional-partnership', exactSubjectExpr('Institutional partnership')],
  ['csr-partnership', exactSubjectExpr('CSR partnership')],
  ['press-media', exactSubjectExpr('Press & media')],
  ['testimonial-submission', exactSubjectExpr('Testimonial submission')],
  ['corpus-fund', exactSubjectExpr('Corpus fund')],
  ['general-inquiry', exactSubjectExpr('General inquiry')],
]);

// The fixed allowlist a caller-supplied `category` query value is checked
// against before ever reaching buildCategoryFilter() -- an unrecognized
// string is rejected with 422, never silently treated as "no filter" or as
// 'other-unknown'.
export const CATEGORY_KEYS = [...KNOWN_CATEGORY_EXPRS.keys(), 'other-unknown'];

// Other/Unknown is the exact logical complement of every known category
// above -- correct by construction: a missing/null/non-string/array
// values.subject never satisfies any known clause's own leading $type
// check, an empty string never equals/matches any known literal/pattern,
// and a recognized-type string that simply isn't one of the known values
// also falls through here. It can never double-count with a known
// category, since it is defined as the negation of their union, not as a
// separate set of ad hoc conditions that could drift out of sync.
function otherUnknownExpr() {
  return { $not: [{ $or: [...KNOWN_CATEGORY_EXPRS.values()] }] };
}

// Returns the Mongo filter fragment ({ $expr: {...} }) for an
// already-allowlisted category key. Callers must validate `category`
// against CATEGORY_KEYS themselves first (see listSubmissions()) --
// returns null for anything not in the allowlist (including a prototype-
// chain property name like "__proto__"/"constructor", thanks to Map's
// lookup semantics above), rather than guessing.
export function buildCategoryFilter(category) {
  if (category === 'other-unknown') return { $expr: otherUnknownExpr() };
  const expr = KNOWN_CATEGORY_EXPRS.get(category);
  return expr ? { $expr: expr } : null;
}
