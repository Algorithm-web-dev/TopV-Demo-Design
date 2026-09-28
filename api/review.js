// Shared store for copy-review suggestions (see copy-review.js).
//
// Uses Upstash Redis over its REST API, which is what Vercel's "Upstash for
// Redis" storage integration provisions. Connect it in the Vercel dashboard
// (Storage -> Create -> Upstash for Redis -> connect to this project) and the
// env vars below are set automatically. Without them this returns 501 and the
// review tool falls back to saving in the browser.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'topv:copy-review';
const MAX_FIELD = 5000;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return (await r.json()).result;
}

function clean(body) {
  const str = (v) => String(v == null ? '' : v).slice(0, MAX_FIELD);
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : Date.now());
  if (!body || typeof body.id !== 'string' || !/^[a-z0-9]{6,32}$/.test(body.id)) return null;
  return {
    id: body.id,
    page: str(body.page),
    selector: str(body.selector),
    original: str(body.original),
    suggested: str(body.suggested),
    note: str(body.note),
    author: str(body.author).slice(0, 120),
    status: body.status === 'resolved' ? 'resolved' : 'open',
    createdAt: num(body.createdAt),
    updatedAt: num(body.updatedAt),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) {
    res.status(501).json({ error: 'Review storage is not connected' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;

    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', KEY])) || [];
      const items = [];
      for (let i = 1; i < flat.length; i += 2) {
        try { items.push(JSON.parse(flat[i])); } catch (e) {}
      }
      res.status(200).json({ items });
      return;
    }

    if (req.method === 'POST') {
      const item = clean(body);
      if (!item) { res.status(400).json({ error: 'Invalid suggestion' }); return; }
      await redis(['HSET', KEY, item.id, JSON.stringify(item)]);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      if (!body || typeof body.id !== 'string') { res.status(400).json({ error: 'Missing id' }); return; }
      await redis(['HDEL', KEY, body.id]);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Storage error' });
  }
};
