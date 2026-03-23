# Realtime Event Contract - Patient Assignment Flow

## Endpoint

- WebSocket: `/ws`
- Auth modes:
  - Psychologist app: `?token=<access_jwt>`
  - Patient app: `?patient_token=<public_access_token>`

## Channels

- Tenant channel: `tenant:<tenant_id>`
- Patient channel: `patient:<patient_id>`

Server routing rules:

- Psychologist connection can subscribe only to `tenant:<tenant_id>` of its JWT tenant.
- Patient connection is auto-subscribed and restricted to `patient:<patient_id>` resolved from `patient_token`.
- Notification delivery targets:
  - tenant listeners (`tenant:<tenant_id>`) for operational visibility
  - patient listeners (`patient:<patient_id>`) for directed delivery

## Message Shape

Type: `notification`

```json
{
  "type": "notification",
  "id": "<notification_delivery_id>",
  "event_type": "activity_assigned | form_assigned | session_created | intake_submitted | intake_approved | intake_rejected | intake_complement_requested | ...",
  "entity_type": "activity | form | session",
  "entity_id": "<domain_entity_id>",
  "patient_id": "<patient_id>",
  "tenant_id": "<tenant_id>",
  "title": "<human_title>",
  "body": "<human_body>",
  "created_at": "<iso8601_utc>",
  "status": "sent | delivered | ...",
  "category": "activities | forms | sessions | triage | ...",
  "metadata": {
    "source_template_id": "<template_id_or_null>",
    "send_mode": "immediate | scheduled",
    "...": "other context fields"
  }
}
```

## Triage Events (P2)

- `intake_submitted`: paciente enviou triagem e entrou em fila.
- `intake_approved`: triagem aprovada pelo psicólogo.
- `intake_rejected`: triagem rejeitada pelo psicólogo.
- `intake_complement_requested`: psicólogo pediu complemento.

Notes:
- Triagem usa `category: triage`, `entity_type: intake`, `entity_id: <intake_id>`.
- Eventos de triagem são enviados para o canal `tenant:<tenant_id>`.

## Access Gate Events (P3)

- `intake_patient_access_granted`: acesso oficial liberado para o paciente apos aprovacao.

Notes:
- Evento sai com `category: triage`, `entity_type: intake` e `patient_id` preenchido.
- Roteamento realtime: `tenant:<tenant_id>` e `patient:<patient_id>` para sincronismo entre os dois clientes.

## Compatibility Notes

- Existing tenant subscribers continue to receive notification events.
- New fields (`entity_type`, `entity_id`, `tenant_id`, `metadata`) are additive and backward-compatible.
