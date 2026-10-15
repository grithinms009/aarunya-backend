/* CSV export shared by products, orders and inventory. */
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const toCsv = (headers, rows) =>
  [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');

export function sendCsv(res, filename, headers, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(headers, rows));
}
