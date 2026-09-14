/* Hangman — requires scripts/common.js and scripts/puzzles.js */

const HM_STORE          = createProgressStore('heyTeacher:hangman');
const HM_LAYOUT_VERSION = 1;     // bump when word handling changes (invalidates saved progress)
const HM_PARTS          = 10;    // drawing steps; levels with fewer lives start partly drawn
const HM_ALPHABET       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Drawing steps in order: gallows first (steps 0–3), then the figure
const HM_DRAWING = [
  '<path d="M20 214 H132"/>',
  '<path d="M52 214 V18"/>',
  '<path d="M52 18 H146 M52 54 L88 18"/>',
  '<path d="M146 18 V48"/>',
  '<circle cx="146" cy="70" r="22"/>',
  '<path d="M146 92 V150"/>',
  '<path d="M146 108 L120 134"/>',
  '<path d="M146 108 L172 134"/>',
  '<path d="M146 150 L124 190"/>',
  '<path d="M146 150 L168 190"/>'
];
const HM_FIGURE_START = 4;

const HM_HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.2 4.5 6 4.5c2.2 0 3.5 1.3 4 2.3.5-1 1.8-2.3 4-2.3 3.8 0 5.6 3.9 4 7.2C19.5 16.4 12 21 12 21z"/></svg>';

/* ─── Model ─────────────────────────────────────────────────── */

function buildHangman(puzzle, levelData) {
  const lives = Math.min(HM_PARTS, Math.max(1, Math.round(levelData.lives || 6)));
  const clueOnRequest = levelData.clue === 'on-request';

  const words = puzzle.words
    .map(w => {
      const answer = w.answer.trim().replace(/\s+/g, ' ').toUpperCase();
      const letters = toGridLetters(answer);
      return {
        answer,
        letters,
        unique: [...new Set(letters)],
        clue: w.clue,
        enumeration: enumeration(w.answer)
      };
    })
    .filter(w => w.letters.length)
    .map((w, index) => ({ ...w, index }));

  const sig = hashString([HM_LAYOUT_VERSION, lives, ...words.map(w => w.answer)].join('|')).toString(36);
  return { id: puzzle.id, sig, lives, clueOnRequest, words };
}

/* ══════════════════════════════════════════════════════════════
   THEME CARDS
══════════════════════════════════════════════════════════════ */

// One row of blank tiles per word, colored by result
function hangmanPreview(model, saved) {
  const states = (saved && saved.words) || [];
  const width = Math.max(...model.words.map(w => w.answer.length));
  const rowH = 1.8;

  const rects = model.words.map((word, row) => {
    const st = states[word.index] || {};
    const result = st.s === 'won' || st.s === 'lost' ? st.s : '';
    const offset = (width - word.answer.length) / 2;
    return [...word.answer].map((ch, col) => {
      if (!/[A-Z]/.test(ch)) return '';
      const cls = result || (st.g && st.g.includes(ch) ? 'on' : '');
      return `<rect x="${offset + col + 0.1}" y="${row * rowH}" width="0.8" height="1.1" rx="0.18"${cls ? ` class="${cls}"` : ''}/>`;
    }).join('');
  }).join('');

  return `<svg class="hm-preview" viewBox="0 0 ${width} ${model.words.length * rowH - 0.7}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${rects}</svg>`;
}

function hangmanMeta(model) {
  return `${model.words.length} words · ${model.lives} lives${model.clueOnRequest ? ' · clues on request' : ''}`;
}

/* ══════════════════════════════════════════════════════════════
   GAME
══════════════════════════════════════════════════════════════ */

function renderHangman({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { words, lives } = model;

  /* ─── Elements ───────────────────────────────────────────── */
  const barEl       = document.getElementById('hm-bar');
  const barLabel    = document.getElementById('hm-bar-label');
  const barText     = document.getElementById('hm-bar-text');
  const stageEl     = document.getElementById('hm-stage');
  const drawingEl   = document.getElementById('hm-drawing');
  const livesEl     = document.getElementById('hm-lives');
  const playEl      = document.getElementById('hm-play');
  const wordEl      = document.getElementById('hm-word');
  const statusEl    = document.getElementById('hm-status');
  const keysEl      = document.getElementById('hm-keys');
  const guessForm   = document.getElementById('hm-guess');
  const guessInput  = document.getElementById('hm-guess-input');
  const scoreEl     = document.getElementById('hm-score');
  const roundEl     = document.getElementById('hm-round');
  const counter     = document.getElementById('progress-counter');
  const resetBtn    = document.getElementById('reset-btn');

  const toast  = createToast();
  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex });

  counter.title = 'Words played';

  /* ─── State ──────────────────────────────────────────────── */
  const freshState = () => ({ guessed: '', penalty: 0, status: 'playing', clue: false });
  const states = words.map(freshState);
  let current = 0;
  let wasComplete = false;
  let dialogTimer = null;

  const saved = HM_STORE.get(puzzle.id, model.sig);
  if (saved) {
    (saved.words || []).forEach((s, i) => {
      if (!states[i] || !s) return;
      states[i].guessed = String(s.g || '').replace(/[^A-Z]/g, '');
      states[i].penalty = Math.max(0, Number(s.p) || 0);
      states[i].status = s.s === 'won' || s.s === 'lost' ? s.s : 'playing';
      states[i].clue = !!s.c;
    });
    if (Number.isInteger(saved.current) && words[saved.current]) current = saved.current;
  }

  // Wrong letters plus lives spent on hints and wrong whole-word guesses
  const wrongCount = i => [...states[i].guessed].filter(ch => !words[i].letters.includes(ch)).length + states[i].penalty;
  const livesLeft  = i => Math.max(0, lives - wrongCount(i));
  const isStarted  = s => !!(s.guessed || s.penalty || s.clue || s.status !== 'playing');
  const finished   = () => states.filter(s => s.status !== 'playing').length;
  const wonCount   = () => states.filter(s => s.status === 'won').length;

  /* ─── Static markup ──────────────────────────────────────── */
  drawingEl.innerHTML = `
    <g class="hm-ghost">${HM_DRAWING.join('')}</g>
    <g>${HM_DRAWING.map((part, i) =>
      part.replace(/^<(\w+)/, `<$1 pathLength="1" class="hm-part${i >= HM_FIGURE_START ? ' is-figure' : ''}"`)
    ).join('')}</g>
    <path class="hm-face" d="M135 63 l6 6 m0 -6 l-6 6 M151 63 l6 6 m0 -6 l-6 6"/>`;
  const partEls = [...drawingEl.querySelectorAll('.hm-part')];

  const keyEls = new Map();
  [...HM_ALPHABET].forEach(ch => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hm-key';
    btn.textContent = ch;
    btn.setAttribute('aria-label', `Guess ${ch}`);
    btn.addEventListener('mousedown', e => e.preventDefault());   // keep Enter free for "next word"
    btn.addEventListener('click', () => guessLetter(ch));
    keysEl.appendChild(btn);
    keyEls.set(ch, btn);
  });

  /* ─── Rendering ──────────────────────────────────────────── */
  function renderBar() {
    const word = words[current];
    const st = states[current];
    barLabel.textContent = `Word ${current + 1} / ${words.length}`;
    barEl.classList.toggle('is-ok', st.status === 'won');
    barEl.classList.toggle('is-muted', st.status === 'lost');

    if (st.status !== 'playing') {
      barText.innerHTML = `<span class="hm-bar-answer">${escapeHTML(word.answer)}</span> <span class="hm-bar-clue">— ${escapeHTML(word.clue)}</span>`;
    } else if (!model.clueOnRequest || st.clue) {
      barText.innerHTML = `${escapeHTML(word.clue)} <span class="hm-enum">(${word.enumeration})</span>`;
    } else {
      barText.innerHTML = `<span class="hm-bar-hidden">The clue is hidden.</span> <button type="button" class="hm-clue-btn" data-show-clue>Show clue</button>`;
    }
  }

  function renderDrawing() {
    const st = states[current];
    const shown = st.status === 'lost'
      ? HM_PARTS
      : Math.min(HM_PARTS, HM_PARTS - lives + wrongCount(current));
    partEls.forEach((el, i) => el.classList.toggle('is-on', i < shown));
    drawingEl.classList.toggle('is-lost', st.status === 'lost');
    drawingEl.classList.toggle('is-won', st.status === 'won');
  }

  function renderLives() {
    const left = states[current].status === 'lost' ? 0 : livesLeft(current);
    livesEl.innerHTML =
      Array.from({ length: lives }, (_, i) => `<span class="hm-heart${i < left ? ' is-full' : ''}">${HM_HEART}</span>`).join('') +
      `<span class="hm-lives-text">${left} ${left === 1 ? 'life' : 'lives'} left</span>`;
  }

  // animate: a letter to pop, '*' for the missed letters, '**' for every tile
  function renderWord(animate = null) {
    const word = words[current];
    const st = states[current];
    let tile = 0;

    wordEl.classList.toggle('is-won', st.status === 'won');
    wordEl.classList.toggle('is-lost', st.status === 'lost');
    wordEl.innerHTML = word.answer.split(' ').map(group => `<span class="hm-group">${
      [...group].map(ch => {
        if (!/[A-Z]/.test(ch)) return `<span class="hm-punct">${escapeHTML(ch)}</span>`;
        const shown = st.guessed.includes(ch);
        const missed = !shown && st.status === 'lost';
        const pop = (shown && (animate === ch || animate === '**')) || (missed && animate === '*');
        const cls = `hm-tile${shown ? ' is-shown' : ''}${missed ? ' is-missed' : ''}${pop ? ' is-new' : ''}`;
        return `<span class="${cls}" style="--i:${tile++}">${shown || missed ? ch : ''}</span>`;
      }).join('')
    }</span>`).join('');

    const pattern = [...word.answer].map(ch => (/[A-Z]/.test(ch) && !st.guessed.includes(ch) && st.status === 'playing' ? '_' : ch)).join(' ');
    wordEl.setAttribute('aria-label', `Word ${current + 1}: ${pattern}`);
    fitTiles();
  }

  function renderKeys() {
    const word = words[current];
    const st = states[current];
    keyEls.forEach((btn, ch) => {
      const tried = st.guessed.includes(ch);
      btn.classList.toggle('is-hit', tried && word.letters.includes(ch));
      btn.classList.toggle('is-miss', tried && !word.letters.includes(ch));
      btn.disabled = tried || st.status !== 'playing';
    });
  }

  function renderRound() {
    scoreEl.innerHTML = `
      <span class="hm-score-num">${wonCount()}</span>
      <span class="hm-score-of">/ ${words.length}</span>
      <span class="hm-score-label">Guessed</span>`;

    roundEl.innerHTML = '';
    words.forEach((word, i) => {
      const st = states[i];
      const mistakes = wrongCount(i);
      let title = `Word ${i + 1}`;
      let meta = `${word.letters.length} letters${word.answer.includes(' ') ? ` · ${word.answer.split(' ').length} words` : ''}`;
      if (st.status === 'won') {
        title = escapeHTML(word.answer);
        meta = `Guessed · ${mistakes} mistake${mistakes === 1 ? '' : 's'}`;
      } else if (st.status === 'lost') {
        title = escapeHTML(word.answer);
        meta = 'Missed';
      } else if (isStarted(st)) {
        meta = `In progress · ${livesLeft(i)} ${livesLeft(i) === 1 ? 'life' : 'lives'} left`;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `hm-round-item is-${st.status}${i === current ? ' is-current' : ''}${st.status === 'playing' && isStarted(st) ? ' is-started' : ''}`;
      btn.setAttribute('aria-current', i === current ? 'true' : 'false');
      btn.innerHTML = `
        <span class="hm-round-num">${i + 1}</span>
        <span class="hm-round-body">
          <span class="hm-round-title">${title}</span>
          <span class="hm-round-meta">${meta}</span>
        </span>`;
      btn.addEventListener('click', () => goTo(i));

      const li = document.createElement('li');
      li.appendChild(btn);
      roundEl.appendChild(li);
    });
  }

  // withNext adds the "Next word" button after the message
  function setStatus(html, tone = '', withNext = false) {
    const label = finished() === words.length ? 'See results' : 'Next word';
    statusEl.innerHTML = `<span>${html}</span>${withNext ? `<button type="button" class="hm-next" data-next>${label} →</button>` : ''}`;
    statusEl.className = `hm-status${tone ? ` ${tone}` : ''}`;
  }

  function defaultStatus() {
    const st = states[current];
    if (st.status === 'won') setStatus('<b>Guessed!</b>', 'ok', true);
    else if (st.status === 'lost') setStatus('<b>Missed.</b>', 'warn', true);
    else if (isStarted(st)) setStatus('Keep going: pick a letter or guess the whole word.');
    else setStatus('Pick a letter with the keys below or your keyboard.');
  }

  function shake() {
    drawingEl.classList.remove('is-shake');
    void drawingEl.getBoundingClientRect();
    drawingEl.classList.add('is-shake');
  }

  // Largest tile size that keeps every word of the answer on one line
  function fitTiles() {
    const stacked = window.matchMedia('(max-width: 900px)').matches;
    const availW = playEl.clientWidth - 8;
    const availH = stacked ? 240 : Math.max(120, stageEl.clientHeight * 0.55);
    const groups = words[current].answer.split(' ').map(g => g.length);
    let size = 18;

    for (let s = stacked ? 44 : 68; s >= 18; s -= 2) {
      const inner = s * 0.14, between = s * 0.7, rowGap = s * 0.4;
      let lines = 1, lineW = 0, fits = true;
      for (const len of groups) {
        const w = len * s + (len - 1) * inner;
        if (w > availW) { fits = false; break; }
        if (!lineW) lineW = w;
        else if (lineW + between + w > availW) { lines++; lineW = w; }
        else lineW += between + w;
      }
      if (fits && lines * s * 1.2 + (lines - 1) * rowGap <= availH) { size = s; break; }
    }
    wordEl.style.setProperty('--tile', `${size}px`);
  }

  /* ─── Progress ───────────────────────────────────────────── */
  function commit(animate = null) {
    renderBar();
    renderDrawing();
    renderLives();
    renderWord(animate);
    renderKeys();
    renderRound();

    const done = finished();
    const complete = done === words.length;
    counter.textContent = `${done} / ${words.length}`;
    counter.classList.toggle('complete', complete);
    resetBtn.disabled = !states.some(isStarted);

    if (!states.some(isStarted)) {
      HM_STORE.set(puzzle.id, null);
    } else {
      HM_STORE.set(puzzle.id, {
        sig: model.sig,
        current,
        words: states.map(s => ({ g: s.guessed, p: s.penalty, s: s.status, c: s.clue ? 1 : 0 })),
        progress: done,
        complete
      });
    }

    if (complete && !wasComplete) {
      clearTimeout(dialogTimer);
      dialogTimer = setTimeout(openDialog, 1800);
    }
    wasComplete = complete;
  }

  function openDialog() {
    clearTimeout(dialogTimer);
    if (dialog.isOpen()) return;
    const won = wonCount();
    dialog.open(won === words.length
      ? `You guessed all ${words.length} words in “${puzzle.theme}”!`
      : `You guessed ${won} of ${words.length} words in “${puzzle.theme}”.`);
  }

  /* ─── Game actions ───────────────────────────────────────── */
  // Checks for a win or a loss, re-renders and announces the result
  function resolve(animate = null) {
    const word = words[current];
    const st = states[current];
    if (st.status === 'playing') {
      if (word.unique.every(ch => st.guessed.includes(ch))) st.status = 'won';
      else if (wrongCount(current) >= lives) st.status = 'lost';
    }
    if (st.status === 'lost') animate = '*';
    commit(animate);

    if (st.status === 'won') setStatus('<b>Well done!</b>', 'ok', true);
    else if (st.status === 'lost') setStatus(`<b>${livesLeft(current) ? 'Answer shown.' : 'Out of lives.'}</b>`, 'warn', true);
  }

  function guessLetter(ch) {
    const st = states[current];
    if (st.status !== 'playing' || !guessForm.hidden || dialog.isOpen()) return;
    if (st.guessed.includes(ch)) {
      setStatus(`You already tried <b>${ch}</b>.`);
      return;
    }
    st.guessed += ch;
    const hits = [...words[current].letters].filter(l => l === ch).length;
    if (hits) {
      const times = hits === 1 ? 'once' : hits === 2 ? 'twice' : `${hits} times`;
      setStatus(`Yes! <b>${ch}</b> appears ${times}.`, 'ok');
    } else {
      setStatus(`Sorry, there is no <b>${ch}</b>.`, 'warn');
      shake();
    }
    resolve(ch);
  }

  function showClue() {
    const st = states[current];
    if (!model.clueOnRequest || st.clue) return;
    st.clue = true;
    commit();
  }

  function revealLetter() {
    const st = states[current];
    if (st.status !== 'playing') { toast('This word is already finished.'); return; }
    if (livesLeft(current) <= 1) { toast('Not enough lives left to reveal a letter.', 'warn'); return; }
    const ch = [...words[current].letters].find(l => !st.guessed.includes(l));
    st.guessed += ch;
    st.penalty += 1;
    setStatus(`Revealed <b>${ch}</b> for one life.`, 'warn');
    resolve(ch);
  }

  function showAnswer() {
    const st = states[current];
    if (st.status !== 'playing') { toast('This word is already finished.'); return; }
    if (!confirm('Show the answer? This word will count as missed.')) return;
    st.status = 'lost';
    resolve();
  }

  function openGuess() {
    if (states[current].status !== 'playing') { toast('This word is already finished.'); return; }
    guessForm.hidden = false;
    keysEl.hidden = true;
    guessInput.value = '';
    guessInput.focus();
  }

  function closeGuess() {
    guessForm.hidden = true;
    keysEl.hidden = false;
  }

  function submitGuess() {
    const typed = guessInput.value.trim();
    const attempt = toGridLetters(typed);
    if (!attempt) { guessInput.focus(); return; }

    const word = words[current];
    const st = states[current];
    closeGuess();

    if (attempt === word.letters) {
      word.unique.forEach(ch => { if (!st.guessed.includes(ch)) st.guessed += ch; });
      resolve('**');
    } else {
      st.penalty += 1;
      setStatus(`<b>${escapeHTML(typed.toUpperCase())}</b> is not the answer. You lose a life.`, 'warn');
      shake();
      resolve();
    }
  }

  function goTo(i) {
    if (i < 0 || i >= words.length || dialog.isOpen()) return;
    current = i;
    closeGuess();
    commit(states[i].status === 'playing' ? null : '**');
    defaultStatus();
  }

  function nextWord() {
    for (let k = 1; k <= words.length; k++) {
      const i = (current + k) % words.length;
      if (states[i].status === 'playing') { goTo(i); return; }
    }
    openDialog();
  }

  /* ─── Events ─────────────────────────────────────────────── */
  document.addEventListener('keydown', (e) => {
    if (dialog.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target.closest ? e.target : document.body;
    if (target.closest('input, textarea, select')) return;
    const onControl = target.closest('button, a');

    if (/^[a-z]$/i.test(e.key)) {
      e.preventDefault();
      guessLetter(e.key.toUpperCase());
    } else if (e.key === 'Enter' && !onControl && states[current].status !== 'playing') {
      e.preventDefault();
      nextWord();
    } else if (e.key === 'ArrowRight' && !onControl) {
      goTo(current + 1);
    } else if (e.key === 'ArrowLeft' && !onControl) {
      goTo(current - 1);
    }
  });

  guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitGuess();
  });
  guessInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGuess();
  });
  document.getElementById('hm-guess-cancel').addEventListener('click', closeGuess);

  statusEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) nextWord();
  });
  barText.addEventListener('click', (e) => {
    if (e.target.closest('[data-show-clue]')) showClue();
  });

  document.getElementById('hm-prev-word').addEventListener('click', () => goTo(current - 1));
  document.getElementById('hm-next-word').addEventListener('click', () => goTo(current + 1));

  document.querySelectorAll('#pz-puzzle .pz-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'guess-word') openGuess();
      else if (action === 'reveal-letter') revealLetter();
      else if (action === 'show-answer') showAnswer();
    });
  });

  resetBtn.addEventListener('click', () => {
    if (!states.some(isStarted)) return;
    if (!confirm(`This will restart the whole round “${puzzle.theme}”.\n\nContinue?`)) return;
    states.forEach((s, i) => { states[i] = freshState(); });
    wasComplete = false;
    goTo(0);
  });

  new ResizeObserver(() => fitTiles()).observe(stageEl);

  /* ─── Initial render ─────────────────────────────────────── */
  wasComplete = finished() === words.length;
  commit();
  defaultStatus();
}

/* ─── Init ──────────────────────────────────────────────────── */

startPuzzleActivity(ACTIVITIES.hangman, {
  store: HM_STORE,
  buildModel: buildHangman,
  preview: hangmanPreview,
  meta: hangmanMeta,
  renderPuzzle: renderHangman
});
