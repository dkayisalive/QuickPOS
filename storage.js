/* storage.js
   Handles all local persistence: settings, categories, products, cart draft,
   offline sale queue, receipt counter, and sales history cache.
   Uses localStorage for simplicity and speed (no IndexedDB needed for this scale).
*/

const Storage = (() => {
  const KEYS = {
    SETTINGS: 'qp_settings',
    CATEGORIES: 'qp_categories',
    PRODUCTS: 'qp_products',
    RECEIPT_COUNTER: 'qp_receipt_counter',
    PENDING_SALES: 'qp_pending_sales',
    SALES_CACHE: 'qp_sales_cache',
    THEME: 'qp_theme'
  };

  // Default settings used on first load
  const DEFAULT_SETTINGS = {
    restaurantName: 'My Takeaway',
    address: '123 Main Street, Colombo',
    phone: '077-1234567',
    taxPercent: 0,
    currency: 'Rs.',
    logoUrl: 'icons/icon-192.png',
    cashierName: 'Cashier',
    pin: '1234',
    scriptUrl: ''
  };

  const DEFAULT_CATEGORIES = [
    { id: 'burgers', name: 'Burgers' },
    { id: 'fried_rice', name: 'Fried Rice' },
    { id: 'kottu', name: 'Kottu' },
    { id: 'noodles', name: 'Noodles' },
    { id: 'drinks', name: 'Drinks' },
    { id: 'extras', name: 'Extras' }
  ];

  const DEFAULT_PRODUCTS = [
    { id: 'p1', name: 'Chicken Burger', price: 1200, catId: 'burgers', color: '#ff5722', favorite: false },
    { id: 'p2', name: 'Cheese Kottu', price: 950, catId: 'kottu', color: '#8e24aa', favorite: true },
    { id: 'p3', name: 'Chicken Kottu', price: 1100, catId: 'kottu', color: '#3949ab', favorite: true },
    { id: 'p4', name: 'Chicken Fried Rice', price: 900, catId: 'fried_rice', color: '#00897b', favorite: true },
    { id: 'p5', name: 'Egg Noodles', price: 700, catId: 'noodles', color: '#43a047', favorite: false },
    { id: 'p6', name: 'Coke', price: 200, catId: 'drinks', color: '#fbc02d', favorite: true },
    { id: 'p7', name: 'French Fries', price: 400, catId: 'extras', color: '#f4511e', favorite: false }
  ];

  function getSettings() {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  }

  function saveSettings(settings) {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  }

  function getCategories() {
    const raw = localStorage.getItem(KEYS.CATEGORIES);
    return raw ? JSON.parse(raw) : [...DEFAULT_CATEGORIES];
  }

  function saveCategories(cats) {
    localStorage.setItem(KEYS.CATEGORIES, JSON.stringify(cats));
  }

  function getProducts() {
    const raw = localStorage.getItem(KEYS.PRODUCTS);
    return raw ? JSON.parse(raw) : [...DEFAULT_PRODUCTS];
  }

  function saveProducts(products) {
    localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(products));
  }

  // Generates the next receipt number in format POS-000001, persisted locally.
  // The counter is also confirmed/synced with the backend when online (see api.js).
  function getNextReceiptNo() {
    let counter = parseInt(localStorage.getItem(KEYS.RECEIPT_COUNTER) || '0', 10);
    counter += 1;
    localStorage.setItem(KEYS.RECEIPT_COUNTER, String(counter));
    return 'POS-' + String(counter).padStart(6, '0');
  }

  function peekReceiptNo() {
    const counter = parseInt(localStorage.getItem(KEYS.RECEIPT_COUNTER) || '0', 10) + 1;
    return 'POS-' + String(counter).padStart(6, '0');
  }

  // Sync the local counter to be at least as high as a given number (prevents duplicates
  // when multiple devices are used against the same sheet).
  function bumpCounterTo(n) {
    const current = parseInt(localStorage.getItem(KEYS.RECEIPT_COUNTER) || '0', 10);
    if (n > current) localStorage.setItem(KEYS.RECEIPT_COUNTER, String(n));
  }

  // Offline queue: sales that failed to sync are stored here and retried later.
  function queueSale(sale) {
    const pending = getPendingSales();
    pending.push(sale);
    localStorage.setItem(KEYS.PENDING_SALES, JSON.stringify(pending));
  }

  function getPendingSales() {
    const raw = localStorage.getItem(KEYS.PENDING_SALES);
    return raw ? JSON.parse(raw) : [];
  }

  function removePendingSale(receiptNo) {
    const pending = getPendingSales().filter((s) => s.receiptNo !== receiptNo);
    localStorage.setItem(KEYS.PENDING_SALES, JSON.stringify(pending));
  }

  function clearPendingSales() {
    localStorage.setItem(KEYS.PENDING_SALES, JSON.stringify([]));
  }

  // Cache of all sales (for offline history search / reprint) — updated on sync.
  function cacheSale(sale) {
    const cache = getSalesCache();
    cache.unshift(sale);
    localStorage.setItem(KEYS.SALES_CACHE, JSON.stringify(cache.slice(0, 500)));
  }

  function getSalesCache() {
    const raw = localStorage.getItem(KEYS.SALES_CACHE);
    return raw ? JSON.parse(raw) : [];
  }

  function getTheme() {
    return localStorage.getItem(KEYS.THEME) || 'light';
  }

  function saveTheme(theme) {
    localStorage.setItem(KEYS.THEME, theme);
  }

  return {
    getSettings, saveSettings,
    getCategories, saveCategories,
    getProducts, saveProducts,
    getNextReceiptNo, peekReceiptNo, bumpCounterTo,
    queueSale, getPendingSales, removePendingSale, clearPendingSales,
    cacheSale, getSalesCache,
    getTheme, saveTheme
  };
})();
