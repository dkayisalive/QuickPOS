/**
 * Google Apps Script Backend for QuickPOS
 * Deploy as Web App: Execute as "Me", Access: "Anyone" (or "Anyone with Google account").
 * Copy the deployment URL into Admin Settings > Integration > Google Apps Script URL.
 *
 * Sheet Structure Expected (auto-created if missing):
 *  - Sales:      Receipt No | Date | Time | Cashier | Items | Quantity | Subtotal | Discount | Grand Total | Payment Method | Cash Received | Balance | Notes | Status
 *  - Products:   ID | Name | Price | Category ID | Color | Favorite
 *  - Categories: ID | Name
 *  - Settings:   Key | Value
 *  - Daily Summary: Date | Orders | Sales | Cash Sales | Card Sales | QR Sales | Average Order Value
 */

const SHEET_SALES = 'Sales';
const SHEET_PRODUCTS = 'Products';
const SHEET_CATEGORIES = 'Categories';
const SHEET_SETTINGS = 'Settings';
const SHEET_SUMMARY = 'Daily Summary';

const SALES_HEADERS = ['Receipt No','Date','Time','Cashier','Items','Quantity','Subtotal','Discount','Grand Total','Payment Method','Cash Received','Balance','Notes','Status'];

/** Entry point for GET requests (read operations). */
function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    switch (action) {
      case 'getLastReceiptNumber':
        result = { lastNumber: getLastReceiptNumber() };
        break;
      case 'getMenu':
        result = getMenu();
        break;
      case 'getDailySummary':
        result = getDailySummary(e.parameter.date);
        break;
      case 'searchSales':
        result = searchSales(e.parameter.q);
        break;
      default:
        result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message };
  }
  return jsonResponse(result);
}

/** Entry point for POST requests (write operations). Body is JSON: {action, payload}. */
function doPost(e) {
  let result;
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload;
    switch (action) {
      case 'addSale':
        result = addSale(payload);
        break;
      case 'saveMenu':
        result = saveMenu(payload);
        break;
      default:
        result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message };
  }
  return jsonResponse(result);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers) sheet.appendRow(headers);
  }
  return sheet;
}

/**
 * Appends one new row per sale to the Sales sheet. Never overwrites existing data.
 * Uses LockService to prevent race conditions from concurrent requests (double taps,
 * multiple devices) which could otherwise create duplicate receipt numbers.
 */
function addSale(sale) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = getSheet(SHEET_SALES, SALES_HEADERS);
    // Duplicate prevention: skip if this exact receipt number already exists.
    const existing = sheet.getDataRange().getValues();
    const alreadyExists = existing.some((row) => row[0] === sale.receiptNo);
    if (alreadyExists) {
      return { status: 'duplicate_skipped', receiptNo: sale.receiptNo };
    }
    const itemsStr = sale.items.map((i) => `${i.name} x${i.qty}`).join(', ');
    const totalQty = sale.items.reduce((sum, i) => sum + i.qty, 0);
    sheet.appendRow([
      sale.receiptNo, sale.date, sale.time, sale.cashier,
      itemsStr, totalQty, sale.subtotal, sale.discount, sale.grandTotal,
      sale.paymentMethod, sale.cashReceived, sale.balance, sale.notes || '', 'Synced'
    ]);
    updateDailySummary(sale);
    return { status: 'ok', receiptNo: sale.receiptNo };
  } finally {
    lock.releaseLock();
  }
}

/** Reads the highest receipt number recorded in the Sales sheet so far. */
function getLastReceiptNumber() {
  const sheet = getSheet(SHEET_SALES, SALES_HEADERS);
  const data = sheet.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const match = String(data[i][0]).match(/POS-(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max;
}

/** Returns categories/products/settings so multiple devices can stay in sync. */
function getMenu() {
  const catSheet = getSheet(SHEET_CATEGORIES, ['ID','Name']);
  const prodSheet = getSheet(SHEET_PRODUCTS, ['ID','Name','Price','Category ID','Color','Favorite']);
  const setSheet = getSheet(SHEET_SETTINGS, ['Key','Value']);

  const cats = catSheet.getDataRange().getValues().slice(1).map((r) => ({ id: r[0], name: r[1] }));
  const prods = prodSheet.getDataRange().getValues().slice(1).map((r) => ({
    id: r[0], name: r[1], price: r[2], catId: r[3], color: r[4], favorite: r[5] === true || r[5] === 'TRUE'
  }));
  const settingsRows = setSheet.getDataRange().getValues().slice(1);
  const settings = {};
  settingsRows.forEach((r) => { settings[r[0]] = r[1]; });

  return { categories: cats, products: prods, settings };
}

/** Overwrites Categories/Products/Settings sheets with the latest admin edits. */
function saveMenu(payload) {
  const catSheet = getSheet(SHEET_CATEGORIES, ['ID','Name']);
  const prodSheet = getSheet(SHEET_PRODUCTS, ['ID','Name','Price','Category ID','Color','Favorite']);
  const setSheet = getSheet(SHEET_SETTINGS, ['Key','Value']);

  catSheet.clearContents();
  catSheet.appendRow(['ID','Name']);
  payload.categories.forEach((c) => catSheet.appendRow([c.id, c.name]));

  prodSheet.clearContents();
  prodSheet.appendRow(['ID','Name','Price','Category ID','Color','Favorite']);
  payload.products.forEach((p) => prodSheet.appendRow([p.id, p.name, p.price, p.catId, p.color, p.favorite]));

  setSheet.clearContents();
  setSheet.appendRow(['Key','Value']);
  Object.keys(payload.settings || {}).forEach((k) => setSheet.appendRow([k, payload.settings[k]]));

  return { status: 'ok' };
}

/** Aggregates a single sale into the Daily Summary sheet (one row per calendar date). */
function updateDailySummary(sale) {
  const sheet = getSheet(SHEET_SUMMARY, ['Date','Orders','Sales','Cash Sales','Card Sales','QR Sales','Average Order Value']);
  const data = sheet.getDataRange().getValues();
  const todayStr = sale.date;
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === todayStr) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) {
    sheet.appendRow([todayStr, 1, sale.grandTotal,
      sale.paymentMethod === 'Cash' ? sale.grandTotal : 0,
      sale.paymentMethod === 'Card' ? sale.grandTotal : 0,
      sale.paymentMethod === 'QR' ? sale.grandTotal : 0,
      sale.grandTotal]);
  } else {
    const row = data[rowIndex - 1];
    const orders = row[1] + 1;
    const totalSales = row[2] + sale.grandTotal;
    const cash = row[3] + (sale.paymentMethod === 'Cash' ? sale.grandTotal : 0);
    const card = row[4] + (sale.paymentMethod === 'Card' ? sale.grandTotal : 0);
    const qr = row[5] + (sale.paymentMethod === 'QR' ? sale.grandTotal : 0);
    const avg = totalSales / orders;
    sheet.getRange(rowIndex, 1, 1, 7).setValues([[todayStr, orders, totalSales, cash, card, qr, avg]]);
  }
}

function getDailySummary(dateStr) {
  const sheet = getSheet(SHEET_SUMMARY, ['Date','Orders','Sales','Cash Sales','Card Sales','QR Sales','Average Order Value']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === dateStr) {
      const r = data[i];
      return { date: r[0], orders: r[1], sales: r[2], cashSales: r[3], cardSales: r[4], qrSales: r[5], avgOrderValue: r[6] };
    }
  }
  return { date: dateStr, orders: 0, sales: 0, cashSales: 0, cardSales: 0, qrSales: 0, avgOrderValue: 0 };
}

/** Simple search across the Sales sheet by receipt number substring. */
function searchSales(query) {
  const sheet = getSheet(SHEET_SALES, SALES_HEADERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const q = (query || '').toLowerCase();
  const rows = data.slice(1).filter((row) => String(row[0]).toLowerCase().includes(q));
  const results = rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return { results };
}
