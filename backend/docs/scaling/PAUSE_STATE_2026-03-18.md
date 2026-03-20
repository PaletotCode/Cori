# PAUSE STATE - 2026-03-18

## Contexto do pause
- Solicitacao do usuario: pausar imediatamente e salvar estado completo para retomar depois.
- Objetivo macro em andamento: hardening/scaling backend para operacao comercial (1k/10k/100k simultaneos), com evidencias versionadas.

## Estado atual (o que ja foi concluido)

### 1) Levantamento tecnico profundo (feito)
- Mapeamento de arquitetura e fluxos lidos manualmente em:
  - `app/main.py`, `app/core/*`, `app/api/routes_*`, `app/services/*`, `app/models/*`, `alembic/versions/*`, `tests/*`.
- Cobertura de fluxos identificada:
  - auth, publico/privado, triagem, pacientes, sessoes, atividades, formularios, templates, notificacoes, timeline, painel, realtime, multitenancy/RLS, schedulers.

### 2) Baseline funcional (feito)
- Execucao:
  - Comando: `cd /Users/pedro.torres/Documents/Cori/backend && /usr/bin/time -p ./.venv/bin/pytest tests -q`
  - Resultado: `64` testes passando.
  - Tempo total observado: `real 17.02s`.

### 3) Baseline de performance/realtime (feito)
- Harness criado:
  - `backend/scripts/perf_harness.py`
- Artefato gerado:
  - `backend/artifacts/perf/baseline/baseline_before_changes.json`
- Resumo atual do baseline (arquivo JSON):
  - `throughput_rps`: `264.2938164578271`
  - `error_rate_percent`: `0.0`
  - `p95_ms` (latencia agregada HTTP): `40.37567480118013`
  - `realtime_p95_ms` (recepcao websocket): `8.084299402980832`

### 4) Infra de fila robusta iniciada (parcial, ainda nao integrada)
- Arquivos novos criados:
  - `backend/app/worker/job_queue.py`
  - `backend/app/worker/job_handlers.py`
- Capabilidades implementadas no `job_queue.py`:
  - enqueue com idempotencia (`idempotency_key`)
  - claim/ack
  - retry com backoff exponencial
  - dead-letter queue
  - promocao de retries vencidos
  - queue depth
- Handlers implementados no `job_handlers.py`:
  - `scheduler.session_reminders`
  - `scheduler.activities_overdue`
  - `scheduler.activities_dispatch`
  - `scheduler.forms_dispatch`

### 5) Configuracoes novas (feito, sem consumo ainda)
- `backend/app/core/config.py` recebeu:
  - `worker_max_jobs_per_cycle`
  - `worker_retry_backoff_base_seconds`
  - `worker_retry_backoff_max_seconds`
  - `notification_delivery_mode`
  - `realtime_pubsub_channel`

## O que esta pendente (proximo passo tecnico exato)

### P0 - Integracao core (nao iniciada)
1. Integrar `job_queue` + `job_handlers` no loop de `backend/app/worker/main.py`.
2. Definir quais fluxos entram na fila por padrao (notificacoes/realtime e/ou schedulers).
3. Garantir rastreabilidade de job (job_id, attempt, erro) em logs estruturados.

### P0 - Realtime horizontal (nao iniciada)
1. Evoluir `backend/app/services/realtime_hub.py` para backplane Redis pub/sub entre instancias.
2. Adicionar lifecycle startup/shutdown em `app/main.py` para listener/subscriber.
3. Validar entrega cross-instance (sem dependencia de estado em memoria de uma unica instancia).

### P0 - Artefatos obrigatorios de docs (nao iniciados)
Criar e preencher:
- `backend/docs/scaling/application_map.md`
- `backend/docs/scaling/wbs_master_plan.md`
- `backend/docs/scaling/target_architecture.md`
- `backend/docs/scaling/capacity_plan_1k_10k_100k.md`
- `backend/docs/scaling/test_matrix_all_flows.md`
- `backend/docs/scaling/slo_sla_definition.md`
- `backend/artifacts/validation/final_acceptance_checklist.md`

### P1 - Evidencias de carga/estresse/soak/realtime (nao iniciadas apos baseline)
Gerar JSONs em:
- `backend/artifacts/perf/load/*.json`
- `backend/artifacts/perf/stress/*.json`
- `backend/artifacts/perf/soak/*.json`
- `backend/artifacts/perf/realtime/*.json`

### P1 - Fechar exigencia de testes por fluxo
- Revisar gaps de testes adicionais focados em:
  - jobs/workers com retry/backoff/dlq/idempotencia
  - cenarios de falha (queda worker, indisponibilidade redis/db, reconexao realtime)
  - contrato realtime sob carga

## Comandos de retomada recomendados

1. Garantir stack atualizada:
```bash
cd /Users/pedro.torres/Documents/Cori
docker compose -f infra/docker-compose.yml up -d --build api worker
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
cd backend && ./.venv/bin/python seed_dev_data.py
```

2. Revalidar baseline funcional:
```bash
cd /Users/pedro.torres/Documents/Cori/backend
/.venv/bin/pytest tests -q
```

3. Revalidar baseline de performance:
```bash
cd /Users/pedro.torres/Documents/Cori/backend
/.venv/bin/python scripts/perf_harness.py \
  --mode baseline \
  --base-url http://localhost:8000 \
  --concurrency 6 \
  --duration-seconds 8 \
  --realtime-samples 3 \
  --output artifacts/perf/baseline/baseline_before_changes.json
```

4. Implementar proximo bloco:
- Integracao do `job_queue` no worker (`app/worker/main.py`) e definicao de rotas/servicos que enfileiram jobs.

## Riscos e observacoes registradas
- Worktree esta sujo com muitas alteracoes pre-existentes do usuario (backend e front-end). Nao houve limpeza/reversao.
- O container `api` estava com build antigo durante uma tentativa de medicao; isso ja foi corrigido com `up -d --build`.
- O harness de realtime inicialmente dava timeout por limite de frequencia de notificacao no mesmo paciente; script foi ajustado para criar paciente dedicado no probe realtime.

## Arquivos que eu alterei nesta sessao (checkpoint real)
- `backend/scripts/perf_harness.py` (novo)
- `backend/app/worker/job_queue.py` (novo)
- `backend/app/worker/job_handlers.py` (novo)
- `backend/app/core/config.py` (editado)
- `backend/docs/scaling/PAUSE_STATE_2026-03-18.md` (novo)
- `backend/artifacts/perf/baseline/baseline_before_changes.json` (gerado)

