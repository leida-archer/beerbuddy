/**
 * DealsRepo — the read-side data source for /deals and /api/deals.
 *
 * Two implementations:
 *   - fixtureDealsRepo — reads the prebuilt JSON in src/data/fixtures/.
 *     Always used in dev + tests + CI; only data source that works
 *     without a live DB.
 *   - dbDealsRepo — joins product_deal_scores ⨝ stores ⨝ products and
 *     materializes the same Deal shape. Used when the env opts in.
 *
 * Selection happens at module import time, see `dealsRepo` below.
 * Both implementations return the same shape; consumers don't care
 * which is wired up.
 */

import type { Deal, DealWithStore, DealsResult, Store } from "../deals";

export interface DealsRepo {
  getDeals(): Promise<DealsResult>;
  getDealById(id: string): Promise<DealWithStore | null>;
}

import fixture from "@/data/fixtures/deals.json";

const fixtureResult: DealsResult = {
  generatedAt: fixture.generatedAt,
  stores: fixture.stores as Store[],
  counts: fixture.counts as DealsResult["counts"],
  deals: fixture.deals as Deal[],
};

export const fixtureDealsRepo: DealsRepo = {
  async getDeals(): Promise<DealsResult> {
    return fixtureResult;
  },
  async getDealById(id: string): Promise<DealWithStore | null> {
    const deal = fixtureResult.deals.find((d) => d.id === id);
    if (!deal) return null;
    const store = fixtureResult.stores.find((s) => s.id === deal.storeId);
    if (!store) return null;
    const { storeId: _id, storeName: _name, storeCity: _city, ...rest } = deal;
    return { ...rest, store };
  },
};

/**
 * The active repo. Selected at module import time so callers see a
 * single value; the only knob is the `BEERBUDDY_DEALS_SOURCE` env
 * variable, which must be set to `"db"` to swap in the DB repo.
 *
 * The DB repo is loaded lazily via a dynamic import inside a factory
 * so that the fixture path doesn't pull in the Neon client (and
 * doesn't crash at import time when DATABASE_URL is unset).
 */
export const dealsRepo: DealsRepo = createDealsRepo();

function createDealsRepo(): DealsRepo {
  if (process.env.BEERBUDDY_DEALS_SOURCE !== "db") {
    return fixtureDealsRepo;
  }
  return makeLazyDbRepo();
}

function makeLazyDbRepo(): DealsRepo {
  let cached: Promise<DealsRepo> | null = null;
  function load(): Promise<DealsRepo> {
    if (!cached) {
      cached = import("./repoDb").then((m) => m.dbDealsRepo);
    }
    return cached;
  }
  return {
    async getDeals() {
      return (await load()).getDeals();
    },
    async getDealById(id) {
      return (await load()).getDealById(id);
    },
  };
}
