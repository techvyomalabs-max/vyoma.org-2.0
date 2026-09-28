import { sendError } from '../utils/apiResponse.js';

export function notFound(req, res) {
  return sendError(res, { status: 404, code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` });
}
