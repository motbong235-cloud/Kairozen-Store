import { useState } from "react";
import { getOrder } from "../lib/api.js";

export default function TrackPage() {
  const [q, setQ] = useState("");
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState("");

  async function search() {
    setErr("");
    setOrder(null);
    if (!q.trim()) return;
    const { ok, data } = await getOrder(q.trim());
    if (!ok || !data.order) {
      setErr("Order not found");
      return;
    }
    setOrder(data.order);
  }

  return (
    <section className="sec">
      <div className="wrap" style={{ maxWidth: 480 }}>
        <div className="page-hero">
          <h1>Track order</h1>
          <p>Enter Order ID (e.g. KZ…)</p>
        </div>
        <div className="card">
          <div className="field">
            <label>Order ID</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="KZ…" />
          </div>
          <button className="btn btn-p" type="button" style={{ width: "100%" }} onClick={search}>
            Search
          </button>
          {err && <p style={{ color: "#e11d48", marginTop: 12 }}>{err}</p>}
          {order && (
            <div style={{ marginTop: 16, fontSize: ".95rem" }}>
              <p>
                <strong>{order.id}</strong> · {order.status}
              </p>
              <p>
                {order.gameName} — {order.packName}
              </p>
              <p>${Number(order.total).toFixed(2)} · {order.userId}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
