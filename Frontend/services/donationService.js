import { apiRequest } from './apiClient';

// LLD 9.1: donation-schemes / orders / verify. Razorpay checkout + server-side
// signature verification are NOT implemented here — this placeholder only
// shapes the calls the Donate pages will make once the Express donations
// module (LLD Section 9) and Razorpay adapter are live.
const USE_MOCK = process.env.NEXT_PUBLIC_API_BASE_URL == null;

export async function getDonationSchemes() {
  if (USE_MOCK) {
    const { DONATION_SCHEMES } = await import('@/lib/mockData/donate');
    return DONATION_SCHEMES;
  }
  return apiRequest('/public/donation-schemes');
}

// Phase D: unlike getDonationSchemes() (active-only list), this can return
// an inactive scheme too — the caller decides what to show based on
// `status`, rather than an inactive scheme looking identical to "doesn't
// exist." Throws (404) only when the slug truly doesn't exist.
export async function getDonationSchemeBySlug(slug) {
  if (USE_MOCK) {
    const { DONATION_SCHEMES } = await import('@/lib/mockData/donate');
    const scheme = DONATION_SCHEMES.find((s) => s.slug === slug);
    if (!scheme) throw Object.assign(new Error('Not found'), { status: 404 });
    return { ...scheme, status: 'active' };
  }
  return apiRequest(`/public/donation-schemes/${encodeURIComponent(slug)}`);
}

export async function createDonationOrder({ schemeSlug, amount, currency, donor }) {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { orderId: `mock-order-${Date.now()}`, amount, currency };
  }
  return apiRequest('/donations/orders', {
    method: 'POST',
    body: { schemeSlug, amount, currency, donor },
  });
}

// LLD 9.3: the browser's Razorpay Checkout "success" callback is never
// trusted on its own — this call is what actually determines whether a
// donation is verified, checked server-side against the real signature.
export async function verifyDonation({ donationId, razorpayPaymentId, razorpaySignature }) {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { status: 'paid_verified' };
  }
  return apiRequest('/donations/verify', {
    method: 'POST',
    body: { donationId, razorpayPaymentId, razorpaySignature },
  });
}
