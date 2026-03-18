# KpiStackDeck

Componente reutilizavel para cards KPI com:

- card compacto com tipografia Lora
- comparativo rotativo (ontem, semana passada, mes passado)
- deck empilhado de dois cards
- troca automatica
- swipe manual com continuidade de gesto (sem snap-back)

## Exports

Arquivo: `src/shared/ui/KpiStackDeck.tsx`

- `KpiDeckCard`
- `KpiStackDeck`
- `createDefaultKpiDeckPreferences`
- `reorderKpiDeckComparisons`
- `KPI_DECK_COMPARISON_ORDER`
- tipos `KpiDeck*`

## Exemplo rapido

```tsx
import {
  KpiStackDeck,
  createDefaultKpiDeckPreferences,
  type KpiDeckCardDefinition,
} from "../../shared/ui/KpiStackDeck";

type CardId = "pending" | "revenue";

const preferences = createDefaultKpiDeckPreferences<CardId>(["pending", "revenue"]);

const pendingCard: KpiDeckCardDefinition<CardId> = {
  id: "pending",
  title: "Pendentes de confirmacao",
  format: "count",
  value: 3,
  comparisonValues: { yesterday: 1, weekAgo: 4, monthAgo: 2 },
  nounSingular: "pendencia",
  nounPlural: "pendencias",
  emptyValueText: "--",
  noCurrentDataText: "Sem base para comparar.",
};

const revenueCard: KpiDeckCardDefinition<CardId> = {
  id: "revenue",
  title: "Receita semanal prevista",
  format: "currency",
  value: 220000,
  comparisonValues: { yesterday: 180000, weekAgo: 210000, monthAgo: 160000 },
  emptyValueText: "--",
  noCurrentDataText: "Sem base de receita.",
};

<KpiStackDeck
  primaryDefinition={pendingCard}
  secondaryDefinition={revenueCard}
  primaryPreferences={preferences.pending}
  secondaryPreferences={preferences.revenue}
  loading={false}
  comparisonError={null}
  onPressCard={(cardId) => {
    // abrir modal de configuracao do card
  }}
  autoSwapMs={10000}
/>;
```

## Notas

- `comparisonValues` usa valores absolutos (nao deltas).
- O componente calcula texto/tendencia internamente.
- Para modo fixo/dinamico e ordem, use `KpiDeckPreferences`.
