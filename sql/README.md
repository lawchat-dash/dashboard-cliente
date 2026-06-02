# Helena Sync — Schema SQL

## Arquivos

- **`helena_sync_schema.sql`** — Migration completa. Cria tudo de uma vez.

## Como aplicar

### Opção A: Supabase Dashboard (mais fácil)
1. Abra o projeto no Supabase
2. **SQL Editor** → **New Query**
3. Cole o conteúdo de `helena_sync_schema.sql`
4. **Run**
5. Resultado: 4 tabelas novas + 3 colunas em `clients` + 2 RPCs + 1 view

### Opção B: psql
```bash
psql "$DATABASE_URL" -f sql/helena_sync_schema.sql
```

## O que cria

### Tabelas (4 novas)

| Tabela | PK | FKs | Pra que serve |
|---|---|---|---|
| `helena_panels` | `id` (uuid) | `client_id → clients` | Pipelines do CRM |
| `helena_contacts` | `id` (text = Helena UUID) | `client_id → clients` | Pessoas únicas, com tags/UTM/instagram |
| `helena_cards` | `id` (text = Helena UUID) | `client_id`, `panel_id` | Leads/oportunidades nos panels |
| `helena_sessions` | `id` (text = Helena UUID) | `client_id`, `contact_id`, `card_id` | Conversas de chat |

### Colunas adicionadas em `clients` (3)

| Coluna | Tipo | Pra que |
|---|---|---|
| `first_sync_done` | bool | Marca se já fez full sync inicial |
| `last_synced_at` | timestamptz | Última sync incremental — usado em `UpdatedAt.After` |
| `last_full_sync_at` | timestamptz | Última reconciliação completa |

### RPCs (2)

- **`helena_get_sync_window(client_id, buffer_mins=5)`** — Retorna o timestamp pra usar em `UpdatedAt.After`. Já desconta 5min de overlap defensivo. Retorna `NULL` se cliente nunca sincronizou (= rodar full sync).
- **`helena_mark_sync_complete(client_id, full_sync=false)`** — Atualiza `last_synced_at = NOW()`. Se `full_sync=true`, também marca `last_full_sync_at`.

### View (1)

- **`v_helena_client_summary`** — Resumo agregado por cliente (qtd de panels, cards, contratos fechados, contatos, sessions, última atualização). Pronto pra UI de status.

## Conexão com os workflows n8n (próximo passo)

```
Workflow A (First Sync, manual)
├─ GET clients WHERE first_sync_done = FALSE
├─ Loop por cliente:
│    ├─ Busca panels + cards + contacts + sessions (TODOS, sem filtro)
│    ├─ UPSERT nas 4 tabelas
│    └─ helena_mark_sync_complete(client_id, full_sync = TRUE)
└─ Done

Workflow B (Cron Incremental, horário)
├─ GET clients WHERE first_sync_done = TRUE AND active = TRUE
├─ Loop por cliente:
│    ├─ since = helena_get_sync_window(client_id)
│    ├─ Busca cards com UpdatedAt.After = since
│    ├─ UPSERT mudanças nas 4 tabelas
│    └─ helena_mark_sync_complete(client_id, full_sync = FALSE)
└─ Done

Workflow C (Full Resync, semanal/manual)
└─ Mesmo que A, mas roda em todos os clientes (reconciliação)
```

## Idempotência

A migration usa `IF NOT EXISTS` em tudo. Pode rodar várias vezes sem quebrar. Não dropa dados.

Pra reset total (apaga dados das 4 tabelas), descomente os `DROP TABLE` no topo do arquivo.

## Sobre a tabela `helena_cards` que já existe em produção

O dashboard atual já tem uma tabela `helena_cards`. **Esta migration vai falhar** se rodar no banco de produção tal qual (conflitos de schema).

Recomendado:
- **Rode em um banco/projeto Supabase de teste** primeiro
- Quando for migrar pra produção, faça `ALTER TABLE` específico nas colunas que faltam, ou renomeie o existente

## Verificação pós-migration

```sql
-- 1. Tabelas criadas?
\dt helena_*

-- 2. Colunas em clients?
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'clients'
   AND column_name IN ('first_sync_done', 'last_synced_at', 'last_full_sync_at');

-- 3. RPCs?
SELECT proname FROM pg_proc WHERE proname LIKE 'helena_%';

-- 4. View?
SELECT * FROM v_helena_client_summary LIMIT 5;
```
