import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env, isS3Configured } from '../../config/env.js';

// Same lazy-client pattern as razorpay.adapter.js: the real SDK is always
// imported, but never constructed (let alone called) until AWS_* env vars
// are actually set. Every function below returns null when unconfigured —
// callers turn that into a clear "not configured" error, never a fake success.
let client = null;
function getClient() {
  if (!isS3Configured()) return null;
  if (!client) {
    client = new S3Client({
      region: env.s3.region,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    });
  }
  return client;
}

export function buildStorageKey(originalFilename) {
  const dot = originalFilename.lastIndexOf('.');
  const ext = dot >= 0 ? originalFilename.slice(dot) : '';
  return `media/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

export async function uploadObject({ key, buffer, mimeType }) {
  const s3 = getClient();
  if (!s3) return null;
  await s3.send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: buffer, ContentType: mimeType }));
  return { url: `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}` };
}

export async function deleteObject({ key }) {
  const s3 = getClient();
  if (!s3) return null;
  await s3.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
  return true;
}
