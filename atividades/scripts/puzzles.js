/* Shared building blocks for theme-based puzzle activities
   (crosswords, word search, hangman, quiz show) — requires scripts/common.js

   Page contract (see /atividades/palavras-cruzadas/jogar/index.html):
   header ids   pz-back, pz-back-label, level-badge, level-name, progress-counter, reset-btn
   themes view  pz-themes, pz-themes-sub, pz-themes-grid
   puzzle view  pz-puzzle, pz-toast
   dialog       pz-modal, pz-modal-text, pz-modal-themes, pz-modal-close, pz-modal-next
*/

/* ─── Word helpers ──────────────────────────────────────────── */

// "Post office" -> "POSTOFFICE"
function toGridLetters(answer) {
  return answer.toUpperCase().replace(/[^A-Z]/g, '');
}

// "Post office" -> "4,6" · "side-effect" -> "4-6"
function enumeration(answer) {
  return answer.trim().replace(/[A-Za-z]+/g, m => m.length).replace(/\s+/g, ',');
}

/* ─── Progress storage (localStorage) ───────────────────────── */

// Saved states carry the layout signature ("sig") so progress from an
// older version of a puzzle is ignored, plus "progress" and "complete"
// for the theme cards.
function createProgressStore(storageKey) {
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch { return {}; }
  }

  function saveAll(all) {
    try { localStorage.setItem(storageKey, JSON.stringify(all)); }
    catch { /* storage unavailable — progress just won't persist */ }
  }

  return {
    get(puzzleId, sig) {
      const saved = loadAll()[puzzleId];
      return saved && saved.sig === sig ? saved : null;
    },
    set(puzzleId, state) {
      const all = loadAll();
      if (state) all[puzzleId] = state;
      else delete all[puzzleId];
      saveAll(all);
    }
  };
}

function puzzleUrl(activity, level, puzzleId) {
  const base = activity.levelUrl(level);
  return puzzleId ? `${base}&puzzle=${encodeURIComponent(puzzleId)}` : base;
}

/* ─── Theme selection ───────────────────────────────────────── */

// Default theme card status for word-based puzzles
function wordStatus(model, saved) {
  if (saved && saved.complete) return { cls: 'complete', text: 'Solved' };
  if (saved) return { cls: 'progress', text: `${saved.progress || 0} / ${model.words.length} words` };
  return { cls: '', text: 'Not started' };
}

function renderThemeSelect({ activity, level, levelData, store, buildModel, preview, meta, statusText = wordStatus }) {
  const grid     = document.getElementById('pz-themes-grid');
  const resetBtn = document.getElementById('reset-btn');

  document.getElementById('pz-themes-sub').textContent = levelData.description;
  document.getElementById('pz-themes').hidden = false;

  const puzzles = levelData.puzzles;
  const models = puzzles.map(p => buildModel(p, levelData));

  function renderCards() {
    grid.innerHTML = '';
    let withProgress = 0;

    puzzles.forEach((puzzle, i) => {
      const model = models[i];
      const saved = store.get(puzzle.id, model.sig);
      if (saved) withProgress++;

      const status = statusText(model, saved);

      const card = document.createElement('a');
      card.className = `pz-theme-card ${status.cls}`;
      card.href = puzzleUrl(activity, level, puzzle.id);
      card.style.animationDelay = `${60 + i * 60}ms`;
      card.setAttribute('aria-label', `${puzzle.theme} – ${status.text}`);

      card.innerHTML = `
        <div class="ptc-top">
          <span class="ptc-index">${String(i + 1).padStart(2, '0')}</span>
          <span class="ptc-status ${status.cls}">${status.text}</span>
        </div>
        <div class="ptc-preview">${preview(model, saved)}</div>
        <div class="ptc-title">${escapeHTML(puzzle.theme)}</div>
        <div class="ptc-desc">${escapeHTML(puzzle.description || '')}</div>
        <div class="ptc-meta">${meta(model, levelData)}</div>
      `;

      attachExitNavigation(card);
      grid.appendChild(card);
    });

    resetBtn.disabled = withProgress === 0;
  }

  renderCards();

  resetBtn.addEventListener('click', () => {
    const count = puzzles.filter((p, i) => store.get(p.id, models[i].sig)).length;
    if (!count) return;
    const msg = `This will clear your progress on ${count} puzzle${count > 1 ? 's' : ''} for level ${level}.\n\nContinue?`;
    if (!confirm(msg)) return;
    puzzles.forEach(p => store.set(p.id, null));
    renderCards();
  });
}

/* ─── Toast ─────────────────────────────────────────────────── */

function createToast() {
  const el = document.getElementById('pz-toast');
  let timer = null;
  return function toast(message, tone = '') {
    el.textContent = message;
    el.className = `pz-toast visible ${tone}`;
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('visible'), 2800);
  };
}

/* ─── Completion dialog ─────────────────────────────────────── */

function createCompletionDialog({ activity, level, levelData, puzzleIndex, onClose }) {
  const modal  = document.getElementById('pz-modal');
  const text   = document.getElementById('pz-modal-text');
  const themes = document.getElementById('pz-modal-themes');
  const close  = document.getElementById('pz-modal-close');
  const next   = document.getElementById('pz-modal-next');
  const nextPuzzle = levelData.puzzles[puzzleIndex + 1] || null;

  themes.href = puzzleUrl(activity, level);
  if (nextPuzzle) {
    next.href = puzzleUrl(activity, level, nextPuzzle.id);
    next.title = nextPuzzle.theme;
  } else {
    next.hidden = true;
  }

  const isOpen = () => modal.classList.contains('active');

  function open(message) {
    text.textContent = message;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    (nextPuzzle ? next : themes).focus();
  }

  function hide() {
    if (!isOpen()) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (onClose) onClose();
  }

  close.addEventListener('click', hide);
  modal.addEventListener('click', (e) => { if (e.target === modal) hide(); });
  document.addEventListener('keydown', (e) => {
    if (isOpen() && e.key === 'Escape') hide();
  });

  return { open, close: hide, isOpen };
}

/* ─── Page bootstrap ────────────────────────────────────────── */

// Loads the activity data, fills the header and shows either the theme
// selection (?level=) or a puzzle (?level=&puzzle=).
async function startPuzzleActivity(activity, { store, buildModel, preview, meta, statusText, renderPuzzle }) {
  const data = await loadJSON(activity.dataUrl);

  const rawLevel = getParam('level') ?? '';
  const level = LEVEL_ORDER.includes(rawLevel) ? rawLevel : 'A1';
  const levelData = data.levels[level];

  const back = document.getElementById('pz-back');
  back.href = activity.pageUrl;
  document.getElementById('level-badge').textContent = level;
  document.getElementById('level-name').textContent = levelData.name;

  const puzzleIndex = levelData.puzzles.findIndex(p => p.id === getParam('puzzle'));

  if (puzzleIndex < 0) {
    document.title = pageTitle(activity.title, level, levelData.name);
    renderThemeSelect({ activity, level, levelData, store, buildModel, preview, meta, statusText });
    return;
  }

  const puzzle = levelData.puzzles[puzzleIndex];
  document.title = pageTitle(activity.title, level, puzzle.theme);
  document.body.classList.add('pz-playing');
  back.href = puzzleUrl(activity, level);
  back.setAttribute('aria-label', 'Back to themes');
  document.getElementById('pz-back-label').textContent = 'Themes';
  document.getElementById('level-name').textContent = puzzle.theme;
  document.getElementById('progress-counter').hidden = false;
  document.getElementById('reset-btn').textContent = 'Clear';
  document.getElementById('pz-puzzle').hidden = false;

  renderPuzzle({
    activity,
    level,
    levelData,
    puzzle,
    puzzleIndex,
    model: buildModel(puzzle, levelData)
  });
}
