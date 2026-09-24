import { Router } from 'express';
import {
  listDonationSchemes,
  getDonationSchemeBySlug,
  createDonationOrder,
  verifyDonation,
  razorpayWebhook,
} from './donations.controller.js';
import { makeRateLimiter } from '../../middleware/rateLimit.js';

// Mounted at /api/v1/public — must be registered BEFORE the generic content
// wildcard route (which also lives under /public) so this specific path wins.
export const donationSchemesPublicRouter = Router();
donationSchemesPublicRouter.get('/donation-schemes', listDonationSchemes);
donationSchemesPublicRouter.get('/donation-schemes/:slug', getDonationSchemeBySlug);

// Mounted at /api/v1/donations
export const donationsRouter = Router();
const donationLimiter = makeRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
donationsRouter.post('/orders', donationLimiter, createDonationOrder);
donationsRouter.post('/verify', donationLimiter, verifyDonation);

// Mounted at /api/v1/webhooks/razorpay
export const razorpayWebhookRouter = Router();
razorpayWebhookRouter.post('/', razorpayWebhook);
