# Cori API — Documentação Definitiva v2.0
**Versão:** 1.1.0 (pós-refinamento arquitetural) | **Base URL (dev):** `http://localhost:8000`
**Target Reader:** AI Frontend Engineer (React Native)

> **Premissa Fundamental:** O frontend é *dumb*. Ele apenas renderiza o que a API devolve. Toda lógica de negócio, validação, ordenação, cálculo financeiro e geração de efeitos colaterais reside exclusivamente neste backend. O cliente nunca deve inferir estado, ordenar listas ou calcular valores.

---

## Changelog v2.0 (Refinamento Arquitetural)

| Correção | Impacto |
|---|---|
| `dispositivo_push_token` **removido** de `Paciente` | Paciente não tem app — push vai só para o psicólogo |
| `token_confirmacao` (UUID) **adicionado** a `Sessao` | Link público de confirmação via WhatsApp/Email |
| `PATCH /sessoes/public/{token}/confirmar` **novo** | Endpoint público para confirmação de sessão |
| `GET /agenda/geral` **novo** | Visão global do dia/semana do psicólogo |
| `GET /agenda/{id}/timeline` — params `mes/ano` → `data_inicio/data_fim` | Compatível com scroll infinito |
| `GET /auth/me` + `PATCH /auth/me` **novos** | Validação de sessão ativa + atualização de perfil/push token |

---

## 1. Arquitetura de Domínio

### 1.1 Multi-Tenancy via JWT

Todo recurso do sistema pertence a um **Psicólogo** (o "Tenant"). O `psicologo_id` é extraído do JWT em cada request — o cliente **nunca** envia o `psicologo_id` diretamente no payload de rotas protegidas.

```
Psicologo (Tenant)
  ├── dispositivo_push_token  ← push vai para o PSICÓLOGO
  └── [1:N] Paciente
              ├── [1:N] Sessao
              │           ├── token_confirmacao (UUID público, link WhatsApp/Email)
              │           └── [1:1] AnotacaoClinica
              ├── [1:N] Fatura
              ├── [1:N] TarefaPaciente
              ├── [1:N] CheckInDiario
              └── [1:N] NotificacaoLembrete
```

Qualquer tentativa de acessar dados de outro tenant retorna **404** (não 403, para não vazar a existência do recurso).

### 1.2 Motor Event-Driven

O backend reage a criações de entidades sem intervenção do cliente:

| Evento | Side-Effect Automático |
|---|---|
| `POST /sessoes/` | (1) Gera `token_confirmacao` UUID para cada sessão. (2) Cria `NotificacaoLembrete` de `lembrete_sessao` 24h antes |
| `POST /tarefas/` | Cria `NotificacaoLembrete` de `lembrete_tarefa` 12h antes do prazo |
| `PATCH /sessoes/public/{token}/confirmar` | Muda estado para `confirmada` + cria `NotificacaoLembrete` de `aviso_psicologo` com disparo imediato |

**Worker APScheduler** roda a cada 60s, processa `NotificacaoLembrete` onde `data_programada_disparo <= now` e `status = 'agendada'`, envia push **apenas para o Psicólogo** e atualiza o status.

### 1.3 Fluxo de Confirmação de Sessão (por Link)

```
1. Backend cria Sessão → gera token_confirmacao (UUID v4) automaticamente
2. Psicólogo partilha o link via WhatsApp/Email:
   "https://cori.app/confirmar/{token_confirmacao}"
3. Paciente clica no link → frontend chama PATCH /sessoes/public/{token}/confirmar
4. Backend: estado → "confirmada" + aviso push imediato ao psicólogo
→ NÃO requer app instalado no paciente
→ NÃO requer conta ou autenticação
```

### 1.4 Formatos de Dados

| Tipo | Formato | Exemplo |
|---|---|---|
| DateTime com fuso | ISO 8601 | `"2026-10-15T14:30:00+00:00"` |
| Date (sem hora) | ISO 8601 date | `"2026-10-15"` |
| Decimais financeiros | String numérica JSON | `"150.00"` |
| UUID | String lowercase com hífens | `"550e8400-e29b-41d4-a716-446655440000"` |
| IDs | Integer | `42` |

---

## 2. Autenticação e Headers

### 2.1 Fluxo Google OAuth

```
1. App abre Google Sign-In → obtém ID Token (JWT do Google)
2. App envia: POST /auth/google  { "id_token": "<google_id_token>" }
3. API valida com Google, faz upsert do Psicologo no banco
4. API retorna: { "access_token": "<cori_jwt>", "psicologo": {...} }
5. App armazena access_token em SecureStore
6. Todas as requests seguintes: Authorization: Bearer <access_token>
```

> **Dev Mode:** Se `GOOGLE_CLIENT_ID` estiver vazio no `.env`, o endpoint aceita qualquer string como `id_token` e retorna usuário mock.

### 2.2 Validação de Sessão Ativa (Reabertura do App)

```
1. App reabre → lê access_token do SecureStore
2. App chama GET /auth/me
3. Se 200 → sessão válida, usa dados atualizados do perfil
4. Se 401 → token expirado → redirecionar para login
```

### 2.3 Registro de Push Token (Psicólogo)

```
1. App inicializa → obtém Expo Push Token do dispositivo
2. App chama PATCH /auth/me  { "dispositivo_push_token": "ExponentPushToken[xxx]" }
3. Backend atualiza o token do psicólogo — pronto para receber notificações
```

### 2.4 Header Obrigatório (rotas protegidas)

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

Token expira em **7 dias**. Após expiração → `401`. Redirecionar para login.

---

## 3. Tratamento de Erros

| Código | Quando ocorre |
|---|---|
| `400` | Payload malformado (não é JSON válido) |
| `401` | Token ausente, inválido ou expirado |
| `404` | Recurso não existe **ou** pertence a outro tenant |
| `422` | Violação de regra de negócio ou validação de schema |
| `500` | Bug do servidor |

**Formato padrão:**
```json
{ "detail": "Mensagem descritiva em português." }
```

---

## 4. Dicionário de Rotas

---

### 🔓 Autenticação e Perfil

---

#### `POST /auth/google`
**Auth:** Pública

Autentica o psicólogo via Google. Upsert do perfil. `slug_link_publico` gerado apenas no primeiro acesso.

**Request Body:**
```json
{ "id_token": "string" }  // [OBRIGATÓRIO]
```

**Response `200 OK`:**
```json
{
  "access_token": "string",
  "token_type": "bearer",
  "psicologo": {
    "id": 1,
    "email": "ana@clinica.com",
    "nome_exibicao": "Dra. Ana Silva",
    "foto_perfil_url": "https://lh3.googleusercontent.com/...",
    "slug_link_publico": "abc1234xyz",
    "dispositivo_push_token": null
  }
}
```

**Erros:** `401` — Token Google inválido

---

#### `GET /auth/me`
**Auth:** 🔒 JWT

Valida o token e retorna o perfil atualizado do psicólogo logado. Usar na reabertura do app para hidratar o estado global.

**Response `200 OK`:**
```json
{
  "id": 1,
  "email": "ana@clinica.com",
  "nome_exibicao": "Dra. Ana Silva",
  "foto_perfil_url": "https://...",
  "slug_link_publico": "abc1234xyz",
  "dispositivo_push_token": "ExponentPushToken[xxxxxx]"
}
```

**Erros:** `401` — Token inválido ou expirado (app deve redirecionar para login)

---

#### `PATCH /auth/me`
**Auth:** 🔒 JWT

Atualiza dados do perfil do psicólogo. Usar para registrar/atualizar push token após login ou quando o SO regenera o token do dispositivo.

**Request Body:** (todos opcionais — enviar apenas o que muda)
```json
{
  "nome_exibicao": "Dra. Ana Oliveira",
  "foto_perfil_url": "https://...",
  "dispositivo_push_token": "ExponentPushToken[xxxxxx]"
}
```

**Response `200 OK`:** Schema completo do psicólogo (mesmo de `GET /auth/me`)

**Side-effect:** Se `dispositivo_push_token` for atualizado, o worker passa a enviar pushes para o novo token automaticamente.

---

### 👤 Triagem / Self-Onboarding

---

#### `POST /triagem/{slug}`
**Auth:** **PÚBLICA — sem JWT**

O paciente preenche triagem via link do psicólogo. `status` é **sempre forçado** para `"pendente_aprovacao"` — o payload não pode influenciar este valor.

**Path Variables:**
| Param | Tipo | Descrição |
|---|---|---|
| `slug` | `string` | `psicologo.slug_link_publico` (ex: `abc1234xyz`) |

**Request Body:**
```json
{
  "nome_completo": "string",              // [OBRIGATÓRIO]
  "pronomes_genero": "string",            // [OPCIONAL]
  "data_nascimento": "YYYY-MM-DD",        // [OPCIONAL]
  "naturalidade": "string",              // [OPCIONAL]
  "meios_comunicacao": {                  // [OPCIONAL]
    "whatsapp": "string",
    "email": "string",
    "emergencia": "string"
  },
  "descricao_clinica": "string",         // [OPCIONAL] queixa principal
  "estado_civil": "string",              // [OPCIONAL]
  "nome_parceiro": "string",             // [OPCIONAL]
  "tempo_relacao": "string",             // [OPCIONAL]
  "horario_atendimento_padrao": "string",// [OPCIONAL]
  "dia_vencimento_pagamento": 15         // [OPCIONAL]
}
```

**Response `201 Created`:** `PacienteResponse` com `status: "pendente_aprovacao"`

**Erros:** `404` — Slug inválido

---

#### `PATCH /pacientes/{paciente_id}/aprovar`
**Auth:** 🔒 JWT

Aprova paciente da triagem, definindo os valores financeiros da consulta inicial.

**Request Body:**
```json
{
  "valor_sessao": "150.00",              // [OPCIONAL]
  "horario_atendimento_padrao": "Terças 14h", // [OPCIONAL]
  "dia_vencimento_pagamento": 15         // [OPCIONAL]
}
```

**Response `200 OK`:** `PacienteResponse` com `status: "ativo"`

**Erros:**
- `404` — Paciente não encontrado
- `422` — Paciente não está em `"pendente_aprovacao"`

---

### 🧑‍⚕️ Pacientes

**Schema `PacienteResponse`:**
```json
{
  "id": 1,
  "psicologo_id": 1,
  "nome_completo": "Carlos Mendes",
  "foto_perfil_url": null,
  "pronomes_genero": "ele/dele",
  "data_nascimento": "1990-05-20",
  "naturalidade": "São Paulo, SP",
  "meios_comunicacao": { "whatsapp": "+5511999999999" },
  "estado_civil": "Casado",
  "nome_parceiro": "Maria",
  "tempo_relacao": "5 anos",
  "descricao_clinica": "Ansiedade generalizada.",
  "data_inicio_tratamento": "2025-03-01",
  "ficha_tecnica_url": null,
  "horario_atendimento_padrao": "Terças 14h",
  "valor_sessao": "150.00",
  "dia_vencimento_pagamento": 15,
  "status": "ativo",
  "idade": 35,              // Campo computado pela API
  "tempo_atendimento_dias": 361, // Campo computado pela API
  "data_criacao": "2026-02-26T21:00:00+00:00",
  "data_atualizacao": "2026-02-26T21:00:00+00:00"
}
```

> ⚠️ `dispositivo_push_token` foi **removido** do schema de Paciente. O paciente não tem app — pushes vão exclusivamente para o Psicólogo.

**Enum `status`:** `"pendente_aprovacao"` | `"ativo"` | `"inativo"` | `"alta"` | `"pausado"`

---

#### `POST /pacientes/`
**Auth:** 🔒 JWT · Cria paciente diretamente (sem triagem). Status padrão: `"ativo"`.

**Request Body:** Subconjunto dos campos de `PacienteResponse` (nome_completo obrigatório, demais opcionais).

**Response `201 Created`:** `PacienteResponse`

---

#### `GET /pacientes/`
**Auth:** 🔒 JWT · Lista todos os pacientes do psicólogo.

**Query Params:** `skip` (int, default 0), `limit` (int, default 100)

**Response `200 OK`:** `Array<PacienteResponse>`

---

#### `GET /pacientes/{paciente_id}`
**Auth:** 🔒 JWT · **Response `200 OK`:** `PacienteResponse` · **Erros:** `404`

---

#### `PATCH /pacientes/{paciente_id}`
**Auth:** 🔒 JWT · Atualização parcial. Todos os campos opcionais. `psicologo_id` e `status` não podem ser alterados aqui.

**Response `200 OK`:** `PacienteResponse`

---

#### `DELETE /pacientes/{paciente_id}`
**Auth:** 🔒 JWT · Deleção em cascata de todos os recursos associados.

**Response `204 No Content`**

---

### 🗓️ Sessões

**Schema `SessaoResponse`:**
```json
{
  "id": 1,
  "paciente_id": 1,
  "data_hora_inicio": "2026-10-15T14:00:00+00:00",
  "data_hora_fim": "2026-10-15T15:00:00+00:00",
  "estado": "agendada",
  "valor_cobrado": "150.00",
  "fatura_id": null,
  "ja_faturada": false,         // Computado: true quando fatura_id != null
  "token_confirmacao": "550e8400-e29b-41d4-a716-446655440000", // UUID para link público
  "data_criacao": "2026-02-26T21:00:00+00:00"
}
```

**Enum `estado`:**
| Valor | Significado | Gera Cobrança? |
|---|---|---|
| `agendada` | Criada, aguardando | Não |
| `confirmada` | Paciente confirmou via link | Não |
| `realizada` | Sessão ocorreu | **Sim** |
| `falta_cobrada` | Faltou, mas cobra | **Sim** |
| `cancelada_paciente` | Cancelada pelo paciente | Não |
| `remarcada` | Será reagendada | Não |

---

#### `POST /sessoes/`
**Auth:** 🔒 JWT

**Request Body:**
```json
{
  "paciente_id": 1,
  "data_hora_inicio": "2026-10-15T14:00:00+00:00", // [OBRIGATÓRIO]
  "data_hora_fim": "2026-10-15T15:00:00+00:00",    // [OBRIGATÓRIO] > data_hora_inicio
  "valor_cobrado": "150.00",  // [OPCIONAL] Herda paciente.valor_sessao se omitido
  "recorrencia": {            // [OPCIONAL] Omitir para sessão única
    "intervalo_dias": 7,      // 7=semanal, 14=quinzenal [OBRIGATÓRIO se recorrencia]
    "total_sessoes": 12       // Máx 52 [OBRIGATÓRIO se recorrencia]
  }
}
```

**Response `201 Created`:** `Array<SessaoResponse>` — lista com todas as sessões criadas.

**Side-effects automáticos para cada sessão criada:**
1. Gera `token_confirmacao` UUID v4 único
2. Insere `NotificacaoLembrete` (`tipo="lembrete_sessao"`, disparo 24h antes)

**Como gerar o link de confirmação:**
```
Link = "https://cori.app/confirmar/" + sessao.token_confirmacao
Enviar ao paciente via WhatsApp/Email
```

**Erros:**
- `422` — `data_hora_fim <= data_hora_inicio` | Paciente não pertence ao tenant

---

#### `GET /sessoes/paciente/{paciente_id}`
**Auth:** 🔒 JWT · **Query Params:** `skip` (int), `limit` (int, max 200)

**Response `200 OK`:** `Array<SessaoResponse>` ordenado por `data_hora_inicio ASC`

---

#### `PATCH /sessoes/{sessao_id}/estado`
**Auth:** 🔒 JWT · **O Check-in do Psicólogo.**

**Request Body:**
```json
{
  "estado": "realizada",     // [OBRIGATÓRIO] Ver Enum EstadoSessao
  "valor_cobrado": "150.00" // [OPCIONAL]
}
```

**Response `200 OK`:** `SessaoResponse`

**Lógica financeira automática:**

| Novo Estado | Sessão tem `fatura_id`? | Fatura está | Ação |
|---|---|---|---|
| Cobrável (`realizada`, `falta_cobrada`) | Sim | `pendente`/`atrasada` | Recalcula `valor_total` |
| Não cobrável (`cancelada`/`remarcada`) | Sim | `pendente`/`atrasada` | Remove `fatura_id`, recalcula total |
| Qualquer | Sim | `paga`/`cancelada` | **Sem impacto** na fatura |
| Qualquer | Não | — | Apenas muda estado |

---

#### `PATCH /sessoes/public/{token_confirmacao}/confirmar`
**Auth:** **PÚBLICA — sem JWT**

**O link do paciente.** Chamado quando o paciente acessa `https://cori.app/confirmar/{token}`. Não requer autenticação, conta ou app instalado.

**Path Variables:**
| Param | Tipo | Descrição |
|---|---|---|
| `token_confirmacao` | `string` (UUID) | UUID da sessão, incluído em `SessaoResponse` |

**Request Body:** Vazio `{}`

**Response `200 OK`:**
```json
{
  "confirmado": true,
  "paciente_nome": "Carlos Mendes",
  "data_hora_inicio": "2026-10-15T14:00:00+00:00",
  "mensagem": "Presença confirmada! Até a sessão."
}
```

**Side-effects em sequência:**
1. `sessao.estado` → `"confirmada"`
2. Cria `NotificacaoLembrete` (`tipo="aviso_psicologo"`, disparo imediato)
3. Worker (próximo tick ≤ 60s) envia push ao psicólogo: *"Carlos confirmou a sessão de 15/10 14:00"*

**Erros:**
- `404` — Token inválido ou sessão não encontrada
- `422` — Sessão não está em `"agendada"` (já confirmada, realizada, etc.)

> **Segurança:** O `token_confirmacao` é UUID v4 gerado pelo `secrets` do Python — 122 bits de entropia. Não é adivinhável por força bruta. Em produção, adicionar TTL para expirar tokens de sessões passadas.

---

#### `PATCH /sessoes/{sessao_id}/confirmar_pelo_paciente`
**Auth:** 🔒 JWT

Versão protegida para uso interno (psicólogo confirma presença do paciente manualmente, sem link). Mesmo comportamento de side-effects do endpoint público.

**Request Body:** Vazio `{}` · **Response `200 OK`:** `SessaoResponse`

---

### 💰 Faturamento

**Schema `FaturaResponse`:**
```json
{
  "id": 1,
  "paciente_id": 1,
  "mes_referencia": 10,
  "ano_referencia": 2026,
  "valor_total": "600.00",
  "estado": "pendente",
  "data_vencimento": "2026-10-31",
  "data_pagamento": null,
  "total_sessoes": 4,
  "data_criacao": "2026-10-01T12:00:00+00:00"
}
```

**Enum `estado`:** `"pendente"` | `"paga"` | `"atrasada"` | `"cancelada"`

---

#### `POST /faturas/gerar/{paciente_id}`
**Auth:** 🔒 JWT

Varre sessões cobráveis (`realizada`/`falta_cobrada`) com `fatura_id = null` no mês/ano. Cria fatura e vincula sessões.

**Request Body:**
```json
{
  "mes_referencia": 10,
  "ano_referencia": 2026,
  "data_vencimento": "2026-10-31"
}
```

**Response `201 Created`:** `FaturaResponse`

**Side-effects:** Sessões elegíveis recebem `fatura_id` → passam a ter `ja_faturada: true`

**Erros:** `422` — Sem sessões elegíveis | Fatura já existe para o mês/ano

---

#### `GET /faturas/paciente/{paciente_id}`
**Auth:** 🔒 JWT · **Response:** `Array<FaturaResponse>` ordenado por `ano DESC`, `mes DESC`

---

#### `GET /faturas/{fatura_id}`
**Auth:** 🔒 JWT · **Response:** `FaturaResponse` · **Erros:** `404`

---

#### `PATCH /faturas/{fatura_id}/pagar`
**Auth:** 🔒 JWT

**Request Body:**
```json
{ "data_pagamento": "2026-10-20" }  // [OPCIONAL] Default: hoje
```

**Response `200 OK`:** `FaturaResponse` com `estado: "paga"`, `data_pagamento` preenchida

**Erros:** `422` — Fatura já `"paga"` | Fatura `"cancelada"`

---

### 📋 Prontuário Clínico

**Schema `AnotacaoResponse`:**
```json
{
  "id": 1,
  "paciente_id": 1,
  "sessao_id": 5,
  "conteudo": "Paciente relatou melhora...",
  "tipo": "evolucao_oficial",
  "data_registo": "2026-10-15T15:05:00+00:00"
}
```

**Enum `tipo`:** `"evolucao_oficial"` | `"notas_pessoais"`

> ⚠️ **Segurança Futura:** `conteudo` será encriptado em repouso (AES-256) antes de produção.

---

#### `POST /anotacoes/`
**Auth:** 🔒 JWT

**Request Body:**
```json
{
  "sessao_id": 5,
  "conteudo": "Texto do prontuário...",
  "tipo": "evolucao_oficial"
}
```

**Response `201 Created`:** `AnotacaoResponse`

**Validação em cadeia:** Sessão existe → pertence ao tenant → está `"realizada"` → sem anotação prévia (One-to-One)

**Erros:** `422` em qualquer falha da cadeia acima

---

#### `GET /anotacoes/paciente/{paciente_id}`
**Auth:** 🔒 JWT · **Response:** `Array<AnotacaoResponse>` por `data_registo DESC`

---

#### `GET /anotacoes/sessao/{sessao_id}`
**Auth:** 🔒 JWT · **Response:** `AnotacaoResponse` único · **Erros:** `404`

---

### ✅ Tarefas (Para Casa)

**Schema `TarefaResponse`:**
```json
{
  "id": 1,
  "paciente_id": 1,
  "titulo": "Diário de gratidão",
  "descricao": "Escrever 3 coisas positivas por dia.",
  "data_vencimento": "2026-10-22T23:59:00+00:00",
  "status": "pendente",
  "data_criacao": "2026-10-15T15:10:00+00:00"
}
```

**Enum `status`:** `"pendente"` | `"concluida"` | `"nao_realizada"`

---

#### `POST /tarefas/`
**Auth:** 🔒 JWT

**Request Body:**
```json
{
  "paciente_id": 1,
  "titulo": "Diário de gratidão",
  "descricao": "Texto explicativo.",
  "data_vencimento": "2026-10-22T23:59:00+00:00"
}
```

**Response `201 Created`:** `TarefaResponse`

**Side-effect:** Se `data_vencimento` informado e > 12h, cria `NotificacaoLembrete` 12h antes.

---

#### `GET /tarefas/paciente/{paciente_id}`
**Auth:** 🔒 JWT · **Response:** `Array<TarefaResponse>` por `data_vencimento ASC`

---

#### `PATCH /tarefas/{tarefa_id}/status`
**Auth:** 🔒 JWT

**Request Body:** `{ "status": "concluida" }` · **Response:** `TarefaResponse`

---

### 😌 Check-ins de Humor

**Schema `CheckInResponse`:**
```json
{
  "id": 1,
  "paciente_id": 1,
  "data_registro": "2026-10-15T09:30:00+00:00",
  "nivel_humor": 4,       // 1 (muito ruim) → 5 (excelente)
  "nivel_ansiedade": 6,   // 1 (nenhuma) → 10 (extrema)
  "anotacao_paciente": "Noite ruim, mas dia produtivo."
}
```

---

#### `POST /checkins/`
**Auth:** 🔒 JWT

**Request Body:**
```json
{
  "paciente_id": 1,
  "nivel_humor": 4,
  "nivel_ansiedade": 6,
  "anotacao_paciente": "string"
}
```

**Response `201 Created`:** `CheckInResponse`

---

#### `GET /checkins/paciente/{paciente_id}`
**Auth:** 🔒 JWT

**Query Params:**
| Param | Tipo | Obrigatório |
|---|---|---|
| `mes` | integer 1–12 | Não |
| `ano` | integer | Não |

**Response `200 OK`:** `Array<CheckInResponse>` por `data_registro DESC`

---

### 🌟 Super Agenda — Timeline Unificada do Paciente

---

#### `GET /agenda/{paciente_id}/timeline`
**Auth:** 🔒 JWT

Agrega Sessões, Tarefas e Check-ins num intervalo de datas. Ideal para scroll infinito — o cliente define qualquer janela de tempo.

**Path Variables:** `paciente_id` (int)

**Query Params:**
| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `data_inicio` | `YYYY-MM-DD` | **Sim** | Início do intervalo (inclusive) |
| `data_fim` | `YYYY-MM-DD` | **Sim** | Fim do intervalo (inclusive) |

**Exemplos de uso:**
```
# Semana atual
GET /agenda/1/timeline?data_inicio=2026-10-28&data_fim=2026-11-03

# Transição de mês (suportado nativamente)
GET /agenda/1/timeline?data_inicio=2026-10-28&data_fim=2026-11-10
```

**Response `200 OK`:**
```json
{
  "paciente_id": 1,
  "data_inicio": "2026-10-28",
  "data_fim": "2026-11-03",
  "total_eventos": 5,
  "eventos": [
    {
      "tipo_evento": "sessao",
      "data_hora": "2026-10-29T14:00:00+00:00",
      "dados_especificos": { /* SessaoResponse completo */ }
    },
    {
      "tipo_evento": "checkin",
      "data_hora": "2026-10-30T09:15:00+00:00",
      "dados_especificos": { /* CheckInResponse completo */ }
    },
    {
      "tipo_evento": "tarefa",
      "data_hora": "2026-11-01T23:59:00+00:00",
      "dados_especificos": { /* TarefaResponse completo */ }
    }
    // ... ordenado por data_hora ASC, pronto para renderizar
  ]
}
```

**Como o frontend consome:**
```typescript
// ZERO ordenação no cliente — apenas renderizar na ordem recebida
timeline.eventos.forEach(evento => {
  switch (evento.tipo_evento) {
    case "sessao":   return <SessaoCard data={evento.dados_especificos} />;
    case "tarefa":   return <TarefaCard data={evento.dados_especificos} />;
    case "checkin":  return <CheckinCard data={evento.dados_especificos} />;
  }
});
```

**Erros:** `404` — Paciente não encontrado ou não pertence ao tenant

---

### 📅 Agenda Geral do Psicólogo

---

#### `GET /agenda/geral`
**Auth:** 🔒 JWT

**O endpoint "Bom dia, Dra. Ana".** Retorna uma visão consolidada de todos os pacientes do psicólogo num intervalo. Cada evento inclui mini-perfil do paciente para o frontend renderizar diretamente.

**Query Params:**
| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `data_inicio` | `YYYY-MM-DD` | **Sim** | Início do intervalo (inclusive) |
| `data_fim` | `YYYY-MM-DD` | **Sim** | Fim do intervalo (inclusive) |
| `tipos` | `string` (CSV) | Não | Filtrar por tipo: `sessao,tarefa,checkin`. Default: todos |

**Exemplos:**
```
# Hoje
GET /agenda/geral?data_inicio=2026-10-15&data_fim=2026-10-15

# Próximos 7 dias, só sessões e tarefas
GET /agenda/geral?data_inicio=2026-10-15&data_fim=2026-10-22&tipos=sessao,tarefa
```

**Response `200 OK`:**
```json
{
  "psicologo_id": 1,
  "data_inicio": "2026-10-15",
  "data_fim": "2026-10-15",
  "total_eventos": 4,
  "eventos": [
    {
      "tipo_evento": "sessao",
      "data_hora": "2026-10-15T09:00:00+00:00",
      "paciente": {
        "id": 3,
        "nome_completo": "Beatriz Rocha",
        "foto_perfil_url": null
      },
      "dados_especificos": { /* SessaoResponse completo */ }
    },
    {
      "tipo_evento": "tarefa",
      "data_hora": "2026-10-15T23:59:00+00:00",
      "paciente": {
        "id": 1,
        "nome_completo": "Carlos Mendes",
        "foto_perfil_url": "https://..."
      },
      "dados_especificos": { /* TarefaResponse completo */ }
    }
    // ... todos os pacientes, ordenado por data_hora ASC
  ]
}
```

**Diferença da Timeline individual:**
- Inclui campo `paciente` (mini-perfil) em cada evento
- Abrange **todos os pacientes** do psicólogo (não apenas um)
- Ideal para tela inicial do dia e visão semanal/agenda do profissional

**Erros:** `422` — `data_fim < data_inicio`

---

## 5. Motor de Notificações — Referência

### 5.1 Tipos e Destinatários

| `tipo` | Destinatário | Quando |
|---|---|---|
| `lembrete_sessao` | 📱 **Paciente** (via link push, não app) | Criação de Sessão |
| `lembrete_tarefa` | 📱 **Paciente** (via link push) | Criação de Tarefa com prazo |
| `aviso_psicologo` | 🩺 **Psicólogo** (push no app) | Sessão confirmada pelo paciente |
| `cobranca` | 📱 **Paciente** (futuro) | Manual |

> ⚠️ **Clarificação:** O paciente NÃO tem app. Pushes de `lembrete_sessao` e `lembrete_tarefa` são enviados via serviço externo (ex: WhatsApp API, email) usando `meios_comunicacao` do paciente — não Expo Push. O push Expo vai **apenas para o `dispositivo_push_token` do Psicólogo**.

### 5.2 Payload do Push (recebido pelo app do Psicólogo)

```json
{
  "title": "✅ Sessão Confirmada",
  "body": "Carlos Mendes confirmou a sessão de 15/10 14:00.",
  "data": {
    "tipo": "aviso_psicologo",
    "sessao_id": 5,
    "paciente_id": 1
  }
}
```

---

## 6. Referência de Enums

| Model | Campo | Valores |
|---|---|---|
| `Paciente` | `status` | `pendente_aprovacao`, `ativo`, `inativo`, `alta`, `pausado` |
| `Sessao` | `estado` | `agendada`, `confirmada`, `realizada`, `falta_cobrada`, `cancelada_paciente`, `remarcada` |
| `Fatura` | `estado` | `pendente`, `paga`, `atrasada`, `cancelada` |
| `AnotacaoClinica` | `tipo` | `evolucao_oficial`, `notas_pessoais` |
| `TarefaPaciente` | `status` | `pendente`, `concluida`, `nao_realizada` |
| `NotificacaoLembrete` | `tipo` | `lembrete_sessao`, `lembrete_tarefa`, `cobranca`, `aviso_psicologo` |
| `NotificacaoLembrete` | `status` | `agendada`, `enviada`, `falhou` |
| `CheckInDiario` | `nivel_humor` | Integer 1–5 |
| `CheckInDiario` | `nivel_ansiedade` | Integer 1–10 |

---

## 7. Diagrama de Relações

```
Psicologo
  ├── dispositivo_push_token  ← ÚNICO campo de push (psicólogo tem o app)
  └── [1:N] Paciente
              ├── meios_comunicacao { whatsapp, email }  ← contato direto (não push)
              ├── [1:N] Sessao
              │           ├── token_confirmacao (UUID — link público de confirmação)
              │           └── [1:1] AnotacaoClinica
              ├── [1:N] Fatura
              ├── [1:N] TarefaPaciente
              ├── [1:N] CheckInDiario
              └── [1:N] NotificacaoLembrete
```

---

## 8. Checklist de Integração Frontend

### Setup Inicial
- [ ] Armazenar `access_token` em `SecureStore` — **nunca** em `AsyncStorage`
- [ ] Incluir `Authorization: Bearer <token>` em todas as requests protegidas
- [ ] Na inicialização: `GET /auth/me` → 200 continua | 401 → login

### Tratamento de Erros
- [ ] `401` → redirecionar para tela de login (token expirou)
- [ ] `422` → mostrar `response.detail` ao usuário (já em português)
- [ ] `404` → silenciar ou mostrar "não encontrado"

### Push Notifications
- [ ] Após login: obter Expo Push Token → `PATCH /auth/me { "dispositivo_push_token": "..." }`
- [ ] Monitorar se o OS regenera o token → enviar novamente
- [ ] Ao receber push com `data.tipo == "aviso_psicologo"` → navegar para tela da sessão

### Agenda e Timeline
- [ ] **Nunca ordenar** a lista de `eventos` — confiar na ordem do backend
- [ ] Usar `tipo_evento` como único discriminador de card
- [ ] Para scroll infinito: paginar via `data_inicio`/`data_fim` (janelas deslizantes de 7–14 dias)
- [ ] Tela inicial: `GET /agenda/geral?data_inicio=hoje&data_fim=hje` → mini-agenda do dia

### Fluxo de Confirmação de Sessão
- [ ] O link de confirmação é `"https://cori.app/confirmar/" + sessao.token_confirmacao`
- [ ] Psicólogo enviar link ao paciente via `meios_comunicacao.whatsapp` ou `.email`
- [ ] Page `/confirmar/[token]` chama `PATCH /sessoes/public/{token}/confirmar` — sem auth

### Fluxo de Triagem
- [ ] URL do formulário de triagem: `"https://cori.app/triagem/" + psicologo.slug_link_publico`
- [ ] Formulário chama `POST /triagem/{slug}` — sem auth
- [ ] Psicólogo vê fila de `GET /pacientes/?status=pendente_aprovacao` e aprova via `PATCH /pacientes/{id}/aprovar`

### UX de Sessões
- [ ] Se `sessao.ja_faturada == true` → desabilitar edição de valor e state
- [ ] `sessao.estado == "falta_cobrada"` conta como cobrável — não esconder do financeiro
