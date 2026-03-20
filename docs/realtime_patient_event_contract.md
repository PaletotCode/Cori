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
  "event_type": "activity_assigned | form_assigned | session_created | ...",
  "entity_type": "activity | form | session",
  "entity_id": "<domain_entity_id>",
  "patient_id": "<patient_id>",
  "tenant_id": "<tenant_id>",
  "title": "<human_title>",
  "body": "<human_body>",
  "created_at": "<iso8601_utc>",
  "status": "sent | delivered | ...",
  "category": "activities | forms | sessions | ...",
  "metadata": {
    "source_template_id": "<template_id_or_null>",
    "send_mode": "immediate | scheduled",
    "...": "other context fields"
  }
}
```

## Compatibility Notes

- Existing tenant subscribers continue to receive notification events.
- New fields (`entity_type`, `entity_id`, `tenant_id`, `metadata`) are additive and backward-compatible.
