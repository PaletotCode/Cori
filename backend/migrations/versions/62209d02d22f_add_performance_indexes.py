"""add_performance_indexes

Revision ID: 62209d02d22f
Revises: 19620111776d
Create Date: 2026-02-28 15:57:25.368619

Adds composite and single-column indexes on the most common query patterns:
- sessoes: (paciente_id, data_hora_inicio) — agenda geral, timeline
- sessoes: data_hora_inicio — filtro por data isolado
- tarefas_paciente: data_vencimento — agenda geral
- checkins_diarios: data_registro — agenda geral, timeline
- faturas: (paciente_id, estado) — pendentes dashboard
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62209d02d22f'
down_revision: Union[str, Sequence[str], None] = '19620111776d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── sessoes ───────────────────────────────────────────────────────────────
    # Composite: filtra por paciente E data (timeline + agenda geral)
    op.create_index(
        'ix_sessoes_paciente_data_inicio',
        'sessoes',
        ['paciente_id', 'data_hora_inicio'],
        unique=False,
    )
    # Single date: agenda geral usa IN(paciente_ids) + data_hora_inicio
    op.create_index(
        'ix_sessoes_data_hora_inicio',
        'sessoes',
        ['data_hora_inicio'],
        unique=False,
    )

    # ── tarefas_paciente ──────────────────────────────────────────────────────
    op.create_index(
        'ix_tarefas_paciente_data_vencimento',
        'tarefas_paciente',
        ['paciente_id', 'data_vencimento'],
        unique=False,
    )

    # ── checkins_diarios ──────────────────────────────────────────────────────
    op.create_index(
        'ix_checkins_data_registro',
        'checkins_diarios',
        ['paciente_id', 'data_registro'],
        unique=False,
    )

    # ── faturas ───────────────────────────────────────────────────────────────
    # Dashboard de pendentes: filtra por psicologo + estado
    op.create_index(
        'ix_faturas_paciente_estado',
        'faturas',
        ['paciente_id', 'estado'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_faturas_paciente_estado', table_name='faturas')
    op.drop_index('ix_checkins_data_registro', table_name='checkins_diarios')
    op.drop_index('ix_tarefas_paciente_data_vencimento', table_name='tarefas_paciente')
    op.drop_index('ix_sessoes_data_hora_inicio', table_name='sessoes')
    op.drop_index('ix_sessoes_paciente_data_inicio', table_name='sessoes')
