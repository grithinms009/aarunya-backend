/* Rate limits, in one place.

   The production numbers are the point of the exercise; development needs headroom so
   the test suite can be run more than once an hour against a local server. The limits
   below are therefore relaxed only when NODE_ENV is not 'production', and each one can
   be overridden by an environment variable for load testing or a noisy deployment.

   Nothing here changes what a deployed server enforces. */

const dev = process.env.NODE_ENV !== 'production';

const fromEnv = (name, prod) => {
  const raw = process.env[name];
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  /* Generous in development; exactly as configured in production. */
  return dev ? prod * 200 : prod;
};

export const LIMITS = {
  /** The whole API, per minute. */
  api: fromEnv('RATE_LIMIT_API', 600),
  /** Sign-in attempts per IP, per 15 minutes. */
  login: fromEnv('RATE_LIMIT_LOGIN', 20),
  /** Checkouts per IP, per 10 minutes. */
  checkout: fromEnv('RATE_LIMIT_CHECKOUT', 20),
  /** Order-tracking lookups per IP, per 10 minutes. */
  track: fromEnv('RATE_LIMIT_TRACK', 40),
  /** Contact-form messages per IP, per hour. */
  contact: fromEnv('RATE_LIMIT_CONTACT', 10),
};
