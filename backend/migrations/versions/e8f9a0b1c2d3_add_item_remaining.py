"""add_item_remaining

Revision ID: e8f9a0b1c2d3
Revises: d4e5f6a7b8c9
Create Date: 2026-08-30 13:00:00

Splits the item quantity model into two accurate attributes:

1. ``item.remaining`` (NEW) — on-hand sellable units: decremented by the
   quantity sold at checkout, restored on sale void.
2. ``item.quantity`` now keeps its ORIGINAL intake quantity. Under the old
   model ``quantity`` was decremented on sale, losing what the seller had
   originally entered. The backfill reconstructs it:

       sold     = SUM(non-voided sale_item.quantity) for the item
       quantity = stored_quantity + sold      (original intake quantity)
       remaining = quantity - sold            (on-hand units)

For never-sold items (sold = 0) both numbers are unchanged. For partially/fully
sold items the intake quantity is reconstructed and remaining matches what the
old stored quantity held.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e8f9a0b1c2d3'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('item', schema=None) as batch_op:
        batch_op.add_column(sa.Column('remaining', sa.Float(), nullable=False,
                                      server_default='1.0'))

    # Pass 1: reconstruct the original intake quantity. Legacy rows had quantity
    # decremented by every non-voided sale; adding the non-voided sold units back
    # recovers what the seller entered at intake.
    op.execute("""
        UPDATE item SET quantity = quantity + COALESCE((
            SELECT SUM(si.quantity)
            FROM sale_item si JOIN sale s ON si.sale_id = s.id
            WHERE si.item_id = item.id AND s.is_voided = 0
        ), 0)
    """)

    # Pass 2: remaining = intake quantity − non-voided sold units.
    op.execute("""
        UPDATE item SET remaining = quantity - COALESCE((
            SELECT SUM(si.quantity)
            FROM sale_item si JOIN sale s ON si.sale_id = s.id
            WHERE si.item_id = item.id AND s.is_voided = 0
        ), 0)
    """)


def downgrade() -> None:
    with op.batch_alter_table('item', schema=None) as batch_op:
        batch_op.drop_column('remaining')