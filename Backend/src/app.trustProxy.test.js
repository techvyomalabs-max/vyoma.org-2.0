// Task 7D.5 — regression coverage for the `trust proxy` fix. Confirmed HIGH
// severity: without this, every IP-keyed rate limiter in this app (e.g. the
// public forms-submission limiter used here, and the auth login/
// forgot-password limiters covered elsewhere) resolves req.ip to a reverse
// proxy's own address once deployed behind one, collapsing every distinct
// real visitor into ONE shared rate-limit bucket per endpoint -- once any
// single user/bot trips the limit, every OTHER visitor is blocked too, a
// self-inflicted denial of service.
//
// These tests prove the actual, observable effect on a real rate limiter
// (the public forms-submission endpoint, max 20/15min) rather than just
// inspecting app.get('trust proxy') in isolation: with trustProxy left at
// its default (false), distinct simulated clients (distinguished only by
// X-Forwarded-For, since trust proxy is off) share one bucket; with
// trustProxy set to 1 (one reverse-proxy hop), each gets its own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './config/env.js';

const ORIGINAL_TRUST_PROXY = env.trustProxy;
let server;

after(async () => {
  env.trustProxy = ORIGINAL_TRUST_PROXY;
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function startApp() {
  if (server) await new Promise((resolve) => server.close(resolve));
  const { createApp } = await import('./app.js');
  const app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function submit(baseUrl, forwardedFor) {
  return fetch(`${baseUrl}/api/v1/forms/trust-proxy-test-form/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
    },
    body: JSON.stringify({}),
  });
}

test('app.set("trust proxy") defaults to not trusting any proxy when TRUST_PROXY is unset, unchanged from this app\'s original behavior', async () => {
  env.trustProxy = false; // resolveTrustProxy({}) itself is covered directly in env.test.js
  const { createApp } = await import('./app.js');
  const app = createApp();
  assert.ok(!app.get('trust proxy'), 'app must not trust any proxy by default');
});

test('FIXED: with trust proxy left at its default (untrusted), distinct simulated clients collapse into one shared rate-limit bucket (the confirmed vulnerability, reproduced directly)', async () => {
  env.trustProxy = false;
  const baseUrl = await startApp();

  const responses = [];
  for (let i = 0; i < 21; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    responses.push(await submit(baseUrl, `10.0.0.${i}`)); // a different "client" IP on every request
  }
  const statuses = responses.map((r) => r.status);
  assert.ok(statuses.includes(429), 'expected the 21st request to be rate-limited even though every request claimed a different client IP, since trust proxy is off and X-Forwarded-For is ignored');
});

test('FIXED: with trust proxy correctly configured for one reverse-proxy hop, distinct real clients (now correctly identified via X-Forwarded-For) get independent rate-limit buckets', async () => {
  env.trustProxy = 1;
  const baseUrl = await startApp();

  // 15 requests each from two DISTINCT simulated clients -- well under the
  // max of 20 per client, but 30 total, which would have tripped a single
  // shared bucket in the previous (broken) behavior.
  const responsesA = [];
  const responsesB = [];
  for (let i = 0; i < 15; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    responsesA.push(await submit(baseUrl, '203.0.113.10'));
    // eslint-disable-next-line no-await-in-loop
    responsesB.push(await submit(baseUrl, '203.0.113.20'));
  }
  assert.ok(!responsesA.some((r) => r.status === 429), 'client A must not be rate-limited by client B\'s own requests');
  assert.ok(!responsesB.some((r) => r.status === 429), 'client B must not be rate-limited by client A\'s own requests');
});
