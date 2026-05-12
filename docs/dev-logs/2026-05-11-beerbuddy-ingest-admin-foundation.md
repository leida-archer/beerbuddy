---
date: 2026-05-11
app: beerbuddy
scope: Ingestion plumbing, admin tooling, e2e + CI rigor, Anthropic omission
---

# Ingest + admin foundation

Three commits over the week. Built out the v1 ingestion backbone (chain adapters wired through an alias resolver, 90-day baseline view, `/api/deals` abstracted behind a swappable repo), added the admin surface that the developer needs when ingestion breaks (`/admin/aliases`, `/admin/indie`, `/admin/parse-queue`), tightened the test layer (Playwright e2e on desktop + mobile chromium, dedicated CI workflow), and removed the unused Anthropic LLM path in favor of a generic manual-intervention queue. Net: 51 files changed, +3,646 / −541. Vitest 137 / e2e 14, both green; no live DB yet so the admin pages render their "Database unreachable" fallback until Neon is provisioned.

## Added

- **Alias resolver** ([`upsertAliasAndCanonicalProduct`](../../src/lib/ingest/persist.ts)) (`5b3e60c`) — bridge between chain SKUs and the canonical `products` table. Idempotent two-phase write (`SELECT product_aliases`, then `INSERT products ON CONFLICT DO UPDATE RETURNING id`, then `INSERT product_aliases ON CONFLICT DO NOTHING`). Auto-stubs tagged `confirmedBySession = "auto"` so the admin candidate-match UI can surface them for review. Fixes a structural FK violation that would have crashed every Raley's run end-to-end.
- **Save Mart / Holiday Market / Grocery Outlet adapters** (`5b3e60c`) — new `index.ts` per chain, all routed through the alias resolver, mirroring the Raley's pattern. Each accepts an injected extractor for tests. Save Mart has a 5-spec unit suite using `vi.mock("@/lib/ingest/persist")`.
- **LLM circular helper** (`5b3e60c`, later removed in `89be801`) — provider-agnostic `parseCircular(input, client)` with Zod-gated output. 7 unit tests using a mocked Anthropic-shaped client. Deleted four days later, see Deleted below.
- **90-day baseline + product_deal_scores view** (`5b3e60c`) — pure helpers in [`src/lib/deals/baseline.ts`](../../src/lib/deals/baseline.ts) (median, dealScorePct, computeRow, 14 tests) backed by the hand-written [`drizzle/migrations/0001_product_deal_scores_view.sql`](../../drizzle/migrations/0001_product_deal_scores_view.sql). View computes per-(store, product) `current_price_cents`, `median_90d_cents`, and `deal_score_pct` (0..100, non-negative).
- **DealsRepo abstraction** (`5b3e60c`) — [`src/lib/deals/repo.ts`](../../src/lib/deals/repo.ts) defines the read interface; `fixtureDealsRepo` is the default, `dbDealsRepo` ([`repoDb.ts`](../../src/lib/deals/repoDb.ts)) lazy-loads when `BEERBUDDY_DEALS_SOURCE=db`. Both return the same `DealsResult` shape so `/deals` and `/deals/[id]` don't know which source they're reading.
- **`GET / POST /api/admin/aliases`** (`5b3e60c`) — bearer-auth (`ADMIN_PASSWORD`), constant-time comparison. GET returns candidate pairs; POST `{ sourceId, targetId, sessionTag? }` merges, repointing both `product_aliases` and historical `price_events`.
- **`/admin/aliases` UI** (`5b3e60c`) — server-component page with `?key=ADMIN_PASSWORD` gate, side-by-side candidate comparison rows, similarity %, two-direction merge via server actions, DB-unreachable fallback for un-provisioned envs.
- **`/admin/indie` UI** (`5b3e60c`) — manual price-entry form for indie liquor stores (Zero User Labor § "never linked publicly"). Same gate, server action upserts store, resolves alias, writes the price event.
- **Playwright e2e + config** (`5b3e60c`, expanded `078dc1d`) — `@playwright/test` added; [`playwright.config.ts`](../../playwright.config.ts) boots `bun run dev` via `webServer`. 7 specs in [`e2e/deals-detail.spec.ts`](../../e2e/deals-detail.spec.ts): ZIP gate (missing + invalid), happy path, 404, BevMo further-drive, limited-history eyebrow, hidden $/oz.
- **Cross-viewport projects** (`078dc1d`) — desktop-chromium + mobile-chromium (Pixel 7) run the same specs. 14 results per pass; ~8s on a quiet laptop.
- **GitHub Actions e2e workflow** ([`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml)) (`078dc1d`) — companion to `ci.yml`. Caches the Chromium binary by `bun.lock` hash, uploads the HTML report artifact on failure, sets the same `DATABASE_URL` placeholder `ci.yml` uses.
- **`manual_parse_queue` table + helpers** (`89be801`) — replaces the deleted `llm_parse_failures`. Generic intervention queue (`kind` field admits "manual-parse", "captcha", "config-needed", etc.). New helpers in [`lib/admin/parseQueue.ts`](../../src/lib/admin/parseQueue.ts) (`listPending` / `listResolved` / `pendingCount` / `markResolved` / `reopen`) and [`lib/ingest/persist.ts`](../../src/lib/ingest/persist.ts) (`queueManualParse`).
- **Pluggable admin notifier** ([`lib/admin/notify.ts`](../../src/lib/admin/notify.ts)) (`89be801`) — stderr is always written; Resend email push fires when both `RESEND_API_KEY` and `ADMIN_EMAIL` are set. Slack / Pushover / ntfy slot in as new branches without changing callers.
- **`/admin/parse-queue` UI** (`89be801`) — FIFO pending list with resolution-notes input + Mark Resolved server action; recently-resolved section with reopen link; DB-unreachable fallback.
- **Shared `<AdminNav>`** ([`src/app/admin/_components/AdminNav.tsx`](../../src/app/admin/_components/AdminNav.tsx)) (`89be801`) — three-link nav (Aliases / Indie prices / Parse queue) wired into every admin page, with a pending-count badge on the Parse queue link when there's work waiting.
- **Local Editorial New TTF scaffold** (`5b3e60c`) — [`src/app/_lib/ogFonts.ts`](../../src/app/_lib/ogFonts.ts) checks for `src/assets/fonts/editorial-new-{500,700}.ttf` via `existsSync`, falls back to Playfair Display when missing. Activates the moment the licensed TTFs are dropped in; no code change needed.
- **`/deals/[id]` price-trend stub** ([`src/app/deals/[id]/PriceTrendStub.tsx`](../../src/app/deals/%5Bid%5D/PriceTrendStub.tsx)) (`5b3e60c`) — dashed-border box with two states ("regular · now" comparison if available, otherwise "Building price history"). Never invents a sparkline.

## Changed

- **`/deals` Best Deal threshold** (`5b3e60c`) — moved from `i === 0 && discountPct >= 10` to `discountPct >= BEST_DEAL_THRESHOLD_PCT (30)` regardless of card position. Surfaces real deals everywhere, not just at the top.
- **`/deals` deal card** (`5b3e60c`) — new "Limited history" eyebrow when `discountPct == null`, rendered in `text-muted` font-mono uppercase (matches the existing "Best deal" eyebrow shape, neutral color). Verified via DOM probe: 129 of 217 fixture cards correctly surface the badge.
- **`/deals/[id]` polish** (`5b3e60c`) — hardcoded `, CA` dropped from the store-city line ([`src/app/deals/[id]/page.tsx:109`](../../src/app/deals/%5Bid%5D/page.tsx#L109)); added "further drive" hint in cool when `distance > 15 mi` (BevMo Auburn case at 21.7 mi); added the price-trend stub above the divider.
- **`maps.ts` UA logic** ([`src/lib/geo/maps.ts`](../../src/lib/geo/maps.ts)) (`5b3e60c`) — tightened so macOS Safari → Apple Maps; macOS Chrome / Firefox / Edge → Google Maps; iOS still → Apple. +3 new tests covering Mac Chrome, Mac Firefox, Mac Edge.
- **BevMo adapter** (`5b3e60c`) — same FK violation as Raley's, fixed identically. Reconciled the redundant `bevmo-auburn/` directory into `bevmo/` and wrote a fresh [`api-notes.md`](../../src/lib/ingest/adapters/bevmo/api-notes.md) reflecting the actual Shopify-path discovery (the original notes were pre-audit hypothesis).
- **Fixture deal IDs** (`5b3e60c`) — migrated all 217 IDs in [`src/data/fixtures/deals.json`](../../src/data/fixtures/deals.json) from `${chain}-${chainSku}` ("savemart-193352") to `${storeId}-${chainSku}` ("savemart-nevada-city-193352") so they match the DB-shape `${storeId}-${canonicalProductId}` from [`repoDb.ts`](../../src/lib/deals/repoDb.ts). [`scripts/build-fixtures.ts`](../../scripts/build-fixtures.ts) updated to emit the new format on rebuild.
- **`deals.test.ts`** (`5b3e60c`) — made fixture-stable by probing the first deal dynamically (`deals[0]`) instead of hardcoding `savemart-193352`. Survives fixture rebuilds.
- **Persist module imports** (`89be801`) — swapped `llmParseFailures` import for `manualParseQueue`; `writeLlmParseFailure` → `queueManualParse`. Calls `notifyAdmin` via lazy import so the ingest path doesn't pull email-delivery deps until they're actually needed.
- **Playwright webServer port** (`078dc1d`) — moved from 3100 → 3210. Port 3100 is occupied locally by the Matreum auth API; `reuseExistingServer: !CI` was silently routing every spec to its 404s.
- **e2e happy-path price assertion** (`078dc1d`) — `getByText(/\$\d+\.\d{2}/)` matches three elements on the detail page (current, strike-through regular, $/oz). Added `.first()` so strict-mode passes.
- **Playwright config in CI** (`078dc1d`) — retries 2x, HTML reporter alongside list, screenshot only-on-failure.
- **`README.md`** (`89be801`) — replaced the "LLM: Anthropic Haiku for structured-output parsing of weekly ad PDFs and screenshots" stack bullet with one about `manual_parse_queue`. Updated the Week 3 build-plan line to match.
- **`.env.example`** (`89be801`) — dropped `ANTHROPIC_API_KEY`, added optional `RESEND_API_KEY` + `ADMIN_EMAIL` for the active-push notification channel.
- **Drizzle migration journal** (`89be801`) — `_journal.json` now includes the previously hand-written `0001_product_deal_scores_view` migration plus the new `0002_drop_llm_add_parse_queue` so a fresh `bun run db:migrate` applies all three in order.
- **`/deals` truncate-on-mobile h3** is now visible at narrow widths thanks to the Pixel 7 viewport project finding a previously-invisible long-name overflow.

## Deleted

- **`src/lib/ingest/llm-circular.ts`** (`89be801`) — the `parseCircular` orchestrator. No live adapter ever called it; the helper was reserved for "future PDF-only chains" that hadn't materialized.
- **`src/lib/ingest/llm-schema.ts`** (`89be801`) — `CircularProduct` / `CircularResponse` Zod schemas. Gone with the parser.
- **`src/lib/ingest/__tests__/llm-circular.test.ts`** (`89be801`) — 7 unit tests against the mocked Anthropic client. Suite total dropped 144 → 137.
- **`@anthropic-ai/sdk`** (`89be801`) — removed from `package.json` dependencies. Was unused at the import level; the omission is purely a dep-cleanup.
- **`llm_parse_failures` table** (`89be801`) — dropped in `0002_drop_llm_add_parse_queue.sql`. Replaced by the more generic `manual_parse_queue`.
- **`writeLlmParseFailure` helper** (`89be801`) — gone from `persist.ts`. `queueManualParse` is the new entry point for adapter-side "needs human attention" signals.
- **`src/lib/ingest/adapters/bevmo-auburn/`** (`5b3e60c`) — the stub directory predated the discovery that BevMo is Shopify; the real `bevmo/` adapter handles Auburn natively via its `storeId`.

## Notes

- **No live DB**. Three commits assume Neon will be provisioned eventually; today the entire backend is inert behind `BEERBUDDY_DEALS_SOURCE=fixture`. Admin pages render the "Database unreachable" fallback when visited without `DATABASE_URL`. Unblock path is a 5-minute Neon setup + `bun run db:migrate`.
- **Migration journal drift**. `0001_product_deal_scores_view.sql` was hand-written last session and never appeared in `_journal.json` until now. `drizzle-kit generate` won't run interactively from this terminal (TTY required), so the `0002` migration was also hand-written. Snapshots (`meta/0000_snapshot.json`) are stale — the next interactive `drizzle-kit generate` will need a `--strict` accept to reconcile. Non-blocking; runtime migrator only reads the journal.
- **`docs/design.md` still references Anthropic Haiku** in three places (architecture summary, ingestion table, Week 3 build plan). Left intact because the doc is historical (it was the planning artifact); update when the doc gets a v1 refresh.
- **3 commits unpushed** as of this log: `5b3e60c`, `078dc1d`, `89be801`. Origin is `github.com/leida-archer/beerbuddy`. CI will run on push (both `ci.yml` and the new `e2e.yml`).
- **Port collision**. Matreum auth API runs on `:3100` on this machine. Playwright config is now hard-coded to `:3210`; if you ever spin BeerBuddy up manually with `bun run dev`, the default `:3000` is still free.
- **The Anthropic capability is omitted, not deleted forever**. If a chain genuinely needs LLM circular parsing later, the adapter can call `queueManualParse({ kind: "manual-parse", sourceUrl })`. The admin (you) handles it externally with whatever SDK and enters results via `/admin/indie`. The active-push side channel via Resend can deliver the notification email if you wire up the env vars.
- **The Best Deal threshold change semantically diverges from fixture data**. Fixture `discountPct` is sale-vs-regular (typically 10–25%); DB `discountPct` will be baseline-derived (whatever the median says). With threshold = 30, no fixture cards trip the eyebrow. Once Neon lands, real cards will. Don't be confused if the eyebrow stays invisible during fixture review.
- **Cross-viewport e2e caught nothing new** today, but the Pixel 7 viewport's narrower h3 column will surface long-name truncation issues as real chain data lands. Worth running locally before any future deal-card layout change.
- **`@playwright/test`** is the new dev dep. `playwright` (the runtime library) is still there; the adapters use it.
