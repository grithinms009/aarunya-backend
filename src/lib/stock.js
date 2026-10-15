/* The single point of stock mutation, mirroring the admin's moveStock().

   Every caller — order placement, cancellation, offline sale, restocked return,
   replacement dispatch and manual adjustment — goes through applyStock inside its own
   transaction. It locks the variant row, clamps at zero and writes exactly one ledger
   row, so variant.stock and stock_ledger can never diverge. */

/**
 * @param client  a pg client already inside a transaction
 * @param vid     variant id
 * @param change  signed change; 0 is a no-op
 */
export async function applyStock(client, vid, change, reason, ref = '', note = '') {
  if (!change) return null;

  const { rows } = await client.query(
    `SELECT v.id, v.stock, v.sku, v.color_key, v.product_id, p.name
       FROM variant v JOIN product p ON p.id = v.product_id
      WHERE v.id = $1
      FOR UPDATE OF v`,
    [vid],
  );
  const v = rows[0];
  if (!v) return null;

  const next = Math.max(0, v.stock + change);
  /* Record what actually moved after clamping, so the ledger always adds up to stock. */
  const applied = next - v.stock;
  if (!applied) return null;

  await client.query(`UPDATE variant SET stock = $1 WHERE id = $2`, [next, vid]);
  await client.query(
    `INSERT INTO stock_ledger (product_id, variant_id, sku, name, color_key, change, reason, ref, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [v.product_id, vid, v.sku, v.name, v.color_key, applied, reason, ref, note],
  );
  return next;
}

/** Live stock for a variant, for pre-flight checks before a sale. */
export async function stockOf(client, vid) {
  const { rows } = await client.query(`SELECT stock FROM variant WHERE id = $1`, [vid]);
  return rows[0] ? rows[0].stock : 0;
}
