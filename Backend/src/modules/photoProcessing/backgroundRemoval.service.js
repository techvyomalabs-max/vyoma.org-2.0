import dns from 'node:dns/promises';
import net from 'node:net';
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';
import { env } from '../../config/env.js';
import { PhotoProcessingJobModel } from './photoProcessingJob.model.js';
import { saveProcessedImage, isLocalDevStorageAllowed } from './localDev.storageAdapter.js';

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

export async function assertSafeSourceUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error('Not a valid URL.'), { status: 422, code: 'VALIDATION_ERROR' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw Object.assign(new Error('Only http/https URLs are allowed.'), { status: 422, code: 'VALIDATION_ERROR' });
  }

  const isLocalDevHost = url.hostname === 'localhost' && String(url.port || '') === String(env.port) && url.pathname.startsWith('/local-media/');
  const isAllowedHost = ALLOWED_HOSTS.has(url.hostname) || S3_HOST_RE.test(url.hostname);
  if (!isLocalDevHost && !isAllowedHost) {
    throw Object.assign(
      new Error('That image is not on a trusted host -- only the site\'s own media hosts are allowed.'),
      { status: 422, code: 'UNTRUSTED_HOST' }
    );
  }

  if (!isLocalDevHost) {
    // DNS-rebinding guard -- skipped for our own literal "localhost" dev
    // host, since that one is intentionally loopback.
    if (net.isIP(url.hostname)) {
      if (isPrivateOrLoopback(url.hostname, net.isIP(url.hostname))) {
        throw Object.assign(new Error('That host is not reachable.'), { status: 422, code: 'UNTRUSTED_HOST' });
      }
    } else {
      const records = await dns.lookup(url.hostname, { all: true }).catch(() => []);
      for (const r of records) {
        if (isPrivateOrLoopback(r.address, r.family)) {
          throw Object.assign(new Error('That host is not reachable.'), { status: 422, code: 'UNTRUSTED_HOST' });
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

// --- Strictly sequential in-process worker ----------------------------------
// No queue library exists in this codebase and none is needed for an
// admin-triggered, one-at-a-time action. `running` guarantees only one
// image is ever being processed at a time, regardless of how many jobs get
// enqueued, which is the whole point -- bounded, predictable memory use.
const pending = [];
let running = false;

async function workLoop() {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const jobId = pending.shift();
      await processJob(jobId);
    }
  } finally {
    running = false;
  }
}

async function processJob(jobId) {
  const job = await PhotoProcessingJobModel.findById(jobId);
  if (!job) return;
  job.status = 'processing';
  await job.save();

  try {
    if (!isLocalDevStorageAllowed()) {
      throw Object.assign(new Error('Background removal storage is not available in this environment.'), { code: 'NOT_CONFIGURED' });
    }
    const url = await assertSafeSourceUrl(job.sourceUrl);
    const sourceBuffer = await withTimeout(fetchSourceImage(url), FETCH_TIMEOUT_MS + 5000, 'Timed out fetching the source image.');
    const meta = await sharp(sourceBuffer).metadata();
    const resultBuffer = await withTimeout(
      runPipeline(sourceBuffer, mimeFromFormat(meta.format)),
      JOB_TIMEOUT_MS,
      'Background removal took too long and was stopped.'
    );
    const { url: resultUrl } = saveProcessedImage(resultBuffer);

    job.status = 'done';
    job.resultUrl = resultUrl;
    await job.save();
  } catch (err) {
    job.status = 'failed';
    job.errorMessage = err.message || 'Background removal failed.';
    await job.save();
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
  workLoop();
  return job;
}

export async function getJob(jobId) {
  return PhotoProcessingJobModel.findById(jobId);
}
