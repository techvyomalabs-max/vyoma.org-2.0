import { Router } from 'express';
import { listRedirects, createRedirect, updateRedirect, deleteRedirect } from './redirects.controller.js';
import { requirePermission } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth.
export const redirectsRouter = Router();

redirectsRouter.get('/', requirePermission('redirects:read'), listRedirects);
redirectsRouter.post('/', requirePermission('redirects:write'), createRedirect);
redirectsRouter.patch('/:id', requirePermission('redirects:write'), updateRedirect);
redirectsRouter.delete('/:id', requirePermission('redirects:write'), deleteRedirect);
