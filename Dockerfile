# Dockerfile do DASHBOARD LawChat (easypanel / produção)
# Builda o front (Vite) e roda o server Node que serve o dashboard + API.
# IMPORTANTE: este NÃO é a edge function do webhook — é o dashboard de verdade.

# ---------- etapa 1: build do front (Vite → dist) ----------
FROM node:20-alpine AS build
WORKDIR /app/dashboard-app
COPY dashboard-app/package*.json ./
RUN npm ci
COPY dashboard-app/ ./
RUN npm run build

# ---------- etapa 2: runtime (server Node) ----------
FROM node:20-alpine
WORKDIR /app

# deps do server (só pg)
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --omit=dev

# código do server + dist buildado
COPY frontend/ ./frontend/
COPY --from=build /app/dashboard-app/dist ./dashboard-app/dist

ENV PORT=8787
EXPOSE 8787
WORKDIR /app/frontend
CMD ["node", "server.js"]
