import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

// LOCAL DEVELOPMENT ONLY. This is deliberately a separate file from
// s3.adapter.js, with a different name and a different (filesystem-backed)
// interface -- it must never be reached for real production traffic.
// Production storage for processed photos is a future task: either reuse
// s3.adapter.js's uploadObject() directly, or add the result as a new
// MediaModel row the same way a normal upload does. Nothing here is meant
// to survive that swap; it exists purely so this feature's full
// upload -> process -> preview -> accept -> Save Draft -> Publish loop can
// be exercised on a developer machine without AWS credentials.
//
// Files are written to a real directory on disk (not an in-memory map),
// specifically so a processed result is still reachable after a backend
// restart -- a plain blob: URL or an in-memory buffer would not survive
// that, which is exactly what was ruled out for this feature.
export const LOCAL_MEDIA_DIR = path.resolve(process.cwd(), '.local-media', 'processed');

function ensureDir() {
  fs.mkdirSync(LOCAL_MEDIA_DIR, { recursive: true });
}

// Guards against ever being wired into a real deployment by accident --
// callers (the processing service) check this before using the adapter at
// all, and app.js only mounts the matching static route outside production.
export function isLocalDevStorageAllowed() {
  return env.nodeEnv !== 'production';
}

export function saveProcessedImage(buffer) {
  if (!isLocalDevStorageAllowed()) {
    throw new Error('Local filesystem storage is disabled outside development.');
  }
  ensureDir();
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.png`;
  fs.writeFileSync(path.join(LOCAL_MEDIA_DIR, filename), buffer);
  // Absolute URL to the Backend's own dev server -- the Frontend admin UI
  // renders this directly as an <img src>, same as any S3 URL would be.
  const base = `http://localhost:${env.port}`;
  return { url: `${base}/local-media/processed/${filename}` };
}
