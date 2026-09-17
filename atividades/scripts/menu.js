/* ══════════════════════════════════════════════════════════════
   ACTIVITY MENU (/atividades/) and LEVEL SELECTION (/atividades/<slug>/)
   The cards are static HTML (good for SEO); this script adds the
   illustrations and the exit animation.
══════════════════════════════════════════════════════════════ */

function enhanceActivityMenu(grid) {
  grid.querySelectorAll('.activity-card[data-activity]').forEach((card) => {
    const activity = ACTIVITIES[card.dataset.activity];
    if (!activity) return;

    card.querySelector(".ac-visual").innerHTML = activity.visual;
    attachExitNavigation(card);
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
}

/* ─── Init ──────────────────────────────────────────────────── */

(() => {
  const menu = document.getElementById('activities-grid');
  if (menu) enhanceActivityMenu(menu);

  const levels = document.getElementById('levels-grid');
  if (levels) enhanceLevelSelect(levels);
})();
