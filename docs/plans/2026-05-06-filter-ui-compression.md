# Filter UI Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use parallel-execution (recommended) or execute-plan to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 3-row 13-chip filter UI on `/deals` with a single active-chip row + collapsible picker triggered by `?fp=open` URL state.

**Architecture:** All server-rendered, no client JS. Existing URL-param-driven approach extends with one new param (`fp`). Two old presentational components (`SortRow`, `FilterChips`) are replaced by two new ones (`ActiveChipRow`, `FilterPicker`). The pure URL-state helpers (`buildHref`, `Filters` type) are extracted to a sibling file so they're unit-testable in isolation.

**Tech Stack:** Next.js 15 App Router server components · Tailwind CSS · Vitest for unit tests · existing Golden Hour design tokens (`bg-ink`, `text-bg`, `border-rule`, `font-mono`, etc.)

**Spec:** [`docs/specs/2026-05-06-filter-ui-compression-design.md`](../specs/2026-05-06-filter-ui-compression-design.md)

---

## File Structure

| Path | Status | Responsibility |
|------|--------|---------------|
| `src/app/deals/url.ts` | **CREATE** | Pure URL-state types + `buildHref` + `parsePageState`. No React imports. Unit-tested. |
| `src/app/deals/__tests__/url.test.ts` | **CREATE** | Vitest tests for every transition in the spec's interaction map. |
| `src/app/deals/page.tsx` | **MODIFY** | Replace `SortRow` + `FilterChips` with `ActiveChipRow` + `FilterPicker`. Update searchParams parsing to extract `fp`. Remove old components when no longer referenced. |

The two new components live inline in `page.tsx` alongside the existing `Banner`, `EmptyResults`, and `DealCard` — same pattern as today. Total file is expected to grow from ~310 lines to ~380 lines, still in the "easy to hold in head" range.

---

## Task 1: Extract URL helpers to `src/app/deals/url.ts` with tests

**Files:**
- Create: `src/app/deals/url.ts`
- Create: `src/app/deals/__tests__/url.test.ts`
- Modify: `src/app/deals/page.tsx` (remove the local `buildHref` and `Filters` once imports are switched)

**Why first:** the URL-state logic is the only pure-function piece of this change. Locking it down with tests means the component work in tasks 2–4 can rely on it without re-deriving the URL behavior in each component.

- [ ] **Step 1: Create `url.ts` with `PageState`, `parsePageState`, and `buildHref`**

```typescript
// src/app/deals/url.ts

export type SortKey = "best" | "cheap" | "oz";

export interface PageState {
  sort: SortKey;
  pack: string | null;
  style: string | null;
  pickerOpen: boolean;
}

export const DEFAULT_SORT: SortKey = "best";

/** Parse Next.js searchParams into a typed PageState. */
export function parsePageState(
  sp: Record<string, string | string[] | undefined>,
): PageState {
  const sort = asString(sp.sort);
  return {
    sort: sort === "cheap" || sort === "oz" ? sort : DEFAULT_SORT,
    pack: asString(sp.pack),
    style: asString(sp.style),
    pickerOpen: asString(sp.fp) === "open",
  };
}

/**
 * Build a /deals href that applies the given changes on top of the
 * current state. Pass `null` to clear a param. Default values (sort=best,
 * pickerOpen=false) are omitted from the URL.
 */
export function buildHref(state: PageState, changes: Partial<PageState>): string {
  const next: PageState = { ...state, ...changes };
  const sp = new URLSearchParams();
  if (next.sort !== DEFAULT_SORT) sp.set("sort", next.sort);
  if (next.pack) sp.set("pack", next.pack);
  if (next.style) sp.set("style", next.style);
  if (next.pickerOpen) sp.set("fp", "open");
  const q = sp.toString();
  return q ? `/deals?${q}` : "/deals";
}

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return null;
}
```

- [ ] **Step 2: Create the test file with one passing assertion to verify the test runner picks it up**

```typescript
// src/app/deals/__tests__/url.test.ts
import { describe, expect, it } from "vitest";
import { buildHref, parsePageState, type PageState } from "../url";

describe("parsePageState", () => {
  it("returns defaults for empty params", () => {
    const s = parsePageState({});
    expect(s).toEqual({
      sort: "best",
      pack: null,
      style: null,
      pickerOpen: false,
    });
  });
});
```

- [ ] **Step 3: Run the new test to confirm it passes**

Run: `cd ~/Desktop/BeerBuddy && bun run test --run src/app/deals/__tests__/url.test.ts`
Expected: 1 test passing.

- [ ] **Step 4: Add the full test suite covering every spec interaction**

Replace `__tests__/url.test.ts` with the comprehensive suite below. The cases mirror every row in the spec's "Interaction map" plus the URL state model examples.

```typescript
import { describe, expect, it } from "vitest";
import { buildHref, parsePageState, type PageState } from "../url";

const empty: PageState = { sort: "best", pack: null, style: null, pickerOpen: false };

describe("parsePageState", () => {
  it("returns defaults for empty params", () => {
    expect(parsePageState({})).toEqual(empty);
  });

  it("reads sort=cheap and sort=oz", () => {
    expect(parsePageState({ sort: "cheap" }).sort).toBe("cheap");
    expect(parsePageState({ sort: "oz" }).sort).toBe("oz");
  });

  it("ignores unrecognized sort values", () => {
    expect(parsePageState({ sort: "totally-bogus" }).sort).toBe("best");
  });

  it("reads pack and style strings", () => {
    expect(parsePageState({ pack: "12", style: "ipa" })).toMatchObject({
      pack: "12",
      style: "ipa",
    });
  });

  it("reads fp=open as pickerOpen=true", () => {
    expect(parsePageState({ fp: "open" }).pickerOpen).toBe(true);
  });

  it("treats other fp values as closed", () => {
    expect(parsePageState({ fp: "closed" }).pickerOpen).toBe(false);
    expect(parsePageState({ fp: "" }).pickerOpen).toBe(false);
  });

  it("handles array-valued params (Next.js multi-value form)", () => {
    expect(parsePageState({ pack: ["12", "24"] }).pack).toBe("12");
  });
});

describe("buildHref — URL state model", () => {
  it("default state → /deals (no params)", () => {
    expect(buildHref(empty, {})).toBe("/deals");
  });

  it("sort=cheap only → /deals?sort=cheap", () => {
    expect(buildHref(empty, { sort: "cheap" })).toBe("/deals?sort=cheap");
  });

  it("multiple filters → /deals?sort=cheap&pack=12&style=ipa", () => {
    expect(
      buildHref(empty, { sort: "cheap", pack: "12", style: "ipa" }),
    ).toBe("/deals?sort=cheap&pack=12&style=ipa");
  });

  it("fp=open is added when pickerOpen=true", () => {
    expect(buildHref(empty, { pickerOpen: true })).toBe("/deals?fp=open");
  });

  it("fp=open + filters", () => {
    expect(
      buildHref(empty, { sort: "cheap", pack: "12", pickerOpen: true }),
    ).toBe("/deals?sort=cheap&pack=12&fp=open");
  });

  it("changing sort preserves other params", () => {
    const state: PageState = { sort: "best", pack: "12", style: "ipa", pickerOpen: true };
    expect(buildHref(state, { sort: "cheap" })).toBe(
      "/deals?sort=cheap&pack=12&style=ipa&fp=open",
    );
  });

  it("clearing pack with null preserves other params", () => {
    const state: PageState = { sort: "cheap", pack: "12", style: "ipa", pickerOpen: true };
    expect(buildHref(state, { pack: null })).toBe(
      "/deals?sort=cheap&style=ipa&fp=open",
    );
  });

  it("setting sort back to best removes it from URL", () => {
    const state: PageState = { sort: "cheap", pack: null, style: null, pickerOpen: false };
    expect(buildHref(state, { sort: "best" })).toBe("/deals");
  });

  it("closing picker (pickerOpen: false) removes fp from URL", () => {
    const state: PageState = { sort: "best", pack: null, style: null, pickerOpen: true };
    expect(buildHref(state, { pickerOpen: false })).toBe("/deals");
  });

  it("removing × on a filter chip preserves picker open state", () => {
    // Spec interaction map: "Tap × on a filter chip | remove that param; fp untouched"
    const state: PageState = { sort: "best", pack: "12", style: "ipa", pickerOpen: true };
    expect(buildHref(state, { pack: null })).toBe(
      "/deals?style=ipa&fp=open",
    );
  });

  it("toggling picker on with no filters → /deals?fp=open", () => {
    expect(buildHref(empty, { pickerOpen: true })).toBe("/deals?fp=open");
  });
});
```

- [ ] **Step 5: Run the full test suite and confirm everything passes**

Run: `cd ~/Desktop/BeerBuddy && bun run test --run`
Expected: all existing tests still pass + the new `url.test.ts` adds 18 cases (passing).

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/BeerBuddy
git add src/app/deals/url.ts src/app/deals/__tests__/url.test.ts
git commit -m "Extract /deals URL helpers to url.ts with comprehensive tests

PageState/parsePageState/buildHref now live in src/app/deals/url.ts
with 18 unit tests covering every transition in the spec's
interaction map. No behavior change yet — page.tsx still has its
own copy. Switched in the next task."
```

---

## Task 2: Migrate `page.tsx` to import from `url.ts`

**Files:**
- Modify: `src/app/deals/page.tsx`

**Why now:** Switch the page over to the new helpers BEFORE adding new UI, so the new components can rely on `PageState` without conflicting with the old local `Filters` interface.

- [ ] **Step 1: Add the import to the top of `page.tsx`**

```typescript
import { buildHref, parsePageState, type PageState, type SortKey } from "./url";
```

- [ ] **Step 2: Replace the local `Filters` interface with `PageState`**

In `page.tsx`:
- Remove the local `interface Filters {...}` block
- Remove the local `SortKey` type alias
- In `DealsPage`, change `const filters: Filters = {...}` to `const state = parsePageState(sp)`
- Find every `filters` reference and rename to `state` (search-replace)
- Remove the local `buildHref` function (now imported)
- Remove the local `asString` helper (no longer needed in page.tsx)

- [ ] **Step 3: Run typecheck to confirm the rename is consistent**

Run: `cd ~/Desktop/BeerBuddy && bun run typecheck`
Expected: clean (no errors).

- [ ] **Step 4: Run the dev server and smoke-test the existing UI still works**

Dev server should already be running. Visit:
- http://localhost:3000/deals — default view loads, 200 deals
- http://localhost:3000/deals?sort=cheap — first card price changes to $2.75
- http://localhost:3000/deals?pack=12 — header reads "42 of 200 deals"

If any of these fail, fix before continuing. (Common issue: stale `.next` cache. If errors mention `webpack_modules`, kill dev server, `rm -rf .next`, restart.)

- [ ] **Step 5: Run the full test suite**

Run: `cd ~/Desktop/BeerBuddy && bun run test --run`
Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/BeerBuddy
git add src/app/deals/page.tsx
git commit -m "Migrate /deals/page.tsx to import URL helpers from url.ts

No behavior change. Existing chips + sort still work identically;
this just removes the local copy of buildHref/Filters now that
url.ts is the canonical home."
```

---

## Task 3: Add `ActiveChipRow` component

**Files:**
- Modify: `src/app/deals/page.tsx`

**Goal:** Replace the existing `<SortRow>` and `<FilterChips>` rendering inside `DealsPage` with a single new `<ActiveChipRow state={state} />`. The row contains: the always-visible Sort chip, an `×`-removable chip for each active filter, and a "+ Filter" / "Done" toggle.

- [ ] **Step 1: Find the current call sites for `<SortRow>` and `<FilterChips>` in `DealsPage` (around lines 85–95)**

These are the two lines that need replacement:

```tsx
<SortRow filters={state} />
<FilterChips filters={state} />
```

Will be replaced (in the next step) with one `<ActiveChipRow state={state} />` line.

- [ ] **Step 2: Add the `ActiveChipRow` component definition above `SortRow` (around line 130)**

```tsx
function ActiveChipRow({ state }: { state: PageState }) {
  const sortLabel = SORT_OPTIONS.find((o) => o.key === state.sort)?.label ?? "Best deal";
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3 py-1">
      {/* Sort chip — always visible. Clicking the chip body opens the picker. */}
      <Link
        href={buildHref(state, { pickerOpen: true })}
        prefetch={false}
        className="font-body text-[13px] font-medium rounded-sm px-3 py-1.5 min-h-8 whitespace-nowrap border bg-ink text-bg border-ink"
        aria-label={`Sort: ${sortLabel}. Tap to change.`}
      >
        Sort: {sortLabel}
      </Link>

      {/* Pack filter chip (with ×) when set */}
      {state.pack && (
        <ActiveFilterChip
          label={`${state.pack}-pack`}
          state={state}
          clearChange={{ pack: null }}
        />
      )}

      {/* Style filter chip (with ×) when set */}
      {state.style && (
        <ActiveFilterChip
          label={STYLE_CHIPS.find((s) => s.key === state.style)?.label ?? state.style}
          state={state}
          clearChange={{ style: null }}
        />
      )}

      {/* Spacer pushes the +Filter/Done button to the right */}
      <div className="ml-auto" />

      {/* + Filter / Done toggle */}
      <Link
        href={buildHref(state, { pickerOpen: !state.pickerOpen })}
        prefetch={false}
        className="font-body text-[13px] font-medium rounded-sm px-3 py-1.5 min-h-8 whitespace-nowrap border bg-transparent text-ink border-ink hover:bg-bg-soft transition-colors duration-micro ease-settle"
      >
        {state.pickerOpen ? "Done" : "+ Filter"}
      </Link>
    </div>
  );
}

function ActiveFilterChip({
  label,
  state,
  clearChange,
}: {
  label: string;
  state: PageState;
  clearChange: Partial<PageState>;
}) {
  const removeHref = buildHref(state, clearChange);
  const openPickerHref = buildHref(state, { pickerOpen: true });
  return (
    <span className="inline-flex items-center rounded-sm bg-ink text-bg border border-ink overflow-hidden">
      <Link
        href={openPickerHref}
        prefetch={false}
        className="px-3 py-1.5 min-h-8 font-body text-[13px] font-medium leading-none flex items-center"
      >
        {label}
      </Link>
      <Link
        href={removeHref}
        prefetch={false}
        aria-label={`Remove ${label} filter`}
        className="px-2 py-1.5 min-h-8 leading-none text-[14px] flex items-center"
        style={{ color: "rgb(252 245 226 / 0.7)" /* text-bg/70 */ }}
      >
        ×
      </Link>
    </span>
  );
}
```

- [ ] **Step 3: Replace the call sites in `DealsPage`**

Find:
```tsx
<SortRow filters={state} />
<FilterChips filters={state} />
```

Replace with:
```tsx
<ActiveChipRow state={state} />
```

- [ ] **Step 4: Run typecheck**

Run: `cd ~/Desktop/BeerBuddy && bun run typecheck`
Expected: clean. (If TypeScript complains about unused `SortRow` or `FilterChips`, that's expected — they're orphaned. We delete them in task 5.)

- [ ] **Step 5: Manual smoke test**

Visit `http://localhost:3000/deals` — you should see:
- A single row with `[Sort: Best deal]` (ink-filled) on the left and `+ Filter` (ghost) on the right
- No second/third chip rows below it
- The list of deals renders unchanged

Try `http://localhost:3000/deals?pack=12&style=ipa` — should show:
- `[Sort: Best deal] [12-pack ×] [IPA ×]   [+ Filter]`
- Tapping `×` on `12-pack` should navigate to `/deals?style=ipa` and the chip disappears
- Tapping the `12-pack` chip body (NOT the ×) should navigate to `/deals?pack=12&style=ipa&fp=open` (picker open)

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/BeerBuddy
git add src/app/deals/page.tsx
git commit -m "Add ActiveChipRow: sort always-pinned + active filters with ×

Replaces the visible call sites for SortRow + FilterChips inside
DealsPage. The old components are still defined below (orphaned)
and will be removed in a follow-up commit once the picker lands."
```

---

## Task 4: Add `FilterPicker` component

**Files:**
- Modify: `src/app/deals/page.tsx`

**Goal:** When `state.pickerOpen` is true, render the SORT / PACK / STYLE chip picker inline below the active row.

- [ ] **Step 1: Add `FilterPicker` component definition (place after `ActiveChipRow` around line 200)**

```tsx
function FilterPicker({ state }: { state: PageState }) {
  if (!state.pickerOpen) return null;
  return (
    <section className="border-y border-rule py-4 mb-4 space-y-4">
      <PickerSection heading="Sort">
        {SORT_OPTIONS.map((opt) => (
          <PickerChip
            key={opt.key}
            label={opt.label}
            active={state.sort === opt.key}
            href={buildHref(state, { sort: opt.key })}
          />
        ))}
      </PickerSection>

      <PickerSection heading="Pack">
        <PickerChip
          label="All"
          active={!state.pack}
          href={buildHref(state, { pack: null })}
        />
        {PACK_CHIPS.map((pack) => (
          <PickerChip
            key={pack}
            label={`${pack}-pack`}
            active={state.pack === pack}
            href={buildHref(state, {
              pack: state.pack === pack ? null : pack,
            })}
          />
        ))}
      </PickerSection>

      <PickerSection heading="Style">
        <PickerChip
          label="All"
          active={!state.style}
          href={buildHref(state, { style: null })}
        />
        {STYLE_CHIPS.map((style) => (
          <PickerChip
            key={style.key}
            label={style.label}
            active={state.style === style.key}
            href={buildHref(state, {
              style: state.style === style.key ? null : style.key,
            })}
          />
        ))}
      </PickerSection>
    </section>
  );
}

function PickerSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mb-2">
        {heading}
      </h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PickerChip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "true" : undefined}
      className={`font-body text-[13px] font-medium rounded-sm px-3 py-1.5 min-h-8 whitespace-nowrap border transition-colors duration-micro ease-settle ${
        active
          ? "bg-ink text-bg border-ink"
          : "bg-transparent text-ink border-rule hover:bg-bg-soft hover:border-ink"
      }`}
    >
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Insert `<FilterPicker>` into `DealsPage` immediately below `<ActiveChipRow>`**

Find the line:
```tsx
<ActiveChipRow state={state} />
```

Replace with:
```tsx
<ActiveChipRow state={state} />
<FilterPicker state={state} />
```

- [ ] **Step 3: Run typecheck**

Run: `cd ~/Desktop/BeerBuddy && bun run typecheck`
Expected: clean.

- [ ] **Step 4: Manual smoke test — every row in the spec's interaction map**

Visit `http://localhost:3000/deals` and walk through these in order:

1. **Default state** — no picker visible. Active row shows `[Sort: Best deal] [+ Filter]`.
2. **Click "+ Filter"** — URL becomes `/deals?fp=open`. Picker section appears below with SORT/PACK/STYLE headings and chips. Sort=Best deal is highlighted.
3. **Click "Cheapest" inside picker** — URL becomes `/deals?sort=cheap&fp=open`. Active row updates to `[Sort: Cheapest]`. Picker stays open. First deal price drops.
4. **Click "12" inside Pack section** — URL becomes `/deals?sort=cheap&pack=12&fp=open`. Active row now shows `[Sort: Cheapest] [12-pack ×]`. Header reads "42 of 200".
5. **Click "IPA"** — `/deals?sort=cheap&pack=12&style=ipa&fp=open`. Active row gets a third chip. Header reads "4 of 200".
6. **Click "Done"** — URL becomes `/deals?sort=cheap&pack=12&style=ipa`. Picker collapses; active row remains.
7. **Click `×` on the IPA chip** — URL becomes `/deals?sort=cheap&pack=12`. The IPA chip disappears. Picker stays closed (the `×` does not toggle `fp`).
8. **Click the "Sort: Cheapest" chip body** — URL becomes `/deals?sort=cheap&pack=12&fp=open`. Picker re-opens.
9. **Click "Best deal" inside picker** — URL becomes `/deals?pack=12&fp=open`. Active row shows `[Sort: Best deal] [12-pack ×]`. (sort=best is the default and is omitted from URL.)
10. **Click "All" inside Pack section** — URL becomes `/deals?fp=open`. Pack chip disappears.
11. **Click "Done"** — back to default state with picker closed.

If ANY transition fails, debug before commit. The most likely culprits are mismatches between the active-state highlighting and the URL params, or a missing `fp` preservation on a chip click.

- [ ] **Step 5: Run the full test suite**

Run: `cd ~/Desktop/BeerBuddy && bun run test --run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/BeerBuddy
git add src/app/deals/page.tsx
git commit -m "Add FilterPicker: collapsible chip selector behind ?fp=open

Renders inline below the active chip row when ?fp=open is present.
Three sections (Sort/Pack/Style) with hairline dividers. Walked
all 11 interaction-map transitions; every one matches the spec."
```

---

## Task 5: Remove orphaned old components + final cleanup

**Files:**
- Modify: `src/app/deals/page.tsx`

**Goal:** Delete the now-unused `SortRow`, `FilterChips`, and `ChipLink` components left behind after task 3. Update `EmptyResults` so its "Clear filters" link preserves picker-open state per the spec.

- [ ] **Step 1: Delete `SortRow` from `page.tsx`**

Locate the `function SortRow({ filters }: { filters: PageState })` block and remove it entirely (the component and its usages were already replaced in task 3).

- [ ] **Step 2: Delete `FilterChips` from `page.tsx`**

Locate `function FilterChips({ filters }: { filters: PageState })` and remove it.

- [ ] **Step 3: Decide on `ChipLink`**

If `ChipLink` is no longer referenced anywhere (typecheck will report this), delete it. Otherwise leave it.

Run: `cd ~/Desktop/BeerBuddy && grep -n "ChipLink" src/app/deals/page.tsx`
- If only the function definition shows up: delete the whole block.
- If usages remain (unlikely): leave it.

- [ ] **Step 4: Update `EmptyResults` to preserve picker-open state**

Per the spec: "Clear filters" should send the user to `/deals?fp=open` so the picker is still open after clearing — useful when iterating.

Find the existing `EmptyResults` component. Locate the line:

```tsx
<Link href="/deals" ...>Clear filters</Link>
```

Replace with:

```tsx
<Link href={buildHref(state, { pack: null, style: null, sort: "best", pickerOpen: true })} ...>
  Clear filters
</Link>
```

Update `EmptyResults`'s prop signature to accept `state: PageState` instead of (or in addition to) `filters`. Rename inside the component as needed.

Update the call site in `DealsPage` from `<EmptyResults filters={state} />` to `<EmptyResults state={state} />`.

- [ ] **Step 5: Run typecheck**

Run: `cd ~/Desktop/BeerBuddy && bun run typecheck`
Expected: clean (no orphaned references).

- [ ] **Step 6: Run the full test suite**

Run: `cd ~/Desktop/BeerBuddy && bun run test --run`
Expected: all tests pass (no regressions in url.test.ts or any other suite).

- [ ] **Step 7: Run the production build**

Run: `cd ~/Desktop/BeerBuddy && bun run build`
Expected: build completes, `/deals` listed as a static or dynamic route, no warnings.

- [ ] **Step 8: Final manual smoke pass**

Walk all 11 transitions from task 4 step 4 once more. Verify nothing regressed.

Specifically test the empty state:
- Visit `http://localhost:3000/deals?pack=1000` — empty state shows. Click "Clear filters" — should land on `/deals?fp=open` with the picker open and the full deal list back.

- [ ] **Step 9: Commit**

```bash
cd ~/Desktop/BeerBuddy
git add src/app/deals/page.tsx
git commit -m "Remove orphaned SortRow/FilterChips; wire EmptyResults to preserve fp

Clean up after the active-chip-row migration. Empty-state's 'Clear
filters' link now lands at /deals?fp=open per spec — friendlier
when the user is iterating filter combinations."
```

---

## Done criteria

- [ ] All 5 tasks above complete and committed
- [ ] `bun run typecheck` clean
- [ ] `bun run test --run` all tests pass (existing suite + 18 new url.test.ts cases)
- [ ] `bun run build` succeeds with no warnings
- [ ] All 11 interaction-map transitions validated manually on `localhost:3000/deals`
- [ ] `git log --oneline` shows 5 atomic commits, each with a clear message
- [ ] No client-side JS added (page is still a server component)

## Notes for the implementer

- **Don't reach for `rounded-full`** — the design system explicitly rejects pill chips. Stick with `rounded-sm` (4 px) per the spec's styling section.
- **Don't add `'use client'`** — every interaction in this spec is achievable with `<Link>` server-side. Adding client components would defeat the architecture.
- **If the dev server returns weird Webpack errors** during testing, kill it, `rm -rf .next`, restart with `bun run dev`. Next.js's incremental cache occasionally drifts after structural changes; a clean rebuild fixes it.
- **The `×` color** uses inline `style={{ color: "rgb(252 245 226 / 0.7)" }}` rather than a Tailwind utility because there's no existing `text-bg/70` token in the config. This is fine — it's an isolated case.
