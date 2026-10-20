/* Image uploads.

   Product photos, category cards and banner artwork are posted here and written to disk
   under UPLOAD_DIR, then served read-only from /uploads. The database stores the URL,
   never the bytes, so rows stay small and images can move behind a CDN later by changing
   only what this module returns.

   Files are filed as:

     uploads/<purpose>/<year>/<month>/<name>-<id>.<ext>
     e.g. uploads/category/2026/10/necklaces-a1b2c3d4.jpg

   The purpose keeps product photos apart from banners, the year and month stop any one
   directory growing without bound and make a backup easy to scope, and the leading name
   is a slug of what the image is for, so the folder is readable rather than a wall of
   UUIDs. The random suffix is what actually guarantees uniqueness.

   The image arrives as a base64 data URL, which is what the browser already produces when
   it downscales the file before upload. Everything is checked server-side: declared type
   against an allow-list, the real magic bytes, and the decoded size. */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { slugify } from '../lib/format.js';
import { z } from 'zod';
import { badRequest, wrap } from '../lib/errors.js';
import { parseBody } from '../middleware/validate.js';

export const router = Router();

export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? process.env.UPLOAD_DIR
  : join(process.cwd(), 'uploads');

const MAX_BYTES = 6 * 1024 * 1024;

/** Extension and magic-byte signature per accepted type. */
const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { ext: 'png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/webp': { ext: 'webp', magic: [[0x52, 0x49, 0x46, 0x46]] },
  'image/gif': { ext: 'gif', magic: [[0x47, 0x49, 0x46, 0x38]] },
};

const startsWith = (buf, sig) => sig.every((b, i) => buf[i] === b);

/** Folders uploads may be filed under, so a caller can't write anywhere it likes. */
const PURPOSES = ['product', 'category', 'banner', 'offer'];

router.post('/', parseBody(z.object({
  /* data:image/jpeg;base64,…  — the shape the browser produces after downscaling. */
  data: z.string().min(16).max(12_000_000),
  purpose: z.enum(PURPOSES).default('product'),
  /* What the image is for — a product or category name. Used to make the file name
     readable; it never decides where the file lands, so it cannot escape the folder. */
  name: z.string().max(120).default(''),
})), wrap(async (req, res) => {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(req.body.data);
  if (!match) throw badRequest('Please choose an image file');

  const [, declared, b64] = match;
  const type = TYPES[declared.toLowerCase()];
  if (!type) throw badRequest('Use a JPG, PNG, WebP or GIF image');

  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    throw badRequest('That image could not be read');
  }
  if (!buf.length) throw badRequest('That image could not be read');
  if (buf.length > MAX_BYTES) {
    throw badRequest(`That image is too large. Keep it under ${MAX_BYTES / 1024 / 1024} MB.`);
  }
  /* The declared type has to match what the bytes actually are. */
  if (!type.magic.some((sig) => startsWith(buf, sig))) {
    throw badRequest('That file is not the image type it claims to be');
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');

  /* Slugged for readability and trimmed, with a random suffix for uniqueness. Anything
     the slug cannot represent falls back to the purpose, so the name is never empty. */
  const stem = (slugify(req.body.name).slice(0, 48) || req.body.purpose).replace(/^-+|-+$/g, '');
  const file = `${stem}-${randomUUID().slice(0, 8)}.${type.ext}`;

  const relative = `${req.body.purpose}/${year}/${month}/${file}`;
  const dir = join(UPLOAD_DIR, req.body.purpose, year, month);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, file), buf);

  res.status(201).json({
    url: `/uploads/${relative}`,
    bytes: buf.length,
    contentType: declared.toLowerCase(),
  });
}));

/**
 * Removes an upload this API wrote.
 *
 * The path is matched against the exact shape this module produces and rebuilt from the
 * captured parts, so nothing outside the uploads tree can be reached — no traversal, no
 * absolute paths, no deleting a directory.
 */
router.delete('/', parseBody(z.object({ url: z.string().max(500) })), wrap(async (req, res) => {
  const m = /^\/uploads\/([a-z]+)\/(\d{4})\/(\d{2})\/([A-Za-z0-9][A-Za-z0-9-]*\.[a-z0-9]+)$/
    .exec(req.body.url);
  if (!m || !PURPOSES.includes(m[1])) throw badRequest('That is not an uploaded image');
  const [, purpose, year, month, file] = m;
  try {
    await unlink(join(UPLOAD_DIR, purpose, year, month, file));
  } catch {
    /* Already gone is a success for the caller. */
  }
  res.json({ ok: true });
}));
