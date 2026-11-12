import { apiRequest } from './apiClient.js';
import { shouldUseMockData } from '../lib/apiConfig.js';

// LLD 9.1: donation-schemes / orders / verify. Razorpay checkout + server-side
// signature verification are NOT implemented here — this placeholder only
// shapes the calls the Donate pages will make once the Express donations
// module (LLD Section 9) and Razorpay adapter are live.
//
// Task 7L: of every service this task fixed, this one carried the highest
// real-world stakes -- createDonationOrder()/verifyDonation()'s mock branches
// fabricate a successful order id / "paid_verified" status with no Razorpay
// call and no money ever moving. Before this fix, a production deployment
// that simply forgot to set NEXT_PUBLIC_API_BASE_URL would have silently
// shown every donor a successful donation confirmation while charging
// nothing and recording nothing. shouldUseMockData() (lib/apiConfig.js) is
// categorically false in production, regardless of that variable.

export async function getDonationSchemes() {
  if (shouldUseMockData()) {
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
  if (shouldUseMockData()) {
    const { DONATION_SCHEMES } = await import('@/lib/mockData/donate');
    const scheme = DONATION_SCHEMES.find((s) => s.slug === slug);
    if (!scheme) throw Object.assign(new Error('Not found'), { status: 404 });
    return { ...scheme, status: 'active' };
  }
  return apiRequest(`/public/donation-schemes/${encodeURIComponent(slug)}`);
}

export async function createDonationOrder({ schemeSlug, amount, currency, donor }) {
  if (shouldUseMockData()) {
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
  if (shouldUseMockData()) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { status: 'paid_verified' };
  }
  return apiRequest('/donations/verify', {
    method: 'POST',
    body: { donationId, razorpayPaymentId, razorpaySignature },
  });
}
