# Application Map (Backend Cori)

## 1) Escopo do mapeamento
- Data de consolidacao: 2026-03-18.
- Base analisada: `backend/app/*`, `backend/alembic/versions/*`, `backend/tests/*`, `backend/scripts/*`.
- Cobertura de fluxos mapeados: `auth`, `publico`, `privado`, `realtime`, `scheduler`, `templates`, `pacientes`, `forms`, `activities`, `sessions`, `notifications`, `painel`, `triagem`, `multitenancy`, `RLS`, `workers/jobs`.

## 2) Topologia runtime
- API FastAPI stateless: `backend/app/main.py`.
- Banco: PostgreSQL com RLS + tenant context (`app.current_tenant_id`).
- Redis: pub/sub realtime cross-instance (`realtime_pubsub_channel`) e fila de jobs (`ready`, `processing`, `retry`, `dead`).
- Worker: `backend/app/worker/main.py` com loop de heartbeat + processamento de fila + retry/backoff + DLQ.
- Cliente realtime: WebSocket em `/ws` (token psicologo ou token publico de paciente).

## 3) Inventario de rotas (API)

### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

### Health
- `GET /`
- `GET /health`

### Pacientes
- `POST /patients`
- `GET /patients`
- `GET /patients/{patient_id}`
- `PUT /patients/{patient_id}`
- `DELETE /patients/{patient_id}`
- `GET /patients/{patient_id}/changes`
- `GET /patients/{patient_id}/timeline-events`

### Triagem
- `POST /intakes/invites`
- `GET /intakes/queue`
- `GET /intakes/timeline-events`
- `GET /intakes/{intake_id}`
- `POST /intakes/{intake_id}/review`
- `GET /intake-links/{invite_token}`
- `POST /intake-links/{invite_token}/submit`

### Sessoes
- `POST /sessions`
- `GET /agenda`
- `GET /sessions/{session_id}`
- `POST /sessions/{session_id}/actions`
- `GET /sessions/{session_id}/timeline-events`
- `GET /session-links/{confirmation_token}/sessions`
- `POST /session-links/{confirmation_token}/sessions/{session_id}/confirm`
- `POST /scheduler/session-reminders/run`

### Activities
- `POST /activities`
- `GET /activities`
- `GET /activities/{activity_id}`
- `PATCH /activities/{activity_id}`
- `POST /activities/{activity_id}/actions`
- `GET /activities/{activity_id}/timeline-events`
- `GET /activity-links/{patient_access_token}/activities`
- `POST /activity-links/{patient_access_token}/activities/{activity_id}/actions`
- `POST /scheduler/activities-overdue/run`
- `POST /scheduler/activities-dispatch/run`

### Activity Templates
- `POST /activity-templates`
- `GET /activity-templates`
- `GET /activity-templates/{template_id}`
- `PATCH /activity-templates/{template_id}`
- `DELETE /activity-templates/{template_id}`
- `POST /activity-templates/{template_id}/assign`

### Forms
- `POST /forms`
- `GET /forms`
- `GET /forms/responses`
- `GET /forms/{form_id}`
- `PATCH /forms/{form_id}`
- `POST /forms/{form_id}/actions`
- `GET /forms/{form_id}/timeline-events`
- `GET /form-links/{patient_access_token}/forms`
- `POST /form-links/{patient_access_token}/forms/{form_id}/actions`
- `POST /scheduler/forms-dispatch/run`

### Form Templates
- `POST /form-templates`
- `GET /form-templates`
- `GET /form-templates/{template_id}`
- `PATCH /form-templates/{template_id}`
- `DELETE /form-templates/{template_id}`
- `POST /form-templates/{template_id}/assign`

### Notifications + Timeline
- `GET /patients/{patient_id}/timeline-unified`
- `GET /patients/{patient_id}/notifications`
- `GET /patients/{patient_id}/notification-preferences`
- `PUT /patients/{patient_id}/notification-preferences`
- `GET /notifications/rules/tenant-default`
- `PUT /notifications/rules/tenant-default`
- `POST /patients/{patient_id}/documents/{document_id}/share`
- `GET /notification-links/{patient_access_token}/inbox`
- `POST /notification-links/{patient_access_token}/inbox/{delivery_id}/actions`
- `GET /notification-links/{patient_access_token}/preferences`
- `PUT /notification-links/{patient_access_token}/preferences`
- `POST /notification-links/{patient_access_token}/documents/{document_id}/actions`

### Painel
- `GET /panel/kpis`
- `GET /panel/preferences`
- `PUT /panel/preferences/{card_key}`
- `PATCH /panel/preferences/{card_key}`

### Realtime
- `WS /ws`

## 4) Inventario de servicos
- `auth_service.py`: login, refresh, logout, perfil.
- `patient_service.py`: CRUD paciente, historico de alteracoes.
- `triage_service.py`: convites, intake publico, revisao, timeline triagem.
- `session_service.py`: agenda, acoes de sessao, links publicos, reminders.
- `activity_service.py`: CRUD atividade, acoes psicologo/paciente, overdue.
- `form_service.py`: CRUD formulario, respostas, acoes psicologo/paciente, dispatch.
- `template_assignment_service.py`: CRUD templates, assign imediato/agendado, idempotencia.
- `notification_service.py`: regras, deliveries, inbox publico, timeline unificada, emissao dominio.
- `panel_service.py`: KPIs e preferencias de cards.
- `realtime_hub.py`: conexoes websocket, roteamento por canal, pub/sub Redis cross-instance, circuit breaker publish.
- `timeline_service.py`: append de eventos normalizados.

## 5) Inventario de modelos
- Core multitenancy/auth: `tenant`, `user`, `psychologist`, `auth_refresh_token`.
- Paciente/triagem: `patient`, `patient_intake`, `patient_profile_change`.
- Clinico: `session`, `session_reminder`, `activity`, `clinical_form`.
- Templates: `activity_template`, `form_template`, `assignment_idempotency_key`.
- Notificacao/timeline: `notification_rule`, `notification_delivery`, `timeline_event`.
- Painel: `dashboard_card_preference`.

## 6) Inventario de migrations
- `20260317_0001_core_auth_multitenancy_rls.py`
- `20260317_0002_practice_profile_onboarding.py`
- `20260317_0003_triage_dual_timeline.py`
- `20260317_0004_patients_profile_overwrite_whatsapp.py`
- `20260317_0005_sessions_agenda_realtime_reminders.py`
- `20260317_0006_activities_engine_v1.py`
- `20260318_0007_forms_builder_responses.py`
- `20260318_0008_timeline_notifications_v1.py`
- `20260318_0009_panel_card_preferences.py`
- `20260318_0010_templates_assignment_realtime.py`

## 7) Workers, Jobs, Filas

### Queue keys (Redis)
- `cori:jobs:ready`
- `cori:jobs:processing`
- `cori:jobs:retry`
- `cori:jobs:dead`
- `cori:jobs:idempotency:{key}`

### Job types
- `scheduler.session_reminders`
- `scheduler.activities_overdue`
- `scheduler.activities_dispatch`
- `scheduler.forms_dispatch`

### Garantias implementadas
- Idempotencia por chave (`enqueue` com `idempotency_key`).
- Retry com backoff exponencial configuravel.
- Dead-letter queue ao exceder tentativas.
- Recuperacao de `processing` abandonado no startup do worker.
- Telemetria de profundidade de fila (`queue_depth`) + logs de `job_ack` e `job_failed`.

## 8) Realtime escalavel (multi-instancia)
- Entrega local por canal (`tenant:{tenant_id}` e `patient:{patient_id}`).
- Fan-out cross-instance via Redis pub/sub (`realtime_pubsub_channel`).
- Envelope com `origin` para evitar duplicacao na mesma instancia.
- Fallback: entrega local continua mesmo com falha de publish Redis.
- Circuit breaker no publish Redis para evitar cascata de falhas em indisponibilidade.

## 9) Multitenancy e RLS
- `SET LOCAL ROLE cori_app` em dependencias de DB.
- `set_config('app.current_tenant_id', tenant_id)` por request autenticada.
- Policies RLS por `tenant_id` nas tabelas principais.
- `rls_bypass` restrito a fluxos publicos validados por token (links paciente).

## 10) Dependencias tecnicas
- Runtime Python: `>=3.12`.
- Framework: FastAPI + Uvicorn.
- ORM/Migrations: SQLAlchemy 2.x + Alembic.
- DB driver: Psycopg 3.
- Redis client: `redis>=5.2,<6`.
- Auth: JWT (`PyJWT`).
- Testes: pytest + httpx.

## 11) Scripts de evidencia operacional
- `backend/scripts/perf_harness.py`: baseline/load/stress/soak + probe realtime.
- `backend/scripts/failure_probes.py`: falha/recovery de worker, Redis, Postgres.
- `backend/scripts/realtime_cross_instance_probe.py`: prova de entrega realtime entre instancias diferentes.
