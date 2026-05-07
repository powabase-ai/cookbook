# Historical line items — Acme Corp accounting

This file describes line items we've seen in prior invoices and the GL codes
they were assigned. The GL-coder agent searches this corpus when assigning
codes to new invoices.

## Vendor: Acme Office Supplies LLC

- "Letter-size printer paper, 5000 sheets" → 6420-Office-Supplies-Paper
- "Black ink cartridges" → 6421-Office-Supplies-Ink
- "Envelopes, #10 plain, 500ct" → 6420-Office-Supplies-Paper
- "Sticky note pads, assorted, 24ct" → 6420-Office-Supplies-Paper
- "Wireless mice, ergonomic" → 6450-Office-Supplies-Tech-Accessories

## Vendor: Brightline Cloud Infrastructure Inc.

- "Annual enterprise hosting plan" → 7100-Software-and-Cloud
- "Premium support (year)" → 7110-Support-Contracts
- "Storage tier expansion (TB-month)" → 7100-Software-and-Cloud
- "Dedicated VPN gateway" → 7120-Networking-Services

## Vendor: Capitol Hardware Distributors

- "Hex bolts, box of 100" → 5510-Maintenance-Supplies
- "Hex nuts, box of 100" → 5510-Maintenance-Supplies
- "Lock washers, assorted" → 5510-Maintenance-Supplies
- "Wood screws, 100ct" → 5510-Maintenance-Supplies
- "Industrial adhesive, gallon" → 5520-Maintenance-Chemicals

## Vendor: Lakeside Stationers

- "Spiral notebooks, 100ct" → 6420-Office-Supplies-Paper
- "Ballpoint pens, 144ct" → 6420-Office-Supplies-Paper
- "Highlighter assortment" → 6420-Office-Supplies-Paper
- "Whiteboard markers, 12ct" → 6420-Office-Supplies-Paper

## Vendor: Coastal Office Furnishings

- "Ergonomic office chair, mesh back" → 1410-Furniture-and-Fixtures (capital — depreciable)
- "Adjustable monitor arm, dual" → 1410-Furniture-and-Fixtures (capital — depreciable)
- "Standing desk, electric" → 1410-Furniture-and-Fixtures
- "Storage cabinet, 4-drawer lateral" → 1410-Furniture-and-Fixtures

## Vendor: Atelier Lumière S.A.S (France, EUR-denominated)

- (No prior history — flag as new vendor.)

## Notes for the GL-coder

- Items > $5000 individual unit price → `needs_cfo_review = true`.
- New vendors (not listed above) → `needs_cfo_review = true`.
- Furniture and fixtures items > $500 individual unit price → may be capital
  expenditure rather than expense; flag for CFO review.
- Currency conversions: when an invoice is in EUR or other non-USD currency,
  flag the entire invoice for CFO review (we don't auto-convert).
