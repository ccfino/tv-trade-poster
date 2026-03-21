import { processRec } from '../../../lib/pipeline';
import { upsertPost, appendLog } from '../../../lib/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, rec } = req.body;
  if (!rec) return res.status(400).json({ error: 'Missing rec' });

  // Acknowledge immediately (Vercel has 30s limit)
  res.status(200).json({ ok: true });

  // Queue the entry as received
  await upsertPost({ rec, status: 'queued', time: rec.timestamp || new Date().toISOString() });
  await appendLog({ level: 'info', message: `Received ${type} for ${rec.stock} (${rec.channel})`, time: new Date().toISOString() });

  // Process async (within the same serverless invocation — 30s max)
  await processRec(rec);
}

export const config = { api: { bodyParser: true } };
