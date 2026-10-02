// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('primary-menu');

if (toggle && menu) {
  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// Carousels
const PREFERS_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const AUTOPLAY_INTERVAL = 5000;
const RESUME_AFTER_INTERACTION = 8000;

function initCarousel(carousel) {
  const track = carousel.querySelector('.carousel-track');
  const slides = Array.from(carousel.querySelectorAll('.carousel-slide'));
  const dotsBox = carousel.querySelector('.carousel-dots');

  if (!track || slides.length === 0) return;

  if (slides.length <= 1) {
    dotsBox?.remove();
    return;
  }

  let activeIdx = 0;
  let autoplayTimer = null;
  let resumeTimer = null;
  let visible = !document.hidden;
  let inViewport = false;
  let isHovered = false;

  const goTo = (idx) => {
    track.scrollTo({ left: slides[idx].offsetLeft, behavior: 'smooth' });
  };

  const tick = () => {
    const nextIdx = (activeIdx + 1) % slides.length;
    goTo(nextIdx);
  };

  const startAutoplay = () => {
    if (PREFERS_REDUCED) return;
    if (!visible || !inViewport || isHovered) return;
    if (autoplayTimer) return;
    autoplayTimer = setInterval(tick, AUTOPLAY_INTERVAL);
  };

  const stopAutoplay = () => {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  };

  const pauseTemporarily = () => {
    stopAutoplay();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(startAutoplay, RESUME_AFTER_INTERACTION);
  };

  // Build dots
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Imagem ${i + 1} de ${slides.length}`);
    dot.addEventListener('click', () => {
      goTo(i);
      pauseTemporarily();
    });
    dotsBox.appendChild(dot);
  });
  const dots = Array.from(dotsBox.querySelectorAll('.carousel-dot'));
  dots[0].classList.add('is-active');

  const update = () => {
    const idx = Math.max(
      0,
      Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth))
    );
    if (idx !== activeIdx) {
      dots[activeIdx]?.classList.remove('is-active');
      dots[idx]?.classList.add('is-active');
      activeIdx = idx;
    }
  };
  update();

  let raf;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  });

  // Pause on hover (desktop) and on focus
  carousel.addEventListener('mouseenter', () => { isHovered = true; stopAutoplay(); });
  carousel.addEventListener('mouseleave', () => { isHovered = false; startAutoplay(); });
  carousel.addEventListener('focusin', stopAutoplay);
  carousel.addEventListener('focusout', startAutoplay);

  // Pause on touch/wheel scroll then resume after a beat
  track.addEventListener('touchstart', pauseTemporarily, { passive: true });
  track.addEventListener('wheel', pauseTemporarily, { passive: true });

  // Pause when tab is hidden
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) startAutoplay(); else stopAutoplay();
  });

  // Pause when carousel is out of viewport
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        inViewport = entry.isIntersecting;
        if (inViewport) startAutoplay(); else stopAutoplay();
      });
    }, { threshold: 0.35 });
    io.observe(carousel);
  } else {
    inViewport = true;
    startAutoplay();
  }
}

document.querySelectorAll('[data-carousel]').forEach(initCarousel);

// Subtle reveal-on-scroll for sections (pulado com prefers-reduced-motion)
const revealTargets = document.querySelectorAll(
  '.section-head, .tour-item, .reason-card, .hero-meta li, .map-wrap, .cta-inner'
);

if (!PREFERS_REDUCED && 'IntersectionObserver' in window && revealTargets.length) {
  revealTargets.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity .6s ease, transform .6s ease';
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
  );

  revealTargets.forEach((el) => io.observe(el));
}

// Sticky CTA mobile: aparece quando o hero sai da tela
const stickyCta = document.getElementById('sticky-cta');
const heroEl = document.querySelector('.hero');
if (stickyCta && heroEl && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        stickyCta.classList.toggle('is-visible', !entry.isIntersecting);
      });
    },
    { threshold: 0.05 }
  );
  io.observe(heroEl);
}

// UTMPicker — captura UTMs da URL no load e persiste em sessionStorage
// pra sobreviver a navegação interna no site (ancoras, abertura do modal etc).
(function captureUtms() {
  try {
    const params = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
      const v = params.get(k);
      if (v) sessionStorage.setItem('fss_' + k, v.slice(0, 200));
    });
  } catch (_) {
    /* sessionStorage pode falhar em modos privados — segue o jogo */
  }
})();

function getStoredUtms() {
  const out = {};
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  try {
    keys.forEach((k) => { out[k] = sessionStorage.getItem('fss_' + k) || ''; });
  } catch (_) {
    keys.forEach((k) => { out[k] = ''; });
  }
  return out;
}

function generateSubmissionId() {
  return 'fap6-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

/* fss-phone — regra ÚNICA de telefone/WhatsApp dos funis FSS (v1, 2026-10-02).
   Fonte canônica: ~/fss-phone/fss-phone.js (gêmeo PHP: fss-phone.php).
   Cada funil leva uma CÓPIA desta função (front e API) — mudou aqui, muda lá.

   fssPhone(raw, cc) → { ok:true, cc, num, full:'+CC NUM', e164 } | { ok:false, error }
   - raw sem "+": Brasil (ou o `cc` do select de país, se vier ≠ 55).
   - raw com "+": internacional; "+55" volta pra regra BR.
   BR: tira 0 e 55 da frente, exige DDD real + celular de 11 dígitos começando com 9,
   recusa número de mentira (88888888, 12345678...). */
var FSS_DDD = '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99';
var FSS_CC2 = ' 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98 ';
/* tamanho do número nacional nos países que mais aparecem; resto: 7-12 */
var FSS_LEN = { '1': [10], '351': [9], '34': [9], '33': [9], '39': [9, 10], '44': [10], '49': [10, 11], '41': [9], '353': [9], '54': [10, 11], '52': [10], '56': [9], '57': [10], '51': [9], '595': [9], '598': [8], '591': [8], '244': [9], '258': [9], '61': [9], '81': [9, 10] };

function fssPhone(raw, cc) {
  var s = String(raw == null ? '' : raw).trim();
  var d = s.replace(/\D/g, '');
  var BAD = 'Confira o número: DDD + celular com 9. Ex.: (11) 9XXXX-XXXX';
  if (!d) return { ok: false, error: 'Informe seu WhatsApp com DDD.' };
  if (s.charAt(0) === '+' || (cc && String(cc) !== '55')) {
    if (s.charAt(0) !== '+') d = String(cc).replace(/\D/g, '') + d.replace(/^0+/, '');
    if (d.slice(0, 2) === '55') { s = d.slice(2); d = s; }
    else {
      var c = d.charAt(0) === '1' || d.charAt(0) === '7' ? d.slice(0, 1)
        : FSS_CC2.indexOf(' ' + d.slice(0, 2) + ' ') >= 0 ? d.slice(0, 2) : d.slice(0, 3);
      var n = d.slice(c.length).replace(/^0/, '');
      var lens = FSS_LEN[c];
      var okLen = lens ? lens.indexOf(n.length) >= 0 : n.length >= 7 && n.length <= 12;
      if (!okLen || /^(\d)\1+$/.test(n) || (c === '1' && !/^[2-9]\d\d[2-9]/.test(n))) return { ok: false, error: 'Número internacional inválido. Use +código do país e o número completo.' };
      return { ok: true, cc: c, num: n, full: '+' + c + ' ' + n, e164: '+' + c + n };
    }
  }
  d = d.replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') d = d.slice(2).replace(/^0+/, '');
  if (d.length === 10 && FSS_DDD.indexOf(d.slice(0, 2)) >= 0 && /^[6-9]/.test(d.charAt(2))) d = d.slice(0, 2) + '9' + d.slice(2);
  if (d.length !== 11) return { ok: false, error: BAD };
  if (FSS_DDD.indexOf(d.slice(0, 2)) < 0 || d.charAt(0) === '0') return { ok: false, error: 'DDD inválido. Confira o código da sua cidade.' };
  if (d.charAt(2) !== '9') return { ok: false, error: 'Use um celular com WhatsApp: depois do DDD ele começa com 9.' };
  var t = d.slice(3);
  if (/^(\d)\1+$/.test(t) || /^(\d)\1{5}/.test(t) || '0123456789012345678'.indexOf(t) >= 0 || '9876543210987654321'.indexOf(t) >= 0)
    return { ok: false, error: 'Esse número não parece real. Digite o seu WhatsApp.' };
  return { ok: true, cc: '55', num: d, full: '+55 ' + d, e164: '+55' + d };
}

/* "+CC NUMERO" normalizado, ou '' quando o número não passa na regra */
function formatWhatsappE164(telefoneBruto) {
  const r = fssPhone(telefoneBruto);
  return r.ok ? r.full : '';
}

function postLeadToApi(payload) {
  const body = JSON.stringify(payload);
  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/lead', blob)) return;
  } catch (_) { /* cai pro fetch */ }
  try {
    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}

// Lead form modal
const THANK_YOU_URL = 'https://links.fullsalessystem.com/espaco-fullsales-obg';

/* Segundo destino do lead (dual-write): API FSS Evento.
   Só dispara no submit final (não na fase 1) — a spec deles é single-shot.
   Falha não bloqueia o fluxo: nosso backend (Supabase + GHL) segue como fonte primária. */
const FSS_EVENTO_API = 'https://evento.fullsalessystem.com.br/api/leads';
const CARGO_TO_PAPEL = {
  'dono-evento': 'dono_evento',
  agencia: 'agencia',
  assessoria: 'assessor_eventos',
  outro: 'outro',
};
const leadModal = document.getElementById('lead-modal');
const leadForm = document.getElementById('lead-form');

// Open / close modal
if (leadModal) {
  /* Abre via atributo [open] (dialog não-modal), sem showModal()/top-layer.
     No Safari do iPhone o top-layer nativo renderizava o conteúdo do <dialog>
     como tela preta — o overlay fixo comum (CSS) funciona em todos os motores. */
  const openModal = () => {
    leadModal.setAttribute('open', '');
    document.body.classList.add('modal-open');
  };
  const closeModal = () => {
    leadModal.removeAttribute('open');
    document.body.classList.remove('modal-open');
  };

  document.querySelectorAll('[data-open-modal]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  leadModal.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  // Fecha ao tocar no escurecimento (fora do card)
  leadModal.addEventListener('click', (e) => {
    if (e.target === leadModal) closeModal();
  });
  // Fecha com Esc (top-layer nativo não está mais em uso)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && leadModal.hasAttribute('open')) closeModal();
  });
}

if (leadForm) {
  const TOTAL_STEPS = 3;
  const telInput = document.getElementById('lf-telefone');
  const igInput = document.getElementById('lf-instagram');
  const statusEl = document.getElementById('lf-status');
  const resultEl = document.getElementById('lead-result');
  const resultTitle = document.getElementById('lead-result-title');
  const resultMsg = document.getElementById('lead-result-msg');
  const fillEl = document.getElementById('qz-fill');
  const counterEl = document.getElementById('qz-counter');
  const stepEls = Array.from(leadForm.querySelectorAll('.qz-step'));
  const progressItems = document.querySelectorAll('.qz-steps li');

  // Respostas: perfil (botões-radio do step 1) + eventos do step 2
  const answers = { cargo: '', eventos: '' };
  let currentStep = 1;

  function showStep(n) {
    currentStep = n;
    stepEls.forEach((el) => {
      const isActive = Number(el.dataset.step) === n;
      el.hidden = !isActive;
    });
    const pct = Math.round((n / TOTAL_STEPS) * 100);
    if (fillEl) fillEl.style.width = pct + '%';
    if (counterEl) counterEl.textContent = `Passo ${n} de ${TOTAL_STEPS}`;
    progressItems.forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('is-active', s === n);
      li.classList.toggle('is-done', s < n);
    });
    // No desktop, já deixa o cursor pronto no primeiro campo do passo
    if (window.matchMedia('(pointer: fine)').matches) {
      const focusEl = n === 2 ? document.getElementById('lf-nome') : n === 3 ? igInput : null;
      if (focusEl) setTimeout(() => focusEl.focus({ preventScroll: true }), 200);
    }
  }

  function selectOption(field, value) {
    answers[field] = value;
    leadForm.querySelectorAll(`.qz-opt[data-field="${field}"]`).forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.value === value);
    });
  }

  function trackStep(field, value) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'lead_step_answer',
      step: currentStep,
      field,
      value,
    });
  }

  // Auto-avanço no step 1 ao clicar. No step 2, o clique em Sim/Não
  // só marca a resposta — o submit final é pelo botão PEDIR COTAÇÃO.
  leadForm.addEventListener('click', (e) => {
    const back = e.target.closest('[data-qz-back]');
    if (back) {
      e.preventDefault();
      if (currentStep > 1) showStep(currentStep - 1);
      return;
    }
    const next = e.target.closest('[data-qz-next]');
    if (next) {
      e.preventDefault();
      // Passo do contato: valida e CAPTURA o lead antes da etapa do Instagram —
      // quem abandonar no Instagram já está no CRM.
      if (currentStep === 2) {
        if (!validarContato()) return;
        capturarLead();
        showStep(3);
      }
      return;
    }
    const btn = e.target.closest('.qz-opt');
    if (!btn) return;
    const field = btn.dataset.field;
    const value = btn.dataset.value;
    if (!field || !value) return;

    selectOption(field, value);
    trackStep(field, value);

    if (field === 'cargo') {
      const nextIdx = Math.min(currentStep + 1, TOTAL_STEPS);
      setTimeout(() => showStep(nextIdx), 240);
    }
  });

  // Enter nos campos do contato avança pro Instagram (sem submeter o form inteiro)
  ['lf-nome', 'lf-email', 'lf-telefone'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        leadForm.querySelector('[data-qz-next]')?.click();
      }
    });
  });

  // Máscara telefone: (11) 99999-9999.
  // Primeiro caractere "+": modo internacional livre — sem máscara,
  // aceita só +, dígitos e espaços (regra única dos funis FSS).
  telInput?.addEventListener('input', () => {
    const raw = telInput.value.replace(/^\s+/, '');
    if (raw.charAt(0) === '+') {
      const clean = '+' + raw.slice(1).replace(/[^\d ]/g, '').replace(/ {2,}/g, ' ');
      if (clean !== telInput.value) telInput.value = clean;
      return;
    }
    /* "0" de operadora e "55" digitado na frente saem antes de cortar em 11 */
    let v = raw.replace(/\D/g, '').replace(/^0+/, '');
    if (v.length > 11 && v.slice(0, 2) === '55') v = v.slice(2).replace(/^0+/, '');
    v = v.slice(0, 11);
    if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
    else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    else if (v.length > 0) v = `(${v}`;
    telInput.value = v;
  });

  function flashStatus(msg, fieldEl) {
    const el = currentStep === 3 ? document.getElementById('lf-status-ig') : statusEl;
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-error');
    clearTimeout(flashStatus.timer);
    flashStatus.timer = setTimeout(() => el.classList.remove('is-error'), 4000);
    if (fieldEl) {
      fieldEl.classList.add('is-invalid');
      const clear = () => fieldEl.classList.remove('is-invalid');
      fieldEl.addEventListener('input', clear, { once: true });
      fieldEl.addEventListener('click', clear, { once: true });
      if (typeof fieldEl.focus === 'function' && fieldEl.tagName === 'INPUT') fieldEl.focus();
    }
  }

  // Validação do passo de contato (2)
  function validarContato() {
    const nome = document.getElementById('lf-nome').value.trim();
    const email = document.getElementById('lf-email').value.trim().toLowerCase();
    const telefone = document.getElementById('lf-telefone').value.trim();
    if (!answers.cargo) { showStep(1); flashStatus('Selecione o seu papel no evento.'); return false; }
    if (nome.length < 2) { flashStatus('Preencha o seu nome.', document.getElementById('lf-nome')); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { flashStatus('E-mail inválido.', document.getElementById('lf-email')); return false; }
    const tel = fssPhone(telefone);
    if (!tel.ok) { flashStatus(tel.error, telInput); return false; }
    if (!answers.eventos) { flashStatus('Escolha Sim ou Não em "faz eventos presenciais?".', leadForm.querySelector('.qz-radio-row')); return false; }
    return true;
  }

  /* ── CAPTURA EM DUAS FASES ──
     Fase 1: ao concluir o contato (antes da etapa do Instagram) o lead
     vai INTEIRO pro backend — abandono no Instagram não perde o lead.
     Fase 2 (no submit): só atualiza contato/linha com o @. */
  let leadCapturado = null;

  function capturarLead() {
    const nome = document.getElementById('lf-nome').value.trim();
    const email = document.getElementById('lf-email').value.trim().toLowerCase();
    const whatsapp = formatWhatsappE164(document.getElementById('lf-telefone').value.trim());
    if (leadCapturado && leadCapturado.email === email && leadCapturado.whatsapp === whatsapp) return;

    const submissionId = generateSubmissionId();
    const submittedAt = new Date().toISOString();
    leadCapturado = { submission_id: submissionId, submitted_at: submittedAt, email, whatsapp };

    /* eventID dos disparos Meta que o GTM faz a partir deste push (ver stub
       do fbq no index.html) = o submission_id que vai pro /api/lead, que manda
       os mesmos eventos pela Conversions API. */
    window.__fssEventId = submissionId;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'lead_form_submit',
      cargo: answers.cargo,
      qualificacao: 'qualificado',
      eventos_presenciais: answers.eventos,
    });

    postLeadToApi({
      submission_id: submissionId,
      submitted_at: submittedAt,
      page: location.href,
      nome,
      email,
      whatsapp,
      cargo: answers.cargo,
      eventos: answers.eventos,
      instagram: '',
      ...getStoredUtms(),
    });
  }

  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const nome = document.getElementById('lf-nome').value.trim();
    const email = document.getElementById('lf-email').value.trim().toLowerCase();

    // Segurança: se por algum caminho o lead não foi capturado no passo 2, volta lá
    if (!leadCapturado) { showStep(2); return flashStatus('Confirme seus dados de contato.'); }

    const instagram = (igInput?.value || '').trim();
    if (!instagram) return flashStatus('Informe o @ do Instagram.', igInput);

    trackStep('instagram', 'preenchido');
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'lead_instagram_complete' });

    // Fase 2 — atualiza o contato no GHL e a linha no Supabase com o @
    try {
      fetch('/api/lead-instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: leadCapturado.submission_id,
          submitted_at: leadCapturado.submitted_at,
          page: location.href,
          email: leadCapturado.email,
          whatsapp: leadCapturado.whatsapp,
          instagram,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}

    // Dual-write: dispara pra API FSS Evento em paralelo.
    // Falha silenciosa — nosso backend já capturou o lead na fase 1.
    try {
      const hpEl = leadForm.querySelector('input[name="_hp"]');
      fetch(FSS_EVENTO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          papel: CARGO_TO_PAPEL[answers.cargo] || 'outro',
          nome,
          email,
          telefone: leadCapturado.whatsapp,
          instagram,
          _hp: hpEl ? hpEl.value : '',
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}

    // (o lead já foi capturado na fase 1, ao concluir o contato)

    // Substitui o form pela tela de sucesso e depois leva pra página de obrigado
    leadForm.hidden = true;
    if (resultEl) resultEl.hidden = false;

    if (resultTitle) resultTitle.textContent = 'Recebemos as suas respostas!';
    if (resultMsg) {
      resultMsg.textContent =
        'Nosso time comercial vai entrar em contato com você em breve para montar a sua cotação.';
    }

    /* Redireciona sozinho. O delay dá tempo do GTM disparar o form_submit;
       os fetches acima usam keepalive, então seguem mesmo com a navegação. */
    setTimeout(() => { window.location.href = THANK_YOU_URL; }, 1200);
  });

  // Inicializa no step 1
  showStep(1);
}

/* ── Lightbox da planta ──────────────────────────────────────────
   Overlay fixo comum (sem top-layer nativo, mesma decisão do modal
   por causa do Safari iOS). Abre no clique da imagem, fecha com
   clique fora / Esc / botão. Foco é movido pro botão de fechar e
   devolvido ao gatilho ao fechar; Tab fica preso dentro do overlay. */
(function initPlantaLightbox() {
  const lightbox = document.getElementById('planta-lightbox');
  const triggers = document.querySelectorAll('[data-open-lightbox]');
  if (!lightbox || !triggers.length) return;

  const closeBtn = lightbox.querySelector('[data-close-lightbox]');
  let lastTrigger = null;

  const openLightbox = (trigger) => {
    lastTrigger = trigger || null;
    lightbox.hidden = false;
    document.body.classList.add('modal-open');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  };

  const closeLightbox = () => {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastTrigger && typeof lastTrigger.focus === 'function') {
      lastTrigger.focus({ preventScroll: true });
    }
    lastTrigger = null;
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(trigger);
    });
  });

  closeBtn?.addEventListener('click', closeLightbox);

  // Clique no escurecimento (fora da imagem) fecha
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === 'Tab') {
      // Único elemento focável é o botão de fechar — prende o foco nele
      e.preventDefault();
      closeBtn?.focus({ preventScroll: true });
    }
  });
})();
