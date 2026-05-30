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

// ===== Toggle do menu hambúrguer (mobile) =====
const initNavToggle = () => {
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('nav-toggle');
  if (!nav || !toggle || toggle.dataset.navBound) return;
  toggle.dataset.navBound = '1';

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    document.body.classList.toggle('nav-open', open);
  };

  toggle.addEventListener('click', () => {
    setOpen(!nav.classList.contains('is-open'));
  });

  // Fecha ao clicar em qualquer link do menu
  nav.querySelectorAll('ul a').forEach((a) => {
    a.addEventListener('click', () => setOpen(false));
  });

  // Fecha ao clicar na overlay escura
  const overlay = document.getElementById('nav-overlay');
  if (overlay) overlay.addEventListener('click', () => setOpen(false));

  // Fecha ao apertar Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) setOpen(false);
  });

  // Fecha automaticamente se redimensionar para desktop
  const mq = window.matchMedia('(min-width: 900px)');
  const onMqChange = (e) => { if (e.matches) setOpen(false); };
  if (mq.addEventListener) mq.addEventListener('change', onMqChange);
  else if (mq.addListener) mq.addListener(onMqChange); // fallback Safari antigo
};

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

  // Menu hambúrguer mobile
  initNavToggle();

  // Re-observar reveals e re-bindar smooth scroll caso o partial tenha trazido âncoras
  observeReveals();
  initSmoothScroll();
};

document.addEventListener('partials:loaded', initPartialsDependent);
// Fallback: se a página não usa partials, ainda assim tentar inicializar
if (!document.querySelector('[data-include]')) {
  initPartialsDependent();
}

// ===== Hero entry sequence (home) =====
const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const initHeroIntro = () => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  // Com prefers-reduced-motion o CSS força tudo visível; aplicamos as classes
  // para que estados dependentes (cursor, highlight) acendam.
  if (prefersReducedMotion()) {
    ['in-view-1','in-view-2','in-view-3','in-view-4','in-view-5','in-view-6']
      .forEach(c => hero.classList.add(c));
    return;
  }
  const steps = [
    { delay: 0,    cls: 'in-view-1' }, // headline linha 1
    { delay: 500,  cls: 'in-view-2' }, // strike-through em "na teoria"
    { delay: 900,  cls: 'in-view-3' }, // headline linha 2
    { delay: 1100, cls: 'in-view-4' }, // highlight em "na prática"
    { delay: 1550, cls: 'in-view-5' }, // cursor piscante
    { delay: 1650, cls: 'in-view-6' }, // divisor + bloco inferior
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

// ===== Rotador de verbos (troca de textContent — largura natural) =====
const initHeroVerbRotator = () => {
  const verbEl = document.querySelector('.hero-verb-active');
  if (!verbEl) return;
  if (prefersReducedMotion()) return; // fica fixo em "falar"
  const verbs = ['falar', 'ouvir', 'ler', 'escrever'];
  let i = 0;
  const stepMs = 2400;     // tempo de exibição de cada verbo
  const outMs = 220;       // duração do fade-out
  const cycle = () => {
    verbEl.classList.add('is-out');
    setTimeout(() => {
      i = (i + 1) % verbs.length;
      verbEl.textContent = verbs[i];
      verbEl.classList.remove('is-out');
      verbEl.classList.add('is-in-prep');
      // Force reflow para que o estado in-prep seja aplicado antes de remover
      void verbEl.offsetWidth;
      verbEl.classList.remove('is-in-prep');
    }, outMs);
  };
  // Começa o ciclo só depois que a sequência de entrada terminar
  setTimeout(() => {
    cycle();
    setInterval(cycle, stepMs);
  }, 2100);
};
initHeroVerbRotator();
