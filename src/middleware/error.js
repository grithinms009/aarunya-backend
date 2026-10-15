/* One JSON error shape for the whole API: { error, message, fields? }.
   Unexpected errors are logged in full and reported generically, so internals never
   reach the client. */
import { HttpError } from '../lib/errors.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'not_found', message: 'No such endpoint' });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    const body = { error: err.code, message: err.message };
    if (err.fields) body.fields = err.fields;
    return res.status(err.status).json(body);
  }
  /* Postgres unique violation surfaced as a clean conflict. */
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'conflict', message: 'That value is already taken' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong' });
}
