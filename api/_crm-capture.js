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
// Contrato "Supabase primeiro" (crm-pre-vendas-fss/entrada-leads-1910/CONTRATO-SUPABASE-PRIMEIRO.md).
// O corpo é montado UMA vez; o mesmo objeto vai pro lead_capturas e pro CRM. O reconciliador do CRM
// repete o que ficar pending, então falha do CRM com o lead já salvo responde 202 queued.
function supabaseInsert(path, row, prefer) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) return Promise.reject(new Error('supabase_not_configured'));
  const base = (process.env.SUPABASE_URL || 'https://dpqvpedltehnemvtbxle.supabase.co').replace(/\/+$/, '');
  return fetch(`${base}/rest/v1/${path}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer }, body: JSON.stringify(row), signal: AbortSignal.timeout(3000), redirect: 'error' })
    .then(r => { if (!r.ok) throw new Error(`supabase_http_${r.status}`); });
}
// Gate igual ao fap01: CAPTURE_SUPABASE_FIRST desligado = comportamento antigo (insert, sem Supabase,
// CRM fora = erro). Parcial NUNCA vai pro lead_capturas: replay atrasado de parcial depois do complete
// marcaria form-incompleto num lead já distribuído. Perder parcial com o CRM fora é igual a antes.
function supabaseFirst(source, phase) {
  return process.env.CAPTURE_SUPABASE_FIRST === 'true' && Boolean(source) && phase !== 'partial'
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}
async function capture(raw, payload, options = {}) {
  const endpoint = options.endpoint !== undefined ? options.endpoint : (options.phase === 'partial' ? process.env.CRM_CAPTURE_PARTIAL_URL : options.phase === 'instagram' ? process.env.CRM_CAPTURE_INSTAGRAM_URL : process.env.CRM_CAPTURE_URL);
  const body = buildCapture(raw, payload, options);
  const key = body.submission_id;
  const phase = body.attribution.extra.phase;
  const first = supabaseFirst(options.source, phase);
  const marketing = body.attribution.extra.marketing;
  const complete = first && phase === 'complete' && marketing && marketing.operation === 'insert';
  if (complete) { // a chave não muda: o hash cobre só answers
    marketing.row.capture_key = key;
    marketing.operation = 'upsert';
    marketing.conflict_key = 'capture_key';
  }
  const log = (step, err) => console.error('[capture] ' + step + ' falhou', { submission_id: key, message: err && err.message });
  // ponytail: Supabase e CRM saem juntos (pior caso 8 s, cabe no maxDuration 10 s). A ordem não importa:
  // o reconciliador só olha linhas com 3+ min e as duas escritas no Supabase são ignore-duplicates.
  const saved = !first ? Promise.resolve(false) : supabaseInsert('lead_capturas', { capture_key: key, source: options.source, capture_phase: phase, capture_payload: body }, 'resolution=ignore-duplicates,return=minimal')
    .then(() => true, err => { log('lead_capturas', err); return false; });
  const row = complete ? supabaseInsert(`${encodeURIComponent(marketing.table)}?on_conflict=capture_key`, marketing.row, 'resolution=ignore-duplicates,return=minimal').catch(err => log('leads_row', err)) : null;
  let uncertain = false; // sem resposta HTTP (timeout/rede) ou 500/502/504: o CRM pode ter gravado
  const crm = (async () => {
    if (!endpoint || !/^https:\/\//.test(endpoint)) throw new Error('capture_not_configured');
    uncertain = true;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000), redirect: 'error' });
    uncertain = response.status >= 500 && response.status !== 503;
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.received !== true) throw new Error(`crm_http_${response.status}`);
  })().then(() => true, err => { log('crm', err); return false; });
  const [savedOk, crmOk] = await Promise.all([saved, crm, row]);
  if (crmOk) return { ok: true, received: true, submission_id: key };
  if (savedOk) return { ok: true, received: true, queued: true, submission_id: key };
  throw new Error(uncertain ? 'capture_uncertain' : 'capture_not_received');
}
module.exports = { captureEnabled, buildCapture, capture };
