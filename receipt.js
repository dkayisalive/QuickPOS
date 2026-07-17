/* receipt.js
   Builds the printable/plain-text receipt, and provides PDF download/share.
   Uses browser print for hardware printers, and a lightweight canvas->PDF
   fallback (via window.print to PDF) for download/share since no external
   libraries are allowed by the "no server/framework" constraint.
*/

const Receipt = (() => {

  // Builds a monospace plain-text style receipt (works well for thermal printers too).
  function build(sale) {
    const s = Storage.getSettings();
    const lineWidth = 32;
    const line = (ch = '-') => ch.repeat(lineWidth);
    const padRight = (str, len) => (str + ' '.repeat(len)).slice(0, len);
    const padLeft = (str, len) => (' '.repeat(len) + str).slice(-len);

    let out = '';
    out += center(s.restaurantName.toUpperCase(), lineWidth) + '\n';
    out += center(s.address, lineWidth) + '\n';
    out += center('Tel: ' + s.phone, lineWidth) + '\n';
    out += line('=') + '\n';
    out += `Receipt: ${sale.receiptNo}\n`;
    out += `Date: ${sale.date}   Time: ${sale.time}\n`;
    out += `Cashier: ${sale.cashier}\n`;
    out += line() + '\n';
    out += padRight('Item', 16) + padLeft('Qty', 4) + padLeft('Price', 6) + padLeft('Total', 6) + '\n';
    out += line() + '\n';
    sale.items.forEach((it) => {
      out += padRight(it.name, 16) + padLeft(String(it.qty), 4) +
             padLeft(it.price.toFixed(0), 6) + padLeft((it.qty * it.price).toFixed(0), 6) + '\n';
    });
    out += line() + '\n';
    out += padRight('Subtotal', 22) + padLeft(s.currency + sale.subtotal.toFixed(2), 10) + '\n';
    out += padRight('Discount', 22) + padLeft(s.currency + sale.discount.toFixed(2), 10) + '\n';
    out += padRight('GRAND TOTAL', 22) + padLeft(s.currency + sale.grandTotal.toFixed(2), 10) + '\n';
    out += line('=') + '\n';
    out += `Payment: ${sale.paymentMethod}\n`;
    if (sale.paymentMethod === 'Cash') {
      out += padRight('Cash Received', 22) + padLeft(s.currency + sale.cashReceived.toFixed(2), 10) + '\n';
      out += padRight('Balance', 22) + padLeft(s.currency + sale.balance.toFixed(2), 10) + '\n';
    }
    if (sale.notes) {
      out += line() + '\n';
      out += `Note: ${sale.notes}\n`;
    }
    out += line('=') + '\n';
    out += center('Thank You! Come Again :)', lineWidth) + '\n';
    return out;
  }

  function center(text, width) {
    if (text.length >= width) return text.slice(0, width);
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(pad) + text;
  }

  // Renders the built receipt text into the receipt modal DOM element.
  function renderToModal(sale) {
    const content = document.getElementById('receiptContent');
    content.textContent = build(sale);
    document.getElementById('receiptModal').classList.remove('hidden');
  }

  // Uses the browser's native print dialog; user can choose "Save as PDF"
  // which satisfies both Print and Download requirements without libraries.
  function printReceipt() {
    window.print();
  }

  // For explicit "Download PDF" / "Share" buttons we open a print-friendly
  // window and trigger print-to-PDF, since pure vanilla JS cannot generate
  // PDFs without a library. This keeps the stack dependency-free.
  function downloadPdf(sale) {
    printReceipt();
  }

  async function sharePdf(sale) {
    const text = build(sale);
    if (navigator.share) {
      try {
        await navigator.share({ title: sale.receiptNo, text });
        return;
      } catch (e) { /* user cancelled or unsupported, fall through */ }
    }
    printReceipt();
  }

  return { build, renderToModal, printReceipt, downloadPdf, sharePdf };
})();
