# AGENTS.md — Guia para Agentes de IA

Este arquivo existe para que qualquer agente de IA (Gemini, Claude, GPT, etc.) que trabalhe neste repositório entenda rapidamente o projeto, seus padrões e suas convenções. **Leia antes de fazer qualquer alteração.**

---

## 1. O Projeto

**Cori** é um SaaS de gestão clínica para psicólogos. Um psicólogo cadastra-se, aprova pacientes, agenda sessões, registra prontuários, controla financeiro e aciona lembretes. Pacientes interagem via links públicos (triagem, confirmação de sessão).

**Multi-tenancy:** cada psicólogo possui os seus dados exclusivamente. O `psicologo_id` é extraído do JWT em *todas* as rotas autenticadas — nunca aceite `psicologo_id` do corpo da requisição.

---

## 2. Como Rodar Localmente

```bash
# Backend
cd backend && source .venv/bin/activate
export PYTHONPATH=/caminho/para/Cori
alembic upgrade head
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (noutra aba)
npx expo start -c
```

**Usuário de dev:** com `GOOGLE_CLIENT_ID` vazio no `.env`, qualquer token Google retorna o "Dr. Mock" (ID 999). Não configure Google Auth para desenvolvimento.

---

## 3. Padrões Obrigatórios

### Backend
- **Routes → Services → Models.** Nunca coloque lógica de negócio diretamente numa route.
- **Schemas Pydantic** para input e output. Nunca retorne objetos ORM diretamente.
- **Ownership guard** em todo service: verificar que o recurso pertence ao `psicologo_id` antes de operar.
- **Datetimes UTC-aware** (`datetime.now(timezone.utc)`). SQLite é relaxado, PostgreSQL não perdoa.
- Ao adicionar colunas ou tabelas, **sempre gere uma migration Alembic**: `alembic revision --autogenerate -m "descricao"`.
- Novos endpoints públicos (sem JWT): adicionar à lista de exceções em `backend/core/security.py`.

### Frontend
- **Componentes atômicos** em `components/`. Nenhum arquivo de tela deve ter mais de ~200 linhas.
- Estado global apenas em `store/`. Estado local (UI) com `useState`.
- **Nunca chame a API diretamente numa tela** — use um `useCallback` isolado com `try/catch`.
- Toda chamada autenticada usa `api` (de `services/api.ts`). Chamadas públicas usam `apiPublic`.
- Fonte: família `Cori-Bold`, `Cori-SemiBold`, `Cori-Medium`, `Cori`. Nunca use fontes do sistema.
- Cores primárias: `#2C3E50` (dark), `#FAF9F6` (bg), `#27AE60` (success), `#E74C3C` (danger).

---

## 4. Arquivos Críticos — Leia Antes de Editar

| Arquivo | Por que é crítico |
|---|---|
| `backend/core/security.py` | Controla autenticação JWT e quais rotas são públicas |
| `backend/core/database.py` | Engine SQLite/Postgres com pool — não altere sem entender |
| `services/api.ts` | Auto-detect de IP, interceptor JWT, logout em 401 |
| `store/authStore.ts` | Estado do psicólogo autenticado — único source of truth |
| `types/api.ts` | Interfaces TypeScript — mude aqui quando mudar o backend |
| `backend/migrations/` | Nunca delete migrations existentes |

---

## 5. O Que NÃO Fazer

- ❌ `db.query(Model).all()` sem `.filter()` — sempre filtrar por `psicologo_id` ou `paciente_id`
- ❌ Datetimes sem timezone no backend (`datetime.now()` → usar `datetime.now(timezone.utc)`)
- ❌ Adicionar estado global no Zustand para coisas que são só UI (visibilidade de modal, etc.)
- ❌ Usar `any` em TypeScript onde existe a interface em `types/api.ts`
- ❌ Deletar arquivos de migration do Alembic
- ❌ Hardcode de IPs ou URLs — o `services/api.ts` já faz auto-detect

---

## 6. Estrutura de Modais

Todos os modais seguem o mesmo padrão:
```tsx
interface Props {
    visible: boolean;
    pacienteId: number;   // quando necessário
    onClose: () => void;
    onSuccess: () => void;
}
```
Ficam em `components/modals/`. São controlados pela tela pai com `useState`.

---

## 7. Fluxo de Dados Típico

```
Tela (orquestrador)
  └─ fetchData() via api.get/post
       └─ FastAPI Route
            └─ Service (lógica + ownership check)
                 └─ SQLAlchemy Model
  └─ setState(result)
  └─ Componente filho recebe via props
```

---

## 8. Banco de Dados

- **Dev:** SQLite em `backend/cori.db` (gerado automaticamente)
- **Prod:** PostgreSQL via `DATABASE_URL` no ambiente do Railway
- Migrations sempre com Alembic. O `railway.toml` roda `alembic upgrade head` em cada deploy automaticamente.

---

## 9. Testes

Não há testes automatizados ainda. Priorize validação manual via `/docs` (Swagger) e via app com seed data (`python backend/seed_dev_data.py`).
