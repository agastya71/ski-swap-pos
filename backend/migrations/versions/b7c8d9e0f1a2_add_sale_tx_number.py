"""add sale.transaction_number (event feedback #12)

Transaction ID assigned when the sale starts: a per-event sequential
display number stamped on the Sale row. Existing (already-finalized)
rows are backfilled with their row id — every historical sale keeps the
number the UI has always shown it ("Sale #N"). New reservations continue
past the highest backfilled value, and voided IDs are never reused (the
sequence only ever advances; a voided/cancelled reservation keeps its
number retired).

The column stays NULLABLE with no ORM/server default: the number is
allocated by the two product paths only (POST /sales/reserve and
checkout), and a sale row created by any other path with no number (e.g.
service scripts, older tools) simply has none. The unique index treats
NULLs as distinct, so such rows never collide.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = '580b4b3489d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('sale', schema=None) as batch_op:
        batch_op.add_column(sa.Column('transaction_number', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('is_finalized', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.create_unique_constraint(
            'uq_sale_event_transaction_number', ['event_id', 'transaction_number']
        )

    conn = op.get_bind()
    conn.execute(sa.text(
        'UPDATE sale SET transaction_number = id WHERE transaction_number IS NULL'
    ))

    # NOT nullable=False: the number is never handed out twice per event
    # (unique index), but a row created outside the reserve/checkout paths
    # may legitimately carry no number; NULLs are distinct in the index.


def downgrade() -> None:
    with op.batch_alter_table('sale', schema=None) as batch_op:
        batch_op.drop_constraint('uq_sale_event_transaction_number', type_='unique')
        batch_op.drop_column('is_finalized')
        batch_op.drop_column('transaction_number')
