import mongoose from 'mongoose';
import { enqueueJob, getJob } from './backgroundRemoval.service.js';
import { isLocalDevStorageAllowed } from './localDev.storageAdapter.js';
import { isS3Configured } from '../../config/env.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

function jobView(job) {
  return {
    id: job._id.toString(),
    status: job.status,
    sourceUrl: job.sourceUrl,
    resultUrl: job.resultUrl,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

// POST /api/v1/admin/photo-processing — { sourceUrl }. Returns immediately
// with a queued job; the actual removal runs asynchronously (see
// backgroundRemoval.service.js's sequential worker). Task 7D.2: previously
// development-only; now also available in staging/production once S3 is
// configured (persistProcessedImage() in backgroundRemoval.service.js
// stores the result there instead of local disk) -- same "no fake
// success" rule as every other not-yet-configured integration in this app
// (Razorpay, S3, SMTP): rejected upfront, before a job is even created, if
// neither storage path is available.
export async function enqueuePhotoProcessing(req, res, next) {
  try {
    if (!isLocalDevStorageAllowed() && !isS3Configured()) {
      throw new ApiError(503, 'BACKGROUND_REMOVAL_NOT_CONFIGURED', 'Background removal storage is not configured on this server yet.');
    }
    const sourceUrl = (req.body?.sourceUrl || '').trim();
    if (!sourceUrl) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'sourceUrl is required.', { sourceUrl: 'Required.' });
    }

    const job = await enqueueJob({ sourceUrl, actor: actorOf(req) });

    await recordAudit({
      actor: actorOf(req),
      action: 'photoProcessing.enqueued',
      targetType: 'PhotoProcessingJob',
      targetId: job._id,
      details: { sourceUrl },
      req,
    });

    return sendSuccess(res, jobView(job), { status: 202 });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/photo-processing/:id — polled by the admin UI.
export async function getPhotoProcessingStatus(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid job id.');
    }
    const job = await getJob(req.params.id);
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'No matching processing job found.');
    return sendSuccess(res, jobView(job));
  } catch (err) {
    next(err);
  }
}
