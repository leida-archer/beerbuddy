// src/lib/geo/zip.ts

/**
 * Nevada County, CA ZIPs covered by BeerBuddy v0. Tightened from the
 * full county list to ZIPs where every chain in the dataset has a
 * validated nearby store. Add an entry here to expand coverage; no
 * other code change is required.
 */
export const ZIP_CITIES: Record<string, string> = {
  "95945": "Grass Valley",
  "95946": "Penn Valley",
  "95949": "Lake of the Pines",
  "95959": "Nevada City",
};

export const SUPPORTED_ZIPS = new Set<string>(Object.keys(ZIP_CITIES));

export function isValidZip(zip: string): boolean {
  return SUPPORTED_ZIPS.has(zip);
}

export function cityForZip(zip: string): string | null {
  return ZIP_CITIES[zip] ?? null;
}
