/**
 * Khmer TopUp reseller API — auto game delivery
 * Docs: https://khmer-topup.com/api-docs
 * Env: KHMER_TOPUP_API_KEY, KHMER_TOPUP_URL
 */
const BASE = (process.env.KHMER_TOPUP_URL || "https://khmer-topup.com/api/v1").replace(/\/$/, "");

function key() {
  return String(process.env.KHMER_TOPUP_API_KEY || "").trim();
}

export function isTopupReady() {
  return key().length >= 8;
}

async function api(path, opts = {}) {
  if (!isTopupReady()) {
    const err = new Error("KHMER_TOPUP_API_KEY not set");
    err.code = "not_configured";
    throw err;
  }
  const headers = {
    Authorization: `Bearer ${key()}`,
    "X-API-Key": key(),
    Accept: "application/json",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers || {}),
  };
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    signal: AbortSignal.timeout(String(opts.method || "GET").toUpperCase() === "POST" ? 30000 : 12000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || data.message || `HTTP ${r.status}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** List games / packages from supplier (shape varies by API version). */
export async function listGames() {
  try {
    const data = await api("/games");
    return Array.isArray(data) ? data : data.games || data.data || [];
  } catch (e) {
    console.warn("[khmer-topup] listGames", e.message);
    return [];
  }
}

export async function listPackages(gameId) {
  try {
    const data = await api(`/games/${encodeURIComponent(gameId)}/packages`);
    return Array.isArray(data) ? data : data.packages || data.data || [];
  } catch (e) {
    console.warn("[khmer-topup] listPackages", e.message);
    return [];
  }
}

/**
 * Place top-up order after payment confirmed.
 * @param {{ packageId, userId, zoneId?, server?, quantity? }}
 */
export async function createTopupOrder(payload) {
  const body = {
    package_id: payload.packageId,
    user_id: String(payload.userId || "").trim(),
    quantity: Math.max(1, Number(payload.quantity) || 1),
  };
  if (payload.zoneId) body.zone_id = String(payload.zoneId);
  if (payload.server) body.server = String(payload.server);

  // common endpoints used by reseller panels
  const paths = ["/orders", "/order", "/topup"];
  let lastErr;
  for (const path of paths) {
    try {
      const data = await api(path, { method: "POST", body: JSON.stringify(body) });
      return { ok: true, data };
    } catch (e) {
      lastErr = e;
      if (e.status && e.status !== 404) break;
    }
  }
  return {
    ok: false,
    error: lastErr?.message || "topup_failed",
    data: lastErr?.data,
  };
}

export async function getOrderStatus(code) {
  try {
    const data = await api(`/orders/${encodeURIComponent(code)}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
