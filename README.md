# Cori 🧠

**Plataforma de gestão clínica para psicólogos** — agenda inteligente, prontuário eletrônico, financeiro e engagement de pacientes.

## Stack

| Camada | Tecnologia |
|---|---|
| Mobile / Web | Expo (React Native) + Expo Router |
| Estilo | NativeWind + Vanilla StyleSheet |
| Estado | Zustand + Axios |
| Backend | FastAPI + SQLAlchemy 2.0 + Alembic |
| Banco | SQLite (dev) / PostgreSQL (produção) |
| Auth | JWT + Google OAuth |
| Deploy | Railway |

## Rodar localmente

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export PYTHONPATH=$(pwd)/..
alembic upgrade head            # cria/migra o banco
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Docs interativas: http://localhost:8000/docs

### Frontend
```bash
npm install
npx expo start -c
```

Escanear QR com Expo Go ou abrir no simulador.

### Seed de dados (dev)
```bash
cd backend && source .venv/bin/activate
export PYTHONPATH=$(pwd)/..
python backend/seed_dev_data.py
```
Cria 30 pacientes com todos os cenários do MVP (sessões, tarefas, check-ins, faturas).

## Variáveis de ambiente

Ver `backend/.env.example`. As críticas:

```env
DATABASE_URL=postgresql://...   # Railway injeta automaticamente
SECRET_KEY=<openssl rand -hex 32>
GOOGLE_CLIENT_ID=               # vazio = modo dev (mock user)
DEBUG=false
```

## Estrutura de pastas

```
Cori/
├── app/                    # Expo Router — rotas file-based
│   ├── (app)/              # Rotas autenticadas (tab bar)
│   ├── (auth)/             # Login
│   ├── confirmar/          # Link público de confirmação de sessão
│   └── triagem/            # Onboarding público do paciente
├── components/
│   ├── calendar/           # CalendarHeader, DayView, WeekView, MonthView
│   ├── cards/              # SessaoCard, TarefaCard, CheckinCard, FaturaCard
│   ├── modals/             # Todos os modais (ModalNovaSessao, etc.)
│   ├── patient/            # PatientHeader, PatientTimeline
│   └── onboarding/
├── services/
│   ├── api.ts              # Axios com auto-detect de IP + interceptor JWT
│   └── apiPublic.ts        # Axios sem auth (triagem, confirmação)
├── store/
│   └── authStore.ts        # Zustand — psicologo autenticado
├── types/api.ts            # Interfaces TypeScript dos modelos
├── backend/
│   ├── core/               # database.py, config.py, security.py
│   ├── models/             # SQLAlchemy ORM
│   ├── schemas/            # Pydantic input/output
│   ├── services/           # Lógica de negócio (sem DB direto nas routes)
│   ├── routes/             # FastAPI routers
│   └── migrations/         # Alembic
└── railway.toml            # Deploy config
```

## Usuário de dev (Mock)

Com `GOOGLE_CLIENT_ID` vazio, o endpoint `/auth/google` aceita qualquer token e retorna um psicologo mock (ID 999, "Dr. Mock"). Use isso para desenvolvimento sem configurar Google.

## Documentação da API

Ver `backend/api-docs.md` para referência completa de endpoints.
