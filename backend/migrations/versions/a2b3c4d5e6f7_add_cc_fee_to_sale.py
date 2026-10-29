"""add cc_fee to sale

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-10-28

Adds `sale.cc_fee`, the buyer-paid 3% credit-card transaction fee on the
card-financed portion of a sale (the fee is part of sale_total and retained by
MYSL). Defaults to 0 so existing rows read as fee-free sales; checkout,
sale-edit payment changes, and report math compute it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sale',
        sa.Column('cc_fee', sa.Float(), nullable=False, server_default='0.0'),
    )


def downgrade() -> None:
    op.drop_column('sale', 'cc_fee')