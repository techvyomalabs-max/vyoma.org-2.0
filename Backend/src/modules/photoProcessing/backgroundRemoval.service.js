import dns from 'node:dns/promises';
import net from 'node:net';
import mongoose from 'mongoose';
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';
import { env, isS3Configured } from '../../config/env.js';
import { PhotoProcessingJobModel } from './photoProcessingJob.model.js';
import { saveProcessedImage, isLocalDevStorageAllowed } from './localDev.storageAdapter.js';
import { uploadObject, buildStorageKey } from '../media/s3.adapter.js';
import { ApiError } from '../../utils/apiResponse.js';

export const BG_COLOR = { r: 0xf1, g: 0xf5, b: 0xf9, alpha: 1 }; // #F1F5F9

const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // matches media.admin.controller.js's upload cap
const MAX_DIMENSION = 6000; // avoid pathological memory use on a corrupt/huge file
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const FETCH_TIMEOUT_MS = 20_000;
const JOB_TIMEOUT_MS = 90_000; // a job stuck longer than this is marked failed, never left hanging

// --- SSRF protection -------------------------------------------------------
// The admin only ever supplies a URL indirectly (whatever is already set as
// a person's photo, or a freshly uploaded Media item's URL) -- but it's
// still attacker-reachable input in principle, so this never trusts it
// blindly. Mirrors the exact host allowlist Frontend/next.config.mjs
// already uses for next/image (vyoma.org/www.vyoma.org + the S3 bucket
// pattern), plus this server's own local-dev storage host -- nothing else,
// ever. Also resolves the hostname and rejects private/loopback/link-local
// IPs, so even an allowed-looking hostname can't be re-pointed (DNS
// rebinding) at an internal service.
const ALLOWED_HOSTS = new Set(['vyoma.org', 'www.vyoma.org']);
const S3_HOST_RE = /^[a-z0-9.-]+\.s3\.[a-z0-9-]+\.amazonaws\.com$/i;

function isPrivateOrLoopback(address, family) {
  if (family === 6) {
    return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80');
  }
  const parts = address.split('.').map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 0) return true;
  return false;
}

// Throws ApiError (the same error class every other controller/service in
// this app throws -- see settings.controller.js, documents.controller.js
// uses its own raw-response convention instead, but this module's caller,
// photoProcessing.admin.controller.js, follows the ApiError/errorHandler
// convention) so that errorHandler.js's `err instanceof ApiError` check
// actually recognizes these as the intended 422/UNTRUSTED_HOST responses,
// instead of falling through to a generic 500 -- confirmed as a real bug
// during Phase 1 Task 1 regression testing: a plain Error decorated with
// .status/.code properties is not an ApiError instance, so the admin UI was
// receiving 500 INTERNAL_ERROR for every invalid/untrusted sourceUrl.
export async function assertSafeSourceUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Only http/https URLs are allowed.');
  }

  const isLocalDevHost = url.hostname === 'localhost' && String(url.port || '') === String(env.port) && url.pathname.startsWith('/local-media/');
  const isAllowedHost = ALLOWED_HOSTS.has(url.hostname) || S3_HOST_RE.test(url.hostname);
  if (!isLocalDevHost && !isAllowedHost) {
    throw new ApiError(422, 'UNTRUSTED_HOST', 'That image is not on a trusted host -- only the site\'s own media hosts are allowed.');
  }

  if (!isLocalDevHost) {
    // DNS-rebinding guard -- skipped for our own literal "localhost" dev
    // host, since that one is intentionally loopback.
    if (net.isIP(url.hostname)) {
      if (isPrivateOrLoopback(url.hostname, net.isIP(url.hostname))) {
        throw new ApiError(422, 'UNTRUSTED_HOST', 'That host is not reachable.');
      }
    } else {
      const records = await dns.lookup(url.hostname, { all: true }).catch(() => []);
      for (const r of records) {
        if (isPrivateOrLoopback(r.address, r.family)) {
          throw new ApiError(422, 'UNTRUSTED_HOST', 'That host is not reachable.');
        }
      }
    }
  }

  return url;
}

async function fetchSourceImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!res.ok) throw Object.assign(new Error(`Could not fetch the source image (HTTP ${res.status}).`), { status: 502, code: 'FETCH_FAILED' });
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength && contentLength > MAX_SOURCE_BYTES) {
      throw Object.assign(new Error('Source image is too large.'), { status: 422, code: 'FILE_TOO_LARGE' });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_SOURCE_BYTES) {
      throw Object.assign(new Error('Source image is too large.'), { status: 422, code: 'FILE_TOO_LARGE' });
    }
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function validateImage(buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw Object.assign(new Error('Could not read that file as an image.'), { status: 422, code: 'UNSUPPORTED_FILE_TYPE' });
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw Object.assign(new Error(`Unsupported image format "${meta.format}".`), { status: 422, code: 'UNSUPPORTED_FILE_TYPE' });
  }
  if (!meta.width || !meta.height || meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
    throw Object.assign(new Error('Image dimensions are outside the supported range.'), { status: 422, code: 'UNSUPPORTED_FILE_TYPE' });
  }
  return meta;
}

// Same matte-cleanup routine validated in the local POC: 1px alpha erosion,
// alpha-only feather, nearest-opaque-pixel color decontamination. Operates
// only on the edge transition band -- never the face/hair/clothing pixels
// a confidently-opaque region already has.
function refineAlpha(data, width, height) {
  const n = width * height;
  const alphaIn = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) alphaIn[i] = data[i * 4 + 3];

  const eroded = new Uint8ClampedArray(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      let m = alphaIn[idx];
      if (x > 0) m = Math.min(m, alphaIn[idx - 1]);
      if (x < width - 1) m = Math.min(m, alphaIn[idx + 1]);
      if (y > 0) m = Math.min(m, alphaIn[idx - width]);
      if (y < height - 1) m = Math.min(m, alphaIn[idx + width]);
      eroded[idx] = m;
    }
  }

  const feathered = new Uint8ClampedArray(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += eroded[yy * width + xx];
          count++;
        }
      }
      feathered[y * width + x] = Math.round(sum / count);
    }
  }

  const out = Buffer.from(data);
  const RADIUS = 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const a = feathered[idx];
      out[idx * 4 + 3] = a;
      if (a > 0 && a < 250) {
        let found = null;
        for (let r = 1; r <= RADIUS && !found; r++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
              const nIdx = yy * width + xx;
              if (alphaIn[nIdx] >= 250) { found = nIdx; break; }
            }
          }
        }
        if (found !== null) {
          out[idx * 4 + 0] = data[found * 4 + 0];
          out[idx * 4 + 1] = data[found * 4 + 1];
          out[idx * 4 + 2] = data[found * 4 + 2];
        }
      }
    }
  }
  return out;
}

async function runPipeline(sourceBuffer, mimeType) {
  const meta = await validateImage(sourceBuffer);
  const inputBlob = new Blob([sourceBuffer], { type: mimeType });
  const cutoutBlob = await removeBackground(inputBlob, { model: 'medium' });
  const cutoutBuffer = Buffer.from(await cutoutBlob.arrayBuffer());

  const { data, info } = await sharp(cutoutBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const refinedRaw = refineAlpha(data, info.width, info.height);
  const refinedCutoutPng = await sharp(refinedRaw, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();

  return sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: BG_COLOR } })
    .composite([{ input: refinedCutoutPng, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function mimeFromFormat(format) {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(message), { status: 504, code: 'PROCESSING_TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Task 7D.2 — processed-output persistence. Development is unchanged
// (local disk, via localDev.storageAdapter.js). Outside development, this
// reuses the EXACT same S3 adapter (buildStorageKey/uploadObject) the
// direct media-upload path already uses (media.admin.controller.js) --
// no second upload implementation, no new abstraction. Mirrors that same
// "no fake success" rule: if neither local-dev storage nor S3 is
// available, this throws a clear, code-tagged error rather than silently
// losing the processed image or inventing a fake URL.
//
// `upload`/`buildKey` are optional, injectable overrides (defaulting to
// the real imports) specifically so this function's success/failure
// behavior can be unit-tested directly, with a mocked implementation, with
// zero real network/AWS calls -- Node's `node:test` mock.method() cannot
// redefine a plain ES module's named exports (confirmed directly: it
// throws "Cannot redefine property"), so a plain, ordinary injectable
// parameter is the smallest mechanism that makes this testable without a
// module-loader hook or any change to production callers, which simply
// never pass the second argument and always get the real implementation.
export async function persistProcessedImage(buffer, { upload = uploadObject, buildKey = buildStorageKey } = {}) {
  if (isLocalDevStorageAllowed()) {
    return saveProcessedImage(buffer);
  }
  if (!isS3Configured()) {
    throw Object.assign(new Error('Background removal storage is not configured on this server yet.'), { code: 'NOT_CONFIGURED' });
  }
  const key = buildKey('processed.png');
  const result = await upload({ key, buffer, mimeType: 'image/png' });
  if (!result) {
    throw Object.assign(new Error('Background removal storage is not configured on this server yet.'), { code: 'NOT_CONFIGURED' });
  }
  return result;
}

// --- Strictly sequential in-process worker ----------------------------------
// No queue library exists in this codebase and none is needed for an
// admin-triggered, one-at-a-time action. `running` guarantees only one
// image is ever being processed at a time, regardless of how many jobs get
// enqueued, which is the whole point -- bounded, predictable memory use.
//
// Task 7D.7 — `pending` is exported as a mutable array reference solely so
// this module's own regression tests can deterministically seed "multiple
// jobs already queued" (e.g. push two job ids, then call workLoop() once)
// without racing enqueueJob()'s own async job-creation step. No production
// code outside this file ever imports or touches it; every real caller
// still goes through enqueueJob()/getJob() exactly as before.
export const pending = [];
let running = false;

// Task 7D.7 — logs a worker-level failure using this module's own prefix,
// consistent with this project's existing console.error-based logging
// convention (see errorHandler.js). Never logs more than a job id and an
// error message/string -- no sourceUrl, no buffer, no stack trace that
// could embed request data, matching this file's existing
// never-log-sensitive-data posture (see assertSafeSourceUrl's own header
// comment).
function logWorkerError(label, jobId, err) {
  console.error(`[photoProcessing worker] ${label} (job ${jobId}): ${err?.message || err}`);
}

// Task 7D.7 — exported (previously module-private) solely so this module's
// own regression tests can exercise the worker's failure-handling paths
// directly (e.g. calling processJob() on a job whose save() is mocked to
// fail, or calling workLoop() directly to assert `running` is correctly
// reset after an exception) without needing a real HTTP request or a timing
// race against enqueueJob()'s fire-and-forget workLoop() call. No
// production caller's behavior changes: enqueueJob() below still calls
// workLoop() the exact same way.
// `jobOptions` is forwarded as-is to each processJob() call below -- the
// same injectable-overrides object processJob() itself accepts, so a test
// can drain a multi-job queue with fast/deterministic mocked pipeline steps
// instead of the real network/ML calls. Never passed by any production
// caller (enqueueJob() below calls workLoop() with no arguments).
export async function workLoop(jobOptions) {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      // Task 7D.7 — if MongoDB is not currently connected, every job below
      // would fail at its very first save (marking it 'processing')
      // regardless of that job's own content, for the same underlying
      // reason. Draining the whole queue in that state would just be a
      // tight loop of guaranteed failures, not real progress, and the task
      // explicitly asks not to do that. Reusing the existing
      // mongoose.connection.readyState signal (already used by
      // GET /api/v1/ready, Task 7T.3) rather than inventing a new
      // retry/backoff timer: pause here and leave whatever remains in
      // `pending` for the next enqueueJob() call to pick back up once
      // connectivity is restored -- a bounded, natural recovery with no new
      // queue infrastructure.
      if (mongoose.connection.readyState !== 1) {
        console.error(
          `[photoProcessing worker] MongoDB is not connected (readyState=${mongoose.connection.readyState}); pausing with ${pending.length} job(s) still queued.`
        );
        break;
      }
      const jobId = pending.shift();
      try {
        // eslint-disable-next-line no-await-in-loop
        await processJob(jobId, jobOptions);
      } catch (err) {
        // processJob() already handles every expected failure path
        // internally (marking the job 'failed' and saving that, with its
        // own nested safeguard if even that save fails -- see its own
        // comment below). Reaching here means something escaped it
        // entirely regardless -- e.g. the initial findById/job.save() above
        // its own try block failing. This is the last line of defense: it
        // must never crash or stall this loop, and remaining queued jobs
        // must still get their turn.
        logWorkerError('unexpected error processing job', jobId, err);
      }
    }
  } finally {
    running = false;
  }
}

// Task 7D.7 — `fetchImage`/`pipeline`/`persist` are optional, injectable
// overrides (defaulting to the real implementations), the exact same
// pattern persistProcessedImage() above already established in this file:
// the smallest mechanism that lets this module's own tests exercise the
// success path and every failure path deterministically, with zero real
// network/ML/S3 calls, without changing any production caller (every real
// caller -- workLoop() below -- simply never passes the second argument).
export async function processJob(
  jobId,
  { fetchImage = fetchSourceImage, pipeline = runPipeline, persist = persistProcessedImage } = {}
) {
  const job = await PhotoProcessingJobModel.findById(jobId);
  if (!job) return;
  job.status = 'processing';
  await job.save();

  try {
    // Task 7D.2: the old `if (!isLocalDevStorageAllowed()) throw ...` gate
    // here is removed -- it only ever checked the dev-local-disk path, so
    // it would have incorrectly rejected every S3-configured staging/
    // production job before any processing even started. The controller
    // (enqueuePhotoProcessing) already gates this the same way persistence
    // now does -- dev OR S3-configured -- before a job is even created;
    // persistProcessedImage() below performs the one remaining, final
    // check (defensive against the narrow case where configuration changed
    // between enqueue and processing) immediately before it would need
    // storage, not before the real processing work.
    const url = await assertSafeSourceUrl(job.sourceUrl);
    const sourceBuffer = await withTimeout(fetchImage(url), FETCH_TIMEOUT_MS + 5000, 'Timed out fetching the source image.');
    const meta = await sharp(sourceBuffer).metadata();
    const resultBuffer = await withTimeout(
      pipeline(sourceBuffer, mimeFromFormat(meta.format)),
      JOB_TIMEOUT_MS,
      'Background removal took too long and was stopped.'
    );
    const { url: resultUrl } = await persist(resultBuffer);

    job.status = 'done';
    job.resultUrl = resultUrl;
    await job.save();
  } catch (err) {
    job.status = 'failed';
    job.errorMessage = err.message || 'Background removal failed.';
    try {
      await job.save();
    } catch (saveErr) {
      // Task 7D.7 — the confirmed Medium-severity gap this task fixes: if
      // persisting the FAILED status also fails (e.g. a transient DB
      // hiccup right after the real processing failure), this must never
      // escape processJob() uncaught -- doing so previously could reject
      // workLoop()'s own promise, which (enqueueJob() calls workLoop()
      // fire-and-forget, with no .catch()) became an unhandled promise
      // rejection: able to crash the whole Node process, and at minimum
      // stalling every other already-queued job until a new one triggered
      // a fresh workLoop(). Logging and swallowing it here means the job
      // simply remains at its last successfully-saved status ('processing')
      // rather than ever silently reporting a fake success -- never worse
      // than that.
      logWorkerError('failed to persist failed status for', jobId, saveErr);
    }
  }
}

export async function enqueueJob({ sourceUrl, actor }) {
  await assertSafeSourceUrl(sourceUrl); // fail fast, before creating a job row
  const job = await PhotoProcessingJobModel.create({
    sourceUrl,
    status: 'queued',
    createdBy: actor._id,
    createdByEmail: actor.email,
  });
  pending.push(job._id.toString());
  // Task 7D.7 — workLoop() is intentionally fire-and-forget (the HTTP
  // request that enqueued this job must not block on processing), and its
  // own try/finally plus the per-job catch above mean it should never
  // actually reject -- but this .catch() is the last line of defense
  // against an unhandled promise rejection reaching the Node process if
  // something still unexpected escapes both of those layers.
  workLoop().catch((err) => console.error(`[photoProcessing worker] workLoop() rejected unexpectedly: ${err?.message || err}`));
  return job;
}

export async function getJob(jobId) {
  return PhotoProcessingJobModel.findById(jobId);
}
