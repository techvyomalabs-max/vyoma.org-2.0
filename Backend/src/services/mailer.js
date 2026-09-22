import { isSmtpConfigured } from '../config/env.js';

// SMTP provider is an open LLD decision (Section 15/23). Rather than block
// on that, this exposes the interface every caller needs now; when a
// provider is chosen, only this file changes (swap the log branch for a real
// transport, e.g. nodemailer).
export async function sendMail({ to, subject, html }) {
  if (!isSmtpConfigured()) {
    console.log(`[mailer] SMTP not configured — logging instead of sending. to=${to} subject="${subject}"`);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  // TODO: wire up the real transport once an SMTP provider/host is chosen.
  console.log(`[mailer] (stub) would send to=${to} subject="${subject}"`);
  return { sent: false, reason: 'transport_not_implemented' };
}
