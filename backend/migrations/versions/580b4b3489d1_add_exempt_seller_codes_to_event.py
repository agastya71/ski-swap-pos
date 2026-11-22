"""add exempt_seller_codes to event

Revision ID: 580b4b3489d1
Revises: a2b3c4d5e6f7
Create Date: 2026-11-21 18:41:36.802875

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '580b4b3489d1'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('event', schema=None) as batch_op:
        batch_op.add_column(sa.Column('exempt_seller_codes', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('event', schema=None) as batch_op:
        batch_op.drop_column('exempt_seller_codes')
