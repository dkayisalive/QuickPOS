# QuickPOS - Cloud POS for Takeaway Restaurants

A fast, offline-capable Progressive Web App (PWA) Point of Sale system built with
vanilla HTML/CSS/JS and Google Apps Script + Google Sheets as the backend database.

## Files
- index.html - main app shell/UI
- style.css - Material-inspired styling, dark mode, responsive layout
- storage.js - localStorage layer (settings, menu, offline sale queue, receipt counter)
- api.js - talks to Google Apps Script backend, handles offline sync
- receipt.js - builds and renders printable receipts (print/PDF/share)
- settings.js - PIN-protected admin panel logic (categories, products, integration)
- app.js - main controller: cart, search, favorites, discounts, payments, sale flow
- sw.js - service worker for offline caching (PWA)
- manifest.json - PWA manifest (installable, splash screen, icons)
- icons/ - app icons (192x192, 512x512) — replace with your restaurant logo
- AppsScript.gs - Google Apps Script backend code (deploy as Web App)

## Setup Steps

### 1. Google Sheet + Apps Script
1. Create a new Google Sheet (this becomes your database).
2. Open Extensions > Apps Script.
3. Delete any starter code, paste the entire contents of `AppsScript.gs`.
4. Click Deploy > New deployment > select type "Web app".
   - Execute as: **Me**
   - Who has access: **Anyone** (required for the browser app to call it without login)
5. Click Deploy, authorize permissions, and copy the **Web App URL**.
6. The script auto-creates the Sales, Products, Categories, Settings, and Daily Summary
   sheets on first run — no manual sheet setup required.

### 2. Configure the App
1. Host the `pos-system` folder anywhere static files can be served: GitHub Pages,
   Netlify, Vercel, or even opened directly via `index.html` for local testing
   (for full PWA install + service worker, use HTTPS hosting like GitHub Pages).
2. Open the app in Chrome on Android or desktop.
3. Tap the ⚙️ Settings icon, enter the default PIN `1234`, go to the "Integration" tab.
4. Paste your Apps Script Web App URL and click "Test Connection".
5. Update restaurant name, address, phone, tax %, currency, and logo under "General".
6. Add/edit categories and products under their respective tabs.
7. Change the default PIN immediately for security.

### 3. Install as an App (Android)
1. Open the app URL in Chrome.
2. Tap the browser menu > "Add to Home Screen" (or the automatic install prompt).
3. The app will launch full-screen without browser UI, like a native app.

## How It Works
- Every completed sale is sent to the Sales sheet as a new row — nothing is ever
  overwritten [file:AppsScript.gs uses appendRow + LockService to avoid race conditions].
- If the device is offline, the sale is stored in localStorage and automatically
  retried when the connection returns (`api.js` + `online` event listener in `app.js`).
- Receipt numbers (POS-000001, POS-000002...) are generated locally and cross-checked
  against the sheet's highest existing number via "Test Connection" to avoid duplicates
  across multiple devices.
- Discounts, tax %, and payment method are calculated client-side before submission.
- The Daily Summary sheet auto-updates aggregated totals (orders, sales by payment type,
  average order value) every time a sale is added — no manual reports needed.

## Notes on Design Decisions
- No external JS libraries or frameworks were used per requirements — PDF export uses
  the browser's native print-to-PDF via `window.print()`, which works reliably offline
  and needs no dependencies.
- localStorage (not IndexedDB) is used for simplicity, as data volumes for a small
  takeaway POS are modest and localStorage read/write is effectively instant.
- The UI defaults to a "Favorites" home screen so the cashier can complete most orders
  in 2-3 taps without navigating categories.

## Security
- Admin settings are behind a 4-6 digit PIN (change from default `1234` immediately).
- The "Complete Sale" button is disabled during submission to prevent double payments.
- Duplicate receipt numbers are rejected server-side via a lock + existence check.
