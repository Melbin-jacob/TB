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

## Status

Built incrementally; see the implementation plan. Currently: project scaffold only.
