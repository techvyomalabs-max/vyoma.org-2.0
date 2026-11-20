import { Router } from 'express';
import { requirePermission } from '../../middleware/requireRole.js';
import { enqueuePhotoProcessing, getPhotoProcessingStatus } from './photoProcessing.admin.controller.js';

// Mounted under /api/v1/admin, which already applies requireAuth. Reuses
// the 'media:write' permission -- this is fundamentally a media operation
// (same trust level as uploading/replacing a file), not a new permission
// category.
export const photoProcessingAdminRouter = Router();

photoProcessingAdminRouter.post('/', requirePermission('media:write'), enqueuePhotoProcessing);
photoProcessingAdminRouter.get('/:id', requirePermission('media:write'), getPhotoProcessingStatus);
