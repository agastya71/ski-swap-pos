"""sale_datetime_and_cc_txn

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-17 20:30:00

Two changes to the `sale` table:
1. `date_of_sale` migrates from Date to DateTime so each transaction carries a
   full timestamp (Q18). Existing date-only values are retained (read back at
   midnight).
2. Adds `cc_transaction_id` to record the Square transaction id (or other card
   reference) when payment is by card (Q15). `check_number` already exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('sale', schema=None) as batch_op:
        batch_op.alter_column('date_of_sale', existing_type=sa.Date(), type_=sa.DateTime(), nullable=True)
        batch_op.add_column(sa.Column('cc_transaction_id', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('sale', schema=None) as batch_op:
        batch_op.drop_column('cc_transaction_id')
        batch_op.alter_column('date_of_sale', existing_type=sa.DateTime(), type_=sa.Date(), nullable=True)