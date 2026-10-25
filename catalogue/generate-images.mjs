/* Two-image generation pipeline for the proposed catalogue.
 *
 * Reads manifest.json, builds a front and an on-model prompt per product, and writes
 *
 *   catalogue/assets/products/{SKU}/{SKU}_front.webp
 *   catalogue/assets/products/{SKU}/{SKU}_model.webp
 *
 * Filenames are derived from the SKU, so a re-run finds what already exists and skips
 * it: the job resumes, and no image is paid for twice. Every attempt is appended to
 * images.log.jsonl and every finished file is recorded in images.manifest.json.
 *
 * It generates nothing unless an API key is configured. With no key it prints the
 * prompts it would have sent and exits non-zero, rather than inventing files.
 *
 *   node catalogue/generate-images.mjs                 # plan only, no calls
 *   node catalogue/generate-images.mjs --batch 1       # one batch of 5 products
 *   node catalogue/generate-images.mjs --all --yes     # everything, after approval
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, 'assets', 'products');
const LOG = join(HERE, 'images.log.jsonl');
const IMG_MANIFEST = join(HERE, 'images.manifest.json');

const BATCH_SIZE = 5;              /* products per batch, so 10 images */
const WIDTH = 1200, HEIGHT = 1500; /* 4:5 */

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
/* The stable image model, confirmed present on this key by the models endpoint. A
   preview id of the same family also exists; override with GEMINI_IMAGE_MODEL. */
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n) => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1]; };

const m = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));

/* ---------------------------------------------------------------- prompts */

/* Deliberately spare.
 *
 * These prompts say what the piece is and how it is framed, and stop. No skin tone, no
 * outfit, no lighting, no camera language: the generator being used already holds the
 * brand's model and photographic style, and repeating it here would fight that rather
 * than help it. Keep it this way — describing the look again is how a set stops
 * matching the ones already shot. */

export function frontPrompt(p) {
  return `Product-only photo of ${p.productName}: ${p.style.toLowerCase()}. `
    + `Gold-tone. Plain beige background, no hands, no model, no text. 4:5 portrait.`;
}

export function modelPrompt(p) {
  return `${p.productName} worn: ${p.style.toLowerCase()}. `
    + `Close-up of ${p.framing}. 4:5 portrait.`;
}

/* ---------------------------------------------------------------- state */

const loadImgManifest = () =>
  existsSync(IMG_MANIFEST) ? JSON.parse(readFileSync(IMG_MANIFEST, 'utf8')) : { images: {} };

const log = (row) => appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n');

/** A file counts as done only if it exists and is not a stub. */
const done = (path) => existsSync(path) && statSync(path).size > 1024;

/** The jobs still outstanding, in manifest order. */
function outstanding() {
  const jobs = [];
  for (const p of m.products) {
    for (const kind of ['front', 'model']) {
      const file = join(ASSETS, p.sku, `${p.sku}_${kind}.webp`);
      if (done(file)) continue;
      jobs.push({ sku: p.sku, kind, file,
        prompt: kind === 'front' ? frontPrompt(p) : modelPrompt(p) });
    }
  }
  return jobs;
}

/* ---------------------------------------------------------------- generate */

async function generate(job) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: job.prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);

  const body = await res.json();
  const part = body.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data);
  if (!part) throw new Error('no image in response');

  const buf = Buffer.from(part.inlineData.data, 'base64');
  if (buf.length < 1024) throw new Error(`implausibly small image (${buf.length} bytes)`);

  mkdirSync(dirname(job.file), { recursive: true });
  writeFileSync(job.file, buf);
  return buf.length;
}

/* ---------------------------------------------------------------- run */

/* Only when run directly. export-prompts.mjs imports the two prompt builders above,
   and must not trigger a generation run by doing so. */
const RUN_DIRECTLY = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (!RUN_DIRECTLY) { /* imported for its prompts */ } else {

const jobs = outstanding();
const batches = Math.ceil(jobs.length / (BATCH_SIZE * 2));

console.log(`${m.products.length} products in the manifest`);
console.log(`${jobs.length} images still to generate (${batches} batch(es) of ${BATCH_SIZE} products)`);

if (!API_KEY) {
  console.log('\nNO IMAGE API CONFIGURED.');
  console.log('Set GEMINI_API_KEY (and optionally GEMINI_IMAGE_MODEL) to generate.');
  console.log('Nothing was generated and no placeholder files were written.\n');
  console.log('Sample of the prompts that would be sent:\n');
  for (const j of jobs.slice(0, 2)) console.log(`--- ${j.sku} ${j.kind} ---\n${j.prompt}\n`);
  process.exit(2);
}

/* Paid work needs a human to say go. */
const pick = flag('all') ? jobs : jobs.slice(0, (Number(val('batch') || 1)) * BATCH_SIZE * 2);
if (!flag('yes')) {
  console.log(`\nWould generate ${pick.length} image(s) with ${MODEL}.`);
  console.log('This calls a paid API. Re-run with --yes to confirm.');
  process.exit(3);
}

const im = loadImgManifest();
let ok = 0, failed = 0;
for (const job of pick) {
  try {
    const bytes = await generate(job);
    im.images[`${job.sku}_${job.kind}`] = {
      sku: job.sku, kind: job.kind, bytes,
      file: job.file.slice(job.file.indexOf('assets/')),
      model: MODEL, at: new Date().toISOString(),
    };
    writeFileSync(IMG_MANIFEST, JSON.stringify(im, null, 2));
    log({ sku: job.sku, kind: job.kind, result: 'ok', bytes });
    console.log(`  ok    ${job.sku} ${job.kind} (${bytes} bytes)`);
    ok++;
  } catch (e) {
    log({ sku: job.sku, kind: job.kind, result: 'failed', error: String(e.message) });
    console.log(`  FAIL  ${job.sku} ${job.kind} — ${e.message}`);
    failed++;
  }
}
console.log(`\n${ok} generated, ${failed} failed. Re-run to retry only what is missing.`);

} /* end run-as-script */
