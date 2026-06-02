# LawChat — Dashboard CRM

Dashboard multi-tenant (Vite + React + Supabase) servido por um server Node que também
roda o sync com a Helena via cron.

## Estrutura

```
dashboard-app/   → front (Vite + React). Build gera dashboard-app/dist
frontend/        → server.js (Node): serve o dist + API + cron de sync Helena→Postgres
sql/             → migrations / schema de referência
Dockerfile       → builda o front e roda o server (produção / easypanel)
_arquivo/        → material antigo (n8n, scripts standalone) — fora do git
```

## Rodar local

```bash
# 1) Front
cd dashboard-app && npm install && npm run build   # ou: npm run dev

# 2) Server (serve o dist + API)
cd ../frontend && npm install
cp .env.example .env   # preencha DB_HOST/DB_USER/DB_PASS/...
node server.js         # http://localhost:8787
```

## Variáveis de ambiente

| Onde | Vars | Observação |
|------|------|-----------|
| `frontend/.env` | `DB_HOST DB_PORT DB_USER DB_PASS DB_NAME` | **segredo** — fora do git |
| `dashboard-app/.env` | `VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PROJECT_ID` | chaves **públicas** (RLS) — usadas no build |

## Deploy (easypanel)

1. Build method: **Dockerfile** (na raiz do repo).
2. Environment: defina `DB_HOST DB_PORT DB_USER DB_PASS DB_NAME`.
3. Domínio → porta **8787** (o server lê `PORT` injetado).
4. Deploy. Nos logs deve aparecer o server na 8787 — **não** a edge function `ai-followup-webhook`.

> A `ai-followup-webhook` é uma Supabase Edge Function separada (deploy via `supabase functions deploy`),
> não faz parte deste app e não deve usar o domínio do dashboard.
