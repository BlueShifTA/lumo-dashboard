from fastapi import APIRouter, HTTPException, Query

from app_template.domain.models import Item, ItemCreate
from app_template.services.items import ItemService

router = APIRouter(tags=["items"])

# In-memory service instance (replace with dependency injection for production)
_service = ItemService()


@router.get("/items", response_model=list[Item])
def list_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
) -> list[Item]:
    """List all items with pagination."""
    return _service.list_items(skip=skip, limit=limit)


@router.get("/items/{item_id}", response_model=Item)
def get_item(item_id: int) -> Item:
    """Get a specific item by ID."""
    item = _service.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("/items", response_model=Item, status_code=201)
def create_item(item: ItemCreate) -> Item:
    """Create a new item."""
    return _service.create_item(item)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int) -> None:
    """Delete an item."""
    if not _service.delete_item(item_id):
        raise HTTPException(status_code=404, detail="Item not found")
