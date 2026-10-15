/* zod validation for request bodies and query strings. Field errors come back in the
   same { fields } shape the admin's editors already render. */
import { validation } from '../lib/errors.js';

const fieldsOf = (zodError) =>
  Object.fromEntries(zodError.issues.map((i) => [i.path.join('.') || 'form', i.message]));

export const parseBody = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.body);
  if (!r.success) return next(validation(fieldsOf(r.error)));
  req.body = r.data;
  next();
};

export const parseQuery = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(validation(fieldsOf(r.error)));
  req.valid = r.data;
  next();
};
