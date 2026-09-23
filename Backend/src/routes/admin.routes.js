import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { auditRouter } from '../modules/audit/audit.routes.js';
import { usersAdminRouter } from '../modules/auth/users.admin.routes.js';
import { contentAdminRouter } from '../modules/content/content.admin.routes.js';
import { formsAdminRouter } from '../modules/forms/forms.admin.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { redirectsRouter } from '../modules/redirects/redirects.routes.js';
import { donationsAdminRouter } from '../modules/donations/donations.admin.routes.js';
import { mediaAdminRouter } from '../modules/media/media.admin.routes.js';

// Single choke point for every /api/v1/admin/* route: requireAuth runs once
// here, so leaf routers below only need to add the specific requireRole /
// requirePermission check on top — there is exactly one place that decides
// "is this caller logged in at all," per Week 2 step 1 (admin route
// protection/wiring). No new auth mechanism; reuses the existing
// requireAuth/requireRole/requirePermission from Phase 2 Week 1.
export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.use('/audit-logs', auditRouter);
adminRouter.use('/users', usersAdminRouter);
adminRouter.use('/content', contentAdminRouter);
adminRouter.use('/forms', formsAdminRouter);
adminRouter.use('/settings', settingsRouter);
adminRouter.use('/redirects', redirectsRouter);
adminRouter.use('/donations', donationsAdminRouter);
adminRouter.use('/media', mediaAdminRouter);
