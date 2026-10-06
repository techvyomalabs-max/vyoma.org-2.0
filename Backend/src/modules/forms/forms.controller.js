import { FormSubmissionModel } from './formSubmission.model.js';
import { SiteSettingsModel } from '../settings/setting.model.js';
import { sendMail } from '../../services/mailer.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_LENGTH = 5000;

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

// LLD Section 8.1/14: required fields, email format, length limits, basic
// sanitization. Not tied to one exact per-formKey shape — both the site-wide
// Contact page form and the modal Contact form send slightly different
// field sets (organization/reason are optional extras), so this validates
// the fields every form actually needs: name, email, message.
function validate(values) {
  const fieldErrors = {};
  if (typeof values !== 'object' || values === null) {
    return { name: 'Invalid submission.' };
  }
  for (const [key, val] of Object.entries(values)) {
    if (typeof val === 'string' && val.length > MAX_FIELD_LENGTH) {
      fieldErrors[key] = 'Too long.';
    }
  }
  if (!values.name || typeof values.name !== 'string' || !values.name.trim()) {
    fieldErrors.name = 'Name is required.';
  }
  if (!values.email || typeof values.email !== 'string' || !EMAIL_RE.test(values.email.trim())) {
    fieldErrors.email = 'A valid email is required.';
  }
  if (!values.message || typeof values.message !== 'string' || !values.message.trim()) {
    fieldErrors.message = 'Message is required.';
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null;
}

// POST /api/v1/forms/:formKey/submissions — LLD 8.1.
export async function submitFormHandler(req, res, next) {
  try {
    const { formKey } = req.params;
    const { values, consent, sourceUrl } = req.body || {};

    const fieldErrors = validate(values);
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
      const result = await sendMail({
        to: await resolveNotificationRecipient(),
        subject: `New ${formKey} submission`,
        html: `<pre>${JSON.stringify(values, null, 2)}</pre>`,
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
