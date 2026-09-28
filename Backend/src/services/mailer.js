import nodemailer from 'nodemailer';
import { env, isSmtpConfigured } from '../config/env.js';

// SMTP provider is still an open decision (Week 3 Decision D5, not yet
// resolved) — this file only changes what happens once SMTP_* env vars are
// actually set; with none set, behavior is unchanged from the original stub
// (log only, never throws, same return shape). No credentials are ever
// logged, only the recipient/subject, same as before.
let transporter = null;

function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, html }) {
  if (!isSmtpConfigured()) {
    console.log(`[mailer] SMTP not configured — logging instead of sending. to=${to} subject="${subject}"`);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    const info = await getTransporter().sendMail({ from: env.smtp.from, to, subject, html });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    // Log only the error message, never the transporter config — the
    // message itself does not include the SMTP password.
    console.error(`[mailer] send failed: to=${to} subject="${subject}" — ${err.message}`);
    return { sent: false, reason: 'send_failed' };
  }
}
