// utils/pdfGenerator.js
const PDFDocument = require('pdfkit');

const generateReceiptPDF = (res, sale, items) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [226, 600], margin: 10 }); // 80mm receipt width
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${sale.receipt_number}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(14).font('Helvetica-Bold').text('CROWN STORES', { align: 'center' });
    doc.fontSize(8).font('Helvetica').text(process.env.COMPANY_ADDRESS || '123 Main Street, Kampala', { align: 'center' });
    doc.text(process.env.COMPANY_PHONE || '+256 700 000000', { align: 'center' });
    doc.moveDown(0.5);
    doc.text('─'.repeat(36), { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).text(`Branch: ${sale.branch_name}`);
    doc.text(`Receipt: ${sale.receipt_number}`);
    doc.text(`Date: ${new Date(sale.sale_date).toLocaleString()}`);
    doc.text(`Served by: ${sale.agent_name}`);
    doc.moveDown(0.3);
    doc.text('─'.repeat(36));
    doc.moveDown(0.3);

    // Items
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Item', 10, doc.y, { width: 100 });
    doc.text('Qty', 110, doc.y - doc.currentLineHeight(), { width: 30 });
    doc.text('Price', 140, doc.y - doc.currentLineHeight(), { width: 40 });
    doc.text('Total', 180, doc.y - doc.currentLineHeight(), { width: 40 });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(8);

    for (const item of items) {
      const y = doc.y;
      doc.text(item.product_name.substring(0, 18), 10, y, { width: 100 });
      doc.text(String(item.quantity), 110, y, { width: 30 });
      doc.text(Number(item.unit_price).toLocaleString(), 140, y, { width: 40 });
      doc.text(Number(item.subtotal).toLocaleString(), 180, y, { width: 40 });
      doc.moveDown(0.5);
    }

    doc.moveDown(0.3);
    doc.text('─'.repeat(36));
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`TOTAL: UGX ${Number(sale.total_amount).toLocaleString()}`, { align: 'right' });
    doc.font('Helvetica').fontSize(9);
    doc.text(`Paid: UGX ${Number(sale.amount_paid).toLocaleString()}`, { align: 'right' });
    doc.text(`Change: UGX ${Number(sale.change_given).toLocaleString()}`, { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(8).text('─'.repeat(36));
    doc.text(process.env.RECEIPT_FOOTER || 'Thank you for shopping with Crown Stores!', { align: 'center' });
    doc.moveDown(0.3);
    doc.text('***OFFICIAL RECEIPT***', { align: 'center' });

     doc.on('end', resolve);
     doc.on('error', reject);

    doc.end();
  }); 
};

module.exports = { generateReceiptPDF };
