import { apiRequest } from './apiClient.js';
import { shouldUseMockData } from '../lib/apiConfig.js';

// GET /api/v1/public/settings — Phase D. Returns only the public-safe subset
// (contactInboxEmail, socialLinks, donationBankDetails, financeContactEmail)
// — see Backend/src/modules/settings/setting.model.js's PUBLIC_KEYS.
// Task 7L: see lib/apiConfig.js -- shouldUseMockData() is categorically
// false in production.

export async function getPublicSettings() {
  if (shouldUseMockData()) {
    return { contactInboxEmail: null, socialLinks: {}, donationBankDetails: {}, financeContactEmail: null };
  }
  return apiRequest('/public/settings');
}
