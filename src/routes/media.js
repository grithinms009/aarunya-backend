/* Image uploads.

   Product photos, category cards and banner artwork are posted here and written to disk
   under UPLOAD_DIR, then served read-only from /uploads. The database stores the URL,
   never the bytes, so rows stay small and images can move behind a CDN later by changing
   only what this module returns.

   The image arrives as a base64 data URL, which is what the browser already produces when
   it downscales the file before upload. Everything is checked server-side: declared type
   against an allow-list, the real magic bytes, and the decoded size. */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
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

  const name = `${randomUUID()}.${type.ext}`;
  const dir = join(UPLOAD_DIR, req.body.purpose);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf);

  const url = `/uploads/${req.body.purpose}/${name}`;
  res.status(201).json({ url, bytes: buf.length, contentType: declared.toLowerCase() });
}));

/** Removes an upload this API wrote. Paths outside /uploads are refused. */
router.delete('/', parseBody(z.object({ url: z.string().max(500) })), wrap(async (req, res) => {
  const m = /^\/uploads\/([a-z]+)\/([A-Za-z0-9-]+\.[a-z0-9]+)$/.exec(req.body.url);
  if (!m || !PURPOSES.includes(m[1])) throw badRequest('That is not an uploaded image');
  try {
    await unlink(join(UPLOAD_DIR, m[1], m[2]));
  } catch {
    /* Already gone is a success for the caller. */
  }
  res.json({ ok: true });
}));
