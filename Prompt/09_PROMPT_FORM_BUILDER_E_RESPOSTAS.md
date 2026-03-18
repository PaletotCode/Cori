# Prompt 09 - Form Builder Clinico e Respostas

Leia antes de executar:

1. `Prompt/00_GUIA_MESTRE_EXECUCAO.md`
2. `Prompt/MEMORIA_EXECUCAO.md`
3. `Prompt/STATUS_MVP_50.md`

## Objetivo da Rodada

Entregar form builder clinico v1 (estilo Google Forms direcionado) com envio para pacientes e captura de respostas.

## Escopo (Tela/Funcionalidade)

### Psicologo
- Central de formularios
- Form builder
- Publicar/enviar/agendar
- Visualizar respostas recebidas

### Paciente
- Lista de formularios
- Responder formulario (parcial/final)

## Implementacao Obrigatoria

1. Builder com estrutura:
- titulo/subtitulo/cabecalho
- secoes
- perguntas
2. Tipos de campo v1:
- texto curto/longo
- multipla escolha
- checkbox
- escala
- data/hora
3. Obrigatorio/opcional.
4. Salvamento parcial e envio final.
5. Eventos de timeline:
- assigned/opened/partial_saved/submitted/reviewed
6. Notificacao de novo formulario ao paciente.

## Teste Obrigatorio

1. Integracao do ciclo completo formulario.
2. Testes de validacao de schema do builder.
3. Testes UI de preenchimento parcial/final.
4. Testes de eventos de timeline.

## Validacao Obrigatoria

1. Psicologo cria/publica/envia formulario.
2. Paciente recebe e responde.
3. Psicologo visualiza resultado recebido.
4. Eventos aparecem corretamente na timeline.

## Evidenciacao Obrigatoria

Tabela componentizada por:

- Central de formularios
- Builder
- Resposta do paciente
- Resultado no psicologo
- Timeline de formulario

## Resultado Final Obrigatorio

Resumo + riscos remanescentes para fechamento do 50% no Prompt 10.

## Atualizacao de Memoria

Atualizar memoria/status e marcar Prompt 09 como concluido.

