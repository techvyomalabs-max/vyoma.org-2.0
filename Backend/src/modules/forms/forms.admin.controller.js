import { FormSubmissionModel } from './formSubmission.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { expectScalarQueryParam } from '../../utils/queryValidation.js';
import { recordAudit } from '../audit/audit.service.js';
import { CATEGORY_KEYS, buildCategoryFilter } from './formCategoryFilter.js';

const VALID_STATUSES = ['new', 'handled'];
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Full ISO-8601 date-time: 4-digit year, seconds optional (ISO itself
// permits HH:MM without seconds), fractional seconds optional (1-3
// digits), offset optional ('Z' or +/-HH:MM / +/-HHMM) -- whether an
// offset is actually REQUIRED is decided per-parameter by the caller
// (see parseStrictIsoDateTime's requireOffset option), not by this regex.
const ISO_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(Z|[+-]\d{2}:?\d{2})?$/;

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  const DIM = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return DIM[month - 1];
}

// Pure calendar-arithmetic validity check (no Date object involved) --
// rejects an impossible day-of-month such as February 30, April 31, or
// February 29 in a non-leap year. Independent of JS Date's own silent
// rollover behavior entirely.
function isValidCalendarDate(year, month, day) {
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

function isValidOffset(offset) {
  if (offset === undefined || offset === 'Z') return true;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
  if (!m) return false;
  return Number(m[2]) <= 23 && Number(m[3]) <= 59;
}

// Round-trip validation for a bare "YYYY-MM-DD" value, interpreted as a
// UTC calendar date. Calendar validity is checked with pure arithmetic
// (isValidCalendarDate), never by round-tripping through Date.UTC/the
// multi-argument Date constructor -- both of those silently reinterpret a
// year in 0000-0099 as 1900-1999 (e.g. `Date.UTC(26, 5, 15)` resolves to
// 1926, not year 26), which would otherwise falsely reject (or, worse,
// silently misdate) every legitimate 4-digit year in that range. Once the
// components are independently confirmed valid, the actual Date object is
// built via the engine's ISO-8601 STRING parser instead (`new Date(str)`),
// which does not carry that same two-digit-year quirk and handles any
// 0000-9999 year literally.
function parseValidUtcDateOnly(value) {
  const m = DATE_ONLY_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isValidCalendarDate(year, month, day)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

// The exclusive start of the UTC calendar day immediately following the
// given one, as an ISO string -- computed with the same plain
// carry/rollover arithmetic daysInMonth() already uses (never
// Date.UTC(y, m, day + 1), which reintroduces the exact two-digit-year
// quirk parseValidUtcDateOnly's own string-based construction was written
// to avoid).
function nextUtcCalendarDayIso(year, month, day) {
  let y = year;
  let mo = month;
  let d = day + 1;
  if (d > daysInMonth(y, mo)) {
    d = 1;
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`;
}

// Strictly validates a full ISO-8601 date-time string's calendar, time and
// offset components with pure arithmetic/regex checks -- never relying on
// Date's own parsing to catch an invalid value, since `new Date(...)`
// silently rolls an impossible day forward (e.g. "2026-02-30T00:00:00.000Z"
// resolves to 2026-03-02, not Invalid Date) while still correctly
// rejecting some other invalid shapes (bad month, bad hour) as NaN -- an
// inconsistency that must not be relied upon. `requireOffset: true`
// additionally rejects a timestamp with no trailing Z/explicit numeric
// offset (the new dateToExclusive contract, which must be unambiguous);
// `requireOffset: false` preserves the legacy dateFrom/dateTo behavior of
// also accepting an offset-less timestamp (parsed, as before, in the
// server's local timezone by the final `new Date(value)` call).
function parseStrictIsoDateTime(value, { requireOffset }) {
  const m = ISO_DATETIME_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] !== undefined ? Number(m[6]) : 0;
  const offset = m[8];
  if (!isValidCalendarDate(year, month, day)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (requireOffset && offset === undefined) return null;
  if (!isValidOffset(offset)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// GET /api/v1/admin/forms — list + filter. formKey and status are exact
// matches.
//
// Date-range contract:
//   dateFrom        — inclusive lower bound ($gte on submittedAt). Accepts
//                      either a bare "YYYY-MM-DD" (interpreted as that UTC
//                      calendar day's own start) or a full ISO date-time
//                      string, offset optional (used exactly as given) --
//                      unchanged from before; this shape was never
//                      ambiguous, since an inclusive *start* boundary is
//                      correct either way. Both shapes are strictly
//                      calendar/time validated (see parseValidUtcDateOnly/
//                      parseStrictIsoDateTime above) -- an impossible date
//                      (Feb 30, Apr 31, Feb 29 in a non-leap year) or an
//                      out-of-range time/offset component is rejected with
//                      422, never silently normalized.
//   dateToExclusive  — NEW, preferred exclusive upper bound ($lt on
//                      submittedAt). Must be a COMPLETE, unambiguous ISO
//                      date-time with an explicit 'Z' or numeric timezone
//                      offset (a bare date or an offset-less timestamp is
//                      rejected with 422) -- the caller (Frontend/app/
//                      admin/forms/page.js) has already computed the
//                      correct exclusive start-of-next-local-day instant
//                      in its own browser timezone and always emits one in
//                      this exact shape; this must never add another day
//                      on top of it.
//   dateTo           — legacy, still accepted for backward compatibility.
//                      A bare "YYYY-MM-DD" is now corrected to mean the
//                      *entire* UTC calendar day (the old bug: it used to
//                      mean only that day's first instant, via $lte on a
//                      UTC-midnight Date, which is why a same-day
//                      dateFrom=dateTo range previously returned nothing).
//                      A full ISO date-time value's exact prior $lte
//                      semantics are preserved unchanged, including still
//                      accepting one with no offset (parsed in the
//                      server's local timezone, exactly as before) -- no
//                      new mandatory timezone requirement is imposed on
//                      this legacy parameter. Providing both `dateTo` and
//                      `dateToExclusive` together is rejected as an
//                      ambiguous, conflicting upper bound.
//
// Approved, intentional contract narrowing (Finding 2): the true original
// implementation (before any of this date-range work) accepted ANY string
// `new Date(...)` could parse -- RFC 2822, "MM/DD/YYYY", etc. -- with no
// calendar validation at all. This contract deliberately narrows that to
// exactly two accepted shapes: a bare "YYYY-MM-DD", or a full ISO-8601
// date-time (offset required only for dateToExclusive). A non-ISO format
// is rejected with 422, same as an impossible date or a malformed
// timestamp -- approved as a correctness improvement, not a regression,
// since no prior behavior ever relied on any other format.
//
// Maximum supported year boundary (Finding 1): legacy bare-date dateTo's
// computed "following calendar day" (see nextUtcCalendarDayIso below) is
// itself validated before use -- December 31st of year 9999 is a valid
// calendar date on its own, but its following day would require a 5-digit
// year (10000), which this feature does not support; that specific case
// is rejected with 422 rather than silently handing MongoDB an Invalid
// Date. Every other date, including 9999-12-30, is unaffected.
//
// Years 0000-0099: handled explicitly via pure calendar arithmetic and
// ISO-8601 STRING-based Date parsing throughout (see parseValidUtcDateOnly/
// nextUtcCalendarDayIso/parseStrictIsoDateTime) -- never Date.UTC(...)/the
// multi-argument Date constructor, both of which silently reinterpret a
// year in this range as 1900-1999.
//
// A reversed range (dateFrom after the effective upper bound) is not
// specially rejected -- MongoDB's own $gte/$lt range semantics already
// return zero matching documents for it, exactly as an empty filter
// intersection naturally would; no new validation rule is introduced for
// this case.
export async function listSubmissions(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const filter = {};
    const formKey = expectScalarQueryParam(req.query.formKey, 'formKey');
    if (formKey) filter.formKey = formKey;
    // Admin Forms application-category filter -- validated against a fixed
    // allowlist (never a caller-controlled regex/operator), same
    // expectScalarQueryParam() guard formKey already uses against an
    // array/operator-shaped query value. See formCategoryFilter.js for the
    // actual values.subject matching rules.
    const category = expectScalarQueryParam(req.query.category, 'category');
    if (category) {
      if (!CATEGORY_KEYS.includes(category)) {
        throw new ApiError(422, 'VALIDATION_ERROR', `category must be one of: ${CATEGORY_KEYS.join(', ')}.`);
      }
      Object.assign(filter, buildCategoryFilter(category));
    }
    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        throw new ApiError(422, 'VALIDATION_ERROR', `status must be one of: ${VALID_STATUSES.join(', ')}.`);
      }
      filter.status = req.query.status;
    }
    if (req.query.dateFrom || req.query.dateTo || req.query.dateToExclusive) {
      filter.submittedAt = {};

      if (req.query.dateFrom) {
        const fromStr = expectScalarQueryParam(req.query.dateFrom, 'dateFrom');
        let from;
        if (DATE_ONLY_RE.test(fromStr)) {
          from = parseValidUtcDateOnly(fromStr);
          if (!from) throw new ApiError(422, 'VALIDATION_ERROR', 'dateFrom is not a valid calendar date.');
        } else {
          from = parseStrictIsoDateTime(fromStr, { requireOffset: false });
          if (!from) throw new ApiError(422, 'VALIDATION_ERROR', 'dateFrom is not a valid date.');
        }
        filter.submittedAt.$gte = from;
      }

      if (req.query.dateTo && req.query.dateToExclusive) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Provide either dateTo or dateToExclusive, not both.');
      }

      if (req.query.dateToExclusive) {
        const exclStr = expectScalarQueryParam(req.query.dateToExclusive, 'dateToExclusive');
        const exclusive = parseStrictIsoDateTime(exclStr, { requireOffset: true });
        if (!exclusive) {
          throw new ApiError(
            422,
            'VALIDATION_ERROR',
            'dateToExclusive must be a complete, valid ISO date-time with an explicit Z or numeric timezone offset.'
          );
        }
        filter.submittedAt.$lt = exclusive;
      } else if (req.query.dateTo) {
        const toStr = expectScalarQueryParam(req.query.dateTo, 'dateTo');
        if (DATE_ONLY_RE.test(toStr)) {
          const m = DATE_ONLY_RE.exec(toStr);
          const year = Number(m[1]);
          const month = Number(m[2]);
          const day = Number(m[3]);
          if (!isValidCalendarDate(year, month, day)) throw new ApiError(422, 'VALIDATION_ERROR', 'dateTo is not a valid calendar date.');
          // December 31st of the maximum supported 4-digit year (9999) is
          // itself a perfectly valid calendar date, but its "following day"
          // would require a 5-digit year (10000), which this feature's ISO
          // contract does not support (and which the ISO-8601 STRING
          // parser nextUtcCalendarDayIso's result goes through cannot
          // parse without an explicit expanded-year '+' prefix) -- rather
          // than silently hand an Invalid Date to MongoDB, reject with a
          // clean 422. Every other year-end (including 9999-12-30, whose
          // following day is 9999-12-31, still 4 digits) is unaffected.
          const nextDay = new Date(nextUtcCalendarDayIso(year, month, day));
          if (Number.isNaN(nextDay.getTime())) {
            throw new ApiError(
              422,
              'VALIDATION_ERROR',
              "dateTo's following calendar day is outside the supported year range."
            );
          }
          filter.submittedAt.$lt = nextDay;
        } else {
          const to = parseStrictIsoDateTime(toStr, { requireOffset: false });
          if (!to) throw new ApiError(422, 'VALIDATION_ERROR', 'dateTo is not a valid date.');
          filter.submittedAt.$lte = to;
        }
      }
    }

    const [items, total] = await Promise.all([
      FormSubmissionModel.find(filter).sort({ submittedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      FormSubmissionModel.countDocuments(filter),
    ]);

    return sendSuccess(res, items, { meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/forms/:id
export async function getSubmission(req, res, next) {
  try {
    const doc = await FormSubmissionModel.findById(req.params.id).lean();
    if (!doc) throw new ApiError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/forms/:id — body { status?, note? }. `note`, if given,
// is appended (with actor + timestamp) rather than overwriting the existing
// notes field, so a submission keeps a running log across multiple admins
// without a schema change to a full array field.
export async function updateSubmission(req, res, next) {
  try {
    const { status, note } = req.body || {};

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      throw new ApiError(422, 'VALIDATION_ERROR', `status must be one of: ${VALID_STATUSES.join(', ')}.`, { status: 'Invalid status.' });
    }
    if (note !== undefined && (typeof note !== 'string' || !note.trim())) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'note must be a non-empty string.', { note: 'Invalid note.' });
    }
    if (status === undefined && note === undefined) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Provide status and/or note.');
    }

    const doc = await FormSubmissionModel.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');

    if (status !== undefined) {
      doc.status = status;
      doc.handledBy = req.user.email;
    }
    if (note !== undefined) {
      const line = `[${new Date().toISOString()} — ${req.user.email}] ${note.trim()}`;
      doc.notes = doc.notes ? `${doc.notes}\n${line}` : line;
    }
    await doc.save();

    // Two distinct, independently-firing audit actions rather than one
    // combined event — a request can change both at once, and each should
    // be separately identifiable by action name alone. Neither logs the
    // actual note text or form values (only that a note was added).
    if (status !== undefined) {
      await recordAudit({
        actor: actorOf(req),
        action: 'forms.status_changed',
        targetType: 'FormSubmission',
        targetId: doc._id,
        details: { status },
        req,
      });
    }
    if (note !== undefined) {
      await recordAudit({
        actor: actorOf(req),
        action: 'forms.note_added',
        targetType: 'FormSubmission',
        targetId: doc._id,
        req,
      });
    }
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}
