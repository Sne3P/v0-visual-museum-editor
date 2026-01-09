# ============================================
# DOCKERFILE MULTI-STAGE - NEXT.JS 16 + TURBOPACK
# ============================================

FROM node:20-alpine AS base

# Installation des dépendances système
RUN apk add --no-cache libc6-compat

WORKDIR /app

# ============================================
# ÉTAPE DEV : DÉVELOPPEMENT OPTIMISÉ
# ============================================
FROM base AS dev

# Copier fichiers de configuration et dépendances
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json next.config.mjs next-env.d.ts ./
COPY components.json postcss.config.mjs ./

# Installer pnpm et toutes les dépendances (y compris devDependencies)
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    pnpm install

# Copier tout le code source pour dev (rebuild rapide)
COPY app ./app
COPY components ./components
COPY core ./core
COPY features ./features
# COPY infrastructure ./infrastructure
COPY lib ./lib
COPY public ./public
COPY shared ./shared
# COPY styles ./styles

# Créer répertoires uploads
RUN mkdir -p /app/public/uploads/pdfs /app/public/uploads/audio

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# Dev server avec Turbopack
CMD ["pnpm", "dev"]

# ============================================
# ÉTAPE 1 : INSTALLATION DÉPENDANCES (PROD)
# ============================================
FROM base AS deps

# Copier les fichiers de dépendances
COPY package.json pnpm-lock.yaml* ./

# Installer pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Installer TOUTES les dépendances (prod + dev) pour le build
RUN pnpm install --frozen-lockfile

# ============================================
# ÉTAPE 2 : BUILD DE L'APPLICATION
# ============================================
FROM base AS builder

WORKDIR /app

# Copier node_modules depuis deps
COPY --from=deps /app/node_modules ./node_modules

# Copier TOUS les fichiers nécessaires pour le build
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json next.config.mjs next-env.d.ts ./
COPY components.json postcss.config.mjs ./
COPY app ./app
COPY components ./components
COPY core ./core
COPY features ./features
# COPY infrastructure ./infrastructure
COPY lib ./lib
COPY public ./public
COPY shared ./shared
# COPY styles ./styles

# Build arguments pour Next.js (URLs publiques)
ARG NEXT_PUBLIC_BACKEND_URL=http://51.38.188.211:5000
ARG NEXT_PUBLIC_API_URL=http://51.38.188.211:3000

# Variables d'environnement pour le build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build Next.js
RUN corepack enable && corepack prepare pnpm@latest --activate && \
    pnpm build

# ============================================
# ÉTAPE 3 : RUNNER PRODUCTION
# ============================================
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Créer utilisateur non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copier les fichiers nécessaires
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Créer répertoire uploads
RUN mkdir -p /app/public/uploads/pdfs && \
    chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
