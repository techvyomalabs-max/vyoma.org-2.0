import mongoose from 'mongoose';

// Architecture rule: "Maintain complete audit logs for sensitive admin/payment
// operations." Rows are append-only from the app's perspective — nothing in
// this module exposes an update/delete API.
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorEmail: { type: String, default: null }, // denormalized so logs survive a user being deleted later
    action: { type: String, required: true }, // e.g. 'auth.login', 'auth.login_failed', 'mfa.enabled'
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);
