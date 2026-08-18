"""add_is_deleted_to_item

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-17 20:00:00

Adds item.is_deleted for soft delete. Items are soft-deleted (not hard-deleted)
to preserve audit history and referential integrity with sale_item. Deleted
items are excluded from all listings, lookup, reports, and checkout.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('item', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_deleted', sa.Boolean(),
                                      nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table('item', schema=None) as batch_op:
        batch_op.drop_column('is_deleted')