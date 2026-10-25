/* Creates the two sign-in accounts after a catalogue restore.
 *
 * The dump committed to this repository deliberately carries no app_user rows: these
 * repositories are public, and a password hash in a public repository is a password,
 * however it was hashed. So the accounts are made here instead, on the server.
 *
 * Unlike db/seed.js this truncates nothing — it is safe to run against a restored
 * catalogue. It does nothing at all if accounts already exist.
 *
 * Passwords come from SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD if set. If not, each is
 * generated, printed once, and never stored anywhere else.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { query } from '../src/db/pool.js';
import { hashPassword } from '../src/lib/password.js';

const { rows } = await query(`SELECT count(*)::int AS n FROM app_user`);
if (rows[0].n > 0) {
  console.log(`${rows[0].n} account(s) already exist — leaving them alone`);
  process.exit(0);
}

/* Readable but not guessable: no ambiguous characters, enough entropy to be worth
   nothing to an attacker who only has the hash. */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generate = () => Array.from(randomBytes(20))
  .map((b) => ALPHABET[b % ALPHABET.length]).join('');

const people = [
  { role: 'admin', name: process.env.SEED_ADMIN_NAME || 'Veena',
    email: (process.env.SEED_ADMIN_EMAIL || 'veena@aarunyajewels.in').toLowerCase(),
    password: process.env.SEED_ADMIN_PASSWORD || generate(),
    supplied: !!process.env.SEED_ADMIN_PASSWORD },
  { role: 'user', name: 'Aarunya Customer',
    email: (process.env.SEED_USER_EMAIL || 'user@aarunyajewels.in').toLowerCase(),
    password: process.env.SEED_USER_PASSWORD || generate(),
    supplied: !!process.env.SEED_USER_PASSWORD },
];

for (const p of people) {
  await query(
    `INSERT INTO app_user (email, name, password_hash, role) VALUES ($1,$2,$3,$4)`,
    [p.email, p.name, await hashPassword(p.password), p.role],
  );
}

console.log('\n  ACCOUNTS CREATED — copy these now, they are not shown again\n');
for (const p of people) {
  console.log(`    ${p.role.padEnd(6)} ${p.email}`);
  console.log(`           ${p.supplied ? '(the password you set in .env)' : p.password}\n`);
}
process.exit(0);
