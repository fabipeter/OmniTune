# OmniTune sync server — build context is apps/server:
#   docker build -t omnitune-server apps/server
# Requires Node >= 22.13 (built-in node:sqlite).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json tsconfig.base.json* ./
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN sed -i 's#"extends": "../../tsconfig.base.json",#"extends": "./tsconfig.base.json",#' tsconfig.json
COPY tsconfig.base.docker.json ./tsconfig.base.json
RUN npm install --no-audit --no-fund && npx tsc -p tsconfig.json && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8787 DATABASE_PATH=/data/omnitune.db
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
RUN mkdir -p /data && chown -R node:node /app /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
