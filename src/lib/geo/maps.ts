// src/lib/geo/maps.ts

import type { Store } from "@/lib/deals";

export type MapsTarget = "apple" | "google";

/**
 * Pick the maps platform from a User-Agent string. The /deals/[id]
 * page reads `headers().get("user-agent")` server-side and passes it
 * here — no client JS, no UA detection round-trip.
 *
 * Rule:
 *   - iOS / iPadOS (iPhone / iPad / iPod) → always Apple Maps.
 *   - macOS Safari → Apple Maps (native experience).
 *   - macOS Chrome / Firefox / other → Google Maps (their ecosystem).
 *   - Everything else → Google Maps.
 *
 * macOS browser detection: Safari's UA contains "Macintosh" and "Safari"
 * but neither "Chrome", "Chromium", nor "Firefox"; Chrome and Edge UAs
 * also include "Safari" (legacy WebKit lineage) so we filter those out
 * explicitly.
 */
export function targetForUserAgent(
  ua: string | null | undefined,
): MapsTarget {
  if (!ua) return "google";
  if (/iPhone|iPad|iPod/.test(ua)) return "apple";
  if (/Macintosh/.test(ua)) {
    const isWebkitSafari =
      /Safari\//.test(ua) &&
      !/Chrome\/|Chromium\/|Firefox\/|Edg\//.test(ua);
    return isWebkitSafari ? "apple" : "google";
  }
  return "google";
}

/**
 * Build a directions deep-link URL for the given store. Both
 * platforms use their documented "directions to a destination"
 * URL pattern with lat/lon — when the user opens the URL, the
 * native app fills in their current location as the origin and
 * the store as the destination.
 *
 * Apple Maps:  https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
 * Google Maps: https://developers.google.com/maps/documentation/urls/get-started
 */
export function mapsHref(store: Store, target: MapsTarget): string {
  const ll = `${store.lat},${store.lon}`;
  if (target === "apple") {
    return `https://maps.apple.com/?daddr=${ll}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
}
