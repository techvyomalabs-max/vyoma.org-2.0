import mongoose from 'mongoose';
import { DonationModel } from './donation.model.js';
import { DonationSchemeModel } from './donationScheme.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';

const VALID_STATUSES = ['initiated', 'order_created', 'paid_verified', 'receipt_sent', 'failed', 'cancelled', 'verification_failed'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SCHEME_STATUSES = ['active', 'inactive'];

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/v1/admin/donations — read-only list/filter/reporting only per
// Week 3 Decision W3-4: no refund action, no CSV export here. `?email=`
// (Phase F, D-F3) is an optional case-insensitive donor-email search;
// omitting it preserves the exact prior filter/pagination behavior.
export async function listDonationsAdmin(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const filter = {};
    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        throw new ApiError(422, 'VALIDATION_ERROR', `status must be one of: ${VALID_STATUSES.join(', ')}.`);
      }
      filter.status = req.query.status;
    }
    if (req.query.schemeSlug) filter.schemeSlug = req.query.schemeSlug;
    if (req.query.email && typeof req.query.email === 'string' && req.query.email.trim()) {
      filter['donor.email'] = new RegExp(escapeRegex(req.query.email.trim()), 'i');
    }
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) {
        const from = new Date(req.query.dateFrom);
        if (Number.isNaN(from.getTime())) throw new ApiError(422, 'VALIDATION_ERROR', 'dateFrom is not a valid date.');
        filter.createdAt.$gte = from;
      }
      if (req.query.dateTo) {
        const to = new Date(req.query.dateTo);
        if (Number.isNaN(to.getTime())) throw new ApiError(422, 'VALIDATION_ERROR', 'dateTo is not a valid date.');
        filter.createdAt.$lte = to;
      }
    }

    const [items, total] = await Promise.all([
      DonationModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      DonationModel.countDocuments(filter),
    ]);

    return sendSuccess(res, items, { meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/donations/:id
export async function getDonationAdmin(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid donation id format.');
    }
    const doc = await DonationModel.findById(req.params.id).lean();
    if (!doc) throw new ApiError(404, 'DONATION_NOT_FOUND', 'Donation not found.');
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Donation Scheme admin (Phase D). Not Content-model-backed — these are
// direct CRUD against DonationSchemeModel (like Users/Redirects), not a
// draft/publish workflow, since a scheme's identity is checkout-critical
// data, not page copy. No delete endpoint anywhere here, by design —
// `status: 'inactive'` only, so historical donations' schemeSlug references
// and existing /donate/[slug] URLs never break.
// ---------------------------------------------------------------------------

// GET /api/v1/admin/donations/schemes — every scheme, including inactive
// ones (the public list at GET /public/donation-schemes excludes those).
export async function listSchemesAdmin(req, res, next) {
  try {
    const schemes = await DonationSchemeModel.find().sort({ displayOrder: 1 }).lean();
    return sendSuccess(res, schemes);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/donations/schemes — slug is set once here and never
// editable again (see updateSchemeAdmin, which has no slug field at all).
export async function createSchemeAdmin(req, res, next) {
  try {
    const { slug, name, description, note, amountOptions, displayOrder } = req.body || {};
    const fieldErrors = {};

    if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      fieldErrors.slug = 'Required, lowercase letters/numbers/hyphens only (e.g. "general-donation").';
    }
    if (!name || typeof name !== 'string' || !name.trim()) fieldErrors.name = 'Name is required.';
    if (!description || typeof description !== 'string' || !description.trim()) fieldErrors.description = 'Description is required.';
    if (amountOptions !== undefined && (!Array.isArray(amountOptions) || !amountOptions.every((n) => Number.isFinite(n) && n > 0))) {
      fieldErrors.amountOptions = 'Must be an array of positive numbers.';
    }
    if (Object.keys(fieldErrors).length) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', fieldErrors);
    }

    let doc;
    try {
      const maxOrder = await DonationSchemeModel.findOne().sort({ displayOrder: -1 }).select('displayOrder').lean();
      doc = await DonationSchemeModel.create({
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        note: note || null,
        amountOptions,
        displayOrder: displayOrder ?? (maxOrder ? maxOrder.displayOrder + 1 : 0),
        status: 'active',
      });
    } catch (err) {
      if (err.code === 11000) throw new ApiError(409, 'SLUG_IN_USE', `A scheme with slug "${slug}" already exists.`);
      throw err;
    }

    await recordAudit({ actor: actorOf(req), action: 'donationScheme.created', targetType: 'DonationScheme', targetId: doc._id, details: { slug: doc.slug }, req });
    return sendSuccess(res, doc, { status: 201 });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/donations/schemes/:slug — slug (the URL param) is
// never itself an updatable field; there is deliberately no code path here
// that can change it.
export async function updateSchemeAdmin(req, res, next) {
  try {
    const doc = await DonationSchemeModel.findOne({ slug: req.params.slug });
    if (!doc) throw new ApiError(404, 'SCHEME_NOT_FOUND', `No scheme with slug "${req.params.slug}".`);

    const { name, description, note, amountOptions, status, displayOrder } = req.body || {};
    const fieldErrors = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) fieldErrors.name = 'Name cannot be empty.';
      else doc.name = name.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || !description.trim()) fieldErrors.description = 'Description cannot be empty.';
      else doc.description = description.trim();
    }
    if (note !== undefined) doc.note = note || null;
    if (amountOptions !== undefined) {
      if (!Array.isArray(amountOptions) || !amountOptions.every((n) => Number.isFinite(n) && n > 0)) {
        fieldErrors.amountOptions = 'Must be an array of positive numbers.';
      } else doc.amountOptions = amountOptions;
    }
    if (status !== undefined) {
      if (!SCHEME_STATUSES.includes(status)) fieldErrors.status = `Must be one of: ${SCHEME_STATUSES.join(', ')}.`;
      else doc.status = status;
    }
    if (displayOrder !== undefined) {
      if (!Number.isInteger(displayOrder)) fieldErrors.displayOrder = 'Must be an integer.';
      else doc.displayOrder = displayOrder;
    }
    if (Object.keys(fieldErrors).length) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', fieldErrors);
    }

    await doc.save();
    await recordAudit({
      actor: actorOf(req),
      action: 'donationScheme.updated',
      targetType: 'DonationScheme',
      targetId: doc._id,
      details: { slug: doc.slug, fields: Object.keys(req.body || {}) },
      req,
    });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}
