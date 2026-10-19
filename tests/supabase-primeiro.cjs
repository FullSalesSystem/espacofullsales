// Contrato "Supabase primeiro": lead salvo no Supabase sobrevive a CRM fora (202 queued).
const assert = require('node:assert/strict');
Object.assign(process.env, { CRM_CAPTURE_ENABLED: 'true', CRM_CAPTURE_URL: 'https://crm.example.com/c', CRM_CAPTURE_PARTIAL_URL: 'https://crm.example.com/p', CRM_CAPTURE_INSTAGRAM_URL: 'https://crm.example.com/i', SUPABASE_URL: 'https://sb.example.com', SUPABASE_SERVICE_ROLE_KEY: 'k', CAPTURE_SUPABASE_FIRST: 'true' });
delete process.env.META_CAPI_TOKEN;
console.error = () => {};
const lead = require('../api/lead'), partial = require('../api/lead-partial'), instagram = require('../api/lead-instagram');
async function invoke(h, body) { const r = { setHeader() {}, end(x) { this.body = x ? JSON.parse(x) : null; } }; await h({ method: 'POST', headers: {}, socket: { remoteAddress: String(Math.random()) }, body }, r); return r; }
let sent, crmStatus, sbStatus;
global.fetch = async (url, init) => {
  sent.push({ url, init, body: JSON.parse(init.body) });
  if (url.startsWith('https://crm.')) return crmStatus === 0 ? Promise.reject(new Error('timeout')) : Response.json(crmStatus < 300 ? { received: true } : {}, { status: crmStatus });
  return new Response(null, { status: sbStatus });
};
const reset = (crm, sb) => { sent = []; crmStatus = crm; sbStatus = sb; };
const raw = { submission_id: 'espaco_fixture_01', submitted_at: '2026-10-19T12:00:00.000Z', page: 'https://espaco.example.com/', nome: 'Fixture Teste', email: 'fixture@example.com', whatsapp: '+55 11934172856', cargo: 'agencia', eventos: 'sim', instagram: '' };
(async () => {
  reset(201, 201);
  let r = await invoke(lead, raw);
  assert.equal(r.statusCode, 200);
  const crm = sent.find(s => s.url.startsWith('https://crm.')), cap = sent.find(s => s.url.includes('/lead_capturas')), row = sent.find(s => s.url.includes('FAP06'));
  const key = crm.body.submission_id;
  assert.match(key, /^espaco_fixture_01:complete:[0-9a-f]{24}$/);
  assert.equal(crm.init.headers['Idempotency-Key'], key);
  assert.equal(JSON.stringify(cap.body.capture_payload), crm.init.body, 'lead_capturas guarda o corpo exato do POST');
  assert.deepEqual(cap.body, { capture_key: key, source: 'espaco', capture_phase: 'complete', capture_payload: crm.body });
  assert.match(cap.init.headers.Prefer, /ignore-duplicates/);
  const m = crm.body.attribution.extra.marketing;
  assert.deepEqual([m.operation, m.conflict_key, m.row.capture_key], ['upsert', 'capture_key', key]);
  assert.match(row.url, /\?on_conflict=capture_key$/);
  assert.deepEqual(row.body, m.row, 'linha do funil = marketing.row do CRM');
  assert.match(row.init.headers.Prefer, /ignore-duplicates/);

  for (const crmFail of [503, 0, 409]) {
    reset(crmFail, 201);
    r = await invoke(lead, raw);
    assert.equal(r.statusCode, 202, `CRM ${crmFail} com lead salvo vira 202`);
    assert.deepEqual([r.body.received, r.body.queued, r.body.submission_id], [true, true, key]);
  }
  reset(503, 500);
  r = await invoke(lead, raw);
  assert.deepEqual([r.statusCode, r.body.error], [503, 'crm_capture_unavailable'], 'os dois fora com recusa certa: 503 unavailable');
  for (const crmFail of [0, 504]) {
    reset(crmFail, 500);
    r = await invoke(lead, raw);
    assert.deepEqual([r.statusCode, r.body.error], [503, 'crm_capture_uncertain'], `CRM ${crmFail} é ambíguo: front não reabre parcial`);
  }
  reset(201, 500);
  assert.equal((await invoke(lead, raw)).statusCode, 200, 'Supabase fora não bloqueia CRM ok');

  reset(503, 201);
  r = await invoke(partial, { submission_id: 'espaco_fixture_01', submitted_at: raw.submitted_at, nome: 'Fixture', email: 'fixture@example.com' });
  assert.equal(r.statusCode, 503, 'parcial não entra na fila: replay atrasado sobrescreveria o complete');
  assert.equal(sent.filter(s => s.url.startsWith('https://sb.')).length, 0, 'parcial não grava lead_capturas');

  process.env.CAPTURE_SUPABASE_FIRST = 'false';
  reset(201, 201);
  r = await invoke(lead, raw);
  assert.equal(r.statusCode, 200);
  assert.equal(sent.filter(s => s.url.startsWith('https://sb.')).length, 0, 'flag desligado: sem Supabase');
  assert.equal(sent.find(s => s.url.startsWith('https://crm.')).body.attribution.extra.marketing.operation, 'insert', 'flag desligado: insert antigo');
  reset(503, 201);
  assert.equal((await invoke(lead, raw)).statusCode, 503, 'flag desligado: CRM fora = 503 como antes');
  process.env.CAPTURE_SUPABASE_FIRST = 'true';

  reset(201, 201);
  r = await invoke(instagram, { ...raw, instagram: '@fixture' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(sent.filter(s => s.url.startsWith('https://sb.')).map(s => s.url.split('/rest/v1/')[1]), ['lead_capturas'], 'instagram grava só lead_capturas');
  assert.equal(sent.find(s => s.url.startsWith('https://crm.')).body.attribution.extra.marketing.operation, 'update', 'instagram segue update');
  // front: só a recusa certa (503 crm_capture_unavailable) reabre o beacon de parcial
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
  const fn = src.slice(src.indexOf('function postLeadToApi'), src.indexOf('// Lead form modal'));
  const post = f => new Function('fetch', fn + 'return postLeadToApi;')(f)({});
  assert.deepEqual(await post(async () => Response.json({ error: 'crm_capture_unavailable' }, { status: 503 })), { ok: false, down: true });
  assert.deepEqual(await post(async () => Response.json({ error: 'crm_capture_uncertain' }, { status: 503 })), { ok: false, down: false });
  assert.deepEqual(await post(async () => new Response('<html>504</html>', { status: 504 })), { ok: false, down: false });
  assert.deepEqual(await post(async () => { throw new Error('offline'); }), { ok: false, down: false });
  assert.deepEqual(await post(async () => Response.json({ ok: true, received: true, queued: true }, { status: 202 })), { ok: true, down: false });
  console.log('PASS supabase primeiro: corpo único, linha = marketing.row, 202 queued, 503 só com os dois fora, gate CAPTURE_SUPABASE_FIRST, parcial fora da fila');
})().catch(e => { process.stderr.write(String(e.stack) + '\n'); process.exitCode = 1; });
