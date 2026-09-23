import { Router } from 'express';
import { requirePermission } from '../../middleware/requireRole.js';
import { listMedia, createMedia, deleteMedia, uploadMiddleware } from './media.admin.controller.js';

// Mounted under /api/v1/admin, which already applies requireAuth.
export const mediaAdminRouter = Router();

mediaAdminRouter.get('/', requirePermission('media:read'), listMedia);
mediaAdminRouter.post('/', requirePermission('media:write'), uploadMiddleware, createMedia);
mediaAdminRouter.delete('/:id', requirePermission('media:write'), deleteMedia);
