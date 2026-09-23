import { tick, json } from './_core.js';
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  try { json(res, 200, await tick({ maxAgeSec: 60 })); } catch (e) { json(res, 500, { error: e?.shortMessage || e?.message || String(e) }); }
}
