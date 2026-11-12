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

test('GET /admin/forms supports pagination', async () => {
  const token = await adminToken('paginate');
  for (let i = 0; i < 3; i += 1) await FormSubmissionModel.create(submissionFixture({ formKey: 'paginate-test' }));
  const { res, body } = await listSubmissions(token, '?formKey=paginate-test&page=1&limit=2');
  assert.equal(res.status, 200);
  assert.equal(body.meta.limit, 2);
  assert.equal(body.data.length, 2);
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
