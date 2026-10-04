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

EXPOSE 4000
CMD ["node", "dist/src/index.js"]
