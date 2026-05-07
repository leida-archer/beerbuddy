import { describe, expect, it } from "vitest";
import { mapsHref, targetForUserAgent } from "../maps";

// Local fixture shape — matches what mapsHref reads. Task 3 lands
// the same fields on the real Store interface; this stays as a
// self-contained test fixture either way.
interface TestStore {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lon: number;
}

const fixtureStore: TestStore = {
  id: "test-store",
  name: "Test Market",
  city: "Grass Valley",
  address: "123 Main St",
  lat: 39.219,
  lon: -121.061,
};

describe("targetForUserAgent", () => {
  it("returns 'apple' for Apple device user agents", () => {
    const iPhone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const iPad =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
    const macSafari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
    expect(targetForUserAgent(iPhone)).toBe("apple");
    expect(targetForUserAgent(iPad)).toBe("apple");
    expect(targetForUserAgent(macSafari)).toBe("apple");
  });

  it("returns 'google' for non-Apple user agents and missing UA", () => {
    const androidChrome =
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";
    const linuxFirefox =
      "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";
    expect(targetForUserAgent(androidChrome)).toBe("google");
    expect(targetForUserAgent(linuxFirefox)).toBe("google");
    expect(targetForUserAgent(null)).toBe("google");
    expect(targetForUserAgent(undefined)).toBe("google");
    expect(targetForUserAgent("")).toBe("google");
  });
});

describe("mapsHref", () => {
  it("builds an Apple Maps directions URL for target='apple'", () => {
    expect(mapsHref(fixtureStore, "apple")).toBe(
      "https://maps.apple.com/?daddr=39.219,-121.061",
    );
  });

  it("builds a Google Maps directions URL for target='google'", () => {
    expect(mapsHref(fixtureStore, "google")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=39.219,-121.061",
    );
  });
});
