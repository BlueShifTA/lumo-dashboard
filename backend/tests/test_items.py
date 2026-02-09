from fastapi.testclient import TestClient

from app_template.main import app

client = TestClient(app)


def test_create_item() -> None:
    response = client.post("/api/items", json={"name": "Test Item", "description": "A test"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Item"
    assert data["description"] == "A test"
    assert "id" in data


def test_list_items() -> None:
    # Create an item first
    client.post("/api/items", json={"name": "List Test"})
    
    response = client.get("/api/items")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_item() -> None:
    # Create an item
    create_response = client.post("/api/items", json={"name": "Get Test"})
    item_id = create_response.json()["id"]
    
    response = client.get(f"/api/items/{item_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Get Test"


def test_get_item_not_found() -> None:
    response = client.get("/api/items/99999")
    assert response.status_code == 404


def test_delete_item() -> None:
    # Create an item
    create_response = client.post("/api/items", json={"name": "Delete Test"})
    item_id = create_response.json()["id"]
    
    # Delete it
    response = client.delete(f"/api/items/{item_id}")
    assert response.status_code == 204
    
    # Verify it's gone
    get_response = client.get(f"/api/items/{item_id}")
    assert get_response.status_code == 404


def test_delete_item_not_found() -> None:
    response = client.delete("/api/items/99999")
    assert response.status_code == 404
