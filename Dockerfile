# Stage 1: Build & Dependencies
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Production Runner
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh
RUN chown -R node:node /app

USER node

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]