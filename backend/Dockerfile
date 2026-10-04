FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# prisma.config.ts resolves env("DATABASE_URL") just to load the config, even for `generate`
# (which never actually connects to a database) — and this RUN step has no access to
# docker-compose's `environment:` block, which is only injected at container-start time, not
# during `docker build`. A placeholder satisfies the config loader without needing a real DB.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# dist/ already contains the compiled generated Prisma client (including its native query
# engine binary, copied in by the "postbuild" script) — nothing else from the build stage is
# needed at runtime.
COPY --from=build /app/dist ./dist

# Needed to run migrations from this image (see CMD below) — prisma.config.ts points at these
# paths. The `prisma` CLI itself is already present even with --omit=dev (a transitive
# dependency of @prisma/client in this version), so nothing else needs installing for this.
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

EXPOSE 4000
# Runs migrations on every container start rather than as a separate pre-deploy step, since
# that Render feature requires a paid plan. Safe to repeat — `migrate deploy` only applies
# migrations that aren't already recorded as applied, so this is a no-op after the first
# successful run (and free-tier cold-starts make "every start" the common case anyway).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
