/* Grammar quiz show — requires scripts/common.js and scripts/puzzles.js */

const QZ_STORE          = createProgressStore('heyTeacher:quiz');
const QZ_PREFS_KEY      = 'heyTeacher:quiz:prefs';
const QZ_LAYOUT_VERSION = 1;     // bump when question handling changes (invalidates saved progress)

const QZ_POINTS = {
  base:   100,
  speed:  50,     // maximum bonus, scaled by the time left
  streak: 25,     // bonus for each correct answer once on a streak
  steal:  50
};
const QZ_STREAK_FROM    = 3;
const QZ_TIMER_OPTIONS  = [0, 10, 15, 20, 30, 45, 60, 90];   // seconds per question; 0 = no timer
const QZ_STEAL_SECONDS  = 15;
const QZ_FRIEND_SECONDS = 20;
const QZ_SUSPENSE_MS    = 900;   // "final answer" pause before revealing a choice
const QZ_CHECK_MS       = 450;

const QZ_TYPES = {
  choice:    { name: 'Multiple choice',   task: 'Choose the correct option' },
  truefalse: { name: 'Correct or not?',   task: 'Is this sentence correct?' },
  order:     { name: 'Word order',        task: 'Put the words in order' },
  spot:      { name: 'Find the mistake',  task: 'Tap the word that is wrong' },
  type:      { name: 'Fill the gap',      task: 'Type the missing words' }
};

const QZ_LIFELINES = {
  fifty:  { label: '50:50',         hint: 'Take away some wrong answers' },
  friend: { label: 'Ask a friend',  hint: `Pause the clock for ${QZ_FRIEND_SECONDS} seconds to talk it over` },
  double: { label: 'Double points', hint: 'Double the points for this question if you get it right' }
};

const QZ_TEAMS = [
  { name: 'Red Team',  cls: 'is-red' },
  { name: 'Blue Team', cls: 'is-blue' }
];

const qzIcon = (paths, extra = '') =>
  `<svg class="qz-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${paths}</svg>`;

const QZ_ICONS = {
  fifty:    qzIcon('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
  friend:   qzIcon('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.7-.8L3 21l1.9-5A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/>'),
  double:   '<span class="qz-x2" aria-hidden="true">×2</span>',
  flame:    qzIcon('<path d="M12 22c4 0 7-2.7 7-6.8 0-3.2-2-5.6-3.6-7.3-.3 1.9-1.2 3.1-2.4 3.6.4-3.3-.9-6.6-4-8.5.3 3-1 4.9-2.5 6.7C5.1 11.5 5 13.2 5 15.2 5 19.3 8 22 12 22z" fill="currentColor" stroke="none"/>'),
  star:     qzIcon('<path d="M12 2.8l2.8 5.7 6.3.9-4.5 4.4 1 6.2L12 17l-5.6 3 1-6.2L2.9 9.4l6.3-.9z" fill="currentColor" stroke="none"/>'),
  trophy:   qzIcon('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>'),
  check:    qzIcon('<path d="M20 6L9 17l-5-5"/>'),
  cross:    qzIcon('<path d="M18 6L6 18M6 6l12 12"/>'),
  play:     qzIcon('<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>'),
  pause:    qzIcon('<path d="M9 5v14M15 5v14"/>'),
  clock:    qzIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  list:     qzIcon('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  user:     qzIcon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
  teams:    qzIcon('<circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.8"/><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M14 14.3c3.3-.6 7 1.6 7 5.7"/>'),
  soundOn:  qzIcon('<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: qzIcon('<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>')
};

/* ─── Helpers ───────────────────────────────────────────────── */

// Lenient comparison for typed answers and word order
function qzNormalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim();
}

function qzCapitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function qzShuffle(items, seedText) {
  const rand = seededRandom(hashString(seedText));
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// "where / did you / go?" -> { chunks: ['where', 'did you', 'go'], end: '?' }
function qzChunks(text) {
  const trimmed = String(text).trim();
  const end = (trimmed.match(/[.!?]+$/) || [''])[0];
  const body = end ? trimmed.slice(0, -end.length) : trimmed;
  return { chunks: body.split('/').map(c => c.trim()).filter(Boolean), end };
}

// "He [don't] like coffee." -> tokens; words in brackets are the mistake
function qzTokens(sentence) {
  const tokens = [];
  const re = /\[([^\]]+)\](\S*)|(\S+)/g;
  let m;
  while ((m = re.exec(sentence))) {
    if (m[1] !== undefined) {
      const words = m[1].trim().split(/\s+/);
      words.forEach((w, i) => tokens.push({ text: w + (i === words.length - 1 ? m[2] : ''), wrong: true }));
    } else {
      tokens.push({ text: m[3], wrong: false });
    }
  }
  return tokens.map((t, index) => ({ ...t, index, word: /[A-Za-z0-9]/.test(t.text) }));
}

// "had known" -> "h__ k____"
function qzLetterHint(answer) {
  return answer.replace(/[A-Za-z]/g, (ch, i, s) => (i === 0 || !/[A-Za-z]/.test(s[i - 1]) ? ch : '_'));
}

// Escaped prompt with the gap, a muted "(hint)" and an optional "source →" line
function qzPromptHTML(prompt, gapHTML) {
  let text = escapeHTML(prompt);
  let hint = '';
  const hintMatch = text.match(/\s*\(([^()]*)\)\s*$/);
  if (hintMatch) {
    hint = ` <span class="qz-hint">(${hintMatch[1]})</span>`;
    text = text.slice(0, hintMatch.index);
  }
  let source = '';
  const parts = text.split(' → ');
  if (parts.length === 2) {
    source = `<span class="qz-source">${parts[0]}</span>`;
    text = parts[1];
  }
  return `${source}<span class="qz-sentence">${text.replace('___', gapHTML)}${hint}</span>`;
}

function qzReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ─── Model ─────────────────────────────────────────────────── */

function buildQuestion(raw, index, puzzleId) {
  const seed = `${puzzleId}|${index}`;
  const q = { index, type: QZ_TYPES[raw.type] ? raw.type : 'choice', explain: raw.explain || '' };

  if (q.type === 'choice') {
    q.prompt = raw.prompt;
    q.answer = raw.options[0];
    q.options = qzShuffle(raw.options.map((text, i) => ({ text, correct: i === 0 })), seed)
      .map((o, i) => ({ ...o, index: i }));
  } else if (q.type === 'truefalse') {
    q.sentence = raw.sentence;
    q.answer = raw.answer === true;
    q.fix = raw.fix || '';
    q.options = [
      { text: 'Correct',   index: 0, correct: q.answer },
      { text: 'Incorrect', index: 1, correct: !q.answer }
    ];
  } else if (q.type === 'order') {
    const { chunks, end } = qzChunks(raw.answer);
    q.chunks = chunks;
    q.end = end;
    q.answer = qzCapitalize(chunks.join(' ')) + end;
    q.valid = [chunks, ...(raw.alt || []).map(a => qzChunks(a).chunks)]
      .map(list => list.map(qzNormalize).join(' '));
    // Shuffle, but never show a valid sentence already in order
    const bank = qzShuffle(chunks.map((text, id) => ({ id, text })), seed);
    for (let k = 0; k < bank.length && q.valid.includes(bank.map(c => qzNormalize(c.text)).join(' ')); k++) {
      bank.push(bank.shift());
    }
    q.bank = bank;
  } else if (q.type === 'spot') {
    q.tokens = qzTokens(raw.sentence);
    q.fix = raw.fix || '';
    q.answer = q.fix;
  } else {
    q.prompt = raw.prompt;
    q.answers = raw.answers || [];
    q.accepted = q.answers.map(qzNormalize);
    q.answer = q.answers[0] || '';
  }
  return q;
}

function buildQuiz(puzzle, levelData) {
  const questions = puzzle.questions.map((raw, i) => buildQuestion(raw, i, puzzle.id));
  const timer = Math.max(0, Math.round(Number(levelData.timer ?? 30) || 0));   // suggested seconds per question
  const lifelines = (levelData.lifelines || Object.keys(QZ_LIFELINES)).filter(id => QZ_LIFELINES[id]);
  const sig = hashString([QZ_LAYOUT_VERSION, JSON.stringify(puzzle.questions)].join('|')).toString(36);
  return { id: puzzle.id, sig, timer, lifelines, questions };
}

/* ══════════════════════════════════════════════════════════════
   TOPIC CARDS
══════════════════════════════════════════════════════════════ */

// A prize ladder: one bar per question, the first one at the bottom
function quizPreview(model, saved) {
  const results = (saved && saved.results) || [];
  const n = model.questions.length;
  const rowH = 10;
  const gap = 3.2;

  const bars = model.questions.map((_, i) => {
    const width = 100 - (i * 46) / Math.max(1, n - 1);
    const y = (n - 1 - i) * (rowH + gap);
    const r = results[i];
    const cls = !r ? '' : r.r === 'correct' ? 'ok' : 'miss';
    return `<rect x="${(100 - width) / 2}" y="${y}" width="${width}" height="${rowH}" rx="3"${cls ? ` class="${cls}"` : ''}/>`;
  }).join('');

  return `<svg class="qz-preview" viewBox="0 0 100 ${n * (rowH + gap) - gap}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${bars}</svg>`;
}

function quizMeta(model) {
  const lifelines = model.lifelines.length;
  return `${model.questions.length} questions · ${lifelines} lifeline${lifelines === 1 ? '' : 's'}`;
}

function quizStatus(model, saved) {
  if (saved && saved.complete) {
    const [a = 0, b = 0] = (saved.players || []).map(p => Number(p && p.s) || 0);
    if (saved.mode !== 'teams') return { cls: 'complete', text: `${a} pts` };
    return { cls: 'complete', text: a === b ? 'Tie game' : `${QZ_TEAMS[a > b ? 0 : 1].name} won` };
  }
  if (saved) return { cls: 'progress', text: `${saved.progress || 0} / ${model.questions.length} questions` };
  return { cls: '', text: 'Not started' };
}

/* ─── Preferences (time per level, sound, last mode) ────────── */

function qzLoadPrefs() {
  const defaults = { sound: true, mode: 'solo', timers: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(QZ_PREFS_KEY) || '{}');
    const timers = saved.timers && typeof saved.timers === 'object' ? saved.timers : {};
    return { sound: saved.sound !== false, mode: saved.mode === 'teams' ? 'teams' : 'solo', timers: { ...timers } };
  } catch {
    return defaults;
  }
}

function qzSavePrefs(prefs) {
  try { localStorage.setItem(QZ_PREFS_KEY, JSON.stringify(prefs)); }
  catch { /* storage unavailable */ }
}

/* ─── Sound effects (synthesized, no audio files) ───────────── */

function createQuizSound(isOn) {
  let ctx = null;

  function audio() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function note(c, freq, at, dur, { type = 'sine', gain = 0.14, to = null } = {}) {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(amp);
    amp.connect(c.destination);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  const SOUNDS = {
    tap:      (c, t) => note(c, 540, t, 0.06, { type: 'triangle', gain: 0.07 }),
    tick:     (c, t) => note(c, 1350, t, 0.045, { type: 'square', gain: 0.03 }),
    lock:     (c, t) => { note(c, 330, t, 0.12, { type: 'triangle' }); note(c, 494, t + 0.13, 0.22, { type: 'triangle' }); },
    correct:  (c, t) => [523, 659, 784, 1047].forEach((f, i) => note(c, f, t + i * 0.08, 0.3, { type: 'triangle', gain: 0.13 })),
    wrong:    (c, t) => note(c, 190, t, 0.45, { type: 'sawtooth', gain: 0.06, to: 95 }),
    timeup:   (c, t) => { note(c, 440, t, 0.16, { type: 'square', gain: 0.045 }); note(c, 311, t + 0.19, 0.34, { type: 'square', gain: 0.045 }); },
    count:    (c, t) => note(c, 660, t, 0.14, { gain: 0.13 }),
    go:       (c, t) => note(c, 988, t, 0.4, { gain: 0.15 }),
    lifeline: (c, t) => note(c, 320, t, 0.38, { gain: 0.11, to: 1280 }),
    steal:    (c, t) => { note(c, 392, t, 0.1, { type: 'square', gain: 0.045 }); note(c, 587, t + 0.11, 0.18, { type: 'square', gain: 0.045 }); },
    fanfare:  (c, t) => [[523, 0, 0.2], [659, 0.14, 0.2], [784, 0.28, 0.2], [1047, 0.42, 0.3], [784, 0.66, 0.16], [1047, 0.8, 0.7]]
      .forEach(([f, d, len]) => note(c, f, t + d, len, { type: 'triangle', gain: 0.14 }))
  };

  return {
    play(name) {
      if (!isOn() || !SOUNDS[name]) return;
      try {
        const c = audio();
        if (c) SOUNDS[name](c, c.currentTime + 0.01);
      } catch { /* audio is a nice-to-have */ }
    }
  };
}

/* ─── Visual effects ────────────────────────────────────────── */

const QZ_CONFETTI_COLORS = ['#a60404', '#d18180', '#032d6f', '#3fae7a', '#8095b6', '#f2c14e'];

function qzConfetti(layer, x, y, count = 36, power = 1) {
  if (qzReducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('span');
    const angle = Math.random() * Math.PI * 2;
    const dist = (50 + Math.random() * 150) * power;
    bit.className = `qz-confetti${i % 3 === 0 ? ' is-round' : ''}`;
    bit.style.left = `${x}px`;
    bit.style.top = `${y}px`;
    bit.style.background = QZ_CONFETTI_COLORS[i % QZ_CONFETTI_COLORS.length];
    bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    bit.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.7 - 70 * power}px`);
    bit.style.setProperty('--fall', `${90 + Math.random() * 120}px`);
    bit.style.setProperty('--rot', `${Math.round(Math.random() * 900 - 450)}deg`);
    bit.style.animationDuration = `${0.95 + Math.random() * 0.8}s`;
    bit.addEventListener('animationend', () => bit.remove());
    layer.appendChild(bit);
  }
}

function qzFloatText(layer, x, y, text) {
  if (qzReducedMotion()) return;
  const el = document.createElement('span');
  el.className = 'qz-float';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.addEventListener('animationend', () => el.remove());
  layer.appendChild(el);
}

function qzCountUp(el, from, to, ms = 700) {
  const run = {};
  el.qzCount = run;     // a newer count replaces this one
  if (from === to || qzReducedMotion()) { el.textContent = to; return; }
  const start = performance.now();
  const step = (now) => {
    if (el.qzCount !== run) return;
    const k = Math.min(1, (now - start) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Frames don't run for unpainted windows: make sure the final value lands
  setTimeout(() => { if (el.qzCount === run) el.textContent = to; }, ms + 60);
}

/* ══════════════════════════════════════════════════════════════
   SHOW
══════════════════════════════════════════════════════════════ */

function renderQuiz({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { questions } = model;
  const total = questions.length;

  /* ─── Elements ───────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const barEl        = $('qz-bar');
  const barLabel     = $('qz-bar-label');
  const barText      = $('qz-bar-text');
  const prevBtn      = $('qz-prev');
  const nextBtn      = $('qz-next');
  const pointsEl     = $('qz-points');
  const timerEl      = $('qz-timer');
  const timerRing    = $('qz-timer-ring');
  const timerNum     = $('qz-timer-num');
  const stageEl      = $('qz-stage');
  const countdownEl  = $('qz-countdown');
  const toolbarEl    = $('qz-toolbar');
  const lifelinesEl  = $('qz-lifelines');
  const pauseBtn     = $('qz-pause');
  const revealBtn    = $('qz-reveal');
  const scoreboardEl = $('qz-scoreboard');
  const listEl       = $('qz-list');
  const resultsEl    = $('qz-results');
  const fxLayer      = $('qz-fx');
  const soundBtn     = $('qz-sound');
  const counter      = $('progress-counter');
  const resetBtn     = $('reset-btn');

  const prefs  = qzLoadPrefs();
  const sound  = createQuizSound(() => prefs.sound);
  const toast  = createToast();
  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex });

  counter.title = 'Questions played';
  resetBtn.textContent = 'Restart';
  soundBtn.hidden = false;
  $('qz-lifelines-group').hidden = !model.lifelines.length;

  /* ─── State ──────────────────────────────────────────────── */
  const RESULT_KINDS = ['correct', 'wrong', 'timeout', 'revealed'];
  const freshPlayers = mode => (mode === 'teams' ? QZ_TEAMS : [null]).map(() => ({ score: 0, streak: 0, best: 0, used: [] }));

  let game = null;            // { mode, players, results, current }
  let view = 'intro';         // intro · countdown · question · results · review
  let q = null;               // the question on screen (live or reviewed)
  let setupMode = prefs.mode === 'teams' ? 'teams' : 'solo';

  // Seconds per question, picked before the show and remembered per level (0 = no timer)
  const timerOptions = [...new Set([...QZ_TIMER_OPTIONS, model.timer])].sort((a, b) => a - b);
  const timeLimit = () => {
    const seconds = prefs.timers[level];
    return timerOptions.includes(seconds) ? seconds : model.timer;
  };

  let reviewIndex = 0;
  let countdownTimer = null;
  let dialogTimer = null;

  const saved = QZ_STORE.get(puzzle.id, model.sig);
  if (saved && Array.isArray(saved.players) && Array.isArray(saved.results)) {
    const mode = saved.mode === 'teams' ? 'teams' : 'solo';
    game = {
      mode,
      players: freshPlayers(mode).map((p, i) => {
        const s = saved.players[i] || {};
        return {
          score: Math.max(0, Number(s.s) || 0),
          streak: Math.max(0, Number(s.k) || 0),
          best: Math.max(0, Number(s.b) || 0),
          used: (Array.isArray(s.l) ? s.l : []).filter(id => model.lifelines.includes(id))
        };
      }),
      results: questions.map((_, i) => {
        const r = saved.results[i];
        if (!r || typeof r !== 'object') return null;
        return {
          r: RESULT_KINDS.includes(r.r) ? r.r : 'wrong',
          p: Math.max(0, Number(r.p) || 0),
          by: r.by === 1 && mode === 'teams' ? 1 : 0,
          st: r.st ? 1 : 0,
          a: r.a ?? null
        };
      }),
      current: 0
    };
    game.current = firstOpen();
  }

  function firstOpen() {
    const i = game.results.findIndex(r => !r);
    return i < 0 ? total : i;
  }

  const answered   = () => (game ? game.results.filter(Boolean).length : 0);
  const isComplete = () => !!game && answered() === total;
  const turnOf     = i => (game && game.mode === 'teams' ? i % 2 : 0);
  const teamName   = t => QZ_TEAMS[t].name;
  const isLive     = () => view === 'question' && !!q;
  const canAnswer  = () => isLive() && (q.phase === 'answering' || q.phase === 'stealing') && !clock.paused && !dialog.isOpen();

  function save() {
    if (!game) {
      QZ_STORE.set(puzzle.id, null);
      return;
    }
    QZ_STORE.set(puzzle.id, {
      sig: model.sig,
      mode: game.mode,
      players: game.players.map(p => ({ s: p.score, k: p.streak, b: p.best, l: p.used })),
      results: game.results,
      progress: answered(),
      complete: isComplete()
    });
  }

  /* ─── Clock ──────────────────────────────────────────────── */
  // Driven by an interval rather than animation frames, which browsers stop
  // for windows that aren't painted. It keeps running in background tabs too,
  // so switching to the video-call tab doesn't freeze a shared screen.
  const QZ_TICK_MS = 100;
  const clock = { total: 0, left: 0, timed: true, running: false, paused: false, friend: 0, last: 0, lastTick: 0, interval: 0 };

  function startClock(seconds) {
    clearInterval(clock.interval);
    Object.assign(clock, { total: seconds, left: seconds, timed: seconds > 0, running: true, paused: false, friend: 0, lastTick: 0, last: performance.now() });
    clock.interval = setInterval(tickClock, QZ_TICK_MS);
    renderClock();
  }

  function stopClock() {
    clock.running = false;
    clock.friend = 0;
    clearInterval(clock.interval);
    renderClock();
  }

  function tickClock() {
    const now = performance.now();
    const dt = Math.min(1.5, (now - clock.last) / 1000);   // background tabs tick about once a second
    clock.last = now;

    if (!clock.paused) {
      if (clock.friend > 0) {
        clock.friend = Math.max(0, clock.friend - dt);
        if (clock.friend === 0) {
          sound.play('count');
          toast(clock.timed ? 'Time to answer – the clock is running again!' : 'Time to answer!');
          updateToolbar();
        }
      } else if (clock.timed) {
        clock.left = Math.max(0, clock.left - dt);
        const whole = Math.ceil(clock.left);
        if (whole <= 5 && whole > 0 && whole !== clock.lastTick) {
          clock.lastTick = whole;
          sound.play('tick');
        }
        if (clock.left === 0) {
          stopClock();
          timeUp();
          return;
        }
      }
    }

    renderClock();
  }

  function renderClock() {
    const friend = clock.friend > 0;
    const frac = friend
      ? clock.friend / QZ_FRIEND_SECONDS
      : clock.timed && clock.total ? clock.left / clock.total : 1;

    timerEl.hidden = !isLive() || q.phase === 'revealed';
    timerRing.style.strokeDashoffset = String(100 - Math.max(0, Math.min(1, frac)) * 100);
    timerNum.textContent = friend ? Math.ceil(clock.friend) : clock.timed ? Math.ceil(clock.left) : '∞';
    timerEl.classList.toggle('is-friend', friend);
    timerEl.classList.toggle('is-low', !friend && clock.timed && clock.running && clock.left <= 5);
    timerEl.classList.toggle('is-paused', clock.paused);
    timerEl.classList.toggle('is-off', !clock.timed && !friend);
    timerEl.setAttribute('aria-label', friend ? 'Ask a friend' : clock.timed ? `${Math.ceil(clock.left)} seconds left` : 'No time limit');
  }

  function togglePause() {
    if (!isLive() || !(q.phase === 'answering' || q.phase === 'stealing')) return;
    clock.paused = !clock.paused;
    clock.last = performance.now();
    stageEl.classList.toggle('is-paused', clock.paused);
    renderClock();
    updateToolbar();
    toast(clock.paused ? 'Show paused' : 'Back to the show!');
  }

  /* ─── Scoreboard, list, header, bar, toolbar ─────────────── */
  // Before a show starts, the scoreboard follows the mode picked on the intro screen
  const boardMode = () => (game ? game.mode : setupMode);

  function buildScoreboard() {
    const teams = boardMode() === 'teams';
    scoreboardEl.className = `qz-scoreboard ${teams ? 'is-teams' : 'is-solo'}`;

    if (!teams) {
      scoreboardEl.innerHTML = `
        <div class="qz-solo">
          <span class="qz-solo-label">Class score</span>
          <span class="qz-solo-score" data-score="0">0</span>
          <div class="qz-solo-stats">
            <span class="qz-stat"><b data-correct>0</b> / ${total} correct</span>
            <span class="qz-stat qz-streak" data-streak hidden>${QZ_ICONS.flame}<b></b> in a row</span>
          </div>
        </div>`;
      return;
    }

    scoreboardEl.innerHTML = QZ_TEAMS.map((team, t) => `
      <div class="qz-team ${team.cls}" data-team="${t}">
        <div class="qz-team-top">
          <span class="qz-team-name">${team.name}</span>
          <span class="qz-team-turn">Playing</span>
        </div>
        <span class="qz-team-score" data-score="0">0</span>
        <div class="qz-team-meta">
          <span class="qz-streak" data-streak hidden>${QZ_ICONS.flame}<b></b></span>
          <span class="qz-team-lifelines" data-lifelines></span>
        </div>
      </div>`).join('');
  }

  function updateScoreboard() {
    const players = game ? game.players : freshPlayers(boardMode());

    scoreboardEl.querySelectorAll('[data-score]').forEach((el, i) => {
      const to = players[i] ? players[i].score : 0;
      const from = Number(el.dataset.score) || 0;
      el.dataset.score = to;
      qzCountUp(el, from, to);
    });

    scoreboardEl.querySelectorAll('[data-streak]').forEach((el, i) => {
      const streak = players[i] ? players[i].streak : 0;
      el.hidden = streak < 2;
      el.classList.toggle('is-hot', streak >= QZ_STREAK_FROM);
      el.querySelector('b').textContent = streak;
    });

    const correctEl = scoreboardEl.querySelector('[data-correct]');
    if (correctEl) correctEl.textContent = game ? game.results.filter(r => r && r.r === 'correct').length : 0;

    scoreboardEl.querySelectorAll('[data-team]').forEach(el => {
      const t = Number(el.dataset.team);
      el.classList.toggle('is-turn', isLive() && q.phase !== 'revealed' && q.player === t);
      el.querySelector('[data-lifelines]').innerHTML = model.lifelines.map(id =>
        `<span class="qz-mini-lifeline${players[t].used.includes(id) ? ' is-used' : ''}" title="${QZ_LIFELINES[id].label}${players[t].used.includes(id) ? ' (used)' : ''}">${QZ_ICONS[id]}</span>`
      ).join('');
    });
  }

  function renderList() {
    const reviewing = view === 'results' || view === 'review';

    listEl.innerHTML = questions.map((question, i) => {
      const r = game && game.results[i];
      const live = isLive() && q.index === i;
      let status = 'Waiting';
      let cls = 'is-pending';

      if (r && r.r === 'correct') {
        cls = r.st ? 'is-stolen' : 'is-correct';
        status = r.st ? `Stolen by ${teamName(r.by)} · +${r.p}` : `+${r.p} pts${game.mode === 'teams' ? ` · ${teamName(r.by)}` : ''}`;
      } else if (r) {
        cls = 'is-missed';
        status = r.r === 'timeout' ? "Time's up" : r.r === 'revealed' ? 'Answer revealed' : 'Missed';
      } else if (live) {
        cls = 'is-live';
        status = game.mode === 'teams' ? `${teamName(q.player)}${q.stealing ? ' · steal' : ''}` : 'Now playing';
      } else if (game && game.mode === 'teams') {
        status = teamName(turnOf(i));
      }

      const team = game && game.mode === 'teams' ? ` ${QZ_TEAMS[r ? r.by : live ? q.player : turnOf(i)].cls}` : '';
      const current = live || (view === 'review' && reviewIndex === i);
      return `
        <li>
          <button type="button" class="qz-item ${cls}${team}${current ? ' is-current' : ''}" data-review="${i}"
                  ${reviewing && r ? '' : 'disabled'} aria-current="${current}">
            <span class="qz-item-num">${i + 1}</span>
            <span class="qz-item-body">
              <span class="qz-item-type">${QZ_TYPES[question.type].name}</span>
              <span class="qz-item-status">${escapeHTML(status)}</span>
            </span>
          </button>
        </li>`;
    }).join('');
  }

  function renderHeader() {
    counter.hidden = false;
    counter.textContent = `${answered()} / ${total}`;
    counter.classList.toggle('complete', isComplete());
    resetBtn.disabled = !game;
  }

  function renderSoundBtn() {
    soundBtn.innerHTML = prefs.sound ? QZ_ICONS.soundOn : QZ_ICONS.soundOff;
    soundBtn.setAttribute('aria-pressed', String(prefs.sound));
    soundBtn.setAttribute('aria-label', prefs.sound ? 'Sound on' : 'Sound off');
    soundBtn.title = prefs.sound ? 'Mute sound effects' : 'Turn sound effects on';
  }

  function renderBar() {
    prevBtn.hidden = nextBtn.hidden = view !== 'review';
    pointsEl.hidden = !isLive() || q.phase === 'revealed';
    barEl.classList.remove('is-ok', 'is-muted');

    if (view === 'question' || view === 'review') {
      const index = view === 'question' ? q.index : reviewIndex;
      const question = questions[index];
      const r = game.results[index];
      const settled = view === 'review' || q.phase === 'revealed';
      barLabel.textContent = `${view === 'review' ? 'Review' : 'Question'} ${index + 1} / ${total}`;
      if (settled && r) barEl.classList.add(r.r === 'correct' ? 'is-ok' : 'is-muted');

      const player = view === 'question' ? q.player : r ? r.by : turnOf(index);
      const chip = game.mode === 'teams' && view === 'question'
        ? `<span class="qz-turn-chip ${QZ_TEAMS[player].cls}">${q.stealing ? 'Steal · ' : ''}${teamName(player)}</span>`
        : '';
      barText.innerHTML = `${chip}<span>${QZ_TYPES[question.type].task}</span>`;

      if (view === 'question') {
        const base = q.stealing ? QZ_POINTS.steal : QZ_POINTS.base;
        pointsEl.innerHTML = `${base} pts${q.double ? ' <b>×2</b>' : ''}`;
        pointsEl.classList.toggle('is-double', q.double);
      }
    } else if (view === 'results') {
      barLabel.textContent = 'Final scores';
      barText.textContent = puzzle.theme;
      barEl.classList.add('is-ok');
    } else {
      barLabel.textContent = 'Get ready';
      barText.textContent = `Grammar Quiz Show · ${puzzle.theme}`;
    }
    renderClock();
  }

  function buildToolbar() {
    lifelinesEl.innerHTML = model.lifelines.map(id => `
      <button type="button" class="pz-tool qz-lifeline" data-lifeline="${id}">
        ${QZ_ICONS[id]}<span>${QZ_LIFELINES[id].label}</span>
      </button>`).join('');
  }

  function updateToolbar() {
    toolbarEl.hidden = view !== 'question';
    if (!isLive()) return;

    const player = game.players[q.player];
    const question = questions[q.index];
    const open = q.phase === 'answering' && !q.stealing;

    lifelinesEl.querySelectorAll('[data-lifeline]').forEach(btn => {
      const id = btn.dataset.lifeline;
      const used = player.used.includes(id);
      const unavailable = id === 'fifty' && question.type === 'truefalse';
      btn.classList.toggle('is-used', used);
      btn.classList.toggle('is-active', (id === 'double' && q.double) || (id === 'friend' && clock.friend > 0));
      btn.disabled = used || unavailable || !open;
      btn.title = unavailable
        ? '50:50 is not available for correct-or-not questions'
        : used ? `${QZ_LIFELINES[id].label} already used${game.mode === 'teams' ? ` by ${teamName(q.player)}` : ''}` : QZ_LIFELINES[id].hint;
    });

    const running = q.phase === 'answering' || q.phase === 'stealing';
    pauseBtn.disabled = !running;
    pauseBtn.innerHTML = clock.paused ? `${QZ_ICONS.play}<span>Resume</span>` : `${QZ_ICONS.pause}<span>Pause</span>`;
    revealBtn.disabled = !(running || q.phase === 'steal-offer');
  }

  function refresh() {
    renderBar();
    updateToolbar();
    updateScoreboard();
    renderList();
    renderHeader();
  }

  /* ─── Question markup ────────────────────────────────────── */
  const GAP = '<span class="qz-gap" id="qz-gap">&nbsp;</span>';

  function questionHTML(question) {
    if (question.type === 'truefalse') {
      return `<span class="qz-sentence qz-quote" id="qz-quote">“${escapeHTML(question.sentence)}”</span>`;
    }
    if (question.type === 'spot') {
      return `<span class="qz-sentence qz-tokens">${question.tokens.map(t => (t.word
        ? `<button type="button" class="qz-token" data-token="${t.index}">${escapeHTML(t.text)}</button>`
        : `<span class="qz-token-punct">${escapeHTML(t.text)}</span>`)).join(' ')}</span>`;
    }
    if (question.type === 'order') {
      return '<div class="qz-order-line" id="qz-order-line" aria-live="polite"></div>';
    }
    return qzPromptHTML(question.prompt, GAP);
  }

  function answersHTML(question) {
    if (question.type === 'choice') {
      return `<div class="qz-options is-${question.options.length}">${question.options.map((o, i) => `
        <button type="button" class="qz-option" data-option="${i}" style="--i:${i}">
          <span class="qz-key">${'ABCD'[i]}</span>
          <span class="qz-option-text">${o.text === '—' ? '<em>— (no word)</em>' : escapeHTML(o.text)}</span>
        </button>`).join('')}</div>`;
    }
    if (question.type === 'truefalse') {
      return `<div class="qz-options is-tf">${question.options.map((o, i) => `
        <button type="button" class="qz-option ${i === 0 ? 'is-yes' : 'is-no'}" data-option="${i}" style="--i:${i}">
          <span class="qz-key">${i === 0 ? QZ_ICONS.check : QZ_ICONS.cross}</span>
          <span class="qz-option-text">${o.text}</span>
        </button>`).join('')}</div>`;
    }
    if (question.type === 'order') {
      return `
        <div class="qz-order-bank" id="qz-order-bank">${question.bank.map((c, i) =>
          `<button type="button" class="qz-chip" data-chip="${c.id}" style="--i:${i}">${escapeHTML(c.text)}</button>`).join('')}
        </div>
        <div class="qz-row-actions">
          <button type="button" class="qz-btn" data-order-clear>Clear</button>
          <button type="button" class="qz-btn is-primary" data-order-check>Check</button>
        </div>`;
    }
    if (question.type === 'type') {
      return `
        <form class="qz-typeform" id="qz-typeform" autocomplete="off">
          <input class="qz-input" id="qz-input" type="text" spellcheck="false" autocapitalize="off" autocorrect="off"
                 enterkeyhint="done" placeholder="Type your answer…" aria-label="Your answer">
          <button type="submit" class="qz-btn is-primary">Submit</button>
        </form>
        <p class="qz-type-hint" id="qz-type-hint" hidden></p>`;
    }
    return '';
  }

  function renderCard() {
    const question = questions[q.index];
    stageEl.classList.remove('is-paused');
    stageEl.innerHTML = `
      <article class="qz-card is-${question.type}" id="qz-card">
        <div class="qz-card-top">
          <span class="qz-card-type">${QZ_TYPES[question.type].name}</span>
          <span class="qz-card-double">${QZ_ICONS.double} Double points</span>
        </div>
        <div class="qz-question" id="qz-question">${questionHTML(question)}</div>
        <div class="qz-answers" id="qz-answers">${answersHTML(question)}</div>
        <div class="qz-feedback" id="qz-feedback" aria-live="polite" hidden></div>
      </article>`;
    updateAnswers();
  }

  // Syncs the answer controls with the question phase
  function updateAnswers() {
    const card = $('qz-card');
    if (!card || !q) return;
    const question = questions[q.index];
    const settled = q.phase === 'revealed';
    const locked = q.phase === 'locked';
    const result = settled ? game.results[q.index] : null;

    card.classList.toggle('is-locked', locked);
    card.classList.toggle('is-revealed', settled);
    card.classList.toggle('is-double', !!q.double && !settled);
    card.classList.toggle('is-right', !!result && result.r === 'correct');

    if (question.options) {
      card.querySelectorAll('[data-option]').forEach(btn => {
        const i = Number(btn.dataset.option);
        const option = question.options[i];
        btn.classList.toggle('is-removed', q.removed.has(i));
        btn.classList.toggle('is-wrong', q.wrong.has(i));
        btn.classList.toggle('is-picked', locked && q.pick === i);
        btn.classList.toggle('is-correct', settled && option.correct);
        btn.classList.toggle('is-dim', settled && !option.correct && !q.wrong.has(i));
        btn.disabled = settled || locked || q.removed.has(i) || q.wrong.has(i);
      });
      const quote = $('qz-quote');
      if (quote) quote.classList.toggle('is-incorrect', settled && !question.answer);
    } else if (question.type === 'spot') {
      card.querySelectorAll('[data-token]').forEach(btn => {
        const i = Number(btn.dataset.token);
        btn.classList.toggle('is-removed', q.removed.has(i));
        btn.classList.toggle('is-wrong', q.wrong.has(i));
        btn.classList.toggle('is-picked', locked && q.pick === i);
        btn.classList.toggle('is-mistake', settled && question.tokens[i].wrong);
        btn.disabled = settled || locked || q.removed.has(i) || q.wrong.has(i);
      });
    } else if (question.type === 'order') {
      renderOrder();
    } else if (question.type === 'type') {
      $('qz-input').disabled = settled || locked;
      card.querySelector('#qz-typeform [type="submit"]').disabled = settled || locked;
      const hint = $('qz-type-hint');
      hint.hidden = !q.hint;
      if (q.hint) hint.innerHTML = `50:50 hint: <b>${escapeHTML(q.hint)}</b>`;
    }
    renderGap();
  }

  // The gap previews a hovered option, then shows the locked-in and the correct answer
  function renderGap(preview = null) {
    const gap = $('qz-gap');
    if (!gap || !q) return;
    const question = questions[q.index];
    const result = q.phase === 'revealed' ? game.results[q.index] : null;
    let text = '';
    let cls = '';

    if (result) {
      // A correct typed answer shows the accepted spelling it matched
      const matched = question.type === 'type' && result.r === 'correct' && q.given
        ? question.answers.find(a => qzNormalize(a) === qzNormalize(q.given))
        : null;
      text = matched || question.answer;
      cls = 'is-correct';
    } else if (q.phase === 'locked') {
      text = q.given || '';
      cls = 'is-picked';
    } else if (question.type === 'type') {
      text = $('qz-input').value.trim();
      cls = text ? 'is-typing' : '';
    } else if (preview !== null) {
      text = preview;
      cls = 'is-preview';
    }

    gap.textContent = text && text !== '—' ? text : ' ';
    gap.className = `qz-gap ${cls}`;
  }

  /* ─── Word order ─────────────────────────────────────────── */
  const chipText = id => questions[q.index].chunks[id];

  function placedText() {
    const text = q.placed.map(chipText).join(' ');
    return text ? qzCapitalize(text) + questions[q.index].end : '';
  }

  function renderOrder(popId = null) {
    const line = $('qz-order-line');
    if (!line) return;
    const question = questions[q.index];
    const result = q.phase === 'revealed' ? game.results[q.index] : null;
    const interactive = q.phase === 'answering' || q.phase === 'stealing';
    const complete = q.placed.length === question.chunks.length;

    line.classList.toggle('is-right', !!result && (result.r === 'correct' || !!q.review));
    line.classList.toggle('is-wrong', !!result && result.r !== 'correct' && !q.review);
    line.innerHTML = q.placed.length
      ? q.placed.map((id, pos) => {
          const fixed = pos < q.locked;
          const text = pos === 0 ? qzCapitalize(chipText(id)) : chipText(id);
          return `<button type="button" class="qz-chip is-placed${fixed ? ' is-fixed' : ''}${id === popId ? ' is-new' : ''}"
                          data-unplace="${pos}" ${interactive && !fixed ? '' : 'disabled'}>${escapeHTML(text)}</button>`;
        }).join('') + (complete ? `<span class="qz-order-end">${escapeHTML(question.end)}</span>` : '')
      : '<span class="qz-order-placeholder">Tap the words below to build the sentence</span>';

    stageEl.querySelectorAll('[data-chip]').forEach(btn => {
      const used = q.placed.includes(Number(btn.dataset.chip));
      btn.classList.toggle('is-used', used);
      btn.disabled = used || !interactive;
    });
    const check = stageEl.querySelector('[data-order-check]');
    const clear = stageEl.querySelector('[data-order-clear]');
    if (check) check.disabled = !interactive || !complete;
    if (clear) clear.disabled = !interactive || q.placed.length <= q.locked;
  }

  function placeChip(id) {
    if (!canAnswer() || q.placed.includes(id)) return;
    q.placed.push(id);
    sound.play('tap');
    renderOrder(id);
  }

  function unplaceChip(pos) {
    if (!canAnswer() || pos < q.locked || pos >= q.placed.length) return;
    q.placed.splice(pos, 1);
    sound.play('tap');
    renderOrder();
  }

  function clearOrder() {
    if (!canAnswer()) return;
    q.placed = q.placed.slice(0, q.locked);
    renderOrder();
  }

  /* ─── Answering ──────────────────────────────────────────── */
  function pickOption(i) {
    if (!canAnswer()) return;
    const option = questions[q.index].options?.[i];
    if (!option || q.removed.has(i) || q.wrong.has(i)) return;
    lockIn({ correct: option.correct, pick: i, answer: option.text });
  }

  function pickToken(i) {
    if (!canAnswer()) return;
    const token = questions[q.index].tokens?.[i];
    if (!token || !token.word || q.removed.has(i) || q.wrong.has(i)) return;
    lockIn({ correct: token.wrong, pick: i, answer: i });
  }

  function checkOrder() {
    if (!canAnswer()) return;
    const question = questions[q.index];
    if (q.placed.length < question.chunks.length) {
      toast('Use all the words first.');
      return;
    }
    const attempt = q.placed.map(id => qzNormalize(chipText(id))).join(' ');
    lockIn({ correct: question.valid.includes(attempt), answer: placedText() });
  }

  function submitTyped() {
    if (!canAnswer()) return;
    const input = $('qz-input');
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    lockIn({ correct: questions[q.index].accepted.includes(qzNormalize(value)), answer: value });
  }

  // "Final answer": a short pause before the result is revealed
  function lockIn({ correct, pick = null, answer }) {
    const question = questions[q.index];
    const current = q;
    const timeLeft = clock.left;
    q.phase = 'locked';
    q.pick = pick;
    q.given = answer;
    stopClock();
    sound.play('lock');
    updateAnswers();
    updateToolbar();

    const suspense = question.options || question.type === 'spot' ? QZ_SUSPENSE_MS : QZ_CHECK_MS;
    setTimeout(() => {
      if (q === current && q.phase === 'locked') settle(correct, timeLeft);
    }, qzReducedMotion() ? 150 : suspense);
  }

  function timeUp() {
    if (!isLive() || !(q.phase === 'answering' || q.phase === 'stealing')) return;
    const question = questions[q.index];
    if (question.type === 'type') q.given = $('qz-input').value.trim() || null;
    else if (question.type === 'order') q.given = q.placed.length ? placedText() : null;
    else q.given = null;
    q.pick = null;
    q.phase = 'locked';
    updateAnswers();
    settle(false, 0, 'timeout');
  }

  function settle(correct, timeLeft, reason = 'wrong') {
    if (correct) {
      finalize({ r: 'correct', p: award(timeLeft), by: q.player, st: q.stealing ? 1 : 0, a: q.given });
      return;
    }

    game.players[q.player].streak = 0;
    if (q.pick !== null) q.wrong.add(q.pick);
    q.missReason = reason;
    sound.play(reason === 'timeout' ? 'timeup' : 'wrong');
    shakeCard();

    if (game.mode === 'teams' && !q.stealing && canSteal(questions[q.index])) offerSteal();
    else finalize({ r: reason, p: 0, by: turnOf(q.index), st: 0, a: q.given });
  }

  function award(timeLeft) {
    const player = game.players[q.player];
    player.streak += 1;
    player.best = Math.max(player.best, player.streak);

    let points;
    const parts = [];
    if (q.stealing) {
      points = QZ_POINTS.steal;
      parts.push(['Steal', `+${points}`]);
    } else {
      points = QZ_POINTS.base;
      parts.push(['Correct', `+${QZ_POINTS.base}`]);
      if (clock.timed && clock.total) {
        const speed = Math.round((QZ_POINTS.speed * Math.max(0, timeLeft)) / clock.total);
        if (speed > 0) {
          points += speed;
          parts.push(['Speed', `+${speed}`]);
        }
      }
      if (player.streak >= QZ_STREAK_FROM) {
        points += QZ_POINTS.streak;
        parts.push([`${player.streak} in a row`, `+${QZ_POINTS.streak}`]);
      }
      if (q.double) {
        points *= 2;
        parts.push(['Double', '×2']);
      }
    }

    player.score += points;
    q.breakdown = parts;
    return points;
  }

  function finalize(result) {
    stopClock();
    clock.paused = false;
    stageEl.classList.remove('is-paused');
    q.phase = 'revealed';
    game.results[q.index] = result;
    game.current = firstOpen();
    save();
    updateAnswers();
    renderFeedback(result);
    refresh();

    if (result.r !== 'correct') return;
    sound.play('correct');
    const card = $('qz-card').getBoundingClientRect();
    const big = result.p >= 2 * QZ_POINTS.base;
    qzConfetti(fxLayer, card.left + card.width / 2, card.top + card.height * 0.35, big ? 64 : 34, big ? 1.35 : 1);
    const scoreEl = scoreboardEl.querySelectorAll('[data-score]')[result.by];
    if (scoreEl) {
      const box = scoreEl.getBoundingClientRect();
      qzFloatText(fxLayer, box.left + box.width / 2, box.top, `+${result.p}`);
    }
    if (game.players[result.by].streak === QZ_STREAK_FROM) {
      toast(`${game.mode === 'teams' ? `${teamName(result.by)} is` : 'The class is'} on fire: ${QZ_STREAK_FROM} in a row!`, 'ok');
    }
  }

  function renderFeedback(result) {
    const question = questions[q.index];
    const fb = $('qz-feedback');
    const correct = result.r === 'correct';
    const review = view === 'review';
    const cheers = ['Correct!', 'Brilliant!', 'Spot on!', 'Nailed it!', 'Excellent!'];

    let title;
    if (correct) title = result.st ? `${teamName(result.by)} stole it!` : review ? 'Correct' : cheers[Math.floor(Math.random() * cheers.length)];
    else if (result.r === 'timeout') title = "Time's up!";
    else if (result.r === 'revealed') title = review ? 'Answer revealed' : 'The answer is…';
    else title = review ? 'Missed' : 'Not quite!';

    const lines = [];
    const given = typeof result.a === 'string' ? result.a : null;
    if (question.type === 'truefalse' && !question.answer) lines.push(['Correct version', question.fix]);
    if (question.type === 'spot') lines.push(['Correct version', question.fix]);
    if (question.type === 'order' && !correct) {
      if (given) lines.push(['Your sentence', given, 'is-given']);
      lines.push(['Answer', question.answer]);
    }
    if (question.type === 'type') {
      if (!correct && given) lines.push(['Your answer', given, 'is-given']);
      if (!correct) lines.push(['Answer', question.answer]);
      const shown = qzNormalize(correct && given ? given : question.answer);
      const others = question.answers.filter(a => qzNormalize(a) !== shown);
      if (others.length) lines.push(['Also accepted', others.join(' · ')]);
    }

    const parts = !review && correct && q.breakdown
      ? `<span class="qz-fb-parts">${q.breakdown.map(([label, value]) => `<span>${escapeHTML(label)} <b>${value}</b></span>`).join('')}</span>`
      : '';
    const last = firstOpen() >= total;
    const action = review
      ? '<button type="button" class="qz-btn" data-back-results>Back to results</button>'
      : `<button type="button" class="qz-btn is-primary is-next" data-next>${last ? 'See the results' : 'Next question'} →</button>`;

    fb.hidden = false;
    fb.className = `qz-feedback ${correct ? 'is-correct' : 'is-missed'}`;
    fb.innerHTML = `
      <div class="qz-fb-head">
        <span class="qz-fb-icon">${correct ? QZ_ICONS.check : QZ_ICONS.cross}</span>
        <span class="qz-fb-title">${escapeHTML(title)}</span>
        ${correct ? `<span class="qz-fb-points">+${result.p}</span>` : ''}
        ${parts}
      </div>
      ${lines.map(([label, text, cls = '']) => `<p class="qz-fb-line ${cls}"><span>${label}:</span> ${escapeHTML(text)}</p>`).join('')}
      ${question.explain ? `<p class="qz-fb-explain">${escapeHTML(question.explain)}</p>` : ''}
      <div class="qz-fb-actions">${action}</div>`;

    if (!review) fb.querySelector('[data-next]').focus({ preventScroll: true });
    revealFeedback(fb);
  }

  // Keeps the feedback and its buttons in view on short screens
  function revealFeedback(fb) {
    requestAnimationFrame(() => fb.scrollIntoView({ block: 'nearest', behavior: qzReducedMotion() ? 'auto' : 'smooth' }));
  }

  function shakeCard() {
    const card = $('qz-card');
    if (!card) return;
    card.classList.remove('is-shake');
    void card.offsetWidth;
    card.classList.add('is-shake');
  }

  /* ─── Steals (teams) ─────────────────────────────────────── */
  function canSteal(question) {
    if (question.type === 'truefalse') return false;
    if (question.type === 'choice') {
      return question.options.filter(o => !q.removed.has(o.index) && !q.wrong.has(o.index)).length >= 2;
    }
    return true;
  }

  function offerSteal() {
    q.phase = 'steal-offer';
    const thief = 1 - q.player;
    sound.play('steal');

    const fb = $('qz-feedback');
    fb.hidden = false;
    fb.className = 'qz-feedback is-steal';
    fb.innerHTML = `
      <div class="qz-fb-head">
        <span class="qz-fb-icon">${QZ_ICONS.cross}</span>
        <span class="qz-fb-title">${q.missReason === 'timeout' ? "Time's up!" : 'Not quite!'}</span>
      </div>
      <p class="qz-fb-steal"><span class="qz-turn-chip ${QZ_TEAMS[thief].cls}">${teamName(thief)}</span> can steal this question for ${QZ_POINTS.steal} points.</p>
      <div class="qz-fb-actions">
        <button type="button" class="qz-btn" data-no-steal>Show the answer</button>
        <button type="button" class="qz-btn is-primary is-steal" data-steal>Steal it!</button>
      </div>`;

    updateAnswers();
    refresh();
    fb.querySelector('[data-steal]').focus({ preventScroll: true });
    revealFeedback(fb);
  }

  function startSteal() {
    if (!isLive() || q.phase !== 'steal-offer') return;
    const question = questions[q.index];
    Object.assign(q, { player: 1 - q.player, stealing: true, double: false, phase: 'stealing', pick: null, given: null });
    $('qz-feedback').hidden = true;
    if (question.type === 'order') q.placed = q.placed.slice(0, q.locked);
    if (question.type === 'type') $('qz-input').value = '';

    sound.play('go');
    startClock(Math.min(QZ_STEAL_SECONDS, timeLimit()));
    updateAnswers();
    refresh();
    if (question.type === 'type') $('qz-input').focus();
  }

  function declineSteal() {
    if (!isLive() || q.phase !== 'steal-offer') return;
    finalize({ r: q.missReason, p: 0, by: turnOf(q.index), st: 0, a: q.given });
  }

  function hostReveal() {
    if (!isLive() || !['answering', 'stealing', 'steal-offer'].includes(q.phase)) return;
    if (q.phase === 'steal-offer') {
      declineSteal();
      return;
    }
    if (!confirm('Reveal the answer? Nobody scores on this question.')) return;
    game.players[q.player].streak = 0;
    finalize({ r: 'revealed', p: 0, by: turnOf(q.index), st: 0, a: null });
  }

  /* ─── Lifelines ──────────────────────────────────────────── */
  function useLifeline(id) {
    if (!isLive() || q.phase !== 'answering' || q.stealing) return;
    if (clock.paused) {
      toast('Resume the show first.');
      return;
    }
    const player = game.players[q.player];
    if (player.used.includes(id) || !model.lifelines.includes(id)) return;

    if (id === 'fifty') {
      if (!applyFifty(questions[q.index])) {
        toast('50:50 is not available for this question.', 'warn');
        return;
      }
      toast('50:50: some wrong answers are gone.');
    } else if (id === 'friend') {
      clock.friend = QZ_FRIEND_SECONDS;
      toast(`Ask a friend: ${QZ_FRIEND_SECONDS} seconds to talk it over.`);
    } else if (id === 'double') {
      q.double = true;
      toast('Double points on this question!', 'ok');
    }

    player.used.push(id);
    sound.play('lifeline');
    save();
    updateAnswers();
    refresh();
  }

  function applyFifty(question) {
    const some = (list, count) => qzShuffle(list, String(Math.random())).slice(0, count);

    if (question.type === 'choice') {
      const wrong = question.options.filter(o => !o.correct).map(o => o.index);
      some(wrong, Math.floor(question.options.length / 2)).forEach(i => q.removed.add(i));
      return true;
    }
    if (question.type === 'spot') {
      const fine = question.tokens.filter(t => t.word && !t.wrong).map(t => t.index);
      some(fine, Math.ceil(fine.length / 2)).forEach(i => q.removed.add(i));
      return true;
    }
    if (question.type === 'order') {
      // Place the first third of the sentence (chip ids follow the answer order)
      q.locked = Math.max(1, Math.floor(question.chunks.length / 3));
      q.placed = Array.from({ length: q.locked }, (_, id) => id);
      return true;
    }
    if (question.type === 'type') {
      q.hint = qzLetterHint(question.answer);
      return true;
    }
    return false;
  }

  /* ─── Splash screens (countdown, question intro) ─────────── */
  let splashDone = null;

  function runSplash(steps, done) {
    cancelSplash();
    view = 'countdown';
    q = null;
    refresh();

    let k = 0;
    splashDone = done;
    const show = () => {
      if (k >= steps.length) {
        finishSplash();
        return;
      }
      const step = steps[k++];
      countdownEl.hidden = false;
      countdownEl.className = `qz-countdown ${step.cls || ''}`;
      countdownEl.innerHTML = `
        <span class="qz-countdown-inner">
          <span class="qz-countdown-big">${step.big}</span>
          ${step.small ? `<span class="qz-countdown-small">${step.small}</span>` : ''}
        </span>`;
      if (step.sound) sound.play(step.sound);
      countdownTimer = setTimeout(show, step.ms);
    };
    show();
  }

  function finishSplash() {
    const done = splashDone;
    cancelSplash();
    if (done) done();
  }

  function cancelSplash() {
    clearTimeout(countdownTimer);
    splashDone = null;
    countdownEl.hidden = true;
    countdownEl.innerHTML = '';
  }

  /* ─── Show flow ──────────────────────────────────────────── */
  function renderIntro() {
    stopClock();
    view = 'intro';
    q = null;

    const types = [...new Set(questions.map(x => x.type))].map(t => QZ_TYPES[t].name);
    const lifelines = model.lifelines.map(id => `<span class="qz-chip-mini">${QZ_ICONS[id]}${QZ_LIFELINES[id].label}</span>`).join('');

    stageEl.classList.remove('is-paused');
    stageEl.innerHTML = `
      <div class="qz-intro">
        <div class="qz-marquee">
          <span class="qz-marquee-kicker">${level} · Grammar Quiz Show</span>
          <h2 class="qz-marquee-title">${escapeHTML(puzzle.theme)}</h2>
          <p class="qz-marquee-desc">${escapeHTML(puzzle.description || '')}</p>
        </div>

        <div class="qz-facts">
          <span class="qz-fact">${QZ_ICONS.list}<span><b>${total}</b> questions</span></span>
          <span class="qz-fact">${QZ_ICONS.star}<span><b>${QZ_POINTS.base}</b> pts + speed &amp; streak bonus</span></span>
        </div>
        <p class="qz-types">${types.join(' · ')}</p>
        ${lifelines ? `<div class="qz-intro-lifelines"><span class="qz-intro-label">Lifelines</span>${lifelines}</div>` : ''}

        ${game ? resumeHTML() : setupHTML()}
      </div>`;

    refresh();
    const primary = stageEl.querySelector('[data-start], [data-continue]');
    if (primary) primary.focus({ preventScroll: true });
  }

  function timeSelectHTML() {
    const current = timeLimit();
    return `
      <div class="qz-time">
        <span class="qz-intro-label" id="qz-time-label">${QZ_ICONS.clock}Time per question</span>
        <div class="qz-time-options" role="radiogroup" aria-labelledby="qz-time-label">
          ${timerOptions.map(s => `
            <button type="button" role="radio" class="qz-time-opt${s === model.timer ? ' is-suggested' : ''}" data-time="${s}"
                    aria-checked="${s === current}"${s === model.timer ? ` title="Suggested for ${level}"` : ''}>${s ? `${s}s` : 'No timer'}</button>`).join('')}
        </div>
        <span class="qz-time-note" id="qz-time-note">${timeNoteHTML()}</span>
      </div>`;
  }

  function timeNoteHTML() {
    const bonus = timeLimit() ? 'faster answers earn a speed bonus' : 'no timer, so no speed bonus';
    return `<span class="qz-time-dot" aria-hidden="true"></span>Suggested for ${level}: ${model.timer ? `${model.timer}s` : 'no timer'} · ${bonus}`;
  }

  function setTime(seconds) {
    if (!timerOptions.includes(seconds)) return;
    prefs.timers[level] = seconds;
    qzSavePrefs(prefs);
    stageEl.querySelectorAll('[data-time]').forEach(btn => btn.setAttribute('aria-checked', String(Number(btn.dataset.time) === seconds)));
    const note = $('qz-time-note');
    if (note) note.innerHTML = timeNoteHTML();
    sound.play('tap');
  }

  function setupHTML() {
    const modes = [
      { id: 'solo',  icon: QZ_ICONS.user,  name: 'Whole class', desc: 'Everyone answers together for one class score.' },
      { id: 'teams', icon: QZ_ICONS.teams, name: 'Two teams',   desc: 'Red and Blue take turns. Miss one and the other team can steal it!' }
    ];
    return `
      <div class="qz-setup">
        <div class="qz-modes" role="radiogroup" aria-label="Game mode">
          ${modes.map(m => `
            <button type="button" role="radio" class="qz-mode is-${m.id}" data-mode="${m.id}" aria-checked="${setupMode === m.id}">
              <span class="qz-mode-icon">${m.icon}</span>
              <span class="qz-mode-name">${m.name}</span>
              <span class="qz-mode-desc">${m.desc}</span>
            </button>`).join('')}
        </div>
        ${timeSelectHTML()}
        <button type="button" class="qz-btn is-primary is-big" data-start>${QZ_ICONS.play}<span>Start the show</span></button>
      </div>`;
  }

  function resumeHTML() {
    const scores = game.mode === 'teams'
      ? QZ_TEAMS.map((team, t) => `<span class="qz-turn-chip ${team.cls}">${team.name} · ${game.players[t].score}</span>`).join('')
      : `<span class="qz-turn-chip">${game.players[0].score} pts</span>`;
    return `
      <div class="qz-setup">
        <p class="qz-resume">
          <span>Show in progress · question <b>${game.current + 1}</b> of ${total}</span>
          <span class="qz-resume-scores">${scores}</span>
        </p>
        ${timeSelectHTML()}
        <div class="qz-row-actions">
          <button type="button" class="qz-btn" data-restart>Start over</button>
          <button type="button" class="qz-btn is-primary is-big" data-continue>${QZ_ICONS.play}<span>Continue</span></button>
        </div>
      </div>`;
  }

  function setMode(mode) {
    if (game || !['solo', 'teams'].includes(mode)) return;
    setupMode = mode;
    prefs.mode = mode;
    qzSavePrefs(prefs);
    stageEl.querySelectorAll('[data-mode]').forEach(btn => btn.setAttribute('aria-checked', String(btn.dataset.mode === mode)));
    sound.play('tap');
    buildScoreboard();
    refresh();
  }

  function startShow() {
    if (game) return;
    game = {
      mode: setupMode,
      players: freshPlayers(setupMode),
      results: questions.map(() => null),
      current: 0
    };
    save();
    buildScoreboard();
    playQuestion(0, true);
  }

  // Optional 3-2-1 countdown, then a short "Question N" splash
  function playQuestion(i, withCountdown = false) {
    if (!game || i >= total) return;
    const teams = game.mode === 'teams';
    const steps = withCountdown
      ? [3, 2, 1].map(n => ({ big: n, ms: 700, sound: 'count', cls: 'is-count' }))
      : [];
    steps.push({
      big: i === total - 1 ? 'Final question!' : `Question ${i + 1}`,
      small: teams ? `${teamName(turnOf(i))}, you're up!` : `${QZ_TYPES[questions[i].type].name}`,
      ms: 1100,
      sound: 'go',
      cls: `is-title${teams ? ` ${QZ_TEAMS[turnOf(i)].cls}` : ''}`
    });
    runSplash(steps, () => startQuestion(i));
  }

  function startQuestion(i) {
    view = 'question';
    q = {
      index: i,
      player: turnOf(i),
      phase: 'answering',
      stealing: false,
      double: false,
      removed: new Set(),
      wrong: new Set(),
      pick: null,
      given: null,
      placed: [],
      locked: 0,
      hint: null,
      breakdown: null,
      missReason: null,
      review: false
    };
    renderCard();
    startClock(timeLimit());
    refresh();
    if (questions[i].type === 'type') $('qz-input').focus({ preventScroll: true });
  }

  function nextQuestion() {
    if (!isLive() || q.phase !== 'revealed') return;
    const i = firstOpen();
    if (i >= total) showResults(true);
    else playQuestion(i);
  }

  function restartShow(ask = true) {
    if (!game) return;
    if (ask && !confirm(`Restart “${puzzle.theme}”? All scores for this topic will be cleared.`)) return;
    cancelSplash();
    clearTimeout(dialogTimer);
    dialog.close();
    stopClock();
    clock.paused = false;
    game = null;
    q = null;
    save();
    buildScoreboard();
    renderIntro();
  }

  /* ─── Results & review ───────────────────────────────────── */
  function playerStats(t) {
    const won = game.results.filter(r => r && r.r === 'correct' && r.by === t);
    const p = game.players[t];
    return { score: p.score, correct: won.length, steals: won.filter(r => r.st).length, best: p.best, lifelines: p.used.length };
  }

  function rankFor(correct) {
    const ratio = correct / total;
    if (ratio === 1)     return { stars: 3, title: 'Perfect show!' };
    if (ratio >= 0.85)   return { stars: 3, title: 'Grammar star!' };
    if (ratio >= 0.5)    return { stars: 2, title: 'Great effort!' };
    if (ratio >= 0.25)   return { stars: 1, title: 'Good try!' };
    return { stars: 0, title: 'Keep practising!' };
  }

  function starsHTML(count) {
    return `<span class="qz-stars">${[0, 1, 2].map(i =>
      `<span class="qz-star${i < count ? ' is-on' : ''}" style="--i:${i}">${QZ_ICONS.star}</span>`).join('')}</span>`;
  }

  function winnerOf() {
    const [red, blue] = game.players.map(p => p.score);
    return red === blue ? null : red > blue ? 0 : 1;
  }

  function resultsHTML() {
    const next = levelData.puzzles[puzzleIndex + 1];
    const actions = `
      <div class="qz-row-actions qz-final-actions">
        <button type="button" class="qz-btn" data-review-start>Review answers</button>
        <button type="button" class="qz-btn" data-play-again>Play again</button>
        ${next ? `<a class="qz-btn is-primary" href="${puzzleUrl(activity, level, next.id)}">Next topic →</a>` : ''}
      </div>`;

    if (game.mode !== 'teams') {
      const s = playerStats(0);
      const rank = rankFor(s.correct);
      return `
        <div class="qz-final">
          ${starsHTML(rank.stars)}
          <span class="qz-final-title">${rank.title}</span>
          <span class="qz-final-score" data-final="${s.score}">${s.score}</span>
          <span class="qz-final-label">points</span>
          <div class="qz-final-stats">
            <span><b>${s.correct}/${total}</b> correct</span>
            <span><b>${s.best}</b> best streak</span>
            <span><b>${s.lifelines}</b> lifeline${s.lifelines === 1 ? '' : 's'} used</span>
          </div>
          ${actions}
        </div>`;
    }

    const winner = winnerOf();
    return `
      <div class="qz-final is-teams">
        <span class="qz-final-title">${winner === null ? "It's a tie!" : `${teamName(winner)} wins!`}</span>
        <div class="qz-podium">
          ${QZ_TEAMS.map((team, t) => {
            const s = playerStats(t);
            return `
              <div class="qz-podium-team ${team.cls}${winner === t ? ' is-winner' : ''}">
                <span class="qz-podium-trophy">${winner === t ? QZ_ICONS.trophy : ''}</span>
                <span class="qz-podium-name">${team.name}</span>
                <span class="qz-final-score" data-final="${s.score}">${s.score}</span>
                <span class="qz-podium-stats">
                  <span><b>${s.correct}</b> correct</span>
                  <span><b>${s.steals}</b> stolen</span>
                  <span><b>${s.best}</b> best streak</span>
                </span>
              </div>`;
          }).join('')}
        </div>
        ${actions}
      </div>`;
  }

  function showResults(celebrate) {
    if (!game) return;
    cancelSplash();
    stopClock();
    view = 'results';
    q = null;
    stageEl.classList.remove('is-paused');
    stageEl.innerHTML = resultsHTML();
    refresh();

    if (!celebrate) return;
    stageEl.querySelectorAll('[data-final]').forEach(el => qzCountUp(el, 0, Number(el.dataset.final), 1200));
    sound.play('fanfare');
    const box = stageEl.getBoundingClientRect();
    [0.25, 0.5, 0.75].forEach((x, k) => setTimeout(() =>
      qzConfetti(fxLayer, box.left + box.width * x, box.top + box.height * 0.3, 48, 1.4), k * 220));
    clearTimeout(dialogTimer);
    dialogTimer = setTimeout(openDialog, 1700);
  }

  function openDialog() {
    clearTimeout(dialogTimer);
    if (dialog.isOpen() || !isComplete()) return;

    if (game.mode === 'teams') {
      const winner = winnerOf();
      resultsEl.innerHTML = `
        <div class="qz-dialog-teams">
          ${QZ_TEAMS.map((team, t) => `
            <span class="qz-dialog-team ${team.cls}${winner === t ? ' is-winner' : ''}">
              <span>${team.name}</span><b>${game.players[t].score}</b>
            </span>`).join('')}
        </div>`;
      dialog.open(winner === null
        ? `A tie in “${puzzle.theme}”! Play again for a tiebreaker?`
        : `${teamName(winner)} wins “${puzzle.theme}”. Congratulations!`);
    } else {
      const s = playerStats(0);
      resultsEl.innerHTML = `${starsHTML(rankFor(s.correct).stars)}<span class="qz-dialog-score"><b>${s.score}</b> points</span>`;
      dialog.open(`You answered ${s.correct} of ${total} questions correctly in “${puzzle.theme}”.`);
    }
  }

  function openReview(i) {
    if (!game || !game.results[i] || !(view === 'results' || view === 'review')) return;
    const r = game.results[i];
    const question = questions[i];

    view = 'review';
    reviewIndex = i;
    q = {
      index: i,
      player: r.by,
      phase: 'revealed',
      stealing: false,
      double: false,
      removed: new Set(),
      wrong: new Set(),
      pick: null,
      given: typeof r.a === 'string' ? r.a : null,
      placed: question.type === 'order' ? question.chunks.map((_, id) => id) : [],
      locked: 0,
      hint: null,
      review: true
    };

    // Show the answer that was given when it was wrong
    if (r.r !== 'correct' && r.a !== null) {
      if (question.options) {
        const picked = question.options.find(o => o.text === r.a);
        if (picked) q.wrong.add(picked.index);
      } else if (question.type === 'spot' && Number.isInteger(r.a)) {
        q.wrong.add(r.a);
      }
    }

    renderCard();
    if (question.type === 'type') $('qz-input').value = q.given || '';
    renderFeedback(r);
    refresh();
    prevBtn.disabled = !game.results[i - 1];
    nextBtn.disabled = !game.results[i + 1];
  }

  function reviewStep(delta) {
    if (view === 'review') openReview(reviewIndex + delta);
  }

  /* ─── Events ─────────────────────────────────────────────── */
  stageEl.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el || el.disabled || !stageEl.contains(el)) return;
    const d = el.dataset;

    if (d.option !== undefined)      pickOption(Number(d.option));
    else if (d.token !== undefined)  pickToken(Number(d.token));
    else if (d.chip !== undefined)   placeChip(Number(d.chip));
    else if (d.unplace !== undefined) unplaceChip(Number(d.unplace));
    else if ('orderClear' in d)      clearOrder();
    else if ('orderCheck' in d)      checkOrder();
    else if ('next' in d)            nextQuestion();
    else if ('steal' in d)           startSteal();
    else if ('noSteal' in d)         declineSteal();
    else if ('backResults' in d)     showResults(false);
    else if (d.time !== undefined)   setTime(Number(d.time));
    else if (d.mode)                 setMode(d.mode);
    else if ('start' in d)           startShow();
    else if ('continue' in d)        playQuestion(game.current, true);
    else if ('restart' in d)         restartShow();
    else if ('reviewStart' in d)     openReview(0);
    else if ('playAgain' in d)       restartShow(false);
  });

  stageEl.addEventListener('submit', (e) => {
    e.preventDefault();
    submitTyped();
  });

  stageEl.addEventListener('input', (e) => {
    if (e.target.id === 'qz-input') renderGap();
  });

  // Hovering an option previews it in the gap
  stageEl.addEventListener('pointerover', (e) => {
    const btn = e.target.closest('[data-option]');
    if (!btn || btn.disabled || !canAnswer() || questions[q.index].type !== 'choice') return;
    renderGap(questions[q.index].options[Number(btn.dataset.option)].text);
  });
  stageEl.addEventListener('pointerout', (e) => {
    if (e.target.closest('[data-option]') && canAnswer()) renderGap();
  });

  countdownEl.addEventListener('click', finishSplash);

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-review]');
    if (btn && !btn.disabled) openReview(Number(btn.dataset.review));
  });

  lifelinesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lifeline]');
    if (btn && !btn.disabled) useLifeline(btn.dataset.lifeline);
  });

  pauseBtn.addEventListener('click', togglePause);
  revealBtn.addEventListener('click', hostReveal);
  prevBtn.addEventListener('click', () => reviewStep(-1));
  nextBtn.addEventListener('click', () => reviewStep(1));

  soundBtn.addEventListener('click', () => {
    prefs.sound = !prefs.sound;
    qzSavePrefs(prefs);
    renderSoundBtn();
    sound.play('tap');
  });

  resetBtn.addEventListener('click', () => restartShow());

  document.addEventListener('keydown', (e) => {
    if (dialog.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : document.body;
    if (target.closest('input, textarea, select')) return;
    const onControl = target.closest('button, a, label');
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (view === 'countdown') {
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        finishSplash();
      }
      return;
    }

    if (view === 'review') {
      if (key === 'ArrowLeft') reviewStep(-1);
      else if (key === 'ArrowRight') reviewStep(1);
      else if (key === 'Escape') showResults(false);
      return;
    }

    if (!isLive()) return;

    if (key === ' ' && !onControl && (q.phase === 'answering' || q.phase === 'stealing')) {
      e.preventDefault();
      togglePause();
    } else if (key === 'Enter' && !onControl && q.phase === 'revealed') {
      e.preventDefault();
      nextQuestion();
    } else if (canAnswer() && key.length === 1) {
      const question = questions[q.index];
      let i = -1;
      if (question.type === 'choice') {
        i = 'abcd'.includes(key) ? 'abcd'.indexOf(key) : '1234'.indexOf(key);
      } else if (question.type === 'truefalse') {
        i = 'ct1'.includes(key) ? 0 : 'if2'.includes(key) ? 1 : -1;
      }
      if (question.options && i >= 0 && i < question.options.length) {
        e.preventDefault();
        pickOption(i);
      }
    }
  });

  /* ─── Initial render ─────────────────────────────────────── */
  buildToolbar();
  renderSoundBtn();
  buildScoreboard();
  if (isComplete()) showResults(false);
  else renderIntro();
}

/* ─── Init ──────────────────────────────────────────────────── */

startPuzzleActivity(ACTIVITIES.quiz, {
  store: QZ_STORE,
  buildModel: buildQuiz,
  preview: quizPreview,
  meta: quizMeta,
  statusText: quizStatus,
  renderPuzzle: renderQuiz
});
