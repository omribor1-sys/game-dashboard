// Bank of Israel representative rates (שער יציג). Stored amounts are EUR everywhere.
// Cached 1h; a stale cache is served if BOI is down; no cache at all = throws.
let cache = null;

async function getRates() {
  if (cache && Date.now() - cache.at < 3600e3) return cache.body;
  try {
    const r = await fetch('https://boi.org.il/PublicApi/GetExchangeRates', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`BOI HTTP ${r.status}`);
    const rows = (await r.json()).exchangeRates || [];
    const ils = k => { const x = rows.find(e => e.key === k); return x && x.currentExchangeRate > 0 ? { v: x.currentExchangeRate / (x.unit || 1), at: x.lastUpdate } : null; };
    const eur = ils('EUR'), gbp = ils('GBP');
    if (!eur || !gbp) throw new Error('BOI response missing EUR/GBP');
    const body = { source: 'Bank of Israel', date: eur.at, ilsPer: { EUR: eur.v, GBP: gbp.v }, perEur: { GBP: eur.v / gbp.v, ILS: eur.v } };
    cache = { at: Date.now(), body };
    return body;
  } catch (e) {
    if (cache) return { ...cache.body, stale: true };
    throw e;
  }
}

// EUR for one GBP, e.g. 1.15
async function eurPerGbp() {
  const r = await getRates();
  return r.ilsPer.GBP / r.ilsPer.EUR;
}

module.exports = { getRates, eurPerGbp };
