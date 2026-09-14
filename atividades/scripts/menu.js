/* ══════════════════════════════════════════════════════════════
   ACTIVITY MENU (/atividades/) and LEVEL SELECTION (/atividades/<slug>/)
   The cards are static HTML (good for SEO); this script adds the
   illustrations, the content counts and the exit animation.
══════════════════════════════════════════════════════════════ */

// Content counts are a nice-to-have: fill them in if the data loads
function fillCount(activity, apply) {
  fetch(activity.dataUrl)
    .then(res => (res.ok ? res.json() : Promise.reject()))
    .then(apply)
    .catch(() => {});
}

function enhanceActivityMenu(grid) {
  grid.querySelectorAll('.activity-card[data-activity]').forEach((card) => {
    const activity = ACTIVITIES[card.dataset.activity];
    if (!activity) return;

    card.querySelector('.ac-visual').innerHTML = activity.visual;
    attachExitNavigation(card);
    fillCount(activity, (data) => {
      card.querySelector('.ac-meta').textContent = activity.totalMeta(data);
    });
  });
}

function enhanceLevelSelect(grid) {
  const activity = ACTIVITIES[grid.dataset.activity];
  if (!activity) return;

  const cards = grid.querySelectorAll('.level-card[data-level]');
  cards.forEach((card, i) => {
    attachExitNavigation(card);
    revealStaggered(card, i);
  });

  fillCount(activity, (data) => {
    cards.forEach((card) => {
      const ld = data.levels[card.dataset.level];
      if (ld) card.querySelector('.lc-meta').textContent = activity.levelMeta(ld);
    });
  });
}

/* ─── Init ──────────────────────────────────────────────────── */

(() => {
  const menu = document.getElementById('activities-grid');
  if (menu) enhanceActivityMenu(menu);

  const levels = document.getElementById('levels-grid');
  if (levels) enhanceLevelSelect(levels);
})();
