/* Aarunya API.

   Two surfaces on one app:
     /api/...        public storefront reads
     /api/auth/...   sign in, sign out, session, password reset
     /api/admin/...  the admin panel — authenticated and restricted to the admin role

   Security: helmet headers, a CORS allow-list with credentials, an HTTP-only session
   cookie, double-submit CSRF on every mutating request, rate-limited login, zod
   validation on every body and query, and parameterised SQL throughout. */
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { pool } from './db/pool.js';
import { csrfGuard, readSession, requireRole } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

import { router as authRoutes } from './routes/auth.js';
import { router as publicRoutes } from './routes/public.js';
import { router as metaRoutes } from './routes/meta.js';
import { router as dashboardRoutes } from './routes/dashboard.js';
import { router as productRoutes } from './routes/products.js';
import { router as categoryRoutes } from './routes/categories.js';
import { router as inventoryRoutes } from './routes/inventory.js';
import { router as orderRoutes } from './routes/orders.js';
import { router as returnRoutes } from './routes/returns.js';
import { router as customerRoutes } from './routes/customers.js';
import { router as settingsRoutes } from './routes/settings.js';
import { router as contentRoutes } from './routes/storefront.js';
import { router as mediaRoutes, UPLOAD_DIR } from './routes/media.js';
import { router as contactRoutes } from './routes/contact.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

/* Behind a proxy in production, so req.ip reflects the real client for rate limiting. */
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  /* The API serves JSON only; CSP belongs on the apps that serve HTML. */
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const ORIGINS = [process.env.ADMIN_ORIGIN, process.env.STORE_ORIGIN].filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    /* Same-origin and server-to-server calls arrive without an Origin header. */
    if (!origin || ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Origin not allowed'));
  },
  credentials: true,
  /* The CSRF token the client echoes back from its cookie. */
  allowedHeaders: ['Content-Type', 'x-csrf-token'],
}));

/* Product and banner images arrive as data URLs until object storage is wired up. */
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());
app.use(morgan('tiny'));
app.use(readSession);

/* A broad ceiling on the whole API; /auth/login is throttled far harder in its router. */
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
}));

/* Uploaded images, served read-only. Long-lived because every file name is unique. */
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d',
  immutable: true,
  index: false,
  dotfiles: 'deny',
}));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

/* CSRF applies to the surfaces that act on the session. The public storefront routes
   below are anonymous — they never read req.user — so a session cookie riding along
   (localhost shares cookies across ports, and so would a shared parent domain) must not
   turn an ordinary shopper request into a forbidden one. */
app.use('/api/auth', csrfGuard, authRoutes);
app.use('/api', publicRoutes);

/* Everything below needs a signed-in admin. */
const admin = express.Router();
admin.use(csrfGuard);
admin.use(requireRole('admin'));
admin.use('/meta', metaRoutes);
admin.use('/dashboard', dashboardRoutes);
admin.use('/products', productRoutes);
admin.use('/categories', categoryRoutes);
admin.use('/inventory', inventoryRoutes);
admin.use('/orders', orderRoutes);
admin.use('/returns', returnRoutes);
admin.use('/customers', customerRoutes);
admin.use('/settings', settingsRoutes);
admin.use('/storefront-content', contentRoutes);
admin.use('/uploads', mediaRoutes);
admin.use('/messages', contactRoutes);
app.use('/api/admin', admin);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`aarunya api on http://localhost:${PORT}`);
});

/* Let in-flight requests finish before the pool closes. */
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
