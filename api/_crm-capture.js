const { createHash } = require('node:crypto');
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
function revenueBounds(revenue) {
  const key = revenue.raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const ranges = {
    'abaixo-30k': [null, 30000, false], 'abaixo-40k': [null, 40000, false], '40k-50k': [40000, 50000], '30k-50k': [30000, 50000],
    '40k-100k': [40000,100000], '300k-1m': [300000,1000000], '50k-100k': [50000, 100000], '100k-300k': [100000, 300000], '300k-500k': [300000, 500000], '500k-1m': [500000, 1000000], 'acima-1m': [1000000, null, false],
    'ate r$ 30 mil': [null, 30000], 'entre r$ 30 mil e r$ 100 mil': [30000, 100000], 'entre r$ 100 mil e r$ 500 mil': [100000, 500000], 'entre r$ 500 mil e r$ 1 milhao': [500000, 1000000], 'acima de r$ 1 milhao': [1000000, null, false],
    'ate_30k': [null, 30000], '30_80k': [30000, 80000], '80_200k': [80000, 200000], '200k_plus': [200000, null, false],
    'menos-1m': [null, 1000000, false], '1-3': [1000000, 3000000], '3-10': [3000000, 10000000], '10-mais': [10000000, null, false],
  };
  const range = ranges[revenue.raw] || ranges[key];
  if (!range) return revenue;
  const result = { ...revenue };
  if (range[0] !== null) { result.min_cents = range[0] * 100; result.min_inclusive = range[1] !== null || range[2] !== false; }
  if (range[1] !== null) { result.max_cents = range[1] * 100; result.max_inclusive = range[0] !== null || range[2] !== false; }
  return result;
}
function captureEnabled() { return process.env.CRM_CAPTURE_ENABLED === 'true'; }
function buildCapture(raw, payload, options = {}) {
  const answers = JSON.parse(JSON.stringify(raw));
  const base = String(raw.submission_id || raw.event_id || options.legacySubmission?.id || '');
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(base)) throw new Error('invalid_submission_id');
  const stamp = raw.submitted_at || raw.ts || options.legacySubmission?.at;
  if (!stamp || !Number.isFinite(Date.parse(stamp))) throw new Error('invalid_submitted_at');
  const contact = {};
  const name = payload.nome || payload.name;
  const email = payload.email;
  const phone = String(payload.whatsapp || payload.telefone || payload.phone || '').replace(/\D/g, '');
  if (name) contact.name = name;
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) contact.email = email.toLowerCase();
  if (/^[1-9]\d{7,14}$/.test(phone)) contact.phone = '+' + phone;
  if (!contact.email && !contact.phone) throw new Error('invalid_contact');
  const phase = options.phase || 'complete';
  const hash = createHash('sha256').update(canonical(answers)).digest('hex').slice(0, 24);
  const qualification = {};
  if (options.revenue) qualification.revenue = revenueBounds(options.revenue);
  if (options.role) qualification.role = { raw: String(options.role) };
  if (options.segment) qualification.segment = { raw: String(options.segment) };
  const attribution = { extra: { source_submission_id: base, phase } };
  const page = raw.page || raw.pagina;
  if (page && /^https?:\/\//.test(page)) attribution.page_url = page;
  for (const key of ['referrer','utm_source','utm_medium','utm_campaign','utm_content','utm_term']) if (typeof raw[key] === 'string' && raw[key]) attribution[key] = raw[key];
  if (options.marketing) attribution.extra.marketing = options.marketing;
  if (options.ghlTags) attribution.extra.ghl_tags = options.ghlTags;
  if (options.ghlCustomFields?.length) attribution.extra.ghl_custom_fields = options.ghlCustomFields;
  return { schema_version: 1, submission_id: `${base}:${phase}:${hash}`, submitted_at: new Date(stamp).toISOString(), contact, answers, qualification, attribution };
}
async function capture(raw, payload, options = {}) {
  const endpoint = options.endpoint !== undefined ? options.endpoint : (options.phase === 'partial' ? process.env.CRM_CAPTURE_PARTIAL_URL : options.phase === 'instagram' ? process.env.CRM_CAPTURE_INSTAGRAM_URL : process.env.CRM_CAPTURE_URL);
  if (!endpoint || !/^https:\/\//.test(endpoint)) throw new Error('capture_not_configured');
  const body = buildCapture(raw, payload, options);
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': body.submission_id }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000), redirect: 'error' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.received !== true) throw new Error('capture_not_received');
  return { ok: true, received: true, submission_id: body.submission_id };
}
module.exports = { captureEnabled, buildCapture, capture };
