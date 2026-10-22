import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { contentRouter } from './modules/content/content.routes.js';
import { formsRouter } from './modules/forms/forms.routes.js';
import {
  donationSchemesPublicRouter,
  donationsRouter,
  razorpayWebhookRouter,
} from './modules/donations/donations.routes.js';
import { settingsPublicRouter } from './modules/settings/settings.routes.js';
import { blogPublicRouter } from './modules/blog/blog.routes.js';
import { documentsPublicRouter } from './modules/documents/documents.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { LOCAL_MEDIA_DIR, isLocalDevStorageAllowed } from './modules/photoProcessing/localDev.storageAdapter.js';
import { redirectMiddleware } from './middleware/redirectMiddleware.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  // credentials: true — the auth refresh token travels as an HTTP-only
  // cookie (see auth.controller.js), which requires an explicit origin
  // (already the case) plus this flag, on both server and fetch() callers.
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
  // `verify` stashes the raw bytes on req.rawBody, needed for Razorpay
  // webhook signature verification (LLD 9.3) without a second body parser.
  // `limit`: raised from Express's 100kb default (Batch 8) — the
  // pages/about Content document alone now exceeds 100kb once it holds the
  // full, real 1,375-row patron dataset (Batch 5), which made every save
  // from /admin/content/about fail with a 500, for any section, not just
  // Patrons. 5mb leaves comfortable headroom for this and any other
  // Content document's future growth.
  app.use(express.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(cookieParser());

  app.get('/api/v1/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

  // Local-development-only: serves background-removal results written by
  // localDev.storageAdapter.js. Never mounted in production -- real
  // deployments use S3 (see s3.adapter.js) once this feature is extended
  // there, exactly as the comment in that adapter describes.
  //
  // Mounted at /local-media/processed (not just /local-media): LOCAL_MEDIA_DIR
  // already resolves to the "processed" subdirectory, and saveProcessedImage()
  // returns URLs shaped like /local-media/processed/<file>.png — mounting at
  // the shallower /local-media would make Express look for a nested
  // ".../processed/processed/<file>.png" that never exists, a 404 every time.
  //
  // helmet()'s default Cross-Origin-Resource-Policy: same-origin would make
  // the browser silently refuse to render this in an <img> tag on the
  // Frontend's own origin (localhost:3000 vs this server's localhost:4000) —
  // a 200 response that still shows as a broken image. Relaxed to
  // cross-origin on this one dev-only static route only; every other
  // response on this server keeps Helmet's default.
  if (isLocalDevStorageAllowed()) {
    app.use(
      '/local-media/processed',
      (req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      },
      express.static(LOCAL_MEDIA_DIR)
    );
  }

  // Order matters: every specific /public/* route must be registered
  // before the generic /public/* content wildcard.
  app.use('/api/v1/public', donationSchemesPublicRouter);
  app.use('/api/v1/public', settingsPublicRouter);
  app.use('/api/v1/public', blogPublicRouter);
  app.use('/api/v1/public', documentsPublicRouter);
  app.use('/api/v1/public', contentRouter);
  app.use('/api/v1/forms', formsRouter);
  app.use('/api/v1/donations', donationsRouter);
  app.use('/api/v1/webhooks/razorpay', razorpayWebhookRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);

  // After every real route has had a chance to match, before the generic
  // 404 — see redirectMiddleware.js for exactly what this does and doesn't
  // cover in the current dev topology.
  app.use(redirectMiddleware);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
