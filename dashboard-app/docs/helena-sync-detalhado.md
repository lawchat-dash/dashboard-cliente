# Helena API — Request completo + Lógica detalhada

> Detalhamento técnico passo a passo. Simulação real com **Sousa & Costa** (`clientId = a1b2c3d4-0002-0002-0002-000000000002`, `helena_api_key = pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY`).

---

## 0) Header padrão de TODO request à Helena

```
Authorization: Bearer pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY
Accept:        application/json
```

A chave é lida do banco antes do primeiro request:

```sql
SELECT helena_api_key FROM clients WHERE id = 'a1b2c3d4-0002-0002-0002-000000000002';
```

E é injetada em todo `fetch()` dentro das edge functions (`sync-helena`, `sync-sessions`).

---

## 1) `GET /crm/v1/panel/card` — listar leads (paginado)

### Request completo (curl real)
```bash
curl -G 'https://api.helena.run/crm/v1/panel/card' \
  -H 'Authorization: Bearer pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY' \
  -H 'Accept: application/json' \
  --data-urlencode 'PanelId=e5c9b5ab-083f-455f-84a4-0eecb6d94d8e' \
  --data-urlencode 'PageSize=100' \
  --data-urlencode 'PageNumber=1' \
  --data-urlencode 'IncludeDetails=StepTitle' \
  --data-urlencode 'IncludeDetails=StepPhase' \
  --data-urlencode 'IncludeDetails=PanelTitle' \
  --data-urlencode 'IncludeDetails=ResponsibleUser' \
  --data-urlencode 'IncludeDetails=CustomFields' \
  --data-urlencode 'IncludeDetails=Contacts'
```

### URL exata construída no código
`supabase/functions/sync-helena/index.ts:280`
```ts
const apiUrl = `${BASE_URL}/panel/card?PanelId=${panel.id}` +
  `&PageSize=100&PageNumber=${pageNumber}` +
  `&IncludeDetails=StepTitle&IncludeDetails=StepPhase&IncludeDetails=PanelTitle` +
  `&IncludeDetails=ResponsibleUser&IncludeDetails=CustomFields&IncludeDetails=Contacts`;
```

### Resposta (recortada — Sousa & Costa, painel Nº8892)
```json
{
  "items": [{
    "id": "9101adb3-e755-409a-bc0a-5d9b1ffbb5e7",
    "createdAt": "2025-09-25T00:50:47Z",
    "updatedAt": "2025-10-02T14:12:03Z",
    "archived": false,
    "panelId": "e5c9b5ab-083f-455f-84a4-0eecb6d94d8e",
    "panelTitle": "CRM Sousa & Costa (Nº8892)",
    "stepId": "58d60594-...", "stepTitle": "❌ Não seguiu com o contrato", "stepPhase": "FINAL",
    "title": "👤Wadson Luiz | 📞 (31) 98648-9232",
    "key": "CSC-171", "number": 171,
    "tagIds": ["1d64f470-..."],
    "contactIds": ["2c5b9f73-b7c1-4670-a6cf-d02c7d7d538d"],
    "contacts": [{"id": "2c5b9f73-...", "name": "WADSON LUIZ DA SILVA (SOUSA & COSTA)"}],
    "customFields": { "conversa-iniciada-": ["FACEBOOK"], "an-ncio": "..." }
  }],
  "totalItems": 2530, "totalPages": 26, "hasMorePages": true
}
```

### Lógica
```
loop pageNumber = 1, 2, 3 ...
  faz GET acima
  delay 2000ms entre páginas
  acumula items em allCards
para enquanto hasMorePages === false
```

---

## 2) `GET /chat/v1/session?ContactId=...` — sessões do contato

Para cada card com `sessions_synced = false`, pega `contactIds[0]` e chama:

### Request completo
```bash
curl -G 'https://api.helena.run/chat/v1/session' \
  -H 'Authorization: Bearer pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY' \
  -H 'Accept: application/json' \
  --data-urlencode 'ContactId=2c5b9f73-b7c1-4670-a6cf-d02c7d7d538d'
```

Código: `sync-sessions/index.ts:280`
```ts
fetchWithRetry(`${CHAT_V1_URL}/session?ContactId=${contactId}`, apiHeaders, ...)
```

### Resposta real
```json
{
  "items": [{
    "id": "959333f6-30fc-4a81-a5e2-a35e78f17311",
    "status": "COMPLETED",
    "contactId": "2c5b9f73-b7c1-4670-a6cf-d02c7d7d538d",
    "createdAt": "2025-09-25T00:51:14Z",
    "previewUrl": "https://advmidia.wts.chat/redirect?type=SESSION&id=959333f6-...",
    "utm": { "source": "FACEBOOK", "sourceId": "120228193261540258", "clid": "AfdvCLYF..." }
  }]
}
```

Devolve a lista de `session.id` que será detalhada no passo 3.

---

## 3) `GET /chat/v2/session/{id}` — detalhe completo da sessão

### Request completo
```bash
curl -G 'https://api.helena.run/chat/v2/session/959333f6-30fc-4a81-a5e2-a35e78f17311' \
  -H 'Authorization: Bearer pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY' \
  -H 'Accept: application/json' \
  --data-urlencode 'includeDetails=AgentDetails' \
  --data-urlencode 'includeDetails=DepartmentsDetails' \
  --data-urlencode 'includeDetails=ContactDetails' \
  --data-urlencode 'includeDetails=ChannelTypeDetails' \
  --data-urlencode 'includeDetails=ClassificationDetails' \
  --data-urlencode 'includeDetails=ChannelDetails'
```

> ⚠️ **Case-sensitive**. Os valores aceitos terminam com `Details`. Usar `Agent`, `Channel`, `Utm`, `PreviewUrl` → HTTP 500 `FORM_ERROR`.

Código: `sync-sessions/index.ts:101`
```ts
fetchWithRetry(
  `${CHAT_V2_URL}/session/${session.id}?includeDetails=AgentDetails` +
  `&includeDetails=DepartmentsDetails&includeDetails=ContactDetails` +
  `&includeDetails=ChannelTypeDetails&includeDetails=ClassificationDetails` +
  `&includeDetails=ChannelDetails`, apiHeaders, ...
)
```

### Resposta real (campos usados)
```json
{
  "id": "959333f6-...", "status": "COMPLETED",
  "createdAt": "2025-09-25T00:51:14Z", "closedAt": "2025-09-25T01:48:22Z",
  "agentDetails": { "name": "Maria SDR" },
  "departmentsDetails": [{ "name": "Comercial" }],
  "channelType": "WHATSAPP",
  "channelDetails": { "displayName": "WhatsApp Comercial", "name": "advmidia" },
  "classificationDetails": { "name": "Qualificado" },
  "contactDetails": { "name": "WADSON LUIZ...", "phonenumberFormatted": "(31) 98648-9232", "email": null },
  "utm": { "source": "FACEBOOK", "sourceId": "120228193261540258", "medium": null, "campaign": null, "clid": "AfdvCLYF...", "referralUrl": null }
}
```

### Mapeamento → tabela `helena_sessions` (cada coluna ↔ campo do JSON)
| coluna DB | origem no JSON |
|---|---|
| `id` | `id` |
| `status` | `status` |
| `session_created_at` | `createdAt` |
| `session_closed_at` | `closedAt` |
| `agent_name` | `agentDetails.name` |
| `department_name` | `departmentDetails.name` ∥ `departmentsDetails[0].name` |
| `channel_type` | `channelType` |
| `channel_name` | `channelDetails.displayName` ∥ `channelDetails.name` |
| `classification` | `classification.name` ∥ `classificationDetails.name` |
| `contact_name` | `contactDetails.name` |
| `contact_phone` | `contactDetails.phonenumberFormatted` ∥ `phonenumber` |
| `contact_email` | `contactDetails.email` |
| `utm_source` | `utm.source` |
| `utm_source_id` | `utm.sourceId` |
| `utm_medium` | `utm.medium` |
| `utm_campaign` | `utm.campaign` |
| `utm_content` | `utm.content` |
| `utm_headline` | `utm.headline` |
| `utm_term` | `utm.term` |
| `utm_referral_url` | `utm.referralUrl` |
| `utm_clid` | `utm.clid` |
| `session_detail_full` | objeto JSON inteiro (JSONB) |

---

## 4) `GET /crm/v1/panel/card/{id}/note` — anotações (notas de contrato)

Só roda se `fetchNotes=true` no body do sync, e apenas para cards classificados como **CONTRATO FECHADO**.

```bash
curl -H 'Authorization: Bearer pn_qETvm...' \
     -H 'Accept: application/json' \
     'https://api.helena.run/crm/v1/panel/card/9101adb3-e755-409a-bc0a-5d9b1ffbb5e7/note'
```

A função extrai do texto da nota (regex):
- `📂 Caso:` → `parsed.caso`
- `📄 Resumo do caso:` → `parsed.resumo_caso`
- `📊 Qualidade do contrato:` → `parsed.qualidade` (Alta/Média/Baixa)
- `💰 Potencial retorno:` → `parsed.potencial_retorno`

Resultado vai pra `helena_cards.contract_note` (JSONB cru) e `helena_cards.contract_parsed` (campos extraídos).

---

## 🔁 Fluxo completo do botão "Sincronizar"

```
[Frontend] POST /functions/v1/sync-all-clients  body: { clientId }
            │
            ▼
[sync-all-clients]  →  SELECT clients WHERE id=clientId
                       SELECT client_panels WHERE client_id=clientId
       │
       ├──► para cada painel: POST /functions/v1/sync-helena
       │                        body: { clientId, panelId, mode:'incremental', fetchNotes:true }
       │         │
       │         ▼
       │    [sync-helena]
       │       1. SELECT helena_api_key FROM clients
       │       2. sha256(apiKey) → apiKeyHash
       │       3. check_rate_limit(apiKeyHash, clientId, 0)  ←  aborta se locked
       │       4. (incremental) SELECT MAX(synced_at) → lastSyncedAt
       │       5. while hasMorePages:
       │            check_rate_limit(+1)
       │            GET /crm/v1/panel/card?PanelId=...&PageNumber=N&PageSize=100
       │            se 429 → lock_rate_limit(300s) e aborta
       │            delay 2000ms
       │       6. filtra cards onde card.updatedAt > existing.updated_at
       │       7. UPSERT helena_cards em lotes de 50 (onConflict: id)
       │       8. (se fetchNotes) loop até 10 cards CONTRATO FECHADO:
       │            GET /crm/v1/panel/card/{id}/note
       │            parseContractNote() → UPSERT contract_note + contract_parsed
       │       9. retorna { totalFetched, upserted, rateLimitHit }
       │
       ├──► delay 5000ms entre painéis
       │
       └──► POST /functions/v1/sync-sessions  body: { clientId }
                 │
                 ▼
            [sync-sessions]
               1. apiKey + hash + check_rate_limit
               2. SELECT id, contact_ids FROM helena_cards
                    WHERE client_id=clientId AND sessions_synced=false
                    ORDER BY created_at DESC LIMIT 20
               3. para cada card:
                    contactId = contact_ids[0]
                    check_rate_limit(+1)
                    GET /chat/v1/session?ContactId={contactId}
                    para cada session em chunks de 3:
                      check_rate_limit(+3)
                      GET /chat/v2/session/{id}?includeDetails=AgentDetails&...
                      UPSERT helena_sessions (onConflict: id)
                      delay 2000ms entre chunks
                    UPDATE helena_cards SET sessions_synced=true WHERE id=card.id
                    delay 2000ms entre cards
               4. se restaram cards (cards.length === 20) e chainCount < 10:
                    self-chain → POST /functions/v1/sync-sessions { chainCount+1, clientId }
```

---

## 🟢 Botão "Sincronizar este lead" (dentro do AuditModal)

Caminho mais curto, 2 requests apenas:

```
POST /functions/v1/sync-sessions  body: { cardId, force: true }
       │
       ▼
[sync-sessions]
   1. SELECT client_id FROM helena_cards WHERE id=cardId
   2. SELECT helena_api_key FROM clients WHERE id=client_id
   3. GET /chat/v1/session?ContactId={card.contact_ids[0]}
   4. GET /chat/v2/session/{session.id}?includeDetails=...
   5. UPSERT helena_sessions
   6. UPDATE helena_cards.sessions_synced = true
   7. retorna { processedCards, totalSessions }
```

---

## ⛔ Proteções aplicadas em CADA request

| Camada | Onde | Valor |
|---|---|---|
| Throttle entre páginas/sessões | `delay()` no loop | **2000 ms** |
| Lote de cards / invocação sessions | `BATCH_SIZE` | **20** |
| Sessões em paralelo | `PARALLEL_SESSIONS` | **3** |
| Self-chain max | `MAX_CHAINS` | **10** |
| Rate-limit local (por hash da apiKey) | RPC `check_rate_limit` | **900 req / 5 min** |
| Lock após 429 | RPC `lock_rate_limit` | **300 s (5 min)** |
| Retry com backoff | `fetchWithRetry` | **3x (1s × tentativa)** |
| Retry no `rateLimitedFetch` | sync-helena | **5x exponencial até 30s** |

---

## ⛔ Crons

Todos os crons (`sync-client-*`, `sync-notificativo-leads`, `refresh-client-metrics`, etc.) estão **desativados**. Sincroniza **apenas** quando alguém clica em:
- "Sincronizar tudo" (cliente inteiro) → `sync-all-clients`
- "Sincronizar este lead" (AuditModal) → `sync-sessions` com `{cardId, force:true}`
