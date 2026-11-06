import { apiRequest } from './apiClient.js';
import { shouldUseMockData } from '../lib/apiConfig.js';

// LLD 8.1: POST /api/v1/forms/{formKey}/submissions
// TODO: remove the mock branch once the Express forms module (LLD Section 8) is live.
// Task 7L: see lib/apiConfig.js -- shouldUseMockData() is categorically
// false in production.

export async function submitForm(formKey, { values, consent, sourceUrl }) {
  if (shouldUseMockData()) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { success: true, submissionId: `mock-${formKey}-${Date.now()}` };
  }
  return apiRequest(`/forms/${formKey}/submissions`, {
    method: 'POST',
    body: { values, consent, sourceUrl },
  });
}
