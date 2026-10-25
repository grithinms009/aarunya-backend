# Deploying the Aarunya backend

For whoever administers the server. Assumes Ubuntu with Docker and Node 20+.

The repository carries the code. It does **not** carry the catalogue or the product
photographs — those live in PostgreSQL and in `uploads/`, both gitignored. They have to
be copied across separately, once.

## 1. Nothing to copy

The catalogue seed and the product photographs are in the repository, so `git pull` brings
everything a server needs.

**Do not copy `.env`.** It holds a development JWT secret, localhost origins and an image
API key. The setup script writes a fresh one.

### Accounts

The dump carries **no** `app_user` rows. These repositories are public, and a password
hash in a public repository is a password, however it was hashed. `deploy/setup.sh` runs
`deploy/create-accounts.mjs` after the restore, which creates the two sign-in accounts
with generated passwords and prints them **once**. Copy them then.

To choose them yourself, set `SEED_ADMIN_PASSWORD` and `SEED_USER_PASSWORD` in `.env`
before running setup.

## 2. Run the setup

```bash
cd /var/www/aarunya/aarunya-backend
git pull                       # the server clone may be behind
sudo bash deploy/setup.sh
```

If the dump is not there the script **stops** rather than quietly building an empty
shop — that failure is far easier to notice now than three steps later. To start empty
on purpose, pass `--fresh`.

The dump drops every object before recreating it, so running it over a database that
`db:migrate` and `db:seed` have already touched gives an exact copy rather than a merge.
Without that, the settings and banner rows collide and are silently kept at their seeded
defaults — the wrong shipping threshold, no WhatsApp number, no hero artwork.

It starts PostgreSQL, installs dependencies, writes `.env` with a freshly generated
`JWT_SECRET`, restores the catalogue and unpacks the photographs. Re-running it is safe:
it will not overwrite an existing `.env`, and it refuses to restore over a catalogue that
already holds products.

## 3. Edit `.env`

Two values decide whether the browser will talk to this server at all:

```
ADMIN_ORIGIN=https://admin.yourdomain.com
STORE_ORIGIN=https://yourdomain.com
```

CORS is an explicit allow-list and the session cookie is `SameSite=Lax`, so a mismatch
here means every admin action and every checkout fails — with a CORS error, not an
obvious one. `NODE_ENV=production` and `COOKIE_SECURE=true` are already set, which is
what moves rate limiting to its production numbers and stops the cookie travelling over
plain HTTP.

## 4. Keep it running

```ini
# /etc/systemd/system/aarunya-api.service
[Unit]
Description=Aarunya backend
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/var/www/aarunya/aarunya-backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
EnvironmentFile=/var/www/aarunya/aarunya-backend/.env
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now aarunya-api
sudo systemctl status aarunya-api
```

`uploads/` must be writable by the same user: `sudo chown -R www-data:www-data uploads`.

## 5. Put nginx in front

```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Product photographs, served straight off disk rather than through Node.
    location /uploads/ {
        alias /var/www/aarunya/aarunya-backend/uploads/;
        expires 30d;
        access_log off;
    }

    client_max_body_size 12M;   # uploads arrive as base64, so larger than the file
}
```

Then `sudo certbot --nginx -d api.yourdomain.com`.

## 6. Before taking payments

- **Keep the generated passwords safe.** Setup prints them once and stores them nowhere.
  If they are lost, delete both rows from `app_user` and re-run
  `node deploy/create-accounts.mjs`.
- **No payment gateway is connected.** `POST /api/payments/create` reports
  `GATEWAY_NOT_CONFIGURED` rather than pretending a payment succeeded. Razorpay is still
  to be wired in.
- **No email is sent.** Password-reset tokens are logged, not delivered. Wire SMTP before
  anyone needs to reset a password.
- **Back up what git does not hold.** `npm run db:snapshot` writes to `backups/`, and
  `uploads/` must be backed up with it — the database rows reference those paths, so
  restoring one without the other leaves broken images.

## Checking it worked

```bash
curl -s localhost:4000/api/storefront | head -c 200     # config and categories
curl -s localhost:4000/api/products | head -c 200       # should list 31 products
curl -s -o /dev/null -w '%{http_code}\n' \
  localhost:4000/uploads/product/2026/10/gold-floral-jhumka-earrings-front-5fb764be.jpg
```

The last one must return 200. If it 404s, `uploads.tar.gz` was not unpacked.
