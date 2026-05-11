/**
 * Cheap name-similarity heuristic, extracted for unit testing without
 * pulling in the db module. Used by `aliases.ts` to rank fuzzy
 * candidate matches surfaced to the admin UI.
 *
 * Tokenizes both strings, lowercases, strips punctuation, and returns
 * the Jaccard index of the token sets. 1.0 == identical normalized
 * text; 0.0 == no shared tokens.
 *
 * Not a substitute for the admin's eye — picks a threshold that
 * surfaces obvious candidates ("Sierra Nev PA" vs "Sierra Nevada Pale
 * Ale") while filtering out coincidental token overlap.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let intersect = 0;
  for (const t of sa) if (sb.has(t)) intersect += 1;
  const union = sa.size + sb.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}
