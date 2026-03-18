# Prompt 01 - Rebuild Total e Fundacao

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Modo de Execucao

- Executar em **modo altissimo**.
- Nao pular etapas.
- Nao iniciar Prompt 02.

## Objetivo da Rodada

Executar reset absoluto do legado e levantar a fundacao do novo monorepo Cori V2.

## Escopo (Tela/Funcionalidade)

- Sem telas funcionais finais nesta rodada.
- Estrutura base para suportar todas as telas futuras.

## Implementacao Obrigatoria

1. Delecao absoluta do projeto legado (preservar `.git` e pasta `Prompt/`).
2. Limpeza completa de dependencias e caches.
3. Criar estrutura monorepo:
- `backend/`
- `front-end/`
- `infra/`
4. Criar Docker base com:
- API
- Worker
- Redis
- PostgreSQL 17.6
5. Criar CI inicial (lint/typecheck/test/build).
6. Criar README raiz com comando unico de bootstrap local.
7. Criar padrao de qualidade:
- formatter/linter
- commit conventions
- env examples

## Teste Obrigatorio

1. Build dos containers.
2. Subida de stack local.
3. Healthcheck da API.
4. Pipeline local equivalente (lint/typecheck/test baseline).

## Validacao Obrigatoria

1. Monorepo limpo sem residuos do legado.
2. Stack sobe com um comando.
3. Postgres 17.6 operacional.
4. Estrutura de pastas consistente com o blueprint.

## Evidenciacao Obrigatoria

Entregar tabela componentizada (mesmo sem UI final), cobrindo:

- Infraestrutura
- Backend bootstrap
- Front-end bootstrap
- CI

## Resultado Final Obrigatorio

1. Resumo do que foi feito.
2. Lista de riscos remanescentes.
3. Confirmacao de pronto para Prompt 02.

## Atualizacao de Memoria

Atualizar:

- `Prompt/MEMORIA_EXECUCAO.md` com decisoes tecnicas e comandos validos.
- `Prompt/STATUS_MVP_50.md` marcando Prompt 01 como concluido.

