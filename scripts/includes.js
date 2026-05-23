(async function loadPartials() {
  const slots = document.querySelectorAll('[data-include]');
  if (!slots.length) return;

  const cache = {};
  const fetchPartial = async (name) => {
    if (cache[name]) return cache[name];
    try {
      const res = await fetch('/partials/' + name + '.html');
      if (!res.ok) return '';
      cache[name] = await res.text();
      return cache[name];
    } catch (err) {
      return '';
    }
  };

  await Promise.all(Array.from(slots).map(async (slot) => {
    const name = slot.getAttribute('data-include');
    const html = await fetchPartial(name);
    if (html) slot.outerHTML = html;
  }));

  // Highlight active nav link based on current path
  const current = window.location.pathname.replace(/\/index\.html$/, '/') || '/';
  document.querySelectorAll('.nav ul a').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    const normalized = href.endsWith('/') ? href : href + (href.includes('#') ? '' : '/');
    if (normalized === current || (href !== '/' && current.startsWith(href))) {
      a.classList.add('active');
    }
  });

  document.dispatchEvent(new CustomEvent('partials:loaded'));
})();
