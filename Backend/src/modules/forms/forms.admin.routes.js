import { Router } from 'express';
import { listSubmissions, getSubmission, updateSubmission } from './forms.admin.controller.js';
import { requirePermission } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth.
export const formsAdminRouter = Router();

formsAdminRouter.get('/', requirePermission('forms:read'), listSubmissions);
formsAdminRouter.get('/:id', requirePermission('forms:read'), getSubmission);
formsAdminRouter.patch('/:id', requirePermission('forms:write'), updateSubmission);
