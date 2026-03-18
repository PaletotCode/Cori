# Prompt 07 - Agenda, Sessoes, Confirmacao e Realtime

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Implementar agenda clinica com sessoes e confirmacao, refletindo atualizacoes em tempo real para psicologo e paciente.

## Escopo (Tela/Funcionalidade)

### Psicologo
- Agenda (dia/semana/mes)
- Sessao detalhada
- Confirmacao/remarcacao/cancelamento

### Paciente
- Lista de sessoes
- Confirmar presenca

## Implementacao Obrigatoria

1. Modelos/Endpoints de sessao e agenda.
2. Confirmacao de sessao pelo paciente.
3. Atualizacao realtime de status de sessao.
4. Registro de eventos na timeline.
5. Base de lembretes de sessao (job scheduler).

## Teste Obrigatorio

1. Integracao agenda/sessao.
2. Teste de transicao de estado de sessao.
3. Teste realtime de propagacao de eventos.
4. Teste de lembrete agendado.

## Validacao Obrigatoria

1. Psicologo enxerga mudanca de status imediatamente.
2. Paciente confirma sessao sem inconsistencias.
3. Eventos de sessao aparecem na timeline do psicologo.

## Evidenciacao Obrigatoria

Tabela componentizada por:

- Agenda
- Sessao detalhe
- Confirmacao paciente
- Realtime
- Timeline de sessao

## Resultado Final Obrigatorio

Resumo + estabilidade da agenda para suportar atividades no Prompt 08.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 07 como concluido.

