import { AuditLogModel } from './auditLog.model.js';
import { sendSuccess } from '../../utils/apiResponse.js';

// GET /api/v1/admin/audit-logs — Super Admin only (LLD Section 21: "Minimum
// Admin Screens" lists audit-logs as Super Admin only). Read-only by design;
// there is no update/delete route for this collection anywhere in the app.
export async function listAuditLogs(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const [items, total] = await Promise.all([
      AuditLogModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLogModel.countDocuments(),
    ]);

    return sendSuccess(res, items, { meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}
