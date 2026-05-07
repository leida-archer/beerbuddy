// src/app/deals/url.ts

export type SortKey = "best" | "cheap" | "oz";

export interface PageState {
  zip: string;
  sort: SortKey;
  pack: string | null;
  style: string | null;
  pickerOpen: boolean;
}

export const DEFAULT_SORT: SortKey = "best";

/**
 * Parse Next.js searchParams into a typed PageState. `zip` defaults to
 * "" when absent; the production redirect at /deals catches the
 * empty-zip case before this helper's output is rendered.
 */
export function parsePageState(
  sp: Record<string, string | string[] | undefined>,
): PageState {
  const sort = asString(sp.sort);
  return {
    zip: asString(sp.zip) ?? "",
    sort: sort === "cheap" || sort === "oz" ? sort : DEFAULT_SORT,
    pack: asString(sp.pack),
    style: asString(sp.style),
    pickerOpen: asString(sp.fp) === "open",
  };
}

/**
 * Build a /deals href that applies the given changes on top of the
 * current state. Pass `null` to clear pack or style. `zip` is always
 * emitted — there is no default to omit. Default sort and closed
 * picker are omitted from the URL.
 */
export function buildHref(state: PageState, changes: Partial<PageState>): string {
  const next: PageState = { ...state, ...changes };
  const sp = new URLSearchParams();
  sp.set("zip", next.zip);
  if (next.sort !== DEFAULT_SORT) sp.set("sort", next.sort);
  if (next.pack) sp.set("pack", next.pack);
  if (next.style) sp.set("style", next.style);
  if (next.pickerOpen) sp.set("fp", "open");
  return `/deals?${sp.toString()}`;
}

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

export function asString(v: string | string[] | undefined): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return null;
}
