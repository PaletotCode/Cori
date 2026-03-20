# Temporary Readme - Refatoracao Detalhes + KPI

## Objetivo
Implementar todos os ajustes solicitados para KPI no Painel e Details de Pacientes, com foco em consistencia de UX e performance.

## Checklist de Subtarefas

### A. KPI do Painel - Rotacao automatica
- [x] A1. Mapear fluxo atual da rotacao automatica no componente do KPI.
- [x] A2. Corrigir regra de autoplay para respeitar `carouselEnabled`.
- [x] A3. Garantir que a logica tambem respeite o card ativo no deck.
- [x] A4. Validar que o timer e limpo/reiniciado corretamente ao trocar preferencias.

### B. Timeline do paciente
- [x] B1. Ajustar paginacao para no maximo 3 eventos por pagina.
- [x] B2. Manter comportamento idêntico da paginacao da Agenda (`Anterior | Pagina X de Y | Proxima`).
- [x] B3. Alinhar botao de filtros com o eixo da data ("Hoje, X de marco").
- [x] B4. Remover texto de preferencias (`max/h`, `origem`) da timeline.
- [x] B5. Remover texto `Inicio do historico (Cadastro)`.
- [x] B6. Adicionar `Check All` ao lado de `Filtros da timeline` no modal.

### C. Atividades + Formularios
- [x] C1. Implementar paginacao igual a timeline.
- [x] C2. Limitar exibicao para 3 itens por pagina.
- [x] C3. Aplicar os mesmos controles de navegacao (`Anterior/Proxima`).

### D. Hero Banner + Contato
- [x] D1. Remover bloco antigo com 3 cards de `Detalhes do contato`.
- [x] D2. Descartar exibicao de `Canal preferido`.
- [x] D3. Adicionar botao dedicado de emergencia no Hero Banner.
- [x] D4. Posicionar botao de emergencia ao lado de WhatsApp e Ligar.
- [x] D5. Ajustar botao `Ligar` para exibir `Ligar + numero`.
- [x] D6. Melhorar handler de telefone para evitar erro duro em device/simulador sem suporte a `tel:`.

### E. Visao geral
- [x] E1. Remover grade antiga de 4 cards.
- [x] E2. Substituir por 2 cards no formato de carousel reutilizavel.
- [x] E3. Reusar o mesmo componente/logica de carousel do Painel.

### F. Limpeza final da tela
- [x] F1. Remover bloco `Descricao completa`.
- [x] F2. Ajustar barra superior de busca para `Buscar contatos`.
- [x] F3. Aumentar largura horizontal da barra de busca.

### G. Validacao
- [x] G1. Executar typecheck.
- [x] G2. Executar lint nos arquivos alterados.
- [x] G3. Recarregar app no Expo para verificacao visual.

