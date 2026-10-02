const fssPhone = require('./_fss-phone.js');
/* Abandono do formulário com e-mail OU WhatsApp válido → contato no GHL com a
   tag 'form-incompleto' (sem card, sem trigger, sem vendedor). Quem completa
   depois entra pelo /api/lead normal: o upsert de lá troca o conjunto de tags
   (tira a form-incompleto) e o vendedor é escolhido na criação do card. */
const LEAD_SOURCE = 'FAP06 - Espaço de Eventos';
const TAGS_INCOMPLETO = ['form-incompleto', 'espaco-form-incompleto'];
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const ipBucket = new Map();

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function isRateLimited(req) {
  const xff = req.headers['x-forwarded-for'];
  const ip = (typeof xff === 'string' && xff ? xff.split(',')[0].trim() : req.socket?.remoteAddress) || 'unknown';
  const now = Date.now();
  const entry = ipBucket.get(ip);
  if (!entry || now > entry.resetAt) {
    ipBucket.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

async function ghl(method, path, body) {
  const base = (process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com').replace(/\/+$/, '');
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GHL_PIT_TOKEN}`,
      Accept: 'application/json',
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      locationId: process.env.GHL_LOCATION_ID,
    },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (isRateLimited(req)) return json(res, 429, { error: 'too_many_requests' });
  if (!process.env.GHL_PIT_TOKEN || !process.env.GHL_LOCATION_ID) return json(res, 500, { error: 'server_not_configured' });

  let raw = req.body; /* sendBeacon chega como string/Buffer em algumas runtimes */
  if (raw && Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = {}; } }
  raw = raw || {};

  const clean = (v, n) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, n);
  const nome = clean(raw.nome, 120);
  const emailRaw = clean(raw.email, 254).toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : '';
  const tel = fssPhone(clean(raw.whatsapp, 32));
  const phone = tel.ok ? tel.e164 : '';
  if (!email && !phone) return json(res, 204, {});

  /* upsert SEM `tags` (substituiria o conjunto do contato) e sem campo vazio */
  const body = { locationId: process.env.GHL_LOCATION_ID };
  if (nome) {
    const parts = nome.split(' ');
    body.firstName = parts[0];
    if (parts.length > 1) body.lastName = parts.slice(1).join(' ');
  }
  if (email) body.email = email;
  if (phone) body.phone = phone;

  try {
    const up = await ghl('POST', '/contacts/upsert', body);
    const contactId = up.data?.contact?.id;
    if (!up.ok || !contactId) {
      console.error('[ghl] partial upsert failed', { status: up.status });
      return json(res, 502, { error: 'upstream_rejected' });
    }
    if (up.data.new) await ghl('PUT', `/contacts/${contactId}`, { source: LEAD_SOURCE });
    await ghl('POST', `/contacts/${contactId}/tags`, { tags: TAGS_INCOMPLETO });
    console.log('[ghl] partial ok', { contactId, novo: Boolean(up.data.new) });
    return json(res, 202, { ok: true });
  } catch (err) {
    console.error('[ghl] partial threw', { message: err && err.message });
    return json(res, 502, { error: 'upstream_unreachable' });
  }
}

module.exports = handler;
