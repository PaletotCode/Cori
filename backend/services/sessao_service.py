from datetime import timedelta
from decimal import Decimal
from sqlalchemy.orm import Session

from backend.models.sessao import Sessao, EstadoSessao
from backend.models.paciente import Paciente
from backend.models.fatura import Fatura
from backend.schemas.sessao import SessaoCreate, SessaoEstadoUpdate
from backend.services import notificacao_service


def criar_sessoes(
    db: Session,
    *,
    psicologo_id: int,
    dados: SessaoCreate,
) -> list[Sessao]:
    """
    Cria uma ou múltiplas sessões.
    Se dados.recorrencia for informada, gera total_sessoes sessões com o
    intervalo_dias definido a partir de data_hora_inicio.

    O valor_cobrado herda paciente.valor_sessao se não for informado.
    """
    # Verifica propriedade: paciente deve pertencer ao psicólogo logado
    paciente: Paciente | None = (
        db.query(Paciente)
        .filter(
            Paciente.id == dados.paciente_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .first()
    )
    if not paciente:
        raise ValueError(f"Paciente {dados.paciente_id} não encontrado ou não pertence ao psicólogo.")

    # Valor padrão: herda do paciente se não informado
    valor = dados.valor_cobrado if dados.valor_cobrado is not None else paciente.valor_sessao
    duracao = dados.data_hora_fim - dados.data_hora_inicio

    # Monta lista de datas de início
    datas_inicio = [dados.data_hora_inicio]
    if dados.recorrencia:
        intervalo = timedelta(days=dados.recorrencia.intervalo_dias)
        for i in range(1, dados.recorrencia.total_sessoes):
            datas_inicio.append(dados.data_hora_inicio + intervalo * i)

    sessoes = []
    for dt_inicio in datas_inicio:
        sessao = Sessao(
            paciente_id=dados.paciente_id,
            data_hora_inicio=dt_inicio,
            data_hora_fim=dt_inicio + duracao,
            estado=EstadoSessao.agendada,
            valor_cobrado=float(valor) if valor is not None else None,
        )
        db.add(sessao)
        sessoes.append(sessao)

    # ─── Gatilho automático: agenda lembrete 24h antes de cada sessão ────────
    for s in sessoes:
        notificacao_service.agendar_lembrete_sessao(db, sessao=s)

    db.commit()
    for s in sessoes:
        db.refresh(s)
    return sessoes


def buscar_sessao(
    db: Session, *, psicologo_id: int, sessao_id: int
) -> Sessao | None:
    """Busca sessão garantindo propriedade via JOIN com pacientes."""
    return (
        db.query(Sessao)
        .join(Paciente, Sessao.paciente_id == Paciente.id)
        .filter(
            Sessao.id == sessao_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .first()
    )


def atualizar_estado(
    db: Session,
    *,
    sessao: Sessao,
    dados: SessaoEstadoUpdate,
) -> tuple[Sessao, bool]:
    """
    [MOTOR DE NEGÓCIO PRINCIPAL]

    Transiciona o estado da sessão e aplica a lógica financeira:

    1. Sessão JÁ FATURADA:
       - Se o novo estado ainda gera cobrança → recalcula o valor na fatura.
       - Se o novo estado NÃO gera cobrança (ex: cancelada) → remove da fatura,
         recalcula o valor_total da Fatura e libera a sessão (fatura_id = None).

    2. Sessão NÃO FATURADA:
       - Apenas atualiza o estado. Nenhum impacto financeiro imediato.
       - O impacto financeiro ocorre no POST /faturas/gerar.

    Returns:
        (sessao_atualizada, fatura_foi_impactada: bool)
    """
    estado_anterior = sessao.estado
    novo_estado = dados.estado
    fatura_impactada = False

    # Atualiza valor se enviado no payload
    if dados.valor_cobrado is not None:
        sessao.valor_cobrado = float(dados.valor_cobrado)

    sessao.estado = novo_estado

    # ─── Lógica de impacto na Fatura ────────────────────────────────────────
    if sessao.fatura_id is not None:
        fatura: Fatura | None = db.query(Fatura).filter(Fatura.id == sessao.fatura_id).first()

        if fatura and fatura.estado not in ("paga", "cancelada"):
            if novo_estado.gera_cobranca:
                # Sessão continua na fatura → recalcula total
                _recalcular_fatura(db, fatura)
                fatura_impactada = True
            else:
                # Sessão sai da fatura (ex: cancelada_paciente)
                sessao.fatura_id = None
                _recalcular_fatura(db, fatura)
                fatura_impactada = True

    db.commit()
    db.refresh(sessao)
    return sessao, fatura_impactada


def confirmar_sessao_publica(db: Session, token_confirmacao: str) -> Sessao:
    """Busca uma sessão pelo token e a confirma publicamente."""
    sessao = db.query(Sessao).filter(Sessao.token_confirmacao == token_confirmacao).first()
    
    if not sessao:
        raise ValueError("Link de confirmação inválido ou sessão não encontrada.")
        
    if sessao.estado != EstadoSessao.agendada:
        raise ValueError("Esta sessão já foi confirmada, realizada ou cancelada.")
        
    sessao.estado = EstadoSessao.confirmada
    
    # Podíamos agendar push info aqui, mas por ora confirmamos somente.
    db.commit()
    db.refresh(sessao)
    
    return sessao


def _recalcular_fatura(db: Session, fatura: Fatura) -> None:
    """Recalcula valor_total somando as sessões cobráveis ainda vinculadas à fatura."""
    sessoes = db.query(Sessao).filter(Sessao.fatura_id == fatura.id).all()
    total = sum(
        float(s.valor_cobrado or 0)
        for s in sessoes
        if s.estado.gera_cobranca
    )
    fatura.valor_total = total
    db.add(fatura)


def listar_sessoes_paciente(
    db: Session,
    *,
    psicologo_id: int,
    paciente_id: int,
    skip: int = 0,
    limit: int = 200,
) -> list[Sessao]:
    return (
        db.query(Sessao)
        .join(Paciente, Sessao.paciente_id == Paciente.id)
        .filter(
            Sessao.paciente_id == paciente_id,
            Paciente.psicologo_id == psicologo_id,
        )
        .order_by(Sessao.data_hora_inicio)
        .offset(skip)
        .limit(limit)
        .all()
    )
