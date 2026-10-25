/* Files hand-generated images into the catalogue.
 *
 * Drop downloads into catalogue/inbox/ named {SKU}_front.* or {SKU}_model.*, then run
 * this. Each one is cropped to the catalogue's 4:5 at 1200x1500, written to
 * assets/products/{SKU}/, and recorded in images.manifest.json.
 *
 * Uses macOS sips, so there is no image library to install. Anything it cannot place is
 * reported and left in the inbox rather than guessed at. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const INBOX = join(HERE, 'inbox');
const IMG_MANIFEST = join(HERE, 'images.manifest.json');
const W = 1200, H = 1500;

const m = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
const bySku = new Map(m.products.map((p) => [p.sku, p]));

if (!existsSync(INBOX)) { mkdirSync(INBOX, { recursive: true });
  console.log(`created ${INBOX}\ndrop files named {SKU}_front.png / {SKU}_model.png in it.`); process.exit(0); }

const im = existsSync(IMG_MANIFEST) ? JSON.parse(readFileSync(IMG_MANIFEST, 'utf8')) : { images: {} };
const files = readdirSync(INBOX).filter((f) => /\.(png|jpe?g|webp|heic)$/i.test(f));

let placed = 0; const problems = [];
for (const f of files) {
  const stem = basename(f, extname(f));
  const mt = /^(AJ-[A-Z]{2}\d{3}-[A-Z]{3})[_-](front|model)$/i.exec(stem);
  if (!mt) { problems.push(`${f}: name must be {SKU}_front or {SKU}_model`); continue; }

  const [, sku, kindRaw] = mt;
  const kind = kindRaw.toLowerCase();
  const p = bySku.get(sku.toUpperCase());
  if (!p) { problems.push(`${f}: ${sku} is not in the manifest`); continue; }

  const dest = join(HERE, kind === 'front' ? p.images.front : p.images.onModel);
  mkdirSync(dirname(dest), { recursive: true });
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '86',
      '-Z', String(H), '--cropToHeightWidth', String(H), String(W),
      join(INBOX, f), '--out', dest], { stdio: 'ignore' });
  } catch { problems.push(`${f}: sips could not convert it`); continue; }

  /* Prove the result really is the catalogue's shape before trusting it. */
  const dims = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', dest]).toString();
  const w = +(/pixelWidth: (\d+)/.exec(dims)?.[1]); const h = +(/pixelHeight: (\d+)/.exec(dims)?.[1]);
  if (w !== W || h !== H) { problems.push(`${f}: came out ${w}x${h}, expected ${W}x${H}`); continue; }

  im.images[`${sku}_${kind}`] = { sku, kind, bytes: statSync(dest).size,
    file: dest.slice(dest.indexOf('assets/')), source: 'manual', at: new Date().toISOString() };
  console.log(`  placed ${sku} ${kind}  ${w}x${h}`);
  placed++;
}

writeFileSync(IMG_MANIFEST, JSON.stringify(im, null, 2));

/* What is still missing, so the next session knows where to pick up. */
const missing = m.products.flatMap((p) => ['front', 'model']
  .filter((k) => !im.images[`${p.sku}_${k}`]).map((k) => `${p.sku}_${k}`));
console.log(`\n${placed} placed, ${problems.length} problem(s), ${missing.length} of ${m.products.length * 2} still missing`);
for (const q of problems) console.log('  ! ' + q);
if (missing.length) console.log(`  next: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`);
