import { getPreferences, setPreferences } from '../../lib/kv';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json(await getPreferences());
  }
  if (req.method === 'POST') {
    const current = await getPreferences();
    const updated = deepMerge(current, req.body);
    await setPreferences(updated);
    return res.status(200).json({ success: true, preferences: updated });
  }
  res.status(405).end();
}

function deepMerge(base, updates) {
  const result = { ...base };
  for (const [k, v] of Object.entries(updates)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = deepMerge(base[k] || {}, v);
    } else {
      result[k] = v;
    }
  }
  return result;
}
