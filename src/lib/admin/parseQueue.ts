/**
 * Read + resolve helpers for the manual_parse_queue table.
 *
 * The write path (queueManualParse) lives in lib/ingest/persist.ts —
 * keeps it next to the other adapter-facing helpers. This module is
 * the *admin*-facing surface: list pending items, count them for the
 * shared admin header, mark them resolved.
 */

import { asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { manualParseQueue } from "@/lib/db/schema";

export interface QueueEntry {
  id: number;
  sourceId: string;
  kind: string;
  sourceUrl: string | null;
  mediaType: string | null;
  hint: string;
  queuedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}

/** Pending entries, oldest first (FIFO — the admin's natural reading order). */
export async function listPending(limit = 100): Promise<QueueEntry[]> {
  return db
    .select()
    .from(manualParseQueue)
    .where(isNull(manualParseQueue.resolvedAt))
    .orderBy(asc(manualParseQueue.queuedAt))
    .limit(limit);
}

/** Recently-resolved entries, newest first — useful for admin context. */
export async function listResolved(limit = 25): Promise<QueueEntry[]> {
  return db
    .select()
    .from(manualParseQueue)
    .where(sql`${manualParseQueue.resolvedAt} IS NOT NULL`)
    .orderBy(desc(manualParseQueue.resolvedAt))
    .limit(limit);
}

/**
 * How many entries are waiting on the admin. Cheap; used by the shared
 * admin header to surface a count badge across /admin/* pages.
 */
export async function pendingCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(manualParseQueue)
    .where(isNull(manualParseQueue.resolvedAt));
  return row?.n ?? 0;
}

export interface MarkResolvedInput {
  id: number;
  resolvedBy: string;
  notes?: string;
}

export async function markResolved(input: MarkResolvedInput): Promise<boolean> {
  const result = await db
    .update(manualParseQueue)
    .set({
      resolvedAt: new Date(),
      resolvedBy: input.resolvedBy,
      resolutionNotes: input.notes ?? null,
    })
    .where(eq(manualParseQueue.id, input.id))
    .returning({ id: manualParseQueue.id });
  return result.length > 0;
}

/**
 * Re-open a previously resolved entry — used when the admin realizes
 * the resolution didn't stick (e.g. they entered the wrong product).
 */
export async function reopen(id: number): Promise<boolean> {
  const result = await db
    .update(manualParseQueue)
    .set({ resolvedAt: null, resolvedBy: null, resolutionNotes: null })
    .where(eq(manualParseQueue.id, id))
    .returning({ id: manualParseQueue.id });
  return result.length > 0;
}
