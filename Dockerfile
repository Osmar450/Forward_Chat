# syntax=docker/dockerfile:1

# ==========================================
# Forward_Chat — Backend (Express + Socket.IO)
# Multi-stage: compila el frontend y lo sirve el propio backend.
# Imagen final mínima sobre node:22-alpine, sin devDependencies.
# ==========================================

# ---- Etapa 1: build del frontend ----
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY Frontend/package.json Frontend/
# El monorepo no incluye lockfile dentro de Frontend: instalación reproducible vía npm install
RUN cd Frontend && npm install --no-audit --no-fund
COPY Frontend/ Frontend/
RUN cd Frontend && npm run build

# ---- Etapa 2: dependencias de producción del backend ----
FROM node:22-alpine AS backend-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- Etapa 3: runtime mínimo ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Usuario sin privilegios
RUN addgroup -S app && adduser -S app -G app

COPY --from=backend-deps /app/node_modules ./node_modules
COPY package.json index.js ./
COPY server/ ./server/
COPY assets/ ./assets/
COPY --from=frontend-build /build/Frontend/dist ./Frontend/dist

# Datos y uploads como volúmenes escribibles
RUN mkdir -p data uploads && chown -R app:app /app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "index.js"]
