import { FormSubmissionModel } from './formSubmission.model.js';
import { SiteSettingsModel } from '../settings/setting.model.js';
import { sendMail } from '../../services/mailer.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { escapeHtml } from '../../utils/htmlEscape.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors the frontend's NAME_RE (ContactForm.jsx, ContactPageForm.jsx,
// CSRProjectsBoard.jsx) — Unicode letters (any language/script) plus
// spaces, apostrophes (straight or curly), and hyphens, starting with a
// letter. Enforced server-side too so the API can't be used to submit a
// name the UI itself would reject.
const NAME_RE = /^\p{L}[\p{L}\s'’-]*$/u;
const MAX_FIELD_LENGTH = 5000;

// QA Bug 18 — Mobile Number (CSR Partner Enquiry only). Mirrors the
// frontend's identical check (CSRProjectsBoard.jsx's isValidMobileNumber)
// so the two never drift. Accepts digits with common international
// formatting and nothing else: an optional SINGLE leading + immediately
// followed by a digit, no + or hyphen leading/trailing the value, balanced
// non-nested parentheses that each contain at least one digit (never
// empty or separator-only), and (after stripping all formatting) between
// 7 and 15 digits -- an application-specific basic format rule, not an
// official universal E.164 minimum, chosen because Vyoma serves
// international donors/partners and must not assume one country's fixed
// length. This is a format check only; it does not claim the number is
// assigned, reachable, or valid under any specific national numbering
// plan. Checks typeof before calling any string method, so a
// missing/null/non-string value (number, array, object) is rejected
// safely, never thrown on.
export function isValidMobileNumber(raw) {
  if (typeof raw !== 'string') return false;
  // Strips only surrounding ORDINARY spaces (ASCII U+0020) -- a tab,
  // newline, or any other whitespace character is never stripped, even
  // at the very start/end, so it still fails the character-class check
  // below like any other unsupported character. (The separate "is this
  // empty/whitespace-only" required-field check in validate() uses a
  // normal .trim() and runs before this function is ever called, so an
  // all-whitespace value never reaches here in the first place.)
  const value = raw.replace(/^ +| +$/g, '');
  if (!value) return false;
  if (value.startsWith('-') || value.endsWith('-')) return false;
  if (!/^\+?[0-9()\- ]*$/.test(value)) return false;
  if (value[0] === '+' && !/[0-9]/.test(value[1] || '')) return false;

  let depth = 0;
  let parenHasDigit = false;
  for (const ch of value) {
    if (ch === '(') {
      depth += 1;
      if (depth > 1) return false;
      parenHasDigit = false;
    } else if (ch === ')') {
      if (depth === 0) return false;
      if (!parenHasDigit) return false;
      depth -= 1;
    } else if (depth === 1 && /[0-9]/.test(ch)) {
      parenHasDigit = true;
    }
  }
  if (depth !== 0) return false;

  const digitCount = (value.match(/[0-9]/g) || []).length;
  return digitCount >= 7 && digitCount <= 15;
}

// Mirrors the frontend's MESSAGE_MAX_LENGTH/COMMENT_MAX_LENGTH (ContactForm.jsx,
// ContactPageForm.jsx, CSRProjectsBoard.jsx) — the message/comment textareas
// specifically are capped tighter than the generic per-field 5000 guard above.
const MESSAGE_MAX_LENGTH = 2000;

// Confirmed business detail: support@vyomalabs.in is the correct fallback
// contact inbox — used only when Settings.contactInboxEmail is blank/unset,
// never hardcoded as the primary recipient (Settings stays the
// configurable source of truth, per the admin-editable field it already
// has for exactly this).
const FALLBACK_CONTACT_INBOX = 'support@vyomalabs.in';

async function resolveNotificationRecipient() {
  const settings = await SiteSettingsModel.findOne({}).select('contactInboxEmail').lean();
  return settings?.contactInboxEmail?.trim() || FALLBACK_CONTACT_INBOX;
}

// `values` is entirely user-submitted (any field, any content) and was only
// ever validated for length/shape, never for HTML-safety -- the serialized
// JSON text must be escaped before it becomes part of this HTML email body,
// or a submitter could inject markup into whatever mail client opens it.
// Exported (and the exact function submitFormHandler calls) so tests can
// exercise this real code path directly, not a reimplementation of it.
export function buildNotificationEmailHtml(values) {
  return `<pre>${escapeHtml(JSON.stringify(values, null, 2))}</pre>`;
}

// LLD Section 8.1/14: required fields, email format, length limits, basic
// sanitization. Not tied to one exact per-formKey shape — both the site-wide
// Contact page form and the modal Contact form send slightly different
// field sets (organization/reason are optional extras), so this validates
// the fields every form actually needs: name, email, message.
//
// "newsletter" is a deliberate exception (Batch 7): it is a one-field
// email sign-up, not a name+message contact form — requiring name/message
// for it would reject every real submission. Every other formKey keeps
// the original, unchanged requirements.
export function validate(values, formKey) {
  const fieldErrors = {};
  if (typeof values !== 'object' || values === null) {
    return { name: 'Invalid submission.' };
  }
  for (const [key, val] of Object.entries(values)) {
    if (typeof val === 'string' && val.length > MAX_FIELD_LENGTH) {
      fieldErrors[key] = 'Too long.';
    }
  }
  if (!values.email || typeof values.email !== 'string' || !EMAIL_RE.test(values.email.trim())) {
    fieldErrors.email = 'A valid email is required.';
  } else {
    values.email = values.email.trim();
  }
  if (formKey !== 'newsletter') {
    const name = typeof values.name === 'string' ? values.name.trim() : '';
    if (!name) {
      fieldErrors.name = 'Name is required.';
    } else if (!NAME_RE.test(name)) {
      fieldErrors.name = 'Please enter a valid name without numbers or special characters.';
    } else {
      values.name = name;
    }
    if (!values.message || typeof values.message !== 'string' || !values.message.trim()) {
      fieldErrors.message = 'Message is required.';
    } else if (values.message.length > MESSAGE_MAX_LENGTH) {
      fieldErrors.message = `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`;
    }
  }
  // QA Bug 18 — only the CSR Partner Enquiry form (CSRProjectsBoard.jsx)
  // collects a mobile number; every other formKey's requirements are
  // unchanged by this check.
  if (formKey === 'csr-enquiry') {
    if (typeof values.mobile !== 'string' || !values.mobile.trim()) {
      fieldErrors.mobile = 'Mobile number is required.';
    } else if (!isValidMobileNumber(values.mobile)) {
      fieldErrors.mobile = 'Enter a valid mobile number.';
    }
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null;
}

// POST /api/v1/forms/:formKey/submissions — LLD 8.1.
export async function submitFormHandler(req, res, next) {
  try {
    const { formKey } = req.params;
    const { values, consent, sourceUrl } = req.body || {};

    const fieldErrors = validate(values, formKey);
    if (fieldErrors) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', fieldErrors);
    }

    const submission = await FormSubmissionModel.create({
      formKey,
      values,
      consent,
      sourceUrl,
    });

    // Best-effort notification: a mail failure must not fail the submission
    // itself (LLD 8.1 step 7: "Return accessible success/error response").
    try {
      // Only the email's HTML is built from an escaped copy here -- the
      // `values` object already stored on `submission` above is untouched.
      const result = await sendMail({
        to: await resolveNotificationRecipient(),
        subject: `New ${formKey} submission`,
        html: buildNotificationEmailHtml(values),
      });
      submission.notificationSent = !!result.sent;
      await submission.save();
    } catch (mailErr) {
      console.error('[forms] notification failed:', mailErr);
    }

    return sendSuccess(res, { submissionId: submission._id.toString() }, { status: 201 });
  } catch (err) {
    next(err);
  }
}
