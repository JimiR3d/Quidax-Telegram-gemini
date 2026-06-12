# PulseDesk production image (used by Fly.io — see fly.toml).
# Railway keeps using Nixpacks via railway.toml; this file does not affect it.
#
# Stage 1 builds the React dashboard (Vite) and bundles the Express/GramJS
# server (esbuild) into dist/server.mjs — the same `npm run build` Railway runs.
# Stage 2 is the runtime image: production node_modules + the dist folder.
# The server bundle is built with --packages=external, so node_modules must
# be present at runtime.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8080
# Not `npm start` — that script contains a Windows-only `chcp` command.
CMD ["node", "dist/server.mjs"]
