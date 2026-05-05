/**
 * Price parsing — string → integer cents.
 *
 * Storage convention is integer cents to avoid floating-point math
 * errors. parsePrice("$13.99") → 1399.
 *
 * Returns null on unparseable input so callers can quarantine the
 * raw row rather than persist a wrong value.
 */

// A string parses as a price only if it has a `$` prefix OR a clear
// decimal portion (`.XX`). This filters out incidental numbers in
// product copy ("Buy 6 Save 10%", "750", "12 Pack") that would
// otherwise be misread as dollar amounts.
const WITH_DOLLAR = /\$\s*(\d{1,5})(?:[.,](\d{1,2}))?/;
const WITH_DECIMAL = /(?:^|\s)(\d{1,5})[.,](\d{2})(?:\s|$|\/|[a-zA-Z])/;

export function parsePrice(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const dollarMatch = WITH_DOLLAR.exec(trimmed);
  if (dollarMatch) {
    return centsFromMatch(dollarMatch[1], dollarMatch[2]);
  }

  const decimalMatch = WITH_DECIMAL.exec(` ${trimmed} `);
  if (decimalMatch) {
    return centsFromMatch(decimalMatch[1], decimalMatch[2]);
  }

  return null;
}

function centsFromMatch(dollarsPart: string, centsPart: string | undefined): number | null {
  const dollars = Number.parseInt(dollarsPart, 10);
  if (!Number.isFinite(dollars)) return null;

  const padded = (centsPart ?? "00").padEnd(2, "0").slice(0, 2);
  const cents = Number.parseInt(padded, 10);
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
