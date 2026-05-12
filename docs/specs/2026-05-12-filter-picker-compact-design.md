# Compact Filter Picker — Single-Line Scroll Row + Drop Style

**Date:** 2026-05-12
**Scope:** `src/app/deals/page.tsx`, `src/app/deals/url.ts`, `src/app/deals/__tests__/url.test.ts`, `DESIGN.md`
**Status:** Draft (awaiting review)
**Supersedes the picker section of:** `docs/specs/2026-05-06-filter-ui-compression-design.md` (closed-row design from that spec is preserved unchanged)

## Problem

The 2026-05-06 compression collapsed three filter rows into a single active-chip row + collapsible picker. The closed state is clean, but the **open picker is still visually heavy**: a bordered container with three section headings (`SORT` / `PACK` / `STYLE`), 13 bordered chips, and section dividers. Total open-state height: ~96 px above the deal list.

Two compounding issues:

1. The chip-based picker carries chrome (1 px border + fill on every option) that the rest of the Golden Hour system avoids — DESIGN.md explicitly prefers text-link affordances over bordered controls.
2. The Style dimension is a name-substring match against the product title (`name.toLowerCase().includes(needle)`). It's blunt, the catalog is small, and it competes with Sort + Pack for visual weight without earning its row.

Goal: cut the open picker's vertical weight by ~50% and remove a dimension that isn't pulling its weight.

## Design

### Single-line picker row

The collapsible picker becomes one horizontal row containing both axes inline, separated by a hairline dot. Axis label is mono-small-caps; options are plain text links; the active option is bold + amber-underlined.

```
─────────────────────────────────────────────────
SORT  Best  Cheapest̲  $/oz   ·   PACK  Any  6  12̲  18  24  30
─────────────────────────────────────────────────
```

(`̲` shows the amber underline marking the active option.)

- Border: hairline `border-rule` top + bottom (existing token), no left/right border.
- Vertical padding: 14 px top + 14 px bottom on the scroll container. With option-link padding of 8 px top/bottom, effective touch target is ~44 px — satisfies the WCAG 2.1 AA floor.
- Right edge: a 32 px linear-gradient fade from `transparent` → `var(--color-bg)` (the wheat page color) overlays the right side of the row. Signals "more content offscreen" on viewports narrower than the content width.
- Scroll behavior: `overflow-x: auto`, `scroll-snap-type: x mandatory`, with `scroll-snap-align: start` on each axis container. Flicks land cleanly on "Sort" or "Pack". Scrollbar hidden via `scrollbar-width: none` + `::-webkit-scrollbar { display: none }`.

### Active option visual

```css
.opt-active {
  text-decoration: underline;
  text-decoration-color: var(--color-warm);  /* B8651E */
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
  font-weight: 600;
}
```

The amber underline is the only design-system color outside ink/wheat used in the picker — consistent with the BEST DEAL eyebrow's existing use of warm amber as the single accent.

### Axis structure

| Axis | Options | Default | "Clear" affordance |
|------|---------|---------|---------------------|
| Sort | Best · Cheapest · $/oz | `Best` (omitted from URL) | None — sort is always active. Tapping the **already-active option inside the open picker** is a no-op. Closed-row Sort chip behavior (tap → open picker) is unchanged from the 2026-05-06 spec. |
| Pack | Any · 6 · 12 · 18 · 24 · 30 | `Any` (no pack filter; omitted from URL) | Tap `Any` (in picker) OR tap × on the active-chip row. |

Style dimension is removed entirely (see "Removed: Style filter" below).

### Closed-row behavior (unchanged from 2026-05-06 spec)

The active-chip row above the picker keeps its current behavior verbatim:

```
Sort: Cheapest │ 12-pack ×                          + Filter / Done
```

- Tap "+ Filter" → adds `fp=open`, picker expands.
- Tap "Done" → removes `fp`, picker collapses.
- Tap the Sort chip body → adds `fp=open` (picker opens for sort change).
- Tap the active Pack chip body → adds `fp=open` (picker opens for change).
- Tap × on a Pack chip → removes `pack` from URL; picker open/closed state preserved.

### Removed: Style filter

Style is cut from the data model + URL contract + UI, not merely hidden:

- `PageState.style` field removed.
- `parsePageState` no longer reads `style` from query params.
- `buildHref` no longer accepts `style`.
- `applyFilters` no longer includes the style branch.
- `STYLE_CHIPS` constant removed.
- The picker has no Style section.
- The empty-results message drops the `+ Style` clause.

URL backward-compat: stale links containing `?style=ipa` are silently ignored — `parsePageState` reads only `sort`, `pack`, `zip`, and `fp`, so any other query param is dropped on the server's first render. No error path; no 404.

### URL state model

Identical to current, minus `style`:

```
/deals                                  default
/deals?fp=open                          picker open, no filter
/deals?sort=cheap                       custom sort, picker closed
/deals?sort=cheap&fp=open               sort + picker open
/deals?pack=12                          pack filter, picker closed
/deals?sort=cheap&pack=12&fp=open       sort + pack + picker open
```

### Empty results

```ts
function EmptyResults({ state }: { state: PageState }) {
  return (
    <div className="text-center py-12">
      <p className="text-muted text-[14px] mb-4">
        No deals match {state.pack ? `${state.pack}-pack` : "your filters"}.
      </p>
      <Link
        href={buildHref(state, { pack: null, sort: "best", pickerOpen: true })}
        className="..."
      >
        Clear filters
      </Link>
    </div>
  );
}
```

## Implementation

### Files changed

| File | Change |
|------|--------|
| `src/app/deals/url.ts` | Drop `style` field from `PageState`. Drop `style` reads in `parsePageState`. Drop `style` handling in `buildHref`. Drop the `if (state.style)` branch in `buildDetailHref` (so detail-page back-links no longer carry a style param). |
| `src/app/deals/page.tsx` | (a) Rename `FilterPicker` → `FilterPickerRow` and rewrite its body per the component sketch below; (b) delete `PickerSection` and `PickerChip` helpers; (c) add new `PickerOption` and `AxisLabel` helpers used by `FilterPickerRow`; (d) delete the `STYLE_CHIPS` constant; (e) update `applyFilters` to drop the style filter branch; (f) update `ActiveChipRow` to delete both the style-chip render block AND its `STYLE_CHIPS.find(...)` lookup; (g) update `EmptyResults` (drop the style clause in the message and the `style: null` change in the Clear-filters href). |
| `src/app/deals/__tests__/url.test.ts` | Drop tests that exercise the `style` param across all helpers (`parsePageState`, `buildHref`, `buildDetailHref`). Add one assertion to an existing `buildDetailHref` test: the resulting href never contains `style=`. |
| `DESIGN.md` | Append Decisions Log entry: "v0.5 (2026-05-12) — Picker compressed to single scroll row; Style dimension removed." |

After the change, `grep -rn 'style' src/app/deals/` should return zero matches in TypeScript identifier positions (CSS class names containing `style` and unrelated string contents do not count).

### New component sketch

```tsx
function FilterPickerRow({ state }: { state: PageState }) {
  if (!state.pickerOpen) return null;
  return (
    <div className="relative border-y border-rule mb-4
                    before:content-[''] before:absolute before:inset-y-px before:right-0
                    before:w-8 before:bg-gradient-to-r before:from-transparent before:to-bg
                    before:pointer-events-none">
      <div
        className="overflow-x-auto whitespace-nowrap py-3.5
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                   [scroll-snap-type:x_mandatory]"
      >
        <span className="inline-block [scroll-snap-align:start] pr-3.5">
          <AxisLabel>Sort</AxisLabel>
          {SORT_OPTIONS.map(opt => (
            <PickerOption
              key={opt.key}
              label={opt.label}
              active={state.sort === opt.key}
              href={buildHref(state, { sort: opt.key })}
            />
          ))}
        </span>

        <span className="text-rule mr-2.5 py-2 inline-block">·</span>

        <span className="inline-block [scroll-snap-align:start] pr-3.5">
          <AxisLabel>Pack</AxisLabel>
          <PickerOption
            label="Any"
            active={!state.pack}
            href={buildHref(state, { pack: null })}
          />
          {PACK_CHIPS.map(pack => (
            <PickerOption
              key={pack}
              label={pack}
              active={state.pack === pack}
              href={buildHref(state, { pack: state.pack === pack ? null : pack })}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
```

`PickerOption` renders a `<Link>` with 8 px vertical padding, 10 px right margin, `inline-block`, ink text by default, and the active style above when `active={true}`. `AxisLabel` is a mono-small-caps `<span>` with 8 px right margin, muted color.

### No new dependencies. No client JS. URL contract unchanged for `sort`/`pack`; `style` removed.

### Accessibility

- Each option is a `<Link>` — preserves keyboard navigation and right-click "open in new tab" semantics.
- Active option gets `aria-current="true"` (existing pattern from picker chips).
- The fade gradient is decorative (`pointer-events: none`); does not block tap.
- Scroll-snap is a CSS hint; keyboard tab order is unaffected.
- `prefers-reduced-motion` does not need a special case — there's no animation here, just instantaneous scrolling on user input.
- Touch target: 14 px row padding + 8 px link padding ≈ 44 px effective, validated visually in the brainstorm mockup.

### Styling

Uses existing Golden Hour tokens — no new colors or spacing values. New CSS shape rule: `text-decoration-color: var(--color-warm)` on the active option. The `--color-bg` (wheat) drives the fade gradient endpoint so it matches the page background in both light + dark modes.

## Out of scope

- Multi-select within Sort or Pack (single-value per axis remains).
- New filter dimensions (store, on-sale, ABV). Cut in earlier brainstorms.
- Animations on picker expand/collapse. Server re-renders.
- Mobile gestures (swipe-to-dismiss picker). Tap-only.
- Filter persistence across sessions (cookies / localStorage). Not chosen.
- Bringing Style back as a different control (e.g., a search box, or backend-tagged style enum). Out of scope for this spec — if needed later, a separate brainstorm.

## Testing

- Unit tests in `src/app/deals/__tests__/url.test.ts`: drop the tests that exercise `style`. The remaining sort + pack + fp tests verify the full URL contract.
- Add one positive backward-compat test: `parsePageState({ style: "ipa", zip: "95945" })` returns a `PageState` with no `style` key (or `undefined` if TypeScript treats it as the absence). Locks in the "stale style URLs are silently ignored" behavior described above.
- Add one `buildDetailHref` assertion: the resulting href never contains `style=`, regardless of input.
- Manual smoke checks on `localhost:3000/deals`:
  - Picker closed: only `Sort: <label>` + `+ Filter` visible above the deal list. (existing behavior)
  - Picker open with no filter: row shows `SORT  Best  Cheapest  $/oz  ·  PACK  Any  6  12  18  24  30`. Active = `Best` underlined.
  - Active Pack underline updates correctly when changing pack from picker.
  - Active Pack chip × in the closed row removes pack without collapsing the picker.
  - `Clear filters` link on empty-results opens the picker (`fp=open`) with sort + pack cleared.
  - Stale `?style=ipa` URL renders normally (param ignored, no error).
  - 480 px column: content fits without scrolling on most desktops; mobile 360 px viewport scrolls + snaps as expected.
  - Dark mode (via OS toggle): fade gradient endpoint matches the dark page background.
- e2e: no changes. `e2e/deals-detail.spec.ts` doesn't exercise the picker.
- After implementation, run `grep -rn 'style' src/app/deals/` and confirm only false positives remain (CSS class names containing `style`, product-name strings if any). Zero matches in TypeScript identifier positions.

## Risk / Open Questions

- **Removing a feature is harder to walk back than restyling it.** Style filter is being removed; if user feedback later asks "where's IPA filter," the work to re-add it is non-trivial (especially if a tagged-style backend column is wanted instead of name substring). Mitigation: the data model retains product names, so a future Style implementation isn't blocked — only this UI is removed.
- **Discoverability of horizontal scroll on the smallest viewports.** Right-edge fade + scroll-snap mitigate; if user testing shows people miss Pack options, add a tiny "→" affordance or revert to inline (no scroll) at the cost of larger column width. Acceptable risk for v0.
- **Decisions Log drift.** The 2026-05-06 picker design is now superseded for the open state. The 2026-05-06 spec stays in `docs/specs/` for history; this spec's header notes the supersession.
- **Width assumption: 480 px column.** This is fixed in DESIGN.md and reflected in `max-w-[480px]` on `<main>`. If that ever changes, the fade-gradient + scroll-snap behavior continues to work at any column width — the design degrades gracefully.
