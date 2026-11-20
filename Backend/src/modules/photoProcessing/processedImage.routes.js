import { Router } from 'express';
import { getProcessedImagePublic } from './processedImage.controller.js';

// Mounted at /api/v1/public -- QA Bug 7 Stage C. Same ordering requirement
// already documented in content.routes.js/donations.routes.js: every
// specific /public/* route must be registered before the generic
// /public/:type content wildcard, so this specific path wins.
export const processedImagesPublicRouter = Router();
processedImagesPublicRouter.get('/processed-images/:id', getProcessedImagePublic);
