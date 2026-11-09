# Grocery Sale Optimizer (MVP)

Crawls (for now: mocked) weekly grocery flyers for a Canadian postal code, normalizes unit prices,
and compares the cheapest **single-store** plan against the cheapest **two-store** plan for a shopping list.

## Stack

- Next.js (App Router) + TypeScript
- Zod for data validation
- Vitest for tests
- Mock data as JSON files under `data/` (no database)

## Getting started

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run typecheck  # TypeScript checks
npm run build      # production build
```

## API

`POST /api/plan`

```json
{
  "postalCode": "M5V 2T6",
  "restrictions": ["vegan"],
  "items": [{ "catalogItemId": "milk-oat", "quantity": 2, "unit": "L" }],
  "asOf": "2026-11-09"
}
```

- `restrictions` is optional: `vegan`, `vegetarian`, `gluten-free`, `dairy-free`, `nut-free`, `halal`, `kosher`.
- `unit` is one of `g`, `kg`, `lb`, `oz`, `mL`, `L`, `each`, `dozen`.
- `asOf` is optional. It picks which weekly flyers are active.

Responses:

- `200` returns `bestSingle`, `bestPair`, `pairSavingsCents`, `warnings`, the `listings` used, and the `asOf` date.
- `400` returns `{ error, issues[] }` for invalid JSON, a malformed body, or business-rule violations such as an unknown item, a wrong unit for the item, or more than 25 kg / 25 L / 200 each.

## Flyer date (`DEMO_AS_OF`)

Flyers are only used during their week. The date is chosen in this order:

1. the request's `asOf`;
2. the `DEMO_AS_OF` environment variable;
3. today's date in Toronto.

The mock flyers in `data/flyers/` cover 2026-11-05 to 2026-11-11. To keep the demo working after that week:

```bash
DEMO_AS_OF=2026-11-09 npm run dev
```

## Status

Built incrementally; see the implementation plan. Currently: engine, mock data and `POST /api/plan` (UI pending).
