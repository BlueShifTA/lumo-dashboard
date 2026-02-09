from pydantic import BaseModel, Field


class ItemBase(BaseModel):
    """Base schema for Item."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class ItemCreate(ItemBase):
    """Schema for creating an Item."""

    pass


class Item(ItemBase):
    """Schema for Item response."""

    id: int

    class Config:
        from_attributes = True
