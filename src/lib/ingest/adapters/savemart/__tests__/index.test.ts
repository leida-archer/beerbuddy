import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdapterDeps } from "../../../contract";
import type { ScrapedSavemartProduct } from "../extract";

vi.mock("@/lib/ingest/persist", () => ({
  upsertAliasAndCanonicalProduct: vi.fn(),
  getMostRecentPrice: vi.fn(),
  writePriceEvent: vi.fn(),
  writeQuarantine: vi.fn(),
}));

import {
  getMostRecentPrice,
  upsertAliasAndCanonicalProduct,
  writePriceEvent,
  writeQuarantine,
} from "@/lib/ingest/persist";
import { makeSavemartAdapter } from "..";

const mockedUpsert = upsertAliasAndCanonicalProduct as unknown as ReturnType<typeof vi.fn>;
const mockedGetMostRecent = getMostRecentPrice as unknown as ReturnType<typeof vi.fn>;
const mockedWriteEvent = writePriceEvent as unknown as ReturnType<typeof vi.fn>;
const mockedWriteQuarantine = writeQuarantine as unknown as ReturnType<typeof vi.fn>;

function makeProduct(
  overrides: Partial<ScrapedSavemartProduct> = {},
): ScrapedSavemartProduct {
  return {
    savemartId: "12345",
    slug: "sierra-nevada-pale-ale",
    name: "Sierra Nevada Pale Ale 12-pack",
    brand: "Sierra Nevada",
    packCount: 12,
    packUnitMl: 355,
    priceCents: 1599,
    regularPriceCents: 1799,
    rawPriceText: "$15.99 | $17.99",
    ...overrides,
  };
}

function makeDeps(): AdapterDeps {
  return {
    db: undefined,
    fetch: globalThis.fetch,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUpsert.mockResolvedValue({ canonicalProductId: 1, isNew: true });
  mockedGetMostRecent.mockResolvedValue(null);
  mockedWriteEvent.mockResolvedValue(true);
  mockedWriteQuarantine.mockResolvedValue(undefined);
});

describe("makeSavemartAdapter", () => {
  it("records productsObserved and pricesWritten for a happy-path run", async () => {
    const adapter = makeSavemartAdapter({
      extract: async () => [makeProduct(), makeProduct({ savemartId: "67890", priceCents: 1299 })],
    });
    const run = await adapter.run(makeDeps());

    expect(run.productsObserved).toBe(2);
    expect(run.pricesWritten).toBe(2);
    expect(run.parseFailures).toHaveLength(0);
    expect(run.fetchErrors).toHaveLength(0);
    expect(run.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockedUpsert).toHaveBeenCalledTimes(2);
    expect(mockedWriteEvent).toHaveBeenCalledTimes(2);
  });

  it("threads the savemart chainSku prefix through to upsertAliasAndCanonicalProduct", async () => {
    const adapter = makeSavemartAdapter({
      extract: async () => [makeProduct({ savemartId: "999" })],
    });
    await adapter.run(makeDeps());
    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        chainSku: "savemart/999",
        brand: "Sierra Nevada",
        rawName: "Sierra Nevada Pale Ale 12-pack",
        packCount: 12,
        packUnitMl: 355,
      }),
    );
  });

  it("routes glitched prices (>5x prior) to quarantine, not price_events", async () => {
    mockedGetMostRecent.mockResolvedValue(1500);
    const adapter = makeSavemartAdapter({
      extract: async () => [makeProduct({ priceCents: 99_999 })], // ~67x prior
    });
    const run = await adapter.run(makeDeps());

    expect(mockedWriteQuarantine).toHaveBeenCalledTimes(1);
    expect(mockedWriteEvent).not.toHaveBeenCalled();
    expect(run.pricesWritten).toBe(0);
  });

  it("returns 0 observed when the extractor throws and records a fetch error", async () => {
    const adapter = makeSavemartAdapter({
      extract: async () => {
        throw new Error("playwright timeout");
      },
    });
    const run = await adapter.run(makeDeps());

    expect(run.productsObserved).toBe(0);
    expect(run.pricesWritten).toBe(0);
    expect(run.fetchErrors).toHaveLength(1);
    expect(run.fetchErrors[0].message).toContain("playwright timeout");
  });

  it("counts a no-op write (idempotent same-price observation) as not-written", async () => {
    mockedWriteEvent.mockResolvedValue(false);
    const adapter = makeSavemartAdapter({
      extract: async () => [makeProduct()],
    });
    const run = await adapter.run(makeDeps());

    expect(run.productsObserved).toBe(1);
    expect(run.pricesWritten).toBe(0);
  });
});
