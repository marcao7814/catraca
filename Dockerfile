FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Imagem usada pelos gates (lint, typecheck, testes)
FROM deps AS dev
COPY . .
CMD ["npm", "run", "gates:inner"]

FROM dev AS build
RUN npm run build

FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY views ./views
COPY migrations ./migrations
COPY scripts/entrypoint.sh ./scripts/entrypoint.sh
USER node
EXPOSE 3000
CMD ["sh", "scripts/entrypoint.sh"]
