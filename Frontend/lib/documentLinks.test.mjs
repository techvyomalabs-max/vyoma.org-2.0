// Task 7L — regression coverage for lib/documentLinks.js's downloadUrlFor(),
// now routed through the shared resolveApiBase() (lib/apiConfig.js) instead
// of its own independent copy of the same fallback expression.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const ORIGINAL_ENV = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL };

function setEnv(overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => setEnv(ORIGINAL_ENV));
afterEach(() => setEnv(ORIGINAL_ENV));

const { isPdfUrl, downloadUrlFor } = await import('./documentLinks.js');

test('isPdfUrl is unaffected by this task (unrelated, untouched logic)', () => {
  assert.equal(isPdfUrl('https://vyoma.org/doc.pdf'), true);
  assert.equal(isPdfUrl('https://vyoma.org/flipbook/index.html'), false);
});

test('development with no API URL configured: builds a same-origin-relative download URL (preserved intended static fallback)', () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  assert.equal(downloadUrlFor('https://vyoma.org/doc.pdf'), '/api/v1/public/documents/download?url=https%3A%2F%2Fvyoma.org%2Fdoc.pdf');
});

test('production with missing API configuration: throws a clear error instead of silently building a broken relative link', () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  assert.throws(() => downloadUrlFor('https://vyoma.org/doc.pdf'), /NEXT_PUBLIC_API_BASE_URL/);
});

test('valid production API configuration: builds the download URL against the real configured API base', () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  assert.equal(downloadUrlFor('https://vyoma.org/doc.pdf'), 'https://api.vyoma.org/api/v1/public/documents/download?url=https%3A%2F%2Fvyoma.org%2Fdoc.pdf');
});
