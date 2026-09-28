import { Router } from 'express';
import { getPublicContentByType } from './content.controller.js';

export const contentRouter = Router();

// Wildcard so multi-segment types like "pages/home" work (Express 4 syntax —
// req.params[0] holds the matched remainder). Mounted at /api/v1/public in
// app.js — mount this AFTER any more specific /public/* route (e.g.
// donation-schemes) so those aren't shadowed.
contentRouter.get('/*', getPublicContentByType);
