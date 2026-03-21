import { setWsStatus, appendLog } from '../../../lib/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { connected, id, url, reason, ping } = req.body;
  const status = { connected: !!connected, url, id, reason, lastSeen: new Date().toISOString() };
  await setWsStatus(status);

  if (!ping) {
    await appendLog({
      level: 'info',
      message: connected ? `Worker connected (${id})` : `Worker disconnected: ${reason}`,
      time: new Date().toISOString(),
    });
  }

  res.status(200).json({ ok: true });
}
