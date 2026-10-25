#!/usr/bin/env bash
# First-run setup for the Aarunya backend on a fresh Ubuntu server.
#
# Idempotent: safe to re-run. It never overwrites an existing .env, and it will
# not restore the database over a catalogue that already has products in it.
#
#   sudo bash deploy/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "Checking prerequisites"
command -v node >/dev/null || { echo "Node is not installed. Install Node 20+ first."; exit 1; }
command -v docker >/dev/null || { echo "Docker is not installed."; exit 1; }
node -e 'const [maj]=process.versions.node.split(".").map(Number); if(maj<20){console.error("Node 20+ required, found "+process.version);process.exit(1)}'
echo "node $(node -v), docker present"

say "Starting PostgreSQL"
docker compose up -d
for i in $(seq 1 60); do
  docker exec aarunya-postgres pg_isready -U aarunya -d aarunya >/dev/null 2>&1 && break
  sleep 1
done
docker exec aarunya-postgres pg_isready -U aarunya -d aarunya

say "Installing dependencies"
npm ci --omit=dev

say "Environment"
if [ -f .env ]; then
  echo ".env already exists — leaving it alone"
else
  cp .env.example .env
  # A fresh secret per server. Sessions signed with the old one stop working,
  # which is the point: the example value is public.
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
  sed -i "s|^COOKIE_SECURE=.*|COOKIE_SECURE=true|" .env
  echo "wrote .env with a freshly generated JWT_SECRET"
  echo "EDIT IT NOW: set ADMIN_ORIGIN and STORE_ORIGIN to the real https:// domains."
fi

say "Database"
HAVE=$(docker exec aarunya-postgres psql -U aarunya -d aarunya -t -A \
  -c "select count(*) from product" 2>/dev/null || echo 0)
if [ "${HAVE:-0}" -gt 0 ]; then
  echo "catalogue already has $HAVE product(s) — not restoring over it"
elif [ -f deploy/aarunya-seed-clean.sql ]; then
  docker exec -i aarunya-postgres psql -U aarunya -d aarunya -q < deploy/aarunya-seed-clean.sql
  echo "restored $(docker exec aarunya-postgres psql -U aarunya -d aarunya -t -A -c 'select count(*) from product') products"
else
  npm run db:migrate && npm run db:seed
  echo "no dump found — created an empty catalogue with the two accounts"
fi

say "Uploads"
if [ -f deploy/uploads.tar.gz ]; then
  tar -xzf deploy/uploads.tar.gz
  echo "$(find uploads -type f | wc -l) file(s) in uploads/"
else
  echo "no uploads.tar.gz — product images will 404 until it is copied across"
fi

say "Done"
cat <<'NEXT'
Still to do, in this order:

  1. Edit .env — ADMIN_ORIGIN and STORE_ORIGIN must be the real https:// domains,
     or the browser will refuse every admin and checkout request.
  2. Change both seeded passwords:  veena@aarunyajewels.in / user@aarunyajewels.in
  3. Put the app behind a process manager and nginx with TLS. See deploy/README.md.
  4. Verify:  curl -s localhost:4000/api/storefront | head -c 200
NEXT
