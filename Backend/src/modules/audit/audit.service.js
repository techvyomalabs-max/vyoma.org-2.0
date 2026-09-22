import { AuditLogModel } from './auditLog.model.js';

// Fire-and-forget: an audit-log write failure must never block the operation
// it's recording (same principle Phase 1 applied to best-effort notification
// emails). Callers await this for ordering, but a failure here only logs.
export async function recordAudit({ actor, action, targetType = null, targetId = null, details = null, req = null }) {
  try {
    await AuditLogModel.create({
      actorId: actor?._id || null,
      actorEmail: actor?.email || null,
      action,
      targetType,
      targetId: targetId != null ? String(targetId) : null,
      details,
      ip: req?.ip || null,
    });
  } catch (err) {
    console.error('[audit] failed to record entry:', action, err.message);
  }
}
