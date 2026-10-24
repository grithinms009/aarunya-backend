/* Reference data: the fixed vocabularies the store runs on.

   This is the one place they are defined. The routes that enforce them import from here,
   and GET /api/admin/meta/reference serves the same values to the admin panel, so the
   screens and the rules can never drift apart. Anything that varies per store lives in
   `setting` instead and is edited on the Settings screen. */

/** Stock adjustment reasons, and the label written into the ledger note. */
export const ADJUST_REASONS = [
  ['restock', 'New stock received'],
  ['damaged', 'Damaged or defective'],
  ['correction', 'Stock count correction'],
  ['sample', 'Used as gift or sample'],
  ['other', 'Other'],
];

/** What a customer can pick when raising a return. */
export const RETURN_REASONS = [
  'Arrived damaged',
  'Received wrong item',
  'Received wrong colour',
  'Stone missing',
  'Clasp broken',
  'Different from photos',
  'Other',
];

/** Where a refund can be sent. */
export const REFUND_METHODS = [
  'Original payment method',
  'UPI',
  'Bank transfer',
  'Store credit',
];

/** How an in-person sale can be paid for. */
export const PAY_MODES = ['Cash', 'UPI', 'Card'];

/** The forward-only online order flow: status → [next status, button label]. */
export const NEXT_STEP = {
  new: ['packed', 'Mark as packed'],
  packed: ['shipped', 'Mark as shipped'],
  shipped: ['out', 'Mark out for delivery'],
  out: ['delivered', 'Mark as delivered'],
};

/** The five steps the order timeline draws. */
export const ORDER_STEPS = [
  ['new', 'Placed'],
  ['packed', 'Packed'],
  ['shipped', 'Shipped'],
  ['out', 'Out for delivery'],
  ['delivered', 'Delivered'],
];

/** The five steps the return timeline draws. */
export const RETURN_STEPS = [
  ['requested', 'Requested'],
  ['approved', 'Approved'],
  ['pickup', 'Pickup'],
  ['received', 'Received'],
  ['completed', 'Resolved'],
];

/** Where an offer banner's button can point, and the matching shop URL. */
export const OFFER_LINKS = [
  ['sale', '/shop?sale=1', 'All sale items'],
  ['u500', '/shop?price=u500', 'Under ₹500'],
  ['500-1000', '/shop?price=500-1000', '₹500 – ₹1,000'],
  ['o1000', '/shop?price=o1000', 'Above ₹1,000'],
];

/** The artwork that ships with the store, for "Restore original". */
export const DEFAULT_IMAGES = {
  heroDesktop: '/assets/hero-desktop.jpg',
  heroMobile: '/assets/hero-mobile.jpg',
  personalised: '/assets/personalised-banner.jpg',
  personalisedMobile: '/assets/personalised-gift-box-v2.jpg',
  offers: ['/assets/offer-festive-sale.jpg', '/assets/offer-little-gifts.jpg'],
};

/** The three photo slots a variant stores, in order (variant_image.slot 0-2). */
export const PHOTO_SLOTS = ['Front', 'On model', 'Detail'];

/** Choices offered for the return window, in days. */
export const RETURN_WINDOWS = [2, 3, 5, 7, 10, 15, 30];

/** Choices offered for the same-day dispatch cut-off, as hours of the day. */
export const DISPATCH_CUTOFFS = [12, 13, 14, 15, 16, 17, 18];

/** Background tints a category card can use. */
export const CATEGORY_TINTS = ['#F7E4E4', '#F5ECDD', '#F3E1D7', '#E8EFE6', '#ECE8F3'];

/** The code maps behind AJ-{CATEGORY}{NUMBER}-{COLOUR}. */
export const SKU_CODES = {
  categories: {
    necklaces: 'NK', bangles: 'BG', bracelets: 'BR', rings: 'RG',
    handchains: 'HC', hipchains: 'HP', earrings: 'ER', 'nose-rings': 'NR',
  },
  colors: { gold: 'GLD', rose: 'RSG', silver: 'SLV', black: 'BLK', green: 'GRN' },
};

/** Everything above, in the shape the admin panel reads it. */
export const reference = () => ({
  adjustReasons: ADJUST_REASONS,
  returnReasons: RETURN_REASONS,
  refundMethods: REFUND_METHODS,
  payModes: PAY_MODES,
  nextStep: NEXT_STEP,
  orderSteps: ORDER_STEPS,
  returnSteps: RETURN_STEPS,
  photoSlots: PHOTO_SLOTS,
  offerLinks: OFFER_LINKS,
  defaultImages: DEFAULT_IMAGES,
  returnWindows: RETURN_WINDOWS,
  dispatchCutoffs: DISPATCH_CUTOFFS,
  categoryTints: CATEGORY_TINTS,
  skuCodes: SKU_CODES,
});
