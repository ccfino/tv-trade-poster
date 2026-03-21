export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID || '',
      META_API_VERSION:     process.env.META_API_VERSION || 'v19.0',
      IG_DAILY_POST_LIMIT:  process.env.IG_DAILY_POST_LIMIT || '100',
      WATERMARK_TEXT:       process.env.WATERMARK_TEXT || '',
    });
  }
  // POST not needed — secrets managed via Vercel dashboard env vars
  res.status(405).end();
}
