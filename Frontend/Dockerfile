# syntax=docker/dockerfile:1

# ==========================================
# Forward_Chat — Frontend (estático tras nginx)
# Multi-stage: build con Node, runtime nginx:alpine que sirve dist
# y hace proxy de /socket.io, /upload(s) y /assets al backend.
# ==========================================

# ---- Etapa 1: build ----
FROM node:22-alpine AS build
WORKDIR /build
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Etapa 2: runtime nginx ----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
