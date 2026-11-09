# Grocery Sale Optimizer (MVP)

Enter a Canadian postal code and a shopping list. The app reads this week's grocery flyers for nearby stores,
converts every price to a comparable unit price, and shows:

- the **cheapest single store** for the whole list, and
- the **cheapest two-store split**, with how much it saves (or costs) compared with one store.

Flyers are mocked as JSON files for the MVP; there is no crawler, database, account system or payment.

## Quick start

Requires Node.js 22.12 or newer.

```bash
npm install
```

```bash
DEMO_AS_OF=2026-11-09 npm run dev
```

Open http://localhost:3000 and click **Try a sample list**. `DEMO_AS_OF` keeps the bundled mock flyers
(week of 2026-11-05 to 2026-11-11) active after that week has passed; see [Flyer date](#flyer-date-demo_as_of).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` then `npm start` | Production build and server |
| `npm test` | Unit and API tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright) on the production build, desktop and phone |
| `npm run typecheck` | TypeScript checks |

Before the first `npm run e2e` on a new machine, install the browser:

```bash
npx playwright install chromium
```

`npm run e2e` builds the app, starts it on port 3100 with `DEMO_AS_OF=2026-11-09`, and runs `e2e/*.spec.ts`.
Outside CI it reuses a server already running on that port, so stop any old one after changing code.

## How a plan is calculated

1. **Stores.** The postal code's first three characters (its forward sortation area, e.g. `M5V`) select the
   stores that serve it.
2. **Flyers.** Only flyers whose week includes the plan date are used. Listings that fail validation are
   rejected and logged; one bad listing never drops a whole flyer.
3. **Units.** Every catalog item is measured in exactly one way: mass (compared in $/kg), volume ($/L) or count
   ($/each). g, kg, lb and oz convert to grams; mL and L to millilitres; dozen to 12 each. Volume and mass are
   never converted into each other, and fluid ounces are rejected (US and Imperial differ).
4. **Dietary needs.** For each selected restriction, a listing is:
   - **excluded** if the listing says it contains a conflicting ingredient;
   - **ok** if it is labelled for the restriction (vegan also counts as vegetarian and dairy-free);
   - **excluded** if the catalog item normally contains a conflicting ingredient (e.g. chicken for vegetarian);
   - otherwise **unverified**: still used, and marked in the results.
5. **Cost per item per store.** Packs are bought whole and pack sizes may be mixed (a 4 L jug plus a 1 L carton).
   Multi-buy deals ("3 for $4.00") are used whenever they are cheapest, even if that buys extra. Items sold by
   weight can top up a pack. Ties go to fewer unverified packs, then fewer packs, then less over-buying.
6. **Plans.** The best single store and the best genuine two-store split are ranked: complete plans first,
   then more items covered, lower total, fewer unverified items, fewer packs, and store name. The two-store
   saving is only shown when both plans cover the same items.

All money is handled in whole cents.

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
- `unit` is one of `g`, `kg`, `lb`, `oz`, `mL`, `L`, `each`, `dozen`, and must match the item's type.
- Limits: 50 items per list; 25 kg, 25 L or 200 each per item (repeated items are added together).
- `asOf` is optional. It picks which weekly flyers are active.

Responses:

| Status | Body |
| --- | --- |
| `200` | `bestSingle`, `bestPair`, `pairSavingsCents`, `warnings`, the `listings` used, `stores`, `area`, `asOf` |
| `400` | `{ error: "INVALID_JSON" \| "INVALID_REQUEST", issues: [{ code?, path?, itemIndex?, message }] }` |
| `500` | `{ error: "INTERNAL_ERROR", message }` (details are logged on the server only) |

An area with no stores returns `200` with a "No stores in our coverage area yet" warning.

## Flyer date (`DEMO_AS_OF`)

Flyers are only used during their week. The date is chosen in this order:

1. the request's `asOf`;
2. the `DEMO_AS_OF` environment variable (`YYYY-MM-DD`; an invalid value is ignored with a warning);
3. today's date in Toronto.

## Data

All data lives in `data/` and is read at request time, so edits show up without a rebuild.

| File | Contents |
| --- | --- |
| `data/catalog.json` | Catalog items: `id`, `name`, `dimension` (`mass` / `volume` / `count`), `displayUnit` (`kg` / `L` / `each`, matching the dimension), `inherentContains` |
| `data/stores.json` | Stores: `id`, `name`, `address`, `fsas` (postal areas served, e.g. `["M5V"]`) |
| `data/flyers/<storeId>.json` | One weekly flyer per store |

A flyer:

```json
{
  "storeId": "maple-basket",
  "validFrom": "2026-11-05",
  "validTo": "2026-11-11",
  "listings": [
    {
      "id": "mb-beans-black-canned",
      "catalogItemId": "beans-black-canned",
      "title": "Black Beans 540 mL",
      "pricing": { "kind": "pack", "priceCents": 149, "size": 540, "unit": "mL" },
      "multiBuy": { "quantity": 3, "totalCents": 400 },
      "tags": ["vegan"]
    },
    {
      "id": "mb-apples-gala",
      "catalogItemId": "apples-gala",
      "title": "Gala Apples",
      "pricing": { "kind": "per_unit", "priceCents": 149, "unit": "lb" },
      "regularPriceCents": 199
    }
  ]
}
```

- `pricing.kind` is `pack` (a fixed package with `size` and `unit`) or `per_unit` (sold by weight or count).
- `priceCents` is always the price of one pack, or of one `unit`, bought on its own.
- Optional: `brand`, `regularPriceCents` (not below the sale price), `multiBuy` (packs only, `quantity` ≥ 2),
  `tags` (dietary labels) and `contains` (`meat`, `pork`, `poultry`, `fish`, `shellfish`, `dairy`, `eggs`,
  `honey`, `gluten`, `nuts`, `alcohol`).
- Unknown keys, fractional cents, missing sizes, unknown catalog items and the wrong unit type are rejected.

The bundled data has 49 catalog items, 5 fictional Toronto stores and one flyer per store. Every postal area
(`M5V`, `M5J`, `M6K`, `M6J`, `M5T`) is served by at least two stores.

## Project layout

```
app/                 Next.js pages and the /api/plan route
components/          Planner form, results, display formatting
lib/engine/          Pure TypeScript engine (no file access)
  units.ts             unit conversion          dietary.ts    dietary filtering
  schemas.ts           data validation (Zod)    itemCost.ts   cheapest packs per item and store
  ingest.ts            flyer → normalized       optimizer.ts  single vs two-store plans
  postal.ts, money.ts  helpers                  index.ts      planShopping() entry point
lib/data/            Loading data/ from disk and choosing the plan date
data/                Mock catalog, stores and flyers
tests/               Vitest tests
e2e/                 Playwright browser tests
```

## Known limitations

- **Mock data only.** No crawler; flyers are hand-made JSON for one week.
- **Coverage by postal area only.** No distances, maps or travel cost. Two-store plans are always shown;
  the user decides whether the saving is worth the extra stop.
- **Only flyer prices are used.** An item not in a store's flyer counts as unavailable there.
- **One item, one store.** Within a two-store plan, each item is bought entirely at one store.
- **Rates like "$0.99 per 100 g"** cannot be expressed yet (per-unit prices are per one unit).
- **Prices sold by the pound** are stored per kg, rounded up to the cent (at most a fraction of a cent per kg).
- **Halal and kosher** are basic: meat without a label is "unverified", and kosher meat/dairy mixing is not modelled.
- **No saved lists.** Refreshing the page clears the list.
- **Browser tests run separately** (`npm run e2e`), not as part of `npm test`.
- **Self-contained (`standalone`) Next.js builds** would need `data/` added to the output explicitly.
