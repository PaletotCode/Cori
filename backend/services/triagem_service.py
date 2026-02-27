"""
services/triagem_service.py — Self-Onboarding e Aprovação de Pacientes

Fluxo:
    1. Psicólogo compartilha: https://cori.app/triagem/{slug}
    2. Paciente preenche formulário → POST /triagem/{slug}
       → Cria Paciente com status="pendente_aprovacao"
    3. Psicólogo revisa, define valor_sessao → PATCH /pacientes/{id}/aprovar
       → Muda status para "ativo"
"""

from decimal import Decimal
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.models.psicologo import Psicologo
from backend.models.paciente import Paciente, StatusPaciente
from backend.schemas.paciente import PacienteCreate


class AprovarPacienteRequest(BaseModel):
    valor_sessao: Optional[Decimal] = None
    horario_atendimento_padrao: Optional[str] = None
    dia_vencimento_pagamento: Optional[int] = None


def criar_via_triagem(
    db: Session, *, slug: str, dados: PacienteCreate
) -> Paciente:
    """
    Endpoint PÚBLICO — não exige JWT.
    Valida o slug, encontra o psicólogo dono e cria o paciente
    com status="pendente_aprovacao" forçado, independente do payload.
    """
    psicologo: Psicologo | None = (
        db.query(Psicologo)
        .filter(Psicologo.slug_link_publico == slug)
        .first()
    )
    if not psicologo:
        raise ValueError("Link de triagem inválido ou expirado.")

    # Converte meios_comunicacao (Pydantic model) → dict
    meios_dict = None
    if dados.meios_comunicacao is not None:
        if hasattr(dados.meios_comunicacao, "model_dump"):
            meios_dict = dados.meios_comunicacao.model_dump(exclude_none=True)
        else:
            meios_dict = dict(dados.meios_comunicacao)

    paciente = Paciente(
        psicologo_id=psicologo.id,
        nome_completo=dados.nome_completo,
        foto_perfil_url=dados.foto_perfil_url,
        pronomes_genero=dados.pronomes_genero,
        data_nascimento=dados.data_nascimento,
        naturalidade=dados.naturalidade,
        meios_comunicacao=meios_dict,
        estado_civil=dados.estado_civil,
        nome_parceiro=dados.nome_parceiro,
        tempo_relacao=dados.tempo_relacao,
        descricao_clinica=dados.descricao_clinica,
        data_inicio_tratamento=dados.data_inicio_tratamento,
        horario_atendimento_padrao=dados.horario_atendimento_padrao,
        valor_sessao=float(dados.valor_sessao) if dados.valor_sessao is not None else None,
        dia_vencimento_pagamento=dados.dia_vencimento_pagamento,
        # STATUS FORÇADO — nunca confia no payload do paciente
        status=StatusPaciente.pendente_aprovacao,
    )
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


def aprovar_paciente(
    db: Session,
    *,
    psicologo_id: int,
    paciente_id: int,
    dados: AprovarPacienteRequest,
) -> Paciente:
    """
    PATCH /pacientes/{id}/aprovar — exige JWT do psicólogo.
    Aceita apenas pacientes em estado "pendente_aprovacao".
    Atualiza dados financeiros acordados e muda status para "ativo".
    """
    paciente: Paciente | None = (
        db.query(Paciente)
        .filter(
            Paciente.id == paciente_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .first()
    )
    if not paciente:
        raise ValueError("Paciente não encontrado.")

    if paciente.status != StatusPaciente.pendente_aprovacao:
        raise ValueError(
            f"Paciente já foi processado (status atual: '{paciente.status.value}'). "
            "Apenas pacientes com status 'pendente_aprovacao' podem ser aprovados."
        )

    # Aplica os dados acordados na consulta inicial
    if dados.valor_sessao is not None:
        paciente.valor_sessao = float(dados.valor_sessao)
    if dados.horario_atendimento_padrao is not None:
        paciente.horario_atendimento_padrao = dados.horario_atendimento_padrao
    if dados.dia_vencimento_pagamento is not None:
        paciente.dia_vencimento_pagamento = dados.dia_vencimento_pagamento

    paciente.status = StatusPaciente.ativo
    db.commit()
    db.refresh(paciente)
    return paciente
