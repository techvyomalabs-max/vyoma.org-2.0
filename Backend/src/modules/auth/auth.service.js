import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { env } from '../../config/env.js';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Access token: short-lived, carries a snapshot of role + permissions so
// requireAuth/requirePermission don't need a DB round trip on every request.
// A role edit takes effect for a given user within one access-token TTL.
export function signAccessToken(user, role) {
  return jwt.sign(
    { sub: String(user._id), email: user.email, roleKey: user.roleKey, permissions: role?.permissions || [] },
    env.auth.accessTokenSecret,
    { expiresIn: env.auth.accessTokenTtl }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.auth.accessTokenSecret);
}

// Refresh token: long-lived, HTTP-only cookie only, carries the
// refreshTokenVersion so a password change/logout-all can invalidate every
// outstanding refresh token by bumping the stored version.
export function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user._id), v: user.refreshTokenVersion },
    env.auth.refreshTokenSecret,
    { expiresIn: `${env.auth.refreshTokenTtlDays}d` }
  );
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.auth.refreshTokenSecret);
}

// Short-lived intermediate token identifying a login that passed
// password-check but is pending MFA — never grants API access itself.
export function signMfaPendingToken(user) {
  return jwt.sign({ sub: String(user._id), purpose: 'mfa_pending' }, env.auth.accessTokenSecret, {
    expiresIn: env.auth.mfaTokenTtl,
  });
}

export function verifyMfaPendingToken(token) {
  const payload = jwt.verify(token, env.auth.accessTokenSecret);
  if (payload.purpose !== 'mfa_pending') throw new Error('Not an MFA pending token');
  return payload;
}

export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function totpKeyUri(email, secret) {
  return authenticator.keyuri(email, env.auth.mfaIssuer, secret);
}

export function verifyTotp(secret, code) {
  try {
    return authenticator.verify({ token: String(code || ''), secret });
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex'));
}

export async function hashRecoveryCodes(codes) {
  return Promise.all(codes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)));
}

export async function matchAndConsumeRecoveryCode(user, code) {
  for (let i = 0; i < user.mfaRecoveryCodesHashed.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(code, user.mfaRecoveryCodesHashed[i])) {
      user.mfaRecoveryCodesHashed.splice(i, 1);
      return true;
    }
  }
  return false;
}

export function generateResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
