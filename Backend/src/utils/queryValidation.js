import { ApiError } from './apiResponse.js';

// Guards a raw req.query[...] value before it is assigned into a Mongoose
// filter. Express's default `qs` query parser turns bracket syntax (e.g.
// ?category[$regex]=.*&category[$options]=i) into a nested object, and a
// repeated key (?category=a&category=b) into an array -- either shape,
// assigned directly into a filter, lets the caller inject an arbitrary
// MongoDB query operator. A plain string is the only shape a legitimate
// value can ever take here, so anything else is rejected outright with a
// 422 -- deliberately not `String(value)`, which would silently turn an
// attempted injection into a harmless-looking (but still wrong: the
// request was malformed, not valid-and-empty) literal string such as
// "[object Object]" or "a,b" instead of surfacing the established
// validation-error response.
export function expectScalarQueryParam(value, fieldName) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ApiError(422, 'VALIDATION_ERROR', `${fieldName} must be a plain string value.`);
  }
  return value;
}
