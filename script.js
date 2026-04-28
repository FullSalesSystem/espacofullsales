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
  const prev = carousel.querySelector('.carousel-prev');
  const next = carousel.querySelector('.carousel-next');
  const dotsBox = carousel.querySelector('.carousel-dots');

  if (!track || slides.length === 0) return;

  if (slides.length <= 1) {
    prev?.remove();
    next?.remove();
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
    prev.disabled = idx === 0;
    next.disabled = idx === slides.length - 1;
  };
  update();

  let raf;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  });

  prev.addEventListener('click', () => {
    track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    pauseTemporarily();
  });
  next.addEventListener('click', () => {
    track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
    pauseTemporarily();
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
  '.section-head, .tour-item, .features li, .hero-meta li, .map-wrap, .cta-inner'
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
