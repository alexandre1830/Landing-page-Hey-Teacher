// ===== Scroll reveal (não depende de partials) =====
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

const observeReveals = (root = document) => {
  root.querySelectorAll('.reveal, .reveal-right, .stagger').forEach(el => {
    revealObserver.observe(el);
  });
};
observeReveals();

// ===== FAQ accordion — only one open at a time (não depende de partials) =====
const initFaq = (root = document) => {
  const faqItems = root.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    if (item.dataset.faqBound) return;
    item.dataset.faqBound = '1';
    item.addEventListener('toggle', () => {
      if (item.open) {
        faqItems.forEach(other => {
          if (other !== item) other.open = false;
        });
      }
    });
  });
};
initFaq();

// ===== Smooth scroll com offset (cobre âncoras da própria página) =====
const initSmoothScroll = (root = document) => {
  root.querySelectorAll('a[href^="#"]').forEach(anchor => {
    if (anchor.dataset.scrollBound) return;
    anchor.dataset.scrollBound = '1';
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href');
      if (id.length > 1) {
        const target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          const top = target.getBoundingClientRect().top + window.scrollY - 70;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    });
  });
};
initSmoothScroll();

// ===== Coisas que dependem do nav/footer injetados via includes.js =====
const initPartialsDependent = () => {
  // Ano dinâmico no footer
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Sombra no nav ao rolar
  const nav = document.getElementById('nav');
  if (nav) {
    const applyShadow = () => {
      nav.style.boxShadow = window.scrollY > 20
        ? '0 10px 30px -20px rgba(3,45,111,.25)'
        : 'none';
    };
    applyShadow();
    window.addEventListener('scroll', applyShadow, { passive: true });
  }

  // Re-observar reveals e re-bindar smooth scroll caso o partial tenha trazido âncoras
  observeReveals();
  initSmoothScroll();
};

document.addEventListener('partials:loaded', initPartialsDependent);
// Fallback: se a página não usa partials, ainda assim tentar inicializar
if (!document.querySelector('[data-include]')) {
  initPartialsDependent();
}

// ===== Hero entry sequence (home — Manifesto Edição 2026) =====
const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const initHeroIntro = () => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  // Com prefers-reduced-motion o CSS força tudo visível; ainda aplicamos as
  // classes para que estados dependentes (cursor, highlight) entrem nos
  // mesmos seletores .hero.in-view-X que a versão animada usa.
  if (prefersReducedMotion()) {
    ['in-view-1','in-view-2','in-view-3','in-view-4','in-view-5','in-view-6','in-view-7']
      .forEach(c => hero.classList.add(c));
    return;
  }
  const steps = [
    { delay: 0,    cls: 'in-view-1' }, // eyebrow
    { delay: 350,  cls: 'in-view-2' }, // headline linha 1
    { delay: 850,  cls: 'in-view-3' }, // strike-through em "estudar"
    { delay: 1250, cls: 'in-view-4' }, // headline linha 2
    { delay: 1450, cls: 'in-view-5' }, // highlight em "usá-lo"
    { delay: 1900, cls: 'in-view-6' }, // cursor piscante
    { delay: 2000, cls: 'in-view-7' }, // divisor + bloco inferior + rotador
  ];
  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      steps.forEach(({ delay, cls }) =>
        setTimeout(() => hero.classList.add(cls), delay)
      );
      heroObserver.unobserve(hero);
    });
  }, { threshold: 0.15 });
  heroObserver.observe(hero);
};
initHeroIntro();

// ===== WhatsApp wave — chamada de atenção uma única vez por sessão =====
const initHeroWave = () => {
  const wa = document.querySelector('.hero-cta-wa');
  if (!wa || prefersReducedMotion()) return;
  const waObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      // Espera a sequência de entrada estabilizar antes do wave
      setTimeout(() => {
        wa.classList.add('hero-wave');
        // Remove a classe após a animação para liberar a propriedade
        setTimeout(() => wa.classList.remove('hero-wave'), 600);
      }, 2400);
      waObserver.unobserve(wa);
    });
  }, { threshold: 0.5 });
  waObserver.observe(wa);
};
initHeroWave();
