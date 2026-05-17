# Dropped chains

A chain is "dropped" when BeerBuddy explicitly decides not to source its
prices, even though it operates stores in a covered region. This file
exists so future contributors (and future-self) understand *why* each
omission happened — without this record, someone will inevitably propose
building the adapter again, repeat the same discovery work, and reach
the same conclusion.

A drop is **reversible**. If circumstances change (new platform,
relaxed bot shield, paid scraping tier becomes worth the budget, the
chain becomes the dominant grocer in a newly-covered region), reopen
the entry, update the rationale, and rebuild.

---

## Walmart — Lincoln Neighborhood Market #5979

**Dropped:** 2026-05-17
**Original premise:** "Walmart Grass Valley" listed in README's seven chains, ~25 mi radius from 95945
**Real geography:** No Walmart in Grass Valley. Closest is Walmart Neighborhood Market #5979 at 255 Lincoln Blvd, Lincoln, CA 95648 — **26.5 mi** from 95945. Next-closest is Rocklin Crossings Supercenter #3587 at 28.8 mi, then Placerville #2418 at 33.4 mi.

### Why dropped

Two compounding reasons:

1. **Borderline geography.** Even the closest Walmart is past the README's 25 mi radius. Walmart's value-add in BeerBuddy was anchoring the regional price floor, but it's not a store a Nevada County resident drives to casually — defeating the "see deals, drive there" loop.

2. **PerimeterX bot shield (decisive factor).** Walmart's surfaces (`/store/<id>/details`, `/cp/beer/<id>`, even `/` once flagged) are gated by PerimeterX. The shield detects at the **browser fingerprint** layer, not the session/cookie layer:
   - A fresh `chromium.newContext()` with empty cookies gets `vid=` blank but `g=b` (bot) on first request to an alcohol surface — instant `/blocked?...` redirect with a "Robot or human?" press-and-hold challenge
   - Likely signals: WebGL fingerprint, `navigator.plugins`, `navigator.webdriver`, automation hooks, possibly TLS JA3
   - Verified against Chrome DevTools MCP (Playwright/chromium) on 2026-05-17. Store-finder works once; subsequent navigations are blocked

### What scraping Walmart would actually require

None of these fit a side-project budget:

| Path | Cost | Reliability |
|------|------|-------------|
| Stealth-patched Playwright (`playwright-extra` + `puppeteer-extra-plugin-stealth`, or patchright) | Perpetual maintenance — PX rotates detection signatures monthly | Low. Cat-and-mouse |
| Manual `_px*` cookie warmup from real Chrome | Admin time, every 1-2 weeks | Med — fragile to PX session-rotation |
| Datacenter / residential proxy rotation | $$$ | Med — PX has datacenter blocklists |
| Mobile API reverse engineering (iOS/Android app endpoints) | Significant eng effort, TOS gray area | Unknown |
| Third-party retail-data aggregator (DataWeave, Skai, paid Glimpse-style feed) | $$$$ subscription | High when it works |

### When to reopen this decision

- BeerBuddy expands to a region where Walmart is the **dominant grocer** (most non-NorCal-rural US regions). At that point, the engineering investment in stealth tooling pays back.
- PX-level detection becomes commodified — i.e., an open-source stealth-Playwright variant becomes maintainable rather than a perpetual fight.
- An affordable retail-data aggregator emerges that covers Walmart prices in the target ZIPs.
- The product accepts "Walmart price is admin-entered" as a permanent footnote (Tier 6 path), and admin has the bandwidth.

### Where the discovery work lives

The full discovery findings (URL accessibility matrix, PX vendor characterization, surface-by-surface block analysis) were originally written into `src/lib/ingest/adapters/walmart-lincoln/api-notes.md` on 2026-05-17 and migrated here when the directory was removed. See git log of `docs/dropped-chains.md` and the `src/lib/ingest/adapters/walmart-gv/` → `walmart-lincoln/` → deletion sequence for the full archaeology.
