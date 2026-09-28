import { Router } from 'express';
import {
  listPostsAdmin,
  getPostAdmin,
  createPostAdmin,
  updateDraftAdmin,
  updateSlugAdmin,
  publishPostAdmin,
  unpublishPostAdmin,
  listRevisionsAdmin,
  restoreRevisionAdmin,
  listCategoriesAdmin,
  createCategoryAdmin,
  renameCategoryAdmin,
} from './blog.admin.controller.js';
import { requirePermission } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth.
// /categories must be registered before /:id so "categories" is never
// swallowed as a post id.
export const blogAdminRouter = Router();

blogAdminRouter.get('/categories', requirePermission('blog:read'), listCategoriesAdmin);
blogAdminRouter.post('/categories', requirePermission('blog:write'), createCategoryAdmin);
blogAdminRouter.patch('/categories/:id', requirePermission('blog:write'), renameCategoryAdmin);

blogAdminRouter.get('/', requirePermission('blog:read'), listPostsAdmin);
blogAdminRouter.post('/', requirePermission('blog:write'), createPostAdmin);
blogAdminRouter.get('/:id', requirePermission('blog:read'), getPostAdmin);
blogAdminRouter.put('/:id', requirePermission('blog:write'), updateDraftAdmin);
blogAdminRouter.patch('/:id/slug', requirePermission('blog:write'), updateSlugAdmin);
blogAdminRouter.post('/:id/publish', requirePermission('blog:write'), publishPostAdmin);
blogAdminRouter.post('/:id/unpublish', requirePermission('blog:write'), unpublishPostAdmin);
blogAdminRouter.get('/:id/revisions', requirePermission('blog:read'), listRevisionsAdmin);
blogAdminRouter.post('/:id/revisions/restore', requirePermission('blog:write'), restoreRevisionAdmin);
