import { Router } from 'express';
import { listDonationsAdmin, getDonationAdmin } from './donations.admin.controller.js';
import { requirePermission } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth.
export const donationsAdminRouter = Router();

donationsAdminRouter.get('/', requirePermission('donations:read'), listDonationsAdmin);
donationsAdminRouter.get('/:id', requirePermission('donations:read'), getDonationAdmin);
