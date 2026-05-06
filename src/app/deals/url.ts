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
