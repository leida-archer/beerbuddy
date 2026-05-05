/**
 * Price parsing — string → integer cents.
 *
 * Storage convention is integer cents to avoid floating-point math
 * errors. parsePrice("$13.99") → 1399.
 *
 * Returns null on unparseable input so callers can quarantine the
 * raw row rather than persist a wrong value.
 */

const PRICE_REGEX = /\$?\s*(\d{1,5})(?:[.,](\d{1,2}))?/;

export function parsePrice(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = PRICE_REGEX.exec(trimmed);
  if (!match) return null;

  const dollars = Number.parseInt(match[1], 10);
  if (!Number.isFinite(dollars)) return null;

  const centsPart = match[2] ?? "00";
  const cents = Number.parseInt(centsPart.padEnd(2, "0").slice(0, 2), 10);
  if (!Number.isFinite(cents)) return null;

  return dollars * 100 + cents;
}

/**
 * Render integer cents back to "$X.XX" for display. Always uses two
 * decimal places. UI components should prefer Intl.NumberFormat for
 * locale-aware rendering; this helper is for tests, logs, and the
 * occasional admin display.
 */
export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${negative ? "-" : ""}$${dollars}.${remainder.toString().padStart(2, "0")}`;
}
