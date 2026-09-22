import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  mongodbUri: process.env.MONGODB_URI || null,
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || null,
    keySecret: process.env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null,
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
export const isSmtpConfigured = () => !!(env.smtp.host && env.smtp.port && env.smtp.user && env.smtp.pass);
export const isAuthSecretConfigured = () => !!(process.env.JWT_ACCESS_SECRET && process.env.JWT_REFRESH_SECRET);
