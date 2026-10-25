/* Writes prompts.md: every prompt in the manifest, grouped into the same batches of 5
 * products the API pipeline uses, ready to paste into a browser image generator.
 *
 * This is the free route. Google AI Studio runs the same Gemini image models in the
 * browser at no cost, so the work is manual rather than metered. Generate, download,
 * drop the files into catalogue/inbox/ and run import-images.mjs, which does the
 * renaming, the 4:5 crop and the dimension checks. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontPrompt, modelPrompt } from './generate-images.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
const BATCH = 5;

/* Ten images per batch, which is five products — the most the generator takes at once. */
const IMAGES_PER_BATCH = 10;

const jobs = m.products.flatMap((p) => [
  { p, kind: 'front', file: `${p.sku}_front.png`, prompt: frontPrompt(p) },
  { p, kind: 'model', file: `${p.sku}_model.png`, prompt: modelPrompt(p) },
]);
const batches = [];
for (let i = 0; i < jobs.length; i += IMAGES_PER_BATCH)
  batches.push(jobs.slice(i, i + IMAGES_PER_BATCH));

const out = [
  '# Image prompts',
  '',
  `${m.products.length} products, ${jobs.length} images, ${batches.length} batches of up to `
  + `${IMAGES_PER_BATCH}.`,
  '',
  'Each batch is one request. Paste the whole numbered block; the numbering is what keeps',
  'the returned images matched to their filenames.',
  '',
  '**Save each image under the filename given beside it** and drop them all into',
  '`catalogue/inbox/`. Then run `node catalogue/import-images.mjs`, which crops to',
  '1200x1500, files each one by SKU and reports anything still missing.',
  '',
  'The prompts say only what the piece is and how it is framed. The model, styling and',
  'photographic look are left to the generator that already holds them.',
  '',
];

batches.forEach((batch, bi) => {
  out.push('', '---', '',
    `## Batch ${bi + 1} of ${batches.length} — ${batch.length} images`, '',
    '```');
  batch.forEach((j, i) => out.push(`${i + 1}. [${j.file}] ${j.prompt}`));
  out.push('```', '');
  out.push('Files from this batch: ' + batch.map((j) => j.file).join(', '), '');
});

writeFileSync(join(HERE, 'prompts.md'), out.join('\n'));
console.log(`wrote prompts.md — ${m.products.length} products, ${jobs.length} images, `
  + `${batches.length} batches of up to ${IMAGES_PER_BATCH}`);
