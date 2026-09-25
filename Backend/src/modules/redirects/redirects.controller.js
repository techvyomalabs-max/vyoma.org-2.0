import { RedirectModel } from './redirect.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';

const ABSOLUTE_URL_RE = /^https?:\/\/.+/i;

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

function normalizePath(value, fieldName) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new ApiError(422, 'VALIDATION_ERROR', `${fieldName} is required.`, { [fieldName]: 'Required.' });
  }
  return value.trim();
}

function validateFromPath(fromPath) {
  const value = normalizePath(fromPath, 'fromPath');
  if (!value.startsWith('/')) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'fromPath must be a site-relative path starting with "/".', {
      fromPath: 'Must start with "/".',
    });
  }
  return value;
}

function validateToPath(toPath) {
  const value = normalizePath(toPath, 'toPath');
  if (!value.startsWith('/') && !ABSOLUTE_URL_RE.test(value)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'toPath must be a site-relative path or an absolute http(s) URL.', {
      toPath: 'Must start with "/" or be an absolute http(s) URL.',
    });
  }
  return value;
}

function validateStatusCode(statusCode) {
  if (statusCode === undefined) return 301;
  if (statusCode !== 301 && statusCode !== 302) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'statusCode must be 301 or 302.', { statusCode: 'Must be 301 or 302.' });
  }
  return statusCode;
}

// Phase F (D-F8): backend-authoritative rejection of the two minimal loop
// cases — a self-loop (fromPath -> itself) and a direct two-rule reversal
// (an existing A->B alongside this rule's B->A). Not a general graph walk —
// deliberately out of scope per your instruction. `excludeId` lets
// updateRedirect check the FINAL merged state against every OTHER existing
// rule without the document's own pre-update row falsely matching itself.
async function assertNoLoop(fromPath, toPath, excludeId) {
  if (fromPath === toPath) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'fromPath and toPath cannot be the same path — that would redirect a path to itself.', {
      toPath: 'Cannot be the same as fromPath.',
    });
  }
  const reverseQuery = { fromPath: toPath, toPath: fromPath };
  if (excludeId) reverseQuery._id = { $ne: excludeId };
  const reverse = await RedirectModel.findOne(reverseQuery).lean();
  if (reverse) {
    throw new ApiError(
      422,
      'VALIDATION_ERROR',
      `This would create a redirect loop with the existing rule "${toPath}" → "${fromPath}".`,
      { toPath: 'Would create a two-rule redirect loop with an existing redirect.' }
    );
  }
}

// GET /api/v1/admin/redirects
export async function listRedirects(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const [items, total] = await Promise.all([
      RedirectModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      RedirectModel.countDocuments(),
    ]);
    return sendSuccess(res, items, { meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/redirects
export async function createRedirect(req, res, next) {
  try {
    const fromPath = validateFromPath(req.body?.fromPath);
    const toPath = validateToPath(req.body?.toPath);
    const statusCode = validateStatusCode(req.body?.statusCode);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() || null : null;

    await assertNoLoop(fromPath, toPath, null);

    let doc;
    try {
      doc = await RedirectModel.create({ fromPath, toPath, statusCode, notes });
    } catch (err) {
      if (err.code === 11000) {
        throw new ApiError(409, 'REDIRECT_EXISTS', `A redirect for "${fromPath}" already exists.`);
      }
      throw err;
    }

    await recordAudit({ actor: actorOf(req), action: 'redirects.created', targetType: 'Redirect', targetId: doc._id, details: { fromPath, toPath }, req });
    return sendSuccess(res, doc, { status: 201 });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/redirects/:id
export async function updateRedirect(req, res, next) {
  try {
    const doc = await RedirectModel.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'REDIRECT_NOT_FOUND', 'Redirect not found.');

    const nextFromPath = req.body?.fromPath !== undefined ? validateFromPath(req.body.fromPath) : doc.fromPath;
    const nextToPath = req.body?.toPath !== undefined ? validateToPath(req.body.toPath) : doc.toPath;
    if (req.body?.statusCode !== undefined) doc.statusCode = validateStatusCode(req.body.statusCode);
    if (req.body?.notes !== undefined) doc.notes = typeof req.body.notes === 'string' ? req.body.notes.trim() || null : null;

    await assertNoLoop(nextFromPath, nextToPath, doc._id);
    doc.fromPath = nextFromPath;
    doc.toPath = nextToPath;

    try {
      await doc.save();
    } catch (err) {
      if (err.code === 11000) {
        throw new ApiError(409, 'REDIRECT_EXISTS', `A redirect for "${doc.fromPath}" already exists.`);
      }
      throw err;
    }

    await recordAudit({ actor: actorOf(req), action: 'redirects.updated', targetType: 'Redirect', targetId: doc._id, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/redirects/:id
export async function deleteRedirect(req, res, next) {
  try {
    const doc = await RedirectModel.findByIdAndDelete(req.params.id);
    if (!doc) throw new ApiError(404, 'REDIRECT_NOT_FOUND', 'Redirect not found.');

    await recordAudit({ actor: actorOf(req), action: 'redirects.deleted', targetType: 'Redirect', targetId: doc._id, details: { fromPath: doc.fromPath }, req });
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}
