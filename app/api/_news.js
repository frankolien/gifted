/** Latest headlines for the listed Stock Tokens, from Yahoo Finance's public search API (server-side, no key). */
const COMPANIES = { TSLA: 'Tesla', AMZN: 'Amazon', PLTR: 'Palantir', NFLX: 'Netflix', AMD: 'AMD' };

export async function fetchNews(symbols = Object.keys(COMPANIES), limit = 12) {
  const results = await Promise.all(symbols.map(async (sym) => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=8&quotesCount=0`, { headers: { 'user-agent': 'Mozilla/5.0 GiFTED' } });
      if (!r.ok) return [];
      return ((await r.json()).news || []).map((n) => ({ ...n, _sym: sym }));
    } catch { return []; }
  }));
  const seen = new Set(); const out = [];
  for (const n of results.flat().sort((a, b) => b.providerPublishTime - a.providerPublishTime)) {
    if (seen.has(n.uuid)) continue;
    // Keep only stories that actually name one of our companies in the headline.
    const tickers = symbols.filter((s) => new RegExp(`\\b(${s}|${COMPANIES[s] ?? s})\\b`, 'i').test(n.title));
    if (!tickers.length) continue;
    seen.add(n.uuid);
    const res = n.thumbnail?.resolutions ?? [];
    const thumb = (res.find((x) => x.tag === '140x140') || res.at(-1) || res[0])?.url ?? null;
    out.push({ id: n.uuid, title: n.title, publisher: n.publisher, link: n.link, time: n.providerPublishTime, thumb, tickers });
    if (out.length >= limit) break;
  }
  return out;
}
