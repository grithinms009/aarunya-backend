/* Typed facade over the `setting` key/value table. The config block is one row so it
   can be read and written whole, exactly as the admin's Settings screen expects. */
import { query } from '../db/pool.js';

export const CONFIG_KEY = 'config';

export async function getConfig() {
  const { rows } = await query(`SELECT value FROM setting WHERE key = $1`, [CONFIG_KEY]);
  return rows[0] ? rows[0].value : {};
}

export async function saveConfig(patch, client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(`SELECT value FROM setting WHERE key = $1 FOR UPDATE`, [CONFIG_KEY]);
  const next = { ...(rows[0]?.value ?? {}), ...patch };
  await run(
    `INSERT INTO setting (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [CONFIG_KEY, JSON.stringify(next)],
  );
  return next;
}

/** Low-stock threshold, with the same fallback the admin uses. */
export const lowStockOf = (config) => Number(config.LOW_STOCK) || 2;
