from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("event.id"), nullable=False)
    username = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin / intake / cashier
    is_active = Column(Boolean, nullable=False, default=True)

    __table_args__ = (UniqueConstraint("event_id", "username", name="uq_user_event_username"),)

    event = relationship("Event", back_populates="users")
