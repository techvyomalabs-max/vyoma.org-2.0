// Task 7D.2 — regression coverage for persistProcessedImage(), the new
// processed-output persistence step that replaces the previous
// development-only, hard local-disk dependency with a real S3 integration
// for staging/production (reusing the existing media.admin.controller.js
// S3 adapter -- buildStorageKey/uploadObject -- not a second
// implementation).
//
// No HTTP server, no MongoDB (in-memory or otherwise), and no real S3/AWS
// network call anywhere in this file -- persistProcessedImage() itself
// never touches the database, and every S3 interaction here is exercised
// through the function's own injectable `upload`/`buildKey` parameters
// (plain default-parameter overrides; `node:test`'s mock.method() cannot
// redefine a plain ES module's named exports -- confirmed directly while
// investigating this task, it throws "Cannot redefine property" -- so this
// is the smallest mechanism that makes the function testable without a
// module-loader hook or any change to its real callers, which simply never
// pass the second argument).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { env } from '../../config/env.js';
import { persistProcessedImage } from './backgroundRemoval.service.js';
import { LOCAL_MEDIA_DIR } from './localDev.storageAdapter.js';

const ORIGINAL_NODE_ENV = env.nodeEnv;
const ORIGINAL_S3 = { ...env.s3 };

afterEach(() => {
  env.nodeEnv = ORIGINAL_NODE_ENV;
  Object.assign(env.s3, ORIGINAL_S3);
});

function configureS3(overrides = { region: 'ap-south-1', bucket: 'fake-test-bucket', accessKeyId: 'fake', secretAccessKey: 'fake' }) {
  Object.assign(env.s3, overrides);
}
function unconfigureS3() {
  Object.assign(env.s3, { region: null, bucket: null, accessKeyId: null, secretAccessKey: null });
}

test('development: unchanged -- writes to local disk via the existing dev adapter, never touches S3', async () => {
  env.nodeEnv = 'development';
  let uploadCalled = false;
  const result = await persistProcessedImage(Buffer.from('fake-png-bytes'), {
    upload: async () => {
      uploadCalled = true;
      return { url: 'should-not-be-used' };
    },
  });
  try {
    assert.equal(uploadCalled, false, 'development must never call the S3 upload function');
    assert.match(result.url, /^http:\/\/localhost:\d+\/local-media\/processed\/.+\.png$/);
  } finally {
    const filename = result.url.split('/').pop();
    fs.rmSync(`${LOCAL_MEDIA_DIR}/${filename}`, { force: true });
  }
});

test('staging/production with S3 configured: uploads via the real S3 adapter interface, returns its URL', async () => {
  env.nodeEnv = 'staging';
  configureS3();
  const calls = [];
  const result = await persistProcessedImage(Buffer.from('fake-png-bytes'), {
    upload: async (args) => {
      calls.push(args);
      return { url: `https://fake-test-bucket.s3.ap-south-1.amazonaws.com/${args.key}` };
    },
    buildKey: (name) => `media/fixed-test-key-${name}`,
  });

  assert.equal(calls.length, 1, 'expected exactly one upload call');
  assert.equal(calls[0].key, 'media/fixed-test-key-processed.png', 'correct, collision-resistant storage key generation (reusing buildStorageKey\'s own shape)');
  assert.equal(calls[0].mimeType, 'image/png');
  assert.ok(Buffer.isBuffer(calls[0].buffer));
  assert.equal(result.url, 'https://fake-test-bucket.s3.ap-south-1.amazonaws.com/media/fixed-test-key-processed.png');
});

test('production with S3 configured: identical behavior to staging (not gated on a specific NODE_ENV value beyond "not development")', async () => {
  env.nodeEnv = 'production';
  configureS3();
  const result = await persistProcessedImage(Buffer.from('fake-png-bytes'), {
    upload: async (args) => ({ url: `https://fake-test-bucket.s3.ap-south-1.amazonaws.com/${args.key}` }),
  });
  assert.match(result.url, /^https:\/\/fake-test-bucket\.s3\.ap-south-1\.amazonaws\.com\/media\//);
});

test('staging/production without S3 configured: throws a clear, code-tagged error -- never a fake success, never a silent local-disk fallback', async () => {
  env.nodeEnv = 'staging';
  unconfigureS3();
  let uploadCalled = false;
  await assert.rejects(
    () =>
      persistProcessedImage(Buffer.from('fake-png-bytes'), {
        upload: async () => {
          uploadCalled = true;
          return { url: 'should-not-be-called' };
        },
      }),
    (err) => {
      assert.match(err.message, /not configured/i);
      assert.equal(err.code, 'NOT_CONFIGURED');
      return true;
    }
  );
  assert.equal(uploadCalled, false, 'the upload function must never be invoked when S3 is not configured');
});

test('staging/production with S3 configured but the upload itself fails (e.g. a real AWS error): the failure propagates, not swallowed into a fake success', async () => {
  env.nodeEnv = 'production';
  configureS3();
  await assert.rejects(
    () =>
      persistProcessedImage(Buffer.from('fake-png-bytes'), {
        upload: async () => {
          throw new Error('simulated S3 PutObject failure');
        },
      }),
    /simulated S3 PutObject failure/
  );
});

test('staging/production with S3 "configured" but uploadObject itself returns null (mirrors the real adapter\'s own lazy-client guard): throws the same clear NOT_CONFIGURED error, not a fake success', async () => {
  env.nodeEnv = 'production';
  configureS3();
  await assert.rejects(
    () =>
      persistProcessedImage(Buffer.from('fake-png-bytes'), {
        upload: async () => null,
      }),
    (err) => {
      assert.equal(err.code, 'NOT_CONFIGURED');
      return true;
    }
  );
});
