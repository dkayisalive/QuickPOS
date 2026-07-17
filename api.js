/* api.js
   Handles all communication with the Google Apps Script backend (acting as our
   serverless API on top of Google Sheets). Falls back to offline queue on failure.
*/

const Api = (() => {

  function getUrl() {
    return Storage.getSettings().scriptUrl;
  }

  // Generic POST helper -> Apps Script Web App (doPost). Uses text/plain to
  // avoid CORS preflight issues with Apps Script.
  async function postAction(action, payload) {
    const url = getUrl();
    if (!url) throw new Error('Google Apps Script URL not configured');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });
    if (!res.ok) throw new Error('Network response not ok');
    return res.json();
  }

  // Generic GET helper -> Apps Script Web App (doGet), used for pulling data.
  async function getAction(action, params = {}) {
    const url = getUrl();
    if (!url) throw new Error('Google Apps Script URL not configured');
    const query = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${url}?${query}`);
    if (!res.ok) throw new Error('Network response not ok');
    return res.json();
  }

  // Push a single completed sale to the Sales sheet as one new row.
  async function submitSale(sale) {
    return postAction('addSale', sale);
  }

  // Pull the latest confirmed receipt counter from the backend, so multiple
  // devices sharing one sheet never produce duplicate receipt numbers.
  async function getLastReceiptNumber() {
    const result = await getAction('getLastReceiptNumber');
    return result.lastNumber || 0;
  }

  // Fetch products/categories/settings from the sheet (used to sync admin edits
  // across devices). Optional — app works fully from local storage too.
  async function pullMenu() {
    return getAction('getMenu');
  }

  async function pushMenu(categories, products, settings) {
    return postAction('saveMenu', { categories, products, settings });
  }

  async function fetchDailySummary(dateStr) {
    return getAction('getDailySummary', { date: dateStr });
  }

  async function searchSales(query) {
    return getAction('searchSales', { q: query });
  }

  function isOnline() {
    return navigator.onLine;
  }

  // Attempts to sync all pending (offline-queued) sales. Called on load,
  // on 'online' event, and manually from Admin Settings.
  async function syncPendingSales(onEach) {
    if (!isOnline()) return { synced: 0, remaining: Storage.getPendingSales().length };
    const pending = Storage.getPendingSales();
    let synced = 0;
    for (const sale of pending) {
      try {
        await submitSale(sale);
        Storage.removePendingSale(sale.receiptNo);
        Storage.cacheSale(sale);
        synced++;
        if (onEach) onEach(sale, true);
      } catch (err) {
        if (onEach) onEach(sale, false);
        break; // stop on first failure, retry rest later
      }
    }
    return { synced, remaining: Storage.getPendingSales().length };
  }

  return {
    submitSale, getLastReceiptNumber, pullMenu, pushMenu,
    fetchDailySummary, searchSales, isOnline, syncPendingSales
  };
})();
