/* Sign in, sign out, the current session and password reset.

   Both roles sign in here with an email and password. The admin panel additionally
   requires the `admin` role, which is checked by requireRole on /api/admin/**.

   Failures are deliberately uniform: a wrong email and a wrong password give the same
   message, and a reset request always reports success, so neither can be used to probe
   which addresses are registered. */
import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, tx } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { badRequest, unauthorized, wrap } from '../lib/errors.js';
import { parseBody } from '../middleware/validate.js';
import { clearSession, issueSession, requireAuth } from '../middleware/auth.js';

export const router = Router();

const BAD_LOGIN = 'That email and password don’t match. Please try again.';
const RESET_TTL_MIN = 30;

/* Throttles brute force per IP. A per-email counter is checked separately below, so
   spreading attempts across addresses from one IP is still limited. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Please wait a few minutes.' },
});

const EMAIL_WINDOW_MIN = 15;
const EMAIL_MAX_FAILS = 8;

async function recentFailures(email) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM login_attempt
      WHERE email = $1 AND ok = FALSE AND at > now() - ($2 || ' minutes')::interval`,
    [email, String(EMAIL_WINDOW_MIN)],
  );
  return rows[0].n;
}

const noteAttempt = (email, ip, ok) =>
  query(`INSERT INTO login_attempt (email, ip, ok) VALUES ($1,$2,$3)`, [email, ip, ok]);

const credentials = z.object({
  email: z.string().trim().min(1, 'Enter your email').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
});

router.post(
  '/login',
  loginLimiter,
  parseBody(credentials),
  wrap(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const ip = req.ip ?? '';

    if ((await recentFailures(email)) >= EMAIL_MAX_FAILS) {
      await noteAttempt(email, ip, false);
      throw unauthorized('Too many attempts for this account. Please try again later.');
    }

    const { rows } = await query(
      `SELECT * FROM app_user WHERE email = $1 AND active = TRUE`, [email]);
    const user = rows[0];

    /* Hash even when the account is unknown, so a missing address and a wrong password
       take the same time to answer. */
    const ok = user
      ? await verifyPassword(req.body.password, user.password_hash)
      : await verifyPassword(req.body.password, 'scrypt$16384$8$1$AAAA$AAAA');

    await noteAttempt(email, ip, !!(user && ok));
    if (!user || !ok) throw unauthorized(BAD_LOGIN);

    await query(`UPDATE app_user SET last_login_at = now() WHERE id = $1`, [user.id]);
    issueSession(res, user);
    res.json({ email: user.email, name: user.name, role: user.role });
  }),
);

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/** The admin calls this on boot to decide between the app and the login screen. */
router.get('/me', (req, res) => {
  if (!req.user) return res.json(null);
  res.json({ email: req.user.email, name: req.user.name, role: req.user.role });
});

/* ---------------------------------------------------------------- reset */

router.post(
  '/forgot-password',
  loginLimiter,
  parseBody(z.object({ email: z.string().trim().max(200) })),
  wrap(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const { rows } = await query(
      `SELECT id FROM app_user WHERE email = $1 AND active = TRUE`, [email]);

    if (rows[0]) {
      const token = randomBytes(32).toString('hex');
      await query(
        `INSERT INTO password_reset_token (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
        [rows[0].id, createHash('sha256').update(token).digest('hex'), String(RESET_TTL_MIN)],
      );
      /* Email delivery is a deployment concern; wire an SMTP provider here. Until then
         the token is logged so local development can complete the flow. */
      console.log(`[reset] ${email} token=${token} (valid ${RESET_TTL_MIN}m)`);
    }

    /* Always the same answer, whether or not the address exists. */
    res.json({ ok: true });
  }),
);

router.post(
  '/reset-password',
  loginLimiter,
  parseBody(z.object({
    token: z.string().min(10).max(200),
    password: z.string().min(6, 'Use at least 6 characters').max(200),
  })),
  wrap(async (req, res) => {
    const hash = createHash('sha256').update(req.body.token).digest('hex');
    const done = await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM password_reset_token
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
          FOR UPDATE`,
        [hash],
      );
      const row = rows[0];
      if (!row) return false;
      await c.query(`UPDATE password_reset_token SET used_at = now() WHERE id = $1`, [row.id]);
      await c.query(`UPDATE app_user SET password_hash = $1, updated_at = now() WHERE id = $2`,
        [await hashPassword(req.body.password), row.user_id]);
      return true;
    });
    if (!done) throw badRequest('That reset link has expired. Please request a new one.');
    res.json({ ok: true });
  }),
);

/* ---------------------------------------------------------------- account */

/** Name, email and password for the signed-in account (the Settings screen). */
router.patch(
  '/account',
  requireAuth,
  parseBody(z.object({
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().email('Enter a valid login email').max(200).optional(),
    password: z.string().min(6, 'Use at least 6 characters').max(200).optional(),
  })),
  wrap(async (req, res) => {
    const patch = req.body;
    const sets = [];
    const params = [];
    if (patch.name !== undefined) { params.push(patch.name); sets.push(`name = $${params.length}`); }
    if (patch.email !== undefined) {
      params.push(patch.email.toLowerCase()); sets.push(`email = $${params.length}`);
    }
    if (patch.password) {
      params.push(await hashPassword(patch.password)); sets.push(`password_hash = $${params.length}`);
    }
    if (!sets.length) return res.json({ ok: true });

    params.push(req.user.id);
    const { rows } = await query(
      `UPDATE app_user SET ${sets.join(', ')}, updated_at = now()
        WHERE id = $${params.length} RETURNING email, name, role`,
      params,
    );
    const user = rows[0];
    /* The cookie carries the email and name, so re-issue it after a change. */
    issueSession(res, { ...user, id: req.user.id });
    res.json(user);
  }),
);
