/**
 * Haversine great-circle distance — for store proximity ranking.
 *
 * /plan-eng-review Issue 5B locked Haversine over PostGIS for the
 * Nevada County scope (~30 stores). At this scale, 5 lines of math
 * outperforms a Postgres extension dependency.
 *
 * Returns distance in miles. Within ±0.5% of geodesic for any two
 * points within ~100 mi of each other — fine for "drive there
 * after work" use cases.
 */

const EARTH_RADIUS_MILES = 3958.8;

export interface Coord {
  lat: number;
  lon: number;
}

export function haversineMiles(a: Coord, b: Coord): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dPhi = toRad(b.lat - a.lat);
  const dLambda = toRad(b.lon - a.lon);

  const sinPhi = Math.sin(dPhi / 2);
  const sinLambda = Math.sin(dLambda / 2);
  const x =
    sinPhi * sinPhi + Math.cos(phi1) * Math.cos(phi2) * sinLambda * sinLambda;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_MILES * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
