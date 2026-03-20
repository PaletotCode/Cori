from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

CATEGORY_LABEL_PT: dict[str, str] = {
    "sessions": "Sessoes",
    "activities": "Atividades",
    "forms": "Formularios",
    "documents": "Documentos",
    "notifications": "Notificacoes",
    "app_usage": "ABP",
    "profile": "Cadastro",
    "changes": "Mudancas",
    "payments": "Pagamentos",
}

_ACTOR_LABEL_PT: dict[str, str] = {
    "psychologist": "psicologo",
    "patient": "paciente",
    "system": "sistema",
    "triage": "triagem",
}

_EVENT_TITLE_BY_TYPE: dict[str, str] = {
    "assigned": "Item atribuido",
    "scheduled": "Envio agendado",
    "updated": "Conteudo atualizado",
    "opened": "Conteudo aberto",
    "started": "Atividade iniciada",
    "resumed": "Atividade retomada",
    "paused": "Atividade pausada",
    "completed": "Atividade concluida",
    "reopened": "Conteudo reaberto",
    "canceled": "Conteudo cancelado",
    "overdue": "Prazo vencido",
    "partial_saved": "Rascunho salvo",
    "submitted": "Resposta enviada",
    "reviewed": "Conteudo revisado",
    "activity_assigned": "Atividade atribuida",
    "activity_resend": "Atividade reenviada",
    "activity_reopen": "Atividade reaberta",
    "activity_cancel": "Atividade cancelada",
    "form_assigned": "Formulario atribuido",
    "form_submitted": "Formulario enviado",
    "form_reviewed": "Formulario revisado",
    "session_created": "Sessao agendada",
    "session_confirmed_by_patient": "Sessao confirmada pelo paciente",
    "session_confirmed_by_psychologist": "Sessao confirmada pelo psicologo",
    "session_rescheduled": "Sessao remarcada",
    "session_canceled": "Sessao cancelada",
    "session_completed": "Sessao concluida",
    "session_reminder_sent": "Lembrete de sessao enviado",
    "document_shared": "Documento compartilhado",
    "document_opened": "Documento aberto",
    "document_acknowledged": "Documento confirmado",
    "notification_queued": "Notificacao na fila de envio",
    "notification_sent": "Notificacao enviada",
    "notification_delivered": "Notificacao entregue",
    "notification_opened": "Notificacao aberta",
    "notification_action_taken": "Acao registrada na notificacao",
    "notification_failed": "Falha no envio da notificacao",
    "notification_preferences_updated": "Preferencias de notificacao atualizadas",
    "app_opened": "Aplicativo acessado",
    "patient_profile_created": "Criamos o cadastro do paciente",
    "patient_profile_updated": "Atualizamos o cadastro do paciente",
    "patient_profile_overwritten": "Revisamos o cadastro inicial",
    "patient_profile_archived": "Arquivamos o cadastro do paciente",
    "patient_activated": "Reativamos o paciente",
    "intake_invite_created": "Convite de triagem enviado",
    "intake_link_opened": "Link de triagem acessado",
    "intake_submitted": "Triagem enviada",
    "intake_approved": "Triagem aprovada",
    "intake_rejected": "Triagem rejeitada",
    "intake_complement_requested": "Complemento de triagem solicitado",
    "intake_expired": "Triagem expirada",
}

_GENERIC_ACTION_PT: dict[str, str] = {
    "assigned": "atribuida",
    "resend": "reenviada",
    "reopen": "reaberta",
    "cancel": "cancelada",
    "submitted": "enviada",
    "reviewed": "revisada",
    "opened": "aberta",
    "acknowledged": "confirmada",
    "created": "criada",
    "rescheduled": "remarcada",
    "completed": "concluida",
    "failed": "com falha",
}

_CHANGE_TYPE_SUMMARY: dict[str, str] = {
    "created": "Criamos o cadastro inicial deste paciente",
    "updated": "Atualizamos o cadastro deste paciente",
    "overwritten": "Revisamos o cadastro inicial deste paciente",
    "archived": "Arquivamos o cadastro deste paciente",
}

_FIELD_LABEL_PT: dict[str, str] = {
    "activity_id": "atividade",
    "activity title": "titulo da atividade",
    "activity_title": "titulo da atividade",
    "answered count": "itens respondidos",
    "answered_count": "itens respondidos",
    "birth date": "data de nascimento",
    "birth_date": "data de nascimento",
    "body": "mensagem",
    "changed fields": "campos alterados",
    "changed_fields": "campos alterados",
    "communication notes": "observacoes de comunicacao",
    "communication_notes": "observacoes de comunicacao",
    "created at": "criado em",
    "created_at": "criado em",
    "delivery status": "status da entrega",
    "delivery_status": "status da entrega",
    "document id": "documento",
    "document_id": "documento",
    "document title": "titulo do documento",
    "document_title": "titulo do documento",
    "due at": "prazo",
    "due_at": "prazo",
    "email": "e-mail",
    "emergency contact name": "contato de emergencia",
    "emergency_contact_name": "contato de emergencia",
    "emergency contact phone": "telefone de emergencia",
    "emergency_contact_phone": "telefone de emergencia",
    "event type": "tipo de evento",
    "event_type": "tipo de evento",
    "execution elapsed seconds": "tempo de execucao",
    "execution_elapsed_seconds": "tempo de execucao",
    "full name": "nome completo",
    "full_name": "nome completo",
    "note": "observacao",
    "old start at": "horario anterior",
    "old_start_at": "horario anterior",
    "new start at": "novo horario",
    "new_start_at": "novo horario",
    "phone": "telefone",
    "preferred contact channel": "canal de contato",
    "preferred_contact_channel": "canal de contato",
    "preferred name": "nome preferido",
    "preferred_name": "nome preferido",
    "pronouns": "pronomes",
    "reason": "motivo",
    "required count": "itens obrigatorios",
    "required_count": "itens obrigatorios",
    "review note": "observacao da revisao",
    "review_note": "observacao da revisao",
    "scheduled end at": "termino",
    "scheduled_end_at": "termino",
    "scheduled send at": "envio agendado para",
    "scheduled_send_at": "envio agendado para",
    "scheduled start at": "inicio",
    "scheduled_start_at": "inicio",
    "send mode": "modo de envio",
    "send_mode": "modo de envio",
    "session id": "sessao",
    "session_id": "sessao",
    "status": "status",
    "surface": "origem do acesso",
    "title": "titulo",
    "trigger event type": "evento de origem",
    "trigger_event_type": "evento de origem",
    "updated at": "atualizado em",
    "updated_at": "atualizado em",
}

_VALUE_LABEL_PT: dict[str, str] = {
    "immediate": "imediato",
    "scheduled": "agendado",
    "queued": "na fila",
    "sent": "enviado",
    "delivered": "entregue",
    "opened": "aberto",
    "action_taken": "acao registrada",
    "failed": "falhou",
    "whatsapp": "WhatsApp",
    "email": "e-mail",
    "phone": "telefone",
    "psychologist": "psicologo",
    "patient": "paciente",
    "system": "sistema",
    "triage": "triagem",
}


@dataclass(frozen=True)
class TimelineNaturalContent:
    category_label: str
    actor_label: str
    title: str
    event_label: str
    detail: str


@dataclass(frozen=True)
class DeliveryNaturalContent:
    category_label: str
    title: str
    event_label: str
    detail: str


def category_label_pt(category: str) -> str:
    return CATEGORY_LABEL_PT.get(category, _humanize_label(category))


def actor_label_pt(actor_type: str) -> str:
    normalized = actor_type.strip().lower()
    return _ACTOR_LABEL_PT.get(normalized, _humanize_label(normalized))


def build_timeline_natural_content(
    *,
    category: str,
    event_type: str,
    actor_type: str,
    payload: Mapping[str, object] | None,
) -> TimelineNaturalContent:
    payload_map = payload or {}
    resolved_title = _resolve_event_title(category=category, event_type=event_type)
    resolved_actor = actor_label_pt(actor_type)
    return TimelineNaturalContent(
        category_label=category_label_pt(category),
        actor_label=resolved_actor,
        title=resolved_title,
        event_label=_resolve_event_label(event_type=event_type, actor_label=resolved_actor),
        detail=_resolve_event_detail(
            category=category,
            event_type=event_type,
            payload=payload_map,
            fallback_title=resolved_title,
        ),
    )


def build_delivery_natural_content(
    *,
    category: str,
    event_type: str,
    status: str,
    title: str,
    body: str,
    status_reason: str | None,
    metadata: Mapping[str, object] | None,
) -> DeliveryNaturalContent:
    trigger_event = _first_text(metadata or {}, "trigger_event_type")
    resolved_title = (
        title.strip()
        if title.strip()
        else _resolve_event_title(category=category, event_type=event_type)
    )
    status_label = _resolve_notification_status_label(status)

    if body.strip():
        detail = body.strip()
    elif status_reason is not None and status_reason.strip():
        detail = status_reason.strip()
    elif trigger_event is not None:
        detail = (
            "Entrega vinculada ao evento "
            f"'{_resolve_event_title(category=category, event_type=trigger_event)}'."
        )
    else:
        detail = "Entrega registrada na timeline do paciente."

    return DeliveryNaturalContent(
        category_label=category_label_pt(category),
        title=resolved_title,
        event_label=f"Status da entrega: {status_label}",
        detail=detail,
    )


def build_patient_change_natural_summary(
    *,
    change_type: str,
    changed_fields: list[str],
    reason: str | None,
) -> str:
    parts: list[str] = [_CHANGE_TYPE_SUMMARY.get(change_type, "Cadastro atualizado")]
    fields = _join_natural_list([_humanize_label(field).lower() for field in changed_fields[:4]])
    if fields:
        parts.append(f"Os dados ajustados foram: {fields}")
    if reason is not None and reason.strip():
        parts.append(f"Motivo informado: {_sentence_text(reason)}")
    return ". ".join(parts) + "."


def _resolve_event_title(*, category: str, event_type: str) -> str:
    normalized_type = event_type.strip().lower()
    if normalized_type in _EVENT_TITLE_BY_TYPE:
        return _EVENT_TITLE_BY_TYPE[normalized_type]

    if "_" in normalized_type:
        prefix, action = normalized_type.split("_", 1)
        if prefix in {"activity", "form", "session", "document", "notification"}:
            subject = {
                "activity": "Atividade",
                "form": "Formulario",
                "session": "Sessao",
                "document": "Documento",
                "notification": "Notificacao",
            }[prefix]
            action_label = _GENERIC_ACTION_PT.get(action, _humanize_label(action))
            return f"{subject} {action_label}"

    if normalized_type in {"assigned", "scheduled", "opened", "submitted", "reviewed"}:
        subject = {
            "activities": "Atividade",
            "forms": "Formulario",
            "sessions": "Sessao",
            "documents": "Documento",
            "notifications": "Notificacao",
            "app_usage": "Aplicativo",
            "profile": "Cadastro",
            "changes": "Cadastro",
            "payments": "Pagamento",
        }.get(category, "Atualizacao")
        action_label = _GENERIC_ACTION_PT.get(normalized_type, _humanize_label(normalized_type))
        return f"{subject} {action_label}"

    return _humanize_label(normalized_type)


def _resolve_event_detail(
    *,
    category: str,
    event_type: str,
    payload: Mapping[str, object],
    fallback_title: str,
) -> str:
    normalized_type = event_type.strip().lower()

    if category == "sessions":
        return _session_detail(normalized_type, payload, fallback_title)
    if category == "activities":
        return _activity_detail(normalized_type, payload, fallback_title)
    if category == "forms":
        return _form_detail(normalized_type, payload, fallback_title)
    if category == "documents":
        return _document_detail(payload)
    if category == "notifications":
        return _notification_detail(normalized_type, payload)
    if category in {"app_usage", "profile"}:
        return _profile_or_usage_detail(normalized_type, payload)

    fallback = _payload_fallback_summary(payload)
    if fallback is not None:
        return fallback
    return f"{fallback_title} registrado na timeline."


def _session_detail(event_type: str, payload: Mapping[str, object], fallback_title: str) -> str:
    if event_type == "session_created":
        start = _format_datetime(payload.get("scheduled_start_at"))
        end = _format_datetime(payload.get("scheduled_end_at"))
        if start is not None and end is not None:
            return f"Sessao registrada para {start} ate {end}."
    if event_type == "session_rescheduled":
        old_start = _format_datetime(payload.get("old_start_at"))
        new_start = _format_datetime(payload.get("new_start_at"))
        reason = _first_text(payload, "reason")
        parts: list[str] = []
        if old_start is not None and new_start is not None:
            parts.append(f"Sessao remarcada de {old_start} para {new_start}.")
        if reason is not None:
            parts.append(f"Motivo: {_sentence_text(reason)}.")
        if parts:
            return " ".join(parts)
    if event_type == "session_canceled":
        reason = _first_text(payload, "reason")
        if reason is not None:
            return f"Sessao cancelada. Motivo: {_sentence_text(reason)}."
        return "Sessao cancelada."
    if event_type == "session_reminder_sent":
        hours_before = _coerce_int(payload.get("reminder_hours_before"))
        if hours_before is not None:
            return f"Lembrete enviado com {hours_before} hora(s) de antecedencia."
    return _payload_fallback_summary(payload) or f"{fallback_title}."


def _activity_detail(event_type: str, payload: Mapping[str, object], fallback_title: str) -> str:
    title = _first_text(payload, "title")
    due = _format_datetime(payload.get("due_at"))
    send_mode = _first_text(payload, "send_mode")
    scheduled_send = _format_datetime(payload.get("scheduled_send_at"))
    reason = _first_text(payload, "reason")
    elapsed = _coerce_int(payload.get("execution_elapsed_seconds"))

    parts: list[str] = []
    if title is not None:
        parts.append(f"Atividade: {title}.")
    if event_type in {"assigned", "activity_assigned"}:
        if send_mode == "scheduled" and scheduled_send is not None:
            parts.append(f"Envio programado para {scheduled_send}.")
        else:
            parts.append("Atividade disponivel para o paciente.")
        if due is not None:
            parts.append(f"Prazo: {due}.")
    elif event_type == "scheduled":
        if scheduled_send is not None:
            parts.append(f"Envio agendado para {scheduled_send}.")
        if due is not None:
            parts.append(f"Prazo previsto: {due}.")
    elif event_type == "overdue":
        if due is not None:
            parts.append(f"O prazo venceu em {due}.")
        else:
            parts.append("Prazo da atividade foi excedido.")
    elif event_type in {
        "canceled",
        "reopened",
        "updated",
        "completed",
        "paused",
        "started",
        "resumed",
        "opened",
    }:
        if elapsed is not None:
            parts.append(f"Tempo registrado: {elapsed // 60} min.")
        if reason is not None:
            parts.append(f"Motivo: {_sentence_text(reason)}.")

    if parts:
        return " ".join(parts)
    return _payload_fallback_summary(payload) or f"{fallback_title}."


def _form_detail(event_type: str, payload: Mapping[str, object], fallback_title: str) -> str:
    title = _first_text(payload, "title")
    send_mode = _first_text(payload, "send_mode")
    scheduled_send = _format_datetime(payload.get("scheduled_send_at"))
    answered_count = _coerce_int(payload.get("answered_count"))
    required_count = _coerce_int(payload.get("required_count"))
    review_note = _first_text(payload, "review_note")

    parts: list[str] = []
    if title is not None:
        parts.append(f"Formulario: {title}.")

    if event_type in {"assigned", "form_assigned"}:
        if send_mode == "scheduled" and scheduled_send is not None:
            parts.append(f"Envio programado para {scheduled_send}.")
        else:
            parts.append("Formulario enviado para resposta.")
    elif event_type == "scheduled":
        if scheduled_send is not None:
            parts.append(f"Formulario agendado para envio em {scheduled_send}.")
    elif event_type == "partial_saved":
        if answered_count is not None:
            parts.append(f"Rascunho salvo com {answered_count} resposta(s).")
    elif event_type == "submitted":
        if answered_count is not None and required_count is not None:
            parts.append(
                f"Resposta enviada com {answered_count} item(ns) e {required_count} obrigatorio(s)."
            )
    elif event_type in {"reviewed", "form_reviewed"}:
        if review_note is not None:
            parts.append(f"Revisao registrada: {_sentence_text(review_note)}.")
        else:
            parts.append("Formulario revisado pelo psicologo.")

    if parts:
        return " ".join(parts)
    return _payload_fallback_summary(payload) or f"{fallback_title}."


def _document_detail(payload: Mapping[str, object]) -> str:
    title = _first_text(payload, "document_title")
    note = _first_text(payload, "note")
    document_id = _first_text(payload, "document_id")
    parts: list[str] = []
    if title is not None:
        parts.append(f"Documento: {title}.")
    elif document_id is not None:
        parts.append(f"Documento id {document_id}.")
    if note is not None:
        parts.append(f"Observacao: {_sentence_text(note)}.")
    return " ".join(parts) if parts else "Documento atualizado na timeline."


def _notification_detail(event_type: str, payload: Mapping[str, object]) -> str:
    reason = _first_text(payload, "reason")
    trigger_event_type = _first_text(payload, "trigger_event_type")
    status = _first_text(payload, "delivery_status")

    if event_type == "notification_failed":
        if reason is not None:
            return f"Falha no envio: {_sentence_text(reason)}."
        return "Falha no envio da notificacao."
    if event_type == "notification_queued" and trigger_event_type is not None:
        trigger_title = _resolve_event_title(
            category="notifications",
            event_type=trigger_event_type,
        )
        return f"Notificacao preparada para o evento '{trigger_title}'."
    if status is not None:
        return f"Status atual da entrega: {_resolve_notification_status_label(status)}."
    return _payload_fallback_summary(payload) or "Evento de notificacao registrado."


def _profile_or_usage_detail(event_type: str, payload: Mapping[str, object]) -> str:
    if event_type.startswith("patient_profile_"):
        changed_fields = payload.get("changed_fields")
        if isinstance(changed_fields, list) and len(changed_fields) > 0:
            readable = _join_natural_list(
                [_humanize_label(str(item)).lower() for item in changed_fields[:4]]
            )
            if event_type == "patient_profile_created":
                return f"Criamos o cadastro inicial com {readable}."
            if event_type == "patient_profile_overwritten":
                return f"Revisamos o cadastro inicial e atualizamos {readable}."
            return f"Atualizamos o cadastro e ajustamos {readable}."
        if event_type == "patient_profile_archived":
            return "Arquivamos o cadastro deste paciente."
        if event_type == "patient_activated":
            return "Reativamos o cadastro deste paciente."
    if event_type == "app_opened":
        surface = _first_text(payload, "surface")
        if surface is not None:
            return f"Acesso registrado em {_humanize_payload_value(surface, key='surface')}."
        return "Aplicativo aberto pelo paciente."
    return _payload_fallback_summary(payload) or "Atualizacao registrada na timeline."


def _resolve_notification_status_label(status: str) -> str:
    normalized = status.strip().lower()
    labels = {
        "queued": "na fila",
        "sent": "enviado",
        "delivered": "entregue",
        "opened": "aberto",
        "action_taken": "acao registrada",
        "failed": "falhou",
    }
    return labels.get(normalized, _humanize_label(normalized))


def _payload_fallback_summary(payload: Mapping[str, object]) -> str | None:
    if len(payload) == 0:
        return None
    parts: list[str] = []
    for key, value in list(payload.items())[:2]:
        label = _humanize_label(str(key)).lower()
        normalized_value = _humanize_payload_value(value, key=str(key))
        if normalized_value:
            parts.append(f"{label} '{normalized_value}'")
    if len(parts) == 0:
        return None
    return f"Tambem registramos { _join_natural_list(parts) }."


def _humanize_payload_value(value: object, *, key: str | None = None) -> str:
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned == "":
            return ""
        normalized = cleaned.lower()
        if normalized in _VALUE_LABEL_PT:
            return _VALUE_LABEL_PT[normalized]
        if key is not None and key in {"trigger_event_type", "event_type"}:
            return _resolve_event_title(category="notifications", event_type=cleaned)
        if key is not None and key in {"surface"}:
            return _humanize_label(cleaned)
        return cleaned
    if isinstance(value, bool):
        return "sim" if value else "nao"
    if isinstance(value, int | float):
        return str(value)
    if value is None:
        return ""
    return str(value).strip()


def _first_text(payload: Mapping[str, object], *keys: str) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned:
                return cleaned
    return None


def _coerce_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned.isdigit():
            return int(cleaned)
    return None


def _format_datetime(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if raw == "":
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return raw
    return parsed.strftime("%d/%m/%Y %H:%M")


def _sentence_text(value: str) -> str:
    return value.strip().rstrip(" .")


def _join_natural_list(items: list[str]) -> str:
    cleaned = [item.strip() for item in items if item.strip()]
    if len(cleaned) == 0:
        return ""
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]} e {cleaned[1]}"
    return ", ".join(cleaned[:-1]) + f" e {cleaned[-1]}"


def _resolve_event_label(*, event_type: str, actor_label: str) -> str:
    normalized_type = event_type.strip().lower()
    if normalized_type in {"patient_profile_created", "session_created", "assigned", "form_assigned"}:
        return f"Registro criado pelo {actor_label}"
    if normalized_type in {"patient_profile_updated", "updated", "reviewed", "form_reviewed"}:
        return f"Atualizacao feita pelo {actor_label}"
    if normalized_type in {"canceled", "session_canceled", "activity_cancel"}:
        return f"Cancelamento feito pelo {actor_label}"
    return f"Registro feito pelo {actor_label}"


def _humanize_label(value: str) -> str:
    normalized = value.strip().replace("_", " ").replace("-", " ")
    normalized = " ".join(part for part in normalized.split(" ") if part)
    if normalized == "":
        return "Atualizacao"
    normalized_lower = normalized.lower()
    translated = _FIELD_LABEL_PT.get(normalized_lower, normalized_lower)
    return translated[0].upper() + translated[1:]
