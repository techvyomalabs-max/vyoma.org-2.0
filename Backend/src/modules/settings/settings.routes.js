import { Router } from 'express';
import { getSettings, updateSettings, getPublicSettings } from './settings.controller.js';
import { requirePermission } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth.
export const settingsRouter = Router();

settingsRouter.get('/', requirePermission('settings:read'), getSettings);
settingsRouter.put('/', requirePermission('settings:write'), updateSettings);

// Mounted at /api/v1/public — must be registered BEFORE the generic content
// wildcard route, same reason as donationSchemesPublicRouter.
export const settingsPublicRouter = Router();
settingsPublicRouter.get('/settings', getPublicSettings);
