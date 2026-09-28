import { draftMode } from 'next/headers';
import { apiRequest } from './apiClient';

// LLD 7.2: GET /api/v1/public/:type — generic published-content reader.
// TODO: once the Content module (LLD Section 7) is live, every mock import
// below is replaced by a call to getPublicContent(type).
const USE_MOCK = process.env.NEXT_PUBLIC_API_BASE_URL == null;

// This module only ever runs in a Server Component (confirmed: no 'use
// client' file imports pageService/contentService) — safe to call
// draftMode() and read the server-only DRAFT_MODE_SECRET here. When an
// admin's "Preview draft" link has enabled Draft Mode, this asks the
// backend for draftData instead of the published data (see
// content.controller.js's `previewSecret` handling) — otherwise identical
// to a normal visitor's request.
export async function getPublicContent(type, mockLoader) {
  if (USE_MOCK) return mockLoader();

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
