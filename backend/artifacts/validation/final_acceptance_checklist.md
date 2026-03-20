# Final Acceptance Checklist

## 1) Comandos reproduziveis executados

```bash
cd /Users/pedro.torres/Documents/Cori

docker compose -f infra/docker-compose.yml up -d --build api worker
cd backend
./.venv/bin/alembic -c alembic.ini upgrade head
./.venv/bin/python seed_dev_data.py

# funcional
./.venv/bin/pytest tests -q

# performance
./.venv/bin/python scripts/perf_harness.py --mode baseline --base-url http://localhost:8000 --concurrency 8 --duration-seconds 12 --realtime-samples 5 --output artifacts/perf/baseline/baseline_after_changes.json
./.venv/bin/python scripts/perf_harness.py --mode load --base-url http://localhost:8000 --concurrency 32 --duration-seconds 45 --realtime-samples 8 --output artifacts/perf/load/load_mixed_32c_45s.json
./.venv/bin/python scripts/perf_harness.py --mode stress --base-url http://localhost:8000 --stress-steps 20,40,80,120 --step-duration-seconds 20 --stress-stop-error-rate 5 --realtime-samples 8 --output artifacts/perf/stress/stress_ramp_20_40_80_120.json
./.venv/bin/python scripts/perf_harness.py --mode soak --base-url http://localhost:8000 --concurrency 20 --duration-seconds 180 --realtime-samples 12 --output artifacts/perf/soak/soak_20c_180s.json
./.venv/bin/python scripts/perf_harness.py --mode baseline --base-url http://localhost:8000 --concurrency 12 --duration-seconds 20 --realtime-samples 20 --output artifacts/perf/realtime/realtime_probe_20samples.json

# falha/recovery
./.venv/bin/python scripts/failure_probes.py --mode worker --timeout-seconds 80 --output artifacts/perf/stress/failure_probe_worker.json
./.venv/bin/python scripts/failure_probes.py --mode redis --base-url http://localhost:8000 --timeout-seconds 120 --output artifacts/perf/stress/failure_probe_redis.json
./.venv/bin/python scripts/failure_probes.py --mode database --base-url http://localhost:8000 --timeout-seconds 180 --output artifacts/perf/stress/failure_probe_database.json

# realtime cross-instance
./.venv/bin/python scripts/realtime_cross_instance_probe.py --api-a http://localhost:8000 --api-b http://localhost:8001 --output artifacts/perf/realtime/realtime_cross_instance_probe.json
```

## 2) Checklist de aceite

| Criterio | Status | Evidencia |
|---|---|---|
| 0 fluxos sem teste | PASS | `docs/scaling/test_matrix_all_flows.md` |
| 0 regressoes funcionais | PASS | `pytest tests -q` => `69/69` |
| Metas de latencia/erro para cenarios definidos | PASS | `artifacts/perf/load/load_mixed_32c_45s.json`, `artifacts/perf/soak/soak_20c_180s.json` |
| Evidencia de escalabilidade horizontal | PASS | `artifacts/perf/realtime/realtime_cross_instance_probe.json` (`success=true`) |
| Entrega realtime com latencia sob carga | PASS | `artifacts/perf/realtime/realtime_probe_20samples.json` (p95 `10.94 ms`) |
| Jobs/Workers estaveis sob concorrencia elevada | PASS | `tests/unit/test_worker_job_queue.py`, `failure_probe_worker.json` |
| Evidencias versionadas no repositorio | PASS | `backend/docs/scaling/*`, `backend/artifacts/perf/*`, este checklist |

## 3) Metricas before/after (absolutas)

| Metrica | Before (`baseline_before`) | After (`baseline_after`) |
|---|---:|---:|
| Throughput (rps) | 264.29 | 250.04 |
| Erro (%) | 0.00 | 0.00 |
| HTTP p95 (ms) | 40.38 | 56.18 |
| Realtime p95 (ms) | 8.08 | 8.21 |

Observacao objetiva: houve aumento de latencia HTTP p95 no baseline apos hardening (principalmente custo de robustez/telemetria/realtime pubsub), mantendo erro em `0.0%` e latencia realtime praticamente estavel.

## 4) Validacoes de carga/estresse/soak
- Load 32c 45s:
- throughput `270.72 rps`
- erro `0.0%`
- HTTP p95 `189.51 ms`

- Stress ramp 20->40->80:
- ate 40c sem erro (`0.0%`) e p95 `246.98 ms`
- em 80c: erro `6.29%`, p95 `20002 ms` -> degradacao controlada pelo threshold de stop.

- Soak 20c 180s:
- throughput `219.06 rps`
- erro `0.0%`
- HTTP p95 `150.33 ms`
- realtime p95 `9.62 ms`

## 5) Falha e recuperacao
- Worker recovery: `failure_probe_worker.json` => `recovered=true`.
- Redis recovery: `failure_probe_redis.json` => `success=true` e realtime apos recovery `success=true`.
- Postgres recovery: `failure_probe_database.json` => `success=true` e auth apos recovery `ok=true`.

## 6) Escala 1k / 10k / 100k
- Evidencia medida direta: estabilidade ate faixa nominal de teste (20/40 concorrencias) e comportamento sob estresse.
- Evidencia modelada com premissas explicitas: `docs/scaling/capacity_plan_1k_10k_100k.md`.

Resumo do modelo:
- 1k concorrentes: `2` pods API.
- 10k concorrentes: `12` pods API.
- 100k concorrentes: `114` pods API.

## 7) Riscos residuais e mitigacao
- Risco: capacidade 100k e modelada, nao medida em ambiente de benchmark distribuido.
- Mitigacao: executar campanha de carga distribuida multi-pod em staging (k6/Gatling) antes de go-live.

- Risco: ausencia de tracing distribuido end-to-end no codigo atual.
- Mitigacao: adicionar OpenTelemetry (API + worker + Redis + DB spans) em proxima iteracao P1.

## 8) Veredito tecnico
**ACEITE TOTAL** para o escopo exigido neste ciclo, com base em evidencias versionadas e comandos reproduziveis.
