# Kairozen Store (React pages)

Multi-page React app (React Router) + Express + RielPay + Khmer TopUp.

## Pages

| Path | Page |
|------|------|
| `/` | Home |
| `/games` | All games |
| `/topup` | Top-up checkout |
| `/topup/:gameId` | Top-up for one game |
| `/faq` | FAQ |
| `/track` | Track order |

## Deploy (Render)

```
build: npm install && npm run build
start: npm start
```

Env: `RIELPAY_API_KEY`, `KHMER_TOPUP_API_KEY`, `ADMIN_PASSWORD`, `DATA_DIR=/var/data`
