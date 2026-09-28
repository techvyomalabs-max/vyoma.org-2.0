import { Router } from 'express';
import { listUsers, createUser, disableUser, enableUser } from './users.admin.controller.js';
import { requireRole } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth — every
// route here only needs the role check on top. Super Admin only: normal
// Admins have no user-management permission at all (not even read), per
// Week 2 scope ("Admin must NOT be allowed to perform Super-Admin-only
// user-management actions").
export const usersAdminRouter = Router();

usersAdminRouter.get('/', requireRole('super_admin'), listUsers);
usersAdminRouter.post('/', requireRole('super_admin'), createUser);
usersAdminRouter.patch('/:id/disable', requireRole('super_admin'), disableUser);
usersAdminRouter.patch('/:id/enable', requireRole('super_admin'), enableUser);
