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

/* ── Telefone internacional (modo "+") ──────────────────────────
   Primeiro caractere "+" no campo = modo internacional livre (sem
   máscara BR). Código do país (ITU): 1 e 7 têm 1 dígito; conjunto
   fechado de 2 dígitos; o resto tem 3. */
const CC_1DIGIT = new Set(['1', '7']);
const CC_2DIGIT = new Set([
  '20', '27', '30', '31', '32', '33', '34', '36', '39',
  '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86',
  '90', '91', '92', '93', '94', '95', '98',
]);

/* "+351 912345678" | "+351912345678" -> "+351 912345678"; null se inválido
   (número sem o código do país precisa ter 8-15 dígitos). */
function normalizeIntlPhone(raw) {
  const v = String(raw || '').trim();
  if (v.charAt(0) !== '+' || !/^\+[\d\s]+$/.test(v)) return null;
  const digits = v.slice(1).replace(/\D/g, '');
  let cc;
  if (CC_1DIGIT.has(digits.slice(0, 1))) cc = digits.slice(0, 1);
  else if (CC_2DIGIT.has(digits.slice(0, 2))) cc = digits.slice(0, 2);
  else cc = digits.slice(0, 3);
  const num = digits.slice(cc.length);
  if (!cc || num.length < 8 || num.length > 15) return null;
  return `+${cc} ${num}`;
}

function formatWhatsappE164(telefoneBruto) {
  /* Back valida `^\+\d{1,3}\s\d{8,15}$`.
     Modo internacional ("+" primeiro): "+CC NUMERO".
     Modo BR (padrão, máscara "(11) 99999-9999"): prefixa "+55 ". */
  const raw = String(telefoneBruto || '').trim();
  if (raw.charAt(0) === '+') return normalizeIntlPhone(raw) || '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return '';
  return `+55 ${digits}`;
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
    let v = raw.replace(/\D/g, '').slice(0, 11);
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
    if (telefone.charAt(0) === '+') {
      /* modo internacional: +código do país + número de 8-15 dígitos */
      if (!normalizeIntlPhone(telefone)) { flashStatus('Telefone internacional inválido. Formato: +351 912345678', telInput); return false; }
    } else if (telefone.replace(/\D/g, '').length < 10) { flashStatus('Telefone inválido.', telInput); return false; }
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

    // Substitui o form pela tela de sucesso — o lead fica na página,
    // sem redirect automático; o contato parte do time comercial.
    leadForm.hidden = true;
    if (resultEl) resultEl.hidden = false;

    if (resultTitle) resultTitle.textContent = 'Recebemos as suas respostas!';
    if (resultMsg) {
      resultMsg.textContent =
        'Nosso time comercial vai entrar em contato com você em breve para montar a sua cotação.';
    }
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
