# ZIP Gate — Homepage Form + `/deals` Validation

**Date:** 2026-05-06
**Scope:** `src/app/page.tsx`, `src/app/deals/page.tsx`, `src/app/deals/url.ts`, `src/lib/geo/zip.ts` (new)
**Status:** Draft (awaiting review)

## Problem

Today's homepage at `src/app/page.tsx` is a marketing hero with a single "See this week's deals →" link to `/deals`. The `/deals` header carries a right-aligned summary string — `RALEY'S · BEVMO · HOLIDAY MARKET · SAVE MART · GROCERY OUTLET / 2 OF 200 DEALS` — which mixes a static list of supported chains with a dynamic deal count. The string is dense, low-signal, and burns valuable header real estate on information the user neither asked for nor needs after their first visit.

Concurrently, the app has no concept of *where* the user is. The deal list is the same regardless of who's looking, even though the underlying data is meaningful only to Nevada County, CA shoppers. There's no front-door check that someone in Los Angeles isn't seeing prices from stores 480 miles away.

Goal: gate the deal list behind a ZIP entry, and replace the noisy header summary with a single coherent location indicator. Keep the architecture URL-driven, server-rendered, and consistent with the existing `/deals` filter model.

## Design

### URL contract

```
/                                         homepage, fresh state (form empty)
/?error=region&zip=90210                  homepage, error state (input pre-filled, red border, error block)
/deals?zip=95945                          deals page, normal state
/deals?zip=95945&sort=cheap&pack=12       valid ZIP combined with existing filters
/deals                                    → 307 redirect to /
/deals?zip=12345                          → 307 redirect to /?error=region&zip=12345
/deals?zip=abc                            → 307 redirect to /?error=region&zip=abc  (treated same as out-of-area)
/deals?zip=                               → 307 redirect to /  (empty zip = same as none)
```

The `zip` param sits alongside the existing `sort`/`pack`/`style`/`fp` params. It is **always required** on `/deals` — the page cannot render without one. There is no default value to omit from the URL.

### ZIP allowlist

New module at `src/lib/geo/zip.ts`:

```typescript
/**
 * Nevada County, CA ZIPs covered by BeerBuddy v0. Tightened from the
 * full county list to ZIPs where every chain in the dataset has a
 * validated nearby store. Add an entry here to expand coverage; no
 * other code change is required.
 */
export const SUPPORTED_ZIPS = new Set<string>([
  "95945", // Grass Valley
  "95946", // Penn Valley
  "95949", // Lake of the Pines / Grass Valley
  "95959", // Nevada City
]);

export function isValidZip(zip: string): boolean {
  return SUPPORTED_ZIPS.has(zip);
}
```

Pure TypeScript. No React, no Next imports. Sibling of the existing `src/lib/geo/haversine.ts`. Unit-tested in isolation.

### Homepage (`src/app/page.tsx`) — replaced

Today's hero is replaced with a minimal form-first layout: wordmark + "Enter your ZIP" label + 5-digit input + dark submit button. The marketing tagline is removed. The CTA anchor is removed.

Component shape (server component):

```tsx
export default async function Home(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const rejectedZip = asString(sp.zip);
  const hasError = asString(sp.error) === "region";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-warm mb-8 font-medium">
        Golden Hour
      </div>

      <h1 className="font-display font-medium text-5xl sm:text-7xl leading-none tracking-tight mb-8">
        BeerBuddy<span className="text-warm">.</span>
      </h1>

      <form action="/deals" method="get" className="w-full max-w-[240px]">
        <label
          htmlFor="zip"
          className="block font-mono text-[10px] tracking-[0.16em] uppercase text-muted mb-2 text-left"
        >
          Enter your ZIP
        </label>
        <div className="flex gap-1.5">
          <input
            id="zip"
            name="zip"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            required
            defaultValue={rejectedZip ?? ""}
            autoComplete="postal-code"
            className={`flex-1 min-w-0 bg-surface rounded-sm px-3 py-2.5 font-mono text-base text-ink tracking-[0.06em] border ${
              hasError ? "border-error" : "border-ink"
            }`}
          />
          <button
            type="submit"
            className="bg-ink text-bg border border-ink rounded-sm px-4 py-2.5 font-body text-[13px] font-medium leading-none min-h-11"
          >
            →
          </button>
        </div>

        {hasError && <ZipErrorBlock />}
      </form>

      <div className="mt-24 pt-4 border-t border-rule font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Nevada County, CA · v0
      </div>
    </main>
  );
}
```

Notes:
- `<form action="/deals" method="get">` is plain HTML. No JavaScript. Submitting produces `/deals?zip=<value>` and the browser navigates.
- `pattern="[0-9]{5}"` + `maxLength={5}` + `inputMode="numeric"` + `autoComplete="postal-code"` together: numeric keypad on mobile, mild client-side rejection of non-numeric, browser autofill works.
- `defaultValue={rejectedZip ?? ""}` pre-fills the input when the user is bounced back with `?zip=…`, so they can edit instead of retype.
- The footer reads `Nevada County, CA · v0` (replacing the previous `v0 · 2026-05-05` build stamp) — a clearer signal of where this app works.

### Error block

Renders inside the form when `hasError` is true.

```tsx
function ZipErrorBlock() {
  return (
    <div className="mt-3 text-left max-w-[240px] mx-auto">
      <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-error font-semibold mb-1">
        Out of area
      </div>
      <p className="text-[12px] text-ink leading-[1.5]">
        BeerBuddy isn't ready in your region yet. We're starting in Nevada County, CA.
      </p>
    </div>
  );
}
```

The error message does NOT enumerate the supported ZIPs.

`?error=region` is the only recognized error value. Any other value (e.g., `?error=foo`) is treated as no error — the homepage renders the clean form.

Recovery: the user edits the pre-filled ZIP and resubmits. Same form GET → same `/deals` validation → either renders deals or bounces back with the new rejected value.

### `/deals` URL helpers — extended

`src/app/deals/url.ts` adds one field to `PageState`:

```typescript
export interface PageState {
  zip: string;          // always set; the page cannot render without one
  sort: SortKey;
  pack: string | null;
  style: string | null;
  pickerOpen: boolean;
}
```

`parsePageState` reads `zip` from `searchParams` (treated as a plain string — server-side validation is the contract; this helper does not reject anything). It defaults to `""` when absent, so the helper has a defined standalone contract; the production redirect catches the empty-zip case before this point.

`buildHref` emits `zip` unconditionally — there's no default to omit. Updated body:

```typescript
export function buildHref(state: PageState, changes: Partial<PageState>): string {
  const next: PageState = { ...state, ...changes };
  const sp = new URLSearchParams();
  sp.set("zip", next.zip);                     // ← always emitted, no default
  if (next.sort !== DEFAULT_SORT) sp.set("sort", next.sort);
  if (next.pack) sp.set("pack", next.pack);
  if (next.style) sp.set("style", next.style);
  if (next.pickerOpen) sp.set("fp", "open");
  return `/deals?${sp.toString()}`;            // always has at least zip=
}
```

The previous `q ? "/deals?…" : "/deals"` short-circuit goes away — every URL now has at least `?zip=…`, so the query string is always non-empty.

The existing `asString` helper is exported (signature: `(v: string | string[] | undefined) => string | null`) so the homepage can use the same parsing logic.

Every existing `<Link>` on `/deals` flows through `buildHref(state, …)`, so all chips, the picker, the `×` removals, the `+ Filter` / `Done` toggle, and the `Clear filters` link in `EmptyResults` automatically carry `zip` through state transitions. **Zero per-call-site edits.**

### `/deals` server-side validation

Runs at the top of `DealsPage`, before any data fetch:

```tsx
import { redirect } from "next/navigation";
import { isValidZip } from "@/lib/geo/zip";

const sp = await props.searchParams;
const rawZip = asString(sp.zip);

if (!rawZip) redirect("/");
if (!isValidZip(rawZip)) {
  redirect(`/?error=region&zip=${encodeURIComponent(rawZip)}`);
}

const state = parsePageState(sp);  // zip guaranteed valid past this point
```

Both branches are server-side `redirect()` (Next 15) — produce a 307, no flash of broken content. After the gate, all existing logic (filtering, sorting, rendering) is unchanged.

### `/deals` header — right-side swap

**Before** (`src/app/deals/page.tsx` lines 78–83):

```tsx
<div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted text-right">
  {storeNames}
  <br />
  {deals.length} of {allDeals.length} deals
</div>
```

**After:**

```tsx
<Link
  href="/"
  prefetch={false}
  className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted text-right underline decoration-rule decoration-1 underline-offset-[3px] hover:text-ink hover:decoration-ink"
>
  Location: {state.zip}
</Link>
```

- Same Geist Mono uppercase eyebrow style as the removed text — sits in the exact same header slot.
- Underline on by default (the app is mobile-primary; hover-to-reveal doesn't apply).
- Uses `decoration-rule` (the design system's hairline color) at 1 px with a 3 px offset — present but quiet.
- Hover/focus darkens text and underline to `text-ink` / `decoration-ink`.
- Clicking returns to `/` so the user can change ZIP.

The `storeNames` derivation, the `deals.length`/`allDeals.length` count, and the `<br/>` between them are all removed. The deal count was not displayed anywhere else; this is a clean delete.

## Implementation outline

| File | Action | What |
|------|--------|------|
| `src/lib/geo/zip.ts` | **CREATE** | `SUPPORTED_ZIPS` set + `isValidZip` predicate. |
| `src/lib/geo/__tests__/zip.test.ts` | **CREATE** | 8 cases (4 supported + 4 negative). |
| `src/app/deals/url.ts` | **MODIFY** | Add `zip` to `PageState`. Update `parsePageState` and `buildHref`. Export `asString`. |
| `src/app/deals/__tests__/url.test.ts` | **MODIFY** | Add ~6 cases covering `zip` parsing + preservation across transitions. |
| `src/app/deals/page.tsx` | **MODIFY** | Add server-side ZIP gate at top of `DealsPage`. Replace right-side header text with `Location:` link. |
| `src/app/page.tsx` | **REPLACE** | Today's marketing hero replaced with the minimal-form-first homepage + `ZipErrorBlock`. |

No new dependencies. No client JS. No server actions.

## Out of scope

- ZIP+4 support (`95945-1234`). Exactly 5 digits required.
- Geolocation / browser GPS auto-detect.
- City name lookup ("Grass Valley" → `95945`).
- Persistent storage (cookies, localStorage). URL-only is the locked persistence model.
- Listing valid ZIPs in the error message.
- Per-store distance ranking based on entered ZIP.
- Distinguishing "invalid format" from "out of area" in the error UI — both fall through to the same error block.
- Internationalization / non-US ZIPs.
- Saving the rejected ZIP to any analytics surface.

## Testing

### Unit — `src/lib/geo/__tests__/zip.test.ts`

Eight cases covering:
- `isValidZip("95945")` → true
- `isValidZip("95946")` → true
- `isValidZip("95949")` → true
- `isValidZip("95959")` → true
- `isValidZip("90210")` → false (out of area)
- `isValidZip("")` → false (empty)
- `isValidZip("abcde")` → false (non-numeric)
- `isValidZip("9594512")` → false (wrong length)

### Unit — `src/app/deals/__tests__/url.test.ts` extension

~6 new cases covering:
- `parsePageState` reads `zip`.
- `parsePageState` defaults `zip` to empty string when absent. (The `/deals` redirect catches that case before `parsePageState` runs in production, but the helper's contract should be defined.)
- `buildHref` always emits `zip` to the URL.
- `buildHref` preserves `zip` when only sort/pack/style/fp changes.
- `buildHref` correctly composes `zip` with the picker-open state.
- Removing a filter via `×` preserves `zip`.

`url.test.ts` grows from 18 → ~24 cases. Combined with the 8 new `zip.test.ts` cases, the full suite goes from 78 → ~92 cases.

### Manual smoke walk

1. Visit `/` cold → empty form, no error block.
2. Submit `95945` → lands on `/deals?zip=95945` rendering normally; header right side reads `Location: 95945` underlined.
3. Submit `90210` → lands on `/?error=region&zip=90210`; input pre-filled with `90210`, brick-red border, "Out of area" error block visible.
4. Visit `/deals` directly → 307 redirect to `/`.
5. Visit `/deals?zip=99999` → 307 redirect to `/?error=region&zip=99999`.
6. From `/deals?zip=95945&sort=cheap&pack=12&fp=open`, click any chip `×`, sort option, or pack chip → resulting URLs all carry `zip=95945`.
7. Click `Location: 95945` in the header → returns to `/` with empty form.

### Build / typecheck

`bun run typecheck && bun run test --run && bun run build` clean. No new warnings.

## Risk / open questions

- **`/deals` is now always-redirect-able.** Any direct hit without `zip` redirects to `/`. Old shareable links to bare `/deals` (from before this change) will redirect — acceptable, but worth knowing.
- **The rejected ZIP is reflected back in the URL.** If a user enters something they regret (e.g., a typo, or a ZIP they don't want logged), it's visible in the address bar until they edit it. This is the same shape as Google's `?q=…` reflecting search terms. No analytics surface saves it.
- **No per-error-type messaging.** A user who types `abc` sees "Out of area," same as a user who types `90210`. The HTML form's `pattern="[0-9]{5}"` should catch `abc` client-side most of the time, but if it doesn't (e.g., paste, no-JS browser), the server treats it as the generic "out of area" case. Acceptable for v0.
- **The header `Location:` link goes to `/`, not back to where the user came from.** If they navigated from `/deals?zip=95945&sort=cheap&pack=12`, they lose that filter context. Acceptable since the typical reason to click `Location:` is to change ZIP, which invalidates the deal context anyway.
