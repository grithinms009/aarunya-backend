# The API image.
#
# Only production dependencies are installed, and the source is copied after them, so a
# code change does not invalidate the dependency layer and rebuilds stay quick.
FROM node:22-alpine

# tini reaps zombies and passes signals through, so `docker stop` ends the process
# cleanly instead of waiting out the timeout and killing it.
RUN apk add --no-cache tini

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY deploy ./deploy

# Written to at runtime, so it must belong to the user the process runs as. A bind mount
# from the host will shadow this; the host directory needs the same ownership (uid 1000).
RUN mkdir -p uploads backups && chown -R node:node uploads backups

USER node
EXPOSE 4000

# Hits a real route, so the container is only healthy once the database is reachable and
# the app can answer — not merely once the port is open.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/storefront >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
