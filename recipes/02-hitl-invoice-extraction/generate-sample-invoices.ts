// Recipe 02 — Sample invoice generator.
//
// Renders six HTML invoice templates to PDFs in seed-content/.
// Each template is shaped to exercise a specific recipe path:
//   01 = clean (auto-approves)
//   02 = high $ value (auto-approves but GL-coder flags CFO review)
//   03 = tabular line items (extractor confidence drops on rows)
//   04 = arithmetic mismatch (sum + tax ≠ total)
//   05 = smudged invoice number (extractor picks wrong reference number)
//   06 = multi-currency / odd format (escalates on caution)
//
// Run:
//   npm run generate-samples

// IMPORTANT: regenerating these PDFs will produce small (~6 bytes per file)
// timestamp diffs because Puppeteer embeds wall-clock CreationDate/ModDate.
// Don't regenerate unless you've changed an invoice template — the committed
// PDFs are the canonical fixtures. If you do change a template, the diff is
// expected and benign.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer";

const OUT_DIR = "seed-content";

interface Invoice {
  filename: string;
  html: string;
}

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         margin: 40px; color: #1a1a1a; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin-top: 24px; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 13px; }
  th { background: #f4f4f4; }
  .totals { margin-top: 16px; width: 280px; margin-left: auto; }
  .totals td { border: none; padding: 4px 8px; }
  .totals tr.total td { border-top: 2px solid #1a1a1a; font-weight: 600; }
  .vendor { margin-top: 8px; font-size: 13px; line-height: 1.5; }
  .stamp { color: #999; font-size: 10px; margin-top: 40px; }
`;

const invoices: Invoice[] = [
  // 1. Clean — auto-approves.
  {
    filename: "01-clean-invoice.pdf",
    html: `<!doctype html><html><head><style>${baseStyles}</style></head><body>
      <h1>INVOICE</h1>
      <div class="meta">Invoice #: INV-2026-0142 &nbsp;|&nbsp; Date: 2026-04-15 &nbsp;|&nbsp; Due: 2026-05-15</div>
      <div class="vendor">
        <strong>Acme Office Supplies LLC</strong><br/>
        123 Industrial Park Drive<br/>
        Springfield, IL 62701
      </div>
      <table>
        <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Letter-size printer paper, 5000 sheets</td><td>2</td><td>$45.00</td><td>$90.00</td></tr>
          <tr><td>Black ink cartridges</td><td>4</td><td>$32.50</td><td>$130.00</td></tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td style="text-align:right">$220.00</td></tr>
        <tr><td>Tax (7%)</td><td style="text-align:right">$15.40</td></tr>
        <tr class="total"><td>Total</td><td style="text-align:right">$235.40</td></tr>
      </table>
    </body></html>`,
  },

  // 2. High value — auto-approves but GL-coder flags CFO review.
  {
    filename: "02-high-value-invoice.pdf",
    html: `<!doctype html><html><head><style>${baseStyles}</style></head><body>
      <h1>INVOICE</h1>
      <div class="meta">Invoice #: INV-2026-0287 &nbsp;|&nbsp; Date: 2026-04-22 &nbsp;|&nbsp; Due: 2026-05-22</div>
      <div class="vendor">
        <strong>Brightline Cloud Infrastructure Inc.</strong><br/>
        500 Market Street, Suite 2200<br/>
        San Francisco, CA 94105
      </div>
      <table>
        <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Annual enterprise hosting plan</td><td>1</td><td>$8,400.00</td><td>$8,400.00</td></tr>
          <tr><td>Premium support (year)</td><td>1</td><td>$3,600.00</td><td>$3,600.00</td></tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td style="text-align:right">$12,000.00</td></tr>
        <tr><td>Tax (8.5%)</td><td style="text-align:right">$1,020.00</td></tr>
        <tr class="total"><td>Total</td><td style="text-align:right">$13,020.00</td></tr>
      </table>
    </body></html>`,
  },

  // 3. Tabular invoice — many similar rows, extractor confidence drops.
  {
    filename: "03-tabular-invoice.pdf",
    html: `<!doctype html><html><head><style>${baseStyles}</style></head><body>
      <h1>INVOICE</h1>
      <div class="meta">Invoice #: INV-2026-0301 &nbsp;|&nbsp; Date: 2026-04-25 &nbsp;|&nbsp; Due: 2026-05-25</div>
      <div class="vendor">
        <strong>Capitol Hardware Distributors</strong><br/>
        2800 Wilson Boulevard<br/>
        Arlington, VA 22201
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>HW-1042</td><td>1/4" hex bolts, box of 100</td><td>5</td><td>$8.20</td><td>$41.00</td></tr>
          <tr><td>HW-1051</td><td>1/4" hex nuts, box of 100</td><td>5</td><td>$3.50</td><td>$17.50</td></tr>
          <tr><td>HW-1063</td><td>3/8" hex bolts, box of 100</td><td>3</td><td>$11.40</td><td>$34.20</td></tr>
          <tr><td>HW-1074</td><td>3/8" hex nuts, box of 100</td><td>3</td><td>$5.10</td><td>$15.30</td></tr>
          <tr><td>HW-2010</td><td>Lock washers, assorted, 500ct</td><td>2</td><td>$24.80</td><td>$49.60</td></tr>
          <tr><td>HW-2020</td><td>Flat washers, assorted, 500ct</td><td>2</td><td>$19.95</td><td>$39.90</td></tr>
          <tr><td>HW-3010</td><td>Wood screws, #8 x 1-1/4", 100ct</td><td>4</td><td>$7.25</td><td>$29.00</td></tr>
          <tr><td>HW-3020</td><td>Wood screws, #10 x 2", 100ct</td><td>4</td><td>$8.75</td><td>$35.00</td></tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td style="text-align:right">$261.50</td></tr>
        <tr><td>Tax (6%)</td><td style="text-align:right">$15.69</td></tr>
        <tr class="total"><td>Total</td><td style="text-align:right">$277.19</td></tr>
      </table>
    </body></html>`,
  },

  // 4. Arithmetic mismatch — totals don't sum.
  {
    filename: "04-arithmetic-mismatch.pdf",
    html: `<!doctype html><html><head><style>${baseStyles}</style></head><body>
      <h1>INVOICE</h1>
      <div class="meta">Invoice #: INV-2026-0344 &nbsp;|&nbsp; Date: 2026-04-28 &nbsp;|&nbsp; Due: 2026-05-28</div>
      <div class="vendor">
        <strong>Lakeside Stationers</strong><br/>
        47 Lake Avenue<br/>
        Madison, WI 53703
      </div>
      <table>
        <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Spiral notebooks, 100ct</td><td>3</td><td>$28.00</td><td>$84.00</td></tr>
          <tr><td>Ballpoint pens, 144ct</td><td>2</td><td>$15.50</td><td>$31.00</td></tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td style="text-align:right">$115.00</td></tr>
        <tr><td>Tax (5%)</td><td style="text-align:right">$5.75</td></tr>
        <tr class="total"><td>Total</td><td style="text-align:right">$135.40</td></tr>
      </table>
    </body></html>`,
  },

  // 5. Smudged — has a vendor reference number on page 1, real invoice number on page 2.
  // We simulate "two pages" with a CSS page-break.
  {
    filename: "05-smudged-invoice.pdf",
    html: `<!doctype html><html><head><style>${baseStyles}
      .pagebreak { page-break-after: always; }
      .smudge { color: #aaa; font-style: italic; }
    </style></head><body>
      <h1>INVOICE — Page 1</h1>
      <div class="meta smudge">Customer Reference: REF-99281-X &nbsp;|&nbsp; Date: 2026-04-30</div>
      <div class="vendor">
        <strong>Coastal Office Furnishings</strong><br/>
        1100 Harbor Drive<br/>
        Norfolk, VA 23510
      </div>
      <p class="smudge">This invoice ships from our Norfolk warehouse. Pages following describe the items billed and totals due. Refer to the canonical invoice number printed on page 2 for accounting reconciliation.</p>
      <div class="pagebreak"></div>
      <h1>INVOICE — Page 2</h1>
      <div class="meta">Invoice #: INV-2026-0411 &nbsp;|&nbsp; Date: 2026-04-30 &nbsp;|&nbsp; Due: 2026-05-30</div>
      <table>
        <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Ergonomic office chair, mesh back</td><td>4</td><td>$295.00</td><td>$1,180.00</td></tr>
          <tr><td>Adjustable monitor arm, dual</td><td>4</td><td>$148.00</td><td>$592.00</td></tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td style="text-align:right">$1,772.00</td></tr>
        <tr><td>Tax (5.3%)</td><td style="text-align:right">$93.92</td></tr>
        <tr class="total"><td>Total</td><td style="text-align:right">$1,865.92</td></tr>
      </table>
    </body></html>`,
  },

  // 6. Multi-currency — extractor caution on the currency.
  {
    filename: "06-multi-currency.pdf",
    html: `<!doctype html><html><head><style>${baseStyles}</style></head><body>
      <h1>INVOICE</h1>
      <div class="meta">Invoice №: INV-EU-2026-0058 &nbsp;|&nbsp; Date: 2026-04-29 &nbsp;|&nbsp; Échéance: 2026-05-29</div>
      <div class="vendor">
        <strong>Atelier Lumière S.A.S</strong><br/>
        14 rue du Faubourg Saint-Honoré<br/>
        75008 Paris, France
      </div>
      <table>
        <thead><tr><th>Description</th><th>Quantité</th><th>Prix unitaire</th><th>Montant</th></tr></thead>
        <tbody>
          <tr><td>LED panel ceiling lights, 60×60cm</td><td>10</td><td>€72.00</td><td>€720.00</td></tr>
          <tr><td>Smart dimmer switches, in-wall</td><td>6</td><td>€48.00</td><td>€288.00</td></tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Sous-total</td><td style="text-align:right">€1,008.00</td></tr>
        <tr><td>TVA (20%)</td><td style="text-align:right">€201.60</td></tr>
        <tr class="total"><td>Total TTC</td><td style="text-align:right">€1,209.60</td></tr>
      </table>
    </body></html>`,
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log("Launching headless Chromium...");
  const browser = await puppeteer.launch();
  try {
    for (const inv of invoices) {
      const page = await browser.newPage();
      await page.setContent(inv.html, { waitUntil: "load" });
      const pdf = await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
      });
      const path = join(OUT_DIR, inv.filename);
      await writeFile(path, pdf);
      console.log(`  ✓ ${path}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n✓ Wrote ${invoices.length} invoice PDFs to ${OUT_DIR}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
