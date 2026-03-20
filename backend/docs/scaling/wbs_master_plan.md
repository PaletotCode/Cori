# WBS Master Plan (Granular)

## Escala de prioridade
- `P0`: bloqueador de confiabilidade/escala.
- `P1`: necessario para operacao comercial.
- `P2`: endurecimento complementar.

## Tarefas atomicas (ID, dependencia, aceite, status)

| ID | Tarefa atomica | Prioridade | Dependencia | Criterio de aceite | Status |
|---|---|---|---|---|---|
| MAP-001 | Catalogar todos os modulos `app/api` | P0 | - | Lista de arquivos e rotas documentada | DONE |
| MAP-002 | Catalogar todos os modulos `app/services` | P0 | MAP-001 | Inventario de servicos documentado | DONE |
| MAP-003 | Catalogar todos os modelos SQLAlchemy | P0 | MAP-001 | Inventario de modelos documentado | DONE |
| MAP-004 | Catalogar migrations Alembic | P0 | MAP-003 | Sequencia de migrations documentada | DONE |
| MAP-005 | Catalogar testes existentes por fluxo | P0 | MAP-001 | Matriz fluxo x teste inicial criada | DONE |
| MAP-006 | Catalogar scripts operacionais/perf | P1 | MAP-005 | Lista de scripts com finalidade | DONE |
| INV-001 | Levantar endpoints auth | P0 | MAP-001 | Rotas auth documentadas | DONE |
| INV-002 | Levantar endpoints pacientes | P0 | MAP-001 | Rotas pacientes documentadas | DONE |
| INV-003 | Levantar endpoints triagem | P0 | MAP-001 | Rotas triagem documentadas | DONE |
| INV-004 | Levantar endpoints sessoes | P0 | MAP-001 | Rotas sessoes documentadas | DONE |
| INV-005 | Levantar endpoints atividades | P0 | MAP-001 | Rotas atividades documentadas | DONE |
| INV-006 | Levantar endpoints formularios | P0 | MAP-001 | Rotas forms documentadas | DONE |
| INV-007 | Levantar endpoints templates | P0 | MAP-001 | Rotas templates documentadas | DONE |
| INV-008 | Levantar endpoints notificacoes/timeline | P0 | MAP-001 | Rotas notificacoes documentadas | DONE |
| INV-009 | Levantar endpoints painel | P1 | MAP-001 | Rotas painel documentadas | DONE |
| INV-010 | Levantar endpoint realtime | P0 | MAP-001 | Rota WS documentada | DONE |
| INV-011 | Levantar dependencias runtime | P1 | MAP-001 | Dependencias tecnicas listadas | DONE |
| INV-012 | Levantar keys de Redis usadas | P1 | MAP-002 | Keys de fila/realtime documentadas | DONE |
| BASE-001 | Rodar baseline funcional inicial | P0 | MAP-005 | Testes baseline executados com log de tempo | DONE |
| BASE-002 | Criar harness de performance | P0 | BASE-001 | Script com modos baseline/load/stress/soak | DONE |
| BASE-003 | Medir baseline HTTP inicial | P0 | BASE-002 | JSON baseline gerado | DONE |
| BASE-004 | Medir baseline realtime inicial | P0 | BASE-002 | p95 realtime baseline gerado | DONE |
| ARCH-001 | Definir arquitetura alvo (API stateless + worker + Redis + Postgres) | P0 | MAP-006 | Documento de arquitetura alvo publicado | DONE |
| ARCH-002 | Definir estrategia de escala horizontal realtime | P0 | ARCH-001 | Backplane Redis descrito + validado | DONE |
| ARCH-003 | Definir estrategia de fila para jobs criticos | P0 | ARCH-001 | Fluxo de enqueue/claim/retry/dlq definido | DONE |
| ARCH-004 | Definir estrategia de idempotencia e rastreio | P0 | ARCH-003 | Chaves idempotencia + trace_id documentados | DONE |
| ARCH-005 | Definir estrategia de rollout seguro | P1 | ARCH-001 | Plano de deploy/rollback documentado | DONE |
| IMP-001 | Implementar `WorkerJobQueue.enqueue` com idempotencia | P0 | ARCH-003 | Replays detectados por `idempotency_key` | DONE |
| IMP-002 | Implementar claim/ack de jobs | P0 | IMP-001 | Jobs saem de ready/processam/ack | DONE |
| IMP-003 | Implementar retry com backoff exponencial | P0 | IMP-001 | Jobs falhos vao para retry com delay | DONE |
| IMP-004 | Implementar DLQ ao exceder tentativas | P0 | IMP-003 | Jobs falhos finais vao para dead | DONE |
| IMP-005 | Implementar promocao de retries vencidos | P0 | IMP-003 | `promote_due_retries` funcional | DONE |
| IMP-006 | Implementar recovery de `processing` abandonado | P0 | IMP-002 | `requeue_processing` no startup | DONE |
| IMP-007 | Integrar handlers de jobs no worker | P0 | IMP-002 | Worker executa job types suportados | DONE |
| IMP-008 | Integrar heartbeat + queue depth no worker | P1 | IMP-007 | Logs com estado de fila por ciclo | DONE |
| IMP-009 | Parametrizar concorrencia/claim/attempts via config | P1 | IMP-008 | Settings aplicados e lidos | DONE |
| IMP-010 | Isolar scheduler automatico por feature flags | P0 | IMP-008 | Defaults seguros sem interferir em testes | DONE |
| JOB-001 | Implementar handler `scheduler.session_reminders` | P0 | IMP-007 | Lembretes processados por job | DONE |
| JOB-002 | Implementar handler `scheduler.activities_overdue` | P0 | IMP-007 | Overdue processado por job | DONE |
| JOB-003 | Implementar handler `scheduler.activities_dispatch` | P0 | IMP-007 | Dispatch atividades via job | DONE |
| JOB-004 | Implementar handler `scheduler.forms_dispatch` | P0 | IMP-007 | Dispatch forms via job | DONE |
| JOB-005 | Incluir rastreio `job_id/attempt/trace_id` em logs | P1 | IMP-008 | Logs `job_ack/job_failed` | DONE |
| RT-001 | Refatorar realtime para manter roteamento por canal | P0 | INV-010 | Entrega tenant/patient preservada | DONE |
| RT-002 | Implementar subscriber Redis no startup API | P0 | ARCH-002 | `realtime_hub.start()` em lifespan | DONE |
| RT-003 | Implementar shutdown limpo do subscriber | P1 | RT-002 | `realtime_hub.stop()` sem leak | DONE |
| RT-004 | Implementar publish cross-instance em cada notificacao | P0 | RT-002 | Eventos publicados em channel Redis | DONE |
| RT-005 | Implementar anti-duplicacao por `origin` | P0 | RT-004 | Mesmo evento nao duplica localmente | DONE |
| RT-006 | Implementar fallback local quando Redis falha | P0 | RT-004 | Entrega local continua com publish error | DONE |
| RT-007 | Implementar circuit breaker para publish Redis | P1 | RT-006 | Falhas repetidas abrem circuito temporario | DONE |
| DB-001 | Revisar uso de RLS e tenant context em dependencias | P0 | MAP-003 | `SET LOCAL ROLE` e `set_config` validados | DONE |
| DB-002 | Revisar indices via migrations existentes | P1 | MAP-004 | Indices catalogados em documentacao | DONE |
| DB-003 | Revisar lock/contention em jobs scheduler | P1 | IMP-007 | Execucao sem lock global no worker | DONE |
| DB-004 | Validar pool/conexao em carga mista | P1 | BASE-002 | Sem erro de conexao nos cenarios load/soak | DONE |
| EVL-001 | Identificar I/O sincronos no caminho realtime | P0 | RT-001 | Publish movido para `asyncio.to_thread` | DONE |
| EVL-002 | Remover risco de bloqueio por publish repetido | P1 | EVL-001 | Circuit breaker aplicado | DONE |
| OBS-001 | Padronizar logs de worker por evento | P1 | IMP-008 | Logs estruturados por chave/valor | DONE |
| OBS-002 | Adicionar request-id para rastreio API (planejado) | P2 | OBS-001 | Middleware dedicado | BACKLOG |
| OBS-003 | Definir SLO/SLA e alertas operacionais | P0 | BASE-003 | Documento SLO/SLA publicado | DONE |
| OBS-004 | Definir dashboards minimos por sinal | P1 | OBS-003 | Dashboards especificados no documento | DONE |
| TST-001 | Criar testes unitarios da fila (idempotencia/retry/dlq) | P0 | IMP-004 | Testes `test_worker_job_queue.py` passando | DONE |
| TST-002 | Criar testes unitarios de canais realtime | P0 | RT-001 | Testes `test_realtime_hub_channels.py` passando | DONE |
| TST-003 | Executar suite completa de testes backend | P0 | TST-001 | `69/69` passando | DONE |
| TST-004 | Validar fluxo auth | P0 | TST-003 | Teste integracao auth passando | DONE |
| TST-005 | Validar fluxo publico (links paciente) | P0 | TST-003 | Testes publicos passing | DONE |
| TST-006 | Validar fluxo privado psicologo | P0 | TST-003 | Testes privados passing | DONE |
| TST-007 | Validar fluxo realtime | P0 | TST-003 | Testes realtime + probes passing | DONE |
| TST-008 | Validar scheduler e templates | P0 | TST-003 | Testes scheduler/templates passing | DONE |
| TST-009 | Validar multitenancy e RLS | P0 | TST-003 | Teste tenant isolation + policies validadas | DONE |
| PERF-001 | Rodar baseline pos-mudanca | P0 | BASE-004 | JSON baseline after gerado | DONE |
| PERF-002 | Rodar carga mista (load) | P0 | PERF-001 | JSON load gerado | DONE |
| PERF-003 | Rodar stress com degradacao controlada | P0 | PERF-002 | JSON stress com stop por erro > threshold | DONE |
| PERF-004 | Rodar soak prolongado | P0 | PERF-002 | JSON soak gerado sem erro | DONE |
| PERF-005 | Rodar probe realtime dedicado | P0 | PERF-002 | JSON realtime gerado | DONE |
| PERF-006 | Rodar probe realtime cross-instance | P0 | RT-004 | JSON cross-instance com `success=true` | DONE |
| PERF-007 | Rodar falha worker + recovery | P0 | IMP-006 | JSON de recovery `recovered=true` | DONE |
| PERF-008 | Rodar falha Redis + recovery + realtime | P0 | RT-006 | JSON de recovery `success=true` | DONE |
| PERF-009 | Rodar falha Postgres + recovery + auth | P0 | DB-004 | JSON de recovery `success=true` | DONE |
| CAP-001 | Definir premissas de capacidade por usuario concorrente | P0 | PERF-002 | Premissas numericas explicitas | DONE |
| CAP-002 | Modelar capacidade para 1k concorrentes | P0 | CAP-001 | Numero de instancias calculado | DONE |
| CAP-003 | Modelar capacidade para 10k concorrentes | P0 | CAP-001 | Numero de instancias calculado | DONE |
| CAP-004 | Modelar capacidade para 100k concorrentes | P0 | CAP-001 | Numero de instancias calculado | DONE |
| CAP-005 | Definir margens de headroom e N+1 | P1 | CAP-002 | Politica de capacidade documentada | DONE |
| DOC-001 | Gerar `application_map.md` | P0 | MAP-006 | Arquivo publicado | DONE |
| DOC-002 | Gerar `target_architecture.md` | P0 | ARCH-005 | Arquivo publicado | DONE |
| DOC-003 | Gerar `capacity_plan_1k_10k_100k.md` | P0 | CAP-005 | Arquivo publicado | DONE |
| DOC-004 | Gerar `test_matrix_all_flows.md` | P0 | TST-009 | Arquivo publicado | DONE |
| DOC-005 | Gerar `slo_sla_definition.md` | P0 | OBS-004 | Arquivo publicado | DONE |
| DOC-006 | Gerar checklist final de aceite | P0 | DOC-001 | Arquivo publicado com evidencias | DONE |

## Itens pendentes (nao bloqueantes para aceite tecnico atual)
- `OBS-002`: middleware dedicado de request-id estruturado na API (backlog P2; mitigado por logs de worker + rastreio de job + probes versionadas).
