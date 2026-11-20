import { draftMode } from 'next/headers';
import { apiRequest } from './apiClient.js';
import { shouldUseMockData } from '../lib/apiConfig.js';

// LLD 7.2: GET /api/v1/public/:type — generic published-content reader.
// TODO: once the Content module (LLD Section 7) is live, every mock import
// below is replaced by a call to getPublicContent(type).
//
// Task 7L: shouldUseMockData() is called fresh on every invocation (never
// cached at module-import time) and is categorically false in production,
// regardless of NEXT_PUBLIC_API_BASE_URL -- see lib/apiConfig.js.

// This module only ever runs in a Server Component (confirmed: no 'use
// client' file imports pageService/contentService) — safe to call
// draftMode() and read the server-only DRAFT_MODE_SECRET here. When an
// admin's "Preview draft" link has enabled Draft Mode, this asks the
// backend for draftData instead of the published data (see
// content.controller.js's `previewSecret` handling) — otherwise identical
// to a normal visitor's request.
export async function getPublicContent(type, mockLoader) {
  if (shouldUseMockData()) return mockLoader();

  // draftMode() throws when called outside a real request (e.g. from
  // generateStaticParams at build time, which every dynamic-route page using
  // this same function does) — there's no request to be "in preview" for at
  // build time anyway, so that case always means "not previewing."
  let isEnabled = false;
  try {
    isEnabled = (await draftMode()).isEnabled;
  } catch {
    isEnabled = false;
  }

  const secret = process.env.DRAFT_MODE_SECRET;
  const suffix = isEnabled && secret ? `?previewSecret=${encodeURIComponent(secret)}` : '';
  return apiRequest(`/public/${type}${suffix}`);
}
