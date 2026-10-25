#!/usr/bin/env bash
# First-run setup for the Aarunya backend on a fresh Ubuntu server.
#
# Idempotent: safe to re-run. It never overwrites an existing .env, and it will
# not restore the database over a catalogue that already has products in it.
#
#   sudo bash deploy/setup.sh            # restores the catalogue from deploy/
#   sudo bash deploy/setup.sh --fresh    # deliberately start with an empty shop
set -euo pipefail
FRESH=0
[ "${1:-}" = "--fresh" ] && FRESH=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "Checking prerequisites"
command -v node >/dev/null || { echo "Node is not installed. Install Node 20+ first."; exit 1; }
command -v docker >/dev/null || { echo "Docker is not installed."; exit 1; }
node -e 'const [maj]=process.versions.node.split(".").map(Number); if(maj<20){console.error("Node 20+ required, found "+process.version);process.exit(1)}'
echo "node $(node -v), docker present"

say "Starting PostgreSQL"
docker compose up -d db
for i in $(seq 1 60); do
  docker exec aarunya-postgres pg_isready -U aarunya -d aarunya >/dev/null 2>&1 && break
  sleep 1
done
docker exec aarunya-postgres pg_isready -U aarunya -d aarunya

say "Installing dependencies"
# Needed on the host too: the setup and catalogue scripts below run outside the
# container. The API itself installs its own inside the image.
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
DUMP=deploy/aarunya-seed-clean.sql

if [ "${HAVE:-0}" -gt 0 ]; then
  echo "catalogue already has $HAVE product(s) — not restoring over it"
elif [ -f "$DUMP" ]; then
  # The dump drops every object before recreating it, so it is safe over a schema
  # that migrate/seed has already written: the result is an exact copy, not a merge.
  docker exec -i aarunya-postgres psql -U aarunya -d aarunya -q < "$DUMP"
  echo "restored $(docker exec aarunya-postgres psql -U aarunya -d aarunya -t -A -c 'select count(*) from product') products"
  # The dump carries no accounts on purpose — see deploy/create-accounts.mjs.
  node deploy/create-accounts.mjs
elif [ "$FRESH" = "1" ]; then
  npm run db:migrate && npm run db:seed
  echo "started empty, as --fresh asked"
else
  # Running migrate/seed here would look like success and leave a shop with nothing
  # in it. Stopping is the kinder failure.
  cat <<'MISSING'

  STOPPING: no catalogue to restore.

  deploy/aarunya-seed-clean.sql is not here. Copy it from the machine that has the
  working shop, along with the photographs:

    scp backups/aarunya-seed-clean.sql root@THIS-SERVER:$PWD/deploy/
    scp backups/uploads.tar.gz         root@THIS-SERVER:$PWD/deploy/

  Then run this script again.

  If you genuinely want to start with an empty shop and fill it from the admin
  panel, re-run with:  sudo bash deploy/setup.sh --fresh
MISSING
  exit 1
fi

say "Uploads"
if [ -f deploy/uploads.tar.gz ]; then
  tar -xzf deploy/uploads.tar.gz
  echo "$(find uploads -type f | wc -l) file(s) in uploads/"
elif [ "$FRESH" = "1" ]; then
  echo "no photographs yet — they arrive as products are added through the admin"
else
  echo "WARNING: no uploads.tar.gz. The catalogue is restored but every product"
  echo "         image will 404 until that archive is copied across and unpacked."
fi

say "Starting the API"
# The image runs as uid 1000, and the bind mount carries host ownership straight
# through, so the container cannot write uploads unless the host directory matches.
chown -R 1000:1000 uploads backups 2>/dev/null || true
docker compose up -d --build api
for i in $(seq 1 60); do
  [ "$(docker inspect aarunya-api --format '{{.State.Health.Status}}' 2>/dev/null)" = "healthy" ] && break
  sleep 2
done
docker compose ps

say "Done"
cat <<'NEXT'
Still to do, in this order:

  1. Edit .env — ADMIN_ORIGIN and STORE_ORIGIN must be the real https:// domains,
     or the browser will refuse every admin and checkout request.
     Then:  docker compose up -d api     (to pick the change up)
  2. Put nginx with TLS in front. See deploy/README.md.
  3. Verify:  curl -s localhost:4000/api/products | head -c 120
NEXT
