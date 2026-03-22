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

// Returns a string of all cell values in a row (uppercase), for keyword detection
function rowText(normRow) {
  return Object.values(normRow).map(v => String(v).trim().toUpperCase()).join('|');
}

// Find first meaningful numeric value in a row (skip name/text columns)
function findNumeric(normRow, skipKeys = []) {
  const skip = new Set(['NAME', 'FIRST NAME', 'LAST NAME', 'EMAIL', 'MAIL', 'PASSWORD',
    'STATUS', 'NOTE', 'SEAT', 'CATEGORY', 'APPLE', 'GOOGLE', ...skipKeys]);
  for (const [k, v] of Object.entries(normRow)) {
    if (skip.has(k)) continue;
    const n = toNum(v);
    if (n > 0) return n;
  }
  return 0;
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

function parseGameFile(filePath, tabName) {
  const workbook = XLSX.readFile(filePath);

  // Find the right sheet — prefer CUSTOMER SERVICE
  let sheetName = tabName;
  if (!sheetName || !workbook.SheetNames.includes(sheetName)) {
    const lower = (tabName || '').toLowerCase();
    sheetName =
      workbook.SheetNames.find(n => n.toLowerCase() === 'customer service') ||
      workbook.SheetNames.find(n => n.toLowerCase().includes('customer')) ||
      workbook.SheetNames.find(n => n.toLowerCase().includes(lower)) ||
      workbook.SheetNames[workbook.SheetNames.length - 1];
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const dataRows = [];
  let totalRevenue = 0;
  let totalTicketCost = 0;
  let eliCost = 0;
  let totalProfit = 0;

  for (const row of rows) {
    // Normalize all keys to uppercase
    const normRow = {};
    for (const [k, v] of Object.entries(row)) {
      normRow[k.trim().toUpperCase()] = v;
    }

    const text = rowText(normRow);
    const name = getRowName(normRow);

    // ── Detect summary rows by scanning ALL cell values ──

    // "TOTAL COST" / "TOTAL COSTS" row — explicit label
    if (text.includes('TOTAL COST') || text.includes('TOTAL COSTS')) {
      totalTicketCost = toEur(normRow['PRICE EUR']) || toEur(normRow['PRICE IN EUR']) || findNumeric(normRow);
      if (normRow['SOLD'] && toNum(normRow['SOLD']) > 0) {
        totalRevenue = toEur(normRow['SOLD']);
      }
      continue;
    }

    // "COST" standalone cell (format: one cell = "COST", next cell = amount)
    // e.g. price column = "COST", PRICE EUR column = 3149.4
    if (text.includes('|COST|') || text.startsWith('COST|')) {
      totalTicketCost = toEur(normRow['PRICE EUR']) || toEur(normRow['PRICE IN EUR']) || findNumeric(normRow);
      // If the same row also has revenue or profit
      if (text.includes('TOTAL PROFIT')) {
        totalProfit = toEur(normRow['SOLD']) || findNumeric(normRow, ['PRICE EUR', 'PRICE IN EUR']);
      } else if (normRow['SOLD'] && toNum(normRow['SOLD']) > 0) {
        totalRevenue = toEur(normRow['SOLD']);
      }
      continue;
    }

    // "TOTAL PROFIT" row
    if (text.includes('TOTAL PROFIT')) {
      totalProfit = toEur(normRow['SOLD']) || toEur(normRow['PRICE EUR']) || findNumeric(normRow);
      continue;
    }

    // "TOTAL" standalone row — revenue
    if (text.includes('|TOTAL|') || text.startsWith('TOTAL|') || text.includes('|TOTAL ')) {
      if (totalRevenue === 0) {
        totalRevenue = toEur(normRow['SOLD']) || toEur(normRow['PRICE EUR']) || findNumeric(normRow);
      }
      continue;
    }

    // "ELI COST" or "ELI" row
    const nameUp = name.toUpperCase();
    if (nameUp === 'ELI COST' || nameUp === 'ELI') {
      eliCost = toEur(normRow['SOLD']) || toEur(normRow['PRICE EUR']) || findNumeric(normRow);
      continue;
    }

    // ── Regular data row: must have a name ──
    if (!name) continue;

    // Skip rows that look like game names or meta rows
    if (
      nameUp.includes(' V ') ||
      nameUp.includes(' VS ') ||
      nameUp.startsWith('TOTAL') ||
      nameUp.startsWith('ELI') ||
      nameUp.startsWith('COST')
    ) continue;

    dataRows.push({ _norm: normRow, _raw: row });
  }

  // Fallback: if totalRevenue still 0, sum SOLD values from individual data rows
  if (totalRevenue === 0 && dataRows.length > 0) {
    totalRevenue = dataRows.reduce((sum, r) => {
      return sum + (toEur(r._norm['SOLD']) || 0);
    }, 0);
  }

  // Fallback: if totalTicketCost still 0, sum PRICE EUR from individual data rows
  if (totalTicketCost === 0 && dataRows.length > 0) {
    totalTicketCost = dataRows.reduce((sum, r) => {
      return sum + (toEur(r._norm['PRICE EUR']) || toEur(r._norm['PRICE IN EUR']) || 0);
    }, 0);
  }

  const ticketsSold = dataRows.length;

  // Avg buy price
  const buyPrices = dataRows.map(r => toEur(r._norm['PRICE EUR'] || r._norm['PRICE'] || 0)).filter(v => v > 0);
  const avgBuyPrice = buyPrices.length
    ? buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length
    : 0;

  // Avg sell price
  const sellPrices = dataRows.map(r => toEur(r._norm['SOLD'] || 0)).filter(v => v > 0);
  const avgSellPrice = sellPrices.length
    ? sellPrices.reduce((a, b) => a + b, 0) / sellPrices.length
    : 0;

  // Status breakdown (sales channels)
  const statusBreakdown = {};
  for (const r of dataRows) {
    const status = String(r._norm['STATUS'] || 'Unknown').trim() || 'Unknown';
    const rev = toEur(r._norm['SOLD'] || 0);
    if (!statusBreakdown[status]) statusBreakdown[status] = { count: 0, revenue: 0 };
    statusBreakdown[status].count++;
    statusBreakdown[status].revenue = round2(statusBreakdown[status].revenue + rev);
  }

  // Notes / issues
  const issues = {};
  for (const r of dataRows) {
    const note = String(r._norm['NOTE'] || r._norm['NOTES'] || '').trim();
    if (note) issues[note] = (issues[note] || 0) + 1;
  }

  return {
    totalRevenue:    round2(totalRevenue),
    totalTicketCost: round2(totalTicketCost),
    eliCost:         round2(eliCost),
    totalProfit:     round2(totalProfit),
    ticketsSold,
    avgBuyPrice:     round2(avgBuyPrice),
    avgSellPrice:    round2(avgSellPrice),
    statusBreakdown,
    issues,
    sheetUsed: sheetName,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { parseGameFile };
