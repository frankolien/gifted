import { health, json } from './_core.js';
export default async function handler(req, res) {
  try { json(res, 200, await health()); } catch (e) { json(res, 500, { error: e?.shortMessage || e?.message || String(e) }); }
}
