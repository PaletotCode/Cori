# Memoria de Execucao - Cori V2

Este arquivo e atualizado ao fim de cada prompt.

## Estado Atual

- Ultimo prompt concluido: `Prompt 10 - Timeline Unificada, Notificacoes e Fechamento de 50%`
- Percentual entregue do alvo (50%): `50%`
- Data da ultima atualizacao: `2026-03-18`

## Decisoes Tecnicas Consolidadas

- Monorepo resetado do zero preservando apenas `.git` e `Prompt/`.
- Estrutura base adotada: `backend/` (FastAPI), `front-end/` (Expo + TypeScript), `infra/` (Docker Compose).
- Stack local padronizada em containers: `api`, `worker`, `redis` e `postgres:17.6`.
- Healthcheck da API implementado em `/health` com validacao real de PostgreSQL e Redis.
- Pipeline de qualidade inicial estabelecido com lint, typecheck, test e build.
- Bootstrap local padronizado via comando unico `make bootstrap`.
- Nucleo de backend implementado com entidades base `tenant`, `user`, `psychologist`, `patient` e `auth_refresh_tokens`.
- JWT de acesso/refresh com `tenant_id` obrigatorio no payload; contexto de tenant extraido apenas do token.
- Dependencias de banco com `SET LOCAL ROLE cori_app` e `set_config('app.current_tenant_id', ...)` por transacao.
- RLS ativo com `FORCE ROW LEVEL SECURITY` em `users`, `psychologists`, `patients` e `auth_refresh_tokens`.
- Migrations Alembic consolidadas em `20260317_0001_core_auth_multitenancy_rls.py`.
- Endpoints base de sessao prontos: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`.
- Seeds de desenvolvimento adicionadas para tenants de demo e usuarios autenticaveis.
- Front-end reorganizado em `front-end/src` por features: `auth`, `session`, `realtime`, `notifications`, `navigation`.
- Shell Expo Router com grupos de rota `/(auth)` e `/(app)` com guardas de autenticacao por layout.
- Store global por dominio implementada com `authStore`, `sessionStore`, `realtimeStore` e `notificationsStore`.
- Cliente API tipado implementado para auth (`login`, `refresh`, `logout`, `me`) com tratamento de erro tipado.
- Cliente WebSocket tipado com reconexao exponencial e eventos de notificacao.
- Reidratacao de sessao no bootstrap do app via persistencia em `AsyncStorage`.
- Telas base implementadas: login psicologo, entrada paciente por convite (stub) e sessao ativa do psicologo.
- Entidade `practice_profiles` adicionada com relacao 1:1 por tenant e campos dinamicos de clinica (modalidade, financeiro, faltas, notificacoes e triagem).
- Migration `20260317_0002_practice_profile_onboarding.py` adicionada com grants e RLS (`ENABLE` + `FORCE`) para `practice_profiles`.
- Endpoints de configuracao da clinica implementados: `GET /practice-profile` e `PUT /practice-profile`.
- Validacoes de dominio centralizadas em `practice_profile_service` (endereco por modalidade, lembretes sem duplicidade/faixa, triagem custom obrigatoria, normalizacao de payload).
- `/auth/me` passou a expor `onboarding_completed`; guardas de navegacao agora direcionam psicologo para onboarding ou sessao conforme estado.
- Front-end ganhou fluxo de onboarding em 6 etapas + tela de configuracoes para edicao posterior, reutilizando o mesmo form/validacoes.
- Cliente API tipado de practice profile adicionado, com testes de unidade, validacao de fluxo UI e integracao backend para isolamento entre tenants.
- Dominio de entrada do paciente implementado com `patient_intakes` (convite simples e triagem personalizada) e tokens hash seguros com expiracao.
- Timeline append-only implementada em `timeline_events`, com eventos desde o primeiro contato (`intake_invite_created`, `intake_link_opened`, `intake_submitted`, `intake_complement_requested`, `intake_approved`, `patient_activated`, `intake_rejected`, `intake_expired`).
- Endpoints psicologo adicionados para triagem/convites: criacao de link/token, fila recebida, detalhe, revisao (aprovar/rejeitar/complementar) e consulta de timeline.
- Endpoints publicos do paciente adicionados via token: abertura do convite e submissao da entrada/triagem com cadastro minimo e consentimentos.
- Conversao para paciente ativo implementada no `approve` da triagem com criacao de `patients` e vinculacao ao intake.
- RLS + FORCE RLS aplicados em `patient_intakes` e `timeline_events`; isolamento por tenant validado.
- Front-end ganhou tela de triagem/convites do psicologo, fluxo funcional do paciente via token e cliente API tipado para endpoints de triagem.
- Dominio de paciente expandido com perfil completo (dados pessoais e preferencias), trilha append-only em `patient_profile_changes` e soft-delete por arquivamento.
- Endpoints `CRUD + historico` de pacientes adicionados (`/patients`, filtros/busca/ordenacao, detalhe, atualizacao, sobrescrita, arquivamento, trilha de mudancas e timeline por paciente).
- Regra de sobrescrita formalizada com justificativa obrigatoria e registro de antes/depois, mantendo consistencia e rastreabilidade de cadastro inicial.
- Timeline recebeu eventos cadastrais relevantes (`patient_profile_created`, `patient_profile_updated`, `patient_profile_overwritten`, `patient_profile_archived`).
- Fluxo de aprovacao da triagem passou a criar paciente com `profile_source=intake` e registrar trilha inicial no historico de perfil.
- Front-end ganhou modulo de gestao de pacientes com lista filtravel, perfil editavel, sobrescrita operacional e atalho de WhatsApp com fallback para numero invalido.
- Cliente API de pacientes, utilitario de atalho WhatsApp e testes de UI/funcionalidade adicionados no app do psicologo.
- Agenda clinica implementada com modelos `sessions` e `session_reminders`, endpoints de criacao/listagem/detalhe/acoes de sessao e visao por `day/week/month`.
- Confirmacao de sessao pelo paciente implementada via token publico (`/session-links/{token}/sessions` e confirmacao por sessao).
- Realtime backend implementado via WebSocket em `/ws` com autenticacao JWT, `subscribe`, `ping/pong` e broadcast de notificacoes por tenant.
- Eventos de timeline de sessao adicionados (`session_created`, `session_confirmed_by_patient`, `session_confirmed_by_psychologist`, `session_rescheduled`, `session_canceled`, `session_completed`, `session_reminder_sent`).
- Scheduler base de lembretes implementado em `session_service.run_due_reminders_job`, integracao no worker e endpoint operacional `/scheduler/session-reminders/run`.
- Front-end ganhou tela de agenda/sessao para psicologo e tela publica de sessoes/confirmacao para paciente, com recarga automatica apos notificacoes realtime.
- Engine de atividades v1 implementada com entidade `activities`, atribuicao por paciente, tipos `simple_task/guided_meditation/habit/document_reading`, recorrencia (`none/daily/weekly`) e prazo por atividade.
- Fluxo completo psicologo/paciente entregue: central de atividades, criacao, edicao, reenvio, cancelamento, reabertura, listagem publica por token e execucao do paciente (`open/start/pause/complete`) com feedback opcional.
- Timeline append-only expandida com `activity_id` e eventos detalhados de uso (`assigned`, `opened`, `started`, `paused`, `resumed`, `completed`, `overdue`, `reopened`) incluindo `execution_elapsed_seconds` nos eventos de progresso.
- Realtime de atividades integrado com notificacoes imediatas de atribuicao/atualizacao e criacao automatica de nova atribuicao em conclusao de atividade recorrente.
- Scheduler operacional de atraso entregue em `/scheduler/activities-overdue/run` para marcar atividades vencidas e registrar evento `overdue` com timestamp e metadata.
- Form builder clinico v1 implementado com entidade `clinical_forms`, builder por secoes/perguntas, campos `short_text`, `long_text`, `multiple_choice`, `checkbox`, `scale`, `date_time`, obrigatoriedade por pergunta e suporte a rascunho/parcial/final.
- Fluxo psicologo/paciente de formularios entregue com central de formularios, builder, publicar/enviar/agendar/revisar, listagem publica por token, resposta parcial/final do paciente e painel de respostas recebidas.
- Timeline append-only expandida com `form_id` e eventos `assigned`, `opened`, `partial_saved`, `submitted`, `reviewed`, com metadata contextual por acao.
- Realtime de formularios integrado para envio imediato ao paciente, submissao/revisao e dispatch de formularios agendados.
- Scheduler de formularios entregue em `/scheduler/forms-dispatch/run` para liberar formularios no horario configurado.
- Timeline unificada por paciente entregue para psicologo com filtros por categoria: `sessions`, `activities`, `forms`, `documents`, `notifications`, `app_usage`.
- Arquitetura de notificacoes v1 entregue com regras por tenant/paciente (`notification_rules`) e rastreio persistente por entrega (`notification_deliveries`).
- Motor de notificacoes ligado a eventos de dominio (sessoes/atividades/formularios/documentos), aplicando hierarquia de regras, janela de silencio e frequencia maxima por hora.
- Tracking completo de notificacoes entregue com estados `queued/sent/delivered/opened/action_taken/failed` e eventos append-only correlacionados na timeline via `notification_delivery_id`.
- Inbox do paciente entregue com listagem de notificacoes, acao de abertura/acao tomada e registro de eventos de documento `shared/opened/acknowledged`.
- Preferencias de notificacao no app do paciente entregues (canais, janela de silencio, frequencia maxima), incluindo endpoint publico por token.
- Realtime de notificacoes expandido para propagar identificador/status/categoria/evento ao app em tempo real.

## Comandos Validos Confirmados

- `make bootstrap`
- `make build`
- `make up`
- `make health`
- `make migrate`
- `make seed`
- `npm --prefix front-end run lint`
- `npm --prefix front-end run typecheck`
- `npm --prefix front-end run test -- --runInBand`
- `npm --prefix front-end run build`
- `make lint typecheck test`
- `make pipeline`
- `docker compose -f infra/docker-compose.yml exec -T postgres psql -U cori -d cori -c 'select version();'`
- `backend/.venv/bin/pytest backend/tests -q`
- `docker exec cori-postgres psql -U cori -d cori -c "SHOW server_version;"`
- `docker exec cori-postgres psql -U cori -d cori -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('users','psychologists','patients','auth_refresh_tokens') ORDER BY relname;"`
- `curl -fsS -X POST http://localhost:8000/auth/login -H 'Content-Type: application/json' -d '{"email":"dr.aurora@cori.dev","password":"dev123456"}' | python3 -m json.tool`
- `docker exec cori-postgres psql -U cori -d cori -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('users','psychologists','patients','auth_refresh_tokens','practice_profiles') ORDER BY relname;"`
- `docker exec cori-postgres psql -U cori -d cori -c "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('patient_intakes','timeline_events') ORDER BY relname;"`
- `backend/.venv/bin/pytest backend/tests/integration/test_triage_dual_flow.py -q`
- `backend/.venv/bin/pytest backend/tests/integration/test_activities_engine.py -q`

## Riscos Abertos

- Dependencias NPM iniciais reportam vulnerabilidades (`13`, sendo `11` high) e exigem tratamento em rodada dedicada.
- Aviso de deprecacao no ambiente local Python 3.14 (`asyncio.iscoroutinefunction`) via FastAPI/Starlette; nao bloqueia, mas deve ser acompanhado.
- Segredo JWT padrao de desenvolvimento (`change-me-in-env`) e curto; precisa rotacao para valor forte em ambientes reais.
- Politica de unicidade de email esta global em `users.email`; validar se o produto exige unicidade global ou por tenant.
- Suite de UI no front-end usa mocks de `react-native` para teste do wizard; antes de release mobile, complementar com teste E2E real de navegacao/dispositivo.
- Acesso publico por token usa `rls_bypass` controlado por hash+expiracao; reforcar auditoria e rotacao de segredos antes de producao.
- Atalho WhatsApp depende de `Linking.openURL` no dispositivo; validar comportamento em iOS/Android reais (app instalado vs fallback web).
- Job de lembretes no worker foi colocado atras de flag (`WORKER_ENABLE_SESSION_REMINDERS`) para evitar conflito com migrações em ambiente local; habilitar explicitamente em ambiente operacional.
- Envio agendado de formularios depende execucao recorrente do dispatch (`/scheduler/forms-dispatch/run`); em producao exige job cron/worker com observabilidade e alerta de atraso.
- Canal `push` esta modelado e rastreado, mas ainda sem provedor externo real (FCM/APNs) conectado nesta etapa.
- Regras de frequencia usam janela fixa de 1h por paciente; possivel evolucao futura para throttle por categoria/prioridade.
- Endpoints publicos por token exigem reforco operacional de rotacao de segredos e monitoramento de abuso antes de producao.

## Pendencias para o Proximo Prompt

- Planejar etapa 2 do MVP (alem dos 50%) com foco em financeiro avancado e equipe multiprofissional.
- Definir integracao real de push provider (FCM/APNs) com retries e observabilidade.
- Evoluir analytics e automacoes de notificacao por prioridade clinica.

## Log por Prompt

### Prompt 01
- status: concluido
- resumo: reset absoluto do legado, criacao da fundacao do monorepo V2, Docker base (API/Worker/Redis/PostgreSQL 17.6), CI inicial, padroes de qualidade e README com bootstrap unico.
- testes: build de imagens (`make build`), subida de stack (`make up`), healthcheck (`make health`), Postgres 17.6 validado por `select version()`, pipeline local (`make pipeline`) e build web do front-end (`npm --prefix front-end run build`).
- evidencias: `infra/docker-compose.yml`, `.github/workflows/ci.yml`, `backend/app/main.py`, `backend/app/api/routes_health.py`, `backend/app/worker/main.py`, `front-end/app/index.tsx`, `README.md`, `Makefile`.

### Prompt 02
- status: concluido
- resumo: backend core com isolamento multi-tenant via RLS, auth JWT com `tenant_id` obrigatorio, middleware/dependencies de contexto, migrations Alembic, endpoints base de sessao e seeds de desenvolvimento.
- testes: unitarios de auth/token (`test_security.py`, `test_tenant_context.py`), integracao de fluxo auth (`test_auth_flow.py`), integracao de isolamento RLS e bloqueio cruzado (`test_tenant_isolation.py`), pipeline local completo via `make pipeline`, stack/local health via `make up`, `make migrate`, `make seed`, `make health`.
- evidencias: `backend/app/core/security.py`, `backend/app/core/dependencies.py`, `backend/app/services/auth_service.py`, `backend/app/api/routes_auth.py`, `backend/alembic/versions/20260317_0001_core_auth_multitenancy_rls.py`, `backend/tests/integration/test_tenant_isolation.py`, `.github/workflows/ci.yml`.

### Prompt 03
- status: concluido
- resumo: shell React Native/Expo Router com areas Psicologo/Paciente, autenticacao base, guardas de rota, stores globais por dominio (`auth`, `session`, `realtime`, `notifications`), cliente API tipado, cliente realtime tipado com reconexao e reidratacao de sessao.
- testes: unitarios da store auth (`tests/authStore.test.ts`), testes de navegacao/guardas (`tests/navigationGuards.test.ts`), testes de cliente API (`tests/authApiClient.test.ts`), testes de cliente realtime com mock (`tests/realtimeClient.test.ts`), validacao completa via `npm --prefix front-end run lint`, `typecheck`, `test -- --runInBand`, `build` e pipeline integrado `make pipeline`.
- evidencias: `front-end/src/features/auth/store/createAuthStore.ts`, `front-end/src/features/auth/api/authApiClient.ts`, `front-end/src/features/realtime/client/realtimeClient.ts`, `front-end/src/features/navigation/guards.ts`, `front-end/app/(auth)/_layout.tsx`, `front-end/app/(app)/_layout.tsx`, `front-end/src/app/AppBootstrap.tsx`.

### Prompt 04
- status: concluido
- resumo: onboarding completo do psicologo com configuracao dinamica da clinica (modalidade, financeiro, politica de faltas, notificacoes e triagem), persistencia backend com RLS por tenant, leitura/edicao posterior na tela de configuracoes e guardas de navegacao orientadas por `onboarding_completed`.
- testes: unitarios backend de validacao (`backend/tests/unit/test_practice_profile_validation.py`), integracao backend onboarding/isolamento (`backend/tests/integration/test_practice_profile_api.py`), validacao auth atualizada (`backend/tests/integration/test_auth_flow.py`), unitarios front-end de dominio (`front-end/tests/practiceProfileDraft.test.ts`), cliente API (`front-end/tests/practiceProfileApiClient.test.ts`) e fluxo UI completo do wizard (`front-end/tests/practiceProfileOnboardingFlow.test.tsx`), alem de pipeline completo (`make pipeline`) e build web (`npm --prefix front-end run build`).
- evidencias: `backend/app/models/practice_profile.py`, `backend/app/api/routes_practice_profile.py`, `backend/app/services/practice_profile_service.py`, `backend/alembic/versions/20260317_0002_practice_profile_onboarding.py`, `front-end/src/features/practice-profile/screens/PracticeProfileFlowScreen.tsx`, `front-end/app/(app)/psicologo/onboarding.tsx`, `front-end/app/(app)/psicologo/configuracoes.tsx`, `front-end/src/features/navigation/guards.ts`.

### Prompt 05
- status: concluido
- resumo: fluxo dual de entrada implementado com convite simples e triagem personalizada, links/tokens seguros com expiracao, fila de triagens para psicologo, decisao de revisao (aprovar/rejeitar/complementar), conversao para paciente ativo e eventos append-only de timeline desde o primeiro contato.
- testes: integracao de convite simples e triagem custom fim a fim com complemento e aprovacao (`backend/tests/integration/test_triage_dual_flow.py`), testes de expiracao/invalidez de link e isolamento por tenant no mesmo arquivo, regressao completa backend (`backend/.venv/bin/pytest backend/tests -q`), regressao front-end (`npm --prefix front-end run lint`, `typecheck`, `test -- --runInBand`), pipeline integrado (`make pipeline`) e build web (`npm --prefix front-end run build`).
- evidencias: `backend/app/models/patient_intake.py`, `backend/app/models/timeline_event.py`, `backend/app/services/triage_service.py`, `backend/app/api/routes_triage.py`, `backend/alembic/versions/20260317_0003_triage_dual_timeline.py`, `front-end/src/features/triage/api/triageApiClient.ts`, `front-end/src/features/triage/screens/PsychologistTriageInvitesScreen.tsx`, `front-end/src/features/auth/screens/PatientInviteEntryScreen.tsx`, `front-end/app/(app)/psicologo/triagens.tsx`.

### Prompt 06
- status: concluido
- resumo: modulo completo de gestao de pacientes entregue com CRUD por tenant, perfil basico+preferencias, sobrescrita de cadastro inicial com justificativa, trilha append-only de mudancas, eventos de timeline cadastral e atalho operacional de WhatsApp com fallback para numero invalido.
- testes: unitarios de regras de perfil (`backend/tests/unit/test_patient_profile_rules.py`), integracao CRUD/sobrescrita/filtros/isolamento (`backend/tests/integration/test_patient_crud_flow.py`), UI da lista+perfil e teste funcional do atalho WhatsApp (`front-end/tests/psychologistPatientsScreen.test.tsx`, `front-end/tests/whatsappShortcut.test.ts`), regressao completa via `make pipeline`.
- evidencias: `backend/app/api/routes_patients.py`, `backend/app/services/patient_service.py`, `backend/app/models/patient_profile_change.py`, `backend/alembic/versions/20260317_0004_patients_profile_overwrite_whatsapp.py`, `front-end/src/features/patients/screens/PsychologistPatientsScreen.tsx`, `front-end/src/features/patients/api/patientsApiClient.ts`, `front-end/src/features/patients/domain/whatsappShortcut.ts`, `front-end/app/(app)/psicologo/pacientes.tsx`.

### Prompt 07
- status: concluido
- resumo: agenda/sessoes completas com confirmacao do paciente, transicoes de estado (confirmar/remarcar/cancelar/concluir), realtime operacional por WebSocket e scheduler base de lembretes com eventos append-only na timeline.
- testes: integracao agenda/sessao + timeline + endpoints publicos (`backend/tests/integration/test_sessions_agenda_realtime.py`), transicao de estado no mesmo arquivo, teste realtime com `websocket_connect` no mesmo arquivo, teste de lembrete agendado no mesmo arquivo; regressao backend completa (`backend/.venv/bin/pytest backend/tests -q`), testes front-end de agenda/confirmacao/api (`front-end/tests/psychologistAgendaScreen.test.tsx`, `front-end/tests/patientSessionsScreen.test.tsx`, `front-end/tests/sessionsApiClient.test.ts`) e pipeline completo (`make pipeline`).
- evidencias: `backend/app/api/routes_sessions.py`, `backend/app/api/routes_realtime.py`, `backend/app/services/session_service.py`, `backend/app/services/realtime_hub.py`, `backend/alembic/versions/20260317_0005_sessions_agenda_realtime_reminders.py`, `front-end/src/features/sessions/screens/PsychologistAgendaScreen.tsx`, `front-end/src/features/sessions/screens/PatientSessionsScreen.tsx`, `front-end/src/features/sessions/api/sessionsApiClient.ts`, `front-end/app/(app)/psicologo/agenda.tsx`, `front-end/app/(auth)/paciente/sessoes.tsx`.

### Prompt 08
- status: concluido
- resumo: engine de atividades v1 entregue com backend+frontend completos para psicologo e paciente, incluindo tipos obrigatorios, atribuicao por paciente, recorrencia/prazo, execucao com transicoes de estado, realtime de entrega e timeline append-only com eventos detalhados e tempo em execucao.
- testes: integracao backend de criacao/atribuicao/estado/realtime/overdue (`backend/tests/integration/test_activities_engine.py`), regressao backend completa (`backend/.venv/bin/pytest backend/tests -q`), testes frontend de API+telas (`front-end/tests/activitiesApiClient.test.ts`, `front-end/tests/psychologistActivitiesScreen.test.tsx`, `front-end/tests/patientActivitiesScreen.test.tsx`), regressao frontend completa (`npm --prefix front-end run test -- --runInBand`) e pipeline consolidado (`make pipeline`).
- evidencias: `backend/app/models/activity.py`, `backend/app/services/activity_service.py`, `backend/app/api/routes_activities.py`, `backend/alembic/versions/20260317_0006_activities_engine_v1.py`, `front-end/src/features/activities/api/activitiesApiClient.ts`, `front-end/src/features/activities/screens/PsychologistActivitiesScreen.tsx`, `front-end/src/features/activities/screens/PatientActivitiesScreen.tsx`, `front-end/app/(app)/psicologo/atividades.tsx`, `front-end/app/(auth)/paciente/atividades.tsx`.

### Prompt 09
- status: concluido
- resumo: form builder clinico v1 entregue em backend+frontend com central de formularios, construtor de formulario (titulo/subtitulo/cabecalho, secoes, perguntas), envio/agendamento/revisao pelo psicologo, resposta parcial/final pelo paciente, notificacao de novo formulario e timeline append-only de formulario por evento.
- testes: integracao backend do ciclo completo com atribuicao/publicacao/envio/abertura/salvamento parcial/submissao/revisao e dispatch agendado (`backend/tests/integration/test_forms_builder_flow.py`), validacao de schema do builder (`backend/tests/unit/test_form_builder_schema_validation.py`), testes front-end de API e UI para fluxo parcial/final (`front-end/tests/formsApiClient.test.ts`, `front-end/tests/psychologistFormsScreen.test.tsx`, `front-end/tests/patientFormsScreen.test.tsx`), regressao backend completa (`backend/.venv/bin/pytest backend/tests -q`), regressao frontend completa (`npm --prefix front-end run test -- --runInBand`) e validacao integrada final (`make pipeline`).
- evidencias: `backend/app/models/clinical_form.py`, `backend/app/services/form_service.py`, `backend/app/api/routes_forms.py`, `backend/alembic/versions/20260318_0007_forms_builder_responses.py`, `backend/tests/integration/test_forms_builder_flow.py`, `front-end/src/features/forms/screens/PsychologistFormsScreen.tsx`, `front-end/src/features/forms/screens/PatientFormsScreen.tsx`, `front-end/src/features/forms/api/formsApiClient.ts`, `front-end/app/(app)/psicologo/formularios.tsx`, `front-end/app/(auth)/paciente/formularios.tsx`.

### Prompt 10
- status: concluido
- resumo: timeline individual unificada entregue no psicologo com filtros por categoria e consolidacao de eventos de sessoes, atividades, formularios, documentos, notificacoes e uso do app; motor de notificacoes v1 entregue com regras por tenant/paciente, janela de silencio, frequencia maxima, tracking de estados de entrega e inbox/preferencias no app do paciente; modelo append-only preservado com correlacao por `notification_delivery_id`.
- testes: integracao E2E de notificacoes e realtime + tracking (`backend/tests/integration/test_notifications_timeline_prompt10.py`), regressao backend completa (`backend/.venv/bin/pytest backend/tests -q`), testes frontend de API/UX para timeline/inbox/preferencias (`front-end/tests/notificationsApiClient.test.ts`, `front-end/tests/psychologistTimelineScreen.test.tsx`, `front-end/tests/patientNotificationsInboxScreen.test.tsx`, `front-end/tests/patientNotificationPreferencesScreen.test.tsx`), regressao frontend completa (`npm --prefix front-end run test -- --runInBand`) e validacao integrada de qualidade/build (`make pipeline`).
- evidencias: `backend/app/services/notification_service.py`, `backend/app/api/routes_notifications.py`, `backend/app/models/notification_rule.py`, `backend/app/models/notification_delivery.py`, `backend/alembic/versions/20260318_0008_timeline_notifications_v1.py`, `front-end/src/features/notifications/screens/PsychologistTimelineScreen.tsx`, `front-end/src/features/notifications/screens/PatientNotificationsInboxScreen.tsx`, `front-end/src/features/notifications/screens/PatientNotificationPreferencesScreen.tsx`, `front-end/src/features/notifications/api/notificationsApiClient.ts`, `front-end/app/(app)/psicologo/timeline.tsx`, `front-end/app/(auth)/paciente/inbox.tsx`, `front-end/app/(auth)/paciente/preferencias-notificacao.tsx`.
