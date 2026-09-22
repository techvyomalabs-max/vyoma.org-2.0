import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env, isRazorpayConfigured } from '../../config/env.js';

let client = null;
function getClient() {
  if (!isRazorpayConfigured()) return null;
  if (!client) {
    client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return client;
}

// LLD 9.1: order creation.
export async function createOrder({ amount, currency, receipt }) {
  const rp = getClient();
  if (!rp) return null; // caller returns a clear "not configured" error
  // Razorpay amounts are in the smallest currency unit (paise for INR).
  return rp.orders.create({ amount: Math.round(amount * 100), currency, receipt });
}

// LLD 9.3: "Never trust payment success from the browser alone. Verify
// Razorpay signature server-side." Per Razorpay's documented checkout
// verification scheme: HMAC-SHA256 of "order_id|payment_id" using the key
// secret, compared to the client-supplied signature.
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!env.razorpay.keySecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
}

// LLD 9.3: "Verify webhook signature using server-held secret." Per
// Razorpay's documented webhook scheme: HMAC-SHA256 of the raw request body
// using the webhook secret, compared to the X-Razorpay-Signature header.
export function verifyWebhookSignature({ rawBody, signature }) {
  if (!env.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
