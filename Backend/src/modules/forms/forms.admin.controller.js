import { FormSubmissionModel } from './formSubmission.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';

const VALID_STATUSES = ['new', 'handled'];

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

// GET /api/v1/admin/forms — list + filter. formKey and status are exact
// matches; dateFrom/dateTo (ISO date strings) filter on submittedAt.
export async function listSubmissions(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const filter = {};
    if (req.query.formKey) filter.formKey = req.query.formKey;
    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        throw new ApiError(422, 'VALIDATION_ERROR', `status must be one of: ${VALID_STATUSES.join(', ')}.`);
      }
      filter.status = req.query.status;
    }
    if (req.query.dateFrom || req.query.dateTo) {
      filter.submittedAt = {};
      if (req.query.dateFrom) {
        const from = new Date(req.query.dateFrom);
        if (Number.isNaN(from.getTime())) throw new ApiError(422, 'VALIDATION_ERROR', 'dateFrom is not a valid date.');
        filter.submittedAt.$gte = from;
      }
      if (req.query.dateTo) {
        const to = new Date(req.query.dateTo);
        if (Number.isNaN(to.getTime())) throw new ApiError(422, 'VALIDATION_ERROR', 'dateTo is not a valid date.');
        filter.submittedAt.$lte = to;
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
