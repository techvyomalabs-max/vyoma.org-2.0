import { Router } from 'express';
import { submitFormHandler } from './forms.controller.js';
import { makeRateLimiter } from '../../middleware/rateLimit.js';

export const formsRouter = Router();

const submissionLimiter = makeRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

formsRouter.post('/:formKey/submissions', submissionLimiter, submitFormHandler);
