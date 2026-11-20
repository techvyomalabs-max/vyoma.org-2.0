// Task 7T.3 (Fix 3) — regression coverage for isLocalDevStorageAllowed()'s
// narrowed condition. Before this fix, `env.nodeEnv !== 'production'`
// permitted this LOCAL-FILESYSTEM-backed storage on staging too -- a real
// Render incompatibility: Render's filesystem is ephemeral (wiped on
// redeploy/restart) and saveProcessedImage() hardcodes its returned URL to
// `http://localhost:${env.port}`, meaningless to a real staging visitor's
// browser. This fix requires exactly 'development'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { isLocalDevStorageAllowed, saveProcessedImage, LOCAL_MEDIA_DIR } from './localDev.storageAdapter.js';

function withNodeEnv(nodeEnv, fn) {
  const backup = env.nodeEnv;
  env.nodeEnv = nodeEnv;
  try {
    fn();
  } finally {
    env.nodeEnv = backup;
  }
}

test('development: local filesystem storage is allowed', () => {
  withNodeEnv('development', () => {
    assert.equal(isLocalDevStorageAllowed(), true);
  });
});

test('staging: local filesystem storage is NOT allowed (Task 7T.3 Fix 3 -- previously it was)', () => {
  withNodeEnv('staging', () => {
    assert.equal(isLocalDevStorageAllowed(), false);
  });
});

test('production: local filesystem storage is NOT allowed (unchanged from before this fix)', () => {
  withNodeEnv('production', () => {
    assert.equal(isLocalDevStorageAllowed(), false);
  });
});

test('staging: saveProcessedImage() refuses before writing anything to disk, and never returns a localhost URL', () => {
  withNodeEnv('staging', () => {
    assert.throws(() => saveProcessedImage(Buffer.from('fake-image-bytes')), /disabled outside development/);
  });
});

test('production: saveProcessedImage() refuses before writing anything to disk, and never returns a localhost URL', () => {
  withNodeEnv('production', () => {
    assert.throws(() => saveProcessedImage(Buffer.from('fake-image-bytes')), /disabled outside development/);
  });
});

// Confirms the fix did not break the feature it is narrowing -- development
// behavior is unchanged: a real (tiny, throwaway) file is written and a
// usable localhost URL is returned, exactly as before this task. The file
// this test writes is deleted immediately afterward so repeated runs never
// accumulate files in .local-media/processed/. No database, network, or
// .env access of any kind is involved -- this is a local filesystem write
// to a directory this feature already owns for exactly this purpose.
test('development: saveProcessedImage() still writes to local disk and returns a usable URL (unchanged behavior)', () => {
  withNodeEnv('development', () => {
    const result = saveProcessedImage(Buffer.from('fake-image-bytes'));
    try {
      assert.match(result.url, /^http:\/\/localhost:\d+\/local-media\/processed\/.+\.png$/);
      const filename = result.url.split('/').pop();
      assert.ok(fs.existsSync(path.join(LOCAL_MEDIA_DIR, filename)), 'expected the file to actually exist on disk in development');
    } finally {
      const filename = result.url.split('/').pop();
      fs.rmSync(path.join(LOCAL_MEDIA_DIR, filename), { force: true });
    }
  });
});
