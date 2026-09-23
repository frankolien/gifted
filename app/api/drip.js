import { drip, json } from './_core.js';
export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  try {
    let body = req.body;
    if (!body || typeof body === 'string') { let raw = typeof body === 'string' ? body : ''; if (!raw) for await (const c of req) raw += c; body = JSON.parse(raw || '{}'); }
    const [code, out] = await drip(body.address); json(res, code, out);
  } catch (e) { json(res, 500, { error: e?.shortMessage || e?.message || String(e) }); }
}
