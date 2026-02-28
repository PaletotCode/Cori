# Arquitetura Técnica — Cori

## Diagrama de Camadas

```
┌─────────────────────────────────────────────────────┐
│                   MOBILE / WEB                       │
│          Expo (React Native) + Expo Router          │
│                                                      │
│  screens (app/)          components/                 │
│  ├── (app)/              ├── calendar/               │
│  │   ├── index.tsx       ├── cards/                  │
│  │   ├── agenda.tsx      ├── modals/                 │
│  │   ├── pacientes/      ├── patient/                │
│  │   └── settings.tsx    └── onboarding/             │
│  ├── (auth)/login.tsx                               │
│  ├── confirmar/[token]   store/ (Zustand)            │
│  └── triagem/[slug]      services/ (Axios)           │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/REST (JWT Bearer)
┌──────────────────────▼──────────────────────────────┐
│                   FASTAPI BACKEND                    │
│                                                      │
│  routes/              services/         models/      │
│  ├── agenda.py        ├── agenda_svc    ├── sessao   │
│  ├── pacientes.py     ├── sessao_svc    ├── paciente │
│  ├── sessoes.py       ├── paciente_svc  ├── checkin  │
│  ├── tarefas.py       ├── timeline_svc  ├── tarefa   │
│  ├── checkins.py      ├── fatura_svc    ├── fatura   │
│  ├── faturas.py       └── notif_svc     └── psicologo│
│  ├── auth.py                                         │
│  └── triagem.py                                      │
│                    schemas/ (Pydantic)               │
└──────────────────────┬──────────────────────────────┘
                       │ SQLAlchemy ORM
┌──────────────────────▼──────────────────────────────┐
│           PostgreSQL (prod) / SQLite (dev)           │
│  + Alembic migrations                               │
└─────────────────────────────────────────────────────┘
```

---

## Multi-tenancy

Simples e robusto: todas as tabelas têm `psicologo_id` (FK). O serviço de auth extrai o ID do JWT e todas as queries filtram por ele. Zero vazamento entre contas.

```python
# Padrão em todo service:
paciente = db.query(Paciente).filter(
    Paciente.id == paciente_id,
    Paciente.psicologo_id == psicologo_id  # ← guard obrigatório
).first()
```

---

## Fluxo de Autenticação

```
App → POST /auth/google { id_token }
Backend → verifica token com Google (ou mock em dev)
Backend → cria/busca Psicologo por email
Backend → retorna JWT (7 dias)
App → salva JWT no SecureStore
App → injeta JWT em todas as requests via Axios interceptor
Backend → 401 → Axios interceptor chama logout()
```

---

## Fluxo de Confirmação de Sessão (WhatsApp)

```
Psicólogo → agenda sessão → Sessao.token_confirmacao (UUID gerado)
Psicólogo → compartilha link: cori.app/confirmar/{token}
Paciente → abre link no browser (sem login)
Frontend → PATCH /agenda/sessoes/public/{token}/confirmar (sem JWT)
Backend → muda estado: agendada → confirmada
Backend → cria NotificacaoLembrete para o psicólogo
Worker → envia push ao psicólogo em até 60s
```

---

## Schemas vs Models

- **Model** (SQLAlchemy): mapeamento ORM → tabela. Nunca retornado diretamente pela API.
- **Schema** (Pydantic): validação de input e serialização de output.
  - `XCreate` → payload de criação
  - `XUpdate` → payload de atualização (campos opcionais)
  - `XResponse` → output da API (o que o frontend consome)

```python
@router.post("/", response_model=SessaoResponse)
def criar(dados: SessaoCreate, ...):
    sessao = sessao_service.criar_sessoes(db, dados=dados, ...)
    return SessaoResponse.model_validate(sessao)  # nunca retornar Model diretamente
```

---

## Convenções de Nomenclatura

### Backend (Python)
- Arquivos: `snake_case.py`
- Classes: `PascalCase`
- Funções/variáveis: `snake_case`
- Endpoints: plural, substantivos (`/pacientes/`, `/sessoes/`)

### Frontend (TypeScript)
- Arquivos de componente: `PascalCase.tsx`
- Arquivos de tela: `lowercase.tsx` (Expo Router file-based)
- Hooks: `use` prefix (`useAuthStore`)
- Interfaces: sufixo `Response` para dados da API (`SessaoResponse`)

---

## Indexes de Performance (Migration 62209d02d22f)

| Índice | Tabela | Por que |
|---|---|---|
| `ix_sessoes_paciente_data_inicio` | sessoes | Query principal da agenda geral |
| `ix_sessoes_data_hora_inicio` | sessoes | Filtros por data isolada |
| `ix_tarefas_paciente_data_vencimento` | tarefas_paciente | Agenda geral |
| `ix_checkins_data_registro` | checkins_diarios | Agenda geral + timeline |
| `ix_faturas_paciente_estado` | faturas | Dashboard de pendências |

---

## Pontos de Atenção para o Futuro

### Próximas otimizações planejadas
1. **Redis + Celery** — substituir o worker de thread por filas reais
2. **Cloudflare R2** — upload de foto de perfil (campo `foto_perfil_url` já existe)
3. **Sentry** — monitoramento de erros em produção
4. **React Query** — cache de dados no frontend + background refresh

### O que não foi feito propositalmente (YAGNI)
- Testes automatizados (validação via seed + Swagger é suficiente no MVP)
- GraphQL (REST é suficiente para a escala atual)
- Microserviços (monolito modular é a escolha correta aqui)
