# Grocer

Cross-shop local grocers: build a list, match items across stores, and optimize for price — including sales, coupons, and locally sourced preferences.

## Features (MVP)

- Grocery list builder with quantity and notes
- Approximate item matching across stores
- Single-store vs multi-store cart plans with a **savings threshold**
- Coupons, sales, and unit-price aware totals
- Prefer locally made / sourced items when enabled
- Hybrid catalog: seeded local stores + optional **Kroger Products API**
- REST API under `/api/*` shaped for a future mobile client

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Zod validation on API payloads
- In-memory list store for demo (swap for a DB later)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional: live Kroger prices

1. Register an app at [developer.kroger.com](https://developer.kroger.com/)
2. Copy `.env.example` to `.env.local` and set:

```env
KROGER_CLIENT_ID=...
KROGER_CLIENT_SECRET=...
KROGER_LOCATION_ID=...   # optional; discovered via zip if omitted
KROGER_ZIP=97209         # used to find a nearby location
```

Without credentials, the app runs fully on seeded demo data (Green Valley Market, Harbor Fresh, and a Kroger-shaped demo mirror).

## API overview

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/stores` | Nearby / seeded stores |
| `GET` | `/api/catalog?q=` | Search catalog (+ Kroger when configured) |
| `POST` | `/api/lists` | Create a grocery list |
| `GET` | `/api/lists/:id` | Fetch a list |
| `PATCH` | `/api/lists/:id` | Update list items / prefs |
| `POST` | `/api/lists/:id/match` | Match list lines to store offers |
| `POST` | `/api/lists/:id/optimize` | Build single- and multi-store plans |

### Optimize body

```json
{
  "savingsThresholdUsd": 8,
  "preferLocal": true,
  "storeIds": ["green-valley", "harbor-fresh", "kroger"]
}
```

Returns the cheapest single-store cart, a multi-store split plan, and whether multi-store is recommended given the threshold.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run qa          # lint + ticket tests + production build
```

## Tickets

New requests and features are GitHub Issues. Agents close them with a summary,
what changed, how problems were resolved, and QA verification.

- Open a ticket: [issue forms](https://github.com/jwolfe30/Grocer/issues/new/choose) or `scripts/new-ticket.sh feature "Title"`
- Workflow details: [docs/TICKET_WORKFLOW.md](docs/TICKET_WORKFLOW.md)
- Agent playbook: [AGENTS.md](AGENTS.md)
