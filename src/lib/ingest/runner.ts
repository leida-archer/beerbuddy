/**
 * Orchestrator runner — executes a single Adapter and records the run.
 *
 * Called by the GitHub Actions daily workflow (Issue 4A) once per
 * adapter sequentially. Catches programmer-level errors so a single
 * bad adapter doesn't kill the orchestrator; soft errors are already
 * surfaced via AdapterRun.parseFailures / fetchErrors.
 */

import type { Adapter, AdapterDeps, AdapterRun } from "./contract";
import { recordRun } from "./persist";

export interface RunResult {
  ok: boolean;
  run?: AdapterRun;
  error?: { message: string; stack?: string };
}

const consoleLogger: AdapterDeps["logger"] = {
  info: (msg, meta) => console.log(`[ingest:info] ${msg}`, meta ?? {}),
  warn: (msg, meta) => console.warn(`[ingest:warn] ${msg}`, meta ?? {}),
  error: (msg, err, meta) =>
    console.error(`[ingest:error] ${msg}`, err, meta ?? {}),
};

/**
 * Run a single adapter end-to-end: invoke its run() method, persist
 * the AdapterRun summary, and return the outcome. Always returns —
 * exceptions are caught and surfaced via RunResult.
 */
export async function runAdapter(
  adapter: Adapter,
  deps: Partial<AdapterDeps> = {},
): Promise<RunResult> {
  const fullDeps: AdapterDeps = {
    db: deps.db ?? undefined,
    fetch: deps.fetch ?? globalThis.fetch,
    llm: deps.llm,
    logger: deps.logger ?? consoleLogger,
  };

  try {
    fullDeps.logger.info(`Starting adapter run`, { sourceId: adapter.sourceId });
    const run = await adapter.run(fullDeps);

    try {
      await recordRun(run);
    } catch (persistErr) {
      // Run completed but its summary couldn't be persisted. Log loudly,
      // surface the run upward anyway so the orchestrator can decide.
      fullDeps.logger.error(
        `Failed to record run summary`,
        persistErr,
        { sourceId: adapter.sourceId },
      );
    }

    fullDeps.logger.info(`Adapter run complete`, {
      sourceId: adapter.sourceId,
      productsObserved: run.productsObserved,
      pricesWritten: run.pricesWritten,
      parseFailures: run.parseFailures.length,
      fetchErrors: run.fetchErrors.length,
      durationMs: run.durationMs,
    });

    return { ok: true, run };
  } catch (err) {
    const error =
      err instanceof Error
        ? { message: err.message, stack: err.stack }
        : { message: String(err) };
    fullDeps.logger.error(`Adapter threw`, err, { sourceId: adapter.sourceId });
    return { ok: false, error };
  }
}

/**
 * Orchestrator entry point — run a list of adapters sequentially.
 *
 * One sequential pass keeps DB write contention low and gives the
 * matview refresh (next step) a deterministic ordering. Parallel
 * fan-out is option 4C in /plan-eng-review and was deferred.
 */
export async function runAdapters(adapters: Adapter[]): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const adapter of adapters) {
    results.push(await runAdapter(adapter));
  }
  return results;
}
