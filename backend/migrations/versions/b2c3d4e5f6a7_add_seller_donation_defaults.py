"""add_seller_donation_defaults

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-17 19:30:00

Adds per-seller donation defaults (donate_unsold_default, donate_proceeds_default)
that pre-populate the corresponding intake flags at intake creation. The intake
flags remain on the intake table and can still be overridden per intake and per
item.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('seller', schema=None) as batch_op:
        batch_op.add_column(sa.Column('donate_unsold_default', sa.Boolean(),
                                      nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('donate_proceeds_default', sa.Boolean(),
                                      nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table('seller', schema=None) as batch_op:
        batch_op.drop_column('donate_proceeds_default')
        batch_op.drop_column('donate_unsold_default')