# BeerBuddy — Friday Endcap Audit (SUPERSEDED — kept as fallback)

> **Status as of 2026-05-04:** Superseded by the web audit conducted in `/design-consultation`. The validation work this checklist describes was completed remotely from chain websites, weekly ads, and delivery aggregators — see the design doc's "Data-surface map" section. **You do not need to do this trip in person.**
>
> This document is preserved as **Plan B**: if any specific chain turns out to have unscrapeable web data once implementation begins (e.g., Holiday Market, which the web audit didn't fully resolve), an in-person photo audit at that one chain remains the cheapest fallback. Use this checklist for that case. Otherwise, ignore it.

---

**Mission (original):** validate the design doc's assumptions about chain pricing, packaging, and shelf data before writing any code.
**Stops:** Raley's Grass Valley (125 W McKnight Way) → Save Mart Nevada City (735 Zion St)
**Time budget:** ~20 min per store, ~1.5hr round trip
**Tool:** phone camera, this checklist

---

## Why you're doing this

The design doc commits to scraping ~7 chain websites and ingesting weekly ad PDFs for prices. It assumes:

1. Real shelf tags carry the data we'll match against (SKU, brand, pack size, price)
2. The chain's online prices match (or are within ~$0.50 of) shelf prices
3. The stores actually carry the brands and pack sizes we expect
4. Endcap / promo pricing is visually distinct from regular shelf pricing
5. Local craft beer (Sierra Nevada, Lagunitas) gets enough shelf space to be worth surfacing

Twenty minutes in two stores tells you whether any of these assumptions are wrong, **before you spend a weekend building a Raley's adapter against bad data**. If any one is wrong, the architecture pivots fast and cheap.

---

## At each store — capture this

### 1. The full beer aisle (wide shot)
- One photo from each end of the beer cooler/aisle
- One photo of the warm-shelf beer (non-refrigerated)
- One photo of any standalone beer displays / endcaps

### 2. Endcap / promo signage (close-up)
- Every endcap sign showing a beer deal — capture price, period ("this week," "save through 5/10"), brand
- Note: do they say "Sale" / "Special" / "Deal" / "Member price" / something else?
- Are there "stack and save" / "buy 2 get 1" / "mix-and-match" deals? How are they written?

### 3. Shelf tags (close-up, readable)
Photograph at least **15 different shelf tags** across these categories:
- Light lager 12-pack (Coors, Bud, Modelo, Pacifico)
- Light lager 30-pack
- Craft IPA 6-pack
- Craft IPA 12-pack
- Local craft (Sierra Nevada, Lagunitas, anything with "California" or "Nevada City" on the label)
- Premium import (Stella, Heineken, Corona)
- Variety pack
- Hard seltzer (White Claw, Truly — yes, technically not beer, but check whether they live in the same aisle)
- Cider (Angry Orchard, Strongbow)
- Anything that looks like a manager's special or end-of-aisle clearance

For each tag photo, **make sure you can read:**
- The price (regular and any "was" price)
- The product name
- The pack size and container (12-pack cans, 6-pack bottles, single 19.2oz, etc.)
- The SKU / UPC code (the small numbers at the bottom of the tag)

### 4. Anything weird
- Tags with the price scratched out and rewritten in pen
- "Out of stock" / "limit 2 per customer" markers
- Shelf gaps where the tag exists but the product is missing
- Multiple tags for the same product at different prices (rare but happens)
- Anything "BeerBuddy" couldn't predict from a website

### 5. Weekly ad / circular
- Find the printed weekly ad (usually near the entrance, the customer service desk, or stacked at the end of the alcohol aisle)
- Photograph the cover and every alcohol page
- Note: is the circular dated? Does it have a clear "valid through" date? A barcode?

### 6. Digital pricing (Raley's especially)
- Look for any digital shelf displays or QR codes on shelf tags
- If you see a QR code, scan it and photograph the URL it goes to
- Note whether prices on the shelf vary store-to-store within the chain (you can check Raley's website on your phone to compare)

---

## Quick-reference field notes (fill in afterwards)

```
RALEY'S — Grass Valley                                    SAVE MART — Nevada City
─────────────────────────────────────                     ─────────────────────────────────────
Beer aisle approx feet of shelf:                          Beer aisle approx feet of shelf:
                                                          
# of distinct beer SKUs visible:                          # of distinct beer SKUs visible:
                                                          
Endcap deals this week (count):                           Endcap deals this week (count):
                                                          
Local craft section?    Y / N                             Local craft section?    Y / N
                                                          
SKU code on tag readable? Y / N                           SKU code on tag readable? Y / N
                                                          
Weekly ad available in store? Y / N                       Weekly ad available in store? Y / N
                                                          
Digital pricing / QR codes? Y / N                         Digital pricing / QR codes? Y / N
                                                          
"Surprise" finding (something the                         "Surprise" finding (something the
design doc didn't anticipate):                            design doc didn't anticipate):
                                                          
─────                                                     ─────
                                                          
Top 3 best deals you saw                                  Top 3 best deals you saw
(brand · pack · regular · sale):                          (brand · pack · regular · sale):
1.                                                        1.
2.                                                        2.
3.                                                        3.
```

---

## When you get back

Throw the field notes + a few key photos in this folder:

```
~/.config/tool-stack/projects/beerbuddy/audit-2026-05-XX/
  raleys-shelf-tags/      (folder of photos)
  raleys-endcaps/
  raleys-circular.pdf     (or photo of cover)
  savemart-shelf-tags/
  savemart-endcaps/
  savemart-circular.pdf
  field-notes.md          (fill in the Quick-reference template above)
```

Then come back and tell me what you found. Specifically I'll want to know:

1. **Does the SKU code on shelf tags match anything queryable on the chain website?** This determines product-matching strategy in Week 5.
2. **Does the weekly ad cover beer prominently?** This validates the "ingest the circular" path — if beer is buried, scraping product pages is the better default.
3. **Any chain mismatch:** does Raley's website show prices that match what's on the shelf? If you see the same beer at +/- $1, the data accuracy bar gets harder than the design doc assumed.
4. **Anything that surprised you.** This is the most valuable category — surprises are where the design doc is wrong.

If anything is materially different from what the design doc assumed, we'll revise the doc and the Week 1 plan before any code gets written. Cheap to update now, expensive after the adapter is built.

Have a beer when you're done. You earned it.
