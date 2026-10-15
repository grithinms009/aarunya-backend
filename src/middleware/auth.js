/* Cookie session + role guard.

   The access token is a short-lived JWT in an HTTP-only, SameSite=Lax cookie, so
   JavaScript on the page can never read it. A separate, readable CSRF cookie is
   double-submitted as a header on every mutating request. */
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { forbidden, unauthorized } from '../lib/errors.js';

export const SESSION_COOKIE = 'aj_session';
export const CSRF_COOKIE = 'aj_csrf';
const TTL_SECONDS = 60 * 60 * 8; // 8 hours

const secure = process.env.COOKIE_SECURE === 'true';

export function issueSession(res, user) {
  const token = jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: TTL_SECONDS },
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: TTL_SECONDS * 1000,
    path: '/',
  });
  /* Readable by the client on purpose: it echoes this value back in a header. */
  res.cookie(CSRF_COOKIE, randomBytes(24).toString('hex'), {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge: TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

/** Populates req.user when a valid session cookie is present. Never throws. */
export function readSession(req, _res, next) {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (raw) {
    try {
      const p = jwt.verify(raw, process.env.JWT_SECRET);
      req.user = { id: Number(p.sub), email: p.email, role: p.role, name: p.name };
    } catch {
      /* expired or tampered — treated as signed out */
    }
  }
  next();
}

export const requireAuth = (req, _res, next) =>
  req.user ? next() : next(unauthorized());

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden('This area is for store admins'));
  next();
};

/* Double-submit CSRF: the cookie is set at login and the client echoes it as a header.
   A cross-site page can make the browser send the cookie, but cannot read it to
   build the matching header. */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfGuard(req, _res, next) {
  if (SAFE.has(req.method)) return next();
  if (!req.cookies?.[SESSION_COOKIE]) return next(); // no session to protect yet
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie !== header) {
    return next(forbidden('Your session expired. Please sign in again.'));
  }
  next();
}
