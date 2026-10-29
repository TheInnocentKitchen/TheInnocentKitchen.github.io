# The Innocent Kitchen — Ordering & Kitchen Operations

This repository powers the customer ordering and kitchen workflow pages hosted with GitHub Pages.

## Live pages
- Customer ordering: https://theinnocentkitchen.github.io/order.html
- Kitchen dashboard: https://theinnocentkitchen.github.io/admin-v2.html
- Original local-first Packing Desk: https://theinnocentkitchen.github.io/

## Main files
- `order.html`: customer sign-in, menu/cart, scheduled delivery slots, checkout, order history/tracking and UPI UTR reporting.
- `admin-v2.html`: authenticated dashboard for orders, status/payment management, shared recipes and packing totals.
- `admin-availability.js` / `customer-availability.js`: shared menu availability.
- `daily-menu-admin.js` / `daily-menu-customer.js`: daily menu publishing and customer display.
- `delivery-slots-admin.js` / `delivery-slots-customer.js`: delivery windows, capacity and cut-offs.
- `slot-production-board.js`: slot-wise production, shared checklist, delay alerts and dispatch workflow.
- `service-worker.js`: caches the installable site's static files.
- `index.html`: separate local-first manual Packing Desk retained for offline use.

## Backend
The application uses Supabase project `demphpgcqtxapmqvlkdd`. The browser uses a publishable key only; never commit a service-role key. Database RLS and RPC validation enforce access and checkout checks.

## Operational notes
- Test customer checkout, admin order transitions, menu publishing, slot capacity, shared recipe sync and checklist changes after deployments.
- Recipe quantities must be verified against actual kitchen SOPs. The production board does not invent missing recipes or validate raw/cooked yields.
- UTR submission is not payment verification; the kitchen must verify the transaction separately.
- Orders require authenticated customers; token-protected tracking and UTR reporting use validated RPC functions.

## Database changes and safety
Read [Supabase maintenance notes](supabase/README.md) before modifying the database. The live database contains Phase 3–5 schema objects whose historical migration SQL is not yet fully captured. Do not reset or recreate production from the current migration folder until a complete baseline has been captured and reviewed.
