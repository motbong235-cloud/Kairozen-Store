import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

import * as rielPay from "./rielPay.js";
import * as khmerTopup from "./khmerTopup.js";
import * as store from "./store.js";
import { publicCatalog, findPack } from "./catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "kairozen-admin-change-me").trim();

const app = express();
app.set("trust proxy", 1);

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      if (String(req.url || "").startsWith("/api/webhook/")) req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

const limit = (name, opts) =>
  rateLimit({
    windowMs: opts.windowMs || 60_000,
    max: opts.limit || 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${req.ip}`,
  });

function clientIp(req) {
  return (
    (req.headers["cf-connecting-ip"] && String(req.headers["cf-connecting-ip"])) ||
    (req.headers["x-forwarded-for"] && String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
    req.ip ||
    ""
  );
}

function uniqueCode() {
  return "KZ" + crypto.randomBytes(5).toString("hex").toUpperCase();
}

function publicOrder(o) {
  if (!o) return null;
  return {
    id: o.id,
    gameId: o.gameId,
    gameName: o.gameName,
    packId: o.packId,
    packName: o.packName,
    qty: o.qty,
    total: o.total,
    userId: o.userId,
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    qrImage: o.qrImage,
    qrString: o.qrString,
    payUrl: o.payUrl,
    deeplink: o.deeplink,
    openAbaUrl: o.openAbaUrl,
    expiresAt: o.expiresAt,
    transactionId: o.transactionId,
    note: o.note,
  };
}

/* ---------- Public API ---------- */
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    brand: "Kairozen Store",
    payment: rielPay.isReady(),
    topup: khmerTopup.isTopupReady(),
  });
});

app.get("/api/catalog", (_req, res) => {
  res.json({ games: publicCatalog() });
});

app.post("/api/checkout/create", limit("checkout", { limit: 10 }), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.gameId || !body.packId) {
      return res.status(400).json({ error: "invalid", detail: "need gameId + packId" });
    }
    if (!rielPay.isReady()) {
      return res.status(503).json({
        error: "not_configured",
        detail: "Set RIELPAY_API_KEY on Render",
      });
    }

    const found = findPack(body.gameId, body.packId);
    if (!found) return res.status(400).json({ error: "pack_unavailable" });

    const userId = String(body.userId || "").trim();
    if (userId.length < 3) {
      return res.status(400).json({ error: "invalid", detail: "need_username" });
    }

    const qty = Math.min(10, Math.max(1, Math.floor(Number(body.qty)) || 1));
    const total = Math.round(found.pack.price * qty * 100) / 100;

    const order = store.createOrder({
      id: uniqueCode(),
      gameId: found.game.id,
      gameName: found.game.name,
      packId: found.pack.id,
      packName: found.pack.name,
      qty,
      total,
      userId,
      zoneId: String(body.zoneId || "").trim(),
      server: String(body.server || "").trim(),
      status: "pending",
      clientIp: clientIp(req),
      createdAt: Date.now(),
    });

    const qr = await rielPay.createPayment(
      order.total,
      order.id,
      `${order.gameName} ${order.packName}`.trim()
    );

    if (!qr.success) {
      store.updateOrder(order.id, { status: "failed", note: `QR: ${qr.error}` });
      return res.status(502).json({ error: "qr_failed", detail: qr.error });
    }

    const expiresAt = qr.expires_at || Date.now() + 60 * 60 * 1000;
    const updated = store.updateOrder(order.id, {
      transactionId: qr.transaction_id,
      qrImage: qr.qr_image,
      qrString: qr.qr_string,
      payUrl: qr.pay_url || "",
      deeplink: qr.deeplink || "",
      openAbaUrl: qr.open_aba_url || qr.deeplink || "",
      expiresAt,
    });

    // Auto-open ABA when deeplink present (KonpKay-style UX)
    res.json({
      order: publicOrder(updated),
      payment: {
        transactionId: updated.transactionId,
        qrImage: updated.qrImage,
        qrString: updated.qrString,
        payUrl: updated.payUrl,
        deeplink: updated.deeplink,
        openAbaUrl: updated.openAbaUrl,
        expiresAt: updated.expiresAt,
      },
    });
  } catch (e) {
    console.error("[checkout]", e);
    res.status(500).json({ error: "server_error" });
  }
});

async function tryConfirmPayment(order) {
  if (!order || order.status !== "pending" || !order.transactionId) return order;
  const pay = await rielPay.checkPayment(order.transactionId);
  if (!pay.paid) return order;

  let updated = store.updateOrder(order.id, {
    status: "paid",
    paidAt: Date.now(),
    providerPaid: true,
    payStatusRaw: pay.status,
  });

  // Auto top-up via Khmer TopUp when configured
  if (khmerTopup.isTopupReady()) {
    const top = await khmerTopup.createTopupOrder({
      packageId: updated.packId,
      userId: updated.userId,
      zoneId: updated.zoneId,
      server: updated.server,
      quantity: updated.qty,
    });
    if (top.ok) {
      updated = store.updateOrder(updated.id, {
        status: "delivered",
        supplierRef: top.data?.id || top.data?.order_id || null,
        note: "auto topup ok",
      });
    } else {
      updated = store.updateOrder(updated.id, {
        status: "processing",
        note: `paid — topup pending: ${top.error || ""}`,
        needsManual: true,
      });
    }
  } else {
    updated = store.updateOrder(updated.id, {
      status: "processing",
      note: "paid — fulfill manually (no KHMER_TOPUP_API_KEY)",
      needsManual: true,
    });
  }
  return updated;
}

app.get("/api/orders/:id", async (req, res) => {
  let order = store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "not_found" });
  order = await tryConfirmPayment(order);
  res.json({ order: publicOrder(order) });
});

app.post("/api/webhook/rielpay", async (req, res) => {
  try {
    if (rielPay.webhookSecret()) {
      const sig = req.get("X-Webhook-Signature") || req.get("x-webhook-signature") || "";
      const v = rielPay.verifyWebhookSignature(req.rawBody || "", sig);
      if (!v.ok) {
        console.warn("[webhook] bad signature", v.error);
        return res.status(401).json({ ok: false });
      }
    }
    const data = req.body?.data || req.body || {};
    const status = String(data.status || data.payment_status || "").toLowerCase();
    const payId = String(data.id || data.payment_id || data.transaction_id || "");
    const orderId = String(data.metadata?.order_id || data.order_id || "");
    let order = orderId ? store.getOrder(orderId) : null;
    if (!order && payId) {
      order = store.listOrders().find((o) => o.transactionId === payId) || null;
    }
    if (!order) {
      console.warn("[webhook] order not found", payId, orderId);
      return res.json({ ok: true, skipped: true });
    }
    if (["paid", "succeeded", "success", "completed"].includes(status) || data.paid) {
      await tryConfirmPayment({ ...order, status: "pending" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[webhook]", e.message);
    res.status(500).json({ ok: false });
  }
});

/* ---------- Admin (token cookie) ---------- */
const sessions = new Map();

function adminAuth(req, res, next) {
  const token = req.cookies?.kz_admin || "";
  if (!token || !sessions.has(token)) return res.status(401).json({ error: "unauthorized" });
  next();
}

app.post("/api/admin/login", limit("login", { limit: 15 }), (req, res) => {
  const password = String(req.body?.password || "").trim();
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "bad_password" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + 7 * 24 * 3600 * 1000);
  res.cookie("kz_admin", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 3600 * 1000,
    path: "/",
  });
  res.json({ ok: true });
});

app.get("/api/admin/orders", adminAuth, (_req, res) => {
  res.json({
    orders: store.listOrders().slice(0, 200).map(publicOrder),
  });
});

app.post("/api/admin/orders/:id/done", adminAuth, (req, res) => {
  const o = store.updateOrder(req.params.id, { status: "delivered", note: "admin done" });
  if (!o) return res.status(404).json({ error: "not_found" });
  res.json({ order: publicOrder(o) });
});

/* ---------- Static: Vite dist + SPA fallback ---------- */
app.use(express.static(path.join(ROOT, "dist"), { maxAge: "1h" }));
app.use(express.static(path.join(ROOT, "public"), { maxAge: "1h" }));
app.get("*", (req, res, next) => {
  if (String(req.path || "").startsWith("/api")) return next();
  res.sendFile(path.join(ROOT, "dist", "index.html"), (err) => {
    if (err) res.status(404).send("Run npm run build");
  });
});

// Background reconcile
setInterval(async () => {
  const pending = store.listOrders().filter((o) => o.status === "pending" && o.transactionId).slice(0, 30);
  for (const o of pending) {
    try {
      await tryConfirmPayment(o);
    } catch (e) {
      console.warn("[reconcile]", o.id, e.message);
    }
  }
}, 25_000).unref?.();

app.listen(PORT, () => {
  console.log(`Kairozen Store on :${PORT}`);
  console.log(`  RielPay: ${rielPay.isReady() ? "ready" : "MISSING RIELPAY_API_KEY"}`);
  console.log(`  Khmer TopUp: ${khmerTopup.isTopupReady() ? "ready" : "optional"}`);
});
