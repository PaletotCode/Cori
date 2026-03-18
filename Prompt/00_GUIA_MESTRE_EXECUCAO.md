# Cori V2 - Guia Mestre de Execucao (Codex)

Este arquivo e a fonte de verdade para todas as execucoes dos 10 prompts.

## Objetivo Macro
Entregar **50% do MVP** do Cori V2 com qualidade de producao inicial, mantendo:

- Multi-tenancy real e isolado.
- Backend como fonte de regra de negocio.
- Frontend como orquestrador de UX.
- Realtime para interacoes criticas.
- Timeline de comportamento do paciente para o psicologo.
- Notificacoes push/inbox com rastreabilidade.

## Stack Obrigatoria

- Frontend: React Native + Expo + TypeScript
- Backend: Python + FastAPI + SQLAlchemy 2 + Alembic
- Banco: PostgreSQL 17.6
- Infra: Redis + Docker + GitHub Actions + Railway

## Principios Obrigatorios

1. Toda acao do paciente gera evento de timeline.
2. `tenant_id` em todas as entidades de dominio.
3. `tenant_id` extraido do JWT/sessao; nunca aceitar no body.
4. Eventos de timeline sao append-only (imutaveis).
5. Realtime via WebSocket; webhook so para integracao externa.
6. Notificacoes com tracking: `queued`, `sent`, `delivered`, `opened`, `action_taken`, `failed`.

## Ordem Obrigatoria por Prompt (Gate de Entrega)

1. **Implementacao**
2. **Teste**
3. **Validacao**
4. **Evidenciacao** (componentizada por tela/funcionalidade/subfuncionalidade)
5. **Resultado final**

### Regra de Reteste
Se a evidenciacao estiver incompleta, inconsistente ou errada:

- corrigir implementacao;
- executar novo teste;
- refazer validacao;
- atualizar evidencias;
- so depois entregar.

## Formato Obrigatorio de Evidenciacao

Usar tabela com este formato no resultado de cada prompt:

| Tela | Subtela | Funcionalidade | Subfuncionalidade | Backend (arquivo/endpoint) | Frontend (arquivo/rota) | Teste executado | Evidencia |
|---|---|---|---|---|---|---|---|

## Memoria Entre Prompts

Ao final de cada prompt, atualizar obrigatoriamente:

- `Prompt/MEMORIA_EXECUCAO.md`
- `Prompt/STATUS_MVP_50.md`

## Definicao de Concluido por Prompt

Um prompt so esta concluido quando:

1. Todos os itens de escopo da rodada foram implementados.
2. Testes executados e reportados.
3. Validacao manual guiada reportada.
4. Evidencias componentizadas entregues.
5. Memoria/Status atualizados.

## Escopo de 50% do MVP (neste ciclo de 10 prompts)

Inclui:

- Fundacao monorepo + infra + CI/CD inicial
- Auth base + tenancy + RLS
- Shell de navegacao Psicologo/Paciente
- Onboarding da clinica
- Triagem dual (convite simples + triagem personalizada)
- Pacientes, perfil, sobrescrita de cadastro e atalho WhatsApp
- Agenda, sessao, confirmacao e realtime base
- Engine de atividades v1
- Form builder v1
- Timeline individual + notificacoes v1

Nao inclui (deixar para proxima etapa):

- Financeiro avancado completo
- Equipe multiprofissional
- Analytics preditivo
- Automacoes complexas multi-canal
