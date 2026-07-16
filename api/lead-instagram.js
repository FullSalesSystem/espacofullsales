/* Fase 2 da captura em duas fases do Espaço Full Sales.
   O lead inteiro já foi pro /api/lead ao concluir o WhatsApp (antes da etapa
   do Instagram). Este endpoint recebe só o @ no envio final e:
     · atualiza o custom field "Qual o seu perfil do Instagram?" no contato GHL
     · adiciona uma nota curta com o @
     · faz PATCH na linha do [Leads] FAP01 (mesmo email + submitted_at)
   Nunca cria contato/linha novos — se nada casar, só loga. */

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const ipBucket = new Map();
const SUPABASE_TABLE = '[Leads] FAP06';
/* Custom field GHL "Qual o seu perfil do Instagram?" (mesmo do /api/lead) */
const INSTAGRAM_FIELD_ID = '3pzsEnGon1ZhyyoUKOgf';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = ipBucket.get(ip);
  if (!entry || now > entry.resetAt) {
    ipBucket.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

function sanitizeText(value, maxLen) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function normalizeInstagram(value) {
  const v = sanitizeText(value, 80)
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '')
    .replace(/[?#/].*$/, '')
    .replace(/\s+/g, '')
    .replace(/^@+/, '');
  if (!v) return '';
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? `@${v}` : sanitizeText(value, 60);
}

async function updateGhl(ghlBaseUrl, pitToken, locationId, ghlUserId, payload) {
  const upsert = await fetch(`${ghlBaseUrl.replace(/\/+$/, '')}/contacts/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Version: '2021-07-28',
      locationId,
    },
    body: JSON.stringify({
      locationId,
      email: payload.email,
      phone: payload.whatsapp,
      customFields: [{ id: INSTAGRAM_FIELD_ID, field_value: payload.instagram }],
    }),
  });

  const data = await upsert.json().catch(() => null);
  if (!upsert.ok) {
    console.error('[ghl] upsert instagram failed', { status: upsert.status });
    return false;
  }

  const contactId = data?.contact?.id;
  if (!contactId) return false;

  const noteBody = `• Instagram: ${payload.instagram}\n(coletado na última etapa do formulário FAP01)`;
  const notePayload = ghlUserId ? { userId: ghlUserId, body: noteBody } : { body: noteBody };
  const note = await fetch(`${ghlBaseUrl.replace(/\/+$/, '')}/contacts/${contactId}/notes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Accept: 'application/json',
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(notePayload),
  });
  if (!note.ok) console.error('[ghl] note instagram failed', { status: note.status });

  return true;
}

async function patchSupabase(supabaseUrl, supabaseKey, payload) {
  const endpoint =
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}` +
    `?email=eq.${encodeURIComponent(payload.email)}&data=eq.${encodeURIComponent(payload.submitted_at)}`;

  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ instagram: payload.instagram }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error('[supabase] patch instagram failed', {
      status: response.status,
      error: errorBody.slice(0, 300),
    });
    return 0;
  }
  const rows = await response.json().catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.warn('[supabase] patch instagram: nenhuma linha casou', {
      email: payload.email,
      data: payload.submitted_at,
    });
    return 0;
  }
  return rows.length;
}

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const ip = getClientIp(req);
  if (isRateLimited(ip)) return json(res, 429, { error: 'too_many_requests' });

  let raw = req.body;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (_) { raw = {}; }
  } else if (raw && Buffer.isBuffer(raw)) {
    try { raw = JSON.parse(raw.toString('utf8')); } catch (_) { raw = {}; }
  }
  raw = raw || {};

  const payload = {
    submission_id: sanitizeText(raw.submission_id, 80),
    submitted_at: sanitizeText(raw.submitted_at, 40),
    email: sanitizeText(raw.email, 254).toLowerCase(),
    whatsapp: sanitizeText(raw.whatsapp, 24),
    instagram: normalizeInstagram(raw.instagram),
  };

  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(payload.submission_id)) return json(res, 400, { error: 'invalid_payload' });
  if (!/^\d{4}-\d{2}-\d{2}T/.test(payload.submitted_at)) return json(res, 400, { error: 'invalid_payload' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return json(res, 400, { error: 'invalid_payload' });
  if (!/^\+\d{1,3}\s\d{8,15}$/.test(payload.whatsapp)) return json(res, 400, { error: 'invalid_payload' });
  if (!payload.instagram) return json(res, 400, { error: 'instagram_required' });

  const pitToken = process.env.GHL_PIT_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  const ghlBaseUrl = process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com';
  const ghlUserId = process.env.GHL_USER_ID || '';
  if (!pitToken || !locationId) return json(res, 500, { error: 'server_not_configured' });

  try {
    await updateGhl(ghlBaseUrl, pitToken, locationId, ghlUserId, payload);
  } catch (err) {
    console.error('[ghl] threw', { message: err && err.message });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      await patchSupabase(supabaseUrl, supabaseKey, payload);
    } catch (err) {
      console.error('[supabase] threw', { message: err && err.message });
    }
  }

  return json(res, 202, { ok: true });
}

module.exports = handler;
