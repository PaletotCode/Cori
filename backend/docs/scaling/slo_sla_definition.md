# SLO / SLA Definition

## 1) Janela e termos
- Janela de avaliacao SLO: mensal (30 dias).
- Error budget mensal para SLO 99.9%: `43m12s`.
- Ambiente alvo: producao multi-instancia.

## 2) SLI/SLO por dominio

| Dominio | SLI | SLO | Evidencia atual |
|---|---|---|---|
| Disponibilidade API | `% de respostas HTTP 2xx/3xx em rotas criticas` | `>= 99.9%` | `0.0%` erro em baseline/load/soak |
| Latencia API (geral) | `p95 latencia HTTP` | `<= 250 ms` em carga nominal | `189.51 ms` no load 32c |
| Latencia API (degradacao) | `p95 latencia HTTP no stress` | degradacao controlada antes de saturacao total | stop no step 80c com threshold de erro |
| Erro API | `taxa de erro HTTP` | `< 1.0%` em carga nominal | `0.0%` no load/soak |
| Realtime intra-instancia | `p95 receive latency` | `<= 50 ms` | `8.86 ms` (load), `9.62 ms` (soak) |
| Realtime cross-instancia | `entrega de evento entre instancias` | `100% nos probes` | `success=true` em probe cross-instance |
| Queue reliability | `% jobs sem dead-letter` | `>= 99.5%` em operacao nominal | unit tests + failure probes aprovados |
| Queue lag | `p95 atraso fila` | `<= 10s` | regras de autoscaling definidas |
| Recovery Redis | `tempo de restauracao` | `<= 120s` | probe `failure_probe_redis.json` sucesso |
| Recovery Postgres | `tempo de restauracao` | `<= 180s` | probe `failure_probe_database.json` sucesso |

## 3) SLA externo recomendado
- SLA de plataforma API: `99.9%` mensal.
- SLA de entrega realtime: `99.5%` para eventos elegiveis em ate `2s`.
- SLA de processamento de jobs assinc: `99.0%` em ate `60s` (exceto backlog extraordinario).

## 4) Alertas operacionais (minimos)
- `ALERT-API-ERROR-RATE`: erro > `1%` por 5 min.
- `ALERT-API-P95`: p95 > `250ms` por 10 min em carga nominal.
- `ALERT-REALTIME-P95`: p95 realtime > `200ms` por 10 min.
- `ALERT-QUEUE-DEAD`: crescimento de DLQ > `50` jobs em 10 min.
- `ALERT-QUEUE-LAG`: lag p95 > `10s` por 10 min.
- `ALERT-DEPENDENCY-REDIS`: health redis `down` por 2 min.
- `ALERT-DEPENDENCY-DB`: health db `down` por 1 min.

## 5) Dashboards recomendados
- Dashboard API:
- throughput, erro, p50/p95/p99 por rota.
- conexoes DB/pool e queries lentas.

- Dashboard Realtime:
- conexoes WS ativas por instancia.
- latencia receive p95/p99.
- publish failures Redis + estado de circuito aberto.

- Dashboard Worker/Queue:
- profundidade `ready/processing/retry/dead`.
- taxa de `job_ack`, `job_failed`, retries.
- tempo medio de processamento por job_type.

- Dashboard Dependencias:
- disponibilidade Redis e Postgres.
- tempo de recovery apos incidentes.

## 6) Mecanica de error-budget
- Consumir budget quando qualquer SLO mensal ficar abaixo da meta.
- Se consumo > 50% no meio da janela:
- congelar rollout de features nao criticas.
- priorizar tuning de latencia/erro e backlog de confiabilidade.

## 7) Evidencias usadas nesta definicao
- `backend/artifacts/perf/baseline/baseline_after_changes.json`
- `backend/artifacts/perf/load/load_mixed_32c_45s.json`
- `backend/artifacts/perf/stress/stress_ramp_20_40_80_120.json`
- `backend/artifacts/perf/soak/soak_20c_180s.json`
- `backend/artifacts/perf/realtime/realtime_probe_20samples.json`
- `backend/artifacts/perf/realtime/realtime_cross_instance_probe.json`
- `backend/artifacts/perf/stress/failure_probe_worker.json`
- `backend/artifacts/perf/stress/failure_probe_redis.json`
- `backend/artifacts/perf/stress/failure_probe_database.json`
