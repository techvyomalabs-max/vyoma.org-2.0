import { Router } from 'express';
import { listAuditLogs } from './audit.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';

export const auditRouter = Router();
auditRouter.get('/', requireAuth, requireRole('super_admin'), listAuditLogs);
