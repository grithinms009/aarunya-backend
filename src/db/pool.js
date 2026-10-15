/* One pool for the process. Every query is parameterised — no string interpolation
   of user input anywhere in this codebase. */
import 'dotenv/config';
import pg from 'pg';

/* Postgres returns INT8/NUMERIC as strings to avoid precision loss. Money and counts
   here are small whole numbers, so parse them back to JS numbers for clean JSON. */
pg.types.setTypeParser(20, (v) => parseInt(v, 10));   // int8
pg.types.setTypeParser(1700, (v) => parseFloat(v));   // numeric

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const query = (text, params) => pool.query(text, params);

/** Run fn inside a transaction, rolling back on any throw. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
