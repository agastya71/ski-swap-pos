"""add_sale_edit_table

Revision ID: f1a2b3c4d5e6
Revises: e8f9a0b1c2d3
Create Date: 2026-10-25

Adds the append-only `sale_edit` audit table backing true transaction editing
(cashiers edit their own sales, admins any): one row per line add/update/
remove or payment/info change. `sale_item_id` is a plain integer (sale lines
are hard-deleted; the `before` snapshot preserves them), `before`/`after` are
JSON snapshots. Purely additive — no existing table is touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e8f9a0b1c2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sale_edit',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('sale_id', sa.Integer(), sa.ForeignKey('sale.id'), nullable=False),
        sa.Column('sale_item_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('before', sa.JSON(), nullable=True),
        sa.Column('after', sa.JSON(), nullable=True),
        sa.Column('edited_by', sa.String(), nullable=False),
        sa.Column('edited_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_sale_edit_id', 'sale_edit', ['id'])
    op.create_index('ix_sale_edit_sale_id', 'sale_edit', ['sale_id'])


def downgrade() -> None:
    op.drop_index('ix_sale_edit_sale_id', table_name='sale_edit')
    op.drop_index('ix_sale_edit_id', table_name='sale_edit')
    op.drop_table('sale_edit')