# The Innocent Kitchen — Packing Desk v1

## What is included
- `index.html`: local-first order entry, recipe database, consolidated packing list, checklist, CSV and JSON backup.
- `manifest.webmanifest`: installable web-app metadata.
- `service-worker.js`: caches the app shell for offline use after the first online visit.

## Important recipe note
Starter recipes are editable examples:
- Common thali base: basmati rice 200 g, dal 100 g, gravy 90 g, seasonal vegetable sabji 80 g, mint curd 1 portion, salad 1 portion.
- Protein examples: chicken 150 g, fish 150 g, egg curry 2 eggs, matar paneer 120 g. Soya and legume protein portions are placeholders at 150 g.
Confirm all portions and units against the current production SOP before relying on the output. The app sums recipes deterministically; it does not infer missing recipe data.

## Install on Android and use offline
A Progressive Web App service worker requires a secure origin (HTTPS; localhost is an exception). To install:
1. Upload these three files to any HTTPS static host.
2. Open the app URL in Chrome on the Android phone while online.
3. Choose Chrome menu > Install app or Add to Home screen.
4. Open it once while online so the service worker caches the app shell.
5. Test by turning on airplane mode and reopening the app.

The app stores data in the browser's local storage on that device. Export a JSON backup regularly. Browser storage can be cleared by the operating system or browser; this is not a cloud backup.

## Basic workflow
1. On Orders, type a customer label, select an SKU, choose Rice/Roti/Paratha, and set quantity.
2. Tap Add item for each SKU in that customer's order.
3. Tap Save customer order.
4. Open Packing list and tick each component when packed.
5. Edit/add SKUs and exact recipe amounts in Recipes.
6. Export JSON backups and CSV packing lists in Data & backup.

## Current v1 limitations
- Manual entry only; no WhatsApp import, payment reconciliation, inventory depletion, or multi-device sync.
- The meal selector swaps the standard 200 g rice component for 4 rotis or 3 parathas per thali. Confirm these portions against your current SOP. If a specific SKU uses different bread quantities, create a separate SKU recipe or adjust the app logic.
- No login or cloud sync. Use only on the device where orders are entered.
