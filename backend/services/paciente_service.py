from typing import Any
from sqlalchemy.orm import Session

from backend.models.paciente import Paciente
from backend.schemas.paciente import PacienteCreate, PacienteUpdate


def criar_paciente(
    db: Session, *, psicologo_id: int, dados: PacienteCreate
) -> Paciente:
    """
    Cria um novo Paciente vinculado ao Psicólogo.
    O psicologo_id vem EXCLUSIVAMENTE do JWT — nunca do payload do cliente.
    """
    # Converte meios_comunicacao (Pydantic model) para dict puro antes de salvar
    meios_dict: dict[str, Any] | None = None
    if dados.meios_comunicacao is not None:
        meios_dict = dados.meios_comunicacao.model_dump(exclude_none=True)

    paciente = Paciente(
        psicologo_id=psicologo_id,
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
        status=dados.status,
    )
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


def listar_pacientes(
    db: Session, *, psicologo_id: int, skip: int = 0, limit: int = 100
) -> list[Paciente]:
    """Retorna todos os pacientes do psicólogo com paginação."""
    return (
        db.query(Paciente)
        .filter(Paciente.psicologo_id == psicologo_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def buscar_paciente(
    db: Session, *, psicologo_id: int, paciente_id: int
) -> Paciente | None:
    """
    Busca um paciente por ID, garantindo que ele pertença ao psicólogo logado.
    Retorna None se não encontrado OU se pertencer a outro psicólogo.
    """
    return (
        db.query(Paciente)
        .filter(
            Paciente.id == paciente_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .first()
    )


def atualizar_paciente(
    db: Session, *, paciente: Paciente, dados: PacienteUpdate
) -> Paciente:
    """Atualização parcial (PATCH): só sobrescreve campos explicitamente enviados."""
    update_data = dados.model_dump(exclude_unset=True)

    # Tratamento especial para meios_comunicacao
    if "meios_comunicacao" in update_data and update_data["meios_comunicacao"] is not None:
        mc = update_data["meios_comunicacao"]
        update_data["meios_comunicacao"] = mc.model_dump(exclude_none=True) if hasattr(mc, "model_dump") else mc

    for field, value in update_data.items():
        setattr(paciente, field, value)

    db.commit()
    db.refresh(paciente)
    return paciente


def deletar_paciente(db: Session, *, paciente: Paciente) -> None:
    """Remove o paciente. Chamada apenas após verificar que pertence ao psicólogo."""
    db.delete(paciente)
    db.commit()
