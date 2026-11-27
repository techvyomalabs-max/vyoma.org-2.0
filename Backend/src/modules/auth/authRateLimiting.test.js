// Regression coverage for rate limiting on /auth/refresh and /auth/logout
// (security audit finding: these two routes had no throttle at all, unlike
// /login and /password/forgot|reset). Two complementary strategies, same
// pattern already used elsewhere in this codebase for things that can't be
// exercised end-to-end without a running DB (see Header.a11y.test.mjs in
// the Frontend for the same source-assertion approach):
//
// 1. A behavioral test that spins up a minimal, real Express app wired with
//    the actual `makeRateLimiter` factory (no DB, no auth.controller.js) to
//    prove the 429-after-threshold behavior, the exact error shape, and
//    that two separate limiter instances keep independent counters even
//    under the same client IP.
// 2. A source-assertion test on auth.routes.js itself, to pin down the
//    actual production wiring: refresh and logout each get their OWN
//    limiter instance (not reusing loginLimiter/forgotLimiter, and not
//    sharing one with each other), login/forgot's own limits are
//    untouched, and refresh/logout still correctly have no `requireAuth`
//    (refresh authenticates via its own cookie; logout must succeed even
//    with an invalid/expired session).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { makeRateLimiter } from '../../middleware/rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startTestApp() {
  const app = express();
  const limiterA = makeRateLimiter({ windowMs: 60_000, max: 3 });
  const limiterB = makeRateLimiter({ windowMs: 60_000, max: 3 });
  app.post('/test-a', limiterA, (req, res) => res.status(200).json({ success: true }));
  app.post('/test-b', limiterB, (req, res) => res.status(200).json({ success: true }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('requests below the limit succeed', async () => {
  const { server, baseUrl } = await startTestApp();
  try {
    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${baseUrl}/test-a`, { method: 'POST' });
      assert.equal(res.status, 200, `request ${i + 1} should succeed`);
    }
  } finally {
    server.close();
  }
});

test('a request beyond the limit is rejected with HTTP 429 and the standard error shape', async () => {
  const { server, baseUrl } = await startTestApp();
  try {
    for (let i = 0; i < 3; i += 1) {
      await fetch(`${baseUrl}/test-a`, { method: 'POST' });
    }
    const res = await fetch(`${baseUrl}/test-a`, { method: 'POST' });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.deepEqual(body, {
      success: false,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    });
  } finally {
    server.close();
  }
});

test('two separate limiter instances keep independent quotas (one exhausted does not block the other)', async () => {
  const { server, baseUrl } = await startTestApp();
  try {
    for (let i = 0; i < 3; i += 1) {
      await fetch(`${baseUrl}/test-a`, { method: 'POST' });
    }
    const exhausted = await fetch(`${baseUrl}/test-a`, { method: 'POST' });
    assert.equal(exhausted.status, 429, 'limiter A should now be exhausted');

    const stillFresh = await fetch(`${baseUrl}/test-b`, { method: 'POST' });
    assert.equal(stillFresh.status, 200, 'limiter B must be unaffected by limiter A being exhausted');
  } finally {
    server.close();
  }
});

const routesSource = fs.readFileSync(path.join(__dirname, 'auth.routes.js'), 'utf8');

test('refresh and logout each have their own dedicated rate limiter, not a shared or reused instance', () => {
  assert.match(routesSource, /const refreshLimiter = makeRateLimiter\(/);
  assert.match(routesSource, /const logoutLimiter = makeRateLimiter\(/);
  assert.match(routesSource, /authRouter\.post\('\/refresh', refreshLimiter, refresh\)/);
  assert.match(routesSource, /authRouter\.post\('\/logout', logoutLimiter, logout\)/);
  assert.doesNotMatch(
    routesSource,
    /authRouter\.post\('\/refresh', loginLimiter|authRouter\.post\('\/logout', loginLimiter|authRouter\.post\('\/refresh', forgotLimiter|authRouter\.post\('\/logout', forgotLimiter/,
    'refresh/logout must not reuse the login or forgot-password limiter instances'
  );
});

test('the pre-existing login and forgot-password rate limits are unchanged', () => {
  assert.match(routesSource, /const loginLimiter = makeRateLimiter\(\{ windowMs: 15 \* 60 \* 1000, max: 20 \}\)/);
  assert.match(routesSource, /const forgotLimiter = makeRateLimiter\(\{ windowMs: 60 \* 60 \* 1000, max: 5 \}\)/);
  assert.match(routesSource, /authRouter\.post\('\/login', loginLimiter, login\)/);
  assert.match(routesSource, /authRouter\.post\('\/login\/mfa', loginLimiter, loginMfa\)/);
  assert.match(routesSource, /authRouter\.post\('\/password\/forgot', forgotLimiter, forgotPassword\)/);
  assert.match(routesSource, /authRouter\.post\('\/password\/reset', forgotLimiter, resetPassword\)/);
});

test('refresh and logout still have no requireAuth gate (refresh authenticates via its own cookie; logout must work even with an invalid session)', () => {
  assert.match(routesSource, /authRouter\.post\('\/refresh', refreshLimiter, refresh\);/);
  assert.match(routesSource, /authRouter\.post\('\/logout', logoutLimiter, logout\);/);
  const refreshLine = routesSource.split('\n').find((l) => l.includes("post('/refresh'"));
  const logoutLine = routesSource.split('\n').find((l) => l.includes("post('/logout'"));
  assert.doesNotMatch(refreshLine, /requireAuth/);
  assert.doesNotMatch(logoutLine, /requireAuth/);
});

test('requireAuth is still correctly applied to the routes that need it (unchanged by this fix)', () => {
  assert.match(routesSource, /authRouter\.get\('\/me', requireAuth, me\)/);
  assert.match(routesSource, /authRouter\.post\('\/mfa\/setup', requireAuth, mfaSetup\)/);
  assert.match(routesSource, /authRouter\.post\('\/mfa\/verify', requireAuth, mfaVerify\)/);
  assert.match(routesSource, /authRouter\.post\('\/mfa\/disable', requireAuth, mfaDisable\)/);
  assert.match(routesSource, /authRouter\.post\('\/password\/change', requireAuth, changePassword\)/);
});
