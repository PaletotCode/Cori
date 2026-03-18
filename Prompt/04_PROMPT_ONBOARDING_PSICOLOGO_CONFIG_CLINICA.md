# Prompt 04 - Onboarding do Psicologo e Configuracao da Clinica

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Entregar o fluxo completo de onboarding do psicologo com configuracoes dinamicas que governam o comportamento da aplicacao.

## Escopo (Tela/Funcionalidade)

### Psicologo
- Onboarding inicial
- Configuracao de modalidade
- Regras financeiras base
- Politica de faltas
- Preferencias de notificacao
- Configuracao de triagem padrao

## Implementacao Obrigatoria

1. Entidade `practice_profile` (ou equivalente).
2. Endpoints de leitura/atualizacao da configuracao da clinica.
3. Tela de onboarding em etapas.
4. Persistencia e edicao posterior em Configuracoes.
5. Validacoes de dominio no backend.

## Teste Obrigatorio

1. Unitarios de validacao de regras.
2. Integracao API onboarding.
3. Testes de UI para fluxo completo de onboarding.

## Validacao Obrigatoria

1. Configuracoes salvas e refletidas no perfil do tenant.
2. Reabertura da conta mostra configuracao previamente salva.
3. Campos obrigatorios realmente bloqueiam conclusao invalida.

## Evidenciacao Obrigatoria

Tabela componentizada por:

- Tela Onboarding
- Subtelas de etapas
- Configuracoes aplicadas
- Endpoints e schemas

## Resultado Final Obrigatorio

Resumo + lista de parametros dinamicos que serao usados nos proximos prompts.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 04 como concluido.

