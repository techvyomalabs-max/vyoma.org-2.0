import { Router } from 'express';
import { downloadDocument } from './documents.controller.js';

export const documentsPublicRouter = Router();

// GET /api/v1/public/documents/download?url=<encoded-url>
// Must be mounted before the generic /public/* content wildcard (same
// ordering requirement already documented in content.routes.js).
documentsPublicRouter.get('/documents/download', downloadDocument);
