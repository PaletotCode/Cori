from sqlalchemy.orm import Session
from backend.models.checkin_diario import CheckInDiario
from backend.models.paciente import Paciente
from backend.schemas.checkin import CheckInCreate


def criar_checkin(db: Session, *, psicologo_id: int, dados: CheckInCreate) -> CheckInDiario:
    paciente = (
        db.query(Paciente)
        .filter(Paciente.id == dados.paciente_id, Paciente.psicologo_id == psicologo_id)
        .first()
    )
    if not paciente:
        raise ValueError("Paciente não encontrado ou não pertence ao psicólogo.")

    checkin = CheckInDiario(
        paciente_id=dados.paciente_id,
        nivel_humor=dados.nivel_humor,
        nivel_ansiedade=dados.nivel_ansiedade,
        anotacao_paciente=dados.anotacao_paciente,
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return checkin


def listar_checkins(
    db: Session, *, psicologo_id: int, paciente_id: int,
    mes: int | None = None, ano: int | None = None
) -> list[CheckInDiario]:
    q = (
        db.query(CheckInDiario)
        .join(Paciente, CheckInDiario.paciente_id == Paciente.id)
        .filter(
            CheckInDiario.paciente_id == paciente_id,
            Paciente.psicologo_id == psicologo_id,
        )
    )
    if mes and ano:
        from sqlalchemy import extract
        q = q.filter(
            extract("month", CheckInDiario.data_registro) == mes,
            extract("year", CheckInDiario.data_registro) == ano,
        )
    return q.order_by(CheckInDiario.data_registro.desc()).all()
