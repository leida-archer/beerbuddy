---
date: 2026-05-06
app: beerbuddy
scope: Front-of-app shipping day — filter compression, ZIP gate, deal detail page, rich link previews
---

# Deal Flow v0

Brought the entire user-facing deal flow online in one day. Started from a `/deals` page where the buttons didn't actually do anything; ended with a fully functional discover → filter → detail → share flow deployed to production at https://beerbuddy-woad.vercel.app. Four features, each going through brainstorm → spec → plan → parallel-execution, plus a small directly-shipped polish pass at the end. Everything stays URL-driven and server-rendered — no client-side JavaScript added beyond what existed before.

## Added

- **URL-driven sort + filter** on `/deals` (`b651dc3`) — `?sort=`, `?pack=`, `?style=` GET params that the server reads and applies to `applyFilters` + the sort comparator. The chips that previously rendered as decorative now navigate.
- **Filter UI compression** (`fc0b663` → `0a116bf`, 5 atomic commits) — replaced the 3-row 13-chip stack with a single active-chip row plus a collapsible picker behind `?fp=open`. URL helpers extracted to [`src/app/deals/url.ts`](../../src/app/deals/url.ts) with 18 unit tests covering every transition in the spec's interaction map. Two new components inline in `page.tsx`: `ActiveChipRow` and `FilterPicker`.
- **ZIP gate at the front door** (`23c1a85` → `de3389a`, 6 commits) — homepage replaced with a minimal ZIP-entry form (no client JS, plain HTML form GET to `/deals`). New module [`src/lib/geo/zip.ts`](../../src/lib/geo/zip.ts) holds the 4-ZIP Nevada County allowlist (`95945`, `95946`, `95949`, `95959`). `/deals` validates server-side and redirects out-of-area requests to `/?error=region&zip=…` with the rejected ZIP pre-filled in the form. The `/deals` header right-side swapped from chain-list + deal count to an underlined `Location: <zip>` link. Inline error block on the homepage names "Out of area" without enumerating the supported ZIPs.
- **City lookup** (`de3389a`) — `cityForZip(zip)` and richer `ZIP_INFO` Record. The hardcoded `95945 · Grass Valley` h1 now reads `{zip} · {cityForZip(zip)}` so 95959 shows as "Nevada City", etc.
- **Store data extension** (`8206334`) — `Store` interface gains `address`, `lat`, `lon`. All 5 stores in [`scripts/build-fixtures.ts`](../../scripts/build-fixtures.ts) populated with real Google-Maps-sourced data. Fixture regenerated.
- **Maps URL builder** [`src/lib/geo/maps.ts`](../../src/lib/geo/maps.ts) (`a22b19b`) — pure module with `targetForUserAgent(ua)` (iPhone/iPad/iPod/Macintosh → Apple Maps; everything else → Google Maps) and `mapsHref(store, target)` that emits the documented "directions to a destination" URL pattern for each platform.
- **Deal detail page** at [`src/app/deals/[id]/page.tsx`](../../src/app/deals/[id]/page.tsx) (`2de47f8`) — server component, mirrors the `/deals` ZIP gate, looks up via new `getDealById` (joins `Deal` with full `Store` record into `DealWithStore`), renders best-deal eyebrow + name + brand·pack + price + strike-through + `$/oz` + store address + distance from user's ZIP + "Get directions →" button. UA detection routes the directions URL platform-correctly.
- **Clickable deal cards** (`937b2e6`) — `<DealCard>` wrapped in `<Link>` via new `buildDetailHref(state, dealId)`; whole-card click target with faint `hover:bg-bg-soft` wash; back-link from detail page round-trips full filter state via `buildHref(state, {})`.
- **Centroid coords** (`4b0e9f6`) — `coordsForZip()` returns `{ lat, lon }` for any supported ZIP. Feeds the haversine distance line on the detail page.
- **Shared `pricePerOz`** moved from `page.tsx` to `src/lib/deals.ts` (`454c004`) — unit changed from cents/oz to dollars/oz so detail page can render `$0.13/oz` directly. Sort order preserved (transformation is monotonic).
- **Rich link previews** (`1016f87`) — three new image routes via Next.js conventions + `ImageResponse`:
  - [`src/app/opengraph-image.tsx`](../../src/app/opengraph-image.tsx) — 1200×630 Golden Hour wordmark hero card. iMessage / Slack / Twitter / FB.
  - [`src/app/apple-icon.tsx`](../../src/app/apple-icon.tsx) — 180×180 "B." with warm-amber dot. iOS home-screen + iMessage avatar.
  - [`src/app/icon.tsx`](../../src/app/icon.tsx) — 32×32 favicon, same composition.
- **Comprehensive metadata** in [`src/app/layout.tsx`](../../src/app/layout.tsx) (`1016f87`) — `metadataBase` + `openGraph` + `twitter` blocks so auto-wired `og:image` / `twitter:image` resolve to absolute URLs (Apple iMessage requirement).
- **Test suites:**
  - `src/app/deals/__tests__/url.test.ts` extended to 25 cases.
  - `src/lib/geo/__tests__/zip.test.ts` extended to 10 cases.
  - `src/lib/geo/__tests__/maps.test.ts` (new) — 4 cases.
  - `src/lib/__tests__/deals.test.ts` (new) — 8 cases.
  - Suite total: 78 → 107 passing across 10 files.
- **Process docs:** 3 specs in [`docs/specs/`](../specs/) and 3 plans in [`docs/plans/`](../plans/) — every feature went through brainstorm → spec → plan → parallel-execution with two-stage review (spec compliance + code quality) per task.

## Changed

- `/deals` is now a fully URL-driven view: sort, pack-size, style, picker-open, and ZIP all live as query params; chip states + back-link round-trips are derived from `parsePageState(searchParams)`.
- `Store` interface gained 3 new fields (`address`, `lat`, `lon`) without breaking existing consumers.
- `ZIP_CITIES` (string-keyed Record<zip, city>) replaced by `ZIP_INFO` (richer Record with city + lat + lon); `SUPPORTED_ZIPS` derived from `Object.keys(ZIP_INFO)` so the two stay in lockstep.
- `buildHref` always emits `?zip=…` first; the previous `q ? "/deals?…" : "/deals"` short-circuit removed.
- `pricePerOz`'s structural parameter type accepts both `Deal` and `DealWithStore`; same name + same call sites in `applyFilters`'s oz-sort branch, but unit is dollars/oz now.
- Homepage form input gained `min-h-11` to match submit button height; submit button gained `aria-label="Submit ZIP"` since the visible `→` glyph is read inconsistently by screen readers.
- Footer build-stamp on the homepage changed from `v0 · 2026-05-05` to `Nevada County, CA · v0` — clearer scope signal.
- `mapsHref`'s parameter widened to `{ lat, lon }` in commit `a22b19b`, then retightened back to `Store` in `8206334` once the canonical type had the fields. Two-commit dance documented in both messages so a reviewer doesn't get lost.
- Production deploys: pushed twice during the day (`https://beerbuddy-woad.vercel.app`) — once after the deal-detail work and once after the rich-link-preview work. Both verified live end-to-end via curl.

## Deleted

- Marketing tagline on the homepage (`Best beer deals in Nevada County, CA — ranked by what's actually on sale this week, not just what's cheapest.`) — the new form-first homepage drops it; the same value prop now lives on the OG link-preview card and in `og:description`.
- `<a href="/deals">See this week's deals →</a>` CTA anchor — superseded by the form submit.
- 3 orphaned chip components on `/deals` (`SortRow`, `FilterChips`, `ChipLink`) — replaced by `ActiveChipRow` + `FilterPicker`.
- Right-side header text on `/deals` (`RALEY'S · BEVMO · HOLIDAY MARKET · SAVE MART · GROCERY OUTLET / 2 OF 200 DEALS`) — replaced with the underlined `Location: <zip>` link.
- Hardcoded `95945 · Grass Valley` h1 string — now derived from `state.zip` + `cityForZip(state.zip)`.
- Local `pricePerOz` in `src/app/deals/page.tsx` — extracted to `lib/deals.ts`.
- `ZIP_CITIES` export — replaced by richer `ZIP_INFO`.

## Notes

- **Fonts on rendered images.** `opengraph-image.tsx`, `apple-icon.tsx`, and `icon.tsx` use Playfair Display (Google Fonts) as a stand-in for Editorial New on the rendered surfaces — Fontshare's API isn't programmatically accessible. Inter / JetBrains Mono replace Bricolage Grotesque / Geist Mono in the OG card because Bricolage has GSUB features Satori can't render. The on-page wordmark stays Editorial New as before. ~15 min of follow-up work to bundle the actual Editorial New TTF and pixel-match the brand if it matters later.
- **macOS UA caveat.** `targetForUserAgent` matches `Macintosh`, which means macOS Chrome / Firefox users land on Apple Maps. Apple Maps' web fallback works fine in non-Safari browsers — documented in the `mapsHref` doc-comment + the spec's risk section.
- **BevMo Auburn is in Placer County**, ~21 mi south of Grass Valley. Distance line will read 18–22 mi for BevMo deals. Pre-existing data choice; not introduced by today's work but worth knowing for v0.
- **Dev server intermittency.** Long sessions wedge the running `bun run dev` after structural type changes; `rm -rf .next && restart` recovers. Documented in each plan's "Notes for the implementer" section.
- **Detail-page integration test gap.** Helper-level coverage is solid (107 unit tests). End-to-end render of `<DealDetailPage>` (gate behavior, 404 path, distance/$/oz hidden states) is currently only validated via the live curl walk; future work could add a Playwright or RTL test.
- **Pre-existing local h1 still hardcoded for state name** (`{deal.store.city}, CA`) — `Store` has no `state` field. v0-acceptable since BeerBuddy is California-only, gated at the ZIP level.
- **Deal IDs aren't stable across fixture rebuilds.** `getDealById` test uses `savemart-193352` from the current fixture; future rebuilds may invalidate that id and require updating the test.
- **Vercel deploy** is currently disconnected from GitHub — future pushes to `main` won't auto-deploy. Connecting it via the Vercel dashboard's Git tab would close that gap.
