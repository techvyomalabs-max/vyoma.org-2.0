// Pure, framework-free local-calendar-day boundary computation for the
// Admin Forms date filters. Converts a bare "YYYY-MM-DD" value from a
// native <input type="date"> (always timezone-free, local-calendar-day
// text, regardless of which browser/OS it came from) into the correct UTC
// instant boundary, computed in the browser's OWN local timezone AT THAT
// SPECIFIC CALENDAR DATE -- never today's offset substituted for a
// different date's actual offset, never a hardcoded country/UTC offset.
// Extracted so it's genuinely, directly testable with node:test under
// multiple simulated timezones (via child_process + an explicit env.TZ,
// not a shell-dependent prefix -- see dateRangeBoundary.test.mjs), no
// rendering needed -- same extraction pattern as
// resourcesTableLogic.mjs/navActiveLogic.mjs/internshipApplyLogic.mjs.

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Parses "YYYY-MM-DD" into integer calendar components, rejecting
// anything else. Callers only ever pass this the literal value of an
// <input type="date">, which the browser itself guarantees is always
// exactly this shape or an empty string.
function parseDateOnly(value) {
  const m = DATE_ONLY_RE.exec(value);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

// Constructs the given calendar date using the runtime's own local
// timezone (the multi-argument Date constructor is always interpreted in
// local time, and correctly resolves the real UTC offset that applied on
// THAT specific date, including any DST rule active then -- never a
// separately-computed "current" offset substituted in). Verifies the
// result round-trips to the exact same calendar date, catching an
// impossible date (e.g. 2026-02-30) that the Date constructor would
// otherwise silently roll forward into March rather than reject.
function toValidLocalMidnight(year, month, day) {
  const d = new Date(year, month, day, 0, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

// The inclusive start of the selected local calendar day, as a UTC ISO
// timestamp -- or null if `value` is empty, malformed, or an impossible
// calendar date.
export function startOfLocalDayIso(value) {
  if (!value) return null;
  const parts = parseDateOnly(value);
  if (!parts) return null;
  const d = toValidLocalMidnight(parts.year, parts.month, parts.day);
  return d ? d.toISOString() : null;
}

// The exclusive start of the calendar day immediately following the
// selected local day, as a UTC ISO timestamp. Computed via calendar
// arithmetic -- incrementing the `day` component by one and letting the
// Date constructor normalize month/year/leap-day rollover -- never a
// fixed +24h/+86400000ms duration, which would be wrong on a DST-
// transition day (a local calendar day can be 23 or 25 hours long, not
// always exactly 24). The originally-selected day is validated as a real
// calendar date first (an impossible date like 2026-02-30 must still be
// rejected here, not silently "corrected" by the same +1-day rollover
// this function legitimately performs for real month-end dates).
export function startOfNextLocalDayIso(value) {
  if (!value) return null;
  const parts = parseDateOnly(value);
  if (!parts) return null;
  if (!toValidLocalMidnight(parts.year, parts.month, parts.day)) return null;
  const next = new Date(parts.year, parts.month, parts.day + 1, 0, 0, 0, 0);
  // Only reachable from December 31st of the maximum supported 4-digit
  // year (9999): in a negative-UTC-offset browser timezone, converting
  // "the day after" to UTC pushes into year 10000, which toISOString()
  // would render in expanded (+010000-...) form -- a shape the backend's
  // dateToExclusive contract does not accept (and nothing else in this
  // feature needs). Returning null here, exactly like any other
  // unconvertible value, routes this through the SAME existing
  // throw-on-invalid-date guard in page.js's buildQuery (never a silently
  // broader, unfiltered request) rather than sending an unparseable
  // boundary to the API. An ordinary year-end (e.g. 9999-12-30 -> 9999-12-
  // 31) or the same 9999-12-31 input under a positive-offset timezone
  // (which stays within year 9999 in UTC terms) is unaffected.
  if (next.getUTCFullYear() > 9999) return null;
  return next.toISOString();
}
