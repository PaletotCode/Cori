# Test Matrix (All Flows)

## 1) Execucao consolidada
- Suite funcional: `cd /Users/pedro.torres/Documents/Cori/backend && ./.venv/bin/pytest tests -q`
- Resultado final: `69/69` testes passando.
- Evidencia de carga/estresse/soak/realtime: `backend/artifacts/perf/*`.

## 2) Fluxo x Teste x Resultado

| Fluxo | Testes/Probes | Tipo | Evidencia objetiva | Resultado |
|---|---|---|---|---|
| Auth | `tests/integration/test_auth_flow.py` | Integracao/E2E API | `pytest tests/integration/test_auth_flow.py -q` | PASS |
| Publico (links paciente) | `test_sessions_agenda_realtime.py`, `test_activities_engine.py`, `test_forms_builder_flow.py`, `test_notifications_timeline_prompt10.py`, `test_triage_dual_flow.py` | Integracao/E2E | Arquivos em `tests/integration/*` | PASS |
| Privado (psicologo) | `test_patient_crud_flow.py`, `test_practice_profile_api.py`, `test_panel_kpis_api.py` | Integracao/E2E | Arquivos em `tests/integration/*` | PASS |
| Realtime (canal tenant/patient) | `tests/unit/test_realtime_hub_channels.py` + `tests/integration/test_sessions_agenda_realtime.py` | Unit + Integracao | `pytest tests/unit/test_realtime_hub_channels.py -q` | PASS |
| Realtime horizontal (multi-instancia) | `scripts/realtime_cross_instance_probe.py` | Probe de contrato realtime | `artifacts/perf/realtime/realtime_cross_instance_probe.json` (`success=true`) | PASS |
| Scheduler | `test_sessions_agenda_realtime.py`, `test_activities_engine.py`, `test_forms_builder_flow.py`, `test_templates_assignment_realtime_flow.py` | Integracao | Rotas `/scheduler/*/run` validadas | PASS |
| Templates | `tests/integration/test_templates_assignment_realtime_flow.py`, `tests/unit/test_template_assignment_rules.py` | Integracao + Unit | Idempotencia + assign imediato/agendado | PASS |
| Pacientes | `tests/integration/test_patient_crud_flow.py` | Integracao | CRUD + timeline/changes | PASS |
| Forms | `tests/integration/test_forms_builder_flow.py`, `tests/unit/test_form_builder_schema_validation.py` | Integracao + Unit | Builder + resposta paciente | PASS |
| Activities | `tests/integration/test_activities_engine.py` | Integracao | Engine, overdue, realtime | PASS |
| Sessions | `tests/integration/test_sessions_agenda_realtime.py` | Integracao | Agenda, acoes, lembretes | PASS |
| Notifications | `tests/integration/test_notifications_timeline_prompt10.py` | Integracao | Regras, inbox, tracking, timeline | PASS |
| Painel | `tests/integration/test_panel_kpis_api.py`, `tests/unit/test_panel_kpi_calculations.py` | Integracao + Unit | KPI + comparativos | PASS |
| Triagem | `tests/integration/test_triage_dual_flow.py` | Integracao | Invite, submit, review, timeline | PASS |
| Multitenancy | `tests/integration/test_tenant_isolation.py` | Integracao | Isolamento por tenant | PASS |
| RLS | `tests/unit/test_tenant_context.py` + migrations RLS (`20260317_0001`) | Unit + Estrutural | Uso de `set_config(app.current_tenant_id)` + policies | PASS |
| Worker queue idempotencia/retry/DLQ | `tests/unit/test_worker_job_queue.py` | Unit | `enqueue`, `retry`, `dead`, `requeue_processing` | PASS |
| Falha worker e recovery | `scripts/failure_probes.py --mode worker` | Failure test | `artifacts/perf/stress/failure_probe_worker.json` | PASS |
| Falha Redis e recovery + realtime | `scripts/failure_probes.py --mode redis` | Failure test | `artifacts/perf/stress/failure_probe_redis.json` | PASS |
| Falha Postgres e recovery | `scripts/failure_probes.py --mode database` | Failure test | `artifacts/perf/stress/failure_probe_database.json` | PASS |
| Carga mista | `scripts/perf_harness.py --mode load` | Load | `artifacts/perf/load/load_mixed_32c_45s.json` | PASS |
| Estresse com degradacao controlada | `scripts/perf_harness.py --mode stress` | Stress | `artifacts/perf/stress/stress_ramp_20_40_80_120.json` | PASS |
| Soak (estabilidade prolongada) | `scripts/perf_harness.py --mode soak` | Soak | `artifacts/perf/soak/soak_20c_180s.json` | PASS |

## 3) Contratos (API + realtime)
- API contrato funcional coberto por testes de integracao de rotas de cada dominio.
- Contrato realtime coberto por:
- payload/channel em `tests/integration/test_templates_assignment_realtime_flow.py`.
- roteamento por canal em `tests/unit/test_realtime_hub_channels.py`.
- entrega entre instancias diferentes em `artifacts/perf/realtime/realtime_cross_instance_probe.json`.

## 4) Concorrencia
- Concorrencia HTTP/realtime validada por `load`, `stress` e `soak`.
- Concorrencia de job queue validada por testes unitarios de retry/promocao/dead-letter e probes de falha.

## 5) Cobertura declarada
- Fluxos obrigatorios sem lacuna registrada nesta matriz: `0`.
