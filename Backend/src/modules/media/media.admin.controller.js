import multer from 'multer';
import mongoose from 'mongoose';
import { MediaModel } from './media.model.js';
import { uploadObject, deleteObject, buildStorageKey } from './s3.adapter.js';
import { isS3Configured } from '../../config/env.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
// Extended for the CMS redesign's Document/Excel-resource field types
// (Credibility reports/collaterals/compliances, Resources page) — images/PDF/
// text were sufficient for the original Media page alone.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
]);

function kindOf(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain' || mimeType === 'text/csv') return 'document';
  if (mimeType.includes('spreadsheet') || mimeType === 'application/vnd.ms-excel') return 'document';
  if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return 'document';
  return 'other';
}

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

const rawUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } }).single('file');

// Wraps multer so a too-large/malformed upload becomes the same
// { success: false, code, message } shape as every other error in this API,
// instead of falling through to errorHandler.js's generic 500.
export function uploadMiddleware(req, res, next) {
  rawUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(413, 'FILE_TOO_LARGE', `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB limit.`));
    }
    return next(new ApiError(422, 'UPLOAD_ERROR', err.message || 'Upload failed.'));
  });
}

// GET /api/v1/admin/media
export async function listMedia(req, res, next) {
  try {
    const items = await MediaModel.find().sort({ createdAt: -1 }).lean();
    return sendSuccess(res, items);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/media — multipart, field name "file". Returns a clear
// "not configured" error until AWS_* env vars are set — no fake success,
// same rule as Razorpay order creation.
export async function createMedia(req, res, next) {
  try {
    if (!req.file) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'A file is required.', { file: 'Required.' });
    }
    if (!ALLOWED_MIME.has(req.file.mimetype)) {
      throw new ApiError(422, 'UNSUPPORTED_FILE_TYPE', `Unsupported file type "${req.file.mimetype}".`);
    }
    if (!isS3Configured()) {
      throw new ApiError(
        503,
        'MEDIA_NOT_CONFIGURED',
        'File storage is not configured on this server yet (AWS_REGION/AWS_S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY). No file was uploaded.'
      );
    }

    const key = buildStorageKey(req.file.originalname);
    const result = await uploadObject({ key, buffer: req.file.buffer, mimeType: req.file.mimetype });
    if (!result) {
      throw new ApiError(503, 'MEDIA_NOT_CONFIGURED', 'File storage is not configured on this server yet.');
    }

    const doc = await MediaModel.create({
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      kind: kindOf(req.file.mimetype),
      storageKey: key,
      url: result.url,
      altText: (req.body?.altText || '').trim(),
      uploadedBy: req.user.id,
      uploadedByEmail: req.user.email,
    });

    await recordAudit({
      actor: actorOf(req),
      action: 'media.uploaded',
      targetType: 'Media',
      targetId: doc._id,
      details: { filename: doc.filename, mimeType: doc.mimeType },
      req,
    });
    return sendSuccess(res, doc, { status: 201 });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/media/:id
export async function deleteMedia(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid media id.');
    }
    const doc = await MediaModel.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'MEDIA_NOT_FOUND', 'No matching media item found.');

    if (isS3Configured()) {
      await deleteObject({ key: doc.storageKey });
    }
    await doc.deleteOne();

    await recordAudit({
      actor: actorOf(req),
      action: 'media.deleted',
      targetType: 'Media',
      targetId: doc._id,
      details: { filename: doc.filename },
      req,
    });
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}
