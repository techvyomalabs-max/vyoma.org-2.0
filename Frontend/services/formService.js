import { apiRequest } from './apiClient';

// LLD 8.1: POST /api/v1/forms/{formKey}/submissions
// TODO: remove the mock branch once the Express forms module (LLD Section 8) is live.
const USE_MOCK = process.env.NEXT_PUBLIC_API_BASE_URL == null;

export async function submitForm(formKey, { values, consent, sourceUrl }) {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { success: true, submissionId: `mock-${formKey}-${Date.now()}` };
  }
  return apiRequest(`/forms/${formKey}/submissions`, {
    method: 'POST',
    body: { values, consent, sourceUrl },
  });
}
