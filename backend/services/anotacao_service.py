from sqlalchemy.orm import Session

from backend.models.anotacao_clinica import AnotacaoClinica
from backend.models.sessao import Sessao, EstadoSessao
from backend.models.paciente import Paciente
from backend.schemas.anotacao_clinica import AnotacaoCreate


def criar_anotacao(
    db: Session,
    *,
    psicologo_id: int,
    dados: AnotacaoCreate,
) -> AnotacaoClinica:
    """
    Cria uma anotação clínica com validação de ownership em cadeia:
      1. Sessão existe?
      2. Sessão pertence a um paciente do psicólogo logado?
      3. Sessão está com estado "realizada"? (prontuário só para sessões realizadas)
      4. Sessão já tem uma anotação? (One-to-One)

    Raises:
        ValueError em qualquer violação de negócio.
    """
    # Busca sessão com JOIN de segurança
    sessao: Sessao | None = (
        db.query(Sessao)
        .join(Paciente, Sessao.paciente_id == Paciente.id)
        .filter(
            Sessao.id == dados.sessao_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .first()
    )

    if not sessao:
        raise ValueError("Sessão não encontrada ou não pertence ao psicólogo.")

    if sessao.estado != EstadoSessao.realizada:
        raise ValueError(
            f"Anotações clínicas só podem ser criadas para sessões 'realizadas'. "
            f"Esta sessão está com estado: '{sessao.estado.value}'."
        )

    # Verifica se já existe uma anotação para esta sessão (One-to-One)
    existente = (
        db.query(AnotacaoClinica)
        .filter(AnotacaoClinica.sessao_id == dados.sessao_id)
        .first()
    )
    if existente:
        raise ValueError(
            f"Esta sessão já possui uma anotação clínica (id={existente.id}). "
            "Use o endpoint de edição para atualizar."
        )

    anotacao = AnotacaoClinica(
        paciente_id=sessao.paciente_id,
        sessao_id=dados.sessao_id,
        conteudo=dados.conteudo,
        tipo=dados.tipo,
    )
    db.add(anotacao)
    db.commit()
    db.refresh(anotacao)
    return anotacao


def listar_anotacoes_paciente(
    db: Session, *, psicologo_id: int, paciente_id: int
) -> list[AnotacaoClinica]:
    return (
        db.query(AnotacaoClinica)
        .join(Paciente, AnotacaoClinica.paciente_id == Paciente.id)
        .filter(
            AnotacaoClinica.paciente_id == paciente_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .order_by(AnotacaoClinica.data_registo.desc())
        .all()
    )


def buscar_anotacao_por_sessao(
    db: Session, *, psicologo_id: int, sessao_id: int
) -> AnotacaoClinica | None:
    return (
        db.query(AnotacaoClinica)
        .join(Paciente, AnotacaoClinica.paciente_id == Paciente.id)
        .filter(
            AnotacaoClinica.sessao_id == sessao_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .first()
    )
