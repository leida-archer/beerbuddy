/**
 * GET /api/deals
 *
 * Returns the current deal list. Server reads from the fixture today
 * and from the DB matview when it lands. Response shape is stable.
 */

import { getDeals } from "@/lib/deals";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDeals();
  return Response.json(data, {
    headers: {
      // Short-cache: the fixture changes only when fixture:raleys is
      // re-run. When DB ingestion replaces the fixture, this becomes
      // a per-store-+-zip cache key.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
