# Kairozen Store (React + Vite)

KonpKay-inspired UI · **RielPay** KHQR · **Khmer TopUp** API · Render ready.

## Stack

- React 18 + Vite
- Express API (`server/`)
- `npm run build` → `dist/` served by Express

## Scripts

```bash
npm install
npm run dev          # Vite :5173 + API :3000
npm run build
npm start            # production (serves dist)
```

## Env (Render)

- `RIELPAY_API_KEY` (required)
- `RIELPAY_WEBHOOK_SECRET`
- `KHMER_TOPUP_API_KEY`
- `ADMIN_PASSWORD`
- `DATA_DIR=/var/data`

Webhook: `https://YOUR-APP.onrender.com/api/webhook/rielpay`

## Structure

```
src/           React UI
server/        Express + RielPay + Khmer TopUp
public/assets  banners
```
