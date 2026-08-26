const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const ipBucket = new Map();
const EVENTOS_PIPELINE_ID = 'FsF7Yf61UwR8Gt3ZyOsx';
const EVENTOS_STAGE_ENTRADA_ID = '81f2cde3-6fba-4f81-9d9a-64f82947f89f';
const MARINA_USER_ID = 'wkhJfnKwiXgvvcjwKAE8';   // Marina Valois
const RICARDO_USER_ID = 'Zy81V8eIFy85ooQzwRWl';  // Ricardo Patreze
const MARINA_TARGET_SHARE = 0.6;                 // 60/40 rebalance
const LEAD_SOURCE = 'FAP06 - Espaço de Eventos';
const SUPABASE_TABLE = '[Leads] FAP06';
/* Custom field GHL "Qual o seu perfil do Instagram?" (mesmo do FAP01) */
const INSTAGRAM_FIELD_ID = '3pzsEnGon1ZhyyoUKOgf';

const ALLOWED_CARGOS = new Set([
  'dono-evento',
  'agencia',
  'assessoria',
  'outro',
]);

const ALLOWED_EVENTOS = new Set(['sim', 'nao']);

const CARGO_LABELS = {
  'dono-evento': 'Dono(a) do evento',
  agencia: 'Agência',
  assessoria: 'Assessor(a) de eventos',
  outro: 'Outro',
};

const EVENTOS_LABELS = {
  sim: 'Sim',
  nao: 'Não',
};

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
  if (entry.count > MAX_REQUESTS_PER_WINDOW) return true;
  return false;
}

function sanitizeText(value, maxLen) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

/* Aceita "@fulano", "fulano" ou o link do perfil; devolve "@fulano".
   Nunca rejeita o payload por causa dele — fora do padrão passa sanitizado. */
function normalizeInstagram(value) {
  const v = sanitizeText(value, 80)
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '')
    .replace(/[?#/].*$/, '')
    .replace(/\s+/g, '')
    .replace(/^@+/, '');
  if (!v) return '';
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? `@${v}` : sanitizeText(value, 60);
}

function validatePayload(input) {
  const payload = {
    submission_id: sanitizeText(input.submission_id, 80),
    submitted_at: sanitizeText(input.submitted_at, 40),
    page: sanitizeText(input.page, 500),
    nome: sanitizeText(input.nome, 120),
    email: sanitizeText(input.email, 254).toLowerCase(),
    whatsapp: sanitizeText(input.whatsapp, 24),
    cargo: sanitizeText(input.cargo, 40),
    eventos: sanitizeText(input.eventos, 8).toLowerCase(),
    instagram: normalizeInstagram(input.instagram),
    utm_source: sanitizeText(input.utm_source, 120),
    utm_medium: sanitizeText(input.utm_medium, 120),
    utm_campaign: sanitizeText(input.utm_campaign, 200),
    utm_content: sanitizeText(input.utm_content, 200),
    utm_term: sanitizeText(input.utm_term, 200),
  };

  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(payload.submission_id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(payload.submitted_at)) return null;
  if (!/^https?:\/\//.test(payload.page)) return null;
  if (payload.nome.length < 2) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return null;
  if (!/^\+\d{1,3}\s\d{8,15}$/.test(payload.whatsapp)) return null;
  if (!ALLOWED_CARGOS.has(payload.cargo)) return null;
  if (!ALLOWED_EVENTOS.has(payload.eventos)) return null;

  return payload;
}

function splitName(fullName) {
  const clean = sanitizeText(fullName, 120);
  const parts = clean.split(' ').filter(Boolean);
  const firstName = parts[0] || 'Lead';
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/* v2 do form: sem segmento e sem faturamento — todo lead válido
   entra como qualificado (tag mantida pra compatibilidade com
   automações existentes no GHL). */
function classifyLead() {
  return 'qualificado';
}

function buildGhlPayload(payload, locationId) {
  const { firstName, lastName } = splitName(payload.nome);
  const classificacao = classifyLead();

  const body = {
    locationId,
    firstName,
    lastName,
    name: payload.nome,
    email: payload.email,
    phone: payload.whatsapp,
    source: LEAD_SOURCE,
    tags: [
      'fap6-cadastro',
      'fap6-cadastro-trigger',
      classificacao,
      `cargo:${payload.cargo}`,
    ],
  };

  /* Instagram NÃO vira tag (@ único por lead explodiria o registro de tags).
     Vai no custom field do contato, visível no painel do GHL. */
  if (payload.instagram) {
    body.customFields = [{ id: INSTAGRAM_FIELD_ID, field_value: payload.instagram }];
  }

  return body;
}

async function sendToSupabase(supabaseUrl, supabaseKey, payload) {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}`;
  const row = {
    nome: payload.nome,
    email: payload.email,
    telefone: payload.whatsapp,
    cargo: payload.cargo,
    /* v2 do form não pergunta mais segmento/faturamento;
       colunas seguem existindo na tabela, vão vazias */
    segmento: '',
    faturamento: '',
    utm_source: payload.utm_source,
    utm_medium: payload.utm_medium,
    utm_campaign: payload.utm_campaign,
    utm_content: payload.utm_content,
    utm_term: payload.utm_term,
    url: payload.page,
    data: payload.submitted_at,
  };

  /* chaves novas só entram quando preenchidas: se a coluna ainda não
     existir na tabela, o PostgREST rejeita o insert inteiro (PGRST204) —
     o retry abaixo remove a coluna reclamada e reinsere, pra nunca
     perder o lead enquanto a migration não roda */
  if (payload.instagram) row.instagram = payload.instagram;
  if (payload.eventos) row.eventos = payload.eventos;

  const insert = (body) => fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  let response = await insert(row);

  for (let tentativa = 0; tentativa < 3 && !response.ok; tentativa += 1) {
    const errorBody = await response.text().catch(() => '');
    const colFaltando = /Could not find the '([^']+)' column/.exec(errorBody);
    if (!colFaltando || !(colFaltando[1] in row)) {
      console.error('[supabase] insert failed', {
        status: response.status,
        endpoint,
        error: errorBody.slice(0, 500),
      });
      return { ok: false, status: response.status };
    }
    console.warn('[supabase] coluna ausente na tabela — reinserindo sem o campo', {
      coluna: colFaltando[1],
    });
    delete row[colFaltando[1]];
    response = await insert(row);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error('[supabase] insert failed', {
      status: response.status,
      endpoint,
      error: errorBody.slice(0, 500),
    });
  } else {
    console.log('[supabase] insert ok', { status: response.status });
  }

  return { ok: response.ok, status: response.status };
}

async function sendToHighLevel(ghlBaseUrl, pitToken, locationId, payload) {
  const body = JSON.stringify(buildGhlPayload(payload, locationId));
  const endpoint = `${ghlBaseUrl.replace(/\/+$/, '')}/contacts/upsert`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Version: '2021-07-28',
      locationId,
    },
    body,
  });

  const data = await response.json().catch(() => null);
  return { response, data };
}

async function searchContactOpportunities(ghlBaseUrl, pitToken, locationId, contactId) {
  const query = new URLSearchParams({
    location_id: locationId,
    contact_id: contactId,
    limit: '100',
  });
  const endpoint = `${ghlBaseUrl.replace(/\/+$/, '')}/opportunities/search?${query.toString()}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Accept: 'application/json',
      Version: '2021-07-28',
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !Array.isArray(data.opportunities)) return [];
  return data.opportunities;
}

function buildNoteBody(payload) {
  const classificacao = classifyLead();
  const lines = [
    'Respostas FAP06 — Espaço de Eventos',
    '',
    `• Nome: ${payload.nome}`,
    `• E-mail: ${payload.email}`,
    `• Telefone: ${payload.whatsapp}`,
    `• Papel no evento: ${CARGO_LABELS[payload.cargo] || payload.cargo}`,
    `• Faz eventos presenciais: ${EVENTOS_LABELS[payload.eventos] || payload.eventos}`,
  ];
  if (payload.instagram) {
    lines.push(`• Instagram: ${payload.instagram}`);
  }
  lines.push(
    '',
    `Classificação: ${classificacao}`,
    `Página: ${payload.page}`,
    `Enviado em: ${payload.submitted_at}`,
  );

  const utmEntries = [
    payload.utm_source && `source=${payload.utm_source}`,
    payload.utm_medium && `medium=${payload.utm_medium}`,
    payload.utm_campaign && `campaign=${payload.utm_campaign}`,
    payload.utm_content && `content=${payload.utm_content}`,
    payload.utm_term && `term=${payload.utm_term}`,
  ].filter(Boolean);

  if (utmEntries.length) {
    lines.push('', `UTMs: ${utmEntries.join(' | ')}`);
  }

  return lines.join('\n');
}

async function addContactNote(ghlBaseUrl, pitToken, contactId, userId, body) {
  const endpoint = `${ghlBaseUrl.replace(/\/+$/, '')}/contacts/${contactId}/notes`;
  const payload = userId ? { userId, body } : { body };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Accept: 'application/json',
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error('[ghl] note failed', {
      status: response.status,
      hasUserId: Boolean(userId),
      error: errorBody.slice(0, 500),
    });
  } else {
    console.log('[ghl] note ok', { status: response.status });
  }

  return response.ok;
}

async function addContactTags(ghlBaseUrl, pitToken, contactId, tags) {
  const endpoint = `${ghlBaseUrl.replace(/\/+$/, '')}/contacts/${contactId}/tags`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Accept: 'application/json',
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tags }),
  });
  return response.ok;
}

async function updateContactSource(ghlBaseUrl, pitToken, contactId) {
  const endpoint = `${ghlBaseUrl.replace(/\/+$/, '')}/contacts/${contactId}`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Accept: 'application/json',
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: LEAD_SOURCE }),
  });
  return response.ok;
}

/* Round-robin ponderado 60/40 entre Marina e Ricardo, baseado em
   contagem de oportunidades ABERTAS já atribuídas a cada um dentro
   da pipeline "10. Eventos". Fallback: se falhar, atribui a Marina. */
async function chooseAssignee(ghlBaseUrl, pitToken, locationId) {
  try {
    const query = new URLSearchParams({
      location_id: locationId,
      pipeline_id: EVENTOS_PIPELINE_ID,
      status: 'open',
      limit: '100',
    });
    const endpoint = `${ghlBaseUrl.replace(/\/+$/, '')}/opportunities/search?${query.toString()}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${pitToken}`,
        Accept: 'application/json',
        Version: '2021-07-28',
      },
    });
    const data = await response.json().catch(() => null);
    const opps = (data && Array.isArray(data.opportunities)) ? data.opportunities : [];

    let marinaCount = 0;
    let ricardoCount = 0;
    for (const op of opps) {
      const owner = op.assignedTo || op.ownerId || '';
      if (owner === MARINA_USER_ID) marinaCount += 1;
      else if (owner === RICARDO_USER_ID) ricardoCount += 1;
    }
    const total = marinaCount + ricardoCount;

    /* Cota da Marina ao final desta atribuição: 60% de (total+1).
       Se ela ainda está abaixo da cota, vai pra ela; senão, Ricardo.
       Sequência que emerge: M M R M R M M R M R ... (6:4 a cada 10). */
    const marinaTargetAfter = (total + 1) * MARINA_TARGET_SHARE;
    const chosen = marinaCount < marinaTargetAfter ? MARINA_USER_ID : RICARDO_USER_ID;

    console.log('[assignee] rebalance', {
      marinaCount,
      ricardoCount,
      chosen: chosen === MARINA_USER_ID ? 'Marina' : 'Ricardo',
    });
    return chosen;
  } catch (err) {
    console.error('[assignee] search failed, defaulting to Marina', { message: err && err.message });
    return MARINA_USER_ID;
  }
}

async function createOpportunityInEventos(ghlBaseUrl, pitToken, locationId, contactId, name, assignedUserId) {
  const endpoint = `${ghlBaseUrl.replace(/\/+$/, '')}/opportunities/`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pitToken}`,
      Accept: 'application/json',
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      locationId,
      contactId,
      pipelineId: EVENTOS_PIPELINE_ID,
      pipelineStageId: EVENTOS_STAGE_ENTRADA_ID,
      status: 'open',
      name,
      source: LEAD_SOURCE,
      assignedTo: assignedUserId,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error('[ghl] create opp failed', {
      status: response.status,
      error: errorBody.slice(0, 500),
    });
    return null;
  }
  const data = await response.json().catch(() => null);
  console.log('[ghl] opp created in Eventos', {
    id: data && (data.opportunity?.id || data.id),
    assignedTo: assignedUserId === MARINA_USER_ID ? 'Marina' : 'Ricardo',
  });
  return data;
}

/* ===========================================================================
   Meta Conversions API (CAPI) — espelho server-side do pixel.

   Manda pro Meta os MESMOS eventos que o navegador dispara neste funil, com o
   MESMO event_id (= submission_id). A Meta deduplica navegador x servidor por
   (event_name, event_id) em 48h, entao o volume nao muda: o que muda e a
   qualidade da correspondencia (e-mail/telefone/nome com hash + IP + UA +
   fbp/fbc) e a resiliencia (bloqueador, ITP, aba fechada antes do fbq).

   Credencial: META_CAPI_TOKEN (env) ou ./capi.json ao lado do handler
   (Passenger no cPanel nao tem env editavel por FTP). Sem token => no-op.
   Nunca derruba o lead: erro so vai pro log. META_TEST_EVENT_CODE (env)
   manda pro "Testar eventos" do Events Manager sem contar de verdade.
   =========================================================================== */
const crypto = require('crypto');
const META_PIXEL_ID = process.env.META_PIXEL_ID || '288404690470754';

function metaCapiToken() {
  if (process.env.META_CAPI_TOKEN) return process.env.META_CAPI_TOKEN;
  try { return require('./capi.json').token || ''; } catch (_) { return ''; }
}

function metaHash(value) {
  const v = String(value || '').trim().toLowerCase();
  return v ? crypto.createHash('sha256').update(v).digest('hex') : null;
}

function readReqCookie(req, name) {
  const cookie = String((req.headers && req.headers.cookie) || '');
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/* user    = { nome, email, telefone, fbp, fbc, fbclid, url }
   eventos = [{ name, id, custom }] — todos vao numa unica chamada.
   Retorna quantos eventos a Meta aceitou (0 = sem token ou falha). */
async function metaCapi(req, user, eventos) {
  const token = metaCapiToken();
  if (!token || !eventos.length) return 0;

  const userData = {};
  const em = metaHash(user.email);
  if (em) userData.em = [em];
  const fone = String(user.telefone || '').replace(/\D/g, '');
  if (fone) userData.ph = [metaHash(fone)];
  const nome = String(user.nome || '').trim().split(/\s+/).filter(Boolean);
  if (nome[0]) userData.fn = [metaHash(nome[0])];
  if (nome.length > 1) userData.ln = [metaHash(nome.slice(1).join(' '))];
  if (fone.startsWith('55')) userData.country = [metaHash('br')];
  const ip = getClientIp(req);
  if (ip && ip !== 'unknown') userData.client_ip_address = ip;
  const ua = req.headers && req.headers['user-agent'];
  if (ua) userData.client_user_agent = String(ua).slice(0, 512);
  const fbp = user.fbp || readReqCookie(req, '_fbp');
  if (fbp) userData.fbp = fbp;
  const fbc = user.fbc || readReqCookie(req, '_fbc')
    || (user.fbclid ? 'fb.1.' + Date.now() + '.' + user.fbclid : '');
  if (fbc) userData.fbc = fbc;

  const now = Math.floor(Date.now() / 1000);
  const body = {
    access_token: token,
    data: eventos.map((ev) => ({
      event_name: ev.name,
      event_time: now,
      event_id: ev.id,
      action_source: 'website',
      event_source_url: user.url,
      user_data: userData,
      custom_data: ev.custom || {},
    })),
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await r.text().catch(() => '');
    if (!r.ok) {
      console.error('[capi] rejeitado', { status: r.status, body: txt.slice(0, 300) });
      return 0;
    }
    console.log('[capi] ok', { eventos: eventos.map((e) => e.name).join(','), id: eventos[0].id });
    return eventos.length;
  } catch (err) {
    console.error('[capi] falhou', { message: err && err.message });
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const ip = getClientIp(req);
  if (isRateLimited(ip)) return json(res, 429, { error: 'too_many_requests' });

  const pitToken = process.env.GHL_PIT_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  const ghlBaseUrl = process.env.GHL_BASE_URL || 'https://services.leadconnectorhq.com';
  const ghlUserId = process.env.GHL_USER_ID || '';
  if (!pitToken || !locationId) return json(res, 500, { error: 'server_not_configured' });

  /* req.body normalmente já vem parseado pelo Vercel quando o
     Content-Type é application/json. Mas sendBeacon (usado para
     sobreviver ao fechamento do modal) pode entregar como string
     ou Buffer em algumas runtimes — defensivo. */
  let rawBody = req.body;
  if (typeof rawBody === 'string') {
    try { rawBody = JSON.parse(rawBody); } catch (_) { rawBody = {}; }
  } else if (rawBody && typeof rawBody === 'object' && Buffer.isBuffer(rawBody)) {
    try { rawBody = JSON.parse(rawBody.toString('utf8')); } catch (_) { rawBody = {}; }
  }

  const payload = validatePayload(rawBody || {});
  if (!payload) {
    console.warn('[lead] invalid payload', {
      bodyType: typeof req.body,
      keys: rawBody && typeof rawBody === 'object' ? Object.keys(rawBody) : null,
    });
    return json(res, 400, { error: 'invalid_payload' });
  }

  console.log('[lead] utms received', {
    utm_source: payload.utm_source,
    utm_medium: payload.utm_medium,
    utm_campaign: payload.utm_campaign,
    utm_content: payload.utm_content,
    utm_term: payload.utm_term,
    page: payload.page.slice(0, 200),
  });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const supaResult = await sendToSupabase(supabaseUrl, supabaseKey, payload);
      console.log('[supabase] result', { ok: supaResult.ok, status: supaResult.status });
    } catch (err) {
      console.error('[supabase] threw', { message: err && err.message });
    }
  } else {
    console.warn('[supabase] env missing', {
      hasUrl: Boolean(supabaseUrl),
      hasKey: Boolean(supabaseKey),
    });
  }

  /* Meta CAPI — o GTM-MK7SRXJ9 dispara Lead + Lead_qualificado_FAQ_06 no
     pixel a cada lead (evento lead_form_submit). O stub do index.html anexa
     eventID = submission_id a esses disparos; aqui vao os mesmos dois eventos
     com o mesmo id, e a Meta deduplica. */
  const capi = await metaCapi(req, {
    nome: payload.nome, email: payload.email, telefone: payload.whatsapp, url: payload.page,
  }, [
    { name: 'Lead', id: payload.submission_id },
    { name: 'Lead_qualificado_FAQ_06', id: payload.submission_id },
  ]);

  try {
    const classificacao = classifyLead();
    const { response, data } = await sendToHighLevel(ghlBaseUrl, pitToken, locationId, payload);

    if (!response.ok) return json(res, 502, { error: 'upstream_rejected' });
    const contactId = data?.contact?.id;

    if (contactId) {
      await updateContactSource(ghlBaseUrl, pitToken, contactId);
      try {
        const noteUserId = ghlUserId || data?.contact?.assignedTo || '';
        await addContactNote(ghlBaseUrl, pitToken, contactId, noteUserId, buildNoteBody(payload));
      } catch (err) {
        console.error('[ghl] note threw', { message: err && err.message });
      }

      /* Reentrada + criação de opp em "10. Eventos":
         - Se contato já preencheu antes (tem opp em Eventos, aberta ou
           fechada) → tag `reentrada-espacofs`.
         - Se tem opp ABERTA em Eventos → NÃO cria nova (GHL rejeita
           duplicata com 400 no mesmo pipeline). Time re-trabalha a existente.
         - Se só opps FECHADAS ou nenhuma → cria opp nova em "Entrada"
           com assignee balanceado 60% Marina / 40% Ricardo. */
      const opportunities = await searchContactOpportunities(ghlBaseUrl, pitToken, locationId, contactId);
      const eventosOpps = opportunities.filter((op) => op.pipelineId === EVENTOS_PIPELINE_ID);
      const hasOpenEventosOpp = eventosOpps.some((op) => op.status === 'open');

      if (eventosOpps.length > 0) {
        await addContactTags(ghlBaseUrl, pitToken, contactId, ['reentrada-espacofs']);
      }

      if (hasOpenEventosOpp) {
        const existing = eventosOpps.find((op) => op.status === 'open');
        console.log('[reentrada] opp aberta ja existe em Eventos, skip creation', {
          existingId: existing && existing.id,
        });
      } else {
        const assignedUserId = await chooseAssignee(ghlBaseUrl, pitToken, locationId);
        await createOpportunityInEventos(
          ghlBaseUrl, pitToken, locationId, contactId, payload.nome, assignedUserId,
        );
      }
    }

    return json(res, 202, { ok: true, classificacao, capi });
  } catch (_) {
    return json(res, 502, { error: 'upstream_unreachable' });
  }
}

module.exports = handler;
