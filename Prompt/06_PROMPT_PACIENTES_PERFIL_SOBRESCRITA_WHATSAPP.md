# Prompt 06 - Pacientes, Perfil, Sobrescrita e Atalho WhatsApp

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Entregar gestao de pacientes no app do psicologo com perfil completo, sobrescrita de cadastro e atalho operacional de WhatsApp.

## Escopo (Tela/Funcionalidade)

### Psicologo
- Lista de pacientes
- Busca e filtros
- Perfil do paciente
- Edicao/sobrescrita de cadastro inicial
- Atalho WhatsApp

### Paciente
- Perfil basico (dados pessoais e preferencias)

## Implementacao Obrigatoria

1. CRUD de paciente com trilha de alteracoes.
2. Regra de sobrescrita pelo psicologo com historico.
3. Filtros e ordenacoes de lista.
4. Acao rapida de abertura de WhatsApp.
5. Eventos de timeline para alteracoes cadastrais relevantes.

## Teste Obrigatorio

1. Unitarios de regras de perfil.
2. Integracao CRUD paciente.
3. Testes UI da lista e perfil.
4. Teste funcional do atalho WhatsApp.

## Validacao Obrigatoria

1. Psicologo visualiza e edita pacientes sem vazamento de tenant.
2. Sobrescrita preserva consistencia e historico.
3. Atalho WhatsApp funciona com fallback para numero invalido.

## Evidenciacao Obrigatoria

Tabela componentizada por:

- Lista de pacientes
- Perfil do paciente
- Sobrescrita
- WhatsApp
- Timeline de alteracoes

## Resultado Final Obrigatorio

Resumo + pendencias para Agenda/Sessao do Prompt 07.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 06 como concluido.

