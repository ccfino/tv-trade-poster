export default async function handler(req, res) {
  const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/$/, '');
  if (!WORKER_URL) return res.status(500).json({ error: 'WORKER_URL not set' });

  const target = `${WORKER_URL}${req.url}`;

  const options = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (req.method !== 'GET' && req.body) {
    options.body = JSON.stringify(req.body);
  }

  try {
    const r = await fetch(target, options);
    const data = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `Worker unreachable: ${err.message}` });
  }
}
