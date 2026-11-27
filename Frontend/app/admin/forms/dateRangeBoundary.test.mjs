// Genuine runtime regression coverage for the local-calendar-day boundary
// conversion logic, executed under REAL, controlled timezones -- not
// source assertions, and not a bare `TZ=...` shell prefix (confirmed, on
// this project's Windows/git-bash environment, to silently NOT reach the
// native node.exe process at all -- process.env.TZ came back undefined).
// Instead, each case spawns a genuine Node child process via
// child_process.spawnSync with an explicit `env: { ...process.env, TZ }`
// object -- Node's own process-spawning API, bypassing any shell-specific
// environment-variable-passing behavior entirely, so this is reliable
// regardless of which shell eventually runs `npm test`. Each child process
// imports the real, unmodified dateRangeBoundary.mjs module and calls its
// real exported functions -- this is genuine execution of the real logic
// under each simulated timezone, not a re-typed duplicate and not a
// mocked Date/Intl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulePath = pathToFileURL(path.join(__dirname, 'dateRangeBoundary.mjs')).href;

// Runs `mod[fnName](...args)` for real, inside a fresh child Node process
// with TZ explicitly set to `tz` -- confirms via a canary line that the
// child process actually resolved the intended IANA zone (not silently
// falling back to the host's own timezone), so a silent TZ-passing failure
// (like the shell-prefix issue this file's own header comment describes)
// can never be mistaken for a passing assertion.
// ICU resolves some IANA identifiers to a legacy canonical backing name
// (e.g. the modern "Asia/Kolkata" is, per the IANA tzdb itself, an alias
// of the older "Asia/Calcutta") -- Intl.DateTimeFormat().resolvedOptions()
// .timeZone legitimately echoes back the canonical name, not necessarily
// the exact alias requested, even though the real-world offset/rules
// applied are identical either way (independently confirmed against
// real-world UTC offsets before writing this file). This map lets the
// canary check recognize known equivalents without weakening what it
// actually guards against: TZ silently not being applied at all (e.g.
// this project's own git-bash `TZ=value command` prefix syntax, confirmed
// NOT to reach a native Windows node.exe process this way).
const KNOWN_TZ_ALIASES = { 'Asia/Kolkata': 'Asia/Calcutta' };

function runUnderTimezone(tz, fnName, ...args) {
  const code = `
    import(${JSON.stringify(modulePath)}).then((mod) => {
      const result = mod.${fnName}(${args.map((a) => JSON.stringify(a)).join(', ')});
      process.stdout.write(JSON.stringify({ resolvedTz: Intl.DateTimeFormat().resolvedOptions().timeZone, result }));
    });
  `;
  const proc = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  assert.equal(proc.status, 0, `child process failed under TZ=${tz}: ${proc.stderr}`);
  const parsed = JSON.parse(proc.stdout);
  const acceptable = [tz, KNOWN_TZ_ALIASES[tz]].filter(Boolean);
  assert.ok(
    acceptable.includes(parsed.resolvedTz),
    `child process did not actually resolve TZ=${tz} (got "${parsed.resolvedTz}") -- TZ was not really applied, this would otherwise be a silently-passing false positive`
  );
  return parsed.result;
}

// --- UTC (the simplest case: local day === UTC day) ------------------------

test('UTC: startOfLocalDayIso and startOfNextLocalDayIso match the bare UTC calendar day exactly', () => {
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', '2026-11-24'), '2026-11-24T00:00:00.000Z');
  assert.equal(runUnderTimezone('UTC', 'startOfNextLocalDayIso', '2026-11-24'), '2026-11-25T00:00:00.000Z');
});

// --- Asia/Kolkata (fixed +05:30, no DST) ------------------------------------

test('Asia/Kolkata: local midnight is correctly offset by -05:30 relative to UTC', () => {
  assert.equal(runUnderTimezone('Asia/Kolkata', 'startOfLocalDayIso', '2026-11-24'), '2026-11-23T18:30:00.000Z');
  assert.equal(runUnderTimezone('Asia/Kolkata', 'startOfNextLocalDayIso', '2026-11-24'), '2026-11-24T18:30:00.000Z');
});

test('Asia/Kolkata: a same-day From/To range (24th to 24th) produces [2026-11-23T18:30Z, 2026-11-24T18:30Z) -- a real, non-empty 24h window, unlike the old bare-UTC-date bug', () => {
  const from = runUnderTimezone('Asia/Kolkata', 'startOfLocalDayIso', '2026-11-24');
  const toExclusive = runUnderTimezone('Asia/Kolkata', 'startOfNextLocalDayIso', '2026-11-24');
  assert.ok(new Date(toExclusive) - new Date(from) > 0, 'the window must have positive width');
  assert.equal((new Date(toExclusive) - new Date(from)) / 3600000, 24);
});

// --- America/New_York (DST: spring-forward and fall-back) ------------------

test('America/New_York: DST spring-forward day (2026-03-08, 23-hour local day) still produces the correct exclusive boundary via calendar arithmetic, not a fixed +24h', () => {
  assert.equal(runUnderTimezone('America/New_York', 'startOfLocalDayIso', '2026-03-08'), '2026-03-08T05:00:00.000Z');
  const toExclusive = runUnderTimezone('America/New_York', 'startOfNextLocalDayIso', '2026-03-08');
  assert.equal(toExclusive, '2026-03-09T04:00:00.000Z');
  const from = runUnderTimezone('America/New_York', 'startOfLocalDayIso', '2026-03-08');
  assert.equal((new Date(toExclusive) - new Date(from)) / 3600000, 23, 'the spring-forward day is genuinely 23 hours long, not 24');
});

test('America/New_York: DST fall-back day (2026-11-01, 25-hour local day) still produces the correct exclusive boundary', () => {
  const from = runUnderTimezone('America/New_York', 'startOfLocalDayIso', '2026-11-01');
  const toExclusive = runUnderTimezone('America/New_York', 'startOfNextLocalDayIso', '2026-11-01');
  assert.equal(from, '2026-11-01T04:00:00.000Z');
  assert.equal(toExclusive, '2026-11-02T05:00:00.000Z');
  assert.equal((new Date(toExclusive) - new Date(from)) / 3600000, 25, 'the fall-back day is genuinely 25 hours long, not 24');
});

// --- Australia/Sydney (an additional, distinct positive-offset timezone) ---

test('Australia/Sydney: local midnight is correctly offset (a positive-offset zone distinct from Kolkata/New York)', () => {
  assert.equal(runUnderTimezone('Australia/Sydney', 'startOfLocalDayIso', '2026-11-24'), '2026-11-23T13:00:00.000Z');
  assert.equal(runUnderTimezone('Australia/Sydney', 'startOfNextLocalDayIso', '2026-11-24'), '2026-11-24T13:00:00.000Z');
});

// --- Month-end, year-end, leap-day transitions (calendar arithmetic, not +24h durations) ---

for (const tz of ['UTC', 'Asia/Kolkata', 'America/New_York', 'Australia/Sydney']) {
  test(`${tz}: month-end rollover (2026-02-28, non-leap year) advances to March 1st correctly`, () => {
    const result = runUnderTimezone(tz, 'startOfNextLocalDayIso', '2026-02-28');
    const asLocalDateInThatTz = new Date(new Date(result).toLocaleString('en-US', { timeZone: tz }));
    assert.equal(asLocalDateInThatTz.getMonth(), 2, 'must land in March (month index 2), not silently stay in February');
    assert.equal(asLocalDateInThatTz.getDate(), 1);
  });

  test(`${tz}: leap-day rollover (2028-02-28, leap year) advances to February 29th, not March 1st`, () => {
    const result = runUnderTimezone(tz, 'startOfNextLocalDayIso', '2028-02-28');
    const asLocalDateInThatTz = new Date(new Date(result).toLocaleString('en-US', { timeZone: tz }));
    assert.equal(asLocalDateInThatTz.getMonth(), 1, 'must land in February (month index 1) -- 2028 is a leap year');
    assert.equal(asLocalDateInThatTz.getDate(), 29);
  });

  test(`${tz}: year-end rollover (2026-12-31) advances into January 1st of 2027`, () => {
    const result = runUnderTimezone(tz, 'startOfNextLocalDayIso', '2026-12-31');
    const asLocalDateInThatTz = new Date(new Date(result).toLocaleString('en-US', { timeZone: tz }));
    assert.equal(asLocalDateInThatTz.getFullYear(), 2027);
    assert.equal(asLocalDateInThatTz.getMonth(), 0);
    assert.equal(asLocalDateInThatTz.getDate(), 1);
  });
}

// --- Invalid/impossible calendar dates, empty values ------------------------

test('an impossible calendar date (2026-02-30, February has no 30th) is rejected (returns null), never silently rolled forward into March', () => {
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', '2026-02-30'), null);
  assert.equal(runUnderTimezone('UTC', 'startOfNextLocalDayIso', '2026-02-30'), null);
});

test('2026-02-29 (non-leap year) is rejected as impossible, while 2028-02-29 (leap year) is accepted', () => {
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', '2026-02-29'), null);
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', '2028-02-29'), '2028-02-29T00:00:00.000Z');
});

test('an empty string returns null (no filter applied), matching the "All" / unset state', () => {
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', ''), null);
  assert.equal(runUnderTimezone('UTC', 'startOfNextLocalDayIso', ''), null);
});

test('a malformed (non "YYYY-MM-DD") value returns null rather than throwing or silently misparsing', () => {
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', '2026/11/24'), null);
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', 'not-a-date'), null);
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', '2026-11-24T00:00:00.000Z'), null);
});

// --- Finding 1: the maximum supported year boundary (December 31st of year
// 9999 -- the one date whose "following day" cannot be represented in this
// feature's 4-digit-year ISO contract) --------------------------------------

test('9999-12-30 (one day before the maximum boundary) still converts normally under every timezone -- no unnecessary blanket cutoff before the real boundary', () => {
  assert.equal(runUnderTimezone('UTC', 'startOfNextLocalDayIso', '9999-12-30'), '9999-12-31T00:00:00.000Z');
  assert.ok(runUnderTimezone('America/New_York', 'startOfNextLocalDayIso', '9999-12-30') !== null);
  assert.ok(runUnderTimezone('Asia/Kolkata', 'startOfNextLocalDayIso', '9999-12-30') !== null);
});

test('9999-12-31 under UTC or a negative-offset timezone (America/New_York): the following day would require a 5-digit year (10000) -- rejected (null), never an unparseable expanded-ISO boundary', () => {
  assert.equal(runUnderTimezone('UTC', 'startOfNextLocalDayIso', '9999-12-31'), null);
  assert.equal(runUnderTimezone('America/New_York', 'startOfNextLocalDayIso', '9999-12-31'), null);
});

test('9999-12-31 under a positive-offset timezone (Asia/Kolkata): converting "the day after" back to UTC still lands within year 9999 -- this IS a representable boundary and must still be accepted, confirming the check is not a blanket year-9999 ban', () => {
  const result = runUnderTimezone('Asia/Kolkata', 'startOfNextLocalDayIso', '9999-12-31');
  assert.ok(result !== null, 'Kolkata is UTC+5:30 -- local midnight Jan 1, 10000 is still Dec 31, 9999 in UTC, a perfectly representable instant');
  assert.equal(result, '9999-12-31T18:30:00.000Z');
});

test('startOfLocalDayIso (no day-after computation) for 9999-12-31 itself is unaffected by the boundary check -- it never crosses into year 10000', () => {
  assert.equal(runUnderTimezone('UTC', 'startOfLocalDayIso', '9999-12-31'), '9999-12-31T00:00:00.000Z');
  assert.ok(runUnderTimezone('America/New_York', 'startOfLocalDayIso', '9999-12-31') !== null);
});
