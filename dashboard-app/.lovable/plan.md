

## Plano: Filtro "Número" multi-seleção

### O que vai fazer
Transformar o filtro **Número** (canal/WhatsApp) — hoje um `<select>` simples de uma escolha — num multi-seleção igual ao filtro de Etapas/Responsáveis. O cálculo de todos os KPIs e gráficos passa a considerar leads de qualquer um dos números marcados (união, OR).

### Mudanças

**1. `src/hooks/useFilters.ts`**
- `Filters.channelNumber: string` → `channelNumbers: string[]` (default `[]` = todos).
- `cardIdsForChannel`: se array vazio retorna `null`; senão inclui `cardId` quando `extractHumanId(s)` está dentro do array selecionado.

**2. `src/components/FiltersBar.tsx`** (mobile + desktop + resumo colapsado)
- Substituir os dois `<select>` de Número por um popover multi-select com checkboxes (mesmo padrão visual do `StepMultiSelect` já existente no arquivo).
- Botão exibe: "Todos números" / "Número X" (1 selec.) / "N números" (vários).
- Atualizar contagem `activeFilterCount`: contar como ativo quando `channelNumbers.length > 0`.
- "Limpar filtros" reseta para `[]`.

**3. `src/pages/Index.tsx`**
- Apenas propaga o novo formato (já passa `uniqueChannelNumbers` — sem mudança de assinatura aqui).

### Compatibilidade
Nenhum outro componente lê `filters.channelNumber` diretamente — toda a lógica de filtragem de cards já passa por `useFilters` → `filteredCards`, então KPIs, funil, gráficos, etc. recalculam automaticamente.

