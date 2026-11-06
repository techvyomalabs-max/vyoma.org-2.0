// Task 7T.3 (Fix 2) — regression coverage for refreshCookieAttributes()'s
// environment-dependent Secure flag. Before this fix, `secure` was
// `env.nodeEnv === 'production'`, which meant a staging deployment (served
// over real HTTPS, per Backend/STAGING.md) issued its refresh-token cookie
// WITHOUT the Secure flag -- a real hardening gap this fix closes by
// excluding only 'development' instead.
//
// Pure, synchronous tests of a side-effect-free function -- no HTTP request,
// no login/logout round-trip, no database of any kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../../config/env.js';
import { refreshCookieAttributes } from './auth.controller.js';

function withNodeEnv(nodeEnv, fn) {
  const backup = env.nodeEnv;
  env.nodeEnv = nodeEnv;
  try {
    fn();
  } finally {
    env.nodeEnv = backup;
  }
}

test('development: cookie is HttpOnly, NOT Secure (the app is typically served over plain HTTP locally), and SameSite=Lax', () => {
  withNodeEnv('development', () => {
    const attrs = refreshCookieAttributes();
    assert.equal(attrs.httpOnly, true);
    assert.equal(attrs.secure, false);
    assert.equal(attrs.sameSite, 'lax');
    assert.equal(attrs.path, '/api/v1/auth');
  });
});

test('staging: cookie is HttpOnly, Secure (Task 7T.3 Fix 2 -- staging is real HTTPS too, previously missed), and SameSite=Lax', () => {
  withNodeEnv('staging', () => {
    const attrs = refreshCookieAttributes();
    assert.equal(attrs.httpOnly, true);
    assert.equal(attrs.secure, true, 'staging must now get Secure=true, closing the gap this fix addresses');
    assert.equal(attrs.sameSite, 'lax');
  });
});

test('production: cookie is HttpOnly, Secure, and SameSite=Lax (unchanged from before this fix)', () => {
  withNodeEnv('production', () => {
    const attrs = refreshCookieAttributes();
    assert.equal(attrs.httpOnly, true);
    assert.equal(attrs.secure, true);
    assert.equal(attrs.sameSite, 'lax');
  });
});

test('SameSite is never automatically changed to "none" by this fix, in any environment', () => {
  for (const nodeEnv of ['development', 'staging', 'production']) {
    withNodeEnv(nodeEnv, () => {
      assert.equal(refreshCookieAttributes().sameSite, 'lax', `SameSite must remain 'lax' under NODE_ENV=${nodeEnv}`);
    });
  }
});

test('HttpOnly is always true, in every environment (never weakened by this fix)', () => {
  for (const nodeEnv of ['development', 'staging', 'production']) {
    withNodeEnv(nodeEnv, () => {
      assert.equal(refreshCookieAttributes().httpOnly, true, `HttpOnly must remain true under NODE_ENV=${nodeEnv}`);
    });
  }
});
