// src/lib/geo/maps.ts

import type { Store } from "@/lib/deals";

export type MapsTarget = "apple" | "google";

/**
 * Pick the maps platform from a User-Agent string. Apple devices
 * (iOS, iPadOS, macOS) get Apple Maps; everything else gets Google
 * Maps. The /deals/[id] page reads `headers().get("user-agent")`
 * server-side and passes it here — no client JS, no UA detection
 * round-trip.
 *
 * Note: `Macintosh` matches every browser on macOS (Chrome, Firefox,
 * Safari), so macOS Chrome/Firefox users also land on Apple Maps.
 * Apple Maps' web fallback works fine in non-Safari browsers.
 */
export function targetForUserAgent(
  ua: string | null | undefined,
): MapsTarget {
  if (!ua) return "google";
  return /iPhone|iPad|iPod|Macintosh/.test(ua) ? "apple" : "google";
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
