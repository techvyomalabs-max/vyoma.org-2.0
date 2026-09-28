import { AuditLogModel } from './auditLog.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';

// GET /api/v1/admin/audit-logs — Super Admin only (LLD Section 21: "Minimum
// Admin Screens" lists audit-logs as Super Admin only). Read-only by design;
// there is no update/delete route for this collection anywhere in the app.
//
// Phase F (D-F4): optional filters — action (exact), actorEmail (exact,
// case-insensitive — an audit trail lookup, not a fuzzy search, so no regex
// surface here), targetType (exact), dateFrom/dateTo (on createdAt, same
// validation as donations' own date filters). Omitting all of them preserves
// the exact prior behavior (empty filter, same pagination).
export async function listAuditLogs(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.actorEmail) filter.actorEmail = String(req.query.actorEmail).toLowerCase().trim();
    if (req.query.targetType) filter.targetType = req.query.targetType;
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
      AuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    return sendSuccess(res, items, { meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}
