/* Builds the proposed catalogue manifest for the 71 entries still to be created.
 *
 * Nothing here touches the live catalogue. It writes manifest.json, which is the single
 * source of truth for the rest of the pipeline: image generation reads it, seeding reads
 * it, and the review states live on it because the product table has only
 * active | draft and no room for GENERATED / NEEDS_REVIEW / APPROVED / PUBLISHED.
 *
 * Two rules shape every entry, and both come from the brief:
 *
 *   - No merchant reference photo exists for any of these designs, so every one is an
 *     UNVERIFIED DRAFT: status draft, stock 0, never publicly purchasable until Veena
 *     confirms the piece is real and available.
 *   - No material may be claimed that nobody has verified. The wording stays visible
 *     rather than chemical: "gold-tone", "stone-accented", "faux pearl". Nothing says
 *     stainless steel, gold-plated, anti-tarnish, nickel-free or waterproof.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* Category slug -> SKU prefix. The slugs are the ones already in the database; the
   prefixes follow the project format AJ-{CODE}{3 digits}-{COLOUR}. */
const CATS = {
  necklaces:     { prefix: 'NK', label: 'Anti-Tarnish Necklaces' },
  rings:         { prefix: 'RG', label: 'Rings' },
  bangles:       { prefix: 'BG', label: 'Bangles' },
  'hip-chains':  { prefix: 'HC', label: 'Hip Chains' },
  anklets:       { prefix: 'AN', label: 'Anklets' },
  earrings:      { prefix: 'ER', label: 'Earrings' },
  'nose-rings':  { prefix: 'NR', label: 'Nose Rings' },
  bracelets:     { prefix: 'BR', label: 'Bracelets' },
  'hand-chains': { prefix: 'HA', label: 'Hand Chains' },
  'anti-tarnish':{ prefix: 'AT', label: 'Anti-Tarnish Jewellery' },
};

/* How each category is framed when it is worn, so the model prompts stay anatomically
   sensible without being written out 71 times. */
const FRAMING = {
  necklaces:     'collarbone and neckline, chin out of frame',
  rings:         'one relaxed hand, fingers softly curled, wrist out of frame',
  bangles:       'forearm and wrist turned slightly toward the light',
  'hip-chains':  'waist and hip only, from ribcage to upper hip',
  anklets:       'ankle and top of the foot, lower calf visible',
  earrings:      'one ear and the jawline, eyes and mouth out of frame',
  'nose-rings':  'nose and one cheek in profile, eyes out of frame',
  bracelets:     'wrist and lower forearm, hand relaxed',
  'hand-chains': 'back of one hand and the wrist together',
  'anti-tarnish':'neckline, wrist or hand as the piece requires',
};

/* The proposed designs. Every name was checked against the nine already in the
   catalogue. `sub` must be one of that category's existing sub-categories, or null. */
const DESIGNS = {
  necklaces: [
    ['Gold Daisy Charm Necklace', 'charm-necklaces', 'Five daisy charms spaced along a fine chain', 379],
    ['Gold Teardrop Pendant Necklace', null, 'A single teardrop pendant on a slim chain', 349],
    ['Gold Layered Bead Necklace', null, 'Two strands, one beaded and one plain', 449],
    ['Gold Pearl Station Necklace', 'pearl-necklaces', 'Faux pearls set at even stations along the chain', 429],
  ],
  rings: [
    ['Gold Twist Band Ring', 'minimal-rings', 'A slim band with a single twist at the front', 299],
    ['Gold Solitaire Sparkle Ring', 'stone-rings', 'One round stone raised on a fine band', 339],
    ['Gold Pearl Dot Ring', 'minimal-rings', 'A small faux pearl on a plain band', 319],
    ['Gold Floral Cluster Ring', 'stone-rings', 'A cluster of small stones in a flower shape', 369],
    ['Gold Open Wrap Ring', 'adjustable-rings', 'An open band that adjusts to the finger', 309],
    ['Gold Stacking Trio Ring', 'minimal-rings', 'Three slim bands made to sit together', 399],
  ],
  bangles: [
    ['Gold Twisted Rope Bangle', 'classic-bangles', 'A rope-twist bangle with a smooth finish', 549],
    ['Gold Slim Cuff Bangle', 'minimal-bangles', 'An open cuff, narrow and plain', 469],
    ['Gold Beaded Charm Bangle', 'classic-bangles', 'Small beads and charms along a fine bangle', 519],
    ['Gold Pearl Station Bangle', 'stone-bangles', 'Faux pearls set at intervals', 539],
    ['Gold Textured Wide Bangle', 'classic-bangles', 'A wider bangle with a brushed texture', 599],
    ['Gold Openable Stone Bangle', 'openable-bangles', 'An openable bangle set with clear stones', 629],
    ['Gold Minimal Hoop Bangle', 'minimal-bangles', 'A plain round bangle, nothing added', 449],
  ],
  'hip-chains': [
    ['Gold Beaded Waist Chain', 'minimal-hip-chains', 'Fine chain with evenly spaced beads', 569],
    ['Gold Layered Hip Chain', 'minimal-hip-chains', 'Two chains of different lengths worn as one', 649],
    ['Gold Coin Charm Hip Chain', 'charm-hip-chains', 'Small flat coin charms along the chain', 619],
    ['Gold Delicate Rope Waist Chain', 'minimal-hip-chains', 'A single fine rope-twist chain', 529],
    ['Gold Stone Drop Hip Chain', 'charm-hip-chains', 'Coloured stone drops spaced along the chain', 659],
    ['Gold Twin Strand Waist Chain', 'minimal-hip-chains', 'Two slim strands held by a shared clasp', 599],
    ['Gold Floral Charm Hip Chain', 'charm-hip-chains', 'Small flower charms along a fine chain', 639],
  ],
  anklets: [
    ['Gold Bead Chain Anklet', 'minimal-anklets', 'Fine chain with small round beads', 329],
    ['Gold Star Charm Anklet', 'charm-anklets', 'Small star charms along the chain', 359],
    ['Gold Double Layer Anklet', 'minimal-anklets', 'Two chains worn together on one clasp', 389],
    ['Gold Heart Drop Anklet', 'charm-anklets', 'Small heart drops spaced along the chain', 369],
    ['Gold Shell Charm Anklet', 'charm-anklets', 'Little shell charms on a fine chain', 379],
    ['Gold Fine Rope Anklet', 'minimal-anklets', 'A single plain rope-twist chain', 309],
    ['Gold Bell Charm Anklet', 'charm-anklets', 'Tiny bell charms along the chain', 399],
  ],
  earrings: [
    ['Gold Classic Hoop Earrings', null, 'Plain round hoops, mid size', 329],
    ['Gold Floral Stud Earrings', 'stud-earrings', 'A seven-stone flower on each stud', 299],
    ['Gold Floral Jhumka Earrings', 'jhumkas', 'A flower top with a fluted jhumka bell', 499],
    ['Gold Marquise Pearl Drop Earrings', null, 'Marquise stones above a single pearl drop', 359],
    ['Gold Twisted Huggie Earrings', null, 'Small huggie hoops with a twist', 339],
    ['Gold Star Stud Earrings', 'stud-earrings', 'A small flat star on each stud', 309],
    ['Gold Chandbali Jhumka Earrings', 'jhumkas', 'A crescent chandbali with a drop below', 579],
    ['Gold Teardrop Stone Earrings', null, 'A single teardrop stone on a short drop', 429],
  ],
  'nose-rings': [
    ['Gold Stone Nose Hoop', null, 'A row of small stones along a fine hoop', 299],
    ['Gold Stone Nose Stud', 'stone-nose-rings', 'A single small stone on a stud', 309],
    ['Gold Floral Nose Pin', 'nose-studs', 'A small flower head on a pin', 329],
    ['Gold Cluster Nose Hoop', null, 'A three-stone cluster on a fine ball-end hoop', 349],
    ['Gold Beaded Nose Hoop', null, 'A thin hoop with a single bead', 319],
    ['Gold Twist Nose Stud', 'nose-studs', 'A small twisted spiral on a stud', 309],
    ['Gold Pearl Nose Pin', 'nose-studs', 'One faux pearl on a fine pin', 329],
    ['Gold Minimal Nose Hoop', null, 'The thinnest hoop in the range', 299],
  ],
  bracelets: [
    ['Gold Figaro Chain Bracelet', 'chain-bracelets', 'A figaro link chain with a lobster clasp', 449],
    ['Gold Heart Station Bracelet', 'chain-bracelets', 'Small hearts spaced along a fine chain', 429],
    ['Gold Pearl Station Bracelet', 'chain-bracelets', 'Faux pearls set at intervals along the chain', 469],
    ['Gold Slim Cuff Bracelet', 'cuff-bracelets', 'A narrow open cuff, plain', 489],
    ['Gold Charm Cluster Bracelet', 'chain-bracelets', 'Several small charms gathered on one chain', 519],
    ['Gold Herringbone Bracelet', 'chain-bracelets', 'A flat herringbone chain', 539],
    ['Gold Beaded Stone Bracelet', 'chain-bracelets', 'Beads and small stones alternating', 459],
    ['Gold Twisted Rope Bracelet', 'cuff-bracelets', 'A rope-twist cuff', 499],
  ],
  'hand-chains': [
    ['Gold Minimal Hand Chain', 'minimal-hand-chains', 'A plain chain from ring to wrist', 429],
    ['Gold Floral Hand Harness', 'floral-hand-chains', 'A flower at the back of the hand', 549],
    ['Gold Pearl Hand Chain', 'minimal-hand-chains', 'Faux pearls along the hand chain', 489],
    ['Gold Leaf Hand Chain', 'floral-hand-chains', 'Small leaf shapes along the chain', 509],
    ['Gold Twin Ring Hand Chain', 'minimal-hand-chains', 'Two finger rings joined to one bracelet', 529],
    ['Gold Beaded Hand Chain', 'minimal-hand-chains', 'Fine chain with small beads', 449],
    ['Gold Star Hand Chain', 'floral-hand-chains', 'Small star charms across the hand', 469],
    ['Gold Layered Hand Chain', 'minimal-hand-chains', 'Two chains across the back of the hand', 559],
  ],
  'anti-tarnish': [
    ['Gold Everyday Cable Chain', 'anti-tarnish-neck-chains', 'A plain cable chain for daily wear', 399],
    ['Gold Essential Huggie Earrings', 'anti-tarnish-earrings', 'Small plain huggie hoops', 319],
    ['Gold Minimal Disc Pendant', 'anti-tarnish-neck-chains', 'A flat round disc on a fine chain', 379],
    ['Gold Slim Band Ring', 'anti-tarnish-rings', 'A plain narrow band', 299],
    ['Gold Classic Link Bracelet', 'anti-tarnish-bracelets', 'An everyday link chain bracelet', 439],
    ['Gold Dainty Bar Pendant', 'anti-tarnish-neck-chains', 'A small horizontal bar on a chain', 359],
    ['Gold Rope Chain Choker', 'anti-tarnish-neck-chains', 'A short rope-twist chain worn high', 469],
    ['Gold Twist Hoop Earrings', 'anti-tarnish-earrings', 'Hoops with a twisted profile', 349],
  ],
};

/* SKU numbers already taken, so generated ones never collide. Kept here as the fallback;
   validate.mjs re-checks against the live database before anything is written. */
const TAKEN = new Set(['NK002', 'NK003', 'NK004', 'NK006', 'RG001', 'RG002',
  'BG001', 'HC001', 'AN001']);

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/* Neutral material wording, chosen from what the design visibly has. Nothing about the
   metal underneath, because nobody has verified it. */
function material(desc) {
  const pearl = /pearl/i.test(desc);
  const stone = /stone|sparkle|crystal/i.test(desc);
  if (pearl && stone) return 'Gold-tone metal with faux pearl and stone accents';
  if (pearl) return 'Gold-tone metal with faux pearl accents';
  if (stone) return 'Gold-tone metal, stone-accented';
  return 'Gold-tone metal';
}

/* Four products per category is the target. These are how many each already has in the
   live catalogue, so only the shortfall is proposed. */
const ALREADY = { necklaces: 4, rings: 2, bangles: 1, 'hip-chains': 1, anklets: 1,
  earrings: 0, 'nose-rings': 0, bracelets: 0, 'hand-chains': 0, 'anti-tarnish': 0 };
const TARGET = 4;

/* Publication is a fact about the world, not something to regenerate. Rebuilding the
   manifest must not forget that a product is already live, or validate.mjs would read its
   own live slug as a clash and seed-drafts.mjs would try to create it again. */
const PRIOR = existsSync(join(HERE, 'manifest.json'))
  ? new Map(JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'))
      .products.map((p) => [p.sku, p]))
  : new Map();

const out = [];
const counters = {};

for (const [cat, designs] of Object.entries(DESIGNS)) {
  const { prefix } = CATS[cat];
  counters[prefix] ??= 0;
  const need = Math.max(0, TARGET - (ALREADY[cat] ?? 0));

  for (const [name, sub, detail, price] of designs.slice(0, need)) {
    /* Next free number for this prefix. */
    let n;
    do { n = String(++counters[prefix]).padStart(3, '0'); } while (TAKEN.has(prefix + n));
    const sku = `AJ-${prefix}${n}-GLD`;

    out.push({
      productName: name,
      category: cat,
      categoryLabel: CATS[cat].label,
      subCategory: sub,
      sku,
      slug: slugify(name),
      colour: 'Gold',
      material: material(detail),
      description: `${detail}. A gold-tone piece for everyday wear and gifting.`,
      sellingPrice: price,
      /* Equal to the selling price: no discount is claimed that does not exist. */
      mrp: price,
      /* Unverified concept, so it is not purchasable. */
      stock: 0,
      finish: 'Gold-tone',
      style: detail,
      occasion: 'Daily wear / gifting',
      newArrival: false,
      bestSeller: false,
      /* Drives seeding: these never enter the public feed. */
      status: 'draft',
      verified: false,
      reviewState: 'GENERATED',
      sourcePhoto: null,
      framing: FRAMING[cat],
      /* JPEG, not WebP: the brief allows either, the existing nine products are JPEG,
         and macOS sips can produce it without pulling in an image library. */
      images: {
        front: `assets/products/${sku}/${sku}_front.jpg`,
        onModel: `assets/products/${sku}/${sku}_model.jpg`,
      },
    });

    /* Carry forward anything already approved or published. */
    const was = PRIOR.get(sku);
    if (was && was.reviewState !== 'GENERATED') {
      const now = out[out.length - 1];
      now.reviewState = was.reviewState;
      now.verified = was.verified;
      now.status = was.status;
      now.stock = was.stock;
    }
  }
}

const manifest = {
  generatedAt: new Date().toISOString().slice(0, 10),
  note: 'Proposed catalogue entries. None has a merchant reference photo, so every one '
      + 'is an unverified draft: status draft, stock 0, not publicly purchasable until '
      + 'Veena confirms the piece exists and is available.',
  counts: out.reduce((a, p) => ({ ...a, [p.category]: (a[p.category] ?? 0) + 1 }), {}),
  total: out.length,
  products: out,
};

writeFileSync(join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`wrote manifest.json — ${out.length} proposed entries`);
for (const k of Object.keys(CATS)) console.log(`  ${k.padEnd(14)} have ${ALREADY[k]}  + new ${manifest.counts[k] ?? 0}`);
