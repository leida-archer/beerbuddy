# Filter UI Compression — Active-Chip Row + Collapsible Picker

**Date:** 2026-05-06
**Scope:** `src/app/deals/page.tsx`
**Status:** Draft (awaiting review)

## Problem

The current `/deals` filter UI shows three rows of chips at all times:

1. Sort: Best deal / Cheapest / $/oz (3 buttons)
2. Pack: All packs / 6 / 12 / 18 / 24 / 30 (6 chips)
3. Style: All styles / IPA / Lager / Stout (4 chips)

Total: 13 interactive elements occupy ~120 px of vertical space above the deal list — every visit, regardless of whether the user has any filters set. On a 480 px-wide mobile column this is a meaningful share of the viewport. The chips have low signal density: the user sees 13 options to pick "12-pack" once.

Goal: collapse the default state to ~2 visible elements and reveal the full picker only when the user wants to change filters.

## Design

### Active-chip row (default state, always visible)

A single horizontal row above the deal list containing:

- **Sort chip** — always shown. Format `Sort: <label>` (e.g. "Sort: Best deal"). No `×`. Tapping it opens the picker.
- **Active filter chips** — one per non-default filter param. Each with a trailing `×`. Examples: `12-pack ×`, `IPA ×`. Tapping the chip body opens the picker; tapping `×` removes that filter.
- **"+ Filter" button** — opens the picker. Replaced by **"Done"** when picker is open.

Empty default state:

```
Sort: Best deal                                + Filter
```

State with two filters set:

```
Sort: Cheapest │ 12-pack × │ IPA ×             + Filter
```

### Collapsible picker

Opens inline below the active chip row when URL has `?fp=open`. Closes when `fp` param is absent.

```
Sort: Cheapest │ 12-pack × │ IPA ×             Done
─────────────────────────────────────────────────
SORT
  [Best deal]  [Cheapest *]  [$/oz]

PACK
  [All]  [6]  [12 *]  [18]  [24]  [30]

STYLE
  [All]  [IPA *]  [Lager]  [Stout]
─────────────────────────────────────────────────
```

- `*` indicates the currently-active option in that section (visually: ink-fill background, `aria-current="true"`).
- Tapping any chip toggles its filter param (and preserves `fp=open` so the picker stays open while the user makes multiple changes).
- Tapping **Done** removes `fp=open` from the URL — picker collapses.
- Section headings (`SORT` / `PACK` / `STYLE`) are mono-typed small-caps (existing eyebrow style).

### URL state model

Existing params unchanged: `sort`, `pack`, `style`. New optional param: `fp` (filter picker).

```
/deals                                  default state, picker closed
/deals?fp=open                          picker open, no filters set
/deals?sort=cheap                       sort=cheap, picker closed
/deals?sort=cheap&fp=open               sort=cheap, picker open
/deals?sort=cheap&pack=12&style=ipa     filters set, picker closed
/deals?sort=cheap&pack=12&fp=open       picker open while filtering
```

Sort=best is the default and is omitted from the URL (existing behavior; keep).

### Interaction map

| User action | URL effect | Visual effect |
|---|---|---|
| Tap "+ Filter" (closed) | add `fp=open` | Picker expands below active row; "+ Filter" → "Done" |
| Tap "Done" (open) | remove `fp` | Picker collapses |
| Tap sort chip in active row | add `fp=open` | Picker opens (so user can change sort) |
| Tap × on a filter chip | remove that param; `fp` untouched | Chip disappears; deal list updates; picker stays open if it was open, closed if it was closed |
| Tap a chip in the picker | set that dimension to the chip's value | Active chip in active row updates; picker stays open. Tapping the **already-active** chip is a no-op (sort) or clears the filter (pack/style — same as tapping All) |
| Tap "All" inside picker | clear that dimension's param | Same as tapping the already-active chip on pack/style; picker stays open |

### Empty results

When filters exclude all deals (current behavior), the existing "No deals match your filters" + "Clear filters" CTA stays. "Clear filters" links to `/deals?fp=open` so the picker is still open after clearing — useful when the user is iterating.

## Implementation

All logic stays server-side. The page is still a server component reading `searchParams`. New helper:

```ts
// Existing in page.tsx
interface Filters { sort: SortKey; pack: string | null; style: string | null; }

// New: add picker state
interface PageState extends Filters { pickerOpen: boolean; }
```

`buildHref` extends to optionally preserve / set / clear `fp`:

```ts
function buildHref(
  state: PageState,
  changes: Partial<PageState>,
): string { ... }
```

Component changes:
- Replace `<SortRow>` and `<FilterChips>` with two new components:
  - `<ActiveChipRow state={state} />` — sort chip + active filter chips + "+ Filter" / "Done"
  - `<FilterPicker state={state} />` — only renders when `state.pickerOpen` is true
- Both components are server-rendered; chips are `<Link>` components.

No new dependencies. No client-side JS. No state library.

### Accessibility

- Chips remain `<Link>` (not `<button>`) — preserves keyboard navigation and right-click "open in new tab" semantics that work today.
- The active filter chips' `×` is a separate `<Link>` inside the chip with its own `aria-label="Remove {filter}"`.
- The picker section headings are real `<h3>` elements (with visually-hidden helper text if needed for semantic flow).
- Tab order: active chips → "+ Filter" / "Done" → picker chips top-to-bottom.

### Styling

Uses existing Golden Hour tokens — no new colors or spacing values.

- **Chip shape:** rectangular with `rounded-sm` (4 px). DESIGN.md explicitly forbids pill-shaped chips — do not reach for `rounded-full`.
- **Active chips** (sort + currently-active filters): `bg-ink text-bg` fill, 1 px ink border. The `×` is a separate `<Link>` rendered inside, sized 14 px, color `text-bg/70` (the bg color at 70% opacity — readable on ink, visibly less prominent than the chip label).
- **Inactive chips** (in picker): transparent background, `border-rule` 1 px outline, `text-ink` label.
- **"+ Filter" / "Done" button:** ghost style with 1 px `border-ink` outline, transparent background, `text-ink`.
- **Picker container:** hairline `border-rule` top + bottom, `border-rule` section dividers between SORT / PACK / STYLE.
- **Section headings (SORT / PACK / STYLE):** `font-mono text-[10px] uppercase tracking-[0.14em] text-muted`.

## Out of scope

- Multi-select within a single dimension (e.g., picking IPA AND Lager). v0 stays single-value per dimension.
- New filter dimensions (store, on-sale, ABV). Earlier brainstorm explicitly cut these.
- Filter persistence across sessions (cookies / localStorage). Earlier brainstorm option A; not chosen.
- Animations on picker expand/collapse. Server re-renders the page; the picker either renders or it doesn't. No transition.
- Mobile gestures (swipe to dismiss). Tap-only.

## Testing

- Unit-test `buildHref` for every state transition documented in the interaction map.
- Manual smoke: walk every column of the interaction-map table on `localhost:3000/deals` and confirm URL + visual match.
- Verify the empty-results path: `/deals?pack=1000&fp=open` should still show empty state but with picker open.

## Risk / Open Questions

- Sort can't be "cleared" — tapping the sort chip in the active row simply opens the picker. The user might initially expect a × to remove sort. Mitigated by always rendering "Sort: <label>" rather than just "<label>" — the label-prefix signals it's persistent, not removable.
- Picker open + no filters set is a valid state — an empty picker UI showing all chips. Acceptable; lets users discover the filter dimensions on first visit.
- Long active-chip row (many filters set) may overflow the 480 px column. Mitigation: row is `overflow-x: auto` (existing chip rows already do this).
