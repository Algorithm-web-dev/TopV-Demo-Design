// Shared store for copy-review suggestions (see copy-review.js).
//
// Uses Upstash Redis over its REST API, which is what Vercel's "Upstash for
// Redis" storage integration provisions. Connect it in the Vercel dashboard
// (Storage -> Create -> Upstash for Redis -> connect to this project) and the
// env vars below are set automatically. Without them this returns 501 and the
// review tool falls back to saving in the browser.
//
//   GET    /api/review              list suggestions
//   POST   /api/review              create/update a suggestion
//   DELETE /api/review              delete a suggestion (and its uploaded image)
//   POST   /api/review?upload=1     upload a replacement image, returns { id }
//   GET    /api/review?image=<id>   serve an uploaded image
//   GET    /api/review?log=1        change history, newest first
//
// Every create, edit, resolve/reopen and delete is appended to a permanent
// change log (who, when, page, before -> after). Uploaded images are never
// deleted, so every image the log refers to stays viewable.

const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'topv:copy-review';
const IMG_KEY = 'topv:copy-review:img:';
const LOG_KEY = 'topv:copy-review:log';
const LOG_MAX = 5000;
const MAX_FIELD = 5000;
const MAX_IMAGE_BYTES = 3.2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ID_RE = /^[a-z0-9]{6,32}$/;

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
  if (!body || typeof body.id !== 'string' || !ID_RE.test(body.id)) return null;
  const kind = ['image', 'background'].includes(body.kind) ? body.kind : 'text';
  const imageId = typeof body.imageId === 'string' && ID_RE.test(body.imageId) ? body.imageId : '';
  return {
    id: body.id,
    kind,
    page: str(body.page),
    selector: str(body.selector),
    original: str(body.original),
    suggested: str(body.suggested),
    note: str(body.note),
    author: str(body.author).slice(0, 120),
    imageId,
    imageName: imageId ? str(body.imageName).slice(0, 200) : '',
    status: body.status === 'resolved' ? 'resolved' : 'open',
    createdAt: num(body.createdAt),
    updatedAt: num(body.updatedAt),
  };
}

// Images are stored as a small metadata record plus base64 chunks, so each
// Redis request stays well under Upstash's per-request size limit.
const CHUNK = 512 * 1024;

async function serveImage(id, res) {
  if (!ID_RE.test(id)) { res.status(400).json({ error: 'Invalid image' }); return; }
  const raw = await redis(['GET', IMG_KEY + id]);
  if (!raw) { res.status(404).json({ error: 'Image not found' }); return; }
  const meta = JSON.parse(raw);
  const parts = [];
  for (let i = 0; i < meta.chunks; i++) parts.push(await redis(['GET', `${IMG_KEY}${id}:${i}`]) || '');
  const type = IMAGE_TYPES.includes(meta.type) ? meta.type : 'application/octet-stream';
  const name = String(meta.name || 'image').replace(/[^\w.\- ]/g, '_');
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).end(Buffer.from(parts.join(''), 'base64'));
}

async function uploadImage(body, res) {
  const type = body && body.type;
  const data = body && typeof body.data === 'string' ? body.data : '';
  if (!IMAGE_TYPES.includes(type) || !/^[A-Za-z0-9+/]+=*$/.test(data)) {
    res.status(400).json({ error: 'Please upload a JPG, PNG, WebP or GIF image' });
    return;
  }
  if (data.length * 0.75 > MAX_IMAGE_BYTES) { res.status(413).json({ error: 'Image too large' }); return; }
  const id = crypto.randomBytes(12).toString('hex').slice(0, 20);
  const name = String(body.name || 'image').slice(0, 200);
  const chunks = Math.ceil(data.length / CHUNK);
  for (let i = 0; i < chunks; i++) {
    await redis(['SET', `${IMG_KEY}${id}:${i}`, data.slice(i * CHUNK, (i + 1) * CHUNK)]);
  }
  // Written last, so a half-finished upload is never served.
  await redis(['SET', IMG_KEY + id, JSON.stringify({ type, name, chunks, bytes: Math.round(data.length * 0.75) })]);
  res.status(200).json({ id });
}

function snapshot(i) {
  if (!i) return null;
  return {
    suggested: i.suggested || '',
    note: i.note || '',
    imageId: i.imageId || '',
    imageName: i.imageName || '',
    status: i.status || 'open',
  };
}

function actionFor(prev, item) {
  if (!prev) return 'created';
  const a = snapshot(prev), b = snapshot(item);
  const contentChanged = a.suggested !== b.suggested || a.note !== b.note || a.imageId !== b.imageId;
  if (contentChanged) return 'edited';
  if (a.status !== b.status) return b.status === 'resolved' ? 'resolved' : 'reopened';
  return null;
}

async function log(action, item, prev, by) {
  const ref = item || prev;
  const entry = {
    at: Date.now(),
    action,
    id: ref.id,
    kind: ref.kind || 'text',
    page: ref.page || '',
    selector: ref.selector || '',
    original: ref.original || '',
    by: String(by || ref.author || '').slice(0, 120),
    before: snapshot(prev),
    after: snapshot(item),
  };
  await redis(['LPUSH', LOG_KEY, JSON.stringify(entry)]);
  await redis(['LTRIM', LOG_KEY, 0, LOG_MAX - 1]);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) {
    res.status(501).json({ error: 'Review storage is not connected' });
    return;
  }
  try {
    const query = req.query || {};
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;

    if (req.method === 'GET' && query.image) { await serveImage(String(query.image), res); return; }
    if (req.method === 'POST' && query.upload) { await uploadImage(body, res); return; }

    if (req.method === 'GET' && query.log) {
      const raw = (await redis(['LRANGE', LOG_KEY, 0, LOG_MAX - 1])) || [];
      const entries = [];
      raw.forEach((r) => { try { entries.push(JSON.parse(r)); } catch (e) {} });
      res.status(200).json({ entries });
      return;
    }

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
      // Replacing or removing an uploaded image drops the old file.
      const prevRaw = await redis(['HGET', KEY, item.id]);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;
      await redis(['HSET', KEY, item.id, JSON.stringify(item)]);
      const action = actionFor(prev, item);
      if (action) await log(action, item, prev, body.editor || item.author);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      if (!body || typeof body.id !== 'string') { res.status(400).json({ error: 'Missing id' }); return; }
      const prevRaw = await redis(['HGET', KEY, body.id]);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;
      await redis(['HDEL', KEY, body.id]);
      if (prev) await log('deleted', null, prev, body.editor);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Storage error' });
  }
};
