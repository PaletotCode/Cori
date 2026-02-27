"""initial — cria tabelas psicologos e pacientes

Revision ID: 2afd0b27af0a
Revises:
Create Date: 2026-02-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "2afd0b27af0a"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── Tabela: psicologos ───────────────────────────────────────────────────
    op.create_table(
        "psicologos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("google_id", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("nome_exibicao", sa.String(120), nullable=True),
        sa.Column("foto_perfil_url", sa.String(1024), nullable=True),
        sa.Column(
            "data_criacao",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
    )
    op.create_index("ix_psicologos_id", "psicologos", ["id"])
    op.create_index("ix_psicologos_google_id", "psicologos", ["google_id"], unique=True)
    op.create_index("ix_psicologos_email", "psicologos", ["email"], unique=True)

    # ─── Tabela: pacientes ────────────────────────────────────────────────────
    op.create_table(
        "pacientes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        # Multi-tenancy: CASCADE garante limpeza automática se o psicólogo for deletado
        sa.Column(
            "psicologo_id",
            sa.Integer(),
            sa.ForeignKey("psicologos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Perfil Básico
        sa.Column("nome_completo", sa.String(255), nullable=False),
        sa.Column("foto_perfil_url", sa.String(1024), nullable=True),
        sa.Column("pronomes_genero", sa.String(60), nullable=True),
        sa.Column("data_nascimento", sa.Date(), nullable=True),
        sa.Column("naturalidade", sa.String(120), nullable=True),
        # Contato (JSON flexível)
        sa.Column("meios_comunicacao", sa.JSON(), nullable=True),
        # Relacionamento
        sa.Column("estado_civil", sa.String(60), nullable=True),
        sa.Column("nome_parceiro", sa.String(120), nullable=True),
        sa.Column("tempo_relacao", sa.String(60), nullable=True),
        # Clínica
        sa.Column("descricao_clinica", sa.Text(), nullable=True),
        sa.Column("data_inicio_tratamento", sa.Date(), nullable=True),
        # Arquivos
        sa.Column("ficha_tecnica_url", sa.String(1024), nullable=True),
        # Logístico e Financeiro
        sa.Column("horario_atendimento_padrao", sa.String(80), nullable=True),
        sa.Column("valor_sessao", sa.Numeric(10, 2), nullable=True),
        sa.Column("dia_vencimento_pagamento", sa.Integer(), nullable=True),
        # Controle (Enum como VARCHAR — portável entre SQLite e Postgres)
        sa.Column(
            "status",
            sa.Enum("ativo", "inativo", "alta", "pausado", name="statuspaciente"),
            nullable=False,
            server_default="ativo",
        ),
        # Timestamps
        sa.Column(
            "data_criacao",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "data_atualizacao",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
    )
    op.create_index("ix_pacientes_id", "pacientes", ["id"])
    op.create_index("ix_pacientes_psicologo_id", "pacientes", ["psicologo_id"])


def downgrade() -> None:
    op.drop_table("pacientes")
    op.drop_table("psicologos")
    # Remove o Enum type (necessário no PostgreSQL; sqlite ignora)
    sa.Enum(name="statuspaciente").drop(op.get_bind(), checkfirst=True)
