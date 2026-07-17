/* settings.js
   Manages the PIN-protected Admin Settings modal: general settings,
   categories CRUD, products CRUD, and integration (Apps Script URL) settings.
*/

const Settings = (() => {
  let unlocked = false;

  function open() {
    document.getElementById('settingsModal').classList.remove('hidden');
    document.getElementById('pinGate').classList.remove('hidden');
    document.getElementById('settingsPanel').classList.add('hidden');
    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').classList.add('hidden');
    unlocked = false;
  }

  function close() {
    document.getElementById('settingsModal').classList.add('hidden');
  }

  // Validates PIN against stored settings; on success reveals the full panel.
  function submitPin() {
    const entered = document.getElementById('pinInput').value.trim();
    const s = Storage.getSettings();
    if (entered === s.pin) {
      unlocked = true;
      document.getElementById('pinGate').classList.add('hidden');
      document.getElementById('settingsPanel').classList.remove('hidden');
      loadGeneralForm();
      renderCategoryAdmin();
      renderProductAdmin();
      document.getElementById('setScriptUrl').value = s.scriptUrl || '';
      refreshPendingCount();
    } else {
      document.getElementById('pinError').classList.remove('hidden');
    }
  }

  function loadGeneralForm() {
    const s = Storage.getSettings();
    document.getElementById('setRestName').value = s.restaurantName;
    document.getElementById('setAddress').value = s.address;
    document.getElementById('setPhone').value = s.phone;
    document.getElementById('setTax').value = s.taxPercent;
    document.getElementById('setCurrency').value = s.currency;
    document.getElementById('setLogoUrl').value = s.logoUrl;
    document.getElementById('setCashierName').value = s.cashierName;
    document.getElementById('setPin').value = '';
  }

  // Saves general settings (name, address, phone, tax, currency, logo, cashier, pin).
  function saveGeneral() {
    const s = Storage.getSettings();
    s.restaurantName = document.getElementById('setRestName').value.trim() || s.restaurantName;
    s.address = document.getElementById('setAddress').value.trim();
    s.phone = document.getElementById('setPhone').value.trim();
    s.taxPercent = parseFloat(document.getElementById('setTax').value) || 0;
    s.currency = document.getElementById('setCurrency').value.trim() || 'Rs.';
    s.logoUrl = document.getElementById('setLogoUrl').value.trim() || s.logoUrl;
    s.cashierName = document.getElementById('setCashierName').value.trim() || s.cashierName;
    const newPin = document.getElementById('setPin').value.trim();
    if (newPin) s.pin = newPin;
    Storage.saveSettings(s);
    App.refreshHeader();
    Toast.show('Settings saved');
  }

  // ---------- Category CRUD ----------
  function renderCategoryAdmin() {
    const list = document.getElementById('catAdminList');
    const cats = Storage.getCategories();
    list.innerHTML = '';
    cats.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `<span>${c.name}</span>
        <span class="actions">
          <button data-edit="${c.id}">Edit</button>
          <button data-del="${c.id}">Delete</button>
        </span>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => editCategory(btn.dataset.edit)));
    list.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', () => deleteCategory(btn.dataset.del)));
    populateProductCategoryDropdown();
  }

  function addCategory() {
    const nameInput = document.getElementById('newCatName');
    const name = nameInput.value.trim();
    if (!name) return;
    const cats = Storage.getCategories();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    cats.push({ id, name });
    Storage.saveCategories(cats);
    nameInput.value = '';
    renderCategoryAdmin();
    App.reloadMenu();
  }

  function editCategory(id) {
    const cats = Storage.getCategories();
    const cat = cats.find((c) => c.id === id);
    if (!cat) return;
    const newName = prompt('Edit category name', cat.name);
    if (newName && newName.trim()) {
      cat.name = newName.trim();
      Storage.saveCategories(cats);
      renderCategoryAdmin();
      App.reloadMenu();
    }
  }

  function deleteCategory(id) {
    if (!confirm('Delete this category? Products inside will remain but be uncategorized.')) return;
    const cats = Storage.getCategories().filter((c) => c.id !== id);
    Storage.saveCategories(cats);
    renderCategoryAdmin();
    App.reloadMenu();
  }

  // ---------- Product CRUD ----------
  function populateProductCategoryDropdown() {
    const sel = document.getElementById('newProdCat');
    const cats = Storage.getCategories();
    sel.innerHTML = cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  function renderProductAdmin() {
    const list = document.getElementById('prodAdminList');
    const products = Storage.getProducts();
    const cats = Storage.getCategories();
    list.innerHTML = '';
    products.forEach((p) => {
      const catName = (cats.find((c) => c.id === p.catId) || {}).name || '—';
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `<span>${p.name} (${catName}) - Rs.${p.price}${p.favorite ? ' ⭐' : ''}</span>
        <span class="actions">
          <button data-edit="${p.id}">Edit</button>
          <button data-del="${p.id}">Delete</button>
        </span>`;
      list.appendChild(row);
    });
    list.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => editProduct(btn.dataset.edit)));
    list.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', () => deleteProduct(btn.dataset.del)));
  }

  function addProduct() {
    const name = document.getElementById('newProdName').value.trim();
    const price = parseFloat(document.getElementById('newProdPrice').value);
    const catId = document.getElementById('newProdCat').value;
    const favorite = document.getElementById('newProdFav').checked;
    if (!name || isNaN(price)) { Toast.show('Enter valid product name and price'); return; }
    const products = Storage.getProducts();
    const id = 'p' + Date.now();
    const colors = ['#ff5722','#8e24aa','#3949ab','#00897b','#43a047','#fbc02d','#f4511e','#5e35b1'];
    const color = colors[products.length % colors.length];
    products.push({ id, name, price, catId, color, favorite });
    Storage.saveProducts(products);
    document.getElementById('newProdName').value = '';
    document.getElementById('newProdPrice').value = '';
    document.getElementById('newProdFav').checked = false;
    renderProductAdmin();
    App.reloadMenu();
  }

  function editProduct(id) {
    const products = Storage.getProducts();
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const newName = prompt('Edit product name', p.name);
    if (newName === null) return;
    const newPrice = prompt('Edit price', p.price);
    if (newPrice === null) return;
    p.name = newName.trim() || p.name;
    p.price = parseFloat(newPrice) || p.price;
    Storage.saveProducts(products);
    renderProductAdmin();
    App.reloadMenu();
  }

  function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    const products = Storage.getProducts().filter((p) => p.id !== id);
    Storage.saveProducts(products);
    renderProductAdmin();
    App.reloadMenu();
  }

  // ---------- Integration ----------
  function saveScriptUrl() {
    const s = Storage.getSettings();
    s.scriptUrl = document.getElementById('setScriptUrl').value.trim();
    Storage.saveSettings(s);
    Toast.show('Apps Script URL saved');
  }

  async function testConnection() {
    saveScriptUrl();
    const statusEl = document.getElementById('connStatus');
    statusEl.textContent = 'Testing...';
    try {
      const n = await Api.getLastReceiptNumber();
      statusEl.textContent = `Connected ✅ (last receipt #${n})`;
      Storage.bumpCounterTo(n);
    } catch (e) {
      statusEl.textContent = 'Connection failed ❌ Check URL / deployment access.';
    }
  }

  function refreshPendingCount() {
    document.getElementById('pendingCount').textContent =
      `${Storage.getPendingSales().length} sale(s) waiting to sync.`;
  }

  async function syncNow() {
    const result = await Api.syncPendingSales();
    refreshPendingCount();
    Toast.show(`Synced ${result.synced} sale(s). ${result.remaining} remaining.`);
  }

  // Exports all cached local sales as a CSV file (works fully offline).
  function exportCsv() {
    const sales = Storage.getSalesCache();
    if (!sales.length) { Toast.show('No sales cached locally to export'); return; }
    const headers = ['Receipt No','Date','Time','Cashier','Items','Quantity','Subtotal','Discount','Grand Total','Payment Method','Cash Received','Balance','Notes','Status'];
    const rows = sales.map((s) => [
      s.receiptNo, s.date, s.time, s.cashier,
      s.items.map((i) => i.name).join('; '),
      s.items.reduce((a, i) => a + i.qty, 0),
      s.subtotal, s.discount, s.grandTotal, s.paymentMethod, s.cashReceived, s.balance, s.notes || '', s.status || 'Synced'
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sales_export_${Date.now()}.csv`;
    link.click();
  }

  return {
    open, close, submitPin, saveGeneral,
    addCategory, addProduct,
    saveScriptUrl, testConnection, syncNow, refreshPendingCount, exportCsv
  };
})();
