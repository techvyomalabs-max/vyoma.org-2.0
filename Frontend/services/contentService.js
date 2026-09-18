import { apiRequest } from './apiClient';

// LLD 7.2: GET /api/v1/public/:type — generic published-content reader.
// TODO: once the Content module (LLD Section 7) is live, every mock import
// below is replaced by a call to getPublicContent(type).
const USE_MOCK = process.env.NEXT_PUBLIC_API_BASE_URL == null;

export async function getPublicContent(type, mockLoader) {
  if (USE_MOCK) return mockLoader();
  return apiRequest(`/public/${type}`);
}
