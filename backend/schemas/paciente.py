from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, model_validator

from backend.models.paciente import StatusPaciente


class MeiosComunicacao(BaseModel):
    """
    Schema tipado para o campo JSON meios_comunicacao.
    Todos os campos são opcionais para máxima flexibilidade.
    """
    whatsapp: str | None = None
    email: str | None = None
    emergencia: str | None = None

    model_config = {"extra": "allow"}  # Aceita campos extras sem quebrar


class PacienteCreate(BaseModel):
    """
    Schema de criação de Paciente.
    Valida exatamente o payload descrito na especificação.
    O psicologo_id NUNCA é aceito aqui — vem exclusivamente do JWT.
    """
    # Perfil Básico
    nome_completo: str = Field(..., min_length=2, max_length=255, examples=["João da Silva"])
    foto_perfil_url: str | None = Field(None, max_length=1024)
    pronomes_genero: str | None = Field(None, max_length=60, examples=["ele/dele"])
    data_nascimento: date | None = Field(None, examples=["1995-08-14"])
    naturalidade: str | None = Field(None, max_length=120, examples=["São Paulo, SP"])

    # Contato
    meios_comunicacao: MeiosComunicacao | dict[str, Any] | None = Field(
        None,
        examples=[{"whatsapp": "+5511999999999", "email": "joao@email.com"}],
    )

    # Relacionamento
    estado_civil: str | None = Field(None, max_length=60, examples=["namorando"])
    nome_parceiro: str | None = Field(None, max_length=120, examples=["Danielly Mendes"])
    tempo_relacao: str | None = Field(None, max_length=60, examples=["4 anos"])

    # Clínica
    descricao_clinica: str | None = Field(
        None, examples=["Paciente apresenta quadro de ansiedade..."]
    )
    data_inicio_tratamento: date | None = Field(None, examples=["2023-01-15"])

    # Logística e Financeiro
    horario_atendimento_padrao: str | None = Field(
        None, max_length=80, examples=["Quartas, 15:00"]
    )
    valor_sessao: Decimal | None = Field(
        None, ge=0, decimal_places=2, examples=[150.00]
    )
    dia_vencimento_pagamento: int | None = Field(
        None, ge=1, le=31, examples=[5],
        description="Dia do mês para vencimento (1-31)"
    )

    # Controle
    status: StatusPaciente = Field(default=StatusPaciente.ativo)

    @model_validator(mode="after")
    def normalizar_meios_comunicacao(self) -> "PacienteCreate":
        """
        Se meios_comunicacao for um dict puro (não tipado como MeiosComunicacao),
        converte para dict sem validação da subclasse — permite flexibilidade total.
        """
        if isinstance(self.meios_comunicacao, dict):
            self.meios_comunicacao = MeiosComunicacao(**self.meios_comunicacao)
        return self


class PacienteUpdate(BaseModel):
    """
    Schema de atualização parcial (PATCH).
    Todos os campos são opcionais.
    """
    nome_completo: str | None = Field(None, min_length=2, max_length=255)
    foto_perfil_url: str | None = None
    pronomes_genero: str | None = None
    data_nascimento: date | None = None
    naturalidade: str | None = None
    meios_comunicacao: MeiosComunicacao | dict[str, Any] | None = None
    estado_civil: str | None = None
    nome_parceiro: str | None = None
    tempo_relacao: str | None = None
    descricao_clinica: str | None = None
    data_inicio_tratamento: date | None = None
    horario_atendimento_padrao: str | None = None
    valor_sessao: Decimal | None = Field(None, ge=0, decimal_places=2)
    dia_vencimento_pagamento: int | None = Field(None, ge=1, le=31)
    status: StatusPaciente | None = None
    ficha_tecnica_url: str | None = Field(None, max_length=1024)


class PacienteResponse(BaseModel):
    """
    Schema de resposta. Inclui campos computados: idade e tempo_atendimento_dias.
    """
    id: int
    psicologo_id: int

    # Perfil
    nome_completo: str
    foto_perfil_url: str | None
    pronomes_genero: str | None
    data_nascimento: date | None
    naturalidade: str | None

    # Contato
    meios_comunicacao: dict[str, Any] | None

    # Relacionamento
    estado_civil: str | None
    nome_parceiro: str | None
    tempo_relacao: str | None

    # Clínica
    descricao_clinica: str | None
    data_inicio_tratamento: date | None
    ficha_tecnica_url: str | None

    # Logístico e Financeiro
    horario_atendimento_padrao: str | None
    valor_sessao: Decimal | None
    dia_vencimento_pagamento: int | None

    # Controle
    status: StatusPaciente
    data_criacao: datetime
    data_atualizacao: datetime

    # ─── Campos Computados (calculados no response, não armazenados) ─────────
    idade: int | None = None
    tempo_atendimento_dias: int | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def calcular_campos_dinamicos(self) -> "PacienteResponse":
        hoje = date.today()

        # Calcula idade em anos completos
        if self.data_nascimento:
            aniversario = self.data_nascimento
            self.idade = (
                hoje.year - aniversario.year
                - ((hoje.month, hoje.day) < (aniversario.month, aniversario.day))
            )

        # Calcula tempo de atendimento em dias
        if self.data_inicio_tratamento:
            self.tempo_atendimento_dias = (hoje - self.data_inicio_tratamento).days

        return self
