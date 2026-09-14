/* Crosswords — requires scripts/common.js and scripts/puzzles.js */

const CW_STORE          = createProgressStore('heyTeacher:crosswords');
const CW_LAYOUT_VERSION = 1;     // bump when the generator changes (invalidates saved progress)
const CW_ATTEMPTS       = 120;   // layouts tried per puzzle; the best-scoring one wins
const CW_TARGET_RATIO   = 1.35;  // preferred long side / short side of the grid

/* ══════════════════════════════════════════════════════════════
   LAYOUT GENERATOR
   Deterministic: the same word list always produces the same
   grid, so every student sees the same puzzle.
══════════════════════════════════════════════════════════════ */

function buildAttempt(words, order, rand) {
  const grid = new Map();      // key(r, c) -> { r, c, letter, across?: wordIdx, down?: wordIdx }
  const byLetter = new Map();  // letter -> cells holding it
  const placements = [];
  const bounds = { minR: 0, maxR: 0, minC: 0, maxC: 0 };
  const key = (r, c) => (r + 512) * 1024 + (c + 512);

  // Returns the number of crossings, or 0 if the word can't go there
  function fits(word, row, col, dir) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = 1 - dr;
    const len = word.length;

    if (grid.has(key(row - dr, col - dc)) || grid.has(key(row + dr * len, col + dc * len))) return 0;

    let crossings = 0;
    for (let i = 0; i < len; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const cell = grid.get(key(r, c));
      if (cell) {
        if (cell.letter !== word[i] || cell[dir] !== undefined) return 0;
        crossings++;
      } else if (grid.has(key(r + dc, c + dr)) || grid.has(key(r - dc, c - dr))) {
        // New letters may not touch parallel neighbours (no accidental words)
        return 0;
      }
    }
    return crossings;
  }

  function place(wIdx, row, col, dir) {
    const word = words[wIdx];
    const dr = dir === 'down' ? 1 : 0;
    const dc = 1 - dr;
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      let cell = grid.get(key(r, c));
      if (!cell) {
        cell = { r, c, letter: word[i] };
        grid.set(key(r, c), cell);
        if (!byLetter.has(cell.letter)) byLetter.set(cell.letter, []);
        byLetter.get(cell.letter).push(cell);
      }
      cell[dir] = wIdx;
    }
    bounds.minR = Math.min(bounds.minR, row);
    bounds.minC = Math.min(bounds.minC, col);
    bounds.maxR = Math.max(bounds.maxR, row + dr * (word.length - 1));
    bounds.maxC = Math.max(bounds.maxC, col + dc * (word.length - 1));
    placements.push({ wIdx, row, col, dir });
  }

  function findSpot(wIdx) {
    const word = words[wIdx];
    let best = null;

    for (let i = 0; i < word.length; i++) {
      for (const cell of byLetter.get(word[i]) || []) {
        const dir = cell.across === undefined ? 'across' : cell.down === undefined ? 'down' : null;
        if (!dir) continue;

        const row = dir === 'down' ? cell.r - i : cell.r;
        const col = dir === 'across' ? cell.c - i : cell.c;
        const crossings = fits(word, row, col, dir);
        if (!crossings) continue;

        const endR = dir === 'down' ? row + word.length - 1 : row;
        const endC = dir === 'across' ? col + word.length - 1 : col;
        const height = Math.max(bounds.maxR, endR) - Math.min(bounds.minR, row) + 1;
        const width  = Math.max(bounds.maxC, endC) - Math.min(bounds.minC, col) + 1;
        const score = crossings * 20
          - width * height * 0.2
          - Math.abs(Math.max(width, height) / Math.min(width, height) - CW_TARGET_RATIO) * 4
          + rand() * 4;

        if (!best || score > best.score) best = { row, col, dir, score };
      }
    }
    return best;
  }

  place(order[0], 0, 0, 'across');

  // Words that don't fit yet are retried after the others are placed
  let pending = order.slice(1);
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    const stillPending = [];
    for (const wIdx of pending) {
      const spot = findSpot(wIdx);
      if (spot) {
        place(wIdx, spot.row, spot.col, spot.dir);
        progress = true;
      } else {
        stillPending.push(wIdx);
      }
    }
    pending = stillPending;
  }

  const width  = bounds.maxC - bounds.minC + 1;
  const height = bounds.maxR - bounds.minR + 1;
  let crossings = 0;
  for (const cell of grid.values()) {
    if (cell.across !== undefined && cell.down !== undefined) crossings++;
  }

  // Orientation doesn't matter here: portrait results are turned landscape later
  const longSide  = Math.max(width, height);
  const shortSide = Math.min(width, height);
  const cost = pending.length * 1000
    + width * height
    - crossings * 25
    + Math.abs(longSide / shortSide - CW_TARGET_RATIO) * 25
    + Math.max(0, longSide - 20) * 50;

  return { grid, placements, bounds, width, height, unplaced: pending, cost };
}

function generateLayout(words, seed) {
  const rand = seededRandom(seed);
  const byLength = words.map((_, i) => i)
    .sort((a, b) => words[b].length - words[a].length || a - b);

  let best = null;
  for (let attempt = 0; attempt < CW_ATTEMPTS; attempt++) {
    let order = byLength.slice();
    if (attempt > 0) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      // Half of the attempts start from one of the longest words
      if (attempt % 2 === 0) {
        const spine = byLength[Math.floor(rand() * Math.min(3, byLength.length))];
        order = [spine, ...order.filter(i => i !== spine)];
      }
    }
    const result = buildAttempt(words, order, rand);
    if (!best || result.cost < best.cost) best = result;
  }
  return best;
}

function buildCrossword(puzzle) {
  const entries = puzzle.words
    .map(w => ({
      answer: w.answer,
      clue: w.clue,
      letters: toGridLetters(w.answer),
      enumeration: enumeration(w.answer)
    }))
    .filter(e => e.letters.length >= 2);

  const sig = hashString(`${CW_LAYOUT_VERSION}|${entries.map(e => e.letters).join('|')}`).toString(36);
  const layout = generateLayout(entries.map(e => e.letters), hashString(`${puzzle.id}|${sig}`));
  const { minR, minC } = layout.bounds;

  // Transpose portrait grids so they fit wide screens better
  const flip = layout.height > layout.width;
  const rows = flip ? layout.width : layout.height;
  const cols = flip ? layout.height : layout.width;
  const pos  = (r, c) => (flip ? [c - minC, r - minR] : [r - minR, c - minC]);
  const turn = dir => (flip ? (dir === 'across' ? 'down' : 'across') : dir);

  const words = layout.placements.map(p => {
    const [row, col] = pos(p.row, p.col);
    return { ...entries[p.wIdx], dir: turn(p.dir), row, col, num: 0, cells: [] };
  });
  const wordByEntry = new Map(layout.placements.map((p, i) => [p.wIdx, words[i]]));

  const cells = [...layout.grid.values()]
    .map(g => {
      const [r, c] = pos(g.r, g.c);
      return {
        r,
        c,
        letter: g.letter,
        across: wordByEntry.get(flip ? g.down : g.across) || null,
        down: wordByEntry.get(flip ? g.across : g.down) || null,
        num: 0
      };
    })
    .sort((a, b) => a.r - b.r || a.c - b.c);

  const cellAt = new Map();
  cells.forEach((cell, i) => {
    cell.index = i;
    cell.key = `${cell.r},${cell.c}`;
    cellAt.set(cell.key, cell);
  });

  words.forEach(w => {
    for (let i = 0; i < w.letters.length; i++) {
      w.cells.push(cellAt.get(w.dir === 'across' ? `${w.row},${w.col + i}` : `${w.row + i},${w.col}`));
    }
  });

  // Standard numbering: reading order, shared by across/down starting on the same square
  let num = 0;
  cells.forEach(cell => {
    const starts = words.filter(w => w.cells[0] === cell);
    if (starts.length) {
      cell.num = ++num;
      starts.forEach(w => { w.num = cell.num; });
    }
  });

  words.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'across' ? -1 : 1));
  words.forEach((w, i) => { w.index = i; });

  const unplaced = layout.unplaced.map(i => entries[i]);
  if (unplaced.length) {
    console.warn(`[crossword] ${puzzle.id}: could not place`, unplaced.map(e => e.answer));
  }

  return { id: puzzle.id, sig, rows, cols, cells, cellAt, words, unplaced };
}

/* ══════════════════════════════════════════════════════════════
   THEME CARDS
══════════════════════════════════════════════════════════════ */

function crosswordPreview(model, saved) {
  const filled = saved ? saved.values : {};
  const rects = model.cells.map(cell =>
    `<rect x="${cell.c + 0.09}" y="${cell.r + 0.09}" width="0.82" height="0.82" rx="0.16"${filled[cell.key] ? ' class="on"' : ''}/>`
  ).join('');
  return `<svg class="cw-preview" viewBox="0 0 ${model.cols} ${model.rows}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${rects}</svg>`;
}

function crosswordMeta(model) {
  const lengths = model.words.map(w => w.letters.length);
  return `${model.words.length} words · ${Math.min(...lengths)}–${Math.max(...lengths)} letters`;
}

/* ══════════════════════════════════════════════════════════════
   PUZZLE
══════════════════════════════════════════════════════════════ */

function renderCrossword({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { cells, words } = model;

  /* ─── Elements ───────────────────────────────────────────── */
  const gridEl      = document.getElementById('cw-grid');
  const wrapEl      = document.getElementById('cw-grid-wrap');
  const input       = document.getElementById('cw-input');
  const clueLabel   = document.getElementById('cw-cluebar-label');
  const clueText    = document.getElementById('cw-cluebar-text');
  const cluesEl     = document.getElementById('cw-clues');
  const acrossList  = document.getElementById('cw-clues-across');
  const downList    = document.getElementById('cw-clues-down');
  const counter     = document.getElementById('progress-counter');
  const resetBtn    = document.getElementById('reset-btn');

  const toast  = createToast();
  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex, onClose: focusInput });

  counter.title = 'Words filled';

  /* ─── State ──────────────────────────────────────────────── */
  const values   = cells.map(() => '');
  const revealed = new Set();   // cell indexes
  const wrong    = new Set();   // cell indexes marked by "Check"
  let active = words[0].cells[0];
  let dir = words[0].dir;
  let wasComplete = false;
  let wasFull = false;
  let lastKeyTyped = 0;

  const saved = CW_STORE.get(puzzle.id, model.sig);
  if (saved) {
    cells.forEach(cell => {
      const ch = saved.values && saved.values[cell.key];
      if (ch) values[cell.index] = ch;
    });
    (saved.revealed || []).forEach(k => {
      const cell = model.cellAt.get(k);
      if (cell) revealed.add(cell.index);
    });
  }

  /* ─── Build grid ─────────────────────────────────────────── */
  gridEl.style.setProperty('--cols', model.cols);
  gridEl.style.setProperty('--rows', model.rows);

  cells.forEach(cell => {
    const el = document.createElement('div');
    el.className = 'cw-cell';
    el.setAttribute('role', 'gridcell');
    el.style.gridRow = cell.r + 1;
    el.style.gridColumn = cell.c + 1;
    el.innerHTML = `${cell.num ? `<span class="cw-num">${cell.num}</span>` : ''}<span class="cw-letter"></span>`;
    el.addEventListener('click', () => selectCell(cell));
    cell.el = el;
    cell.letterEl = el.querySelector('.cw-letter');
    gridEl.appendChild(el);
  });

  /* ─── Build clue lists ───────────────────────────────────── */
  words.forEach(word => {
    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" class="cw-clue">
        <span class="cw-clue-num">${word.num}</span>
        <span class="cw-clue-text">${escapeHTML(word.clue)} <span class="cw-clue-enum">(${word.enumeration})</span></span>
      </button>`;
    const btn = li.querySelector('.cw-clue');
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => selectWord(word));
    word.clueEl = btn;
    (word.dir === 'across' ? acrossList : downList).appendChild(li);
  });

  /* ─── Rendering ──────────────────────────────────────────── */
  function paintCell(cell) {
    const i = cell.index;
    cell.letterEl.textContent = values[i];
    cell.el.classList.toggle('is-revealed', revealed.has(i));
    cell.el.classList.toggle('is-wrong', wrong.has(i));
  }

  function currentWord() {
    return active[dir] || active[dir === 'across' ? 'down' : 'across'];
  }

  function scrollClueIntoView(el) {
    if (cluesEl.scrollHeight <= cluesEl.clientHeight) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < cluesEl.scrollTop + 12) {
      cluesEl.scrollTo({ top: top - 48, behavior: 'smooth' });
    } else if (bottom > cluesEl.scrollTop + cluesEl.clientHeight - 12) {
      cluesEl.scrollTo({ top: bottom - cluesEl.clientHeight + 12, behavior: 'smooth' });
    }
  }

  function paintSelection() {
    const word = currentWord();
    const cross = active[word.dir === 'across' ? 'down' : 'across'];

    cells.forEach(cell => cell.el.classList.remove('in-word', 'is-active'));
    word.cells.forEach(cell => cell.el.classList.add('in-word'));
    active.el.classList.add('is-active');

    words.forEach(w => w.clueEl.classList.remove('is-active', 'is-cross'));
    word.clueEl.classList.add('is-active');
    if (cross) cross.clueEl.classList.add('is-cross');
    scrollClueIntoView(word.clueEl);

    clueLabel.textContent = `${word.num} ${word.dir === 'across' ? 'Across' : 'Down'}`;
    clueText.innerHTML = `${escapeHTML(word.clue)} <span class="cw-clue-enum">(${word.enumeration})</span>`;
  }

  function fitGrid() {
    const stacked = window.matchMedia('(max-width: 900px)').matches;
    const gapRatio = 0.08;
    const availW = wrapEl.clientWidth - 8;
    const availH = stacked ? Infinity : wrapEl.clientHeight - 8;
    const size = Math.min(
      availW / (model.cols + (model.cols - 1) * gapRatio),
      availH / (model.rows + (model.rows - 1) * gapRatio)
    );
    const cell = Math.max(16, Math.min(Math.floor(size), stacked ? 46 : 68));
    gridEl.style.setProperty('--cell', `${cell}px`);
    gridEl.style.setProperty('--gap', `${Math.max(2, Math.floor(cell * gapRatio))}px`);
  }

  /* ─── Progress ───────────────────────────────────────────── */
  function updateProgress() {
    let filledWords = 0;
    words.forEach(w => {
      const filled = w.cells.every(c => values[c.index]);
      w.clueEl.classList.toggle('is-filled', filled);
      if (filled) filledWords++;
    });

    const full = cells.every(c => values[c.index]);
    const complete = full && cells.every(c => values[c.index] === c.letter);

    counter.textContent = `${filledWords} / ${words.length}`;
    counter.classList.toggle('complete', complete);
    gridEl.classList.toggle('is-complete', complete);
    resetBtn.disabled = !values.some(Boolean);

    return { filled: filledWords, full, complete };
  }

  function save(progress) {
    if (!values.some(Boolean)) {
      CW_STORE.set(puzzle.id, null);
      return;
    }
    const stored = {};
    cells.forEach(c => { if (values[c.index]) stored[c.key] = values[c.index]; });
    CW_STORE.set(puzzle.id, {
      sig: model.sig,
      values: stored,
      revealed: [...revealed].map(i => cells[i].key),
      progress: progress.filled,
      complete: progress.complete
    });
  }

  function afterEdit({ celebrate = true } = {}) {
    const progress = updateProgress();
    save(progress);

    if (progress.complete && !wasComplete && celebrate) {
      setTimeout(() => { if (wasComplete) openModal(); }, 450);
    } else if (progress.full && !progress.complete && !wasFull) {
      toast('The grid is full, but some letters are wrong. Try checking the puzzle.', 'warn');
    }
    wasComplete = progress.complete;
    wasFull = progress.full;
  }

  /* ─── Selection & movement ───────────────────────────────── */
  function focusInput() {
    input.focus({ preventScroll: true });
  }

  function toggleDirection() {
    const other = dir === 'across' ? 'down' : 'across';
    if (active[other]) {
      dir = other;
      paintSelection();
    }
  }

  function selectCell(cell) {
    if (cell === active) {
      toggleDirection();
    } else {
      active = cell;
      if (!cell[dir]) dir = dir === 'across' ? 'down' : 'across';
      paintSelection();
    }
    focusInput();
  }

  function selectWord(word) {
    dir = word.dir;
    active = word.cells.find(c => !values[c.index]) || word.cells[0];
    paintSelection();
    focusInput();
  }

  function stepWord(delta) {
    const word = currentWord();
    selectWord(words[(word.index + delta + words.length) % words.length]);
  }

  function move(axis, delta) {
    // First arrow press in the other axis just turns the selection
    if (dir !== axis && active[axis]) {
      dir = axis;
      paintSelection();
      return;
    }
    let r = active.r;
    let c = active.c;
    const limit = Math.max(model.rows, model.cols);
    for (let step = 0; step < limit; step++) {
      if (axis === 'across') c += delta;
      else r += delta;
      const cell = model.cellAt.get(`${r},${c}`);
      if (cell) {
        active = cell;
        if (!active[dir]) dir = dir === 'across' ? 'down' : 'across';
        break;
      }
    }
    paintSelection();
  }

  /* ─── Editing ────────────────────────────────────────────── */
  function setLetter(cell, ch) {
    if (revealed.has(cell.index)) return;   // revealed letters are locked
    values[cell.index] = ch;
    wrong.delete(cell.index);
    paintCell(cell);
  }

  function typeLetter(ch) {
    setLetter(active, ch);
    const word = currentWord();
    const pos = word.cells.indexOf(active);
    if (pos < word.cells.length - 1) active = word.cells[pos + 1];
    paintSelection();
    afterEdit();
  }

  function erase() {
    const word = currentWord();
    const pos = word.cells.indexOf(active);
    if (values[active.index] && !revealed.has(active.index)) {
      setLetter(active, '');
    } else if (pos > 0) {
      active = word.cells[pos - 1];
      setLetter(active, '');
    }
    paintSelection();
    afterEdit();
  }

  /* ─── Check & reveal ─────────────────────────────────────── */
  function flashCorrect(cell) {
    cell.el.classList.remove('flash-correct');
    void cell.el.offsetWidth;
    cell.el.classList.add('flash-correct');
  }

  function check(targetCells, scope) {
    let wrongCount = 0;
    let emptyCount = 0;

    targetCells.forEach(cell => {
      const v = values[cell.index];
      if (!v) { emptyCount++; return; }
      if (v !== cell.letter) {
        wrong.add(cell.index);
        wrongCount++;
      } else if (!revealed.has(cell.index)) {
        flashCorrect(cell);
      }
      paintCell(cell);
    });

    if (wrongCount) {
      toast(`${wrongCount} wrong letter${wrongCount > 1 ? 's' : ''} marked in red.`, 'warn');
    } else if (emptyCount === targetCells.length) {
      toast('Nothing to check yet. Type some letters first.');
    } else if (emptyCount) {
      toast(`So far so good! ${emptyCount} empty square${emptyCount > 1 ? 's' : ''} left.`, 'ok');
    } else {
      toast(scope === 'word' ? 'Correct! Well done.' : 'Everything is correct!', 'ok');
    }
  }

  function reveal(targetCells, options) {
    targetCells.forEach(cell => {
      if (values[cell.index] === cell.letter) return;   // already right: keep it as the student's
      values[cell.index] = cell.letter;
      revealed.add(cell.index);
      wrong.delete(cell.index);
      paintCell(cell);
    });
    afterEdit(options);
  }

  function runTool(action) {
    const word = currentWord();
    if (action === 'check-word') {
      check(word.cells, 'word');
    } else if (action === 'check-all') {
      check(cells, 'all');
    } else if (action === 'reveal-letter') {
      if (values[active.index] === active.letter) toast('This letter is already correct.', 'ok');
      else reveal([active]);
    } else if (action === 'reveal-word') {
      if (word.cells.every(c => values[c.index] === c.letter)) toast('This word is already correct.', 'ok');
      else reveal(word.cells);
    } else if (action === 'reveal-all') {
      if (confirm('Reveal the answers for the whole puzzle?')) reveal(cells, { celebrate: false });
    }
  }

  /* ─── Completion dialog ──────────────────────────────────── */
  function openModal() {
    const helped = revealed.size;
    dialog.open(helped
      ? `You filled all ${words.length} words of “${puzzle.theme}”, with ${helped} revealed letter${helped > 1 ? 's' : ''}.`
      : `You solved all ${words.length} words of “${puzzle.theme}” without any hints!`);
  }

  /* ─── Events ─────────────────────────────────────────────── */
  document.addEventListener('keydown', (e) => {
    if (dialog.isOpen()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Let focused buttons/links keep their own Enter, Space and Tab behaviour
    const onControl = e.target !== input && e.target.closest && e.target.closest('button, a, input, textarea, select');
    if (onControl && (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab')) return;

    const k = e.key;
    if (/^[a-z]$/i.test(k)) {
      e.preventDefault();
      lastKeyTyped = performance.now();
      typeLetter(k.toUpperCase());
      focusInput();
    } else if (k === 'Backspace') {
      e.preventDefault();
      erase();
    } else if (k === 'Delete') {
      e.preventDefault();
      setLetter(active, '');
      paintSelection();
      afterEdit();
    } else if (k === 'ArrowLeft')  { e.preventDefault(); move('across', -1); }
    else if (k === 'ArrowRight')   { e.preventDefault(); move('across', 1); }
    else if (k === 'ArrowUp')      { e.preventDefault(); move('down', -1); }
    else if (k === 'ArrowDown')    { e.preventDefault(); move('down', 1); }
    else if (k === ' ')            { e.preventDefault(); toggleDirection(); }
    else if (k === 'Tab' || k === 'Enter') {
      e.preventDefault();
      stepWord(e.shiftKey ? -1 : 1);
    }
  });

  // Touch keyboards don't send usable keydown events: read the hidden input instead.
  // A zero-width sentinel lets Backspace register even when the square is empty.
  const SENTINEL = '​';
  function resetInput() {
    input.value = SENTINEL;
    try { input.setSelectionRange(1, 1); } catch { /* not focusable yet */ }
  }
  resetInput();

  function applyInputText() {
    const letters = input.value.replace(/[^a-z]/gi, '').toUpperCase();
    if (letters) [...letters].forEach(ch => typeLetter(ch));   // pasted or predicted text fills in order
    else if (!input.value) erase();
    resetInput();
  }

  input.addEventListener('input', (e) => {
    if (e.isComposing) return;   // wait for compositionend
    // Some keyboards fire both keydown and input for one keystroke
    if (performance.now() - lastKeyTyped < 80) { resetInput(); return; }
    applyInputText();
  });
  input.addEventListener('compositionend', applyInputText);
  input.addEventListener('focus', resetInput);

  // Clicking anywhere on the board keeps typing focus
  wrapEl.addEventListener('mousedown', e => e.preventDefault());

  document.querySelectorAll('#pz-puzzle .pz-tool').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => runTool(btn.dataset.action));
  });

  [['cw-prev-word', -1], ['cw-next-word', 1]].forEach(([id, delta]) => {
    const btn = document.getElementById(id);
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => stepWord(delta));
  });

  resetBtn.addEventListener('click', () => {
    if (!values.some(Boolean)) return;
    if (!confirm(`This will clear all letters in “${puzzle.theme}”.\n\nContinue?`)) return;
    values.fill('');
    revealed.clear();
    wrong.clear();
    cells.forEach(paintCell);
    afterEdit();
    selectWord(words[0]);
  });

  new ResizeObserver(fitGrid).observe(wrapEl);

  /* ─── Initial render ─────────────────────────────────────── */
  cells.forEach(paintCell);
  const initial = updateProgress();
  wasComplete = initial.complete;
  wasFull = initial.full;

  const firstOpen = words.find(w => w.cells.some(c => !values[c.index])) || words[0];
  dir = firstOpen.dir;
  active = firstOpen.cells.find(c => !values[c.index]) || firstOpen.cells[0];
  fitGrid();
  paintSelection();

  // Only grab focus where it won't pop up an on-screen keyboard
  if (window.matchMedia('(pointer: fine)').matches) focusInput();
}

/* ─── Init ──────────────────────────────────────────────────── */

startPuzzleActivity(ACTIVITIES.crosswords, {
  store: CW_STORE,
  buildModel: buildCrossword,
  preview: crosswordPreview,
  meta: crosswordMeta,
  renderPuzzle: renderCrossword
});
