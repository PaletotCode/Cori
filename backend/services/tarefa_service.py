from sqlalchemy.orm import Session
from backend.models.tarefa_paciente import TarefaPaciente, StatusTarefa
from backend.models.paciente import Paciente
from backend.schemas.tarefa import TarefaCreate, TarefaStatusUpdate
from backend.services import notificacao_service


def criar_tarefa(db: Session, *, psicologo_id: int, dados: TarefaCreate) -> TarefaPaciente:
    paciente = (
        db.query(Paciente)
        .filter(Paciente.id == dados.paciente_id, Paciente.psicologo_id == psicologo_id)
        .first()
    )
    if not paciente:
        raise ValueError("Paciente não encontrado ou não pertence ao psicólogo.")

    tarefa = TarefaPaciente(
        paciente_id=dados.paciente_id,
        titulo=dados.titulo,
        descricao=dados.descricao,
        data_vencimento=dados.data_vencimento,
        status=StatusTarefa.pendente,
    )
    db.add(tarefa)
    # ─── Gatilho automático: agenda lembrete 12h antes do prazo ────────────
    # Chamado antes do commit para que tarefa.id já exista no flush
    db.flush()
    notificacao_service.agendar_lembrete_tarefa(db, tarefa=tarefa)
    db.commit()
    db.refresh(tarefa)
    return tarefa


def atualizar_status_tarefa(
    db: Session, *, psicologo_id: int, tarefa_id: int, dados: TarefaStatusUpdate
) -> TarefaPaciente:
    tarefa = _buscar_com_ownership(db, psicologo_id=psicologo_id, tarefa_id=tarefa_id)
    tarefa.status = dados.status
    db.commit()
    db.refresh(tarefa)
    return tarefa


def listar_tarefas(
    db: Session, *, psicologo_id: int, paciente_id: int
) -> list[TarefaPaciente]:
    return (
        db.query(TarefaPaciente)
        .join(Paciente, TarefaPaciente.paciente_id == Paciente.id)
        .filter(
            TarefaPaciente.paciente_id == paciente_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .order_by(TarefaPaciente.data_vencimento)
        .all()
    )


def _buscar_com_ownership(
    db: Session, *, psicologo_id: int, tarefa_id: int
) -> TarefaPaciente:
    tarefa = (
        db.query(TarefaPaciente)
        .join(Paciente, TarefaPaciente.paciente_id == Paciente.id)
        .filter(TarefaPaciente.id == tarefa_id, Paciente.psicologo_id == psicologo_id)
        .first()
    )
    if not tarefa:
        raise ValueError("Tarefa não encontrada ou não pertence ao psicólogo.")
    return tarefa
