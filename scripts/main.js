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
