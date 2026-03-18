# Prompt 03 - Front-end Shell e Autenticacao

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Subir o shell do aplicativo React Native com navegacao por areas (Psicologo/Paciente), autenticacao e clientes API/realtime.

## Escopo (Tela/Funcionalidade)

### Psicologo
- Entrada (login)
- Sessao ativa

### Paciente
- Entrada via convite (base)

## Implementacao Obrigatoria

1. Estrutura `front-end/src` por features.
2. Navegacao base com guardas de autenticacao.
3. Store global por dominio:
- auth
- session
- realtime
- notifications
4. Cliente API tipado.
5. Cliente WebSocket tipado com reconexao.
6. Telas base de entrada Psicologo/Paciente.

## Teste Obrigatorio

1. Testes de unidade da store de auth.
2. Testes de navegacao (rotas protegidas).
3. Testes de cliente API/realtime (mocks).

## Validacao Obrigatoria

1. Login do psicologo funcional.
2. Entrada do paciente via convite funcional (stub).
3. Rehidratacao de sessao ao reabrir app.

## Evidenciacao Obrigatoria

Tabela componentizada por tela/subtela:

- Auth Psicologo
- Auth Paciente
- Navegacao
- API client
- Realtime client

## Resultado Final Obrigatorio

Resumo + checklist de pronto para Prompt 04.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 03 como concluido.

