/* scrypt from node's crypto — strong, memory-hard, and no native build step.
   Format: scrypt$N$r$p$salt$hash, so parameters can change without breaking old hashes. */
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);
const N = 16384, r = 8, p = 1, KEYLEN = 64;

export async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, KEYLEN, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(plain, stored) {
  try {
    const [scheme, n, rr, pp, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const key = await scrypt(plain, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(n), r: Number(rr), p: Number(pp),
    });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
