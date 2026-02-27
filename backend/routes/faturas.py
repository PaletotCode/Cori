from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, datetime

from backend.core.database import get_db
from backend.core.security import get_current_psicologo_id
from backend.models.fatura import Fatura, EstadoFatura
from backend.models.paciente import Paciente
from backend.models.sessao import Sessao
from backend.schemas.fatura import GerarFaturaRequest, FaturaPagarRequest, FaturaResponse
from backend.services import fatura_service

router = APIRouter(prefix="/faturas", tags=["Faturamento"])


class PacienteMiniResponse(BaseModel):
    id: int
    nome_completo: str
    foto_perfil_url: Optional[str] = None
    model_config = {"from_attributes": True}


class FaturaPendenteResponse(BaseModel):
    id: int
    paciente_id: int
    paciente: PacienteMiniResponse
    mes_referencia: int
    ano_referencia: int
    valor_total: Decimal
    estado: EstadoFatura
    data_vencimento: date
    data_pagamento: Optional[date] = None
    data_criacao: datetime
    model_config = {"from_attributes": True}

@router.get(
    "/pendentes",
    response_model=list[FaturaPendenteResponse],
    summary="Listar todas as faturas pendentes ou atrasadas (todos os pacientes)",
    description=(
        "Agrega todas as faturas com estado `pendente` ou `atrasada` de todos os pacientes "
        "do psicólogo logado. Inclui dados básicos do paciente para render no dashboard."
    ),
)
def listar_faturas_pendentes(
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> list[FaturaPendenteResponse]:
    faturas = (
        db.query(Fatura)
        .join(Paciente, Fatura.paciente_id == Paciente.id)
        .filter(
            Paciente.psicologo_id == psicologo_id,
            Fatura.estado.in_([EstadoFatura.pendente, EstadoFatura.atrasada])
        )
        .order_by(Fatura.data_vencimento.asc())
        .all()
    )
    result = []
    for f in faturas:
        pac = db.query(Paciente).filter(Paciente.id == f.paciente_id).first()
        result.append(FaturaPendenteResponse(
            id=f.id,
            paciente_id=f.paciente_id,
            paciente=PacienteMiniResponse(id=pac.id, nome_completo=pac.nome_completo, foto_perfil_url=pac.foto_perfil_url),
            mes_referencia=f.mes_referencia,
            ano_referencia=f.ano_referencia,
            valor_total=f.valor_total,
            estado=f.estado,
            data_vencimento=f.data_vencimento,
            data_pagamento=f.data_pagamento,
            data_criacao=f.data_criacao,
        ))
    return result


@router.post(
    "/gerar/{paciente_id}",
    response_model=FaturaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Gerar fatura (fecho de mês)",
    description=(
        "**Motor Financeiro.** Varre as sessões do paciente no mês/ano informado com estado "
        "`realizada` ou `falta_cobrada` e `fatura_id = null`. "
        "Cria uma Fatura, calcula o `valor_total` e vincula as sessões. "
        "Retorna `422` se não houver sessões elegíveis ou se já existir fatura para o mês."
    ),
)
def gerar_fatura(
    paciente_id: int,
    dados: GerarFaturaRequest,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> FaturaResponse:
    try:
        fatura, sessoes_incluidas = fatura_service.gerar_fatura(
            db, psicologo_id=psicologo_id, paciente_id=paciente_id, dados=dados
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    response = FaturaResponse.model_validate(fatura)
    response.total_sessoes = len(sessoes_incluidas)
    return response


@router.get(
    "/paciente/{paciente_id}",
    response_model=list[FaturaResponse],
    summary="Listar faturas de um paciente",
)
def listar_faturas(
    paciente_id: int,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> list[FaturaResponse]:
    faturas = fatura_service.listar_faturas_paciente(
        db, psicologo_id=psicologo_id, paciente_id=paciente_id
    )
    resultado = []
    for f in faturas:
        resp = FaturaResponse.model_validate(f)
        # Conta sessões vinculadas à fatura
        resp.total_sessoes = db.query(Sessao).filter(Sessao.fatura_id == f.id).count()
        resultado.append(resp)
    return resultado


@router.get(
    "/{fatura_id}",
    response_model=FaturaResponse,
    summary="Detalhe de uma fatura",
)
def detalhar_fatura(
    fatura_id: int,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> FaturaResponse:
    try:
        fatura = fatura_service.buscar_fatura(db, psicologo_id=psicologo_id, fatura_id=fatura_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    resp = FaturaResponse.model_validate(fatura)
    resp.total_sessoes = db.query(Sessao).filter(Sessao.fatura_id == fatura.id).count()
    return resp


@router.patch(
    "/{fatura_id}/pagar",
    response_model=FaturaResponse,
    summary="Registrar pagamento de fatura",
    description=(
        "Marca a fatura como `paga` e registra a `data_pagamento`. "
        "Não é possível pagar faturas com estado `cancelada`."
    ),
)
def pagar_fatura(
    fatura_id: int,
    dados: FaturaPagarRequest,
    db: Session = Depends(get_db),
    psicologo_id: int = Depends(get_current_psicologo_id),
) -> FaturaResponse:
    try:
        fatura = fatura_service.pagar_fatura(
            db, psicologo_id=psicologo_id, fatura_id=fatura_id, dados=dados
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    resp = FaturaResponse.model_validate(fatura)
    resp.total_sessoes = db.query(Sessao).filter(Sessao.fatura_id == fatura.id).count()
    return resp
