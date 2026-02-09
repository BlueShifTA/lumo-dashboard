from app_template.domain.models import Item, ItemCreate


class ItemService:
    """Service for managing items (in-memory storage for demo)."""

    def __init__(self) -> None:
        self._items: dict[int, Item] = {}
        self._counter = 0

    def list_items(self, skip: int = 0, limit: int = 10) -> list[Item]:
        """List items with pagination."""
        items = list(self._items.values())
        return items[skip : skip + limit]

    def get_item(self, item_id: int) -> Item | None:
        """Get an item by ID."""
        return self._items.get(item_id)

    def create_item(self, item: ItemCreate) -> Item:
        """Create a new item."""
        self._counter += 1
        new_item = Item(id=self._counter, **item.model_dump())
        self._items[new_item.id] = new_item
        return new_item

    def delete_item(self, item_id: int) -> bool:
        """Delete an item. Returns True if deleted, False if not found."""
        if item_id in self._items:
            del self._items[item_id]
            return True
        return False
