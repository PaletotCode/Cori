# Prompt 10 - Timeline Unificada, Notificacoes e Fechamento de 50%

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Consolidar timeline individual do paciente para o psicologo, entregar arquitetura de notificacoes v1 e fechar 50% do MVP com evidencias completas.

## Escopo (Tela/Funcionalidade)

### Psicologo
- Timeline individual completa
- Filtros por categoria
- Visualizacao de eventos de notificacao

### Paciente
- Inbox de notificacoes
- Preferencias de notificacao

## Implementacao Obrigatoria

1. Timeline unificada por paciente com filtros:
- sessoes
- atividades
- formularios
- documentos (v1: shared/opened/acknowledged)
- notificacoes
- app usage
2. Motor de notificacoes v1:
- gatilho por evento de dominio
- regras por tenant e por paciente
- janela de silencio
- frequencia maxima
3. Tracking de entrega:
- queued/sent/delivered/opened/action_taken/failed
4. Inbox no app do paciente.
5. Push + realtime + persistencia de historico.
6. Checklist final de 50% do MVP.

## Teste Obrigatorio

1. Integracao end-to-end de notificacoes.
2. Testes de regras (janela de silencio/frequencia).
3. Teste de tracking completo de status.
4. Teste de timeline consolidada com filtros.

## Validacao Obrigatoria

1. Toda acao critica do paciente gera evento na timeline do psicologo.
2. Paciente recebe notificacoes esperadas.
3. Psicologo enxerga entrega/abertura/acao em notificacoes.
4. Nao ha vazamento entre tenants.

## Evidenciacao Obrigatoria

Tabela componentizada completa por:

- Tela timeline psicologo
- Tela inbox paciente
- Motor de regras de notificacao
- Tracking de entrega
- Realtime de propagacao

## Resultado Final Obrigatorio

1. Relatorio final de 50% do MVP entregue.
2. Matriz do que entrou e do que ficou para proxima etapa.
3. Lista de debitos tecnicos.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 10 como concluido.

