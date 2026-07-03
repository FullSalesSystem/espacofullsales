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

// Subtle reveal-on-scroll for sections
const revealTargets = document.querySelectorAll(
  '.section-head, .tour-item, .reason-card, .hero-meta li, .map-wrap, .cta-inner'
);

if ('IntersectionObserver' in window && revealTargets.length) {
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

// Labels legíveis pros slugs usados nos <option value="">
const SLUG_LABELS = {
  segmento: {
    servico: 'Serviço', varejo: 'Varejo', mentoria: 'Mentoria',
    industria: 'Indústria', ecommerce: 'E-commerce', educacao: 'Educação',
    imobiliaria: 'Imobiliária', financas: 'Finanças',
    franquia: 'Franquia/Franchising', saude: 'Saúde', saas: 'SAAS',
    telecom: 'Telecom', turismo: 'Turismo', outro: 'Outro',
  },
  cargo: {
    'socio-empresario': 'Sócio/Empresário',
    'gerente-lider': 'Gerente/Líder',
    'colaborador-funcionario': 'Colaborador/Funcionário',
    'prestador-freelancer': 'Prestador de serviço/Freelancer',
  },
  faturamento: {
    'abaixo-30k': 'Abaixo de R$30 mil',
    '30k-50k': 'Entre R$30 mil e R$50 mil',
    '50k-100k': 'Entre R$50 mil e R$100 mil',
    '100k-300k': 'Entre R$100 mil e R$300 mil',
    '300k-500k': 'Entre R$300 mil e R$500 mil',
    '500k-1m': 'Entre R$500 mil e R$1 milhão',
    'acima-1m': 'Acima de R$1 milhão',
  },
  eventos: { sim: 'Sim', nao: 'Não' },
};

function label(field, slug) {
  return (SLUG_LABELS[field] && SLUG_LABELS[field][slug]) || slug || '';
}

function formatWhatsappE164BR(telefoneBruto) {
  /* Form usa máscara "(11) 99999-9999"; back valida `^\+\d{1,3}\s\d{8,15}$`.
     Assume BR: prefixa "+55 " e manda só dígitos. */
  const digits = String(telefoneBruto || '').replace(/\D/g, '');
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

// Lead form modal -> WhatsApp
const WHATSAPP_NUMBER = '5511910458564';
const leadModal = document.getElementById('lead-modal');
const leadForm = document.getElementById('lead-form');

// Open / close modal
if (leadModal) {
  const openModal = () => {
    if (typeof leadModal.showModal === 'function') leadModal.showModal();
    else leadModal.setAttribute('open', '');
    document.body.classList.add('modal-open');
  };
  const closeModal = () => {
    if (typeof leadModal.close === 'function') leadModal.close();
    else leadModal.removeAttribute('open');
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

  // Close on backdrop click and on native dialog close (Esc)
  leadModal.addEventListener('click', (e) => {
    if (e.target === leadModal) closeModal();
  });
  leadModal.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
  });
}

if (leadForm) {
  const TOTAL_STEPS = 4;
  const telInput = document.getElementById('lf-telefone');
  const statusEl = document.getElementById('lf-status');
  const resultEl = document.getElementById('lead-result');
  const resultTitle = document.getElementById('lead-result-title');
  const resultMsg = document.getElementById('lead-result-msg');
  const resultWa = document.getElementById('lead-result-wa');
  const fillEl = document.getElementById('qz-fill');
  const counterEl = document.getElementById('qz-counter');
  const backBar = document.getElementById('qz-back-bar');
  const stepEls = Array.from(leadForm.querySelectorAll('.qz-step'));
  const progressItems = document.querySelectorAll('.qz-steps li');

  // Respostas coletadas pelos botões-radio dos steps 1-3 + eventos do step 4
  const answers = { segmento: '', cargo: '', faturamento: '', eventos: '', qual: '' };
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
    // Voltar aparece nos steps 2 e 3 (step 1 sem back, step 4 tem back próprio)
    if (backBar) backBar.hidden = !(n === 2 || n === 3);
  }

  function selectOption(field, value, qual) {
    answers[field] = value;
    if (field === 'faturamento') answers.qual = qual || '';
    leadForm.querySelectorAll(`.qz-opt[data-field="${field}"]`).forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.value === value);
    });
  }

  function trackStep(field, value, qual) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'lead_step_answer',
      step: currentStep,
      field,
      value,
      qualificacao: field === 'faturamento' ? (qual || '') : undefined,
    });
  }

  // Auto-avanço nas 3 primeiras etapas ao clicar. No step 4, o clique em Sim/Não
  // só marca a resposta — o submit final é pelo botão CONTINUAR.
  leadForm.addEventListener('click', (e) => {
    const back = e.target.closest('[data-qz-back]');
    if (back) {
      e.preventDefault();
      if (currentStep > 1) showStep(currentStep - 1);
      return;
    }
    const btn = e.target.closest('.qz-opt');
    if (!btn) return;
    const field = btn.dataset.field;
    const value = btn.dataset.value;
    const qual = btn.dataset.qual;
    if (!field || !value) return;

    selectOption(field, value, qual);
    trackStep(field, value, qual);

    if (field === 'segmento' || field === 'cargo' || field === 'faturamento') {
      const nextIdx = Math.min(currentStep + 1, TOTAL_STEPS);
      setTimeout(() => showStep(nextIdx), 240);
    }
  });

  // Máscara telefone: (11) 99999-9999
  telInput?.addEventListener('input', () => {
    let v = telInput.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
    else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    else if (v.length > 0) v = `(${v}`;
    telInput.value = v;
  });

  function flashStatus(msg) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.add('is-error');
    setTimeout(() => statusEl.classList.remove('is-error'), 2000);
  }

  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const nome = document.getElementById('lf-nome').value.trim();
    const email = document.getElementById('lf-email').value.trim().toLowerCase();
    const telefone = document.getElementById('lf-telefone').value.trim();

    // Sanity nos steps anteriores
    if (!answers.segmento) { showStep(1); return flashStatus('Selecione o segmento.'); }
    if (!answers.cargo) { showStep(2); return flashStatus('Selecione o cargo.'); }
    if (!answers.faturamento) { showStep(3); return flashStatus('Selecione o faturamento.'); }

    // Validação do step 4
    if (nome.length < 2) return flashStatus('Preencha o seu nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return flashStatus('E-mail inválido.');
    if (telefone.replace(/\D/g, '').length < 10) return flashStatus('Telefone inválido.');
    if (!answers.eventos) return flashStatus('Escolha Sim ou Não em "faz eventos presenciais?".');

    const isQualified = answers.qual === 'qualificado';

    const waLines = [
      'Olá! Quero saber mais sobre o Espaço Full Sales para um evento.',
      '',
      `*Nome:* ${nome}`,
      `*E-mail:* ${email}`,
      `*Telefone:* ${telefone}`,
      `*Segmento:* ${label('segmento', answers.segmento)}`,
      `*Cargo:* ${label('cargo', answers.cargo)}`,
      `*Faturamento:* ${label('faturamento', answers.faturamento)}`,
      `*Faz eventos presenciais:* ${label('eventos', answers.eventos)}`,
    ];

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'lead_form_submit',
      segmento: answers.segmento,
      cargo: answers.cargo,
      faturamento: answers.faturamento,
      qualificacao: answers.qual,
      eventos_presenciais: answers.eventos,
    });

    // Backend — Supabase [Leads] FAP06 + GHL (10.Eventos, Marina/Ricardo 60/40)
    postLeadToApi({
      submission_id: generateSubmissionId(),
      submitted_at: new Date().toISOString(),
      page: location.href,
      nome,
      email,
      whatsapp: formatWhatsappE164BR(telefone),
      cargo: answers.cargo,
      segmento: answers.segmento,
      receita: answers.faturamento,
      eventos: answers.eventos,
      ...getStoredUtms(),
    });

    // Substitui o form pela tela de sucesso
    leadForm.hidden = true;
    if (backBar) backBar.hidden = true;
    if (resultEl) resultEl.hidden = false;

    if (isQualified) {
      if (resultTitle) resultTitle.textContent = 'Recebemos as suas respostas!';
      if (resultMsg) {
        resultMsg.textContent =
          'Se você quer agilizar o seu atendimento, entre em contato pelo WhatsApp.';
      }
      if (resultWa) {
        resultWa.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waLines.join('\n'))}`;
        resultWa.hidden = false;
      }
    } else {
      if (resultTitle) resultTitle.textContent = 'Obrigado!';
      if (resultMsg) {
        resultMsg.textContent =
          'Em breve um dos nossos representantes entrará em contato para organizarmos o seu evento.';
      }
      if (resultWa) resultWa.hidden = true;
    }
  });

  // Inicializa no step 1
  showStep(1);
}
