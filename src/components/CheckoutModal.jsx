import { useEffect, useState } from "react";
import { createCheckout, getOrder } from "../lib/api.js";

export default function CheckoutModal({ game, onClose, onToast }) {
  const [pack, setPack] = useState(game?.packs?.[0] || null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("form"); // form | qr
  const [payment, setPayment] = useState(null);
  const [order, setOrder] = useState(null);
  const [statusText, setStatusText] = useState("រង់ចាំការបង់លុយ…");
  const [paidOk, setPaidOk] = useState(false);

  useEffect(() => {
    setPack(game?.packs?.[0] || null);
    setPhase("form");
    setPayment(null);
    setOrder(null);
    setPaidOk(false);
    setUserId("");
  }, [game]);

  useEffect(() => {
    if (!order?.id || phase !== "qr") return undefined;
    const t = setInterval(async () => {
      const { ok, data } = await getOrder(order.id);
      if (!ok) return;
      const st = data.order?.status;
      if (st && st !== "pending") {
        setPaidOk(true);
        setStatusText("✓ Payment confirmed · " + st);
        onToast?.("បង់ជោគជ័យ · " + st);
        clearInterval(t);
      }
    }, 4000);
    return () => clearInterval(t);
  }, [order?.id, phase, onToast]);

  if (!game) return null;

  async function payNow() {
    if (userId.trim().length < 3) {
      onToast?.("សូមបញ្ចូល Game ID / Username");
      return;
    }
    if (!pack) return;
    setLoading(true);
    try {
      const { ok, data } = await createCheckout({
        gameId: game.id,
        packId: pack.id,
        userId: userId.trim(),
        qty: 1,
      });
      if (!ok) {
        onToast?.(data.detail || data.error || "QR failed");
        setLoading(false);
        return;
      }
      setOrder(data.order);
      setPayment(data.payment);
      setPhase("qr");
      setStatusText("រង់ចាំការបង់លុយ…");
      setPaidOk(false);

      const aba = data.payment?.openAbaUrl || data.payment?.deeplink || "";
      if (aba && /^https?:\/\//i.test(aba)) {
        try {
          window.location.href = aba;
        } catch {}
      }
    } catch {
      onToast?.("Network error");
    }
    setLoading(false);
  }

  return (
    <div
      className="mbg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        {phase === "form" && (
          <div className="modal-pad">
            <h3>{game.name}</h3>
            <p className="sub">ជ្រើសកញ្ចប់ · បញ្ចូល ID · បង់ ABA KHQR</p>
            <div className="packs">
              {(game.packs || []).map((p) => (
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
                autoComplete="off"
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
            <button
              className="btn btn-g"
              style={{ width: "100%", marginTop: 8 }}
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}

        {phase === "qr" && (
          <>
            <div className="khqr-head">ABA KHQR · Scan to pay</div>
            <div className="khqr-body">
              <div className="amt">
                ${Number(order?.total || 0).toFixed(2)}
              </div>
              {payment?.qrImage && (
                <div className="khqr-qr">
                  <img src={payment.qrImage} alt="KHQR" />
                </div>
              )}
              <div className="khqr-timer">
                Order <strong>{order?.id}</strong>
              </div>
              <div className={"khqr-timer" + (paidOk ? " ok" : "")}>
                {statusText}
              </div>
              <button
                className="btn btn-g"
                style={{ width: "100%" }}
                type="button"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
