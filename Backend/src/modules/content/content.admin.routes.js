import { Router } from 'express';
import {
  getAdminContent,
  upsertDraftContent,
  previewContent,
  publishContent,
  unpublishContent,
  listRevisions,
  restoreRevision,
} from './content.admin.controller.js';
import { requirePermission } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth. `type`
// travels as a query param / body field (not a URL path segment) throughout
// this router, deliberately — content types contain slashes (e.g.
// "pages/home") and mixing a slash-containing value into an Express 4
// wildcard path alongside fixed suffixes like /publish is fragile; a query
// param sidesteps that entirely.
export const contentAdminRouter = Router();

contentAdminRouter.get('/', requirePermission('content:read'), getAdminContent);
contentAdminRouter.put('/', requirePermission('content:write'), upsertDraftContent);
contentAdminRouter.get('/preview', requirePermission('content:read'), previewContent);
contentAdminRouter.post('/publish', requirePermission('content:write'), publishContent);
contentAdminRouter.post('/unpublish', requirePermission('content:write'), unpublishContent);
contentAdminRouter.get('/revisions', requirePermission('content:read'), listRevisions);
contentAdminRouter.post('/revisions/restore', requirePermission('content:write'), restoreRevision);
