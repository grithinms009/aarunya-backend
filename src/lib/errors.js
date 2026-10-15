/* Error types the routes throw. The error middleware turns each into the JSON shape
   the admin's api layer expects: { error, message, fields? }. */

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export const badRequest  = (msg, extra) => new HttpError(400, 'bad_request', msg, extra);
/** Field-level validation, which the product editor and settings screen highlight. */
export const validation  = (fields, msg = 'Please fix the highlighted fields') =>
  new HttpError(422, 'validation', msg, { fields });
/** A business rule refused the change (stock, status flow, policy). */
export const ruleError   = (msg) => new HttpError(409, 'rule', msg);
export const conflict    = (msg) => new HttpError(409, 'conflict', msg);
export const notFound    = (msg = 'Not found') => new HttpError(404, 'not_found', msg);
export const unauthorized = (msg = 'Please sign in') => new HttpError(401, 'unauthorized', msg);
export const forbidden   = (msg = 'Not allowed') => new HttpError(403, 'forbidden', msg);

/** Wraps an async route so a rejected promise reaches the error middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
