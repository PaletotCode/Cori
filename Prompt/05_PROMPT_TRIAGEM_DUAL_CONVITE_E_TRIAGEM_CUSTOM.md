# Prompt 05 - Triagem Dual: Convite Simples e Triagem Personalizada

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Implementar o fluxo completo de entrada de paciente em dois modos: convite simples e triagem personalizada.

## Escopo (Tela/Funcionalidade)

### Psicologo
- Triagem e Convites
- Criacao de link/QR de convite simples
- Criacao de triagem personalizada
- Fila de triagens recebidas
- Aprovar/rejeitar/solicitar complemento

### Paciente
- Entrada via convite
- Triagem inicial (quando exigida)
- Cadastro minimo e consentimentos

## Implementacao Obrigatoria

1. Endpoints para gerar links/token seguros.
2. Fluxo de convite simples.
3. Fluxo de triagem personalizada com formulario inicial.
4. Conversao para paciente ativo apos aprovacao.
5. Registro de eventos na timeline desde o primeiro contato.

## Teste Obrigatorio

1. Integracao para ambos os modos de triagem.
2. Testes de expiracao/invalidez de links.
3. Testes de autorizacao e isolamento por tenant.

## Validacao Obrigatoria

1. Convite simples funcional fim a fim.
2. Triagem personalizada funcional fim a fim.
3. Psicologo consegue aprovar e ativar paciente.

## Evidenciacao Obrigatoria

Tabela componentizada por:

- Tela Triagem/Convites (psicologo)
- Tela Entrada/Triagem (paciente)
- Conversao de status
- Eventos gerados na timeline

## Resultado Final Obrigatorio

Resumo + fluxograma textual dos 2 modos em producao.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 05 como concluido.

