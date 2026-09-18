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
