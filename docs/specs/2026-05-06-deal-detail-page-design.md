# Deal Detail Page + Maps Integration

**Date:** 2026-05-06
**Scope:** new route `src/app/deals/[id]/page.tsx`; data model extensions in `src/lib/deals.ts` and `src/lib/geo/zip.ts`; new pure module `src/lib/geo/maps.ts`; small wiring change in `src/app/deals/page.tsx` and `src/app/deals/url.ts`.
**Status:** Draft (awaiting review)

## Problem

The `/deals` list view shows 200 deals as terminal text — name, brand, pack, price, store, store-city, observed-at. Each card is a passive `<article>`. A user sees a 26%-off Firestone 805 12-pack at Holiday Market in Penn Valley but has nowhere to go: there's no way to see more about the deal, no way to find the store, no path from "this looks good" to "I'm walking out the door."

Two things need to land together:

1. **A deal-detail surface.** Users need a place where the deal expands into its full story (price, $/oz, store address, distance from their ZIP, last observed) and where they can act on it.
2. **Action affordance.** The single most useful action a user can take from "I want this beer" is "take me to that store." A maps deep-link is the simplest, most universal way to deliver that.

## Design

### URL contract

```
/deals/<dealId>?zip=95945                              minimal valid detail URL
/deals/<dealId>?zip=95945&sort=cheap&pack=12&fp=open   detail with filter passthrough (back-link round-trips)
/deals/<dealId>                                        → 307 redirect to /
/deals/<dealId>?zip=12345                              → 307 redirect to /?error=region&zip=12345
/deals/missing-id?zip=95945                            → 404 (Next.js notFound)
```

The detail page applies the **same ZIP gate** as `/deals` (re-uses `isValidZip` + the existing redirect logic). Past the gate, looks up the deal by id; if not found, calls `notFound()` (Next 15 helper). `sort`, `pack`, `style`, and `fp` are read but not interpreted — only round-tripped into the back-link href.

The path segment is the deal's existing `id` (e.g., `savemart-19724833`, `bevmo-firestone-805-12pk`) — already URL-safe in the fixture, but `encodeURIComponent` is applied defensively when building the detail href and `decodeURIComponent` is applied when reading it.

### Data model extensions

#### `Store` interface (`src/lib/deals.ts`)

```typescript
export interface Store {
  id: string;
  name: string;
  city: string;
  address: string;   // ← new: street address, e.g. "11879 Pleasant Valley Rd"
  lat: number;       // ← new: WGS84 decimal degrees
  lon: number;       // ← new: WGS84 decimal degrees
}
```

#### `ZIP_INFO` (`src/lib/geo/zip.ts`)

`ZIP_CITIES` is replaced by a richer `ZIP_INFO`. `cityForZip` keeps working (signature unchanged); `coordsForZip` is added.

```typescript
export const ZIP_INFO: Record<string, { city: string; lat: number; lon: number }> = {
  "95945": { city: "Grass Valley",       lat: 39.219, lon: -121.061 },
  "95946": { city: "Penn Valley",        lat: 39.196, lon: -121.184 },
  "95949": { city: "Lake of the Pines",  lat: 39.030, lon: -121.061 },
  "95959": { city: "Nevada City",        lat: 39.262, lon: -121.016 },
};

export const SUPPORTED_ZIPS = new Set<string>(Object.keys(ZIP_INFO));

export function cityForZip(zip: string): string | null {
  return ZIP_INFO[zip]?.city ?? null;
}

export function coordsForZip(zip: string): { lat: number; lon: number } | null {
  const info = ZIP_INFO[zip];
  return info ? { lat: info.lat, lon: info.lon } : null;
}
```

(The example coords are approximate town centroids; actual values get sourced during implementation by hand from Google Maps.)

#### Fixture builder (`scripts/build-fixtures.ts`)

The `STORES` constant gets `address` / `lat` / `lon` filled in for all 5 stores. Re-run `bun scripts/build-fixtures.ts` to regenerate `src/data/fixtures/deals.json`. Net result: each `store` in the JSON gains three fields.

**Sourcing strategy:** manual lookup from Google Maps (~5 minutes for 5 stores). No geocoding API dependency.

### `getDealById` and `pricePerOz` extraction (`src/lib/deals.ts`)

```typescript
export interface DealWithStore extends Omit<Deal, "storeId" | "storeName" | "storeCity"> {
  store: Store;
}

export async function getDealById(id: string): Promise<DealWithStore | null> {
  const { stores, deals } = await getDeals();
  const deal = deals.find((d) => d.id === id);
  if (!deal) return null;
  const store = stores.find((s) => s.id === deal.storeId);
  if (!store) return null;
  const { storeId: _id, storeName: _name, storeCity: _city, ...rest } = deal;
  return { ...rest, store };
}

export function pricePerOz(deal: { priceCents: number; packCount: number | null; packUnitMl: number | null }): number | null {
  if (!deal.packCount || !deal.packUnitMl || deal.packCount <= 0 || deal.packUnitMl <= 0) {
    return null;
  }
  const totalOz = (deal.packCount * deal.packUnitMl) / 29.5735;
  return deal.priceCents / 100 / totalOz;
}
```

`pricePerOz` is currently a private helper in `src/app/deals/page.tsx` — moves here so both pages share one definition. The structural parameter type accepts both `Deal` and `DealWithStore`.

**Unit change.** The previous private version returned **cents/oz** (used internally only for the `oz` sort, where relative ordering is what matters). The new shared version returns **dollars/oz** so the detail page can render `${ppoz.toFixed(2)}/oz` directly as `$0.13/oz`. Sort ordering is unchanged because dividing by 100 is monotonic — `applyFilters`'s `oz` branch keeps producing identical sort results. No call-site surgery beyond the import: `applyFilters` calls `pricePerOz(a)` exactly as before; only the import path changes.

`DealWithStore` strips the legacy denormalized store fields (`storeId/storeName/storeCity`) so the detail page has exactly one canonical access path: `deal.store.<field>`.

### Maps URL builder (`src/lib/geo/maps.ts`, NEW)

```typescript
import type { Store } from "@/lib/deals";

export type MapsTarget = "apple" | "google";

/**
 * Pick the maps platform from a User-Agent string. Apple devices
 * (iOS, iPadOS, macOS) get Apple Maps; everything else gets Google
 * Maps. The /deals/[id] page reads `headers().get("user-agent")`
 * server-side and passes it here — no client JS, no UA detection
 * round-trip.
 */
export function targetForUserAgent(ua: string | null | undefined): MapsTarget {
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
 * Apple Maps:  https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
 * Google Maps: https://developers.google.com/maps/documentation/urls/get-started
 */
export function mapsHref(store: Store, target: MapsTarget): string {
  const ll = `${store.lat},${store.lon}`;
  if (target === "apple") {
    return `https://maps.apple.com/?daddr=${ll}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
}
```

Pure TS, no React/Next imports. Sibling of `zip.ts` and `haversine.ts`. Tested in isolation.

The detail page wires it together once:

```tsx
import { headers } from "next/headers";
const ua = (await headers()).get("user-agent");
const target = targetForUserAgent(ua);
const href = mapsHref(deal.store, target);
```

The button's visible text is unchanged regardless of target ("Get directions →"). Only the `href` differs.

### List view: clickable cards (`src/app/deals/page.tsx`)

Wraps each `<DealCard>` in a `<Link>` with `block` display + faint hover wash. No `<DealCard>` API change.

```tsx
<Link
  href={buildDetailHref(state, deal.id)}
  prefetch={false}
  className="block hover:bg-bg-soft transition-colors duration-micro ease-settle"
>
  <DealCard deal={deal} now={now} isBest={...} />
</Link>
```

`buildDetailHref` is a new helper in `src/app/deals/url.ts`:

```typescript
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

### Detail page (`src/app/deals/[id]/page.tsx`, NEW)

Server component. Mirrors the gate + structure of `/deals/page.tsx`.

#### Top-of-function (gate, lookup, helpers)

```tsx
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";

import { getDealById, formatPack, formatPrice, formatRelative, pricePerOz } from "@/lib/deals";
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
  const deal = await getDealById(decodeURIComponent(id));
  if (!deal) notFound();

  const state = parsePageState(sp);
  const ua = (await headers()).get("user-agent");
  const href = mapsHref(deal.store, targetForUserAgent(ua));

  const userCoords = coordsForZip(rawZip);
  const distance = userCoords && haversineMiles(userCoords, { lat: deal.store.lat, lon: deal.store.lon });
  const ppoz = pricePerOz(deal);

  // ... JSX (see below)
}
```

#### JSX shape

```tsx
<main className="mx-auto max-w-[480px] min-h-screen px-4 py-6">
  <Link
    href={buildHref(state, {})}
    prefetch={false}
    className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted underline decoration-rule decoration-1 underline-offset-[3px] hover:text-ink hover:decoration-ink"
  >
    ← Back to deals
  </Link>

  <article className="mt-5">
    {deal.discountPct != null && deal.discountPct >= 10 && (
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
      {deal.regularPriceCents != null && deal.regularPriceCents !== deal.priceCents && (
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
        href={href}
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
```

The back-link uses the existing `buildHref(state, {})` from `src/app/deals/url.ts` — it returns `/deals?zip=…&sort=…&pack=…&style=…&fp=open` with all current params preserved. No new helper needed.

The "Get directions" button uses `<a>` (not Next's `<Link>`) — it's an external URL, not a Next route.

### Edge cases handled

- **Deal not found**: `getDealById` returns `null` → `notFound()` → standard Next 15 404.
- **No price-per-oz**: line hidden when `packCount` or `packUnitMl` is null/zero.
- **No discount**: regular-price strike-through hidden when `regularPriceCents` is null or equal to `priceCents`.
- **No best-deal eyebrow**: condition `discountPct >= 10` matches the list view's threshold.
- **Distance unavailable**: line hidden when `coordsForZip` returns null (impossible past the gate, but the JSX guard makes it safe).

## Implementation outline

| File | Action | What |
|------|--------|------|
| `src/lib/geo/zip.ts` | **MODIFY** | Replace `ZIP_CITIES` with `ZIP_INFO` (richer record). Keep `cityForZip` (signature unchanged). Add `coordsForZip`. |
| `src/lib/geo/__tests__/zip.test.ts` | **MODIFY** | Add `coordsForZip` cases (4 valid + 1 unknown). Existing `cityForZip` cases keep passing. |
| `src/lib/geo/maps.ts` | **CREATE** | `MapsTarget` type, `targetForUserAgent`, `mapsHref`. Pure TS. |
| `src/lib/geo/__tests__/maps.test.ts` | **CREATE** | UA detection (5 cases) + URL shape (Apple + Google = 2 cases). |
| `src/lib/deals.ts` | **MODIFY** | Extend `Store` with `address`, `lat`, `lon`. Add `DealWithStore`, `getDealById`, `pricePerOz` (extracted from `page.tsx`). |
| `src/lib/__tests__/deals.test.ts` | **CREATE** | `getDealById` (4 cases) + `pricePerOz` (4 cases). |
| `scripts/build-fixtures.ts` | **MODIFY** | Add `address` / `lat` / `lon` to each `STORES` entry. Manual sourcing from Google Maps. |
| `src/data/fixtures/deals.json` | **REGENERATE** | Re-run `bun scripts/build-fixtures.ts`. |
| `src/app/deals/url.ts` | **MODIFY** | Add `buildDetailHref(state, dealId)`. |
| `src/app/deals/__tests__/url.test.ts` | **MODIFY** | Add `buildDetailHref` cases (4 cases). |
| `src/app/deals/page.tsx` | **MODIFY** | Wrap each `<DealCard>` in a `<Link>`. Remove the local `pricePerOz` (now imported). Drop the local `Deal[]` parameter casting that referenced `storeName/storeCity` if any. |
| `src/app/deals/[id]/page.tsx` | **CREATE** | The detail page server component (gate, lookup, layout, maps wiring). |

No new npm dependencies. No client JS. No server actions.

## Out of scope

- Product images.
- "View at <Chain>" link to source product page (would require adding `sourceUrl` to `Deal`).
- Drive time / route info / map embed.
- Sharing affordance / Web Share API.
- Per-store reviews / ratings / hours.
- "Save this deal" / favorites.
- Reverse-distance ranking on `/deals` (a "Nearest" sort would be a separate feature).
- Dynamic OG / share-card generation.
- Two-button maps split (Apple AND Google) — Q3 chose single button + UA detection.
- Modal / parallel-route presentation — Q1 chose own route.

## Testing

### Unit

- `src/lib/geo/__tests__/zip.test.ts` — extends with `coordsForZip` cases (4 valid + 1 unknown).
- `src/lib/geo/__tests__/maps.test.ts` (new):
  - `targetForUserAgent("...iPhone...")` → `"apple"`
  - `targetForUserAgent("...iPad...")` → `"apple"`
  - `targetForUserAgent("...Macintosh...")` → `"apple"`
  - `targetForUserAgent("...Linux...Android...")` → `"google"`
  - `targetForUserAgent(null)` → `"google"`
  - `mapsHref(store, "apple")` produces `https://maps.apple.com/?daddr=<lat>,<lon>` (directions URL).
  - `mapsHref(store, "google")` produces `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lon>` (directions URL).
- `src/lib/__tests__/deals.test.ts` (new):
  - `getDealById("known-id")` returns `DealWithStore` with full store record.
  - `getDealById("unknown")` returns `null`.
  - `getDealById("savemart-19")` does NOT match `savemart-1979` (substring guard).
  - `getDealById` for a deal whose `storeId` doesn't exist in stores returns `null` (defensive).
  - `pricePerOz({ priceCents: 1899, packCount: 12, packUnitMl: 355 })` ≈ `0.125`.
  - `pricePerOz({ priceCents: 1899, packCount: null, packUnitMl: 355 })` → `null`.
  - `pricePerOz({ priceCents: 1899, packCount: 12, packUnitMl: null })` → `null`.
  - `pricePerOz({ priceCents: 1899, packCount: 0, packUnitMl: 355 })` → `null`.
- `src/app/deals/__tests__/url.test.ts` — extends with `buildDetailHref` cases:
  - Minimal state → `/deals/<id>?zip=95945`.
  - Full filter state → `/deals/<id>?zip=95945&sort=cheap&pack=12&style=ipa&fp=open`.
  - Picker only → `/deals/<id>?zip=95945&fp=open`.
  - Id with reserved characters round-trips via `encodeURIComponent`.

### Manual smoke

1. Visit `/deals?zip=95945`. Click any card → lands on `/deals/<id>?zip=95945`. Layout matches mockup B.
2. From `/deals?zip=95945&sort=cheap&pack=12&fp=open`, click a card. Detail URL carries all four params. Click "← Back to deals" → returns to `/deals?zip=95945&sort=cheap&pack=12&fp=open` (picker still open).
3. Visit `/deals/raleys-grass-valley-firestone-805-12pk` directly (no `zip`). Server redirects to `/`.
4. Visit `/deals/missing-id?zip=95945`. Returns 404.
5. iOS Safari (UA contains `iPhone`): "Get directions" opens Apple Maps. Linux/Chrome: opens Google Maps in a new tab.
6. Detail page for a deal in 95946 from a user with `?zip=95945`: distance line reads "X.X mi from 95945".
7. Detail page for a deal where `packCount` is null: $/oz line is absent.

### Build / typecheck / suite

- `bun run typecheck` clean.
- `bun run test --run` reports ~111 passing (current 89 + ~22 new).
- `bun run build` succeeds with `/`, `/deals`, and `/deals/[id]` listed as dynamic routes; no warnings.

## Risk / open questions

- **Sourcing addresses + coords.** Five stores, looked up by hand from Google Maps during plan execution. No automation.
- **Deal IDs are not stable across fixture rebuilds.** When the matview lands later, IDs from the DB may differ from fixture IDs — old shareable detail links will 404. Acceptable for v0 (pre-launch).
- **`headers()` is a Next.js 15 server-only API.** The detail page is a server component, so this is fine. Calling `targetForUserAgent` from anywhere else (e.g., a client component) would need to plumb the UA differently.
- **Map URL formats are vendor-controlled.** If Apple changes its URL params, the link breaks. Mitigation: URLs are sourced from official docs, the test suite asserts URL shape so a change would be caught in CI.
- **`Macintosh` UA matches every browser on macOS** — Chrome, Firefox, Safari, etc. — not just Safari. So macOS users on Chrome/Firefox will still get routed to Apple Maps. Apple Maps' web fallback works fine in non-Safari browsers, so this isn't broken — it's a design consequence of "Apple devices get Apple Maps" (Q3). Worth knowing if a user ever asks "why am I getting Apple Maps in Chrome?"
- **The list view's `<Link>` wrapping changes the click target on every row.** No new content, but every deal becomes navigable. Verify in the smoke walk that no card has unexpectedly-broken styling (the wrapping `<a>` should be transparent visually).
- **The "Updated <relative>" line on the detail page mirrors the list-view footer's freshness signal.** Acceptable redundancy.
