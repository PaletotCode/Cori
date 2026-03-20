# Capacity Plan 1k / 10k / 100k

## 1) Evidencia de entrada (medido)
Fonte: `backend/artifacts/perf/*`.

- Baseline atual (`baseline_after_changes.json`):
- throughput: `250.04 rps`
- erro: `0.0%`
- HTTP p95: `56.18 ms`
- Realtime p95: `8.21 ms`

- Carga mista (`load_mixed_32c_45s.json`):
- throughput: `270.72 rps`
- erro: `0.0%`
- HTTP p95: `189.51 ms`
- Realtime p95: `8.86 ms`

- Stress (`stress_ramp_20_40_80_120.json`):
- 20c: `249.89 rps`, erro `0.0%`, p95 `129.70 ms`
- 40c: `272.89 rps`, erro `0.0%`, p95 `246.98 ms`
- 80c: `50.29 rps`, erro `6.29%`, p95 `20002.29 ms` (degradacao controlada, stop threshold)

- Soak (`soak_20c_180s.json`):
- throughput: `219.06 rps`
- erro: `0.0%`
- HTTP p95: `150.33 ms`
- Realtime p95: `9.62 ms`

## 2) Premissas explicitas
- P1: workload misto em media `0.20 req/s` por usuario concorrente ativo.
- P2: capacidade segura por pod API = `220 rps` (abaixo do teto medido de ~270 rps).
- P3: headroom operacional = `25%` sobre capacidade calculada.
- P4: realtime por pod API: `12.000 conexoes websocket` (premissa de engenharia, validar em producao).
- P5: worker escalado por lag de fila (meta p95 lag < 10s).

## 3) Formula de dimensionamento
- `required_rps = usuarios_concorrentes * 0.20`
- `api_pods = ceil((required_rps / 220) * 1.25)`
- `ws_pods = ceil((usuarios_concorrentes / 12000) * 1.25)`

## 4) Resultado de capacidade

| Cenario | Usuarios concorrentes | RPS requerido | Pods API (modelo) | Pods WS (modelo) |
|---|---:|---:|---:|---:|
| 1k | 1.000 | 200 | 2 | 1 |
| 10k | 10.000 | 2.000 | 12 | 2 |
| 100k | 100.000 | 20.000 | 114 | 11 |

## 5) Escalonamento de worker (modelo)
- Partida recomendada:
- 1k: `2 workers`
- 10k: `8 workers`
- 100k: `40 workers`

- Regra de autoscaling por sinais:
- aumentar workers quando `retry + ready > 5.000` por 5 min.
- aumentar workers quando `queue_lag_p95 > 10s`.
- reduzir quando `queue_lag_p95 < 2s` por 15 min.

## 6) Validacao horizontal realizada
- Realtime cross-instance validado: `backend/artifacts/perf/realtime/realtime_cross_instance_probe.json` com `success=true`.
- Falha e recuperacao validada:
- worker: `failure_probe_worker.json` (`recovered=true`)
- Redis: `failure_probe_redis.json` (`success=true`)
- Postgres: `failure_probe_database.json` (`success=true`)

## 7) Leitura executiva
- O backend atual opera de forma estavel no envelope medido (ate ~40 concorrencias no perfil de teste sem erro).
- O plano para 1k/10k/100k e modelado com premissas numericas explicitas, sustentado por:
- API stateless,
- fila robusta com retries/DLQ,
- realtime horizontal via pub/sub.

## 8) Comandos de reproducao

```bash
cd /Users/pedro.torres/Documents/Cori

docker compose -f infra/docker-compose.yml up -d --build api worker
cd backend
./.venv/bin/alembic -c alembic.ini upgrade head
./.venv/bin/python seed_dev_data.py

# baseline/load/stress/soak
./.venv/bin/python scripts/perf_harness.py --mode baseline --base-url http://localhost:8000 --concurrency 8 --duration-seconds 12 --realtime-samples 5 --output artifacts/perf/baseline/baseline_after_changes.json
./.venv/bin/python scripts/perf_harness.py --mode load --base-url http://localhost:8000 --concurrency 32 --duration-seconds 45 --realtime-samples 8 --output artifacts/perf/load/load_mixed_32c_45s.json
./.venv/bin/python scripts/perf_harness.py --mode stress --base-url http://localhost:8000 --stress-steps 20,40,80,120 --step-duration-seconds 20 --stress-stop-error-rate 5 --realtime-samples 8 --output artifacts/perf/stress/stress_ramp_20_40_80_120.json
./.venv/bin/python scripts/perf_harness.py --mode soak --base-url http://localhost:8000 --concurrency 20 --duration-seconds 180 --realtime-samples 12 --output artifacts/perf/soak/soak_20c_180s.json
```
