import 'dotenv/config';

const SUPPORTED_NODE_ENVS = ['development', 'staging', 'production'];

// The single, centralized place this application decides what "deployment
// mode" it's running in -- every other environment-gated check (mock-content
// seeding, the MongoDB persistent-URI requirement, the production JWT-secret
// requirement, cookie `secure` flags, etc.) reads env.nodeEnv below, which is
// always this function's validated result. No other file re-derives or
// re-interprets NODE_ENV on its own.
//
// An unset or unrecognized NODE_ENV is a FATAL configuration error by
// default: the previous behavior (silently defaulting an unset NODE_ENV to
// 'development') meant that forgetting to set NODE_ENV in a staging or
// production deployment -- the single most ordinary kind of deployment
// oversight, not an exotic misconfiguration -- silently bypassed every
// environment-gated safety check in this app at once (mock-content seeding,
// the MongoDB in-memory-fallback guard, and the pre-existing production
// JWT-secret requirement), each of which was specifically built to prevent
// dangerous silent behavior. Confirmed as a material risk during
// staging-readiness review.
//
// ALLOW_LOCAL_DEV_DEFAULTS=true is a narrow, explicit opt-in that restores
// today's "works with zero .env setup" local convenience -- but ONLY when
// NODE_ENV is genuinely unset or blank:
//   - It is NEVER consulted once NODE_ENV is set to anything at all, valid
//     or not -- an explicit staging/production value can never be
//     overridden by it, and an invalid value is never rescued by it.
//   - It cannot itself select staging or production -- its only effect is
//     resolving an absent NODE_ENV to 'development'.
//
// Exposed as a standalone, dependency-injectable function (an optional
// `source` defaulting to `process.env`) specifically so it can be
// unit-tested directly with controlled inputs, independent of env.js's own
// module-load-time evaluation.
export function resolveNodeEnv(source = process.env) {
  const raw = source.NODE_ENV;

  if (raw === undefined || raw === '') {
    if (source.ALLOW_LOCAL_DEV_DEFAULTS === 'true') {
      return 'development';
    }
    throw new Error(
      'NODE_ENV is not set. Set it explicitly to one of: development, staging, production. ' +
        'For local development without a full .env setup, set ALLOW_LOCAL_DEV_DEFAULTS=true instead.'
    );
  }

  if (!SUPPORTED_NODE_ENVS.includes(raw)) {
    throw new Error(`NODE_ENV="${raw}" is not a supported value. Supported values: ${SUPPORTED_NODE_ENVS.join(', ')}.`);
  }

  return raw;
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: resolveNodeEnv(),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  mongodbUri: process.env.MONGODB_URI || null,
  // 'true' | 'false' | null (unset) -- see isMockContentSeedAllowed() below.
  allowMockContentSeed: process.env.ALLOW_MOCK_CONTENT_SEED ?? null,
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || null,
    keySecret: process.env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null,
  },
  // Shared with the Frontend's DRAFT_MODE_SECRET (same value) — gates
  // draftData exposure on the public content route for CMS "Preview draft"
  // links only. Not a third-party credential.
  previewSecret: process.env.PREVIEW_SECRET || null,
  s3: {
    region: process.env.AWS_REGION || null,
    bucket: process.env.AWS_S3_BUCKET || null,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,
  },
  smtp: {
    host: process.env.SMTP_HOST || null,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    from: process.env.SMTP_FROM || null,
  },
  auth: {
    // Dev-only fallback secrets so the app still boots without an .env file;
    // never used to sign anything if NODE_ENV=production (see isAuthSecretConfigured).
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'dev-insecure-access-secret',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'dev-insecure-refresh-secret',
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS) || 30,
    mfaTokenTtl: process.env.JWT_MFA_TTL || '5m',
    mfaIssuer: process.env.MFA_ISSUER || 'Vyoma.org Admin',
  },
};

export const isRazorpayConfigured = () => !!(env.razorpay.keyId && env.razorpay.keySecret);
export const isS3Configured = () => !!(env.s3.region && env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey);
// SMTP_FROM is required alongside the connection settings -- a transporter
// with host/port/user/pass but no "from" address would attempt to send with
// a null From header, which real SMTP servers/providers typically reject.
export const isSmtpConfigured = () => !!(env.smtp.host && env.smtp.port && env.smtp.user && env.smtp.pass && env.smtp.from);
export const isAuthSecretConfigured = () => !!(process.env.JWT_ACCESS_SECRET && process.env.JWT_REFRESH_SECRET);

// Guards server.js's auto-seed-on-empty-Content startup behavior. Defaults
// to true only in development (NODE_ENV unset or 'development') -- the
// local "zero external setup" convenience this project has always had.
// Staging (any NODE_ENV value other than 'development'/'production')
// defaults to false, but ALLOW_MOCK_CONTENT_SEED can explicitly override
// either default there, in either direction, for the rare case a staging
// environment genuinely wants the mock dataset, or a local dev wants to
// start from a deliberately empty database.
//
// Production is an ABSOLUTE floor with NO override, by design -- mirroring
// isAuthSecretConfigured()'s existing "production never gets an escape
// hatch" pattern in this same file. ALLOW_MOCK_CONTENT_SEED=true is
// deliberately NOT honored when NODE_ENV === 'production': an operational
// accident that empties a production Content collection (a bad migration, a
// bug) should surface as an obviously empty site, not get silently papered
// over with misleading placeholder content because a staging-oriented env
// var was left set.
export const isMockContentSeedAllowed = () => {
  if (env.nodeEnv === 'production') return false;
  if (env.allowMockContentSeed === 'true') return true;
  if (env.allowMockContentSeed === 'false') return false;
  return env.nodeEnv === 'development';
};
