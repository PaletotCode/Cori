# Apple Calendar Agenda Kit

Conjunto reutilizavel para montar agenda estilo Apple dentro de qualquer tela React Native.

## Componentes

- `AppleAgendaCalendar`: shell visual (top bar, ano/mes, modos, animacoes e swipe de mes).
- `AgendaAssignSheet`: modal de atribuicao (sessao, atividade via template, formulario via template).
- `AgendaViewMenu`: seletor de modos (`compact`, `stack`, `details`, `list`).
- `AgendaYearView` e `AgendaMonthView`: renders especializados para ano e mes.
- `dateUtils.ts`: utilitarios de data e matriz mensal.

## Contrato minimo

1. Fornecer eventos agrupados por dia (`Map<string, AgendaCalendarEvent[]>`).
2. Controlar no host:
   - `scope`: `year | month`
   - `mode`: `compact | stack | details | list`
   - `focusedMonth`, `selectedDateKey`.
3. Ligar callbacks de navegacao:
   - troca de mes,
   - selecao de dia,
   - `Hoje`,
   - abertura do menu `+`.

## Exemplo de uso

```tsx
<AppleAgendaCalendar
  loading={loading}
  infoMessage={info}
  errorMessage={error}
  scope={scope}
  mode={mode}
  selectedDateKey={selectedDateKey}
  todayDateKey={todayDateKey}
  focusedMonth={focusedMonth}
  eventsByDate={eventsByDate}
  onScopeChange={setScope}
  onModeChange={setMode}
  onSelectDate={setSelectedDateKey}
  onFocusedMonthChange={setFocusedMonth}
  onJumpToToday={jumpToToday}
  onOpenCreate={() => setCreateSheetVisible(true)}
  onSearchPress={onSearchPress}
/>
```
