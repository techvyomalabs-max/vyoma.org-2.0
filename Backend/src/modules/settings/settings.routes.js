import { Router } from 'express';
import { getSettings, updateSettings } from './settings.controller.js';
import { requirePermission } from '../../middleware/requireRole.js';

// Mounted under /api/v1/admin, which already applies requireAuth.
export const settingsRouter = Router();

settingsRouter.get('/', requirePermission('settings:read'), getSettings);
settingsRouter.put('/', requirePermission('settings:write'), updateSettings);
