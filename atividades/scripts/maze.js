/* Maze chase (Pac-Man style) — requires scripts/common.js and scripts/puzzles.js

   The player moves through a maze and eats the token with the correct answer
   while the ghosts chase. The CEFR level sets the questions; the arcade
   difficulty (ghosts, speed and lives) is chosen by the player and saved. */

const MZ_STORE          = createProgressStore('heyTeacher:maze');
const MZ_LAYOUT_VERSION = 1;     // bump when option handling changes (invalidates saved progress)
const MZ_DIFF_KEY       = 'heyTeacher:mazeDifficulty';

const MZ_DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   ghosts: 1, speed: 0.70, lives: 5, wander: 0.45, bonus: 1 },
  { id: 'normal', label: 'Normal', ghosts: 2, speed: 0.86, lives: 3, wander: 0.22, bonus: 1.5 },
  { id: 'hard',   label: 'Hard',   ghosts: 3, speed: 1.00, lives: 2, wander: 0.08, bonus: 2 }
];

const MZ_COLS = 19;
const MZ_ROWS = 13;
const MZ_SPEED = 5.4;            // player tiles per second
const MZ_SCARED = 6;             // seconds the ghosts stay scared
const MZ_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/* ─── Difficulty (shared by the theme screen and the game) ──── */

function mzReadDifficulty() {
  let saved = null;
  try { saved = localStorage.getItem(MZ_DIFF_KEY); } catch { /* storage unavailable */ }
  return MZ_DIFFICULTIES.find(d => d.id === saved) || MZ_DIFFICULTIES[1];
}

function mzWriteDifficulty(id) {
  try { localStorage.setItem(MZ_DIFF_KEY, id); } catch { /* progress just won't persist */ }
}

// Fills every .mz-diff group on the page (theme screen and game) and keeps
// them in sync. The choice is independent of the CEFR level.
const mzDifficulty = (() => {
  let current = mzReadDifficulty();
  const listeners = [];

  function paint() {
    document.querySelectorAll('.mz-diff [data-diff]').forEach((btn) => {
      const on = btn.dataset.diff === current.id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function init() {
    document.querySelectorAll('.mz-diff').forEach((group) => {
      group.innerHTML = `<span class="mz-diff-label">Difficulty</span>${MZ_DIFFICULTIES.map(d => `
        <button type="button" class="mz-chip" data-diff="${d.id}" aria-pressed="false"
          title="${d.ghosts} ${d.ghosts === 1 ? 'ghost' : 'ghosts'} · ${d.lives} lives · ${d.bonus}× points">${d.label}</button>`).join('')}`;

      group.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-diff]');
        if (!btn) return;
        current = MZ_DIFFICULTIES.find(d => d.id === btn.dataset.diff) || current;
        mzWriteDifficulty(current.id);
        paint();
        listeners.forEach(fn => fn(current));
      });
    });
    paint();
  }

  return { get: () => current, onChange: fn => listeners.push(fn), init };
})();

/* ─── Maze generation ───────────────────────────────────────── */

// Depth-first carving on the odd cells, then extra openings so the maze
// has loops instead of dead ends (a dead end is a trap with ghosts around)
function mzGenerateGrid(random) {
  const wall = Array.from({ length: MZ_ROWS }, () => Array(MZ_COLS).fill(true));
  const inside = (c, r) => c > 0 && r > 0 && c < MZ_COLS - 1 && r < MZ_ROWS - 1;

  wall[1][1] = false;
  const stack = [[1, 1]];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const options = [[2, 0], [-2, 0], [0, 2], [0, -2]]
      .filter(([dc, dr]) => inside(c + dc, r + dr) && wall[r + dr][c + dc]);
    if (!options.length) { stack.pop(); continue; }
    const [dc, dr] = options[Math.floor(random() * options.length)];
    wall[r + dr / 2][c + dc / 2] = false;
    wall[r + dr][c + dc] = false;
    stack.push([c + dc, r + dr]);
  }

  for (let r = 1; r < MZ_ROWS - 1; r++) {
    for (let c = 1; c < MZ_COLS - 1; c++) {
      if (!wall[r][c]) continue;
      const horizontal = !wall[r][c - 1] && !wall[r][c + 1] && wall[r - 1][c] && wall[r + 1][c];
      const vertical   = !wall[r - 1][c] && !wall[r + 1][c] && wall[r][c - 1] && wall[r][c + 1];
      if ((horizontal || vertical) && random() < 0.3) wall[r][c] = false;
    }
  }

  // Second pass: open one more wall next to the remaining dead ends
  for (let r = 1; r < MZ_ROWS - 1; r++) {
    for (let c = 1; c < MZ_COLS - 1; c++) {
      if (wall[r][c]) continue;
      const exits = MZ_DIRS.filter(([dc, dr]) => !wall[r + dr][c + dc]);
      if (exits.length > 1 || random() > 0.75) continue;
      const blocked = MZ_DIRS
        .map(([dc, dr]) => [c + dc, r + dr, c + dc * 2, r + dr * 2])
        .filter(([wc, wr, oc, or_]) => inside(wc, wr) && wall[wr][wc] && inside(oc, or_) && !wall[or_][oc]);
      if (blocked.length) {
        const [wc, wr] = blocked[Math.floor(random() * blocked.length)];
        wall[wr][wc] = false;
      }
    }
  }

  return wall;
}

const mzIsOpen = (grid, c, r) => r >= 0 && r < MZ_ROWS && c >= 0 && c < MZ_COLS && !grid[r][c];

function mzOpenCells(grid) {
  const cells = [];
  for (let r = 0; r < MZ_ROWS; r++) for (let c = 0; c < MZ_COLS; c++) if (!grid[r][c]) cells.push({ c, r });
  return cells;
}

// Steps from one cell to every other cell (-1 when unreachable)
function mzDistances(grid, from) {
  const dist = Array.from({ length: MZ_ROWS }, () => Array(MZ_COLS).fill(-1));
  const queue = [from];
  dist[from.r][from.c] = 0;
  for (let i = 0; i < queue.length; i++) {
    const { c, r } = queue[i];
    for (const [dc, dr] of MZ_DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (mzIsOpen(grid, nc, nr) && dist[nr][nc] < 0) {
        dist[nr][nc] = dist[r][c] + 1;
        queue.push({ c: nc, r: nr });
      }
    }
  }
  return dist;
}

/* ─── Model ─────────────────────────────────────────────────── */

function buildMaze(puzzle, levelData) {
  const random = seededRandom(hashString(`${puzzle.id}:maze`));
  const grid = mzGenerateGrid(random);

  const questions = puzzle.questions.map((q, index) => {
    // The first option in the data is the right one: same shuffle for everyone
    const shuffle = seededRandom(hashString(`${puzzle.id}:${index}`));
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(shuffle() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {
      index,
      q: q.q,
      options: order.map(i => q.options[i]),
      correct: order.indexOf(0),
      explain: q.explain || ''
    };
  });

  const cells = mzOpenCells(grid);
  const centre = cells.reduce((best, cell) => {
    const score = Math.abs(cell.c - (MZ_COLS - 1) / 2) + Math.abs(cell.r - (MZ_ROWS - 1) / 2);
    return score < best.score ? { cell, score } : best;
  }, { cell: cells[0], score: Infinity }).cell;

  const sig = hashString([MZ_LAYOUT_VERSION, ...questions.map(q => `${q.q}|${q.options.join('|')}`)].join('\n')).toString(36);
  return { id: puzzle.id, sig, grid, cells, start: centre, questions };
}

/* ══════════════════════════════════════════════════════════════
   THEME CARDS
══════════════════════════════════════════════════════════════ */

// The round's own maze, with the pac and a ghost inside
function mazePreview(model, saved) {
  const unit = 4;
  const walls = [];
  for (let r = 0; r < MZ_ROWS; r++) {
    for (let c = 0; c < MZ_COLS; c++) {
      if (model.grid[r][c]) walls.push(`<rect x="${c * unit}" y="${r * unit}" width="${unit}" height="${unit}" rx="1.2"/>`);
    }
  }

  const pac = model.start;
  const far = model.cells[model.cells.length - 1];
  const done = saved && saved.complete;
  return `<svg class="mz-preview" viewBox="0 0 ${MZ_COLS * unit} ${MZ_ROWS * unit}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${walls.join('')}
    <circle class="pac" cx="${pac.c * unit + unit / 2}" cy="${pac.r * unit + unit / 2}" r="${unit * 0.55}"/>
    <circle class="ghost${done ? ' scared' : ''}" cx="${far.c * unit + unit / 2}" cy="${far.r * unit + unit / 2}" r="${unit * 0.5}"/>
  </svg>`;
}

function mazeMeta(model) {
  return `${model.questions.length} questions · ${model.questions[0].options.length} answers each`;
}

function mazeStatus(model, saved) {
  const total = model.questions.length;
  if (saved && saved.complete) return { cls: 'complete', text: `Best ${saved.best || 0} pts` };
  if (saved) return { cls: 'progress', text: `${saved.correct || 0} / ${total} answered` };
  return { cls: '', text: 'Not started' };
}

/* ══════════════════════════════════════════════════════════════
   GAME
══════════════════════════════════════════════════════════════ */

function renderMaze({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { grid, questions } = model;
  const total = questions.length;

  /* ─── Elements ───────────────────────────────────────────── */
  const canvas    = document.getElementById('mz-canvas');
  const stageEl   = document.getElementById('mz-stage');
  const barLabel  = document.getElementById('mz-bar-label');
  const promptEl  = document.getElementById('mz-prompt');
  const livesEl   = document.getElementById('mz-lives');
  const scoreEl   = document.getElementById('mz-score');
  const bestEl    = document.getElementById('mz-best');
  const listEl    = document.getElementById('mz-list');
  const pauseBtn  = document.getElementById('mz-pause');
  const padEl     = document.getElementById('mz-pad');
  const diffName  = document.getElementById('mz-diff-name');
  const startEl   = document.getElementById('mz-start');
  const startKicker = document.getElementById('mz-start-kicker');
  const startTitle  = document.getElementById('mz-start-title');
  const startDesc   = document.getElementById('mz-start-desc');
  const startNote   = document.getElementById('mz-start-note');
  const startGo     = document.getElementById('mz-start-go');
  const startBack   = document.getElementById('mz-start-back');
  const counter   = document.getElementById('progress-counter');
  const resetBtn  = document.getElementById('reset-btn');
  const ctx = canvas.getContext('2d');

  const toast  = createToast();
  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex, onClose: () => { paused = false; } });

  document.getElementById('pz-back-label').textContent = 'Rounds';
  document.getElementById('pz-back').setAttribute('aria-label', 'Back to rounds');
  counter.title = 'Questions answered';

  /* ─── State ──────────────────────────────────────────────── */
  const saved = MZ_STORE.get(puzzle.id, model.sig);
  let best = (saved && saved.best) || 0;

  let difficulty = mzDifficulty.get();
  let current = 0;
  let score = 0;
  let lives = difficulty.lives;
  let answers = questions.map(() => ({ chosen: -1, tries: 0 }));
  let tokens = [];
  let pellets = [];
  let powers = [];
  let player = null;
  let ghosts = [];
  let scaredFor = 0;
  let readyFor = 0;          // countdown before the chase starts
  let pauseFor = 0;          // short pause after an answer
  let paused = false;
  let waiting = true;        // start screen is open, the chase hasn't begun
  let over = false;
  let wasComplete = !!(saved && saved.complete);
  let elapsed = 0;
  let needTokens = false;    // new tokens are placed after the answer feedback

  const answeredCount = () => answers.filter(a => a.chosen >= 0).length;
  const correctCount = () => answers.filter((a, i) => a.chosen === questions[i].correct).length;
  const isStarted = () => score > 0 || answeredCount() > 0;

  mzDifficulty.onChange((next) => {
    difficulty = next;
    lives = waiting ? next.lives : Math.min(lives, next.lives);
    if (!over) spawnGhosts();
    if (waiting) resetActors();
    if (!startEl.hidden) renderStart();
    renderHud();
    if (!waiting) toast(`${next.label}: ${next.ghosts} ${next.ghosts === 1 ? 'ghost' : 'ghosts'}, ${next.lives} lives, ${next.bonus}× points`);
  });
  lives = difficulty.lives;

  /* ─── Board setup ────────────────────────────────────────── */
  function resetActors() {
    player = { c: model.start.c, r: model.start.r, x: model.start.c, y: model.start.r, dir: [0, 0], next: [0, 0], mouth: 0 };
    spawnGhosts();
    ghosts.forEach(sendGhostHome);
    readyFor = 1.6;
  }

  function spawnGhosts() {
    const corners = [{ c: 1, r: 1 }, { c: MZ_COLS - 2, r: MZ_ROWS - 2 }, { c: MZ_COLS - 2, r: 1 }, { c: 1, r: MZ_ROWS - 2 }]
      .map(corner => model.cells.reduce((best, cell) => {
        const d = Math.abs(cell.c - corner.c) + Math.abs(cell.r - corner.r);
        return d < best.d ? { cell, d } : best;
      }, { cell: model.cells[0], d: Infinity }).cell);

    ghosts = Array.from({ length: difficulty.ghosts }, (_, i) => {
      const home = corners[i % corners.length];
      const old = ghosts[i];
      return old || { home, x: home.c, y: home.r, dir: [0, 0], tone: i % 3 };
    });
    ghosts.forEach((ghost) => { ghost.speed = MZ_SPEED * difficulty.speed; });
  }

  // An eaten ghost waits at home for a moment before chasing again
  function sendGhostHome(ghost, rest = 0) {
    ghost.x = ghost.home.c;
    ghost.y = ghost.home.r;
    ghost.dir = [0, 0];
    ghost.resting = rest;
  }

  function layPellets() {
    const skip = new Set([`${model.start.c},${model.start.r}`]);
    pellets = model.cells.filter(cell => !skip.has(`${cell.c},${cell.r}`)).map(cell => ({ ...cell }));

    // Three power pellets, as far from each other as possible
    powers = [];
    const pool = [...model.cells];
    for (let i = 0; i < 3 && pool.length; i++) {
      const pick = pool.reduce((bestCell, cell) => {
        const d = Math.min(
          Math.abs(cell.c - model.start.c) + Math.abs(cell.r - model.start.r),
          ...powers.map(p => Math.abs(cell.c - p.c) + Math.abs(cell.r - p.r))
        );
        return d > bestCell.d ? { cell, d } : bestCell;
      }, { cell: null, d: -1 }).cell;
      if (!pick) break;
      powers.push({ ...pick });
      pool.splice(pool.findIndex(cell => cell.c === pick.c && cell.r === pick.r), 1);
    }
    pellets = pellets.filter(p => !powers.some(power => power.c === p.c && power.r === p.r));
  }

  // Answer tokens go far from the player and far from each other, so every
  // question means crossing the maze
  function placeTokens() {
    const question = questions[current];
    const from = { c: Math.round(player.x), r: Math.round(player.y) };
    const dist = mzDistances(grid, from);
    const candidates = model.cells
      .filter(cell => dist[cell.r][cell.c] >= 4)
      .sort((a, b) => dist[b.r][b.c] - dist[a.r][a.c]);
    const pool = candidates.length >= question.options.length ? candidates : model.cells.slice();

    const chosen = [];
    for (const cell of pool) {
      if (chosen.length >= question.options.length) break;
      const spaced = chosen.every(other => Math.abs(other.c - cell.c) + Math.abs(other.r - cell.r) >= 4);
      const room = mzIsOpen(grid, cell.c - 1, cell.r) || mzIsOpen(grid, cell.c + 1, cell.r);
      if (spaced && room) chosen.push(cell);
    }
    for (const cell of pool) {
      if (chosen.length >= question.options.length) break;
      if (!chosen.some(other => other.c === cell.c && other.r === cell.r)) chosen.push(cell);
    }

    tokens = question.options.map((text, i) => ({ ...chosen[i], text, index: i, gone: false, flash: 0 }));
    pellets = pellets.filter(p => !tokens.some(t => t.c === p.c && t.r === p.r));
  }

  function startRound() {
    score = 0;
    answers = questions.map(() => ({ chosen: -1, tries: 0 }));
    current = 0;
    lives = difficulty.lives;
    over = false;
    paused = false;
    waiting = true;
    scaredFor = 0;
    pauseFor = 0;
    ghosts = [];
    resetActors();
    layPellets();
    placeTokens();
    renderAll();
    renderStart();
  }

  /* ─── Start and pause screen ─────────────────────────────── */
  function renderStart() {
    const paletteNote = `${difficulty.ghosts} ${difficulty.ghosts === 1 ? 'ghost' : 'ghosts'} · ` +
      `${difficulty.lives} lives · ${difficulty.bonus}× points` + (best ? ` · Best ${best} pts` : '');

    if (waiting) {
      startKicker.textContent = `${level} · Round ${puzzleIndex + 1} of ${levelData.puzzles.length}`;
      startTitle.textContent = puzzle.theme;
      startDesc.textContent = `${puzzle.description || ''} ${total} questions.`.trim();
      startGo.textContent = 'Start game →';
    } else {
      startKicker.textContent = 'Paused';
      startTitle.textContent = puzzle.theme;
      startDesc.textContent = `Question ${current + 1} of ${total} · ${score} points so far.`;
      startGo.textContent = 'Resume →';
    }
    startNote.textContent = paletteNote;
    startBack.href = document.getElementById('pz-back').href;
    startEl.hidden = false;
    startGo.focus({ preventScroll: true });
  }

  function beginPlay() {
    startEl.hidden = true;
    waiting = false;
    paused = false;
    readyFor = 1.6;
    renderHud();
  }

  /* ─── Movement ───────────────────────────────────────────── */

  function canGo(x, y, dir) {
    const c = Math.round(x) + dir[0];
    const r = Math.round(y) + dir[1];
    return mzIsOpen(grid, c, r);
  }

  // Moves along the corridor, stopping exactly on every tile centre it
  // crosses. Turns and ghost decisions only happen on those centres.
  function moveActor(actor, speed, dt, onCentre) {
    let remaining = speed * dt;

    for (let guard = 0; guard < 6 && remaining > 1e-9; guard++) {
      const cx = Math.round(actor.x);
      const cy = Math.round(actor.y);
      const atCentre = Math.abs(actor.x - cx) < 1e-6 && Math.abs(actor.y - cy) < 1e-6;

      if (atCentre) {
        actor.x = cx;
        actor.y = cy;
        if (onCentre) onCentre(actor);
        const want = actor.next || [0, 0];
        if ((want[0] || want[1]) && canGo(cx, cy, want)) {
          actor.dir = want;
          actor.next = [0, 0];
        }
        if (!canGo(cx, cy, actor.dir)) actor.dir = [0, 0];
      }
      if (!actor.dir[0] && !actor.dir[1]) return;

      // Centre of the tile straight ahead
      const tx = atCentre ? cx + actor.dir[0]
        : actor.dir[0] > 0 ? Math.ceil(actor.x) : actor.dir[0] < 0 ? Math.floor(actor.x) : actor.x;
      const ty = atCentre ? cy + actor.dir[1]
        : actor.dir[1] > 0 ? Math.ceil(actor.y) : actor.dir[1] < 0 ? Math.floor(actor.y) : actor.y;

      const distance = Math.abs(tx - actor.x) + Math.abs(ty - actor.y);
      const move = Math.min(remaining, distance);
      actor.x += actor.dir[0] * move;
      actor.y += actor.dir[1] * move;
      remaining -= move;
      if (distance - move < 1e-9) { actor.x = tx; actor.y = ty; }
    }
  }

  // Called by moveActor whenever a ghost is on a tile centre
  function ghostThink(ghost) {
    const back = [-ghost.dir[0], -ghost.dir[1]];
    let options = MZ_DIRS.filter(dir => canGo(ghost.x, ghost.y, dir));
    const forward = options.filter(dir => !(dir[0] === back[0] && dir[1] === back[1]));
    if (forward.length) options = forward;
    if (!options.length) return;

    if (Math.random() < difficulty.wander) {
      ghost.dir = options[Math.floor(Math.random() * options.length)];
      return;
    }

    const chase = scaredFor <= 0;
    ghost.dir = options.reduce((best, dir) => {
      const d = Math.hypot(ghost.x + dir[0] - player.x, ghost.y + dir[1] - player.y);
      const better = chase ? d < best.d : d > best.d;
      return better ? { dir, d } : best;
    }, { dir: options[0], d: chase ? Infinity : -Infinity }).dir;
  }

  /* ─── Game actions ───────────────────────────────────────── */
  function answer(token) {
    const question = questions[current];
    const state = answers[current];
    token.gone = true;
    token.flash = 1;
    token.correct = token.index === question.correct;

    if (token.correct) {
      score += Math.round((state.tries ? 60 : 100) * difficulty.bonus);
      state.chosen = token.index;
      toast(`“${question.options[question.correct]}” ✓ ${question.explain}`, 'ok');
      pauseFor = 1;
      if (answeredCount() === total) {
        finishRound();
      } else {
        current++;
        needTokens = true;
      }
    } else {
      state.tries++;
      score = Math.max(0, score - 40);
      toast(`“${token.text}” is not the answer. ${question.explain}`, 'warn');
    }
    renderAll();
  }

  function loseLife() {
    lives--;
    scaredFor = 0;
    if (lives <= 0) {
      over = true;
      renderAll();
      save();
      setTimeout(() => dialog.open(`Game over with ${score} points. You answered ${correctCount()} of ${total} questions.`), 700);
      return;
    }
    toast(`Caught! ${lives} ${lives === 1 ? 'life' : 'lives'} left.`, 'warn');
    resetActors();
    renderAll();
  }

  function finishRound() {
    over = true;
    const perfect = answers.every(a => a.tries === 0);
    score += Math.round(lives * 50 * difficulty.bonus);
    save();
    renderAll();
    setTimeout(() => dialog.open(
      `${correctCount()} of ${total} correct in “${puzzle.theme}” · ${score} points on ${difficulty.label}` +
      (perfect ? ', with no wrong answers!' : '.')
    ), 900);
  }

  function save() {
    best = Math.max(best, score);
    if (!isStarted() && !best) { MZ_STORE.set(puzzle.id, null); return; }
    MZ_STORE.set(puzzle.id, {
      sig: model.sig,
      best,
      correct: correctCount(),
      progress: answeredCount(),
      complete: wasComplete || answeredCount() === total
    });
    wasComplete = wasComplete || answeredCount() === total;
  }

  /* ─── Step ───────────────────────────────────────────────── */
  function step(dt) {
    if (waiting || paused || over || dialog.isOpen()) return;
    elapsed += dt;

    if (readyFor > 0) { readyFor -= dt; return; }
    if (pauseFor > 0) {
      pauseFor -= dt;
      tokens.forEach((t) => { if (t.flash > 0) t.flash = Math.max(0, t.flash - dt); });
      if (pauseFor <= 0 && needTokens) { needTokens = false; placeTokens(); }
      return;
    }

    moveActor(player, MZ_SPEED, dt);
    player.mouth = (player.mouth + dt * 9) % (Math.PI * 2);
    if (scaredFor > 0) scaredFor = Math.max(0, scaredFor - dt);

    const pc = Math.round(player.x);
    const pr = Math.round(player.y);

    const pelletAt = pellets.findIndex(p => p.c === pc && p.r === pr && Math.hypot(player.x - p.c, player.y - p.r) < 0.5);
    if (pelletAt >= 0) { pellets.splice(pelletAt, 1); score += 5; renderHud(); }

    const powerAt = powers.findIndex(p => p.c === pc && p.r === pr && Math.hypot(player.x - p.c, player.y - p.r) < 0.5);
    if (powerAt >= 0) {
      powers.splice(powerAt, 1);
      score += 20;
      scaredFor = MZ_SCARED;
      toast('Power pellet! Chase the ghosts.', 'ok');
      renderHud();
    }

    const token = tokens.find(t => !t.gone && t.c === pc && t.r === pr && Math.hypot(player.x - t.c, player.y - t.r) < 0.55);
    if (token) answer(token);

    for (const ghost of ghosts) {
      if (ghost.resting > 0) { ghost.resting -= dt; continue; }
      moveActor(ghost, ghost.speed * (scaredFor > 0 ? 0.6 : 1), dt, ghostThink);
      if (Math.hypot(ghost.x - player.x, ghost.y - player.y) < 0.75) {
        if (scaredFor > 0) {
          score += Math.round(150 * difficulty.bonus);
          sendGhostHome(ghost, 2.5);
          renderHud();
        } else {
          loseLife();
          return;
        }
      }
    }

    tokens.forEach((t) => { if (t.flash > 0) t.flash = Math.max(0, t.flash - dt); });
  }

  /* ─── Drawing ────────────────────────────────────────────── */
  let tile = 24;

  function resize() {
    const box = stageEl.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    // Stacked on phones: the board follows the width and the stage grows with it
    const stacked = window.matchMedia('(max-width: 900px)').matches;
    tile = stacked
      ? Math.max(14, Math.floor((box.width - 10) / MZ_COLS))
      : Math.max(14, Math.floor(Math.min(box.width / MZ_COLS, Math.max(220, box.height) / MZ_ROWS)));
    canvas.width = MZ_COLS * tile * ratio;
    canvas.height = MZ_ROWS * tile * ratio;
    canvas.style.width = `${MZ_COLS * tile}px`;
    canvas.style.height = `${MZ_ROWS * tile}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function roundRect(x, y, w, h, radii) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, radii); return; }
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }

  function drawWalls() {
    ctx.fillStyle = '#0a3580';
    for (let r = 0; r < MZ_ROWS; r++) {
      for (let c = 0; c < MZ_COLS; c++) {
        if (!grid[r][c]) continue;
        const up    = !mzIsOpen(grid, c, r - 1);
        const down  = !mzIsOpen(grid, c, r + 1);
        const left  = !mzIsOpen(grid, c - 1, r);
        const right = !mzIsOpen(grid, c + 1, r);
        const k = tile * 0.42;
        roundRect(c * tile, r * tile, tile, tile, [
          up || left ? 0 : k, up || right ? 0 : k, down || right ? 0 : k, down || left ? 0 : k
        ]);
        ctx.fill();
      }
    }
  }

  function drawPellets() {
    ctx.fillStyle = 'rgba(3, 45, 111, 0.25)';
    pellets.forEach((p) => {
      ctx.beginPath();
      ctx.arc((p.c + 0.5) * tile, (p.r + 0.5) * tile, tile * 0.09, 0, Math.PI * 2);
      ctx.fill();
    });

    const pulse = 0.18 + Math.sin(elapsed * 6) * 0.04;
    ctx.fillStyle = '#3fae7a';
    powers.forEach((p) => {
      ctx.beginPath();
      ctx.arc((p.c + 0.5) * tile, (p.r + 0.5) * tile, tile * pulse, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawTokens() {
    tokens.forEach((token) => {
      if (token.gone && token.flash <= 0) return;
      const x = (token.c + 0.5) * tile;
      const y = (token.r + 0.5) * tile;

      let size = Math.min(tile * 0.55, 17);
      ctx.font = `800 ${size}px 'Plus Jakarta Sans', system-ui, sans-serif`;
      const maxWidth = Math.max(tile * 3.2, 78);
      while (ctx.measureText(token.text).width > maxWidth && size > 9) {
        size -= 1;
        ctx.font = `800 ${size}px 'Plus Jakarta Sans', system-ui, sans-serif`;
      }
      const w = ctx.measureText(token.text).width + size * 1.1;
      const h = size * 1.9;
      // Tokens are wider than a tile: keep the whole pill inside the board
      const clampX = Math.min(Math.max(x, w / 2 + 2), MZ_COLS * tile - w / 2 - 2);
      const clampY = Math.min(Math.max(y, h / 2 + 2), MZ_ROWS * tile - h / 2 - 2);

      ctx.save();
      if (token.gone) ctx.globalAlpha = Math.max(0, Math.min(1, token.flash));
      ctx.fillStyle = token.gone ? (token.correct ? '#3fae7a' : '#d18180') : '#ffffff';
      ctx.strokeStyle = token.gone ? 'transparent' : '#032d6f';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(3, 45, 111, 0.35)';
      ctx.shadowBlur = tile * 0.4;
      roundRect(clampX - w / 2, clampY - h / 2, w, h, h / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (!token.gone) ctx.stroke();

      ctx.fillStyle = token.gone ? '#ffffff' : '#032d6f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(token.text, clampX, clampY + 1);
      ctx.restore();
    });
  }

  function drawPlayer() {
    const x = (player.x + 0.5) * tile;
    const y = (player.y + 0.5) * tile;
    const angle = Math.atan2(player.dir[1], player.dir[0]);
    const open = (Math.sin(player.mouth) * 0.5 + 0.5) * 0.32 + 0.04;

    ctx.fillStyle = '#a60404';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, tile * 0.42, angle + open, angle - open + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(ghost) {
    const x = (ghost.x + 0.5) * tile;
    const y = (ghost.y + 0.5) * tile;
    const radius = tile * 0.38;
    const tones = ['#d18180', '#8095b6', '#f2a7a6'];
    const scared = scaredFor > 0;

    ctx.save();
    if (ghost.resting > 0) ctx.globalAlpha = 0.35;
    ctx.fillStyle = scared ? (scaredFor < 2 && Math.floor(elapsed * 6) % 2 ? '#ffffff' : '#3fae7a') : tones[ghost.tone];
    ctx.beginPath();
    ctx.arc(x, y - radius * 0.15, radius, Math.PI, 0);
    ctx.lineTo(x + radius, y + radius * 0.75);
    for (let i = 0; i < 3; i++) {
      const step = (radius * 2) / 3;
      ctx.lineTo(x + radius - step * i - step / 2, y + radius * 0.45);
      ctx.lineTo(x + radius - step * (i + 1), y + radius * 0.75);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    [-0.36, 0.36].forEach((side) => {
      ctx.beginPath();
      ctx.arc(x + radius * side, y - radius * 0.25, radius * 0.27, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = scared ? '#23794f' : '#032d6f';
    [-0.36, 0.36].forEach((side) => {
      ctx.beginPath();
      ctx.arc(x + radius * side + player.dir[0] * radius * 0.1, y - radius * 0.25 + player.dir[1] * radius * 0.1, radius * 0.13, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawOverlay() {
    let message = '';
    if (dialog.isOpen()) message = '';
    else if (over) message = lives <= 0 ? 'Game over' : 'Round complete';
    else if (readyFor > 0) message = readyFor > 0.6 ? 'Ready…' : 'Go!';
    if (!message) return;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fillRect(0, (MZ_ROWS / 2 - 1) * tile, MZ_COLS * tile, tile * 2);
    ctx.fillStyle = '#032d6f';
    ctx.font = `800 ${Math.min(tile * 1.1, 34)}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, (MZ_COLS * tile) / 2, (MZ_ROWS * tile) / 2);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWalls();
    drawPellets();
    drawTokens();
    ghosts.forEach(drawGhost);
    drawPlayer();
    drawOverlay();
  }

  /* ─── HUD and panel ──────────────────────────────────────── */
  function renderHud() {
    livesEl.innerHTML = Array.from({ length: Math.max(lives, 0) }, () => '<span class="mz-life" aria-hidden="true"></span>').join('') +
      `<span class="sr-only">${Math.max(lives, 0)} lives left</span>`;
    scoreEl.textContent = score;
    bestEl.textContent = Math.max(best, score);
    counter.textContent = `${answeredCount()} / ${total}`;
    counter.classList.toggle('complete', answeredCount() === total);
    pauseBtn.textContent = over ? 'Play again' : 'Pause';
    pauseBtn.disabled = waiting;
    diffName.textContent = difficulty.label;
    resetBtn.disabled = !isStarted();
  }

  function renderQuestion() {
    const question = questions[current];
    barLabel.textContent = `Question ${current + 1} / ${total}`;
    promptEl.textContent = question.q;
    canvas.setAttribute('aria-label', `Maze. Question: ${question.q}`);
  }

  function renderList() {
    listEl.innerHTML = questions.map((question, i) => {
      const state = answers[i];
      const done = state.chosen >= 0;
      const cls = done ? (state.tries ? 'is-half' : 'is-ok') : (i === current ? 'is-current' : '');
      const meta = done
        ? `${question.options[question.correct]}${state.tries ? ` · ${state.tries} wrong ${state.tries === 1 ? 'try' : 'tries'}` : ''}`
        : `${question.options.length} answers`;
      return `<li class="mz-item ${cls}">
          <span class="mz-item-num">${i + 1}</span>
          <span class="mz-item-body">
            <span class="mz-item-q" lang="en">${escapeHTML(question.q)}</span>
            <span class="mz-item-meta" lang="en">${escapeHTML(meta)}</span>
          </span>
        </li>`;
    }).join('');
  }

  function renderAll() {
    renderHud();
    renderQuestion();
    renderList();
  }

  // Pausing opens the start screen again, where the difficulty can be changed
  function togglePause() {
    if (over || waiting) { if (over) startRound(); return; }
    paused = !paused;
    if (paused) renderStart(); else startEl.hidden = true;
    renderHud();
  }

  /* ─── Input ──────────────────────────────────────────────── */
  const KEYS = {
    ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0],
    w: [0, -1], d: [1, 0], s: [0, 1], a: [-1, 0]
  };

  function steer(dir) {
    if (waiting || paused || over || dialog.isOpen()) return;
    player.next = dir;
    if (!player.dir[0] && !player.dir[1] && canGo(player.x, player.y, dir)) player.dir = dir;
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const dir = KEYS[e.key] || KEYS[e.key.toLowerCase()];
    if (dir) { e.preventDefault(); steer(dir); return; }
    if (e.key === ' ' || e.key.toLowerCase() === 'p') {
      e.preventDefault();
      togglePause();
    }
  });

  padEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dir]');
    if (!btn) return;
    const [x, y] = btn.dataset.dir.split(',').map(Number);
    steer([x, y]);
  });

  // Swipe on the board
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!touchStart) return;
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.hypot(dx, dy) < 24) return;
    steer(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
    touchStart = null;
  }, { passive: true });

  pauseBtn.addEventListener('click', togglePause);

  startGo.addEventListener('click', () => {
    if (waiting) beginPlay();
    else { paused = false; startEl.hidden = true; renderHud(); }
  });

  resetBtn.addEventListener('click', () => {
    if (!isStarted()) return;
    if (!confirm(`This will restart “${puzzle.theme}” from the first question.\n\nContinue?`)) return;
    startRound();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !over && !waiting && !paused) togglePause();
  });

  new ResizeObserver(() => { resize(); draw(); }).observe(stageEl);

  /* ─── Loop ───────────────────────────────────────────────── */
  let last = performance.now();
  let carry = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    carry += dt;
    while (carry > 1 / 120) { step(1 / 120); carry -= 1 / 120; }
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  startRound();
  requestAnimationFrame(frame);

  // Debug and test handle: drive the game without waiting for real time
  window.__maze = {
    state: () => ({ player, ghosts, tokens, current, score, lives, over, paused, waiting, answers, difficulty }),
    step,
    begin: beginPlay,
    steer,
    tokens: () => tokens,
    warpTo: (c, r) => { player.x = c; player.y = r; player.dir = [0, 0]; readyFor = 0; pauseFor = 0; }
  };
}

/* ─── Init ──────────────────────────────────────────────────── */

mzDifficulty.init();

startPuzzleActivity(ACTIVITIES.maze, {
  store: MZ_STORE,
  buildModel: buildMaze,
  preview: mazePreview,
  meta: mazeMeta,
  statusText: mazeStatus,
  renderPuzzle: renderMaze
});
