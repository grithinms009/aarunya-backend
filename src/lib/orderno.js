/* Sequential order numbers, one series per channel: AJ1001… online, OS201… offline.

   Taken inside the caller's transaction with the table locked for the channel, so two
   checkouts racing can't be handed the same number. */

const SERIES = {
  online: { prefix: 'AJ', base: 1000 },
  offline: { prefix: 'OS', base: 200 },
};

export async function nextOrderNo(client, channel) {
  const { prefix, base } = SERIES[channel];
  const { rows } = await client.query(
    `SELECT COALESCE(max(NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::bigint), $2) AS m
       FROM "order" WHERE channel = $1`,
    [channel, base],
  );
  return prefix + (Number(rows[0].m) + 1);
}
