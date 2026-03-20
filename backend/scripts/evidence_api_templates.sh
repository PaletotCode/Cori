#!/usr/bin/env bash
set -euo pipefail

API="${API_BASE_URL:-http://localhost:8000}"
EMAIL="${EVIDENCE_EMAIL:-dr.aurora@cori.dev}"
PASSWORD="${EVIDENCE_PASSWORD:-dev123456}"

pretty() {
  python3 -m json.tool
}

LOGIN_JSON=$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
ACCESS_TOKEN=$(LOGIN_JSON="$LOGIN_JSON" python3 -c 'import json,os;print(json.loads(os.environ["LOGIN_JSON"])["access_token"])')

PATIENT_ID=$(curl -fsS "$API/patients" -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -c 'import json,sys;arr=json.load(sys.stdin);print(arr[0]["id"])')

NOW_SCHEDULED=$(python3 - <<'PY'
from datetime import datetime, timezone, timedelta
print((datetime.now(timezone.utc)+timedelta(minutes=2)).isoformat())
PY
)

DUE_AT=$(python3 - <<'PY'
from datetime import datetime, timezone, timedelta
print((datetime.now(timezone.utc)+timedelta(days=3)).isoformat())
PY
)

ACT_TEMPLATE_CREATE=$(curl -fsS -X POST "$API/activity-templates" -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"title":"Template API Evidencia","activity_type":"simple_task","instructions":"Executar tarefa do dia.","configuration":{"origin":"evidence"}}')
ACT_TEMPLATE_ID=$(ACT_TEMPLATE_CREATE="$ACT_TEMPLATE_CREATE" python3 -c 'import json,os;print(json.loads(os.environ["ACT_TEMPLATE_CREATE"])["id"])')

ACT_ASSIGN_IMMEDIATE=$(curl -fsS -X POST "$API/activity-templates/$ACT_TEMPLATE_ID/assign" -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -H 'Idempotency-Key: ev-act-immediate-001' -d "{\"patient_id\":\"$PATIENT_ID\",\"send_mode\":\"immediate\",\"due_at\":\"$DUE_AT\",\"overrides\":{\"title\":\"Atividade Immediate Evidencia\"}}")

ACT_ASSIGN_SCHEDULED=$(curl -fsS -X POST "$API/activity-templates/$ACT_TEMPLATE_ID/assign" -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -H 'Idempotency-Key: ev-act-scheduled-001' -d "{\"patient_id\":\"$PATIENT_ID\",\"send_mode\":\"scheduled\",\"scheduled_send_at\":\"$NOW_SCHEDULED\",\"due_at\":\"$DUE_AT\"}")

FORM_TEMPLATE_CREATE=$(curl -fsS -X POST "$API/form-templates" -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"title":"Template Form API Evidencia","subtitle":"Acompanhamento","header":"Responder com sinceridade","sections":[{"title":"Estado","questions":[{"label":"Como voce esta hoje?","field_type":"short_text","required":true}]}]}')
FORM_TEMPLATE_ID=$(FORM_TEMPLATE_CREATE="$FORM_TEMPLATE_CREATE" python3 -c 'import json,os;print(json.loads(os.environ["FORM_TEMPLATE_CREATE"])["id"])')

FORM_ASSIGN_IMMEDIATE=$(curl -fsS -X POST "$API/form-templates/$FORM_TEMPLATE_ID/assign" -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -H 'Idempotency-Key: ev-form-immediate-001' -d "{\"patient_id\":\"$PATIENT_ID\",\"send_mode\":\"immediate\",\"overrides\":{\"title\":\"Formulario Immediate Evidencia\"}}")

FORM_ASSIGN_SCHEDULED=$(curl -fsS -X POST "$API/form-templates/$FORM_TEMPLATE_ID/assign" -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -H 'Idempotency-Key: ev-form-scheduled-001' -d "{\"patient_id\":\"$PATIENT_ID\",\"send_mode\":\"scheduled\",\"scheduled_send_at\":\"$NOW_SCHEDULED\"}")

LOGIN_JSON="$LOGIN_JSON" \
ACT_TEMPLATE_CREATE="$ACT_TEMPLATE_CREATE" \
ACT_ASSIGN_IMMEDIATE="$ACT_ASSIGN_IMMEDIATE" \
ACT_ASSIGN_SCHEDULED="$ACT_ASSIGN_SCHEDULED" \
FORM_TEMPLATE_CREATE="$FORM_TEMPLATE_CREATE" \
FORM_ASSIGN_IMMEDIATE="$FORM_ASSIGN_IMMEDIATE" \
FORM_ASSIGN_SCHEDULED="$FORM_ASSIGN_SCHEDULED" \
python3 - <<'PY' > backend/artifacts/prompt_templates_api_machine.json
import json
import os

login = json.loads(os.environ["LOGIN_JSON"])
login["access_token"] = "***MASKED***"
login["refresh_token"] = "***MASKED***"

output = {
    "login": login,
    "activity_template_create": json.loads(os.environ["ACT_TEMPLATE_CREATE"]),
    "activity_assign_immediate": json.loads(os.environ["ACT_ASSIGN_IMMEDIATE"]),
    "activity_assign_scheduled": json.loads(os.environ["ACT_ASSIGN_SCHEDULED"]),
    "form_template_create": json.loads(os.environ["FORM_TEMPLATE_CREATE"]),
    "form_assign_immediate": json.loads(os.environ["FORM_ASSIGN_IMMEDIATE"]),
    "form_assign_scheduled": json.loads(os.environ["FORM_ASSIGN_SCHEDULED"]),
}
print(json.dumps(output, ensure_ascii=True, indent=2))
PY

{
  echo "LOGIN_JSON"
  LOGIN_JSON="$LOGIN_JSON" python3 - <<'PY'
import json,os
payload=json.loads(os.environ["LOGIN_JSON"])
payload["access_token"]="***MASKED***"
payload["refresh_token"]="***MASKED***"
print(json.dumps(payload, ensure_ascii=True))
PY
  echo

  echo "ACT_TEMPLATE_CREATE"
  printf '%s' "$ACT_TEMPLATE_CREATE" | pretty
  echo

  echo "ACT_ASSIGN_IMMEDIATE"
  printf '%s' "$ACT_ASSIGN_IMMEDIATE" | pretty
  echo

  echo "ACT_ASSIGN_SCHEDULED"
  printf '%s' "$ACT_ASSIGN_SCHEDULED" | pretty
  echo

  echo "FORM_TEMPLATE_CREATE"
  printf '%s' "$FORM_TEMPLATE_CREATE" | pretty
  echo

  echo "FORM_ASSIGN_IMMEDIATE"
  printf '%s' "$FORM_ASSIGN_IMMEDIATE" | pretty
  echo

  echo "FORM_ASSIGN_SCHEDULED"
  printf '%s' "$FORM_ASSIGN_SCHEDULED" | pretty
  echo
} > backend/artifacts/prompt_templates_api_evidence.txt

echo "backend/artifacts/prompt_templates_api_evidence.txt"
