import { fetchNews } from './_news.js';
export default async function handler(req, res) {
  try {
    const items = await fetchNews();
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.end(JSON.stringify({ items }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e?.message || e) })); }
}
