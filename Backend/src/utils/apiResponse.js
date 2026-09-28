// LLD Section 13: API Conventions — { success, data, meta? } / { success, code, message, fieldErrors? }.
export function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function sendError(res, { status = 400, code = 'BAD_REQUEST', message, fieldErrors } = {}) {
  const body = { success: false, code, message: message || 'Request failed' };
  if (fieldErrors) body.fieldErrors = fieldErrors;
  return res.status(status).json(body);
}

export class ApiError extends Error {
  constructor(status, code, message, fieldErrors) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
