/* Builds src/data/pincodes.json from the India Post directory (deploy/Pincodes.csv).
   Usage: node scripts/build-pincodes.mjs [path/to/Pincodes.csv]

   One entry per PIN: [GST state codes (comma-joined when a PIN straddles states), delivers (1/0),
   district]. A PIN "delivers" if at least one of its offices is a delivery office. Rows whose
   state is "NA" are ignored for the state; a PIN with no usable state is kept with code "". */
import { readFileSync, writeFileSync } from 'node:fs';
import { STATES } from '../src/lib/gst.js';

const src = process.argv[2] || 'deploy/Pincodes.csv';
const text = readFileSync(src, 'utf8').replace(/^﻿/, '');

function parseLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const byName = new Map(STATES.map((s) => [norm(s.name), s.code]));
[['Jammu and Kashmir', '01'], ['Andaman and Nicobar Islands', '35'], ['The Dadra and Nagar Haveli and Daman and Diu', '26'],
  ['Dadra and Nagar Haveli and Daman and Diu', '26']].forEach(([k, v]) => byName.set(norm(k), v));

const lines = text.split(/\r?\n/).filter(Boolean);
const head = parseLine(lines[0]);
const ix = Object.fromEntries(head.map((h, i) => [h, i]));
const pins = new Map();
const unknown = new Set();
for (const l of lines.slice(1)) {
  const r = parseLine(l);
  const pin = r[ix.pincode];
  if (!/^[1-9]\d{5}$/.test(pin)) continue;
  const e = pins.get(pin) ?? { states: new Set(), delivers: 0, district: '' };
  const sn = r[ix.statename];
  if (sn && sn !== 'NA') {
    const code = byName.get(norm(sn));
    if (code) e.states.add(code); else unknown.add(sn);
  }
  if (r[ix.delivery] === 'Delivery') e.delivers = 1;
  if (!e.district && r[ix.district] && r[ix.district] !== 'NA') e.district = r[ix.district];
  pins.set(pin, e);
}
if (unknown.size) throw new Error('unmapped states: ' + [...unknown].join(', '));

const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const out = {};
for (const [pin, e] of [...pins].sort()) out[pin] = [[...e.states].sort().join(','), e.delivers, title(e.district)];
writeFileSync('src/data/pincodes.json', JSON.stringify(out));
console.log(`${pins.size} PINs written; ${Object.values(out).filter((v) => v[0].includes(',')).length} span more than one state; `
  + `${Object.values(out).filter((v) => !v[0]).length} have no state; ${Object.values(out).filter((v) => !v[1]).length} have no delivery office`);
