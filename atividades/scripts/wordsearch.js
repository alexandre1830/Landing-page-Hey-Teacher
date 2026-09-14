/* Word search — requires scripts/common.js and scripts/puzzles.js */

const WS_STORE          = createProgressStore('heyTeacher:wordsearch');
const WS_LIST_MODE_KEY  = 'heyTeacher:wordsearch:listMode';
const WS_LAYOUT_VERSION = 1;     // bump when the generator changes (invalidates saved progress)
const WS_ATTEMPTS       = 150;   // grids tried until every word fits
const WS_FILL_TRIES     = 25;    // filler rerolls to avoid accidental duplicate words

const WS_DIRECTIONS = {
  'right':      { dr: 0,  dc: 1,  arrow: '→' },
  'down':       { dr: 1,  dc: 0,  arrow: '↓' },
  'down-right': { dr: 1,  dc: 1,  arrow: '↘' },
  'up-right':   { dr: -1, dc: 1,  arrow: '↗' },
  'left':       { dr: 0,  dc: -1, arrow: '←' },
  'up':         { dr: -1, dc: 0,  arrow: '↑' },
  'down-left':  { dr: 1,  dc: -1, arrow: '↙' },
  'up-left':    { dr: -1, dc: -1, arrow: '↖' }
};

const WS_COLORS         = ['#f2a7a6', '#9fc3ec', '#a8dcbf', '#f4d58d', '#c9b3ea', '#f7b98b', '#8fd3d6', '#e3a8d4'];
const WS_REVEALED_COLOR = '#c2cbd9';

// Roughly English letter frequencies, for natural-looking filler
const WS_FILLER = 'EEEEEEEEEEEETTTTTTTTTAAAAAAAAOOOOOOOIIIIIIINNNNNNNSSSSSSRRRRRRHHHHHDDDDLLLLUUUCCCMMMFFGGYYPPWWBBVKJXZ';

/* ══════════════════════════════════════════════════════════════
   GRID GENERATOR
   Deterministic: the same word list and level settings always
   produce the same grid, so every student sees the same puzzle.
══════════════════════════════════════════════════════════════ */

// Opposite directions share an axis; words may cross but never overlap along one
function wsAxis(d) {
  return d.dr === 0 ? 'h' : d.dc === 0 ? 'v' : d.dr === d.dc ? 'd' : 'a';
}

function wsCountOccurrences(grid, rows, cols, word) {
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c] !== word[0]) continue;
      for (const d of Object.values(WS_DIRECTIONS)) {
        const endR = r + d.dr * (word.length - 1);
        const endC = c + d.dc * (word.length - 1);
        if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;
        let i = 1;
        while (i < word.length && grid[(r + d.dr * i) * cols + (c + d.dc * i)] === word[i]) i++;
        if (i === word.length) count++;
      }
    }
  }
  const palindrome = word === [...word].reverse().join('');
  return palindrome ? count / 2 : count;
}

function generateWordSearch(words, { rows, cols, directions, decoy }, seed) {
  const rand = seededRandom(seed);
  const dirs = directions.filter(name => WS_DIRECTIONS[name]).map(name => ({ name, ...WS_DIRECTIONS[name] }));
  const order = words.map((_, i) => i).sort((a, b) => words[b].length - words[a].length || a - b);
  const decoyPool = words.join('');

  // A word contained in another (e.g. EAR in HEART) legitimately appears more than once
  const expected = words.map(w => 1 + words.reduce((n, other) => (
    other === w ? n : n + wsCountOccurrences([...other], 1, other.length, w)
  ), 0));

  function fillerLetter() {
    const pool = rand() < decoy ? decoyPool : WS_FILLER;
    return pool[Math.floor(rand() * pool.length)];
  }

  let best = null;
  let lastComplete = null;

  for (let attempt = 0; attempt < WS_ATTEMPTS; attempt++) {
    const grid = new Array(rows * cols).fill('');
    const axes = new Array(rows * cols).fill('');
    const usage = new Map(dirs.map(d => [d.name, 0]));
    const placements = [];
    const unplaced = [];

    for (const wIdx of order) {
      const word = words[wIdx];
      const options = [];

      for (const d of dirs) {
        const axis = wsAxis(d);
        const spots = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const endR = r + d.dr * (word.length - 1);
            const endC = c + d.dc * (word.length - 1);
            if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;

            let overlap = 0;
            let ok = true;
            for (let i = 0; i < word.length; i++) {
              const idx = (r + d.dr * i) * cols + (c + d.dc * i);
              if (!grid[idx]) continue;
              if (grid[idx] !== word[i] || axes[idx].includes(axis)) { ok = false; break; }
              overlap++;
            }
            if (ok && overlap < word.length) spots.push({ r, c, overlap });
          }
        }
        if (spots.length) options.push({ d, axis, spots });
      }

      if (!options.length) {
        unplaced.push(wIdx);
        continue;
      }

      // Spread words over every allowed direction, then prefer shared letters
      const minUse = Math.min(...options.map(o => usage.get(o.d.name)));
      const leastUsed = options.filter(o => usage.get(o.d.name) === minUse);
      const { d, axis, spots } = leastUsed[Math.floor(rand() * leastUsed.length)];

      const weights = spots.map(s => 1 + s.overlap * 4);
      let pick = rand() * weights.reduce((a, b) => a + b, 0);
      let spot = spots[spots.length - 1];
      for (let i = 0; i < spots.length; i++) {
        pick -= weights[i];
        if (pick <= 0) { spot = spots[i]; break; }
      }

      for (let i = 0; i < word.length; i++) {
        const idx = (spot.r + d.dr * i) * cols + (spot.c + d.dc * i);
        grid[idx] = word[i];
        axes[idx] += axis;
      }
      usage.set(d.name, usage.get(d.name) + 1);
      placements.push({ wIdx, r: spot.r, c: spot.c, dir: d.name });
    }

    if (unplaced.length) {
      if (!best || unplaced.length < best.unplaced.length) best = { grid, placements, unplaced };
      continue;
    }

    lastComplete = { grid, placements, unplaced };
    for (let t = 0; t < WS_FILL_TRIES; t++) {
      const filled = grid.map(ch => ch || fillerLetter());
      if (words.every((w, i) => wsCountOccurrences(filled, rows, cols, w) <= expected[i])) {
        return { grid: filled, placements, unplaced };
      }
    }
  }

  // Fallback: keep the best grid even if it isn't perfect
  const result = lastComplete || best;
  return { ...result, grid: result.grid.map(ch => ch || fillerLetter()) };
}

function buildWordSearch(puzzle, levelData) {
  const config = {
    rows: levelData.grid.rows,
    cols: levelData.grid.cols,
    directions: levelData.directions,
    decoy: levelData.decoyLetters || 0
  };
  const longest = Math.max(config.rows, config.cols);

  const entries = puzzle.words
    .map(w => ({
      answer: w.answer,
      clue: w.clue,
      letters: toGridLetters(w.answer),
      enumeration: enumeration(w.answer)
    }))
    .filter(e => e.letters.length >= 2 && e.letters.length <= longest);

  const sig = hashString([
    WS_LAYOUT_VERSION, config.rows, config.cols, config.directions.join(','), config.decoy,
    ...entries.map(e => e.letters)
  ].join('|')).toString(36);

  const layout = generateWordSearch(entries.map(e => e.letters), config, hashString(`${puzzle.id}|${sig}`));
  const placementOf = new Map(layout.placements.map(p => [p.wIdx, p]));

  const words = [];
  entries.forEach((entry, i) => {
    const p = placementOf.get(i);
    if (!p) return;
    const d = WS_DIRECTIONS[p.dir];
    const cells = Array.from({ length: entry.letters.length }, (_, k) => (p.r + d.dr * k) * config.cols + (p.c + d.dc * k));
    words.push({ ...entry, index: words.length, dir: p.dir, cells });
  });

  const unplaced = layout.unplaced.map(i => entries[i]);
  if (unplaced.length) {
    console.warn(`[wordsearch] ${puzzle.id}: could not place`, unplaced.map(e => e.answer));
  }

  return {
    id: puzzle.id,
    sig,
    rows: config.rows,
    cols: config.cols,
    directions: config.directions,
    letters: layout.grid,
    words,
    unplaced
  };
}

/* ─── Geometry helpers ──────────────────────────────────────── */

function wsLineMarkup(cols, a, b, attrs) {
  const x1 = (a % cols) + 0.5, y1 = Math.floor(a / cols) + 0.5;
  const x2 = (b % cols) + 0.5, y2 = Math.floor(b / cols) + 0.5;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
}

// Cells on the straight line from a towards b, snapped to the nearest of the 8 directions
function wsLineCells(model, a, b) {
  const { rows, cols } = model;
  const r1 = Math.floor(a / cols), c1 = a % cols;
  const dr = Math.floor(b / cols) - r1;
  const dc = (b % cols) - c1;
  if (!dr && !dc) return [a];

  const octant = Math.round(Math.atan2(dr, dc) / (Math.PI / 4));
  const sr = Math.round(Math.sin(octant * Math.PI / 4));
  const sc = Math.round(Math.cos(octant * Math.PI / 4));
  let len = Math.max(0, Math.round((dr * sr + dc * sc) / (sr * sr + sc * sc)));
  while (len > 0) {
    const r = r1 + sr * len, c = c1 + sc * len;
    if (r >= 0 && r < rows && c >= 0 && c < cols) break;
    len--;
  }
  return Array.from({ length: len + 1 }, (_, i) => (r1 + sr * i) * cols + (c1 + sc * i));
}

function wsColor(index, revealedList) {
  return revealedList.includes(index) ? WS_REVEALED_COLOR : WS_COLORS[index % WS_COLORS.length];
}

/* ══════════════════════════════════════════════════════════════
   THEME CARDS
══════════════════════════════════════════════════════════════ */

function wordSearchPreview(model, saved) {
  const found = saved ? saved.found || [] : [];
  const revealed = saved ? saved.revealed || [] : [];
  const marks = found
    .map(f => wsLineMarkup(model.cols, f.a, f.b, `stroke="${wsColor(f.i, revealed)}"`))
    .join('');
  const letters = model.letters
    .map((ch, i) => `<text x="${(i % model.cols) + 0.5}" y="${Math.floor(i / model.cols) + 0.5}">${ch}</text>`)
    .join('');
  return `<svg class="ws-preview" viewBox="0 0 ${model.cols} ${model.rows}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${marks}${letters}</svg>`;
}

function wordSearchMeta(model) {
  const arrows = model.directions.map(name => WS_DIRECTIONS[name].arrow).join(' ');
  return `${model.words.length} words · ${model.cols}×${model.rows} · ${arrows}`;
}

/* ══════════════════════════════════════════════════════════════
   PUZZLE
══════════════════════════════════════════════════════════════ */

function renderWordSearch({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { rows, cols, words } = model;

  /* ─── Elements ───────────────────────────────────────────── */
  const stageEl     = document.getElementById('ws-stage');
  const boardEl     = document.getElementById('ws-board');
  const gridEl      = document.getElementById('ws-grid');
  const marksEl     = document.getElementById('ws-marks');
  const barEl       = document.getElementById('ws-bar');
  const barLabel    = document.getElementById('ws-bar-label');
  const barText     = document.getElementById('ws-bar-text');
  const listEl      = document.getElementById('ws-list');
  const headingEl   = document.getElementById('ws-list-heading');
  const modeButtons = [...document.querySelectorAll('.ws-mode button')];
  const counter     = document.getElementById('progress-counter');
  const resetBtn    = document.getElementById('reset-btn');

  const toast  = createToast();
  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex });

  counter.title = 'Words found';

  /* ─── State ──────────────────────────────────────────────── */
  const found    = new Map();   // word index -> { a, b } cells where it was found
  const revealed = new Set();   // word indexes shown with "Reveal"
  let target = null;            // word index picked in the list
  let anchor = null;            // first tapped cell (tap-first-then-last selection)
  let hoverCell = null;
  let drag = null;              // { start, current, moved, pointerId }
  let invalidLine = null;
  let invalidTimer = null;
  let hintCell = null;
  let hintTimer = null;
  let lastFound = null;
  let wasComplete = false;

  const listModes = (() => {
    try { return JSON.parse(localStorage.getItem(WS_LIST_MODE_KEY) || '{}'); }
    catch { return {}; }
  })();
  let listMode = listModes[level] || levelData.listMode || 'words';

  const saved = WS_STORE.get(puzzle.id, model.sig);
  if (saved) {
    (saved.found || []).forEach(f => { if (words[f.i]) found.set(f.i, { a: f.a, b: f.b }); });
    (saved.revealed || []).forEach(i => { if (found.has(i)) revealed.add(i); });
  }

  /* ─── Build grid ─────────────────────────────────────────── */
  boardEl.style.setProperty('--cols', cols);
  boardEl.style.setProperty('--rows', rows);
  marksEl.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
  marksEl.innerHTML = '<g id="ws-found"></g><g id="ws-overlay"></g>';
  const foundLayer   = document.getElementById('ws-found');
  const overlayLayer = document.getElementById('ws-overlay');

  const cellEls = model.letters.map(ch => {
    const el = document.createElement('div');
    el.className = 'ws-cell';
    el.textContent = ch;
    gridEl.appendChild(el);
    return el;
  });

  document.getElementById('ws-directions').innerHTML =
    `Directions ${model.directions.map(name => `<span class="ws-dir" title="${name}">${WS_DIRECTIONS[name].arrow}</span>`).join('')}`;

  /* ─── Rendering ──────────────────────────────────────────── */
  const colorOf = i => wsColor(i, [...revealed]);
  const wordSpan = text => `<span class="ws-bar-word">${escapeHTML(text)}</span>`;
  const lettersOf = line => line.map(i => model.letters[i]).join('');

  function circleMarkup(cell, cls) {
    return `<circle class="${cls}" cx="${(cell % cols) + 0.5}" cy="${Math.floor(cell / cols) + 0.5}" r="0.42"/>`;
  }

  function renderFound() {
    foundLayer.innerHTML = [...found].map(([i, f]) =>
      wsLineMarkup(cols, f.a, f.b,
        `class="ws-mark-found${i === lastFound ? ' is-new' : ''}" stroke="${colorOf(i)}" pathLength="1"`)
    ).join('');
    lastFound = null;

    cellEls.forEach(el => el.classList.remove('is-found'));
    found.forEach(f => wsLineCells(model, f.a, f.b).forEach(i => cellEls[i].classList.add('is-found')));
  }

  function renderOverlay() {
    let html = '';
    if (invalidLine) html += wsLineMarkup(cols, invalidLine.a, invalidLine.b, 'class="ws-mark-invalid"');
    if (drag) {
      const line = wsLineCells(model, drag.start, drag.current);
      html += wsLineMarkup(cols, line[0], line[line.length - 1], 'class="ws-mark-select"');
    } else if (anchor !== null && hoverCell !== null) {
      const line = wsLineCells(model, anchor, hoverCell);
      html += wsLineMarkup(cols, line[0], line[line.length - 1], 'class="ws-mark-select"');
    }
    if (anchor !== null && !(drag && drag.moved)) html += circleMarkup(anchor, 'ws-mark-anchor');
    if (hintCell !== null) html += circleMarkup(hintCell, 'ws-mark-hint');
    overlayLayer.innerHTML = html;
  }

  function setBar(label, html, tone = '') {
    barLabel.textContent = label;
    barText.innerHTML = html;
    barEl.classList.toggle('is-ok', tone === 'ok');
    barEl.classList.toggle('is-muted', tone === 'muted');
  }

  function showTarget(word) {
    if (listMode === 'clues') {
      setBar(`Clue ${word.index + 1}`, `${escapeHTML(word.clue)} <span class="ws-enum">(${word.enumeration})</span>`);
    } else {
      setBar('Find', wordSpan(word.answer));
    }
  }

  function idleBar() {
    const left = words.length - found.size;
    if (!left) {
      setBar('Done', `All ${words.length} words found!`, 'ok');
    } else if (target !== null && !found.has(target)) {
      showTarget(words[target]);
    } else {
      setBar('Find', listMode === 'clues'
        ? `Read a clue, then drag across the letters of its answer. ${left} to go.`
        : `Drag across a word, or tap its first and last letters. ${left} to go.`);
    }
  }

  function renderList() {
    listEl.className = `ws-list ${listMode}`;
    headingEl.textContent = listMode === 'clues' ? 'Clues' : 'Words to find';
    modeButtons.forEach(btn => btn.setAttribute('aria-checked', String(btn.dataset.mode === listMode)));

    const ordered = listMode === 'words'
      ? [...words].sort((a, b) => a.answer.localeCompare(b.answer))
      : words;

    listEl.innerHTML = '';
    ordered.forEach(word => {
      const isFound = found.has(word.index);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ws-item';
      btn.classList.toggle('is-found', isFound);
      btn.classList.toggle('is-target', target === word.index);
      btn.setAttribute('aria-pressed', String(target === word.index));
      btn.style.setProperty('--c', colorOf(word.index));

      btn.innerHTML = listMode === 'words'
        ? `<span class="ws-swatch"></span><span class="ws-word">${escapeHTML(word.answer)}</span>`
        : `<span class="ws-item-num">${word.index + 1}</span>
           <span class="ws-item-text">${escapeHTML(word.clue)} <span class="ws-enum">(${word.enumeration})</span>${
             isFound ? `<span class="ws-answer">${escapeHTML(word.answer)}</span>` : ''}</span>`;

      btn.addEventListener('click', () => pickFromList(word));

      const li = document.createElement('li');
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function fitBoard() {
    const stacked = window.matchMedia('(max-width: 900px)').matches;
    const padding = 0.3;   // board padding, in cells
    const availW = stageEl.clientWidth - 8;
    const availH = stacked ? Infinity : stageEl.clientHeight - 8;
    const size = Math.min(availW / (cols + padding * 2), availH / (rows + padding * 2));
    const cell = Math.max(16, Math.min(Math.floor(size), stacked ? 42 : 60));
    boardEl.style.setProperty('--cell', `${cell}px`);
  }

  /* ─── Progress ───────────────────────────────────────────── */
  function updateProgress() {
    const complete = found.size === words.length;
    counter.textContent = `${found.size} / ${words.length}`;
    counter.classList.toggle('complete', complete);
    boardEl.classList.toggle('is-complete', complete);
    resetBtn.disabled = found.size === 0;
    return complete;
  }

  function save(complete) {
    if (!found.size) {
      WS_STORE.set(puzzle.id, null);
      return;
    }
    WS_STORE.set(puzzle.id, {
      sig: model.sig,
      found: [...found].map(([i, f]) => ({ i, a: f.a, b: f.b })),
      revealed: [...revealed],
      progress: found.size,
      complete
    });
  }

  function commit({ celebrate = true } = {}) {
    renderFound();
    renderList();
    const complete = updateProgress();
    save(complete);
    if (complete && !wasComplete && celebrate) {
      setTimeout(() => { if (found.size === words.length) openDialog(); }, 700);
    }
    wasComplete = complete;
  }

  function openDialog() {
    const helped = revealed.size;
    dialog.open(helped
      ? `You found all ${words.length} words in “${puzzle.theme}”, with ${helped} revealed.`
      : `You found all ${words.length} words in “${puzzle.theme}” without any help!`);
  }

  /* ─── Finding words ──────────────────────────────────────── */
  function markFound(word, a, b, { reveal = false } = {}) {
    found.set(word.index, { a, b });
    if (reveal) revealed.add(word.index);
    if (target === word.index) target = null;
    lastFound = word.index;
    setBar(reveal ? 'Revealed' : 'Found',
      `${wordSpan(word.answer)} <span class="ws-bar-clue">— ${escapeHTML(word.clue)}</span>`,
      reveal ? 'muted' : 'ok');
    commit();
  }

  // Any straight line spelling a remaining word counts (forwards or backwards)
  function evaluate(line) {
    if (line.length < 2) { idleBar(); return; }
    const text = lettersOf(line);
    const reversed = [...text].reverse().join('');
    const matches = words.filter(w => w.letters === text || w.letters === reversed);
    const word = matches.find(w => !found.has(w.index));

    if (word) {
      markFound(word, line[0], line[line.length - 1]);
    } else if (matches.length) {
      setBar('Already found', wordSpan(matches[0].answer), 'muted');
    } else {
      invalidLine = { a: line[0], b: line[line.length - 1] };
      setBar('Try again', `${wordSpan(text)} is not on the list.`);
      clearTimeout(invalidTimer);
      invalidTimer = setTimeout(() => { invalidLine = null; renderOverlay(); }, 650);
    }
  }

  function pickFromList(word) {
    if (found.has(word.index)) {
      target = null;
      lastFound = word.index;   // replay its highlight
      setBar(revealed.has(word.index) ? 'Revealed' : 'Found',
        `${wordSpan(word.answer)} <span class="ws-bar-clue">— ${escapeHTML(word.clue)}</span>`,
        revealed.has(word.index) ? 'muted' : 'ok');
      renderFound();
      renderList();
      return;
    }
    target = target === word.index ? null : word.index;
    renderList();
    idleBar();
  }

  // Tools act on the word picked in the list, or the first one still missing
  function targetWord() {
    if (target !== null && !found.has(target)) return words[target];
    const ordered = listMode === 'words'
      ? [...words].sort((a, b) => a.answer.localeCompare(b.answer))
      : words;
    return ordered.find(w => !found.has(w.index)) || null;
  }

  function runTool(action) {
    if (action === 'reveal-all') {
      if (found.size === words.length) { toast('All words are already found.', 'ok'); return; }
      if (!confirm('Reveal all the remaining words?')) return;
      words.forEach(w => {
        if (found.has(w.index)) return;
        found.set(w.index, { a: w.cells[0], b: w.cells[w.cells.length - 1] });
        revealed.add(w.index);
      });
      target = null;
      commit({ celebrate: false });
      setBar('Revealed', 'The remaining words are highlighted in gray.', 'muted');
      return;
    }

    const word = targetWord();
    if (!word) { toast('All words are already found.', 'ok'); return; }

    if (action === 'hint') {
      hintCell = word.cells[0];
      renderOverlay();
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hintCell = null; renderOverlay(); }, 3500);
      setBar('Hint', listMode === 'clues'
        ? `The answer to clue ${word.index + 1} starts at the flashing letter.`
        : `${wordSpan(word.answer)} starts at the flashing letter.`);
    } else if (action === 'reveal-word') {
      markFound(word, word.cells[0], word.cells[word.cells.length - 1], { reveal: true });
    }
  }

  /* ─── Pointer selection ──────────────────────────────────── */
  function cellFromPoint(e) {
    const rect = gridEl.getBoundingClientRect();
    const c = Math.min(cols - 1, Math.max(0, Math.floor((e.clientX - rect.left) / rect.width * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((e.clientY - rect.top) / rect.height * rows)));
    return r * cols + c;
  }

  gridEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || dialog.isOpen()) return;
    e.preventDefault();
    try { gridEl.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const cell = cellFromPoint(e);
    drag = { start: cell, current: cell, moved: false, pointerId: e.pointerId };
    hoverCell = null;
    renderOverlay();
  });

  gridEl.addEventListener('pointermove', (e) => {
    const cell = cellFromPoint(e);
    if (!drag) {
      // Mouse users see the line from the first tapped letter as they move
      if (anchor !== null && e.pointerType === 'mouse' && cell !== hoverCell) {
        hoverCell = cell;
        renderOverlay();
      }
      return;
    }
    if (e.pointerId !== drag.pointerId || cell === drag.current) return;
    drag.current = cell;
    if (cell !== drag.start) drag.moved = true;
    setBar('Selecting', wordSpan(lettersOf(wsLineCells(model, drag.start, cell))), 'muted');
    renderOverlay();
  });

  gridEl.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { start, current, moved } = drag;
    drag = null;
    hoverCell = null;

    if (moved) {
      anchor = null;
      evaluate(wsLineCells(model, start, current));
    } else if (anchor === null) {
      anchor = start;
      setBar('Selecting', `${wordSpan(model.letters[start])} Now tap the last letter.`, 'muted');
    } else if (anchor === start) {
      anchor = null;
      idleBar();
    } else {
      const line = wsLineCells(model, anchor, start);
      anchor = null;
      evaluate(line);
    }
    renderOverlay();
  });

  gridEl.addEventListener('pointercancel', () => {
    drag = null;
    renderOverlay();
  });

  gridEl.addEventListener('pointerleave', () => {
    if (!drag && hoverCell !== null) {
      hoverCell = null;
      renderOverlay();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || dialog.isOpen() || (anchor === null && !drag)) return;
    anchor = null;
    drag = null;
    hoverCell = null;
    renderOverlay();
    idleBar();
  });

  /* ─── Controls ───────────────────────────────────────────── */
  document.querySelectorAll('#pz-puzzle .pz-tool').forEach(btn => {
    btn.addEventListener('click', () => runTool(btn.dataset.action));
  });

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === listMode) return;
      listMode = btn.dataset.mode;
      listModes[level] = listMode;
      try { localStorage.setItem(WS_LIST_MODE_KEY, JSON.stringify(listModes)); } catch { /* not persisted */ }
      renderList();
      idleBar();
    });
  });

  resetBtn.addEventListener('click', () => {
    if (!found.size) return;
    if (!confirm(`This will clear all found words in “${puzzle.theme}”.\n\nContinue?`)) return;
    found.clear();
    revealed.clear();
    target = null;
    anchor = null;
    commit();
    renderOverlay();
    idleBar();
  });

  new ResizeObserver(fitBoard).observe(stageEl);

  /* ─── Initial render ─────────────────────────────────────── */
  fitBoard();
  renderFound();
  renderList();
  wasComplete = updateProgress();
  idleBar();
}

/* ─── Init ──────────────────────────────────────────────────── */

startPuzzleActivity(ACTIVITIES.wordsearch, {
  store: WS_STORE,
  buildModel: buildWordSearch,
  preview: wordSearchPreview,
  meta: wordSearchMeta,
  renderPuzzle: renderWordSearch
});
