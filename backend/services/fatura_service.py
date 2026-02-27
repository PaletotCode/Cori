from datetime import date, datetime, timezone
from sqlalchemy.orm import Session

from backend.models.fatura import Fatura, EstadoFatura
from backend.models.sessao import Sessao, EstadoSessao
from backend.models.paciente import Paciente
from backend.schemas.fatura import GerarFaturaRequest, FaturaPagarRequest


def gerar_fatura(
    db: Session,
    *,
    psicologo_id: int,
    paciente_id: int,
    dados: GerarFaturaRequest,
) -> tuple[Fatura, list[Sessao]]:
    """
    [MOTOR FINANCEIRO]

    Varre todas as sessões do paciente que:
      1. Estejam no mês/ano de referência
      2. Estado seja "realizada" ou "falta_cobrada"
      3. fatura_id seja NULL (ainda não faturadas)

    Cria uma Fatura com o valor_total calculado e vincula as sessões a ela.

    Raises:
        ValueError: Se não houver sessões elegíveis, ou se já existir uma fatura
                    para o mesmo mês/ano do paciente (evita duplicatas).
    """
    # Verifica ownership do paciente
    paciente: Paciente | None = (
        db.query(Paciente)
        .filter(Paciente.id == paciente_id, Paciente.psicologo_id == psicologo_id)
        .first()
    )
    if not paciente:
        raise ValueError("Paciente não encontrado ou não pertence ao psicólogo.")

    # Guarda contra duplicata de fatura para o mesmo mês/ano
    fatura_existente = (
        db.query(Fatura)
        .filter(
            Fatura.paciente_id == paciente_id,
            Fatura.mes_referencia == dados.mes_referencia,
            Fatura.ano_referencia == dados.ano_referencia,
        )
        .first()
    )
    if fatura_existente:
        raise ValueError(
            f"Já existe uma fatura para {dados.mes_referencia}/{dados.ano_referencia} "
            f"deste paciente (id={fatura_existente.id}). "
            "Use o endpoint de edição ou cancele a fatura existente."
        )

    # Busca sessões elegíveis no mês/ano
    sessoes_elegiveis: list[Sessao] = (
        db.query(Sessao)
        .filter(
            Sessao.paciente_id == paciente_id,
            Sessao.fatura_id.is_(None),
            Sessao.estado.in_([EstadoSessao.realizada, EstadoSessao.falta_cobrada]),
        )
        .all()
    )

    # Filtra pelo mês/ano de referência
    sessoes_do_mes = [
        s for s in sessoes_elegiveis
        if s.data_hora_inicio.month == dados.mes_referencia
        and s.data_hora_inicio.year == dados.ano_referencia
    ]

    if not sessoes_do_mes:
        raise ValueError(
            f"Nenhuma sessão elegível em {dados.mes_referencia}/{dados.ano_referencia} "
            "para faturar. Verifique se as sessões estão com estado 'realizada' ou "
            "'falta_cobrada' e sem fatura associada."
        )

    # Calcula o total
    valor_total = sum(float(s.valor_cobrado or 0) for s in sessoes_do_mes)

    # Cria a Fatura
    fatura = Fatura(
        paciente_id=paciente_id,
        mes_referencia=dados.mes_referencia,
        ano_referencia=dados.ano_referencia,
        valor_total=valor_total,
        estado=EstadoFatura.pendente,
        data_vencimento=dados.data_vencimento,
    )
    db.add(fatura)
    db.flush()  # Gera o fatura.id sem commitar ainda

    # Vincula sessões à fatura
    for sessao in sessoes_do_mes:
        sessao.fatura_id = fatura.id

    db.commit()
    db.refresh(fatura)
    for s in sessoes_do_mes:
        db.refresh(s)

    return fatura, sessoes_do_mes


def pagar_fatura(
    db: Session,
    *,
    psicologo_id: int,
    fatura_id: int,
    dados: FaturaPagarRequest,
) -> Fatura:
    """
    Marca a fatura como paga. Valida ownership via paciente.psicologo_id.
    Não permite pagar faturas já canceladas.
    """
    fatura = _buscar_fatura_com_ownership(db, psicologo_id=psicologo_id, fatura_id=fatura_id)

    if fatura.estado == EstadoFatura.cancelada:
        raise ValueError("Não é possível pagar uma fatura cancelada.")
    if fatura.estado == EstadoFatura.paga:
        raise ValueError("Esta fatura já foi paga.")

    fatura.estado = EstadoFatura.paga
    fatura.data_pagamento = dados.data_pagamento
    db.commit()
    db.refresh(fatura)
    return fatura


def listar_faturas_paciente(
    db: Session, *, psicologo_id: int, paciente_id: int
) -> list[Fatura]:
    return (
        db.query(Fatura)
        .join(Paciente, Fatura.paciente_id == Paciente.id)
        .filter(
            Fatura.paciente_id == paciente_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .order_by(Fatura.ano_referencia.desc(), Fatura.mes_referencia.desc())
        .all()
    )


def buscar_fatura(
    db: Session, *, psicologo_id: int, fatura_id: int
) -> Fatura | None:
    return _buscar_fatura_com_ownership(db, psicologo_id=psicologo_id, fatura_id=fatura_id)


def _buscar_fatura_com_ownership(
    db: Session, *, psicologo_id: int, fatura_id: int
) -> Fatura:
    """Busca fatura garantindo que pertence ao psicólogo via JOIN."""
    fatura = (
        db.query(Fatura)
        .join(Paciente, Fatura.paciente_id == Paciente.id)
        .filter(
            Fatura.id == fatura_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .first()
    )
    if not fatura:
        raise ValueError("Fatura não encontrada ou não pertence ao psicólogo.")
    return fatura
