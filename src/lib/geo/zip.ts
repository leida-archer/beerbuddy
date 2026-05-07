// src/lib/geo/zip.ts

/**
 * Nevada County, CA ZIPs covered by BeerBuddy v0. Tightened from the
 * full county list to ZIPs where every chain in the dataset has a
 * validated nearby store. Add an entry here to expand coverage; no
 * other code change is required.
 *
 * Centroid coords are approximate town centers — close enough for
 * "distance from user's ZIP" rendering on the deal-detail page.
 */
export const ZIP_INFO: Record<
  string,
  { city: string; lat: number; lon: number }
> = {
  "95945": { city: "Grass Valley", lat: 39.219, lon: -121.061 },
  "95946": { city: "Penn Valley", lat: 39.196, lon: -121.184 },
  "95949": { city: "Lake of the Pines", lat: 39.030, lon: -121.061 },
  "95959": { city: "Nevada City", lat: 39.262, lon: -121.016 },
};

export const SUPPORTED_ZIPS = new Set<string>(Object.keys(ZIP_INFO));

export function isValidZip(zip: string): boolean {
  return SUPPORTED_ZIPS.has(zip);
}

export function cityForZip(zip: string): string | null {
  return ZIP_INFO[zip]?.city ?? null;
}

export function coordsForZip(
  zip: string,
): { lat: number; lon: number } | null {
  const info = ZIP_INFO[zip];
  return info ? { lat: info.lat, lon: info.lon } : null;
}
