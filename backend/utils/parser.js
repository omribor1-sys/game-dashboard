const XLSX = require('xlsx');

const GBP_TO_EUR = 1.16;

function toNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function toEur(val) {
  const s = String(val || '');
  const num = toNum(val);
  return s.includes('£') ? num * GBP_TO_EUR : num;
}

// Get the person name from a row — supports NAME, FIRST NAME, FULL NAME columns
function getRowName(normRow) {
  return String(
    normRow['NAME'] ||
    normRow['FIRST NAME'] ||
    normRow['FULL NAME'] ||
    ''
  ).trim();
}

// Check if a row is a summary/meta row (not a person)
function isSummaryRow(name, text) {
  const n = name.toUpperCase();
  return (
    n === '' ||
    n.startsWith('TOTAL') ||
    n.startsWith('ELI') ||
    n.startsWith('COST') ||
    n.includes(' V ') ||
    n.includes(' VS ') ||
    text.includes('TOTAL COST') ||
    text.includes('TOTAL PROFIT') ||
    text.includes('TOTAL COSTS') ||
    (text.includes('|COST|') && !text.includes('PRICE IN EUR'))
  );
}

function parseGameFile(filePath, tabName) {
  const workbook = XLSX.readFile(filePath);

  // Find the right sheet — prefer CUSTOMER SERVICE
  let sheetName = tabName;
  if (!sheetName || !workbook.SheetNames.includes(sheetName)) {
    sheetName =
      workbook.SheetNames.find(n => n.toLowerCase() === 'customer service') ||
      workbook.SheetNames.find(n => n.toLowerCase().includes('customer')) ||
      workbook.SheetNames[workbook.SheetNames.length - 1];
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  // ── Eli cost: extracted from dedicated ELI row ──
  let eliCost = 0;

  // ── Collect all data rows (real people, skip summary rows) ──
  const dataRows = [];

  for (const row of rows) {
    // Normalize keys to uppercase
    const normRow = {};
    for (const [k, v] of Object.entries(row)) {
      normRow[k.trim().toUpperCase()] = v;
    }

    const text = Object.values(normRow).map(v => String(v).trim().toUpperCase()).join('|');
    const name = getRowName(normRow);

    // ELI cost row
    const nameUp = name.toUpperCase();
    if (nameUp === 'ELI' || nameUp === 'ELI COST') {
      eliCost = toEur(normRow['SOLD']) || toEur(normRow['PRICE EUR']) || toEur(normRow['PRICE IN EUR']);
      continue;
    }

    // Skip summary rows
    if (isSummaryRow(name, text)) continue;

    dataRows.push(normRow);
  }

  // ── Compute totals directly from data rows ──

  // TOTAL COST = SUM of PRICE IN EUR column
  const totalTicketCost = round2(
    dataRows.reduce((sum, r) => sum + (toEur(r['PRICE IN EUR']) || toEur(r['PRICE EUR']) || 0), 0)
  );

  // TOTAL = SUM of SOLD column (total revenue)
  const totalRevenue = round2(
    dataRows.reduce((sum, r) => sum + (toEur(r['SOLD']) || 0), 0)
  );

  // TOTAL PROFIT = TOTAL - TOTAL COST
  const totalProfit = round2(totalRevenue - totalTicketCost - eliCost);

  const ticketsSold = dataRows.length;

  // Avg buy price (PRICE IN EUR or PRICE EUR)
  const buyPrices = dataRows
    .map(r => toEur(r['PRICE IN EUR']) || toEur(r['PRICE EUR']) || 0)
    .filter(v => v > 0);
  const avgBuyPrice = buyPrices.length
    ? round2(buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length)
    : 0;

  // Avg sell price (SOLD)
  const soldPrices = dataRows.map(r => toEur(r['SOLD']) || 0).filter(v => v > 0);
  const avgSellPrice = soldPrices.length
    ? round2(soldPrices.reduce((a, b) => a + b, 0) / soldPrices.length)
    : 0;

  // STATUS breakdown — sales channel distribution
  const statusBreakdown = {};
  for (const r of dataRows) {
    const status = String(r['STATUS'] || 'Unknown').trim() || 'Unknown';
    const sold = toEur(r['SOLD']) || 0;
    if (!statusBreakdown[status]) statusBreakdown[status] = { count: 0, revenue: 0 };
    statusBreakdown[status].count++;
    statusBreakdown[status].revenue = round2(statusBreakdown[status].revenue + sold);
  }

  // Notes / issues
  const issues = {};
  for (const r of dataRows) {
    const note = String(r['NOTE'] || r['NOTES'] || '').trim();
    if (note) issues[note] = (issues[note] || 0) + 1;
  }

  return {
    totalRevenue,
    totalTicketCost,
    eliCost: round2(eliCost),
    totalProfit,
    ticketsSold,
    avgBuyPrice,
    avgSellPrice,
    statusBreakdown,
    issues,
    sheetUsed: sheetName,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { parseGameFile };
