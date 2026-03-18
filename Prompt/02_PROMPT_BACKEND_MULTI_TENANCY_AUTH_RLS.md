# Prompt 02 - Backend Core: Multi-Tenancy, Auth e RLS

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Implementar o nucleo do backend com isolamento por tenant, autenticacao base e trilha de auditoria inicial.

## Escopo (Tela/Funcionalidade)

- Suporte backend para telas de entrada e controle de sessao.
- Sem features clinicas finais ainda.

## Implementacao Obrigatoria

1. Modelagem base:
- tenant/psicologo/paciente (base minima)
- usuario de autenticacao
2. JWT/sessao com extracao obrigatoria de `tenant_id`.
3. Middleware/dependency para contexto de tenant.
4. RLS no Postgres para tabelas nucleares.
5. Migrations Alembic consistentes.
6. Endpoints base:
- login
- refresh/logout
- me/profile basico
7. Seeds de desenvolvimento.

## Teste Obrigatorio

1. Unitarios para auth e extracao de tenant.
2. Testes de integracao para isolamento entre tenants.
3. Teste negativo garantindo bloqueio de acesso cruzado.

## Validacao Obrigatoria

1. Nenhum endpoint aceita `tenant_id` no body.
2. Tenant A nao enxerga dados do tenant B.
3. RLS ativo e validado com consultas reais.

## Evidenciacao Obrigatoria

Tabela componentizada com:

- Auth
- Multi-tenancy
- RLS
- Migrations
- Seeds

## Resultado Final Obrigatorio

1. Relatorio de isolamento multi-tenant.
2. Endpoints prontos para front-end consumir no Prompt 03.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 02 como concluido.

