import { Router } from 'express';
import {
  login,
  loginMfa,
  refresh,
  logout,
  me,
  mfaSetup,
  mfaVerify,
  mfaDisable,
  forgotPassword,
  resetPassword,
  changePassword,
} from './auth.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { makeRateLimiter } from '../../middleware/rateLimit.js';

export const authRouter = Router();

// LLD Section 16: rate limiting on authentication endpoints, on top of the
// per-account lockout in auth.controller.login.
const loginLimiter = makeRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const forgotLimiter = makeRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

authRouter.post('/login', loginLimiter, login);
authRouter.post('/login/mfa', loginLimiter, loginMfa);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);

authRouter.post('/mfa/setup', requireAuth, mfaSetup);
authRouter.post('/mfa/verify', requireAuth, mfaVerify);
authRouter.post('/mfa/disable', requireAuth, mfaDisable);

authRouter.post('/password/forgot', forgotLimiter, forgotPassword);
authRouter.post('/password/reset', forgotLimiter, resetPassword);
authRouter.post('/password/change', requireAuth, changePassword);
