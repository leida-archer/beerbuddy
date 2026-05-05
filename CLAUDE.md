# CLAUDE.md fragment for the BeerBuddy repo

> When the BeerBuddy repo is initialized, append this section to (or use it as the basis of) the repo's `CLAUDE.md`.

## Design System

This project has a locked design system documented in `DESIGN.md` ("Golden Hour"). Always read `DESIGN.md` before making any visual or UI decision. Specifically:

- **Typography is fixed:** Editorial New (display), Bricolage Grotesque (body / UI), Geist Mono (data / prices). Do not introduce new fonts. Italics are reserved for very rare semantic emphasis — do not use italic for prices, savings, or section titles.
- **Color is fixed:** wheat-oak page (`#F4E8CB`) + white content surface (`#FFFFFF`) + ink text (`#1F1610`) + warm amber accent (`#B8651E`) + cool forest accent (`#2D4A3E`). Do not introduce new colors without an entry in `DESIGN.md`'s Decisions Log.
- **Components are intentionally minimal:** chrome-less deal cards (hairline rules between rows), text-link directions (not icon buttons), typography-only BEST DEAL eyebrow (no chrome). Do not re-add card backgrounds, drop shadows, gradient buttons, decorative ornaments, or pill-shaped filter chips. Each of these was tried and rejected during `/design-consultation`.
- **Spacing & motion are fixed:** 4px base unit, comfortable density, `cubic-bezier(0.16, 1, 0.3, 1)` settle easing, no `translateY` hover lifts. Respect `prefers-reduced-motion` globally.
- **Accessibility floor is WCAG 2.1 AA:** 44×44 touch targets, visible 2px focus rings, alt text, aria-labels, `prefers-color-scheme` dark mode supported.

In QA mode (or when running `/design-review` / `/qa`), flag any code that doesn't match `DESIGN.md`. The Decisions Log section of `DESIGN.md` records the reasoning for each non-obvious choice — refer to it before suggesting changes.

### Product Principle: Zero User Labor (non-negotiable)

The user never works to make BeerBuddy better. Every piece of data the app shows is sourced from the web by the developer (chain websites, weekly ads, delivery aggregators). The user's only job is to read what's there.

When implementing features, refuse to add:

- "Submit a price" / "Report an error" / "Improve this page" affordances
- Feedback prompts, surveys, "how are we doing?" toasts, NPS modals
- Required signups for core utility (the app works on a fresh load with just a ZIP)
- Public upload UI (the admin form at `/admin/indie` is password-gated and never linked publicly)
- Gamification, contributor badges, leaderboards
- Empty states that invite contribution ("Help us find more!")
- Limited-history banners that ask for help (only set expectations)

If a feature appears to require user labor to function, re-architect it to source from the web, or cut it. There is no third option. See the full principle in `DESIGN.md` § Product Principle: Zero User Labor.
