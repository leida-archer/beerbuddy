# Adapters — Day 1 of Week 1

This directory holds one folder per chain. Each folder will eventually contain:

- `api-notes.md` — what the developer found during DevTools discovery (created at scaffold time, filled in during Day 1 of Week 1)
- `index.ts` — the adapter implementation conforming to `../contract.ts` (created during Week 1+ as adapters get built)
- `__fixtures__/` — captured HTML / PDF / JSON-response samples used by adapter integration tests (Vitest)

## Day 1 — API-discovery sweep

For each chain folder below, open the chain's website, open DevTools (Cmd-Opt-I), browse the alcohol section, and watch the Network tab. Look for:

1. **JSON / GraphQL endpoints** that the SPA calls to populate product lists, prices, and store-aware availability. These are gold — adapters can `fetch` them directly without rendering the full page in Playwright.
2. **Direct PDF / HTML weekly-ad URLs** that aren't behind authentication or anti-bot. Plain `fetch` works for these.
3. **Anti-bot signals** — Cloudflare challenge pages, 403s on direct curl, HMAC-signed request headers, CAPTCHA. These mean Playwright-with-realistic-fingerprint is required.

Document findings in each chain's `api-notes.md` using the template that's already in there. Goal at the end of Day 1: each chain has a documented path forward (clean API, plain HTML scrape, PDF parse, or full Playwright). The adapter implementations in Weeks 1–4 then pull straight from those notes.

## Implementation order (per docs/design.md § Next Steps)

| Week | Chain | Notes |
|------|-------|-------|
| 1 | Raley's | First adapter end-to-end. Use whichever path Day 1 reveals. |
| 2 | Save Mart | Second adapter. Builds confidence in the contract. |
| 3 | Grocery Outlet | First LLM-parsed circular (proves the Haiku + Zod path). |
| 4 | Holiday Market, SPD, Walmart Grass Valley, BevMo Auburn | Remaining four — coverage threshold met. |
| 5 | (cross-chain) | Product alias normalization workflow. |
| 6 | (post) | Detail page + 90-day baseline + indie admin form + soft launch. |

Delivery aggregators (DoorDash, Caviar, Instacart, Toast) live as a separate sibling pattern, not in this directory. They get their own folder once Week 4 is complete and a real need emerges (per design doc's revised architecture, deferred).
