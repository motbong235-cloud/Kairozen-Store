import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCheckout, getCatalog, getOrder } from "../lib/api.js";

export default function TopupPage() {
  const { gameId } = useParams();
  const nav = useNavigate();
  const [games, setGames] = useState([]);
  const [game, setGame] = useState(null);
  const [pack, setPack] = useState(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("form");
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null);
  const [statusText, setStatusText] = useState("រង់ចាំការបង់លុយ…");
  const [toast, setToast] = useState("");

  useEffect(() => {
    getCatalog().then((d) => {
      const list = d.games || [];
      setGames(list);
      const g = gameId ? list.find((x) => x.id === gameId) : list[0];
      setGame(g || null);
      setPack(g?.packs?.[0] || null);
    });
  }, [gameId]);

  useEffect(() => {
    if (!order?.id || phase !== "qr") return undefined;
    const t = setInterval(async () => {
      const { ok, data } = await getOrder(order.id);
      if (!ok) return;
      const st = data.order?.status;
      if (st && st !== "pending") {
        setStatusText("✓ Payment confirmed · " + st);
        setToast("បង់ជោគជ័យ");
        clearInterval(t);
      }
    }, 4000);
    return () => clearInterval(t);
  }, [order?.id, phase]);

  function pickGame(id) {
    nav("/topup/" + id);
  }

  async function payNow() {
    if (!game || !pack) return;
    if (userId.trim().length < 3) {
      setToast("សូមបញ្ចូល Game ID");
      return;
    }
    setLoading(true);
    const { ok, data } = await createCheckout({
      gameId: game.id,
      packId: pack.id,
      userId: userId.trim(),
      qty: 1,
    });
    setLoading(false);
    if (!ok) {
      setToast(data.detail || data.error || "QR failed");
      return;
    }
    setOrder(data.order);
    setPayment(data.payment);
    setPhase("qr");
    const aba = data.payment?.openAbaUrl || data.payment?.deeplink || "";
    if (aba && /^https?:\/\//i.test(aba)) {
      try {
        window.location.href = aba;
      } catch {}
    }
  }

  return (
    <section className="sec">
      <div className="wrap" style={{ maxWidth: 520 }}>
        <div className="page-hero">
          <h1>Top Up</h1>
          <p>Select game · pack · pay ABA KHQR</p>
        </div>

        {phase === "form" && (
          <div className="card">
            <div className="field">
              <label>Game</label>
              <select
                value={game?.id || ""}
                onChange={(e) => pickGame(e.target.value)}
              >
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="packs">
              {(game?.packs || []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={"pack" + (pack?.id === p.id ? " on" : "")}
                  onClick={() => setPack(p)}
                >
                  <strong>{p.name}</strong>
                  <span>${Number(p.price).toFixed(2)}</span>
                </button>
              ))}
            </div>

            <div className="field">
              <label>Game ID / Username</label>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your ID"
              />
            </div>

            <button
              className="btn btn-p"
              style={{ width: "100%" }}
              type="button"
              disabled={loading}
              onClick={payNow}
            >
              {loading ? "កំពុងបង្កើត QR…" : "Pay with ABA KHQR"}
            </button>
          </div>
        )}

        {phase === "qr" && (
          <div>
            <div className="khqr-head">ABA KHQR · Scan to pay</div>
            <div className="khqr-body">
              <div className="amt">${Number(order?.total || 0).toFixed(2)}</div>
              {payment?.qrImage && (
                <div className="khqr-qr">
                  <img src={payment.qrImage} alt="KHQR" />
                </div>
              )}
              <p>
                Order <strong>{order?.id}</strong>
              </p>
              <p className={statusText.startsWith("✓") ? "ok" : undefined}>
                {statusText}
              </p>
              <button
                className="btn btn-g"
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setPhase("form");
                  setOrder(null);
                  setPayment(null);
                }}
              >
                New order
              </button>
            </div>
          </div>
        )}
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </section>
  );
}
