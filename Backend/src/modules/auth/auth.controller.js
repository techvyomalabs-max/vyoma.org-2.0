import { UserModel } from './user.model.js';
import { RoleModel } from './role.model.js';
import { ApiError, sendSuccess } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';
import { sendMail } from '../../services/mailer.js';
import { env } from '../../config/env.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signMfaPendingToken,
  verifyMfaPendingToken,
  generateTotpSecret,
  totpKeyUri,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCodes,
  matchAndConsumeRecoveryCode,
  generateResetToken,
  hashResetToken,
} from './auth.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'vyoma_refresh';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

async function issueSession(res, user, role) {
  const accessToken = signAccessToken(user, role);
  const refreshToken = signRefreshToken(user);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  return { accessToken, user: { id: user._id, name: user.name, email: user.email, roleKey: user.roleKey, mfaEnabled: user.mfaEnabled } };
}

// POST /api/v1/auth/login
export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Email and password are required.');
    }

    const user = await UserModel.findOne({ email: String(email).toLowerCase().trim() });
    // Same generic error whether the account doesn't exist or the password is
    // wrong — do not leak which one to an unauthenticated caller.
    const invalidCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');

    if (!user || user.status !== 'active') {
      await recordAudit({ action: 'auth.login_failed', details: { email, reason: 'no_such_active_user' }, req });
      throw invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordAudit({ actor: user, action: 'auth.login_blocked_locked', req });
      throw new ApiError(423, 'ACCOUNT_LOCKED', 'This account is temporarily locked due to repeated failed sign-ins.');
    }

    const passwordOk = await verifyPassword(password, user.passwordHash);
    if (!passwordOk) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      await recordAudit({ actor: user, action: 'auth.login_failed', details: { reason: 'bad_password' }, req });
      throw invalidCredentials();
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;

    const role = await RoleModel.findOne({ key: user.roleKey });

    if (user.mfaEnabled) {
      await user.save();
      const mfaToken = signMfaPendingToken(user);
      return sendSuccess(res, { mfaRequired: true, mfaToken });
    }

    user.lastLoginAt = new Date();
    await user.save();
    const session = await issueSession(res, user, role);
    await recordAudit({ actor: user, action: 'auth.login', req });
    return sendSuccess(res, session);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/login/mfa
export async function loginMfa(req, res, next) {
  try {
    const { mfaToken, code, recoveryCode } = req.body || {};
    if (!mfaToken || (!code && !recoveryCode)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'mfaToken and a TOTP code or recovery code are required.');
    }

    let payload;
    try {
      payload = verifyMfaPendingToken(mfaToken);
    } catch {
      throw new ApiError(401, 'MFA_TOKEN_INVALID', 'This sign-in attempt has expired. Please log in again.');
    }

    const user = await UserModel.findById(payload.sub);
    if (!user || user.status !== 'active' || !user.mfaEnabled) {
      throw new ApiError(401, 'MFA_TOKEN_INVALID', 'This sign-in attempt is no longer valid.');
    }

    let ok = false;
    if (code) {
      ok = verifyTotp(user.mfaSecret, code);
    } else {
      ok = await matchAndConsumeRecoveryCode(user, recoveryCode);
    }

    if (!ok) {
      await recordAudit({ actor: user, action: 'auth.mfa_failed', req });
      throw new ApiError(401, 'MFA_INVALID', 'Invalid authentication code.');
    }

    user.lastLoginAt = new Date();
    await user.save();
    const role = await RoleModel.findOne({ key: user.roleKey });
    const session = await issueSession(res, user, role);
    await recordAudit({ actor: user, action: 'auth.login', details: { via: recoveryCode ? 'recovery_code' : 'totp' }, req });
    return sendSuccess(res, session);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/refresh
export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'No refresh token present.');

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Refresh token is invalid or expired.');
    }

    const user = await UserModel.findById(payload.sub);
    if (!user || user.status !== 'active' || user.refreshTokenVersion !== payload.v) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'This session is no longer valid.');
    }

    const role = await RoleModel.findOne({ key: user.roleKey });
    const session = await issueSession(res, user, role);
    return sendSuccess(res, session);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/logout
export async function logout(req, res, next) {
  try {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    return sendSuccess(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/auth/me
export async function me(req, res, next) {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');
    return sendSuccess(res, { id: user._id, name: user.name, email: user.email, roleKey: user.roleKey, mfaEnabled: user.mfaEnabled });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/mfa/setup
export async function mfaSetup(req, res, next) {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');

    const secret = generateTotpSecret();
    user.mfaPendingSecret = secret;
    await user.save();

    return sendSuccess(res, { otpauthUri: totpKeyUri(user.email, secret), secret });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/mfa/verify
export async function mfaVerify(req, res, next) {
  try {
    const { code } = req.body || {};
    const user = await UserModel.findById(req.user.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');
    if (!user.mfaPendingSecret) {
      throw new ApiError(400, 'MFA_SETUP_NOT_STARTED', 'Call mfa/setup first.');
    }

    if (!verifyTotp(user.mfaPendingSecret, code)) {
      throw new ApiError(401, 'MFA_INVALID', 'Invalid authentication code.');
    }

    const recoveryCodes = generateRecoveryCodes();
    user.mfaSecret = user.mfaPendingSecret;
    user.mfaPendingSecret = null;
    user.mfaEnabled = true;
    user.mfaRecoveryCodesHashed = await hashRecoveryCodes(recoveryCodes);
    await user.save();

    await recordAudit({ actor: user, action: 'auth.mfa_enabled', req });
    // Recovery codes are shown exactly once — only the hashes are persisted.
    return sendSuccess(res, { mfaEnabled: true, recoveryCodes });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/mfa/disable
export async function mfaDisable(req, res, next) {
  try {
    const { password } = req.body || {};
    const user = await UserModel.findById(req.user.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');

    if (!password || !(await verifyPassword(password, user.passwordHash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is required to disable MFA.');
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaPendingSecret = null;
    user.mfaRecoveryCodesHashed = [];
    await user.save();

    await recordAudit({ actor: user, action: 'auth.mfa_disabled', req });
    return sendSuccess(res, { mfaEnabled: false });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/password/forgot
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email) throw new ApiError(422, 'VALIDATION_ERROR', 'Email is required.');

    const user = await UserModel.findOne({ email: String(email).toLowerCase().trim(), status: 'active' });
    // Always respond the same way whether or not the account exists, so this
    // endpoint can't be used to enumerate admin emails.
    if (user) {
      const { token, hash } = generateResetToken();
      user.passwordResetTokenHash = hash;
      user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await user.save();

      await sendMail({
        to: user.email,
        subject: 'Reset your Vyoma.org admin password',
        html: `<p>A password reset was requested for this account.</p>
               <p>Reset token (valid for 1 hour): <code>${token}</code></p>
               <p>If you did not request this, you can ignore this email.</p>`,
      });
      await recordAudit({ actor: user, action: 'auth.password_reset_requested', req });
    }

    return sendSuccess(res, { message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/password/reset
export async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Token and newPassword are required.');
    }
    if (String(newPassword).length < 10) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Password must be at least 10 characters.');
    }

    const tokenHash = hashResetToken(token);
    const user = await UserModel.findOne({ passwordResetTokenHash: tokenHash });
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new ApiError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has expired.');
    }

    user.passwordHash = await hashPassword(newPassword);
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    user.refreshTokenVersion += 1; // invalidate every outstanding session
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    await recordAudit({ actor: user, action: 'auth.password_reset_completed', req });
    return sendSuccess(res, { message: 'Password has been reset. Please log in again.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/password/change (requireAuth)
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'currentPassword and newPassword are required.');
    }
    if (String(newPassword).length < 10) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Password must be at least 10 characters.');
    }

    const user = await UserModel.findById(req.user.id);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    }

    user.passwordHash = await hashPassword(newPassword);
    user.refreshTokenVersion += 1;
    await user.save();

    await recordAudit({ actor: user, action: 'auth.password_changed', req });
    return sendSuccess(res, { message: 'Password changed. Please log in again.' });
  } catch (err) {
    next(err);
  }
}
