export async function getCatalog() {
  const r = await fetch("/api/catalog");
  if (!r.ok) throw new Error("catalog_failed");
  return r.json();
}
export async function createCheckout(body) {
  const r = await fetch("/api/checkout/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}
export async function getOrder(id) {
  const r = await fetch("/api/orders/" + encodeURIComponent(id));
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}
