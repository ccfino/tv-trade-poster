import { getHistory, refreshMetrics } from '../../lib/performanceTracker';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json(await getHistory());
  }
  if (req.method === 'POST' && req.query.action === 'refresh') {
    const history = await refreshMetrics();
    return res.status(200).json({ success: true, history });
  }
  res.status(405).end();
}
