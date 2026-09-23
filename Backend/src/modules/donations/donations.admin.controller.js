import mongoose from 'mongoose';
import { DonationModel } from './donation.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';

const VALID_STATUSES = ['initiated', 'order_created', 'paid_verified', 'receipt_sent', 'failed', 'cancelled', 'verification_failed'];

// GET /api/v1/admin/donations — read-only list/filter/reporting only per
// Week 3 Decision W3-4: no refund action, no CSV export here.
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
