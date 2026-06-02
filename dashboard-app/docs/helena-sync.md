# Helena API Sync — Documentação

> Como o sistema busca os dados da Helena CRM. Simulação real feita em cima de **Sousa & Costa**.

---

## 🔑 Onde fica o token

Cada cliente tem sua própria API key armazenada em `public.clients.helena_api_key`.

```sql
SELECT id, name, helena_api_key FROM clients WHERE slug='sousa-costa';
```
| campo | valor |
|---|---|
| `id` | `a1b2c3d4-0002-0002-0002-000000000002` |
| `name` | Sousa & Costa |
| `helena_api_key` | `pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY` |

Painéis vinculados (`client_panels`):

| panel_id | panel_name |
|---|---|
| `e5c9b5ab-083f-455f-84a4-0eecb6d94d8e` | CRM Sousa & Costa (Nº8892) |
| `6466d536-d8d1-40b3-9769-ef68a59713f7` | CRM Sousa & Costa (Nº6225) |
| `e6e830ea-b37a-4243-b656-eba8fa8ad4cd` | CRM Comercial IA |

A edge function lê `clients.helena_api_key` pelo `clientId` recebido no body e injeta no header:
```
Authorization: Bearer <helena_api_key>
Accept:        application/json
```

---

## 📡 Os 3 endpoints que alimentam tudo

### 1) `GET /crm/v1/panel/card` — lista os leads (cards)

```http
GET https://api.helena.run/crm/v1/panel/card
    ?PanelId=e5c9b5ab-083f-455f-84a4-0eecb6d94d8e
    &PageSize=100
    &PageNumber=1
    &IncludeDetails=StepTitle
    &IncludeDetails=StepPhase
    &IncludeDetails=PanelTitle
    &IncludeDetails=ResponsibleUser
    &IncludeDetails=CustomFields
    &IncludeDetails=Contacts
Authorization: Bearer pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY
Accept: application/json
```

Resposta real (recortada):
```json
{
  "items": [{
    "id": "9101adb3-e755-409a-bc0a-5d9b1ffbb5e7",
    "createdAt": "2025-09-25T00:50:47Z",
    "panelId": "e5c9b5ab-...", "panelTitle": "CRM Sousa & Costa (Nº8892)",
    "stepId": "58d60594-...", "stepTitle": "❌ Não seguiu com o contrato", "stepPhase": "FINAL",
    "title": "👤Wadson Luiz | 📞 (31) 98648-9232",
    "key": "CSC-171",
    "tagIds": ["1d64f470-..."],
    "contactIds": ["2c5b9f73-b7c1-4670-a6cf-d02c7d7d538d"],
    "contacts": [{"id": "2c5b9f73-...", "name": "WADSON LUIZ DA SILVA (SOUSA & COSTA)"}]
  }],
  "totalItems": 2530, "totalPages": 1265, "hasMorePages": true
}
```

Sousa & Costa tem **2.530 cards** só nesse painel. O loop pagina `PageNumber=1,2,3…` enquanto `hasMorePages=true`, com `delay 2000ms` entre páginas. Cada card é gravado em `helena_cards` (upsert por `id`).

### 2) `GET /chat/v1/session?ContactId=...` — sessões de chat do contato

Para cada card com `sessions_synced=false`, pega `contactIds[0]`:
```http
GET https://api.helena.run/chat/v1/session?ContactId=2c5b9f73-b7c1-4670-a6cf-d02c7d7d538d
Authorization: Bearer pn_qETvmJFrfT0O...
```
Resposta real:
```json
{"items": [{
  "id": "959333f6-30fc-4a81-a5e2-a35e78f17311",
  "status": "COMPLETED",
  "contactId": "2c5b9f73-...",
  "previewUrl": "https://advmidia.wts.chat/redirect?type=SESSION&id=959333f6-...",
  "utm": {"source": "FACEBOOK", "sourceId": "120228193261540258", "clid": "AfdvCLYF..."}
}]}
```

### 3) `GET /chat/v2/session/{id}` — detalhe completo da sessão

```http
GET https://api.helena.run/chat/v2/session/959333f6-30fc-4a81-a5e2-a35e78f17311
    ?includeDetails=AgentDetails
    &includeDetails=DepartmentsDetails
    &includeDetails=ContactDetails
    &includeDetails=ChannelTypeDetails
    &includeDetails=ClassificationDetails
    &includeDetails=ChannelDetails
Authorization: Bearer pn_qETvmJFrfT0O...
```

> ⚠️ Os nomes de `includeDetails` em `/chat/v2` são **case-sensitive** e exigem o sufixo `Details`. Usar `Agent`, `Channel`, `Utm`, `PreviewUrl` retorna **HTTP 500 FORM_ERROR**. Sempre usar `AgentDetails`, `ChannelDetails`, etc.

Resultado gravado em `helena_sessions` (linha por sessão, com `card_id`, `contact_id`, `utm_*`, `previewUrl`, `session_detail_full` JSONB).

---

## 🧮 Fórmula completa

```
INPUT: clientId = a1b2c3d4-0002-...
   ↓
1) SELECT helena_api_key FROM clients WHERE id=clientId
   ↓
2) check_rate_limit(sha256(apiKey))  →  máx 900 req / 5min  (trava 5min se 429)
   ↓
3) Para cada panel em client_panels:
     loop pageNumber=1..N enquanto hasMorePages:
        GET /crm/v1/panel/card?PanelId=...&PageNumber=N&PageSize=100  + headers
        delay 2000ms
        UPSERT em helena_cards (client_id = clientId)
   ↓
4) Para cada card novo (sessions_synced=false), em lotes de 20:
     GET /chat/v1/session?ContactId={contactIds[0]}
     para cada session.id:
        GET /chat/v2/session/{id}?includeDetails=AgentDetails&...
     UPSERT em helena_sessions
   ↓
5) Frontend NÃO chama Helena. Lê só do cache:
     fetchCardsFromDB(clientId)     → SELECT * FROM helena_cards    WHERE client_id=clientId
     fetchSessionsFromDB(clientId)  → SELECT * FROM helena_sessions WHERE client_id=clientId
```

## ⏱ Proteções aplicadas

| Proteção | Valor |
|---|---|
| Throttle entre requests | 2000 ms |
| Lote de cards p/ sessions | 20 por invocação |
| Sessions em paralelo | 3 |
| Self-chain (sync recursivo) | até 10x |
| Rate-limit local | 900 req / 5 min por API key |
| Em 429 → lock | 5 min |
| Retry com backoff | 3–5x, 1s × tentativa |

## 🟢 Sync manual (botões)

- **Lead específico** → `POST /functions/v1/sync-sessions` body `{cardId, force:true}` → resolve `client_id` + `helena_api_key` pelo `cardId`, faz os 2 requests `/chat/v1` + `/chat/v2`.
- **Cliente inteiro** → `POST /functions/v1/sync-all-clients` body `{clientId}` → dispara `sync-helena` + `sync-sessions` + `sync-helena-agents` em sequência.

## ⛔ Crons

Todos os crons de sync automático estão **desativados**. A sincronização só roda via botão manual.
