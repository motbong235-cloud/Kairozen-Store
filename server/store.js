/**
 * Simple JSON file store (Render disk or /tmp).
 * For production scale, swap to Postgres / Redis.
 */
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const ORDERS = path.join(DATA_DIR, "orders.json");
const SETTINGS = path.join(DATA_DIR, "settings.json");

function ensure() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
  if (!fs.existsSync(ORDERS)) fs.writeFileSync(ORDERS, "[]");
  if (!fs.existsSync(SETTINGS)) fs.writeFileSync(SETTINGS, "{}");
}

function readJson(file, fallback) {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensure();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function listOrders() {
  return readJson(ORDERS, []);
}

export function getOrder(id) {
  return listOrders().find((o) => o.id === id) || null;
}

export function createOrder(order) {
  const all = listOrders();
  all.unshift(order);
  writeJson(ORDERS, all.slice(0, 5000));
  return order;
}

export function updateOrder(id, patch) {
  const all = listOrders();
  const i = all.findIndex((o) => o.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch, updatedAt: Date.now() };
  writeJson(ORDERS, all);
  return all[i];
}

export function getSettings() {
  return readJson(SETTINGS, {});
}

export function saveSettings(patch) {
  const cur = getSettings();
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  writeJson(SETTINGS, next);
  return next;
}
