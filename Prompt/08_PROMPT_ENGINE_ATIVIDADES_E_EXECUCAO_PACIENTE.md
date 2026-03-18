# Prompt 08 - Engine de Atividades e Execucao pelo Paciente

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Entregar a engine de atividades v1 com criacao pelo psicologo, execucao pelo paciente e rastreio detalhado na timeline.

## Escopo (Tela/Funcionalidade)

### Psicologo
- Central de atividades
- Criar atividade
- Reenvio/edicao/cancelamento

### Paciente
- Lista de atividades
- Execucao de atividade (abrir/iniciar/pausar/concluir)
- Feedback opcional

## Implementacao Obrigatoria

1. Tipos de atividade v1:
- tarefa simples
- meditacao guiada
- habito (ex: agua)
- leitura/documento
2. Atribuicao por paciente.
3. Regras de recorrencia e prazo.
4. Realtime para entrega imediata ao paciente.
5. Eventos detalhados de uso para timeline:
- assigned/opened/started/paused/resumed/completed/overdue/reopened
- tempo em execucao

## Teste Obrigatorio

1. Integracao de criacao/atribuicao.
2. Testes de estado da atividade.
3. Teste realtime de entrega no app do paciente.
4. Teste de atraso/overdue.

## Validacao Obrigatoria

1. Psicologo cria e paciente recebe em tempo real.
2. Paciente executa atividade com transicoes corretas.
3. Timeline do psicologo mostra eventos com timestamps e metadata.

## Evidenciacao Obrigatoria

Tabela componentizada por:

- Central de atividades
- Criar atividade
- Execucao no paciente
- Realtime
- Timeline de atividade

## Resultado Final Obrigatorio

Resumo + aderencia ao modelo de eventos append-only.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 08 como concluido.

