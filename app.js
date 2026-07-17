/* app.js
   Main application controller: renders categories/products, manages cart state,
   handles search, favorites, discounts, payment, and sale completion.
   This is the entry point that wires up all UI event listeners.
*/

// ---------- Toast helper (shared tiny module) ----------
const Toast = (() => {
  let timer = null;
  function show(msg, duration = 2200) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.add('hidden'), duration);
  }
  return { show };
})();

const App = (() => {
  let categories = [];
  let products = [];
  let cart = []; // { productId, name, price, qty }
  let activeCategory = null; // null = favorites/home view
  let selectedPayment = null;
  let selectedDiscountPct = 0;
  let customDiscountActive = false;
  let longPressTimer = null;
  let isSubmitting = false; // prevents double-submit of sale

  // -------- Initialization --------
  function init() {
    categories = Storage.getCategories();
    products = Storage.getProducts();
    applyTheme(Storage.getTheme());
    refreshHeader();
    renderCategories();
    renderFavorites();
    startClock();
    bindEvents();
    registerServiceWorker();
    tryAutoSync();
    window.addEventListener('online', tryAutoSync);
  }

  function refreshHeader() {
    const s = Storage.getSettings();
    document.getElementById('restaurantName').textContent = s.restaurantName;
    document.getElementById('restaurantLogo').src = s.logoUrl;
    document.getElementById('receiptNo').textContent = Storage.peekReceiptNo();
  }

  function reloadMenu() {
    categories = Storage.getCategories();
    products = Storage.getProducts();
    renderCategories();
    if (activeCategory) {
      loadCategory(activeCategory);
    } else {
      renderFavorites();
    }
  }

  // -------- Clock --------
  function startClock() {
    function tick() {
      const now = new Date();
      document.getElementById('clockDate').textContent = now.toLocaleDateString();
      document.getElementById('clockTime').textContent = now.toLocaleTimeString();
    }
    tick();
    setInterval(tick, 1000);
  }

  // -------- Categories & Products rendering --------
  function renderCategories() {
    const bar = document.getElementById('categoryBar');
    bar.innerHTML = '';
    const homeBtn = document.createElement('button');
    homeBtn.className = 'cat-btn' + (activeCategory === null ? ' active' : '');
    homeBtn.textContent = '⭐ Favorites';
    homeBtn.addEventListener('click', () => { activeCategory = null; renderFavorites(); renderCategories(); });
    bar.appendChild(homeBtn);

    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'cat-btn' + (activeCategory === cat.id ? ' active' : '');
      btn.textContent = cat.name;
      btn.addEventListener('click', () => loadCategory(cat.id));
      bar.appendChild(btn);
    });
  }

  function loadCategory(catId) {
    activeCategory = catId;
    const cat = categories.find((c) => c.id === catId);
    document.getElementById('productSectionLabel').textContent = cat ? cat.name : 'Products';
    const items = products.filter((p) => p.catId === catId);
    renderProductGrid(items);
    renderCategories();
    document.getElementById('searchBox').value = '';
  }

  function renderFavorites() {
    document.getElementById('productSectionLabel').textContent = 'Favorites';
    const favs = products.filter((p) => p.favorite);
    renderProductGrid(favs.length ? favs : products.slice(0, 8));
  }

  function renderProductGrid(items) {
    const grid = document.getElementById('productGrid');
    grid.innerHTML = '';
    const s = Storage.getSettings();
    items.forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'prod-btn';
      btn.style.background = p.color || '#607d8b';
      const inCart = cart.find((c) => c.productId === p.id);
      btn.innerHTML = `<span>${p.name}</span><span class="price">${s.currency}${p.price.toFixed(0)}</span>` +
        (inCart ? `<span class="qty-badge">${inCart.qty}</span>` : '');

      // Single click: add to cart or increase quantity
      btn.addEventListener('click', () => addToCart(p));

      // Long press: open quantity edit modal directly
      btn.addEventListener('touchstart', () => {
        longPressTimer = setTimeout(() => openQtyModal(p.id), 550);
      });
      btn.addEventListener('touchend', () => clearTimeout(longPressTimer));
      btn.addEventListener('mousedown', () => {
        longPressTimer = setTimeout(() => openQtyModal(p.id), 550);
      });
      btn.addEventListener('mouseup', () => clearTimeout(longPressTimer));

      grid.appendChild(btn);
    });
  }

  // -------- Search --------
  function handleSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      if (activeCategory) loadCategory(activeCategory); else renderFavorites();
      return;
    }
    document.getElementById('productSectionLabel').textContent = `Results for "${query}"`;
    const filtered = products.filter((p) => p.name.toLowerCase().includes(q));
    renderProductGrid(filtered);
  }

  // -------- Cart logic --------
  function addToCart(product) {
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ productId: product.id, name: product.name, price: product.price, qty: 1 });
    }
    renderCart();
    refreshCurrentGrid();
  }

  function changeQty(productId, delta) {
    const item = cart.find((c) => c.productId === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter((c) => c.productId !== productId);
    }
    renderCart();
    refreshCurrentGrid();
  }

  function removeFromCart(productId) {
    cart = cart.filter((c) => c.productId !== productId);
    renderCart();
    refreshCurrentGrid();
  }

  function clearCart() {
    if (!cart.length) return;
    if (!confirm('Clear entire cart?')) return;
    cart = [];
    selectedPayment = null;
    selectedDiscountPct = 0;
    customDiscountActive = false;
    document.getElementById('cashReceived').value = '';
    document.getElementById('orderNote').value = '';
    document.querySelectorAll('.pay-btn').forEach((b) => b.classList.remove('selected'));
    document.querySelectorAll('.disc-btn').forEach((b) => b.classList.remove('active'));

    // FIX: Explicitly zero all summary display fields so they reset immediately
    // regardless of any currency/settings timing issue.
    const s = Storage.getSettings();
    const cur = s.currency || '';
    document.getElementById('subtotalVal').textContent = cur + '0.00';
    document.getElementById('discountVal').textContent = cur + '0.00';
    document.getElementById('grandTotalVal').textContent = cur + '0.00';
    document.getElementById('balanceVal').textContent = cur + '0.00';

    renderCart();       // re-renders list and calls updateTotals() -> confirms zeroed values
    refreshCurrentGrid();
  }

  function refreshCurrentGrid() {
    // Re-render grid to update quantity badges without losing scroll context much
    if (activeCategory) loadCategory(activeCategory);
    else renderFavorites();
  }

  function renderCart() {
    const list = document.getElementById('cartList');
    const emptyMsg = document.getElementById('cartEmptyMsg');
    const s = Storage.getSettings();
    list.innerHTML = '';
    if (!cart.length) {
      list.appendChild(emptyMsg);
    } else {
      cart.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-sub">${s.currency}${item.price.toFixed(0)} x ${item.qty} = ${s.currency}${(item.price*item.qty).toFixed(0)}</div>
          </div>
          <div class="qty-controls">
            <button class="qty-btn" data-action="dec" data-id="${item.productId}">-</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.productId}">+</button>
            <button class="del-btn" data-action="del" data-id="${item.productId}">🗑️</button>
          </div>`;
        list.appendChild(row);
      });
    }
    list.querySelectorAll('[data-action="inc"]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.id, 1)));
    list.querySelectorAll('[data-action="dec"]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.id, -1)));
    list.querySelectorAll('[data-action="del"]').forEach((b) => b.addEventListener('click', () => removeFromCart(b.dataset.id)));
    updateTotals();
  }

  // -------- Totals & Discount --------
  function getSubtotal() {
    return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  function getDiscountAmount(subtotal) {
    return subtotal * (selectedDiscountPct / 100);
  }

  function updateTotals() {
    const s = Storage.getSettings();
    const subtotal = getSubtotal();
    const discount = getDiscountAmount(subtotal);
    const taxable = subtotal - discount;
    const tax = taxable * ((s.taxPercent || 0) / 100);
    const grandTotal = taxable + tax;
    const cashReceived = parseFloat(document.getElementById('cashReceived').value) || 0;
    const balance = cashReceived - grandTotal;

    document.getElementById('subtotalVal').textContent = s.currency + subtotal.toFixed(2);
    document.getElementById('discountVal').textContent = s.currency + discount.toFixed(2);
    document.getElementById('grandTotalVal').textContent = s.currency + grandTotal.toFixed(2);
    document.getElementById('balanceVal').textContent = s.currency + balance.toFixed(2);

    validateCompleteButton();
  }

  function setDiscount(pct) {
    selectedDiscountPct = pct;
    document.querySelectorAll('.disc-btn').forEach((b) => b.classList.remove('active'));
    const btn = document.querySelector(`.disc-btn[data-pct="${pct}"]`);
    if (btn) btn.classList.add('active');
    updateTotals();
  }

  // -------- Payment --------
  function selectPayment(method) {
    selectedPayment = method;
    document.querySelectorAll('.pay-btn').forEach((b) => b.classList.toggle('selected', b.dataset.method === method));
    validateCompleteButton();
  }

  function validateCompleteButton() {
    const btn = document.getElementById('completeSaleBtn');
    const subtotal = getSubtotal();
    btn.disabled = !(cart.length && selectedPayment && subtotal > 0) || isSubmitting;
  }

  // -------- Quantity Modal (long press) --------
  function openQtyModal(productId) {
    const item = cart.find((c) => c.productId === productId);
    const product = products.find((p) => p.id === productId);
    if (!item && !product) return;
    document.getElementById('qtyModal').classList.remove('hidden');
    document.getElementById('qtyInput').value = item ? item.qty : 1;
    document.getElementById('qtyInput').dataset.productId = productId;
  }

  function saveQtyModal() {
    const productId = document.getElementById('qtyInput').dataset.productId;
    const qty = Math.max(1, parseInt(document.getElementById('qtyInput').value) || 1);
    const existing = cart.find((c) => c.productId === productId);
    if (existing) {
      existing.qty = qty;
    } else {
      const product = products.find((p) => p.id === productId);
      if (product) cart.push({ productId: product.id, name: product.name, price: product.price, qty });
    }
    document.getElementById('qtyModal').classList.add('hidden');
    renderCart();
    refreshCurrentGrid();
  }

  // -------- Custom Discount Modal --------
  function openDiscModal() {
    document.getElementById('discModal').classList.remove('hidden');
    document.getElementById('discInput').value = selectedDiscountPct || '';
  }

  function saveDiscModal() {
    const pct = Math.min(100, Math.max(0, parseFloat(document.getElementById('discInput').value) || 0));
    setDiscount(pct);
    document.querySelectorAll('.disc-btn[data-pct]').forEach((b) => b.classList.remove('active'));
    document.getElementById('customDiscBtn').classList.add('active');
    document.getElementById('discModal').classList.add('hidden');
  }

  // -------- Complete Sale (core transaction flow) --------
  async function completeSale() {
    if (isSubmitting) return; // prevent double submission / accidental double payment
    if (!cart.length || !selectedPayment) return;
    isSubmitting = true;
    document.getElementById('completeSaleBtn').disabled = true;

    const s = Storage.getSettings();
    const subtotal = getSubtotal();
    const discount = getDiscountAmount(subtotal);
    const taxable = subtotal - discount;
    const tax = taxable * ((s.taxPercent || 0) / 100);
    const grandTotal = taxable + tax;
    const cashReceived = selectedPayment === 'Cash' ? (parseFloat(document.getElementById('cashReceived').value) || 0) : grandTotal;
    const balance = cashReceived - grandTotal;

    if (selectedPayment === 'Cash' && cashReceived < grandTotal) {
      Toast.show('Cash received is less than grand total');
      isSubmitting = false;
      validateCompleteButton();
      return;
    }

    const now = new Date();
    const receiptNo = Storage.getNextReceiptNo();
    const sale = {
      receiptNo,
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      cashier: s.cashierName,
      items: cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      subtotal, discount, grandTotal,
      paymentMethod: selectedPayment,
      cashReceived, balance,
      notes: document.getElementById('orderNote').value.trim(),
      status: 'Pending'
    };

    // Try to submit online; if it fails, queue locally for auto-sync later.
    try {
      if (!Api.isOnline()) throw new Error('offline');
      await Api.submitSale(sale);
      sale.status = 'Synced';
      Toast.show(`Sale ${receiptNo} saved to Google Sheets`);
    } catch (err) {
      sale.status = 'Pending (offline)';
      Storage.queueSale(sale);
      Toast.show(`Offline: ${receiptNo} saved locally, will sync later`);
    }
    Storage.cacheSale(sale);

    Receipt.renderToModal(sale);
    // FIX: reset isSubmitting BEFORE resetOrderState so validateCompleteButton
    // sees the correct state and properly re-enables the button for the next sale.
    isSubmitting = false;
    resetOrderState();
  }

  function resetOrderState() {
    cart = [];
    selectedPayment = null;
    selectedDiscountPct = 0;
    customDiscountActive = false;
    document.getElementById('cashReceived').value = '';
    document.getElementById('orderNote').value = '';
    document.querySelectorAll('.pay-btn').forEach((b) => b.classList.remove('selected'));
    document.querySelectorAll('.disc-btn').forEach((b) => b.classList.remove('active'));
    renderCart();       // zeroes totals display and clears cart list
    refreshHeader();
    refreshCurrentGrid();
  }

  // -------- Auto sync on load / reconnect --------
  async function tryAutoSync() {
    if (!Api.isOnline()) return;
    const result = await Api.syncPendingSales();
    if (result.synced > 0) Toast.show(`Auto-synced ${result.synced} offline sale(s)`);
  }

  // -------- Dark mode --------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Storage.saveTheme(theme);
    // FIX: update icon to reflect current theme
    const btn = document.getElementById('darkModeBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function toggleTheme() {
    const current = Storage.getTheme();
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // -------- Sales History --------
  function openHistory() {
    document.getElementById('historyModal').classList.remove('hidden');
    renderHistory('');
  }

  function renderHistory(query) {
    const list = document.getElementById('historyList');
    const sales = Storage.getSalesCache().filter((s) =>
      !query || s.receiptNo.toLowerCase().includes(query.toLowerCase()));
    list.innerHTML = sales.length ? '' : '<p>No sales found.</p>';
    sales.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML = `<span>${s.receiptNo} | ${s.date} ${s.time} | Rs.${s.grandTotal.toFixed(0)} | ${s.status}</span>
        <button data-reprint="${s.receiptNo}">Reprint</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-reprint]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const sale = sales.find((s) => s.receiptNo === btn.dataset.reprint);
        if (sale) Receipt.renderToModal(sale);
      }));
  }

  // -------- Service Worker registration for PWA offline support --------
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // -------- Event bindings --------
  function bindEvents() {
    document.getElementById('searchBox').addEventListener('input', (e) => handleSearch(e.target.value));
    document.getElementById('clearCartBtn').addEventListener('click', clearCart);
    document.getElementById('cashReceived').addEventListener('input', updateTotals);
    document.getElementById('darkModeBtn').addEventListener('click', toggleTheme);

    document.querySelectorAll('.disc-btn[data-pct]').forEach((btn) =>
      btn.addEventListener('click', () => setDiscount(parseFloat(btn.dataset.pct))));
    document.getElementById('customDiscBtn').addEventListener('click', openDiscModal);
    document.getElementById('discCancelBtn').addEventListener('click', () => document.getElementById('discModal').classList.add('hidden'));
    document.getElementById('discSaveBtn').addEventListener('click', saveDiscModal);

    document.querySelectorAll('.pay-btn').forEach((btn) =>
      btn.addEventListener('click', () => selectPayment(btn.dataset.method)));
    document.getElementById('completeSaleBtn').addEventListener('click', completeSale);

    document.getElementById('qtyCancelBtn').addEventListener('click', () => document.getElementById('qtyModal').classList.add('hidden'));
    document.getElementById('qtySaveBtn').addEventListener('click', saveQtyModal);

    document.getElementById('printReceiptBtn').addEventListener('click', Receipt.printReceipt);
    document.getElementById('downloadPdfBtn').addEventListener('click', Receipt.downloadPdf);
    document.getElementById('sharePdfBtn').addEventListener('click', Receipt.sharePdf);

    // FIX: New Sale button now fully resets cart, totals, discounts, and payment
    // in addition to closing the receipt modal.
    document.getElementById('newSaleBtn').addEventListener('click', () => {
      document.getElementById('receiptModal').classList.add('hidden');
      resetOrderState();
    });

    document.getElementById('settingsBtn').addEventListener('click', Settings.open);
    document.getElementById('pinSubmitBtn').addEventListener('click', Settings.submitPin);
    document.getElementById('closeSettingsBtn').addEventListener('click', Settings.close);
    document.getElementById('saveGeneralBtn').addEventListener('click', Settings.saveGeneral);
    document.getElementById('addCatBtn').addEventListener('click', Settings.addCategory);
    document.getElementById('addProdBtn').addEventListener('click', Settings.addProduct);
    document.getElementById('testConnBtn').addEventListener('click', Settings.testConnection);
    document.getElementById('syncNowBtn').addEventListener('click', Settings.syncNow);
    document.getElementById('exportCsvBtn').addEventListener('click', Settings.exportCsv);

    document.querySelectorAll('.tab-btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      }));

    document.getElementById('historyBtn').addEventListener('click', openHistory);
    document.getElementById('closeHistoryBtn').addEventListener('click', () => document.getElementById('historyModal').classList.add('hidden'));
    document.getElementById('historySearch').addEventListener('input', (e) => renderHistory(e.target.value));
  }

  return { init, refreshHeader, reloadMenu };
})();

document.addEventListener('DOMContentLoaded', App.init);
