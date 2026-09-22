import { sendError, ApiError } from '../utils/apiResponse.js';

// Central Express error middleware (LLD Section 14: "Errors"). Never leaks
// stack traces or raw provider errors to the client (LLD Section 13/16).
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return sendError(res, { status: err.status, code: err.code, message: err.message, fieldErrors: err.fieldErrors });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  return sendError(res, { status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong.' });
}
