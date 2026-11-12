// Security regression coverage: JWT SECURITY (B).
// Exercises requireAuth (src/middleware/requireAuth.js) against the real
// app via GET /api/v1/auth/me -- the simplest route gated by requireAuth
// alone, with no additional role/permission layer to confuse the signal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { RoleModel } from './role.model.js';
import { signAccessToken } from './auth.service.js';
import { env } from '../../config/env.js';
import { setupTestEnv, teardownTestEnv, createTestUser } from './authTestHelpers.js';

let envCtx;
let user;
let role;

before(async () => {
  envCtx = await setupTestEnv();
  user = await createTestUser({ email: 'jwt-subject@example.test', roleKey: 'admin' });
  role = await RoleModel.findOne({ key: 'admin' });
});

after(async () => {
  await teardownTestEnv(envCtx);
});

async function callMe(authorizationHeader) {
  const headers = {};
  if (authorizationHeader !== undefined) headers.authorization = authorizationHeader;
  return fetch(`${envCtx.baseUrl}/api/v1/auth/me`, { headers });
}

test('a valid, correctly signed access token is accepted', async () => {
  const token = signAccessToken(user, role);
  const res = await callMe(`Bearer ${token}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.email, 'jwt-subject@example.test');
});

test('a token signed with the wrong secret (bad signature) is rejected', async () => {
  const forged = jwt.sign(
    { sub: String(user._id), email: user.email, roleKey: user.roleKey, permissions: ['*'] },
    'not-the-real-secret',
    { expiresIn: '15m' }
  );
  const res = await callMe(`Bearer ${forged}`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'UNAUTHENTICATED');
});

test('an expired access token is rejected', async () => {
  const expired = jwt.sign(
    { sub: String(user._id), email: user.email, roleKey: user.roleKey, permissions: [] },
    env.auth.accessTokenSecret,
    { expiresIn: '-10s' }
  );
  const res = await callMe(`Bearer ${expired}`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'UNAUTHENTICATED');
});

test('a missing Authorization header is rejected', async () => {
  const res = await callMe(undefined);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, 'UNAUTHENTICATED');
  assert.match(body.message, /Missing or malformed/);
});

test('a malformed Authorization header (wrong scheme, or Bearer with no token) is rejected', async () => {
  const wrongScheme = await callMe('Token abc.def.ghi');
  assert.equal(wrongScheme.status, 401);

  const bearerNoToken = await callMe('Bearer');
  assert.equal(bearerNoToken.status, 401);

  const bearerEmptyToken = await callMe('Bearer ');
  assert.equal(bearerEmptyToken.status, 401);
});

test('a syntactically-invalid token string is rejected, not a 500', async () => {
  const res = await callMe('Bearer this.is.not-a-jwt');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'UNAUTHENTICATED');
});
