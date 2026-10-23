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
function validate(values, formKey) {
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
