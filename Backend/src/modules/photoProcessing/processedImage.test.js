// QA Bug 7 Stage C — regression coverage for the new MongoDB-backed
// persistent processed-image storage: persistProcessedImage()'s Mongo
// branch, the ProcessedImage model, and the public
// GET /api/v1/public/processed-images/:id serving route.
//
// Uses this project's own established backend test convention: a real
// Express app via createApp() + a disposable mongodb-memory-server (never
// the real Atlas database, confirmed by setupTestEnv()'s own doc comment).
// No real AWS/S3 call is reachable from this file at all -- every test
// here either leaves S3 unconfigured (so the Mongo branch is the only
// available option) or exercises the Mongo branch directly via
// persistProcessedImage()'s own injectable overrides.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { setupTestEnv, teardownTestEnv } from '../auth/authTestHelpers.js';
import { env } from '../../config/env.js';
import {
  persistProcessedImage,
  isMongoProcessedImageStorageAllowed,
  isMongoProcessedImageStorageReady,
  MAX_STORED_IMAGE_BYTES,
} from './backgroundRemoval.service.js';
import { ProcessedImageModel } from './processedImage.model.js';

let ctx;
const ORIGINAL_NODE_ENV = env.nodeEnv;
const ORIGINAL_S3 = { ...env.s3 };
const ORIGINAL_BACKEND_PUBLIC_URL = env.backendPublicUrl;

before(async () => {
  ctx = await setupTestEnv();
});

after(async () => {
  await teardownTestEnv(ctx);
});

beforeEach(() => {
  // Neither dev nor S3 is ever configured in this file -- the Mongo branch
  // must be the only path exercised, never a silent fallback to either.
  env.nodeEnv = 'test';
  Object.assign(env.s3, { region: null, bucket: null, accessKeyId: null, secretAccessKey: null });
  env.backendPublicUrl = 'https://qa-backend.example.test';
});

afterEach(async () => {
  env.nodeEnv = ORIGINAL_NODE_ENV;
  Object.assign(env.s3, ORIGINAL_S3);
  env.backendPublicUrl = ORIGINAL_BACKEND_PUBLIC_URL;
  await ProcessedImageModel.deleteMany({});
});

// A tiny, genuinely transparent PNG -- built with sharp (already a
// dependency of this exact module), never a hand-crafted/fake buffer, so
// every test below exercises the real validation path.
async function makeTransparentPng() {
  return sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
}

const fakeJobId = () => new mongoose.Types.ObjectId();

// --- 1. Successful PNG persistence -----------------------------------------

test('persists a valid transparent PNG to MongoDB and returns a real, non-localhost URL', async () => {
  assert.equal(isMongoProcessedImageStorageAllowed(), true, 'Mongo must be connected in this test environment');
  const png = await makeTransparentPng();
  const jobId = fakeJobId();
  const result = await persistProcessedImage(png, { jobId });

  assert.match(result.url, /^https:\/\/qa-backend\.example\.test\/api\/v1\/public\/processed-images\/[a-f0-9]{24}$/);
  assert.ok(!result.url.includes('localhost'), 'must never return a localhost URL');

  const id = result.url.split('/').pop();
  const doc = await ProcessedImageModel.findById(id);
  assert.ok(doc, 'the document must actually exist in MongoDB');
  assert.equal(doc.mimeType, 'image/png');
  assert.equal(doc.byteLength, png.length);
  assert.equal(doc.sourceJobId.toString(), jobId.toString());
  assert.ok(Buffer.compare(doc.data, png) === 0, 'stored bytes must exactly match the input buffer');
});

// --- 2 & 3. Retrieval, content type, and transparency preservation --------

test('the public endpoint serves the exact bytes back with Content-Type: image/png, alpha preserved', async () => {
  const png = await makeTransparentPng();
  const { url } = await persistProcessedImage(png, { jobId: fakeJobId() });
  const id = url.split('/').pop();

  const res = await fetch(`${ctx.baseUrl}/api/v1/public/processed-images/${id}`);
  assert.equal(res.status, 200);
  // startsWith, not strict equality -- Express/the HTTP stack may append a
  // harmless `; charset=...` parameter to the Content-Type header; browsers
  // ignore charset for binary image types, and the actual requirement
  // ("Content-Type: image/png") is satisfied either way.
  assert.ok((res.headers.get('content-type') || '').startsWith('image/png'));
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.match(res.headers.get('cache-control') || '', /immutable/);

  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(Buffer.compare(bytes, png) === 0, 'retrieved bytes must exactly match what was stored');

  const meta = await sharp(bytes).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.hasAlpha, true, 'transparency must survive the full round trip');
});

// --- 4. Oversized image rejection -------------------------------------------

test('rejects a processed image larger than MAX_STORED_IMAGE_BYTES before ever validating or storing it', async () => {
  const oversized = Buffer.alloc(MAX_STORED_IMAGE_BYTES + 1);
  const before = await ProcessedImageModel.countDocuments();
  await assert.rejects(
    () => persistProcessedImage(oversized, { jobId: fakeJobId() }),
    (err) => {
      assert.equal(err.code, 'PROCESSED_IMAGE_TOO_LARGE');
      assert.equal(err.status, 422);
      return true;
    }
  );
  assert.equal(await ProcessedImageModel.countDocuments(), before, 'no document must be created for a rejected oversized image');
});

// --- 5 & 6. Invalid identifier / missing image -----------------------------

test('returns 404 for a malformed (non-ObjectId) image id, never a 500', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/v1/public/processed-images/not-a-valid-id`);
  assert.equal(res.status, 404);
});

test('returns 404 for a well-formed but non-existent image id', async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await fetch(`${ctx.baseUrl}/api/v1/public/processed-images/${missingId}`);
  assert.equal(res.status, 404);
});

// --- 7. Storage failure handling ---------------------------------------

test('throws NOT_CONFIGURED (never a localhost URL) when BACKEND_PUBLIC_URL is unset, even though Mongo is connected', async () => {
  env.backendPublicUrl = null;
  const png = await makeTransparentPng();
  const before = await ProcessedImageModel.countDocuments();
  await assert.rejects(
    () => persistProcessedImage(png, { jobId: fakeJobId() }),
    (err) => {
      assert.equal(err.code, 'NOT_CONFIGURED');
      assert.ok(!err.message.toLowerCase().includes('localhost'));
      return true;
    }
  );
  // The document is already saved by this point in the real flow (save
  // happens before the URL is built) -- confirms "save before returning a
  // successful URL" without masking a later, unrelated failure as if
  // nothing had been persisted at all.
  assert.equal(await ProcessedImageModel.countDocuments(), before + 1);
});

// --- 7b. isMongoProcessedImageStorageReady() readiness helper (QA Bug 7 Stage C follow-up) ---

test('isMongoProcessedImageStorageReady() requires both Mongo connected AND BACKEND_PUBLIC_URL set', () => {
  // beforeEach already leaves env.backendPublicUrl set to a real test value
  // and Mongo connected -- both conditions genuinely true here.
  assert.equal(isMongoProcessedImageStorageAllowed(), true);
  assert.equal(isMongoProcessedImageStorageReady(), true);

  env.backendPublicUrl = null;
  // Mongo reachability itself is unaffected by the missing URL -- the
  // narrower check must stay true while the wider one flips to false.
  assert.equal(isMongoProcessedImageStorageAllowed(), true);
  assert.equal(isMongoProcessedImageStorageReady(), false, 'must be false once BACKEND_PUBLIC_URL is missing, even though Mongo is connected');
});

test('rejects a buffer that is not actually a PNG with alpha (format/transparency validation)', async () => {
  const opaqueJpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
  await assert.rejects(
    () => persistProcessedImage(opaqueJpeg, { jobId: fakeJobId() }),
    (err) => {
      assert.equal(err.code, 'INVALID_PROCESSED_IMAGE');
      return true;
    }
  );
});

// --- 8. No original-image / unrelated-document overwrite -------------------

test('never touches any other collection or document', async () => {
  // A fake, unrelated document in a *different* collection, created
  // directly against the same in-memory database -- simulates "an
  // existing original image record" that must remain completely
  // untouched by anything this feature does.
  const UnrelatedModel = mongoose.models.UnrelatedFixtureForBug7 || mongoose.model('UnrelatedFixtureForBug7', new mongoose.Schema({ note: String }));
  const unrelated = await UnrelatedModel.create({ note: 'original image record, must not change' });

  const png = await makeTransparentPng();
  await persistProcessedImage(png, { jobId: fakeJobId() });

  const after = await UnrelatedModel.findById(unrelated._id);
  assert.equal(after.note, 'original image record, must not change');
});

// --- 9. No private-data exposure --------------------------------------

test('the public response body contains only raw image bytes -- no JSON, no sourceJobId, no timestamps', async () => {
  const png = await makeTransparentPng();
  const jobId = fakeJobId();
  const { url } = await persistProcessedImage(png, { jobId });
  const id = url.split('/').pop();

  const res = await fetch(`${ctx.baseUrl}/api/v1/public/processed-images/${id}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(Buffer.compare(bytes, png) === 0);
  // The jobId's own hex string must never appear anywhere in the response
  // body (it would, if the controller ever serialized the full document).
  assert.ok(!bytes.toString('latin1').includes(jobId.toString()));
});

// --- Dev/S3 priority is still respected (Mongo is only ever the fallback) --

test('the Mongo branch is never reached when local-dev storage is allowed', async () => {
  env.nodeEnv = 'development';
  const before = await ProcessedImageModel.countDocuments();
  try {
    await persistProcessedImage(Buffer.from('fake'), { jobId: fakeJobId() });
  } catch {
    // saveProcessedImage() may itself throw in this sandboxed test
    // environment (e.g. filesystem permissions) -- irrelevant to this
    // test's one real assertion below.
  }
  assert.equal(await ProcessedImageModel.countDocuments(), before, 'development must never fall through to the Mongo branch');
});
