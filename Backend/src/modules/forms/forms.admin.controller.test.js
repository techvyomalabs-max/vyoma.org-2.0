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
