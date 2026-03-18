# Status de Entrega - 50% MVP Cori V2

| Prompt | Meta da Rodada | Peso no alvo de 50% | Status | Evidencia principal |
|---|---|---:|---|---|
| 01 | Rebuild total + fundacao monorepo/infra | 5% | CONCLUIDO | `README.md`, `Makefile`, `infra/docker-compose.yml`, `.github/workflows/ci.yml` |
| 02 | Backend core multi-tenancy/auth/RLS | 5% | CONCLUIDO | `backend/alembic/versions/20260317_0001_core_auth_multitenancy_rls.py`, `backend/app/api/routes_auth.py`, `backend/tests/integration/test_tenant_isolation.py` |
| 03 | Front-end shell + autenticacao + clients base | 5% | CONCLUIDO | `front-end/app/(auth)/_layout.tsx`, `front-end/src/features/auth/store/createAuthStore.ts`, `front-end/src/features/realtime/client/realtimeClient.ts` |
| 04 | Onboarding psicologo + configuracao clinica | 5% | CONCLUIDO | `backend/app/api/routes_practice_profile.py`, `backend/alembic/versions/20260317_0002_practice_profile_onboarding.py`, `front-end/src/features/practice-profile/screens/PracticeProfileFlowScreen.tsx` |
| 05 | Triagem dual (convite + triagem custom) | 5% | CONCLUIDO | `backend/app/api/routes_triage.py`, `backend/alembic/versions/20260317_0003_triage_dual_timeline.py`, `front-end/src/features/triage/screens/PsychologistTriageInvitesScreen.tsx` |
| 06 | Pacientes + perfil + sobrescrita + WhatsApp | 5% | CONCLUIDO | `backend/app/api/routes_patients.py`, `backend/alembic/versions/20260317_0004_patients_profile_overwrite_whatsapp.py`, `front-end/src/features/patients/screens/PsychologistPatientsScreen.tsx` |
| 07 | Agenda + sessoes + confirmacao + realtime | 5% | CONCLUIDO | `backend/app/api/routes_sessions.py`, `backend/app/api/routes_realtime.py`, `front-end/src/features/sessions/screens/PsychologistAgendaScreen.tsx` |
| 08 | Engine de atividades v1 | 5% | CONCLUIDO | `backend/app/api/routes_activities.py`, `backend/alembic/versions/20260317_0006_activities_engine_v1.py`, `front-end/src/features/activities/screens/PsychologistActivitiesScreen.tsx` |
| 09 | Form builder clinico v1 | 5% | CONCLUIDO | `backend/app/api/routes_forms.py`, `backend/alembic/versions/20260318_0007_forms_builder_responses.py`, `front-end/src/features/forms/screens/PsychologistFormsScreen.tsx` |
| 10 | Timeline unificada + notificacoes v1 + fechamento | 5% | CONCLUIDO | `backend/app/api/routes_notifications.py`, `backend/alembic/versions/20260318_0008_timeline_notifications_v1.py`, `front-end/src/features/notifications/screens/PsychologistTimelineScreen.tsx` |

## Regra de Atualizacao

Ao concluir cada prompt:

1. alterar status para `CONCLUIDO`;
2. preencher evidencia principal (arquivo/relatorio);
3. atualizar percentual acumulado no `Prompt/MEMORIA_EXECUCAO.md`.

## Acumulado Atual

- Percentual entregue no alvo desta fase: `50%`
- Estado: `FECHADO (Prompt 10 concluido)`
