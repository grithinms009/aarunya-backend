# Catalogue pipeline

Tooling for the 71 proposed catalogue entries. Everything here is staging: nothing
reaches the public storefront without passing through the gates below.

## Why every entry is an unverified draft

None of the 71 designs has a merchant reference photograph. They are concepts, so each
one carries `verified: false`, `reviewState: GENERATED`, `status: draft` and `stock: 0`.
An AI photograph is not evidence that a piece exists or is in stock, and the seed script
forces draft and zero stock regardless of what the manifest says.

Material wording stays visible rather than chemical — "gold-tone", "stone-accented",
"faux pearl". Nothing claims stainless steel, gold plating, anti-tarnish, nickel-free or
waterproof, because nobody has verified them. `validate.mjs` fails the build if such a
claim appears.

## Review states

The `product` table has only `active` and `draft`, so the review workflow lives on the
manifest instead:

| State | Meaning | Can seed? |
|---|---|---|
| `GENERATED` | Data written, images not reviewed | no |
| `NEEDS_REVIEW` | Images generated, awaiting Veena | no |
| `APPROVED` | Veena confirms the piece is real and the images match | yes, as a draft |
| `PUBLISHED` | Set in the admin after stock is entered | — |

Moving to `APPROVED` is a human decision. Flag anything uncertain rather than approving it.

## Order of work

```bash
node catalogue/build-manifest.mjs      # writes manifest.json (71 entries)
node catalogue/validate.mjs            # SKUs, slugs, categories, prices, claims
node catalogue/generate-images.mjs     # plan only; needs GEMINI_API_KEY to run
node catalogue/seed-drafts.mjs         # dry run; --yes creates APPROVED entries as drafts
node catalogue/razorpay-audit.mjs      # website readiness
```

`validate.mjs` exits non-zero on any error and should gate the two steps after it.

## Images

Two files per product, never a collage:

```
catalogue/assets/products/{SKU}/{SKU}_front.webp    product only, 4:5, 1200x1500
catalogue/assets/products/{SKU}/{SKU}_model.webp    worn, 4:5, same model throughout
```

Filenames come from the SKU, so a re-run skips what exists and resumes where it stopped —
no image is paid for twice. Attempts append to `images.log.jsonl`; finished files are
recorded in `images.manifest.json`. Batches are 5 products (10 images) and the script
refuses to spend money without `--yes`.

Set `GEMINI_API_KEY` to enable generation. Without it the script prints the prompts and
exits 2 rather than writing placeholder files.

## Seeding

`seed-drafts.mjs` posts to `/api/admin/products`, the same endpoint the product form
uses, so every validation rule applies. It is idempotent: a product whose slug or SKU is
already in the catalogue is skipped, so re-running creates nothing twice. Images are
uploaded through `/api/admin/uploads` and filed by the existing pipeline.
