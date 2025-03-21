from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Index
from sqlmodel import Field, Relationship, SQLModel


class CommentMention(SQLModel, table=True):
    """
    Model for storing user mentions in comments.
    """
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: str = Field(foreign_key="tenant.id", nullable=False)
    comment_id: UUID = Field(foreign_key="alertaudit.id", nullable=False)
    user_id: str = Field(nullable=False)  # Email of the mentioned user
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    
    # Define relationships if needed
    # comment: AlertAudit = Relationship(back_populates="mentions")
    
    __table_args__ = (
        Index("ix_comment_mention_tenant_id", "tenant_id"),
        Index("ix_comment_mention_comment_id", "comment_id"),
        Index("ix_comment_mention_user_id", "user_id"),
        Index("ix_comment_mention_tenant_user", "tenant_id", "user_id"),
    )
    
    class Config:
        arbitrary_types_allowed = True