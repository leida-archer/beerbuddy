/**
 * Admin alias candidate-match + merge endpoint.
 *
 * Password-gated per CLAUDE.md § Zero User Labor — this is the only
 * surface where the developer interacts with ingestion plumbing.
 *
 *   GET  /api/admin/aliases?limit=50   → CandidatePair[]
 *   POST /api/admin/aliases             body: { sourceId, targetId }
 *
 * Auth: `Authorization: Bearer ${ADMIN_PASSWORD}`. Constant-time
 * comparison via crypto.timingSafeEqual to avoid timing leaks even
 * though the threat model is tiny.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

// Lazy import inside handlers — admin/aliases pulls in @/lib/db which
// throws at module-eval time without DATABASE_URL, breaking the
// Next.js build's page-data collection step on environments that
// don't have it set (e.g. CI).
export const dynamic = "force-dynamic";

const MergeBodySchema = z.object({
  sourceId: z.number().int().positive(),
  targetId: z.number().int().positive(),
  sessionTag: z.string().min(1).max(64).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const unauth = requireAdmin(request);
  if (unauth) return unauth;

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(200, Math.max(1, Number(limitParam) || 50)) : 50;

  const { findAliasCandidates } = await import("@/lib/admin/aliases");
  const candidates = await findAliasCandidates(limit);
  return NextResponse.json({ candidates });
}

export async function POST(request: Request): Promise<Response> {
  const unauth = requireAdmin(request);
  if (unauth) return unauth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = MergeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.sourceId === parsed.data.targetId) {
    return NextResponse.json({ error: "source_equals_target" }, { status: 400 });
  }

  try {
    const { mergeAliases } = await import("@/lib/admin/aliases");
    const result = await mergeAliases(
      parsed.data.sourceId,
      parsed.data.targetId,
      parsed.data.sessionTag,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "merge_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

function requireAdmin(request: Request): Response | null {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length === 0) {
    return NextResponse.json(
      { error: "admin_disabled" },
      { status: 503 },
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
