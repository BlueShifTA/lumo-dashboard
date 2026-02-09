"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export default function Home() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);

  const fetchItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/items`);
      const data = await res.json();
      setItems(data);
    } catch (err) {
      console.error("Failed to fetch items:", err);
    }
  };

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      setHealth(data.status);
    } catch {
      setHealth("error");
    }
  };

  useEffect(() => {
    checkHealth();
    fetchItems();
  }, []);

  const createItem = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      setName("");
      setDescription("");
      fetchItems();
    } catch (err) {
      console.error("Failed to create item:", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id) => {
    try {
      await fetch(`${API_BASE}/api/items/${id}`, { method: "DELETE" });
      fetchItems();
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  return (
    <main className="container">
      <header>
        <h1>App Template</h1>
        <span className={`status ${health === "ok" ? "ok" : "error"}`}>
          API: {health || "checking..."}
        </span>
      </header>

      <section className="card">
        <h2>Create Item</h2>
        <form onSubmit={createItem}>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Items ({items.length})</h2>
        {items.length === 0 ? (
          <p className="empty">No items yet</p>
        ) : (
          <ul className="item-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  {item.description && <p>{item.description}</p>}
                </div>
                <button onClick={() => deleteItem(item.id)} className="delete">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
