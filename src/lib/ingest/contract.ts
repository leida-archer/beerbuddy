/**
 * Adapter contract — the interface every chain ingestion module implements.
 * Locked in /plan-eng-review Issue 1A. Do not change without updating
 * docs/design.md § Architecture sketch and the Decisions section there.
 *
 * Per-chain implementations live in ./adapters/{chain}/index.ts. They run via
 * the orchestrator workflow (single GitHub Actions cron, Issue 4A) which
 * invokes runner.ts to execute each adapter sequentially and persist the
 * resulting events.
 */

export interface ParseFailure {
  /** Raw input that failed to parse — HTML fragment, PDF text segment, etc. */
  rawSnippet: string;
  /** Human-readable reason — "missing price", "ambiguous pack size", etc. */
  reason: string;
  /** Optional URL or path within the source for debugging. */
  sourceLocation?: string;
}

export interface FetchError {
  /** URL that failed. */
  url: string;
  /** HTTP status if applicable, otherwise descriptive (timeout, dns, etc). */
  status: number | string;
  /** Error message. */
  message: string;
}

export interface AdapterRun {
  /** Stable string identifier for the source (e.g. "raleys", "savemart"). */
  sourceId: string;
  /** UTC timestamp when run() began. */
  runStartedAt: Date;
  /** Total products the adapter saw and attempted to interpret. */
  productsObserved: number;
  /** Successful price-event rows persisted. */
  pricesWritten: number;
  /** Soft errors — adapter continued, rows quarantined. */
  parseFailures: ParseFailure[];
  /** Hard errors — fetch failed entirely for some URL. */
  fetchErrors: FetchError[];
  /** Wall-clock duration in ms. */
  durationMs: number;
}

export interface AdapterDeps {
  /** Drizzle client. Each adapter writes through helpers in ../persist.ts. */
  db: unknown;
  /** Fetch implementation — injected for testability. */
  fetch: typeof globalThis.fetch;
  /** Anthropic SDK client, only injected for adapters that use LLM parsing. */
  llm?: unknown;
  /** Structured logger — for now console; later pluggable. */
  logger: { info: (msg: string, meta?: object) => void; warn: (msg: string, meta?: object) => void; error: (msg: string, err: unknown, meta?: object) => void };
}

export interface Adapter {
  /** Stable identifier matching ./adapters/{sourceId}/. */
  sourceId: string;

  /**
   * Run the adapter once. Idempotent — same prices on consecutive runs do not
   * write new rows (see persist.ts § price-change-event semantics, design doc).
   * Throws only on programmer errors — operational errors go on the AdapterRun.
   */
  run(deps: AdapterDeps): Promise<AdapterRun>;
}
