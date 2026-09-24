import { Router } from 'express';
import {
  listDonationsAdmin,
  getDonationAdmin,
  listSchemesAdmin,
  createSchemeAdmin,
  updateSchemeAdmin,
} from './donations.admin.controller.js';
import { requirePermission } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth. The
// /schemes routes must be registered before '/:id' so "schemes" is never
// swallowed as a donation id.
export const donationsAdminRouter = Router();

donationsAdminRouter.get('/schemes', requirePermission('donations:read'), listSchemesAdmin);
donationsAdminRouter.post('/schemes', requirePermission('donations:write'), createSchemeAdmin);
donationsAdminRouter.patch('/schemes/:slug', requirePermission('donations:write'), updateSchemeAdmin);

donationsAdminRouter.get('/', requirePermission('donations:read'), listDonationsAdmin);
donationsAdminRouter.get('/:id', requirePermission('donations:read'), getDonationAdmin);
