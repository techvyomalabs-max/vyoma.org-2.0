import mongoose from 'mongoose';

// LLD Section 5 (Authentication) / Section 6 (users collection), extended in
// Phase 2. Admin/Super Admin accounts only — donors are not a login role
// (Phase 2 Decision D3): guest checkout + emailed receipt.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roleKey: { type: String, required: true, lowercase: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },

    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, default: null }, // base32 TOTP secret; set once enrolled+verified
    mfaPendingSecret: { type: String, default: null }, // set during setup, cleared on verify/cancel
    mfaRecoveryCodesHashed: { type: [String], default: [] },

    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },

    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },

    refreshTokenVersion: { type: Number, default: 0 }, // bump to invalidate all outstanding refresh tokens
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model('User', userSchema);
