"""relax_seller_name_nullable

Revision ID: a1b2c3d4e5f6
Revises: c33c29d690e7
Create Date: 2026-08-17 19:00:00

Vendors (is_vendor=True) are businesses, not individuals, and may omit
first/last name. The NOT NULL constraint on seller.first_name and
seller.last_name is dropped so vendors can be stored without a person name.
The individual-vs-vendor name requirement is enforced at the API/schema layer
(SellerCreate validators) instead of the database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'c33c29d690e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('seller', schema=None) as batch_op:
        batch_op.alter_column('first_name', existing_type=sa.String(), nullable=True)
        batch_op.alter_column('last_name', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('seller', schema=None) as batch_op:
        batch_op.alter_column('first_name', existing_type=sa.String(), nullable=False)
        batch_op.alter_column('last_name', existing_type=sa.String(), nullable=False)