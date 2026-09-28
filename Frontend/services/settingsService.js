import { apiRequest } from './apiClient';

// GET /api/v1/public/settings — Phase D. Returns only the public-safe subset
// (contactInboxEmail, socialLinks, donationBankDetails, financeContactEmail)
// — see Backend/src/modules/settings/setting.model.js's PUBLIC_KEYS.
const USE_MOCK = process.env.NEXT_PUBLIC_API_BASE_URL == null;

export async function getPublicSettings() {
  if (USE_MOCK) {
    return { contactInboxEmail: null, socialLinks: {}, donationBankDetails: {}, financeContactEmail: null };
  }
  return apiRequest('/public/settings');
}
