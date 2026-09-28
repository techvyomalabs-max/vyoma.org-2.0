import mongoose from 'mongoose';

// RBAC as data, not hardcoded enum branches (Phase 2 Decision D8): ships with
// exactly 2 roles (super_admin, admin) but new roles/permissions can be added
// by inserting a document — no code change or redeploy required.
const roleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    permissions: { type: [String], default: [] }, // '*' or 'module:action', e.g. 'content:write'
    mfaRequired: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const RoleModel = mongoose.model('Role', roleSchema);
