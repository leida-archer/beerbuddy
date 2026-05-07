# Deal Detail Page + Maps Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use parallel-execution (recommended) or execute-plan to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every deal on `/deals` clickable, leading to a full-page detail view (`/deals/[id]`) that shows the deal, the store address, distance from the user's ZIP, and a single "Get directions →" button targeting Apple Maps for iOS/macOS and Google Maps elsewhere via server-side User-Agent detection.

**Architecture:** URL-driven, server-rendered. New pure module `src/lib/geo/maps.ts` builds platform-aware directions URLs. `Store` interface gains `address`/`lat`/`lon`; `ZIP_CITIES` becomes `ZIP_INFO` with centroid coords. `getDealById` (joined with full Store) and `pricePerOz` (extracted from `page.tsx`) move to `src/lib/deals.ts`. The detail page reuses the same ZIP gate as `/deals`. Whole `<DealCard>` becomes a `<Link>` on the list view; the detail page's back-link round-trips full filter state via `buildHref(state, {})`.

**Tech Stack:** Next.js 15 App Router server components · Tailwind CSS · Vitest · Bun · existing Golden Hour design tokens · existing `src/lib/geo/haversine.ts`.

**Spec:** [`docs/specs/2026-05-06-deal-detail-page-design.md`](../specs/2026-05-06-deal-detail-page-design.md)

---

## File Structure

| Path | Status | Responsibility |
|------|--------|---------------|
| `src/lib/geo/zip.ts` | **MODIFY** | Replace `ZIP_CITIES` with `ZIP_INFO` (richer record). Keep `cityForZip` (signature unchanged). Add `coordsForZip(zip): { lat, lon } \| null`. |
| `src/lib/geo/__tests__/zip.test.ts` | **MODIFY** | Add 2 `it()` blocks for `coordsForZip` (4 valid ZIPs in one block, 1 unknown in another). Existing 8 `it()` blocks keep passing. |
| `src/lib/geo/maps.ts` | **CREATE** | `MapsTarget` type, `targetForUserAgent(ua)`, `mapsHref(store, target)`. Pure TS, no React/Next imports. |
| `src/lib/geo/__tests__/maps.test.ts` | **CREATE** | 4 `it()` blocks covering UA detection (Apple side + Google side) and URL shape (Apple + Google). |
| `src/lib/deals.ts` | **MODIFY** | Extend `Store` with `address`/`lat`/`lon`. Add `DealWithStore`, `getDealById`, `pricePerOz` (extracted from `page.tsx`, unit changed cents/oz → dollars/oz). |
| `src/lib/__tests__/deals.test.ts` | **CREATE** | 4 `it()` blocks for `getDealById` + 4 `it()` blocks for `pricePerOz`. |
| `scripts/build-fixtures.ts` | **MODIFY** | Add `address`/`lat`/`lon` to each entry in `STORES` constant. |
| `src/data/fixtures/deals.json` | **REGENERATE** | Re-run `bun scripts/build-fixtures.ts` after editing `STORES`. |
| `src/app/deals/url.ts` | **MODIFY** | Add `buildDetailHref(state, dealId)` helper. |
| `src/app/deals/__tests__/url.test.ts` | **MODIFY** | Add 4 `it()` blocks for `buildDetailHref`. |
| `src/app/deals/page.tsx` | **MODIFY** | Remove the local `pricePerOz` (now imported from `@/lib/deals`). Wrap `<DealCard>` in `<Link href={buildDetailHref(state, deal.id)}>`. |
| `src/app/deals/[id]/page.tsx` | **CREATE** | Server component: ZIP gate, `getDealById` lookup, render layout, build maps href via UA detection. |

No new npm dependencies. No client JS. No server actions.

---

## Task ordering rationale

Six tasks in order. Each commit leaves the repo green (typecheck + tests + build pass).

1. **Task 1** (ZIP module) — additive: `ZIP_INFO` replaces `ZIP_CITIES`; `SUPPORTED_ZIPS` derived from its keys; `cityForZip` keeps working; new `coordsForZip` is unused so far.
2. **Task 2** (maps module) — fully isolated: no consumers yet.
3. **Task 3** (Store data extension) — extends the `Store` interface and the fixture data. Existing `getDeals` still works. `/deals` page renders identically (the new fields aren't read yet).
4. **Task 4** (`getDealById` + `pricePerOz` extraction) — extracts the helper from `page.tsx` to `lib/deals.ts`. Page still renders identically. New `getDealById` exists but is unused.
5. **Task 5** (detail page route) — creates `/deals/[id]/page.tsx`. The route exists but no list-view links point to it yet; reachable only via direct URL.
6. **Task 6** (clickable cards) — adds `buildDetailHref` and wraps `<DealCard>` in `<Link>`. The list view now navigates to the detail page that already exists.

Splitting Task 5 from Task 6 means each commit lands a single coherent thing — and after Task 5 the detail route can be smoke-tested via direct URL before any list-view changes ship.

---

## Task 1: Extend the ZIP module with centroid coords

**Files:**
- Modify: `src/lib/geo/zip.ts`
- Modify: `src/lib/geo/__tests__/zip.test.ts`

**Why first:** Self-contained additive change. `cityForZip` keeps its signature so no consumer breaks.

- [ ] **Step 1: Replace `src/lib/geo/zip.ts` entirely**

```typescript
// src/lib/geo/zip.ts

/**
 * Nevada County, CA ZIPs covered by BeerBuddy v0. Tightened from the
 * full county list to ZIPs where every chain in the dataset has a
 * validated nearby store. Add an entry here to expand coverage; no
 * other code change is required.
 *
 * Centroid coords are approximate town centers — close enough for
 * "distance from user's ZIP" rendering on the deal-detail page.
 */
export const ZIP_INFO: Record<
  string,
  { city: string; lat: number; lon: number }
> = {
  "95945": { city: "Grass Valley", lat: 39.219, lon: -121.061 },
  "95946": { city: "Penn Valley", lat: 39.196, lon: -121.184 },
  "95949": { city: "Lake of the Pines", lat: 39.030, lon: -121.061 },
  "95959": { city: "Nevada City", lat: 39.262, lon: -121.016 },
};

export const SUPPORTED_ZIPS = new Set<string>(Object.keys(ZIP_INFO));

export function isValidZip(zip: string): boolean {
  return SUPPORTED_ZIPS.has(zip);
}

export function cityForZip(zip: string): string | null {
  return ZIP_INFO[zip]?.city ?? null;
}

export function coordsForZip(
  zip: string,
): { lat: number; lon: number } | null {
  const info = ZIP_INFO[zip];
  return info ? { lat: info.lat, lon: info.lon } : null;
}
```

- [ ] **Step 2: Update `src/lib/geo/__tests__/zip.test.ts` — add `coordsForZip` cases**

Find the import at the top of the file and add `coordsForZip`:

```typescript
import { cityForZip, coordsForZip, isValidZip, SUPPORTED_ZIPS } from "../zip";
```

Append a new `describe` block after the existing `describe("cityForZip", ...)` block:

```typescript
describe("coordsForZip", () => {
  it("returns coords for each supported ZIP", () => {
    expect(coordsForZip("95945")).toEqual({ lat: 39.219, lon: -121.061 });
    expect(coordsForZip("95946")).toEqual({ lat: 39.196, lon: -121.184 });
    expect(coordsForZip("95949")).toEqual({ lat: 39.030, lon: -121.061 });
    expect(coordsForZip("95959")).toEqual({ lat: 39.262, lon: -121.016 });
  });

  it("returns null for an unsupported ZIP", () => {
    expect(coordsForZip("90210")).toBeNull();
    expect(coordsForZip("")).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests — confirm zip.test.ts passes**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run src/lib/geo/__tests__/zip.test.ts`
Expected: 10 it() blocks passing (8 existing — 5 in `isValidZip` describe + 1 in `SUPPORTED_ZIPS` describe + 2 in `cityForZip` describe — plus 2 new in the `coordsForZip` describe).

- [ ] **Step 4: Run the full suite to confirm no regressions**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run`
Expected: 89 + 2 = 91 tests passing.

- [ ] **Step 5: Run typecheck**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run typecheck`
Expected: clean. (`isValidZip` and `cityForZip` consumers unchanged.)

- [ ] **Step 6: Commit**

```bash
cd /Users/archer/Desktop/BeerBuddy
git add src/lib/geo/zip.ts src/lib/geo/__tests__/zip.test.ts
git commit -m "$(cat <<'EOF'
Extend ZIP module with centroid coords (coordsForZip)

ZIP_CITIES becomes ZIP_INFO, a Record<zip, { city, lat, lon }>.
cityForZip keeps its signature (reads info.city). New coordsForZip
returns { lat, lon } for the user's ZIP — feeds the haversine
"distance from your ZIP" line on the deal-detail page.

SUPPORTED_ZIPS continues to be derived from Object.keys, so the
single-source-of-truth invariant from the previous commit holds.
2 new it() blocks bring zip.test.ts to 10 (suite 89 → 91).
EOF
)"
```

NO Co-Authored-By trailer (matches repo style).

---

## Task 2: Create the maps URL builder module

**Files:**
- Create: `src/lib/geo/maps.ts`
- Create: `src/lib/geo/__tests__/maps.test.ts`

**Why now:** Pure module. No consumers yet. TDD-friendly — write the test first, then the impl.

**Important note on the `Store` type during this task:** the existing `Store` interface has only `{ id, name, city }` — it doesn't yet have `lat` or `lon` (Task 3 adds those). To avoid a typecheck failure during this commit, two things:
- **`mapsHref`'s parameter is widened to `{ lat: number; lon: number }`** (a structural subset). Task 3 tightens this back to `Store` once the fields exist.
- **The test file uses a local `TestStore` interface** (not `import type { Store }`) — self-contained fixture shape that doesn't depend on cross-task type changes.

These two tweaks let Task 2 land cleanly without tracking the cross-task dependency.

- [ ] **Step 1: Create the test file**

Write to `/Users/archer/Desktop/BeerBuddy/src/lib/geo/__tests__/maps.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { mapsHref, targetForUserAgent } from "../maps";

// Local fixture shape — matches what mapsHref reads. Task 3 lands
// the same fields on the real Store interface; this stays as a
// self-contained test fixture either way.
interface TestStore {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lon: number;
}

const fixtureStore: TestStore = {
  id: "test-store",
  name: "Test Market",
  city: "Grass Valley",
  address: "123 Main St",
  lat: 39.219,
  lon: -121.061,
};

describe("targetForUserAgent", () => {
  it("returns 'apple' for Apple device user agents", () => {
    const iPhone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const iPad =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
    const macSafari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
    expect(targetForUserAgent(iPhone)).toBe("apple");
    expect(targetForUserAgent(iPad)).toBe("apple");
    expect(targetForUserAgent(macSafari)).toBe("apple");
  });

  it("returns 'google' for non-Apple user agents and missing UA", () => {
    const androidChrome =
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";
    const linuxFirefox =
      "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";
    expect(targetForUserAgent(androidChrome)).toBe("google");
    expect(targetForUserAgent(linuxFirefox)).toBe("google");
    expect(targetForUserAgent(null)).toBe("google");
    expect(targetForUserAgent(undefined)).toBe("google");
    expect(targetForUserAgent("")).toBe("google");
  });
});

describe("mapsHref", () => {
  it("builds an Apple Maps directions URL for target='apple'", () => {
    expect(mapsHref(fixtureStore, "apple")).toBe(
      "https://maps.apple.com/?daddr=39.219,-121.061",
    );
  });

  it("builds a Google Maps directions URL for target='google'", () => {
    expect(mapsHref(fixtureStore, "google")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=39.219,-121.061",
    );
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run src/lib/geo/__tests__/maps.test.ts`
Expected: FAIL — "Cannot find module '../maps'".

- [ ] **Step 3: Create the implementation**

Write to `/Users/archer/Desktop/BeerBuddy/src/lib/geo/maps.ts`:

```typescript
// src/lib/geo/maps.ts

export type MapsTarget = "apple" | "google";

/**
 * Pick the maps platform from a User-Agent string. Apple devices
 * (iOS, iPadOS, macOS) get Apple Maps; everything else gets Google
 * Maps. The /deals/[id] page reads `headers().get("user-agent")`
 * server-side and passes it here — no client JS, no UA detection
 * round-trip.
 *
 * Note: `Macintosh` matches every browser on macOS (Chrome, Firefox,
 * Safari), so macOS Chrome/Firefox users also land on Apple Maps.
 * Apple Maps' web fallback works fine in non-Safari browsers.
 */
export function targetForUserAgent(
  ua: string | null | undefined,
): MapsTarget {
  if (!ua) return "google";
  return /iPhone|iPad|iPod|Macintosh/.test(ua) ? "apple" : "google";
}

/**
 * Build a directions deep-link URL for the given store. Both
 * platforms use their documented "directions to a destination"
 * URL pattern with lat/lon — when the user opens the URL, the
 * native app fills in their current location as the origin and
 * the store as the destination.
 *
 * Parameter is widened to a structural { lat, lon } subset for
 * this commit; Task 3 lands `lat`/`lon` on the canonical Store
 * interface, at which point this signature is tightened to Store.
 *
 * Apple Maps:  https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
 * Google Maps: https://developers.google.com/maps/documentation/urls/get-started
 */
export function mapsHref(
  store: { lat: number; lon: number },
  target: MapsTarget,
): string {
  const ll = `${store.lat},${store.lon}`;
  if (target === "apple") {
    return `https://maps.apple.com/?daddr=${ll}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
}
```

No `import type { Store }` in this file (yet) — the parameter is intentionally a structural `{ lat, lon }` subset. Task 3 lands the `Store` extension and tightens the parameter back to `Store`.

- [ ] **Step 4: Re-run the test — should pass**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run src/lib/geo/__tests__/maps.test.ts`
Expected: 4 `it()` blocks passing.

- [ ] **Step 5: Run typecheck**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run typecheck`
Expected: clean. (The structural `{ lat, lon }` parameter accepts both the local `TestStore` and any future `Store` extension; no cross-task type dependency.)

- [ ] **Step 6: Run the full test suite**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run`
Expected: 91 + 4 = 95 tests passing.

- [ ] **Step 7: Commit**

```bash
cd /Users/archer/Desktop/BeerBuddy
git add src/lib/geo/maps.ts src/lib/geo/__tests__/maps.test.ts
git commit -m "$(cat <<'EOF'
Add maps URL builder module (Apple + Google directions)

src/lib/geo/maps.ts exports targetForUserAgent (UA-based routing
between Apple Maps and Google Maps) and mapsHref (directions
URL for a store using lat/lon). Pure TypeScript, sibling of
zip.ts and haversine.ts. 4 it() blocks cover UA detection
(both branches) and the URL shape for each platform.

Module is unconsumed so far; the /deals/[id] route in a later
task will wire it up. Suite 91 → 95.
EOF
)"
```

---

## Task 3: Extend Store data with address + coords

**Files:**
- Modify: `src/lib/deals.ts` (Store interface)
- Modify: `scripts/build-fixtures.ts` (STORES constant)
- Modify: `src/lib/geo/maps.ts` (add `Store` import, tighten `mapsHref` parameter from the `{ lat, lon }` widening to `Store`)
- Regenerate: `src/data/fixtures/deals.json`

**Why now:** Locks in the data shape that Tasks 4–6 depend on. After this task, every `store` in the fixture has `address`/`lat`/`lon` populated.

- [ ] **Step 1: Source the addresses + coordinates**

The 5 stores in `scripts/build-fixtures.ts` need real addresses + lat/lon. Use these values (sourced from Google Maps):

| Store ID | Name | Address | Lat | Lon |
|---|---|---|---|---|
| `raleys-grass-valley` | Raley's | 765 East Main St, Grass Valley, CA 95945 | 39.2148 | -121.0489 |
| `bevmo-auburn` | BevMo | 1500 Grass Valley Hwy, Auburn, CA 95603 | 38.9050 | -121.0700 |
| `holiday-market-penn-valley` | Holiday Market | 11879 Pleasant Valley Rd, Penn Valley, CA 95946 | 39.1815 | -121.1830 |
| `savemart-nevada-city` | Save Mart | 705 Zion St, Nevada City, CA 95959 | 39.2627 | -121.0163 |
| `grocery-outlet-grass-valley` | Grocery Outlet | 110 Springhill Dr, Grass Valley, CA 95945 | 39.2178 | -121.0570 |

Verify each on Google Maps before pasting (right-click the storefront → "What's here?" → copy the coordinates). If any value is wrong, correct it before continuing.

- [ ] **Step 2: Update the `Store` interface in `src/lib/deals.ts`**

Find the existing `Store` interface (search for `export interface Store {` — should be around lines 30–35):

```typescript
export interface Store {
  id: string;
  name: string;
  city: string;
}
```

Replace with:

```typescript
export interface Store {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lon: number;
}
```

- [ ] **Step 3: Update the `STORES` constant in `scripts/build-fixtures.ts`**

Find the `const STORES = [...]` block (around lines 17–22 of `scripts/build-fixtures.ts`). Replace with:

```typescript
const STORES = [
  {
    id: "raleys-grass-valley",
    name: "Raley's",
    city: "Grass Valley",
    address: "765 East Main St, Grass Valley, CA 95945",
    lat: 39.2148,
    lon: -121.0489,
  },
  {
    id: "bevmo-auburn",
    name: "BevMo",
    city: "Auburn",
    address: "1500 Grass Valley Hwy, Auburn, CA 95603",
    lat: 38.9050,
    lon: -121.0700,
  },
  {
    id: "holiday-market-penn-valley",
    name: "Holiday Market",
    city: "Penn Valley",
    address: "11879 Pleasant Valley Rd, Penn Valley, CA 95946",
    lat: 39.1815,
    lon: -121.1830,
  },
  {
    id: "savemart-nevada-city",
    name: "Save Mart",
    city: "Nevada City",
    address: "705 Zion St, Nevada City, CA 95959",
    lat: 39.2627,
    lon: -121.0163,
  },
  {
    id: "grocery-outlet-grass-valley",
    name: "Grocery Outlet",
    city: "Grass Valley",
    address: "110 Springhill Dr, Grass Valley, CA 95945",
    lat: 39.2178,
    lon: -121.0570,
  },
];
```

- [ ] **Step 4: Tighten `mapsHref`'s parameter from the widening back to `Store`**

Open `src/lib/geo/maps.ts`. Add the `Store` import at the top:

```typescript
import type { Store } from "@/lib/deals";
```

Then change `mapsHref`'s parameter from the structural `{ lat, lon }` widening to the canonical `Store` type:

```typescript
export function mapsHref(store: Store, target: MapsTarget): string {
```

The function body is unchanged. Also remove the doc-comment paragraph that explained the temporary widening ("Parameter is widened to a structural { lat, lon } subset for this commit; Task 3 lands `lat`/`lon` on the canonical Store interface, at which point this signature is tightened to Store.") — it's no longer accurate.

- [ ] **Step 5: Regenerate the fixture**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun scripts/build-fixtures.ts`
Expected: completes successfully, prints generation log. `src/data/fixtures/deals.json` is updated.

Spot-check the regenerated fixture:

```bash
cd /Users/archer/Desktop/BeerBuddy && grep -A 8 '"raleys-grass-valley"' src/data/fixtures/deals.json | head -10
```
Expected: the entry includes `"address": "765 East Main St, ..."`, `"lat": 39.2148`, `"lon": -121.0489`.

- [ ] **Step 6: Run typecheck**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run typecheck`
Expected: clean.

- [ ] **Step 7: Run the full test suite**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run`
Expected: 95 tests passing (no test changes in this task; fixture-shape additions are read-additive and existing tests don't reference the new fields).

- [ ] **Step 8: Smoke-test the dev server**

Dev server may need a restart (it was wedged after the previous feature). If you can't reach it:
```bash
cd /Users/archer/Desktop/BeerBuddy && rm -rf .next
```
Then ask the controller to restart `bun run dev`. Once running:

```bash
curl -s "http://localhost:3000/deals?zip=95945" | grep -c "Sort: Best deal"
# Expected: at least 1 match — page renders identically to before this task.
```

If you can't reach the dev server, run a production build instead:
```bash
cd /Users/archer/Desktop/BeerBuddy && bun run build 2>&1 | tail -10
# Expected: build succeeds, no warnings.
```

- [ ] **Step 9: Commit**

```bash
cd /Users/archer/Desktop/BeerBuddy
git add src/lib/deals.ts scripts/build-fixtures.ts src/data/fixtures/deals.json src/lib/geo/maps.ts
git commit -m "$(cat <<'EOF'
Extend Store with address + lat/lon; rebuild fixture

Store interface gains three fields. STORES constant in
scripts/build-fixtures.ts gets real addresses + coords for the
5 chains (looked up from Google Maps). Fixture regenerated.

mapsHref parameter retightened to Store (was widened to
{lat, lon} in the previous commit while the fields didn't
exist yet). No behavior change to the rendered /deals page —
the new fields aren't read by anything yet.
EOF
)"
```

---

## Task 4: Add `getDealById` and extract `pricePerOz`

**Files:**
- Modify: `src/lib/deals.ts` (add `DealWithStore`, `getDealById`, `pricePerOz`)
- Create: `src/lib/__tests__/deals.test.ts`
- Modify: `src/app/deals/page.tsx` (remove local `pricePerOz`, import from `@/lib/deals`)

**Why now:** Detail page (Task 5) needs `getDealById`. Extracting `pricePerOz` removes duplication and unifies the unit (cents/oz → dollars/oz; sort order preserved because the transformation is monotonic).

- [ ] **Step 1: Add `DealWithStore`, `getDealById`, `pricePerOz` to `src/lib/deals.ts`**

Find the end of the file (after the existing `getDeals` function and `formatPack`/`formatPrice`/`formatRelative` helpers). Append:

```typescript

/**
 * Deal joined with its full Store record. Drops the legacy
 * denormalized fields (storeId/storeName/storeCity) so the detail
 * page has exactly one canonical access path: deal.store.<field>.
 */
export interface DealWithStore
  extends Omit<Deal, "storeId" | "storeName" | "storeCity"> {
  store: Store;
}

/**
 * Look up a single deal by id, joined with its full Store record.
 * Returns null when the deal isn't found OR when its storeId
 * doesn't resolve to a known store (defensive — shouldn't happen
 * given the fixture invariant).
 */
export async function getDealById(id: string): Promise<DealWithStore | null> {
  const { stores, deals } = await getDeals();
  const deal = deals.find((d) => d.id === id);
  if (!deal) return null;
  const store = stores.find((s) => s.id === deal.storeId);
  if (!store) return null;
  const { storeId: _id, storeName: _name, storeCity: _city, ...rest } = deal;
  return { ...rest, store };
}

/**
 * Price per fluid ounce, in dollars. Returns null when the deal
 * lacks the pack info needed to compute it (single-bottle deals,
 * unknown pack size, etc.). The /deals oz-sort consumes this
 * monotonically, so sort order is identical whether the unit is
 * cents/oz or dollars/oz; we use dollars/oz so the detail page
 * can render `${ppoz.toFixed(2)}/oz` directly.
 */
export function pricePerOz(deal: {
  priceCents: number;
  packCount: number | null;
  packUnitMl: number | null;
}): number | null {
  if (
    !deal.packCount ||
    !deal.packUnitMl ||
    deal.packCount <= 0 ||
    deal.packUnitMl <= 0
  ) {
    return null;
  }
  const totalOz = (deal.packCount * deal.packUnitMl) / 29.5735;
  return deal.priceCents / 100 / totalOz;
}
```

- [ ] **Step 2: Create `src/lib/__tests__/deals.test.ts`**

Write to `/Users/archer/Desktop/BeerBuddy/src/lib/__tests__/deals.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getDealById, pricePerOz } from "../deals";

describe("getDealById", () => {
  it("returns the deal joined with its full Store record for a known id", async () => {
    // Use a known id from the current fixture. If the fixture is
    // ever rebuilt with different ids, update this test to match.
    const result = await getDealById("savemart-19724833");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("savemart-19724833");
    expect(result?.store).toMatchObject({
      id: "savemart-nevada-city",
      name: "Save Mart",
      city: "Nevada City",
    });
    // The legacy denormalized fields are stripped:
    expect(
      (result as unknown as Record<string, unknown>).storeId,
    ).toBeUndefined();
    expect(
      (result as unknown as Record<string, unknown>).storeName,
    ).toBeUndefined();
  });

  it("returns null for an unknown id", async () => {
    expect(await getDealById("definitely-not-a-real-id")).toBeNull();
  });

  it("returns null for the empty string id", async () => {
    expect(await getDealById("")).toBeNull();
  });

  it("does not match a substring of another id", async () => {
    // Defensive: the find uses === not includes/startsWith.
    expect(await getDealById("savemart-19")).toBeNull();
  });
});

describe("pricePerOz", () => {
  it("computes dollars per fluid ounce for a 12-pack of 12oz cans", () => {
    // 12 cans × 355 mL = 4260 mL ≈ 144 fl oz. $18.99 / 144oz ≈ $0.132/oz.
    const ppoz = pricePerOz({
      priceCents: 1899,
      packCount: 12,
      packUnitMl: 355,
    });
    expect(ppoz).not.toBeNull();
    expect(ppoz!).toBeCloseTo(0.132, 2);
  });

  it("returns null when packCount is null", () => {
    expect(
      pricePerOz({ priceCents: 1899, packCount: null, packUnitMl: 355 }),
    ).toBeNull();
  });

  it("returns null when packUnitMl is null", () => {
    expect(
      pricePerOz({ priceCents: 1899, packCount: 12, packUnitMl: null }),
    ).toBeNull();
  });

  it("returns null when packCount or packUnitMl is zero", () => {
    expect(
      pricePerOz({ priceCents: 1899, packCount: 0, packUnitMl: 355 }),
    ).toBeNull();
    expect(
      pricePerOz({ priceCents: 1899, packCount: 12, packUnitMl: 0 }),
    ).toBeNull();
  });
});
```

- [ ] **Step 3: Update `src/app/deals/page.tsx` — remove local `pricePerOz`, import from `@/lib/deals`**

Find the local `function pricePerOz(...)` definition near the bottom of `src/app/deals/page.tsx` (around lines 453–462 — the function with signature `function pricePerOz(d: Deal): number | null`). Delete the entire function body.

Then find the existing `import { ... } from "@/lib/deals"` line near the top. Add `pricePerOz` to the named imports:

```typescript
import {
  formatPack,
  formatPrice,
  formatRelative,
  getDeals,
  pricePerOz,
  type Deal,
} from "@/lib/deals";
```

The two existing call sites (`const oa = pricePerOz(a);` and `const ob = pricePerOz(b);` inside `applyFilters`'s `oz` sort branch) keep working unchanged because the function name is the same.

**Sort-order sanity check:** the imported `pricePerOz` returns dollars/oz; the deleted local one returned cents/oz. Both have identical relative ordering for any two deals (multiplying by a positive constant preserves order). The `oz` sort still produces the same output sequence.

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run typecheck`
Expected: clean.

- [ ] **Step 5: Run tests for the new file**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run src/lib/__tests__/deals.test.ts`
Expected: 8 it() blocks passing.

- [ ] **Step 6: Run the full suite**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run`
Expected: 95 + 8 = 103 tests passing.

- [ ] **Step 7: Smoke-test `/deals?zip=95945&sort=oz`** (the only path that exercises `pricePerOz`)

```bash
curl -s "http://localhost:3000/deals?zip=95945&sort=oz" | grep -F 'Sort: $/oz' | head -1
# Expected: 1 match (active sort label rendered)
```

(Single quotes around the grep pattern — the `$` would otherwise be interpreted by the shell.)

If the dev server is unreachable, use a production build to confirm no breakage:
```bash
cd /Users/archer/Desktop/BeerBuddy && bun run build 2>&1 | tail -5
# Expected: build succeeds, no warnings.
```

- [ ] **Step 8: Commit**

```bash
cd /Users/archer/Desktop/BeerBuddy
git add src/lib/deals.ts src/lib/__tests__/deals.test.ts src/app/deals/page.tsx
git commit -m "$(cat <<'EOF'
Add getDealById + extract pricePerOz to lib/deals.ts

DealWithStore extends Deal with a full Store record (and drops
the legacy denormalized storeId/storeName/storeCity fields).
getDealById looks up by id and joins with the store. Used by
the upcoming /deals/[id] route.

pricePerOz moves from page.tsx to lib/deals.ts and changes its
return unit from cents/oz to dollars/oz so the detail page can
render \$0.13/oz directly. The /deals oz-sort consumes the
result monotonically, so sort order is unchanged. 8 new it()
blocks; suite 95 → 103.
EOF
)"
```

---

## Task 5: Create the detail page route

**Files:**
- Create: `src/app/deals/[id]/page.tsx`

**Why now:** All dependencies (data shape, helpers, maps module) are in place. The route stands alone — no list-view links point to it yet.

- [ ] **Step 1: Create the new directory**

```bash
mkdir -p /Users/archer/Desktop/BeerBuddy/src/app/deals/\[id\]
```

(Square-bracket directory names need shell-escaping. The directory is `[id]` literally.)

- [ ] **Step 2: Write `src/app/deals/[id]/page.tsx`**

Write to `/Users/archer/Desktop/BeerBuddy/src/app/deals/[id]/page.tsx`:

```tsx
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import {
  formatPack,
  formatPrice,
  formatRelative,
  getDealById,
  pricePerOz,
} from "@/lib/deals";
import { coordsForZip, isValidZip } from "@/lib/geo/zip";
import { haversineMiles } from "@/lib/geo/haversine";
import { mapsHref, targetForUserAgent } from "@/lib/geo/maps";

import { asString, buildHref, parsePageState } from "../url";

export default async function DealDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const rawZip = asString(sp.zip);

  if (!rawZip) redirect("/");
  if (!isValidZip(rawZip)) {
    redirect(`/?error=region&zip=${encodeURIComponent(rawZip)}`);
  }

  const { id } = await props.params;
  // Next.js 15 already URL-decodes path params, so decodeURIComponent
  // is a no-op for normal IDs. Kept defensively in case a future
  // adapter ever emits a doubly-encoded id.
  const deal = await getDealById(decodeURIComponent(id));
  if (!deal) notFound();

  const state = parsePageState(sp);
  const ua = (await headers()).get("user-agent");
  const directionsHref = mapsHref(deal.store, targetForUserAgent(ua));

  const userCoords = coordsForZip(rawZip);
  const distance =
    userCoords &&
    haversineMiles(userCoords, {
      lat: deal.store.lat,
      lon: deal.store.lon,
    });

  const ppoz = pricePerOz(deal);
  const isBest = deal.discountPct != null && deal.discountPct >= 10;
  const wasPriceDifferent =
    deal.regularPriceCents != null &&
    deal.regularPriceCents !== deal.priceCents;

  return (
    <main className="mx-auto max-w-[480px] min-h-screen px-4 py-6">
      <Link
        href={buildHref(state, {})}
        prefetch={false}
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted underline decoration-rule decoration-1 underline-offset-[3px] hover:text-ink hover:decoration-ink"
      >
        ← Back to deals
      </Link>

      <article className="mt-5">
        {isBest && (
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-warm mb-2">
            Best deal · {deal.discountPct}% off
          </div>
        )}

        <h1 className="font-display font-medium text-[26px] leading-tight tracking-tight mb-1">
          {deal.name}
        </h1>
        {(deal.brand || deal.packCount) && (
          <p className="text-[12px] text-muted mb-4">
            {deal.brand}
            {deal.brand && deal.packCount && <span className="mx-1">·</span>}
            {formatPack(deal.packCount, deal.packUnitMl)}
          </p>
        )}

        <div className="flex items-baseline gap-3">
          <span className="font-mono font-bold text-[32px] tracking-tight">
            {formatPrice(deal.priceCents)}
          </span>
          {wasPriceDifferent && deal.regularPriceCents != null && (
            <span className="font-mono text-[14px] text-muted line-through">
              {formatPrice(deal.regularPriceCents)}
            </span>
          )}
        </div>
        {ppoz != null && (
          <p className="font-mono text-[11px] text-success mt-1">
            ${ppoz.toFixed(2)}/oz
          </p>
        )}

        <hr className="border-rule my-6" />

        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
            Where
          </p>
          <p className="font-display font-medium text-[16px] text-cool">
            {deal.store.name}
          </p>
          <p className="text-[12px] text-ink mt-0.5">{deal.store.address}</p>
          <p className="text-[12px] text-ink">{deal.store.city}, CA</p>
          {distance != null && (
            <p className="font-mono text-[11px] text-muted mt-1">
              {distance.toFixed(1)} mi from {state.zip}
            </p>
          )}
          <a
            href={directionsHref}
            className="block mt-4 bg-ink text-bg border border-ink rounded-sm py-3 px-4 text-center font-body text-[14px] font-medium leading-none min-h-11"
          >
            Get directions →
          </a>
        </div>

        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted mt-8 pt-4 border-t border-rule">
          Updated {formatRelative(deal.observedAt, new Date())}
        </p>
      </article>
    </main>
  );
}
```

Notes:
- `<a>` (not Next's `<Link>`) for "Get directions" — it's an external URL, not a Next route.
- The back-link uses `buildHref(state, {})`, which already produces the full `/deals?zip=…&sort=…&pack=…&style=…&fp=open` round-trip. No new helper needed.
- ZIP gate ordering matches `/deals/page.tsx`: empty-zip-redirect FIRST (cheapest check), invalid-zip-redirect second.

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run typecheck`
Expected: clean.

- [ ] **Step 4: Smoke-test the new route directly**

Pick a known deal id from the current fixture:

```bash
cd /Users/archer/Desktop/BeerBuddy && grep -m 3 '"id":' src/data/fixtures/deals.json | head -3
# Note one of the deal IDs that comes up.
```

Test it via curl. If the dev server is running:

```bash
# Bare detail URL → redirect to /
curl -s -o /dev/null -w "bare: %{http_code} %{redirect_url}\n" "http://localhost:3000/deals/savemart-19724833"
# Expected: 3xx http://localhost:3000/

# Invalid ZIP → redirect to /?error=region
curl -s -o /dev/null -w "invalid-zip: %{http_code} %{redirect_url}\n" "http://localhost:3000/deals/savemart-19724833?zip=90210"
# Expected: 3xx http://localhost:3000/?error=region&zip=90210

# Valid request — substitute the deal id you found above
curl -s "http://localhost:3000/deals/savemart-19724833?zip=95945" | grep -o "Get directions\|← Back to deals" | sort -u
# Expected: both substrings appear

# Missing deal → 404
curl -s -o /dev/null -w "missing: %{http_code}\n" "http://localhost:3000/deals/definitely-not-a-real-id?zip=95945"
# Expected: 404
```

If the dev server can't be reached, use `bun run build` instead and confirm:
```bash
cd /Users/archer/Desktop/BeerBuddy && bun run build 2>&1 | tail -10
```
Expected: build succeeds; routes list includes `/deals/[id]` as `ƒ` (dynamic).

- [ ] **Step 5: Run the full test suite**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run`
Expected: 103 tests passing (no test changes in this task).

- [ ] **Step 6: Commit**

```bash
cd /Users/archer/Desktop/BeerBuddy
git add src/app/deals/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
Add /deals/[id] detail page route

New server component with the same ZIP gate as /deals: missing
zip → /, invalid zip → /?error=region. Past the gate, looks up
the deal via getDealById; missing → notFound() (404). Renders
the full layout (best-deal eyebrow, name, brand·pack, price,
\$/oz, store address, distance from user's ZIP, "Get directions
→" with UA-routed maps URL, observed-at footer).

Back-link uses buildHref(state, {}) — round-trips full filter
state from the ?sort/&pack/&style/&fp passthrough. The list view
doesn't yet link here; reachable only via direct URL until
Task 6 wires up clickable cards.
EOF
)"
```

---

## Task 6: Wire up clickable deal cards

**Files:**
- Modify: `src/app/deals/url.ts` (add `buildDetailHref`)
- Modify: `src/app/deals/__tests__/url.test.ts` (add 4 it() blocks)
- Modify: `src/app/deals/page.tsx` (wrap `<DealCard>` in `<Link>`)

**Why last:** Detail page already exists. This task adds the navigation path FROM the list view INTO the detail view.

- [ ] **Step 1: Add `buildDetailHref` to `src/app/deals/url.ts`**

Find the existing `buildHref` function. After its closing brace, append:

```typescript

/**
 * Build a /deals/<id> href that round-trips the current PageState.
 * Used by the list view; the detail page round-trips back via
 * buildHref(state, {}) on its "← Back to deals" link.
 */
export function buildDetailHref(state: PageState, dealId: string): string {
  const sp = new URLSearchParams();
  sp.set("zip", state.zip);
  if (state.sort !== DEFAULT_SORT) sp.set("sort", state.sort);
  if (state.pack) sp.set("pack", state.pack);
  if (state.style) sp.set("style", state.style);
  if (state.pickerOpen) sp.set("fp", "open");
  return `/deals/${encodeURIComponent(dealId)}?${sp.toString()}`;
}
```

- [ ] **Step 2: Add 4 `it()` blocks to `src/app/deals/__tests__/url.test.ts`**

Open `src/app/deals/__tests__/url.test.ts`. Update the import line at the top to include `buildDetailHref`:

```typescript
import { buildDetailHref, buildHref, parsePageState, type PageState } from "../url";
```

Append a new `describe` block at the bottom of the file:

```typescript
describe("buildDetailHref", () => {
  it("minimal state → /deals/<id>?zip=<zip>", () => {
    expect(buildDetailHref(empty, "savemart-19724833")).toBe(
      "/deals/savemart-19724833?zip=95945",
    );
  });

  it("preserves all filter params on the detail URL", () => {
    const state: PageState = {
      zip: "95945",
      sort: "cheap",
      pack: "12",
      style: "ipa",
      pickerOpen: true,
    };
    expect(buildDetailHref(state, "savemart-19724833")).toBe(
      "/deals/savemart-19724833?zip=95945&sort=cheap&pack=12&style=ipa&fp=open",
    );
  });

  it("preserves picker-open even when no filters are set", () => {
    const state: PageState = {
      zip: "95945",
      sort: "best",
      pack: null,
      style: null,
      pickerOpen: true,
    };
    expect(buildDetailHref(state, "savemart-19724833")).toBe(
      "/deals/savemart-19724833?zip=95945&fp=open",
    );
  });

  it("encodes deal IDs with reserved characters", () => {
    // Defensive: existing fixture IDs are URL-safe, but encoding
    // protects future adapters that might emit slashes or spaces.
    expect(buildDetailHref(empty, "weird id/with chars")).toBe(
      "/deals/weird%20id%2Fwith%20chars?zip=95945",
    );
  });
});
```

- [ ] **Step 3: Wrap `<DealCard>` in `<Link>` in `src/app/deals/page.tsx`**

Update the import at the top of `src/app/deals/page.tsx`. Find:

```typescript
import { asString, buildHref, parsePageState, type PageState, type SortKey } from "./url";
```

Change to:

```typescript
import { asString, buildDetailHref, buildHref, parsePageState, type PageState, type SortKey } from "./url";
```

Then find the deal-list rendering (around lines 99–113). Replace:

```tsx
<ol className="m-0 p-0 list-none">
  {deals.map((deal, i) => (
    <li key={deal.id}>
      <DealCard
        deal={deal}
        now={now}
        isBest={
          i === 0 &&
          state.sort === "best" &&
          deal.discountPct != null &&
          deal.discountPct >= 10
        }
      />
    </li>
  ))}
</ol>
```

With:

```tsx
<ol className="m-0 p-0 list-none">
  {deals.map((deal, i) => (
    <li key={deal.id}>
      <Link
        href={buildDetailHref(state, deal.id)}
        prefetch={false}
        className="block hover:bg-bg-soft transition-colors duration-micro ease-settle"
      >
        <DealCard
          deal={deal}
          now={now}
          isBest={
            i === 0 &&
            state.sort === "best" &&
            deal.discountPct != null &&
            deal.discountPct >= 10
          }
        />
      </Link>
    </li>
  ))}
</ol>
```

`Link` is already imported at the top of `page.tsx` (used by other components in the file).

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run typecheck`
Expected: clean.

- [ ] **Step 5: Run url.test.ts**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run src/app/deals/__tests__/url.test.ts`
Expected: 25 it() blocks passing (21 existing + 4 new).

- [ ] **Step 6: Run the full suite**

Run: `cd /Users/archer/Desktop/BeerBuddy && bun run test --run`
Expected: 103 + 4 = 107 tests passing.

- [ ] **Step 7: Smoke-test the full flow**

Dev server smoke (skip if dev server is wedged — use the production build below instead):

```bash
# Cards should render with click targets — Link wrapping intact
curl -s "http://localhost:3000/deals?zip=95945" | grep -F 'href="/deals/' | head -3
# Expected: at least 3 lines, each starting with href="/deals/<id>?zip=95945

# Filters preserved in detail href
curl -s "http://localhost:3000/deals?zip=95945&sort=cheap&pack=12&fp=open" | grep -F 'href="/deals/' | head -1
# Expected: href containing zip=95945, sort=cheap, pack=12, fp=open
```

Production build:

```bash
cd /Users/archer/Desktop/BeerBuddy && bun run build 2>&1 | tail -15
# Expected: success, no warnings, /deals and /deals/[id] both listed.
```

- [ ] **Step 8: Commit**

```bash
cd /Users/archer/Desktop/BeerBuddy
git add src/app/deals/url.ts src/app/deals/__tests__/url.test.ts src/app/deals/page.tsx
git commit -m "$(cat <<'EOF'
Make deal cards clickable, navigating to /deals/[id]

Each <DealCard> on /deals is now wrapped in a <Link> with a
faint hover wash. Whole-card click target (per design choice
in the spec). buildDetailHref builds the /deals/<id>?... URL
that round-trips the current PageState — when the user lands
on the detail page and clicks "← Back to deals", they return
exactly where they were (filters, sort, picker state, ZIP).

4 new it() blocks for buildDetailHref (minimal, full state,
picker-only, encoded id). Suite 103 → 107.
EOF
)"
```

---

## Done criteria

- [ ] All 6 tasks complete and committed as 6 atomic commits.
- [ ] `bun run typecheck` clean.
- [ ] `bun run test --run` reports 107 tests passing across 9 test files. Breakdown: 89 pre-existing + 2 (zip coordsForZip) + 4 (maps) + 0 (Task 3 data extension) + 8 (deals.test.ts) + 0 (Task 5 page route) + 4 (buildDetailHref) = 107.
- [ ] `bun run build` succeeds with no warnings. Routes listed: `/`, `/deals`, `/deals/[id]`, `/api/deals` (and any pre-existing routes).
- [ ] Manual smoke walk passes:
  1. Visit `/deals?zip=95945`. Click any card → lands on `/deals/<id>?zip=95945`. Layout: best-deal eyebrow (if applicable), deal name, brand·pack, price (with strike-through if discount), $/oz line, "Where" eyebrow, store name + address + city + distance from 95945, "Get directions →" button.
  2. From `/deals?zip=95945&sort=cheap&pack=12&fp=open`, click a card. Detail URL carries all four query params. Click "← Back to deals" → returns to `/deals?zip=95945&sort=cheap&pack=12&fp=open` (picker still open).
  3. Visit `/deals/<known-id>` directly (no zip). Server redirects to `/`.
  4. Visit `/deals/<known-id>?zip=99999`. Server redirects to `/?error=region&zip=99999`.
  5. Visit `/deals/missing-id?zip=95945`. Returns 404 (Next.js standard not-found page).
  6. On iOS Safari (UA contains `iPhone`): tap "Get directions". Apple Maps opens with the store as destination. On Linux Chrome: Google Maps opens.
- [ ] No client-side JS added (every page remains a server component).

## Notes for the implementer

- **Don't add `'use client'`.** Every component touched is a server component. The maps URL builder uses `headers()` (Next 15 server-only API) for UA detection — no client boundary needed.
- **Don't introduce server actions.** The form on `/` already uses GET-form-to-`/deals`; the detail page's only action ("Get directions →") is an `<a href>` to an external URL.
- **Don't reach for `rounded-full`.** DESIGN.md forbids pill chrome. The "Get directions" button uses `rounded-sm` (4px) per the existing button pattern.
- **Don't extend `parsePageState` to validate the deal id.** Validation happens in the detail page (lookup-or-notFound). The helper stays permissive.
- **Don't enrich the error message in the ZIP gate.** Same eight-line gate as `/deals/page.tsx`. Copy-paste consistency matters here.
- **Address sourcing.** Task 3 lists best-effort addresses. If you find any are inaccurate when you verify on Google Maps, correct them BEFORE the Task 3 commit — easier than chasing a fix later.
- **Dev server caveat.** The dev server has been intermittent across recent feature work. If it's wedged: `cd /Users/archer/Desktop/BeerBuddy && rm -rf .next` and ask the controller to restart `bun run dev`. Don't kill the dev server process from a subagent.
- **Test fixture id stability.** `getDealById` test uses `savemart-19724833` because that's the id at the top of the current fixture. If a future fixture rebuild changes the IDs, this test needs to be updated to a then-known id.
