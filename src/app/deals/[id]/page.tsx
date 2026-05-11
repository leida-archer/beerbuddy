import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import {
  formatPack,
  formatPrice,
  formatRelative,
  getDealById,
  pricePerOz,
} from "@/lib/deals";
import { coordsForZip, isValidZip } from "@/lib/geo/zip";
import { haversineMiles } from "@/lib/geo/haversine";
import { mapsHref, targetForUserAgent } from "@/lib/geo/maps";

import { asString, buildHref, parsePageState } from "../url";
import { PriceTrendStub } from "./PriceTrendStub";

export default async function DealDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const rawZip = asString(sp.zip);

  if (!rawZip) redirect("/");
  if (!isValidZip(rawZip)) {
    redirect(`/?error=region&zip=${encodeURIComponent(rawZip)}`);
  }

  const { id } = await props.params;
  // Next.js 15 already URL-decodes path params, so decodeURIComponent
  // is a no-op for normal IDs. Kept defensively in case a future
  // adapter ever emits a doubly-encoded id.
  const deal = await getDealById(decodeURIComponent(id));
  if (!deal) notFound();

  const state = parsePageState(sp);
  const ua = (await headers()).get("user-agent");
  const directionsHref = mapsHref(deal.store, targetForUserAgent(ua));

  const userCoords = coordsForZip(rawZip);
  const distance =
    userCoords &&
    haversineMiles(userCoords, {
      lat: deal.store.lat,
      lon: deal.store.lon,
    });

  const ppoz = pricePerOz(deal);
  const isBest = deal.discountPct != null && deal.discountPct >= 30;
  const hasLimitedHistory = deal.discountPct == null;
  const wasPriceDifferent =
    deal.regularPriceCents != null &&
    deal.regularPriceCents !== deal.priceCents;
  // Stores beyond ~15 mi from Grass Valley earn a "further drive"
  // hint. BevMo Auburn (~21 mi south, in Placer County) is the
  // primary case — without the hint the distance line just looks
  // surprising. Threshold is per /plan-design-review feedback.
  const isFurtherDrive = distance != null && distance > 15;

  return (
    <main className="mx-auto max-w-[480px] min-h-screen px-4 py-6">
      <Link
        href={buildHref(state, {})}
        prefetch={false}
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted underline decoration-rule decoration-1 underline-offset-[3px] hover:text-ink hover:decoration-ink"
      >
        ← Back to deals
      </Link>

      <article className="mt-5">
        {isBest && (
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-warm mb-2">
            Best deal · {deal.discountPct}% off
          </div>
        )}
        {hasLimitedHistory && (
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2">
            Limited price history
          </div>
        )}

        <h1 className="font-display font-medium text-[26px] leading-tight tracking-tight mb-1">
          {deal.name}
        </h1>
        {(deal.brand || deal.packCount) && (
          <p className="text-[12px] text-muted mb-4">
            {deal.brand}
            {deal.brand && deal.packCount && <span className="mx-1">·</span>}
            {formatPack(deal.packCount, deal.packUnitMl)}
          </p>
        )}

        <div className="flex items-baseline gap-3">
          <span className="font-mono font-bold text-[32px] tracking-tight">
            {formatPrice(deal.priceCents)}
          </span>
          {wasPriceDifferent && deal.regularPriceCents != null && (
            <span className="font-mono text-[14px] text-muted line-through">
              {formatPrice(deal.regularPriceCents)}
            </span>
          )}
        </div>
        {ppoz != null && (
          <p className="font-mono text-[11px] text-success mt-1">
            ${ppoz.toFixed(2)}/oz
          </p>
        )}

        <PriceTrendStub
          currentPriceCents={deal.priceCents}
          regularPriceCents={deal.regularPriceCents}
        />

        <hr className="border-rule my-6" />

        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted mb-1">
            Where
          </p>
          <p className="font-display font-medium text-[16px] text-cool">
            {deal.store.name}
          </p>
          <p className="text-[12px] text-ink mt-0.5">{deal.store.address}</p>
          <p className="text-[12px] text-ink">{deal.store.city}</p>
          {distance != null && (
            <p className="font-mono text-[11px] text-muted mt-1">
              {distance.toFixed(1)} mi from {state.zip}
              {isFurtherDrive && (
                <span className="ml-1.5 text-cool">· further drive</span>
              )}
            </p>
          )}
          <a
            href={directionsHref}
            className="block mt-4 bg-ink text-bg border border-ink rounded-sm py-3 px-4 text-center font-body text-[14px] font-medium leading-none min-h-11"
          >
            Get directions →
          </a>
        </div>

        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted mt-8 pt-4 border-t border-rule">
          Updated {formatRelative(deal.observedAt, new Date())}
        </p>
      </article>
    </main>
  );
}
