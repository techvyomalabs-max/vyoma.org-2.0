// Task 7M — regression coverage for forms.admin.controller.js (list/get/
// update real contact-form submissions). Previously had zero test coverage
// anywhere (confirmed by audit) — forms.notificationEscaping.test.js only
// covers HTML-escaping on the public submission path, never this admin
// surface, which is the only way staff ever see or action submitted PII.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';
import { FormSubmissionModel } from './formSubmission.model.js';

let env;
let adminRole; // seeded 'admin' role already has forms:read + forms:write
let readOnlyRole;
let noPermsRole;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  readOnlyRole = await RoleModel.create({ key: 'forms_read_only_role', name: 'Forms Read Only', permissions: ['forms:read'], mfaRequired: false });
  noPermsRole = await RoleModel.create({ key: 'no_forms_perms_role', name: 'No Forms Perms', permissions: ['content:read'], mfaRequired: false });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function adminToken(emailSuffix) {
  const user = await createTestUser({ email: `forms-admin-${emailSuffix}@example.test`, roleKey: 'admin' });
  return signAccessToken(user, adminRole);
}

async function listSubmissions(token, query = '') {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/forms${query}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function getSubmission(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/forms/${id}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function updateSubmission(token, id, payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/forms/${id}`, {
    method: 'PATCH',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

function submissionFixture(overrides = {}) {
  return {
    formKey: 'contact',
    values: { name: 'Test Submitter', email: 'submitter@example.test', message: 'Hello' },
    status: 'new',
    ...overrides,
  };
}

// --- RBAC ---

test('GET /admin/forms is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await listSubmissions(undefined);
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('GET /admin/forms is rejected with 403 for a role without forms:read', async () => {
  const user = await createTestUser({ email: 'forms-noperm-list@example.test', roleKey: 'no_forms_perms_role' });
  const token = signAccessToken(user, noPermsRole);
  const { res, body } = await listSubmissions(token);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('PATCH /admin/forms/:id is rejected with 403 for a role with forms:read but not forms:write', async () => {
  const doc = await FormSubmissionModel.create(submissionFixture());
  const user = await createTestUser({ email: 'forms-readonly-patch@example.test', roleKey: 'forms_read_only_role' });
  const token = signAccessToken(user, readOnlyRole);
  const { res, body } = await updateSubmission(token, doc._id, { status: 'handled' });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

// --- GET /admin/forms (list) ---

test('GET /admin/forms filters by formKey and status', async () => {
  const token = await adminToken('filter');
  await FormSubmissionModel.create(submissionFixture({ formKey: 'contact', status: 'new' }));
  await FormSubmissionModel.create(submissionFixture({ formKey: 'contact', status: 'handled' }));
  await FormSubmissionModel.create(submissionFixture({ formKey: 'newsletter', status: 'new' }));

  const { res, body } = await listSubmissions(token, '?formKey=contact&status=new');
  assert.equal(res.status, 200);
  assert.ok(body.data.every((s) => s.formKey === 'contact' && s.status === 'new'));
});

test('GET /admin/forms rejects an operator-shaped formKey query parameter (NoSQL injection attempt) with 422', async () => {
  const token = await adminToken('form-key-injection');
  const { res, body } = await listSubmissions(token, '?formKey[$ne]=null');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms rejects an unknown status value with 422', async () => {
  const token = await adminToken('bad-status');
  const { res } = await listSubmissions(token, '?status=not_a_real_status');
  assert.equal(res.status, 422);
});

test('GET /admin/forms rejects an invalid dateFrom with 422', async () => {
  const token = await adminToken('bad-date');
  const { res } = await listSubmissions(token, '?dateFrom=not-a-date');
  assert.equal(res.status, 422);
});

test('GET /admin/forms filters by dateFrom/dateTo (inclusive range) on submittedAt', async () => {
  const token = await adminToken('date-range');
  const inRange = await FormSubmissionModel.create(submissionFixture({ formKey: 'date-range-test' }));
  const outOfRange = await FormSubmissionModel.create(submissionFixture({ formKey: 'date-range-test' }));
  await FormSubmissionModel.collection.updateOne({ _id: inRange._id }, { $set: { submittedAt: new Date('2025-06-15') } });
  await FormSubmissionModel.collection.updateOne({ _id: outOfRange._id }, { $set: { submittedAt: new Date('2020-01-01') } });

  const { res, body } = await listSubmissions(token, '?formKey=date-range-test&dateFrom=2025-01-01&dateTo=2025-12-31');
  assert.equal(res.status, 200);
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(inRange._id)));
  assert.ok(!ids.includes(String(outOfRange._id)));
});

// --- dateToExclusive: the new, display-consistent date-range contract ---
// (Admin Forms "To Date" QA fix — a bare calendar day must include every
// submission on that day regardless of time-of-day, which the old
// dateTo=$lte-on-UTC-midnight behavior did not.)

test('GET /admin/forms: a same-day dateFrom/dateToExclusive window includes morning, afternoon and late-night submissions on that day', async () => {
  const token = await adminToken('same-day-window');
  const morning = await FormSubmissionModel.create(submissionFixture({ formKey: 'same-day-window-test' }));
  const afternoon = await FormSubmissionModel.create(submissionFixture({ formKey: 'same-day-window-test' }));
  const lateNight = await FormSubmissionModel.create(submissionFixture({ formKey: 'same-day-window-test' }));
  const prevDay = await FormSubmissionModel.create(submissionFixture({ formKey: 'same-day-window-test' }));
  const nextDay = await FormSubmissionModel.create(submissionFixture({ formKey: 'same-day-window-test' }));
  await FormSubmissionModel.collection.updateOne({ _id: morning._id }, { $set: { submittedAt: new Date('2026-06-15T00:00:00.000Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: afternoon._id }, { $set: { submittedAt: new Date('2026-06-15T13:45:00.000Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: lateNight._id }, { $set: { submittedAt: new Date('2026-06-15T23:59:59.999Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: prevDay._id }, { $set: { submittedAt: new Date('2026-06-14T23:59:59.999Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: nextDay._id }, { $set: { submittedAt: new Date('2026-06-16T00:00:00.000Z') } });

  const { res, body } = await listSubmissions(
    token,
    '?formKey=same-day-window-test&dateFrom=2026-06-15T00:00:00.000Z&dateToExclusive=2026-06-16T00:00:00.000Z'
  );
  assert.equal(res.status, 200);
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(morning._id)));
  assert.ok(ids.includes(String(afternoon._id)));
  assert.ok(ids.includes(String(lateNight._id)), 'the final millisecond before the exclusive boundary must be included');
  assert.ok(!ids.includes(String(prevDay._id)));
  assert.ok(!ids.includes(String(nextDay._id)), 'the exact exclusive boundary instant itself must be excluded');
});

test('GET /admin/forms: dateToExclusive excludes a submission at the exact boundary instant', async () => {
  const token = await adminToken('exclusive-boundary');
  const atBoundary = await FormSubmissionModel.create(submissionFixture({ formKey: 'exclusive-boundary-test' }));
  await FormSubmissionModel.collection.updateOne({ _id: atBoundary._id }, { $set: { submittedAt: new Date('2026-06-16T00:00:00.000Z') } });

  const { body } = await listSubmissions(token, '?formKey=exclusive-boundary-test&dateToExclusive=2026-06-16T00:00:00.000Z');
  assert.ok(!body.data.map((s) => s._id).includes(String(atBoundary._id)));
});

test('GET /admin/forms: dateFrom alone (no upper bound) returns everything from that instant onward', async () => {
  const token = await adminToken('from-only');
  const inRange = await FormSubmissionModel.create(submissionFixture({ formKey: 'from-only-test' }));
  const before = await FormSubmissionModel.create(submissionFixture({ formKey: 'from-only-test' }));
  await FormSubmissionModel.collection.updateOne({ _id: inRange._id }, { $set: { submittedAt: new Date('2026-06-15T00:00:00.000Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: before._id }, { $set: { submittedAt: new Date('2020-01-01T00:00:00.000Z') } });

  const { body } = await listSubmissions(token, '?formKey=from-only-test&dateFrom=2026-06-15T00:00:00.000Z');
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(inRange._id)));
  assert.ok(!ids.includes(String(before._id)));
});

test('GET /admin/forms: dateToExclusive alone (no lower bound) returns everything before that instant', async () => {
  const token = await adminToken('to-exclusive-only');
  const inRange = await FormSubmissionModel.create(submissionFixture({ formKey: 'to-exclusive-only-test' }));
  const after = await FormSubmissionModel.create(submissionFixture({ formKey: 'to-exclusive-only-test' }));
  await FormSubmissionModel.collection.updateOne({ _id: inRange._id }, { $set: { submittedAt: new Date('2020-01-01T00:00:00.000Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: after._id }, { $set: { submittedAt: new Date('2026-06-16T00:00:00.000Z') } });

  const { body } = await listSubmissions(token, '?formKey=to-exclusive-only-test&dateToExclusive=2026-06-16T00:00:00.000Z');
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(inRange._id)));
  assert.ok(!ids.includes(String(after._id)));
});

test('GET /admin/forms: a legacy bare-date dateTo (e.g. "2026-06-15") is corrected to include the ENTIRE UTC calendar day, not just its first instant', async () => {
  const token = await adminToken('legacy-date-only-dateto');
  const lateInDay = await FormSubmissionModel.create(submissionFixture({ formKey: 'legacy-date-only-test' }));
  const nextDay = await FormSubmissionModel.create(submissionFixture({ formKey: 'legacy-date-only-test' }));
  await FormSubmissionModel.collection.updateOne({ _id: lateInDay._id }, { $set: { submittedAt: new Date('2026-06-15T23:59:59.999Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: nextDay._id }, { $set: { submittedAt: new Date('2026-06-16T00:00:00.000Z') } });

  const { body } = await listSubmissions(token, '?formKey=legacy-date-only-test&dateTo=2026-06-15');
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(lateInDay._id)), 'this was the original bug: a late-in-day submission on the selected To Date was wrongly excluded');
  assert.ok(!ids.includes(String(nextDay._id)));
});

test('GET /admin/forms: a legacy full ISO date-time dateTo keeps its exact prior $lte (inclusive) semantics unchanged', async () => {
  const token = await adminToken('legacy-datetime-dateto');
  const atInstant = await FormSubmissionModel.create(submissionFixture({ formKey: 'legacy-datetime-test' }));
  const justAfter = await FormSubmissionModel.create(submissionFixture({ formKey: 'legacy-datetime-test' }));
  await FormSubmissionModel.collection.updateOne({ _id: atInstant._id }, { $set: { submittedAt: new Date('2026-06-15T12:00:00.000Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: justAfter._id }, { $set: { submittedAt: new Date('2026-06-15T12:00:00.001Z') } });

  const { body } = await listSubmissions(token, '?formKey=legacy-datetime-test&dateTo=2026-06-15T12:00:00.000Z');
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(atInstant._id)), 'a full ISO date-time dateTo must still be inclusive ($lte), exactly as before');
  assert.ok(!ids.includes(String(justAfter._id)));
});

test('GET /admin/forms: a reversed range (dateFrom after the effective upper bound) returns zero results via plain Mongo range semantics, with no special rejection', async () => {
  const token = await adminToken('reversed-range');
  await FormSubmissionModel.create(submissionFixture({ formKey: 'reversed-range-test' }));

  const { res, body } = await listSubmissions(
    token,
    '?formKey=reversed-range-test&dateFrom=2026-06-20T00:00:00.000Z&dateToExclusive=2026-06-15T00:00:00.000Z'
  );
  assert.equal(res.status, 200, 'a reversed range is not rejected as an error -- it is valid input that simply matches nothing');
  assert.equal(body.data.length, 0);
  assert.equal(body.meta.total, 0);
});

test('GET /admin/forms rejects dateTo and dateToExclusive supplied together with 422 (ambiguous conflicting upper bound)', async () => {
  const token = await adminToken('conflicting-upper-bound');
  const { res, body } = await listSubmissions(
    token,
    '?dateTo=2026-06-15&dateToExclusive=2026-06-16T00:00:00.000Z'
  );
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms rejects an impossible calendar date dateFrom (e.g. "2026-02-30") with 422, not a silent JS Date rollover into March', async () => {
  const token = await adminToken('impossible-datefrom');
  const { res, body } = await listSubmissions(token, '?dateFrom=2026-02-30');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms rejects an impossible calendar date dateTo (e.g. "2026-02-30") with 422', async () => {
  const token = await adminToken('impossible-dateto');
  const { res, body } = await listSubmissions(token, '?dateTo=2026-02-30');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms accepts a valid leap-day dateFrom ("2028-02-29") without error', async () => {
  const token = await adminToken('leap-day-datefrom');
  const { res } = await listSubmissions(token, '?dateFrom=2028-02-29');
  assert.equal(res.status, 200);
});

test('GET /admin/forms rejects an invalid dateToExclusive with 422', async () => {
  const token = await adminToken('bad-date-to-exclusive');
  const { res, body } = await listSubmissions(token, '?dateToExclusive=not-a-date');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

// --- Correction 1/2: strict calendar/time/offset validation, applied to
// dateFrom, legacy dateTo AND dateToExclusive, and the explicit-timezone
// requirement on dateToExclusive only ---------------------------------

test('GET /admin/forms rejects an impossible calendar date in dateToExclusive (e.g. "2026-02-30T00:00:00.000Z") with 422, not a silent JS Date rollover into March', async () => {
  const token = await adminToken('impossible-datetoexclusive');
  const { res, body } = await listSubmissions(token, '?dateToExclusive=2026-02-30T00:00:00.000Z');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms rejects April 31st (a month with only 30 days) in all three date parameters with 422', async () => {
  const fromResult = await listSubmissions(await adminToken('apr31-datefrom'), '?dateFrom=2026-04-31');
  assert.equal(fromResult.res.status, 422);

  const toResult = await listSubmissions(await adminToken('apr31-dateto'), '?dateTo=2026-04-31');
  assert.equal(toResult.res.status, 422);

  const toExclusiveResult = await listSubmissions(await adminToken('apr31-datetoexclusive'), '?dateToExclusive=2026-04-31T00:00:00.000Z');
  assert.equal(toExclusiveResult.res.status, 422);
});

test('GET /admin/forms rejects February 29th in a non-leap year (2026) in all three date parameters with 422', async () => {
  const fromResult = await listSubmissions(await adminToken('feb29-nonleap-datefrom'), '?dateFrom=2026-02-29');
  assert.equal(fromResult.res.status, 422);

  const toResult = await listSubmissions(await adminToken('feb29-nonleap-dateto'), '?dateTo=2026-02-29');
  assert.equal(toResult.res.status, 422);

  const toExclusiveResult = await listSubmissions(await adminToken('feb29-nonleap-datetoexclusive'), '?dateToExclusive=2026-02-29T00:00:00.000Z');
  assert.equal(toExclusiveResult.res.status, 422);
});

test('GET /admin/forms accepts February 29th in a genuine leap year (2028) in all three date parameters', async () => {
  const fromResult = await listSubmissions(await adminToken('feb29-leap-datefrom'), '?dateFrom=2028-02-29');
  assert.equal(fromResult.res.status, 200);

  const toResult = await listSubmissions(await adminToken('feb29-leap-dateto'), '?dateTo=2028-02-29');
  assert.equal(toResult.res.status, 200);

  const toExclusiveResult = await listSubmissions(await adminToken('feb29-leap-datetoexclusive'), '?dateToExclusive=2028-02-29T00:00:00.000Z');
  assert.equal(toExclusiveResult.res.status, 200);
});

test('GET /admin/forms rejects invalid month/day/time/offset components in a full ISO date-time dateFrom with 422', async () => {
  const invalidMonth = await listSubmissions(await adminToken('invalid-month'), '?dateFrom=2026-13-01T00:00:00.000Z');
  assert.equal(invalidMonth.res.status, 422);

  const invalidDay = await listSubmissions(await adminToken('invalid-day'), '?dateFrom=2026-06-32T00:00:00.000Z');
  assert.equal(invalidDay.res.status, 422);

  const invalidHour = await listSubmissions(await adminToken('invalid-hour'), '?dateFrom=2026-06-15T25:00:00.000Z');
  assert.equal(invalidHour.res.status, 422);

  const invalidMinute = await listSubmissions(await adminToken('invalid-minute'), '?dateFrom=2026-06-15T12:61:00.000Z');
  assert.equal(invalidMinute.res.status, 422);

  const invalidSecond = await listSubmissions(await adminToken('invalid-second'), '?dateFrom=2026-06-15T12:00:61.000Z');
  assert.equal(invalidSecond.res.status, 422);

  // '+' is percent-encoded as %2B -- an unescaped '+' in a query string is
  // conventionally decoded back to a space by Express's query parser, which
  // would make these exercise a generic regex-mismatch instead of the
  // intended offset-range check (hour > 23 / minute > 59 in isValidOffset).
  const invalidOffset = await listSubmissions(await adminToken('invalid-offset'), '?dateFrom=2026-06-15T12:00:00%2B25:00');
  assert.equal(invalidOffset.res.status, 422);

  const malformedOffset = await listSubmissions(await adminToken('malformed-offset'), '?dateFrom=2026-06-15T12:00:00%2B99:99');
  assert.equal(malformedOffset.res.status, 422);
});

test('GET /admin/forms rejects a bare "YYYY-MM-DD" dateToExclusive with 422 -- it must be a complete date-time, never a date-only value', async () => {
  const token = await adminToken('bare-date-datetoexclusive');
  const { res, body } = await listSubmissions(token, '?dateToExclusive=2026-06-16');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms rejects a timezone-less (no Z, no offset) dateToExclusive with 422 -- it must be unambiguous', async () => {
  const token = await adminToken('tz-less-datetoexclusive');
  const { res, body } = await listSubmissions(token, '?dateToExclusive=2026-06-16T00:00:00.000');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms accepts a dateToExclusive with an explicit numeric offset (not just Z), and applies it correctly as the real UTC instant', async () => {
  const token = await adminToken('offset-datetoexclusive');
  // 2026-06-16T05:30:00+05:30 is the exact same instant as 2026-06-16T00:00:00Z.
  const atThatInstant = await FormSubmissionModel.create(submissionFixture({ formKey: 'offset-datetoexclusive-test' }));
  const justAfter = await FormSubmissionModel.create(submissionFixture({ formKey: 'offset-datetoexclusive-test' }));
  await FormSubmissionModel.collection.updateOne({ _id: atThatInstant._id }, { $set: { submittedAt: new Date('2026-06-15T23:59:59.999Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: justAfter._id }, { $set: { submittedAt: new Date('2026-06-16T00:00:00.000Z') } });

  const { res, body } = await listSubmissions(token, '?formKey=offset-datetoexclusive-test&dateToExclusive=2026-06-16T05:30:00%2B05:30');
  assert.equal(res.status, 200);
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(atThatInstant._id)));
  assert.ok(!ids.includes(String(justAfter._id)), 'the +05:30 offset must be correctly applied, resolving to the same instant as 2026-06-16T00:00:00Z');
});

test('GET /admin/forms: legacy dateFrom/dateTo full ISO date-time values with NO offset are still accepted (no new mandatory timezone requirement on legacy parameters)', async () => {
  const fromResult = await listSubmissions(await adminToken('legacy-tz-less-datefrom'), '?dateFrom=2026-06-15T00:00:00.000');
  assert.equal(fromResult.res.status, 200, 'dateFrom must not newly require an explicit offset -- only dateToExclusive does');

  const toResult = await listSubmissions(await adminToken('legacy-tz-less-dateto'), '?dateTo=2026-06-15T23:59:59.999');
  assert.equal(toResult.res.status, 200, 'legacy dateTo must not newly require an explicit offset either');
});

test('GET /admin/forms: a 4-digit year in 0000-0099 (e.g. "0026") is accepted literally, never silently reinterpreted as 1900-1999', async () => {
  const token = await adminToken('year-0026');
  const { res } = await listSubmissions(token, '?dateFrom=0026-06-15');
  assert.equal(res.status, 200, 'year 26 must be accepted on its own terms, not rejected due to a false 1926 round-trip mismatch');
});

test('GET /admin/forms: year 0000 correctly follows the proleptic Gregorian leap-year rule (0000 is a leap year, since 0 % 400 === 0) -- February 29th is valid', async () => {
  const token = await adminToken('year-0000-leap');
  const { res } = await listSubmissions(token, '?dateFrom=0000-02-29');
  assert.equal(res.status, 200);
});

test('GET /admin/forms: year 0001 is correctly NOT a leap year -- February 29th is rejected with 422, confirming leap-year arithmetic is correct even for very small years (independent of the 1900-shift quirk)', async () => {
  const token = await adminToken('year-0001-nonleap');
  const { res, body } = await listSubmissions(token, '?dateFrom=0001-02-29');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

// --- Finding 1: maximum supported year boundary (legacy bare-date dateTo's
// computed "following day" must never silently become an Invalid Date) ---

test('GET /admin/forms: legacy bare-date dateTo="9999-12-30" (one day before the maximum boundary) is accepted -- its following day, 9999-12-31, is still a representable 4-digit year', async () => {
  const token = await adminToken('year-9999-12-30');
  const { res } = await listSubmissions(token, '?dateTo=9999-12-30');
  assert.equal(res.status, 200, 'this is an ordinary, fully-supported date -- no unnecessary blanket cutoff before the real boundary');
});

test('GET /admin/forms: legacy bare-date dateTo="9999-12-31" (the exact maximum boundary) is rejected with a clean 422, never a silent Invalid Date passed to MongoDB', async () => {
  const token = await adminToken('year-9999-12-31');
  const { res, body } = await listSubmissions(token, '?dateTo=9999-12-31');
  assert.equal(res.status, 422, 'its "following day" would require a 5-digit year (10000), which this feature does not support');
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms: dateFrom="9999-12-31" (the maximum representable year itself, no day-after computation involved) is still accepted -- the boundary restriction applies only to dateTo\'s computed next-day rollover', async () => {
  const token = await adminToken('year-9999-datefrom');
  const { res } = await listSubmissions(token, '?dateFrom=9999-12-31');
  assert.equal(res.status, 200);
});

// --- Finding 2: strict ISO-only date acceptance is an approved, intentional
// contract narrowing relative to the true original implementation (which
// accepted any string `new Date()` could parse, with no calendar
// validation at all) -----------------------------------------------------

test('GET /admin/forms: a non-ISO date format (MM/DD/YYYY) is rejected with 422 for dateFrom, dateTo and dateToExclusive -- intentional, approved contract narrowing (Finding 2)', async () => {
  const fromResult = await listSubmissions(await adminToken('nonISO-slash-datefrom'), '?dateFrom=06/15/2026');
  assert.equal(fromResult.res.status, 422);

  const toResult = await listSubmissions(await adminToken('nonISO-slash-dateto'), '?dateTo=06/15/2026');
  assert.equal(toResult.res.status, 422);

  const toExclusiveResult = await listSubmissions(await adminToken('nonISO-slash-datetoexclusive'), '?dateToExclusive=06%2F15%2F2026');
  assert.equal(toExclusiveResult.res.status, 422);
});

test('GET /admin/forms: an RFC 2822 date string is rejected with 422 for dateFrom -- intentional, approved contract narrowing (Finding 2)', async () => {
  const token = await adminToken('nonISO-rfc2822');
  const { res } = await listSubmissions(token, '?dateFrom=Mon%2C%2015%20Jun%202026%2012%3A00%3A00%20GMT');
  assert.equal(res.status, 422);
});

test('GET /admin/forms: supported ISO formats continue to be accepted -- bare date, full Z timestamp, and (legacy only) an offset-less timestamp', async () => {
  const bareDate = await listSubmissions(await adminToken('supported-bare-date'), '?dateFrom=2026-06-15');
  assert.equal(bareDate.res.status, 200);

  const fullZ = await listSubmissions(await adminToken('supported-full-z'), '?dateFrom=2026-06-15T12:00:00.000Z');
  assert.equal(fullZ.res.status, 200);

  const legacyOffsetLess = await listSubmissions(await adminToken('supported-legacy-offsetless'), '?dateTo=2026-06-15T23:59:59.999');
  assert.equal(legacyOffsetLess.res.status, 200);
});

test('GET /admin/forms rejects an operator-shaped dateFrom/dateTo/dateToExclusive query parameter (NoSQL injection attempt) with 422', async () => {
  const token = await adminToken('date-injection');
  const fromInjection = await listSubmissions(token, '?dateFrom[$ne]=null');
  assert.equal(fromInjection.res.status, 422);
  assert.equal(fromInjection.body.code, 'VALIDATION_ERROR');

  const toInjection = await listSubmissions(token, '?dateTo[$gt]=');
  assert.equal(toInjection.res.status, 422);
  assert.equal(toInjection.body.code, 'VALIDATION_ERROR');

  const toExclusiveInjection = await listSubmissions(token, '?dateToExclusive[$gt]=');
  assert.equal(toExclusiveInjection.res.status, 422);
  assert.equal(toExclusiveInjection.body.code, 'VALIDATION_ERROR');
});

test('GET /admin/forms: dateToExclusive combined with category/formKey/status filters narrows results AND keeps an accurate total count', async () => {
  const token = await adminToken('combined-date-exclusive');
  const matching = await FormSubmissionModel.create(
    submissionFixture({ formKey: 'combined-date-exclusive-test', status: 'new' })
  );
  const wrongStatus = await FormSubmissionModel.create(
    submissionFixture({ formKey: 'combined-date-exclusive-test', status: 'handled' })
  );
  const outOfWindow = await FormSubmissionModel.create(
    submissionFixture({ formKey: 'combined-date-exclusive-test', status: 'new' })
  );
  await FormSubmissionModel.collection.updateOne({ _id: matching._id }, { $set: { submittedAt: new Date('2026-06-15T10:00:00.000Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: wrongStatus._id }, { $set: { submittedAt: new Date('2026-06-15T10:00:00.000Z') } });
  await FormSubmissionModel.collection.updateOne({ _id: outOfWindow._id }, { $set: { submittedAt: new Date('2026-06-16T00:00:00.000Z') } });

  const { res, body } = await listSubmissions(
    token,
    '?formKey=combined-date-exclusive-test&status=new&dateFrom=2026-06-15T00:00:00.000Z&dateToExclusive=2026-06-16T00:00:00.000Z'
  );
  assert.equal(res.status, 200);
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(matching._id)));
  assert.ok(!ids.includes(String(wrongStatus._id)));
  assert.ok(!ids.includes(String(outOfWindow._id)));
  assert.equal(body.meta.total, 1);
});

test('GET /admin/forms supports pagination', async () => {
  const token = await adminToken('paginate');
  for (let i = 0; i < 3; i += 1) await FormSubmissionModel.create(submissionFixture({ formKey: 'paginate-test' }));
  const { res, body } = await listSubmissions(token, '?formKey=paginate-test&page=1&limit=2');
  assert.equal(res.status, 200);
  assert.equal(body.meta.limit, 2);
  assert.equal(body.data.length, 2);
});

// Real, direct confirmation of the existing (unmodified) backend pagination
// at the exact boundary sizes the new Admin Forms pagination UI now depends
// on for its own "Showing X–Y of Z" math and Previous/Next disabling --
// genuine query execution, not a mock, against a real disposable database.
test('GET /admin/forms with 51 records at the default limit (50): page 1 returns 50 with an accurate total of 51, page 2 returns the 1 remaining record', async () => {
  const token = await adminToken('paginate-51');
  for (let i = 0; i < 51; i += 1) await FormSubmissionModel.create(submissionFixture({ formKey: 'paginate-51-test' }));

  const page1 = await listSubmissions(token, '?formKey=paginate-51-test&page=1&limit=50');
  assert.equal(page1.res.status, 200);
  assert.equal(page1.body.data.length, 50);
  assert.equal(page1.body.meta.total, 51);
  assert.equal(page1.body.meta.page, 1);

  const page2 = await listSubmissions(token, '?formKey=paginate-51-test&page=2&limit=50');
  assert.equal(page2.res.status, 200);
  assert.equal(page2.body.data.length, 1);
  assert.equal(page2.body.meta.total, 51);
});

test('GET /admin/forms with exactly 125 records: 3 full/partial pages (50/50/25), each with the same accurate total', async () => {
  const token = await adminToken('paginate-125');
  for (let i = 0; i < 125; i += 1) await FormSubmissionModel.create(submissionFixture({ formKey: 'paginate-125-test' }));

  const page1 = await listSubmissions(token, '?formKey=paginate-125-test&page=1&limit=50');
  const page2 = await listSubmissions(token, '?formKey=paginate-125-test&page=2&limit=50');
  const page3 = await listSubmissions(token, '?formKey=paginate-125-test&page=3&limit=50');

  assert.equal(page1.body.data.length, 50);
  assert.equal(page2.body.data.length, 50);
  assert.equal(page3.body.data.length, 25);
  for (const { body } of [page1, page2, page3]) {
    assert.equal(body.meta.total, 125);
    assert.equal(body.meta.limit, 50);
  }
  // No overlap and no gap across the three pages.
  const allIds = [...page1.body.data, ...page2.body.data, ...page3.body.data].map((s) => s._id);
  assert.equal(new Set(allIds).size, 125);
});

test('GET /admin/forms with an out-of-range page (beyond the last real page) returns an empty data array with the accurate total still reported, never an error', async () => {
  const token = await adminToken('paginate-out-of-range');
  await FormSubmissionModel.create(submissionFixture({ formKey: 'paginate-oor-test' }));

  const { res, body } = await listSubmissions(token, '?formKey=paginate-oor-test&page=99&limit=50');
  assert.equal(res.status, 200);
  assert.equal(body.data.length, 0);
  assert.equal(body.meta.total, 1);
});

test('category, formKey, status and date filters are all preserved across a page/limit change -- the same filtered result set, just a different slice of it', async () => {
  const token = await adminToken('paginate-filter-preserved');
  for (let i = 0; i < 3; i += 1) {
    await FormSubmissionModel.create(
      submissionFixture({ formKey: 'paginate-filter-test', status: 'new', values: { name: 'N', email: 'n@example.test', message: 'm', subject: 'Internships - Role' } })
    );
  }
  await FormSubmissionModel.create(submissionFixture({ formKey: 'paginate-filter-test', status: 'handled', values: { name: 'N', email: 'n@example.test', message: 'm', subject: 'Internships - Role' } }));

  const page1 = await listSubmissions(token, '?category=internships&formKey=paginate-filter-test&status=new&page=1&limit=2');
  const page2 = await listSubmissions(token, '?category=internships&formKey=paginate-filter-test&status=new&page=2&limit=2');
  assert.equal(page1.body.meta.total, 3, 'total must reflect the filtered set (status=new only), not all 4 records');
  assert.equal(page1.body.data.length, 2);
  assert.equal(page2.body.data.length, 1);
});

// --- GET /admin/forms?category=... (real HTTP requests against a real,
// disposable mongodb-memory-server instance -- genuine query execution,
// never a mocked/stubbed filter) ---

function subjectFixture(subject, overrides = {}) {
  return submissionFixture({ formKey: `category-test-${Math.random().toString(36).slice(2)}`, values: { name: 'N', email: 'n@example.test', message: 'm', subject }, ...overrides });
}

test('category=internships matches both the general "Internships" subject and any role-specific "Internships - <role>" subject, never an unrelated one', async () => {
  const token = await adminToken('cat-internships');
  const general = await FormSubmissionModel.create(subjectFixture('Internships'));
  const dev = await FormSubmissionModel.create(subjectFixture('Internships - Developer'));
  const seniorDev = await FormSubmissionModel.create(subjectFixture('Internships - Senior Developer'));
  // Arbitrary, never-hardcoded future CMS role -- proves the regex is
  // genuinely generic, not a lookup table of known role names.
  const futureRole = await FormSubmissionModel.create(subjectFixture('Internships - Data Analyst Intern'));
  const unrelated = await FormSubmissionModel.create(subjectFixture('Careers'));

  const { res, body } = await listSubmissions(token, '?category=internships');
  assert.equal(res.status, 200);
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(general._id)));
  assert.ok(ids.includes(String(dev._id)));
  assert.ok(ids.includes(String(seniorDev._id)));
  assert.ok(ids.includes(String(futureRole._id)));
  assert.ok(!ids.includes(String(unrelated._id)));
});

test('category=careers matches both the general "Careers" subject and any role-specific "Careers: <role>" subject (distinct ": " separator from Internships)', async () => {
  const token = await adminToken('cat-careers');
  const general = await FormSubmissionModel.create(subjectFixture('Careers'));
  const role = await FormSubmissionModel.create(subjectFixture('Careers: Backend Engineer'));
  const unrelated = await FormSubmissionModel.create(subjectFixture('Internships - Developer'));

  const { res, body } = await listSubmissions(token, '?category=careers');
  assert.equal(res.status, 200);
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(general._id)));
  assert.ok(ids.includes(String(role._id)));
  assert.ok(!ids.includes(String(unrelated._id)));
});

test('an empty or whitespace-only Internships/Careers role falls under Other/Unknown, not the Internships/Careers category (role must contain at least one non-whitespace character)', async () => {
  const token = await adminToken('cat-whitespace-role');
  const emptyInternship = await FormSubmissionModel.create(subjectFixture('Internships - '));
  const whitespaceInternship = await FormSubmissionModel.create(subjectFixture('Internships -    '));
  const emptyCareer = await FormSubmissionModel.create(subjectFixture('Careers: '));
  const whitespaceCareer = await FormSubmissionModel.create(subjectFixture('Careers:    '));
  const realInternship = await FormSubmissionModel.create(subjectFixture('Internships - Developer'));

  const internshipsResult = await listSubmissions(token, '?category=internships');
  const careersResult = await listSubmissions(token, '?category=careers');
  const otherResult = await listSubmissions(token, '?category=other-unknown');

  const internshipIds = internshipsResult.body.data.map((s) => s._id);
  const careerIds = careersResult.body.data.map((s) => s._id);
  const otherIds = otherResult.body.data.map((s) => s._id);

  assert.ok(!internshipIds.includes(String(emptyInternship._id)));
  assert.ok(!internshipIds.includes(String(whitespaceInternship._id)));
  assert.ok(internshipIds.includes(String(realInternship._id)));
  assert.ok(!careerIds.includes(String(emptyCareer._id)));
  assert.ok(!careerIds.includes(String(whitespaceCareer._id)));

  assert.ok(otherIds.includes(String(emptyInternship._id)));
  assert.ok(otherIds.includes(String(whitespaceInternship._id)));
  assert.ok(otherIds.includes(String(emptyCareer._id)));
  assert.ok(otherIds.includes(String(whitespaceCareer._id)));
});

test('a general subject with a trailing LF, CRLF, or trailing space is excluded from Internships/Careers and correctly classified under Other/Unknown (MongoDB\'s $regexMatch is PCRE-based: a bare "$" anchor matches before a single trailing "\\n" even without the "m" flag -- this is why the pattern uses "\\z" instead)', async () => {
  const token = await adminToken('cat-trailing-newline');
  const trailingLF = await FormSubmissionModel.create(subjectFixture('Internships\n'));
  const trailingCRLF = await FormSubmissionModel.create(subjectFixture('Internships\r\n'));
  const trailingSpace = await FormSubmissionModel.create(subjectFixture('Internships '));
  const careersTrailingLF = await FormSubmissionModel.create(subjectFixture('Careers\n'));
  const exactInternships = await FormSubmissionModel.create(subjectFixture('Internships'));
  const exactCareers = await FormSubmissionModel.create(subjectFixture('Careers'));

  const internshipsResult = await listSubmissions(token, '?category=internships');
  const careersResult = await listSubmissions(token, '?category=careers');
  const otherResult = await listSubmissions(token, '?category=other-unknown');

  const internshipIds = internshipsResult.body.data.map((s) => s._id);
  const careerIds = careersResult.body.data.map((s) => s._id);
  const otherIds = otherResult.body.data.map((s) => s._id);

  for (const doc of [trailingLF, trailingCRLF, trailingSpace]) {
    assert.ok(!internshipIds.includes(String(doc._id)), `${doc.values.subject.trim()} (trailing variant) must not match Internships`);
    assert.ok(otherIds.includes(String(doc._id)), `${doc.values.subject.trim()} (trailing variant) must land in Other/Unknown`);
  }
  assert.ok(!careerIds.includes(String(careersTrailingLF._id)));
  assert.ok(otherIds.includes(String(careersTrailingLF._id)));

  // The exact, clean general subjects must still match correctly -- this
  // correction must not have broken the legitimate case.
  assert.ok(internshipIds.includes(String(exactInternships._id)));
  assert.ok(careerIds.includes(String(exactCareers._id)));
});

test('a valid multiline Internship/Careers role (an embedded literal newline) still matches its category correctly', async () => {
  const token = await adminToken('cat-multiline-role');
  const multilineInternship = await FormSubmissionModel.create(subjectFixture('Internships - Full Stack\nDeveloper'));
  const multilineCareer = await FormSubmissionModel.create(subjectFixture('Careers: Backend\nEngineer'));

  const internshipsResult = await listSubmissions(token, '?category=internships');
  const careersResult = await listSubmissions(token, '?category=careers');

  assert.ok(internshipsResult.body.data.map((s) => s._id).includes(String(multilineInternship._id)));
  assert.ok(careersResult.body.data.map((s) => s._id).includes(String(multilineCareer._id)));
});

test('an Internship role with special characters matches correctly, and is never mistaken for an unrelated category', async () => {
  const token = await adminToken('cat-special-chars-role');
  const specialRole = await FormSubmissionModel.create(subjectFixture('Internships - Data & Analytics (Remote) — 2027'));

  const { body } = await listSubmissions(token, '?category=internships');
  assert.ok(body.data.map((s) => s._id).includes(String(specialRole._id)));
});

test('boolean and object-shaped subjects are safely excluded from Internships/Careers (regex) categories and correctly land in Other/Unknown', async () => {
  const token = await adminToken('cat-bool-object-subject');
  const booleanSubject = await FormSubmissionModel.create(subjectFixture(true));
  const objectSubject = await FormSubmissionModel.create(subjectFixture({ nested: 'value' }));

  const internshipsResult = await listSubmissions(token, '?category=internships');
  const careersResult = await listSubmissions(token, '?category=careers');
  const otherResult = await listSubmissions(token, '?category=other-unknown');

  for (const doc of [booleanSubject, objectSubject]) {
    assert.ok(!internshipsResult.body.data.map((s) => s._id).includes(String(doc._id)));
    assert.ok(!careersResult.body.data.map((s) => s._id).includes(String(doc._id)));
    assert.ok(otherResult.body.data.map((s) => s._id).includes(String(doc._id)));
  }
});

for (const [category, literal] of [
  ['volunteering', 'Volunteering'],
  ['institutional-partnership', 'Institutional partnership'],
  ['csr-partnership', 'CSR partnership'],
  ['press-media', 'Press & media'],
  ['testimonial-submission', 'Testimonial submission'],
  ['corpus-fund', 'Corpus fund'],
  ['general-inquiry', 'General inquiry'],
]) {
  test(`category=${category} matches exactly "${literal}" and excludes every other known subject`, async () => {
    const token = await adminToken(`cat-${category}`);
    const match = await FormSubmissionModel.create(subjectFixture(literal));
    const other = await FormSubmissionModel.create(subjectFixture('Internships'));

    const { res, body } = await listSubmissions(token, `?category=${category}`);
    assert.equal(res.status, 200);
    const ids = body.data.map((s) => s._id);
    assert.ok(ids.includes(String(match._id)));
    assert.ok(!ids.includes(String(other._id)));
  });
}

test('category=other-unknown includes missing, null, empty, non-string, and unrecognized subjects -- and excludes every known category', async () => {
  const token = await adminToken('cat-other-unknown');
  const missing = await FormSubmissionModel.create(submissionFixture({ values: { name: 'N', email: 'n@example.test', message: 'm' } })); // no subject key at all
  const nullSubject = await FormSubmissionModel.create(subjectFixture(null));
  const emptySubject = await FormSubmissionModel.create(subjectFixture(''));
  const numericSubject = await FormSubmissionModel.create(subjectFixture(42));
  // Mongoose/Mongo array-matching semantics: a Mixed field holding an array
  // containing a known literal as one element must NOT be treated as a
  // match for that category -- it must land in Other/Unknown instead.
  const arraySubject = await FormSubmissionModel.create(subjectFixture(['Careers']));
  const unrecognizedString = await FormSubmissionModel.create(subjectFixture('Something Nobody Approved'));
  const known = await FormSubmissionModel.create(subjectFixture('General inquiry'));

  const { res, body } = await listSubmissions(token, '?category=other-unknown');
  assert.equal(res.status, 200);
  const ids = body.data.map((s) => s._id);
  for (const doc of [missing, nullSubject, emptySubject, numericSubject, arraySubject, unrecognizedString]) {
    assert.ok(ids.includes(String(doc._id)), `expected ${doc._id} in Other/Unknown`);
  }
  assert.ok(!ids.includes(String(known._id)), 'a recognized category must never also appear under Other/Unknown');
});

test('category=careers does NOT match a submission whose subject is an array containing "Careers" as an element (MongoDB array-match semantics guarded against)', async () => {
  const token = await adminToken('cat-array-guard');
  const arraySubmission = await FormSubmissionModel.create(subjectFixture(['Careers', 'something else']));

  const { res, body } = await listSubmissions(token, '?category=careers');
  assert.equal(res.status, 200);
  assert.ok(!body.data.map((s) => s._id).includes(String(arraySubmission._id)));
});

test('an unrecognized category value is rejected with 422, same validation-error response shape as an invalid status', async () => {
  const token = await adminToken('cat-invalid');
  const { res, body } = await listSubmissions(token, '?category=not_a_real_category');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('an operator-shaped category query parameter (NoSQL injection attempt) is rejected with 422, via the same expectScalarQueryParam guard formKey uses', async () => {
  const token = await adminToken('cat-injection');
  const { res, body } = await listSubmissions(token, '?category[$ne]=null');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('an array-shaped category query parameter (?category=a&category=b) is rejected with 422', async () => {
  const token = await adminToken('cat-array-param');
  const { res, body } = await listSubmissions(token, '?category=internships&category=careers');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('category combines correctly with formKey, status and date filters -- the same complete filter narrows results AND produces an accurate total count', async () => {
  const token = await adminToken('cat-combined');
  const matching = await FormSubmissionModel.create(
    subjectFixture('Internships - Combined Test Role', { formKey: 'combined-category-test', status: 'new' })
  );
  const wrongStatus = await FormSubmissionModel.create(
    subjectFixture('Internships - Combined Test Role', { formKey: 'combined-category-test', status: 'handled' })
  );
  const wrongFormKey = await FormSubmissionModel.create(subjectFixture('Internships', { formKey: 'other-form-key', status: 'new' }));
  await FormSubmissionModel.collection.updateMany(
    { _id: { $in: [matching._id, wrongStatus._id, wrongFormKey._id] } },
    { $set: { submittedAt: new Date('2025-06-15') } }
  );

  const { res, body } = await listSubmissions(
    token,
    '?category=internships&formKey=combined-category-test&status=new&dateFrom=2025-01-01&dateTo=2025-12-31'
  );
  assert.equal(res.status, 200);
  const ids = body.data.map((s) => s._id);
  assert.ok(ids.includes(String(matching._id)));
  assert.ok(!ids.includes(String(wrongStatus._id)));
  assert.ok(!ids.includes(String(wrongFormKey._id)));
  // meta.total must reflect the SAME combined filter, not just formKey/date --
  // proves list and count use one identical filter object, not two that
  // could drift apart.
  assert.equal(body.meta.total, 1);
});

test('GET /admin/forms behaves exactly as before when category is omitted (pre-existing formKey/status/date behavior and permissions are unaffected)', async () => {
  const token = await adminToken('cat-omitted');
  await FormSubmissionModel.create(subjectFixture('Internships', { formKey: 'no-category-param-test' }));
  await FormSubmissionModel.create(subjectFixture('Careers', { formKey: 'no-category-param-test' }));

  const { res, body } = await listSubmissions(token, '?formKey=no-category-param-test');
  assert.equal(res.status, 200);
  assert.equal(body.data.length, 2, 'omitting category must return every matching record, exactly as before this feature existed');
});

// --- GET /admin/forms/:id ---

test('GET /admin/forms/:id returns 404 for a nonexistent id', async () => {
  const token = await adminToken('404');
  const { res, body } = await getSubmission(token, '507f1f77bcf86cd799439011');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'SUBMISSION_NOT_FOUND');
});

test('GET /admin/forms/:id returns the full submission, including values', async () => {
  const token = await adminToken('get-real');
  const doc = await FormSubmissionModel.create(submissionFixture({ values: { name: 'Jane', email: 'jane@example.test', message: 'Real message' } }));
  const { res, body } = await getSubmission(token, doc._id);
  assert.equal(res.status, 200);
  assert.equal(body.data.values.message, 'Real message');
});

// --- PATCH /admin/forms/:id ---

test('PATCH /admin/forms/:id rejects an invalid status value with 422', async () => {
  const token = await adminToken('patch-bad-status');
  const doc = await FormSubmissionModel.create(submissionFixture());
  const { res, body } = await updateSubmission(token, doc._id, { status: 'not_a_real_status' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.status);
});

test('PATCH /admin/forms/:id rejects an empty/whitespace-only note with 422', async () => {
  const token = await adminToken('patch-empty-note');
  const doc = await FormSubmissionModel.create(submissionFixture());
  const { res, body } = await updateSubmission(token, doc._id, { note: '   ' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.note);
});

test('PATCH /admin/forms/:id rejects a request with neither status nor note with 422', async () => {
  const token = await adminToken('patch-empty-body');
  const doc = await FormSubmissionModel.create(submissionFixture());
  const { res, body } = await updateSubmission(token, doc._id, {});
  assert.equal(res.status, 422);
});

test('PATCH /admin/forms/:id returns 404 for a nonexistent id', async () => {
  const token = await adminToken('patch-404');
  const { res, body } = await updateSubmission(token, '507f1f77bcf86cd799439011', { status: 'handled' });
  assert.equal(res.status, 404);
  assert.equal(body.code, 'SUBMISSION_NOT_FOUND');
});

test('PATCH /admin/forms/:id updates status and records handledBy as the acting admin\'s email', async () => {
  const user = await createTestUser({ email: 'forms-handled-by@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const doc = await FormSubmissionModel.create(submissionFixture());

  const { res, body } = await updateSubmission(token, doc._id, { status: 'handled' });
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'handled');
  assert.equal(body.data.handledBy, user.email);
});

test('PATCH /admin/forms/:id appends a note (with actor + timestamp) rather than overwriting prior notes', async () => {
  const user = await createTestUser({ email: 'forms-note-append@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const doc = await FormSubmissionModel.create(submissionFixture());

  const first = await updateSubmission(token, doc._id, { note: 'First note' });
  assert.equal(first.res.status, 200);
  assert.match(first.body.data.notes, /First note/);
  assert.match(first.body.data.notes, new RegExp(user.email));

  const second = await updateSubmission(token, doc._id, { note: 'Second note' });
  assert.equal(second.res.status, 200);
  assert.match(second.body.data.notes, /First note/, 'appending a second note must not erase the first');
  assert.match(second.body.data.notes, /Second note/);
});

test('PATCH /admin/forms/:id with both status and note changes both, and records TWO separate audit log entries (one per action)', async () => {
  const user = await createTestUser({ email: 'forms-audit-combined@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const doc = await FormSubmissionModel.create(submissionFixture());
  const beforeStatus = await AuditLogModel.countDocuments({ action: 'forms.status_changed' });
  const beforeNote = await AuditLogModel.countDocuments({ action: 'forms.note_added' });

  const { res, body } = await updateSubmission(token, doc._id, { status: 'handled', note: 'Combined update note' });
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'handled');
  assert.match(body.data.notes, /Combined update note/);

  const statusLogs = await AuditLogModel.find({ action: 'forms.status_changed' }).sort({ createdAt: -1 });
  const noteLogs = await AuditLogModel.find({ action: 'forms.note_added' }).sort({ createdAt: -1 });
  assert.equal(statusLogs.length, beforeStatus + 1);
  assert.equal(noteLogs.length, beforeNote + 1);
  assert.equal(statusLogs[0].actorEmail, user.email);
  assert.equal(noteLogs[0].actorEmail, user.email);
  // Neither audit entry logs the actual note text or form values -- only that a note was added.
  assert.equal(JSON.stringify(noteLogs[0].details || {}).includes('Combined update note'), false);
});

test('PATCH /admin/forms/:id updating only status does NOT record a forms.note_added entry', async () => {
  const user = await createTestUser({ email: 'forms-audit-status-only@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const doc = await FormSubmissionModel.create(submissionFixture());
  const beforeNote = await AuditLogModel.countDocuments({ action: 'forms.note_added' });

  const { res } = await updateSubmission(token, doc._id, { status: 'handled' });
  assert.equal(res.status, 200);

  const afterNote = await AuditLogModel.countDocuments({ action: 'forms.note_added' });
  assert.equal(afterNote, beforeNote, 'a status-only update must not also fire a note_added audit entry');
});
