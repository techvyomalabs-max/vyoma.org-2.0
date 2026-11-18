import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';

const vercelOrigin = 'https://example-frontend.vercel.app';
const localhostOrigin = 'http://localhost:3000';
const blockedOrigin = 'https://untrusted.example';

let server;
let baseUrl;

test.before(async () => {
  const app = createApp();

  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function preflight(origin) {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
}

test('Vercel frontend origin is allowed', async () => {
  const res = await preflight(vercelOrigin);

  assert.equal(res.status, 204);
  assert.equal(
    res.headers.get('access-control-allow-origin'),
    vercelOrigin
  );
  assert.equal(
    res.headers.get('access-control-allow-credentials'),
    'true'
  );
});

test('localhost:3000 frontend origin is allowed', async () => {
  const res = await preflight(localhostOrigin);

  assert.equal(res.status, 204);
  assert.equal(
    res.headers.get('access-control-allow-origin'),
    localhostOrigin
  );
  assert.equal(
    res.headers.get('access-control-allow-credentials'),
    'true'
  );
});

test('untrusted origin is not allowed', async () => {
  const res = await preflight(blockedOrigin);

  assert.notEqual(
    res.headers.get('access-control-allow-origin'),
    blockedOrigin
  );
});
