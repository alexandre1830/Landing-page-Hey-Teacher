/* Memory game (word ↔ definition) — requires scripts/common.js and scripts/puzzles.js */

const MM_STORE          = createProgressStore('heyTeacher:memory');
const MM_LAYOUT_VERSION = 1;      // bump when card handling changes (invalidates saved progress)
const MM_MISMATCH_MS    = 1200;   // how long a wrong pair stays face up
const MM_PEEK_MS        = 2000;   // how long a peek shows the hidden cards
const MM_FLIP_MS        = 450;    // matches the flip transition in memory.css

/* ─── Model ─────────────────────────────────────────────────── */

function buildMemory(puzzle, levelData) {
  const words = puzzle.words
    .map(w => ({ word: String(w.word || '').trim(), definition: String(w.definition || '').trim() }))
    .filter(w => w.word && w.definition)
    .map((w, index) => ({ ...w, index }));

  const peeks = Math.max(0, Math.round(levelData.peeks ?? 2));
  const sig = hashString([MM_LAYOUT_VERSION, ...words.map(w => `${w.word}=${w.definition}`)].join('|')).toString(36);

  // One card per word ("3w") and one per definition ("3d")
  const keys = words.flatMap(w => [`${w.index}w`, `${w.index}d`]);
  return { id: puzzle.id, sig, peeks, words, keys };
}

const mmPairOf = key => parseInt(key, 10);
const mmIsWord = key => key.endsWith('w');

function mmShuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Divisor of count closest to the ideal number of columns, so every row is complete
function mmColumns(count, ideal, min = 2, max = count) {
  let best = 0;
  for (let c = min; c <= max; c++) {
    if (count % c) continue;
    if (!best || Math.abs(c - ideal) < Math.abs(best - ideal)) best = c;
  }
  return best || Math.round(ideal);
}

/* ══════════════════════════════════════════════════════════════
   THEME CARDS
══════════════════════════════════════════════════════════════ */

function memoryPreview(model, saved) {
  const count = model.keys.length;
  const cols = mmColumns(count, Math.sqrt(count * 2.2));   // wide preview panel
  const rows = Math.ceil(count / cols);
  const order = (saved && saved.order) || model.keys;
  const found = new Set((saved && saved.found) || []);

  const rects = order.map((key, i) => {
    const x = (i % cols) * 1.25;
    const y = Math.floor(i / cols) * 1.45;
    const cls = found.has(mmPairOf(key)) ? ' class="found"' : '';
    return `<rect x="${x}" y="${y}" width="1" height="1.2" rx="0.14"${cls}/>`;
  }).join('');

  return `<svg class="mm-preview" viewBox="0 0 ${cols * 1.25 - 0.25} ${rows * 1.45 - 0.25}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${rects}</svg>`;
}

function memoryMeta(model) {
  return `${model.words.length} pairs · ${model.peeks} ${model.peeks === 1 ? 'peek' : 'peeks'}`;
}

function memoryStatus(model, saved) {
  if (!saved) return { cls: '', text: 'Not started' };
  const found = (saved.found || []).length;
  const inProgress = !saved.complete && (found || saved.moves || saved.peeks);
  if (inProgress) return { cls: 'progress', text: `${found} / ${model.words.length} pairs` };
  if (saved.best) return { cls: 'complete', text: `Best · ${saved.best} moves` };
  return { cls: '', text: 'Not started' };
}

/* ══════════════════════════════════════════════════════════════
   GAME
══════════════════════════════════════════════════════════════ */

function renderMemory({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { words, keys } = model;
  const total = words.length;

  /* ─── Elements ───────────────────────────────────────────── */
  const barEl     = document.getElementById('mm-bar');
  const barLabel  = document.getElementById('mm-bar-label');
  const barText   = document.getElementById('mm-bar-text');
  const boardEl   = document.getElementById('mm-board');
  const gridEl    = document.getElementById('mm-grid');
  const peekBtn   = document.getElementById('mm-peek');
  const scoreEl   = document.getElementById('mm-score');
  const statsEl   = document.getElementById('mm-stats');
  const foundEl   = document.getElementById('mm-found');
  const counter   = document.getElementById('progress-counter');
  const resetBtn  = document.getElementById('reset-btn');
  const modalTitle = document.getElementById('pz-modal-title');

  const toast  = createToast();
  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex });

  counter.title = 'Pairs found';
  resetBtn.textContent = 'Restart';
  document.getElementById('pz-modal-close').textContent = 'Play again';

  /* ─── State ──────────────────────────────────────────────── */
  const state = { order: mmShuffle(keys), found: [], moves: 0, peeks: 0, best: 0 };

  const saved = MM_STORE.get(puzzle.id, model.sig);
  if (saved) {
    const validOrder = Array.isArray(saved.order)
      && saved.order.length === keys.length
      && keys.every(k => saved.order.includes(k));
    if (validOrder) {
      state.order = [...saved.order];
      state.found = [...new Set((saved.found || []).filter(i => Number.isInteger(i) && words[i]))];
      state.moves = Math.max(0, Number(saved.moves) || 0);
      state.peeks = Math.min(model.peeks, Math.max(0, Number(saved.peeks) || 0));
    }
    state.best = Math.max(0, Number(saved.best) || 0);
  }

  let open = [];              // positions of face-up cards that are not matched yet
  let peeking = false;
  let busy = false;           // cards are being reshuffled
  let justFound = -1;         // pair that plays the match animation
  let wrongPair = [];
  let cols = 4;
  let mismatchTimer = null;
  let peekTimer = null;
  let dialogTimer = null;

  const isFound    = key => state.found.includes(mmPairOf(key));
  const isComplete = () => state.found.length === total;
  const isStarted  = () => !!(state.moves || state.found.length || state.peeks);
  const peeksLeft  = () => Math.max(0, model.peeks - state.peeks);

  /* ─── Cards ──────────────────────────────────────────────── */
  const cardEls = keys.map((_, pos) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mm-card';
    btn.dataset.pos = pos;
    btn.style.setProperty('--i', pos * 28);
    btn.innerHTML = `
      <span class="mm-card-inner">
        <span class="mm-back" aria-hidden="true"><span class="mm-back-mark">?</span></span>
        <span class="mm-face">
          <span class="mm-face-label"></span>
          <span class="mm-face-text"><span class="mm-face-fit"></span></span>
        </span>
      </span>`;
    btn.addEventListener('click', () => flip(pos));
    gridEl.appendChild(btn);
    return btn;
  });

  function fillCard(pos) {
    const key = state.order[pos];
    const word = words[mmPairOf(key)];
    const btn = cardEls[pos];
    const face = btn.querySelector('.mm-face');
    face.classList.toggle('is-word', mmIsWord(key));
    face.classList.toggle('is-def', !mmIsWord(key));
    btn.querySelector('.mm-face-label').textContent = mmIsWord(key) ? 'Word' : 'Definition';
    btn.querySelector('.mm-face-fit').textContent = mmIsWord(key) ? word.word : word.definition;
  }

  function renderCard(pos) {
    const key = state.order[pos];
    const btn = cardEls[pos];
    const found = isFound(key);
    const up = found || open.includes(pos) || peeking;

    btn.classList.toggle('is-up', up);
    btn.classList.toggle('is-found', found);
    btn.classList.toggle('is-open', open.includes(pos));
    btn.classList.toggle('is-wrong', wrongPair.includes(pos));
    btn.classList.toggle('is-new', found && mmPairOf(key) === justFound);
    btn.setAttribute('aria-disabled', found ? 'true' : 'false');

    const word = words[mmPairOf(key)];
    const content = mmIsWord(key) ? `word “${word.word}”` : `definition “${word.definition}”`;
    btn.setAttribute('aria-label', up
      ? `Card ${pos + 1}: ${content}${found ? ', matched' : ''}`
      : `Card ${pos + 1}, face down`);
  }

  const renderCards = () => cardEls.forEach((_, pos) => renderCard(pos));

  /* ─── Layout ─────────────────────────────────────────────── */
  // Picks the columns that give the largest cards for the space available
  function layoutBoard() {
    const count = cardEls.length;
    const width = boardEl.clientWidth;
    if (!width) return;
    // Up to 1100px the panel goes below the board (see memory.css) and the page scrolls
    const stacked = window.matchMedia('(max-width: 1100px)').matches;
    let gap, cardW, cardH;

    if (stacked) {
      // Phones keep 4 columns with cards tall enough for the definitions;
      // tablets aim for cards about 120px wide
      const phone = width < 560;
      gap = phone ? 7 : 10;
      cols = phone ? 4 : Math.min(8, Math.max(5, Math.round(width / 125)));
      cardW = (width - (cols - 1) * gap) / cols;
      cardH = phone ? Math.max(cardW, 98) : cardW * 0.92;
    } else {
      gap = count >= 30 ? 8 : 10;
      const height = boardEl.clientHeight - 10;   // keeps the bar shadow clear of the first row
      // Scores the room left for text (card minus padding and label), so
      // narrow portrait cards lose to wider ones with the same area
      let bestScore = 0;
      for (let c = 2; c <= count; c++) {
        if (count % c) continue;
        const r = count / c;
        const cellW = (width - (c - 1) * gap) / c;
        const cellH = (height - (r - 1) * gap) / r;
        const w = Math.min(cellW, cellH * 1.6, 250);
        const h = Math.min(cellH, w * 1.05, 190);
        const score = Math.max(0, w - 20) * Math.max(0, h - 28);
        if (score > bestScore) { bestScore = score; cols = c; cardW = w; cardH = h; }
      }
    }

    cardW = Math.floor(cardW);
    cardH = Math.floor(cardH);
    gridEl.style.setProperty('--mm-gap', `${gap}px`);
    gridEl.style.setProperty('--mm-card-w', `${cardW}px`);
    gridEl.style.setProperty('--mm-card-h', `${cardH}px`);
    gridEl.style.width = `${cols * cardW + (cols - 1) * gap}px`;
    gridEl.classList.toggle('is-compact', cardH < 104 || cardW < 100);

    // Words: each card gets its own size, so one long word doesn't shrink the others
    const wordMax = Math.min(28, cardH * 0.26, cardW * 0.17);
    gridEl.querySelectorAll('.mm-face.is-word .mm-face-text').forEach((box) => {
      const text = box.firstElementChild;
      fitText([box], size => { text.style.fontSize = `${size}px`; }, 10, wordMax);
    });

    // Definitions: one shared size keeps the board even
    const defBoxes = [...gridEl.querySelectorAll('.mm-face.is-def .mm-face-text')];
    fitText(defBoxes, size => gridEl.style.setProperty('--mm-def-fs', `${size}px`), 9, Math.min(17, cardH * 0.15, cardW * 0.1));
  }

  const textFits = box => {
    const text = box.firstElementChild;
    return text.offsetHeight <= box.clientHeight + 1 && text.scrollWidth <= text.clientWidth + 1;
  };

  // Largest font size (binary search) that fits every box. Text that still
  // overflows at the minimum size is allowed to break inside words.
  function fitText(boxes, apply, min, max) {
    boxes.forEach(box => box.classList.remove('is-tight'));
    const fits = () => boxes.every(textFits);

    let size = min;
    let lo = min, hi = Math.max(min, max);
    apply(hi);
    if (fits()) {
      size = hi;
    } else {
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        apply(mid);
        if (fits()) { size = mid; lo = mid; } else { hi = mid; }
      }
    }
    apply(Math.floor(size * 2) / 2);
    boxes.forEach(box => { if (!textFits(box)) box.classList.add('is-tight'); });
  }

  /* ─── Bar, panel and header ──────────────────────────────── */
  function setBar(label, html, tone = '') {
    barLabel.textContent = label;
    barText.innerHTML = html;
    barEl.classList.toggle('is-ok', tone === 'ok');
    barEl.classList.toggle('mm-bar-miss', tone === 'miss');
  }

  const cardText = key => {
    const word = words[mmPairOf(key)];
    return mmIsWord(key)
      ? `<span class="mm-bar-word">${escapeHTML(word.word)}</span>`
      : escapeHTML(word.definition);
  };

  function defaultBar() {
    if (isComplete()) {
      setBar('Complete', `All ${total} pairs found in <b>${state.moves}</b> moves.`, 'ok');
    } else if (open.length === 1) {
      const key = state.order[open[0]];
      setBar(mmIsWord(key) ? 'Word' : 'Definition', `${cardText(key)} <span class="mm-bar-hint">${mmIsWord(key) ? '— now find its definition.' : ''}</span>`);
    } else if (isStarted()) {
      setBar(`Pairs ${state.found.length} / ${total}`, 'Flip two cards to match a word with its definition.');
    } else {
      setBar('How to play', 'Flip two cards to match each word with its definition.');
    }
  }

  function renderPanel(animateNew = false) {
    scoreEl.innerHTML = `
      <span class="mm-score-num">${state.found.length}</span>
      <span class="mm-score-of">/ ${total}</span>
      <span class="mm-score-label">Pairs found</span>`;

    statsEl.innerHTML = `
      <div><dt>Moves</dt><dd>${state.moves}</dd></div>
      <div><dt>Peeks left</dt><dd>${peeksLeft()}</dd></div>
      <div><dt>Best</dt><dd>${state.best || '–'}</dd></div>`;

    if (!state.found.length) {
      foundEl.innerHTML = '<li class="mm-found-empty">Matched pairs appear here, so you can review them.</li>';
      return;
    }
    foundEl.innerHTML = [...state.found].reverse().map((i, n) => `
      <li class="mm-found-item${animateNew && n === 0 ? ' is-new' : ''}">
        <span class="mm-found-word">${escapeHTML(words[i].word)}</span>
        <span class="mm-found-def">${escapeHTML(words[i].definition)}</span>
      </li>`).join('');
  }

  function renderTools() {
    const left = peeksLeft();
    peekBtn.querySelector('.mm-peek-count').textContent = left;
    peekBtn.setAttribute('aria-label', `Peek at all hidden cards (${left} left)`);
    peekBtn.disabled = !left || isComplete() || peeking;
  }

  /* ─── Progress ───────────────────────────────────────────── */
  function commit({ animateNew = false } = {}) {
    renderCards();
    renderPanel(animateNew);
    renderTools();

    const complete = isComplete();
    counter.textContent = `${state.found.length} / ${total}`;
    counter.classList.toggle('complete', complete);
    resetBtn.disabled = !isStarted();

    if (!isStarted() && !state.best) {
      MM_STORE.set(puzzle.id, null);
    } else {
      MM_STORE.set(puzzle.id, {
        sig: model.sig,
        order: state.order,
        found: state.found,
        moves: state.moves,
        peeks: state.peeks,
        best: state.best,
        progress: state.found.length,
        complete
      });
    }
  }

  function openDialog(previousBest) {
    clearTimeout(dialogTimer);
    if (dialog.isOpen()) return;
    const { moves } = state;
    modalTitle.textContent = moves <= total * 1.5 ? 'Excellent memory!'
      : moves <= total * 2.2 ? 'Great job!'
      : 'Round complete!';

    let message = `You matched all ${total} pairs in “${puzzle.theme}” in ${moves} moves`;
    message += state.peeks ? ` with ${state.peeks} ${state.peeks === 1 ? 'peek' : 'peeks'}.` : '.';
    if (previousBest && moves < previousBest) message += ` New best score (was ${previousBest})!`;
    else if (previousBest) message += ` Your best: ${state.best} moves.`;
    dialog.open(message);
  }

  /* ─── Game actions ───────────────────────────────────────── */
  function closeWrongPair() {
    clearTimeout(mismatchTimer);
    if (!wrongPair.length) return;
    wrongPair = [];
    open = [];
    renderCards();
    defaultBar();
  }

  function flip(pos) {
    if (busy || peeking || dialog.isOpen()) return;
    const key = state.order[pos];
    if (isFound(key) || open.includes(pos)) return;

    // Picking a new card while a wrong pair is showing turns that pair back at once
    if (wrongPair.length) closeWrongPair();

    open.push(pos);
    justFound = -1;

    if (open.length === 1) {
      renderCard(pos);
      defaultBar();
      return;
    }

    state.moves++;
    const [a, b] = open.map(p => state.order[p]);

    if (mmPairOf(a) === mmPairOf(b)) {
      const pair = mmPairOf(a);
      state.found.push(pair);
      justFound = pair;
      open = [];

      if (isComplete()) {
        const previousBest = state.best;
        state.best = previousBest ? Math.min(previousBest, state.moves) : state.moves;
        commit({ animateNew: true });
        defaultBar();
        gridEl.classList.add('is-complete');
        dialogTimer = setTimeout(() => openDialog(previousBest), 1300);
        return;
      }

      commit({ animateNew: true });
      const word = words[pair];
      setBar('Match!', `<span class="mm-bar-word">${escapeHTML(word.word)}</span> <span class="mm-bar-hint">— ${escapeHTML(word.definition)}</span>`, 'ok');
    } else {
      wrongPair = [...open];
      commit();
      setBar('Not a pair', cardText(b), 'miss');
      mismatchTimer = setTimeout(closeWrongPair, MM_MISMATCH_MS);
    }
  }

  function peek() {
    if (busy || peeking || dialog.isOpen()) return;
    if (isComplete()) { toast('All pairs are already found.'); return; }
    if (!peeksLeft()) { toast('No peeks left in this round.', 'warn'); return; }

    closeWrongPair();
    state.peeks++;
    peeking = true;
    justFound = -1;
    gridEl.classList.add('is-peeking');
    commit();
    setBar('Peek', 'Memorize where the cards are!');

    peekTimer = setTimeout(() => {
      peeking = false;
      gridEl.classList.remove('is-peeking');
      renderCards();
      renderTools();
      defaultBar();
    }, MM_PEEK_MS);
  }

  // Turns every card down, then deals a new shuffle once the flip is hidden
  function restart() {
    [mismatchTimer, peekTimer, dialogTimer].forEach(clearTimeout);
    dialog.close();
    busy = true;
    peeking = false;
    open = [];
    wrongPair = [];
    justFound = -1;
    state.found = [];
    state.moves = 0;
    state.peeks = 0;
    gridEl.classList.remove('is-peeking', 'is-complete');
    renderCards();

    setTimeout(() => {
      state.order = mmShuffle(keys);
      cardEls.forEach((_, pos) => fillCard(pos));
      commit();
      defaultBar();
      deal();
      busy = false;
      layoutBoard();
    }, MM_FLIP_MS);
  }

  function deal() {
    gridEl.classList.remove('is-dealing');
    void gridEl.offsetWidth;
    gridEl.classList.add('is-dealing');
    setTimeout(() => gridEl.classList.remove('is-dealing'), cardEls.length * 30 + 600);
  }

  /* ─── Events ─────────────────────────────────────────────── */
  peekBtn.addEventListener('click', peek);

  resetBtn.addEventListener('click', () => {
    if (!isStarted()) return;
    if (!isComplete() && !confirm(`This will reshuffle the cards and restart “${puzzle.theme}”.\n\nContinue?`)) return;
    restart();
  });

  document.getElementById('pz-modal-close').addEventListener('click', restart);

  // Arrow keys move between cards
  gridEl.addEventListener('keydown', (e) => {
    const card = e.target.closest('.mm-card');
    if (!card) return;
    const pos = Number(card.dataset.pos);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (!step) return;
    const next = cardEls[pos + step];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  });

  new ResizeObserver(() => layoutBoard()).observe(boardEl);

  /* ─── Initial render ─────────────────────────────────────── */
  cardEls.forEach((_, pos) => fillCard(pos));
  commit();
  defaultBar();
  layoutBoard();
  deal();

  // Web fonts change text metrics after the first fit
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutBoard);
}

/* ─── Init ──────────────────────────────────────────────────── */

startPuzzleActivity(ACTIVITIES.memory, {
  store: MM_STORE,
  buildModel: buildMemory,
  preview: memoryPreview,
  meta: memoryMeta,
  statusText: memoryStatus,
  renderPuzzle: renderMemory
});
