/* Sentence builder — requires scripts/common.js and scripts/puzzles.js */

const SB_STORE          = createProgressStore('heyTeacher:sentences');
const SB_LAYOUT_VERSION = 1;     // bump when tile handling changes (invalidates saved progress)

// "If it rains, we'll stay." -> ["If", "it", "rains", "we'll", "stay"]
function sbTokens(text) {
  return text.trim()
    .replace(/[.?!]+$/, '')
    .replace(/[,;:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const sbNorm = word => word.toLowerCase().replace(/’/g, "'");

// Length of the matching start of an attempt, against the closest accepted answer
function sbBestPrefix(answers, attempt) {
  let best = { answer: answers[0], length: 0 };
  answers.forEach((answer) => {
    let k = 0;
    while (k < attempt.length && answer[k] === attempt[k]) k++;
    if (k > best.length) best = { answer, length: k };
  });
  return best;
}

/* ─── Model ─────────────────────────────────────────────────── */

function buildSentences(puzzle, levelData) {
  const tries = Math.max(1, Math.round(levelData.tries || 3));
  const extras = Math.max(0, Math.round(levelData.extras || 0));
  const hintOnRequest = levelData.hint === 'on-request';

  const items = puzzle.sentences.map((s, index) => {
    const words = sbTokens(s.text);
    const answers = [s.text, ...(s.alt || [])].map(t => sbTokens(t).map(sbNorm));

    // The first word loses its capital letter, so it doesn't give the answer away
    const tiles = [...words, ...(s.extra || []).slice(0, extras)].map((word, i) =>
      i === 0 && !s.keepCase && !/^I($|')/.test(word) ? word.charAt(0).toLowerCase() + word.slice(1) : word);

    // Same shuffle for everyone, never already in the right order
    const random = seededRandom(hashString(`${puzzle.id}:${index}`));
    let order = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      order = tiles.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const inWordOrder = order.filter(i => i < words.length).every((id, k) => id === k);
      if (!inWordOrder) break;
    }

    const end = (s.text.trim().match(/[.?!]$/) || ['.'])[0];
    return { index, text: s.text.trim(), pt: s.pt || '', words, answers, tiles, order, end };
  });

  const sig = hashString([SB_LAYOUT_VERSION, tries, ...items.map(i => `${i.text}|${i.tiles.join(' ')}`)].join('\n')).toString(36);
  return { id: puzzle.id, sig, tries, extras, hintOnRequest, items };
}

/* ══════════════════════════════════════════════════════════════
   THEME CARDS
══════════════════════════════════════════════════════════════ */

// One row of word blocks per sentence, colored by result
function sentencesPreview(model, saved) {
  const states = (saved && saved.items) || [];
  const rowH = 1.7;
  let width = 0;

  const rows = model.items.map((item, row) => {
    const st = states[item.index] || {};
    const cls = st.s === 'won' ? 'won' : st.s === 'lost' ? 'lost' : (st.p && st.p.length ? 'on' : '');
    let x = 0;
    const rects = item.words.map((word) => {
      const w = 0.9 + Math.min(word.length, 10) * 0.24;
      const rect = `<rect x="${x.toFixed(2)}" y="${row * rowH}" width="${w.toFixed(2)}" height="1" rx="0.2"${cls ? ` class="${cls}"` : ''}/>`;
      x += w + 0.3;
      return rect;
    }).join('');
    width = Math.max(width, x - 0.3);
    return rects;
  }).join('');

  return `<svg class="sb-preview" viewBox="0 0 ${width.toFixed(2)} ${model.items.length * rowH - 0.7}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${rows}</svg>`;
}

function sentencesMeta(model) {
  const parts = [`${model.items.length} sentences`, `${model.tries} ${model.tries === 1 ? 'try' : 'tries'}`];
  if (model.extras) parts.push(`${model.extras} extra ${model.extras === 1 ? 'word' : 'words'}`);
  return parts.join(' · ');
}

function sentencesStatus(model, saved) {
  if (saved && saved.complete) return { cls: 'complete', text: 'Completed' };
  if (saved) return { cls: 'progress', text: `${saved.progress || 0} / ${model.items.length} sentences` };
  return { cls: '', text: 'Not started' };
}

/* ══════════════════════════════════════════════════════════════
   GAME
══════════════════════════════════════════════════════════════ */

function renderSentences({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { items } = model;
  const total = items.length;

  /* ─── Elements ───────────────────────────────────────────── */
  const barEl     = document.getElementById('sb-bar');
  const barLabel  = document.getElementById('sb-bar-label');
  const barText   = document.getElementById('sb-bar-text');
  const stageEl   = document.getElementById('sb-stage');
  const innerEl   = document.getElementById('sb-stage-inner');
  const answerEl  = document.getElementById('sb-answer');
  const bankEl    = document.getElementById('sb-bank');
  const statusEl  = document.getElementById('sb-status');
  const triesEl   = document.getElementById('sb-tries');
  const checkBtn  = document.getElementById('sb-check');
  const clearBtn  = document.getElementById('sb-clear');
  const scoreEl   = document.getElementById('sb-score');
  const roundEl   = document.getElementById('sb-round');
  const counter   = document.getElementById('progress-counter');
  const resetBtn  = document.getElementById('reset-btn');

  const toast  = createToast();
  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex });

  counter.title = 'Sentences finished';

  /* ─── State ──────────────────────────────────────────────── */
  // placed: tile ids in the answer line · marks: correct start after a wrong check
  const freshState = () => ({ placed: [], status: 'playing', tries: 0, hints: 0, pt: false, marks: null });
  const states = items.map(freshState);
  let current = 0;
  let wasComplete = false;
  let dialogTimer = null;

  const saved = SB_STORE.get(puzzle.id, model.sig);
  if (saved) {
    (saved.items || []).forEach((s, i) => {
      if (!states[i] || !s) return;
      const tileCount = items[i].tiles.length;
      const placed = Array.isArray(s.p) ? s.p.filter(id => Number.isInteger(id) && id >= 0 && id < tileCount) : [];
      states[i].placed = [...new Set(placed)];
      states[i].status = s.s === 'won' || s.s === 'lost' ? s.s : 'playing';
      states[i].tries = Math.max(0, Number(s.t) || 0);
      states[i].hints = Math.max(0, Number(s.h) || 0);
      states[i].pt = !!s.c;
    });
    if (Number.isInteger(saved.current) && items[saved.current]) current = saved.current;
  }

  const isStarted = s => !!(s.placed.length || s.tries || s.hints || s.pt || s.status !== 'playing');
  const finished  = () => states.filter(s => s.status !== 'playing').length;
  const wonCount  = () => states.filter(s => s.status === 'won').length;
  const isPerfect = s => s.status === 'won' && !s.tries && !s.hints;
  const attemptOf = (item, st) => st.placed.map(id => sbNorm(item.tiles[id]));

  // Tile ids that spell the main answer (used when the answer is revealed)
  function answerTiles(item) {
    const used = new Set();
    return item.answers[0].map((word) => {
      const id = item.order.find(tid => !used.has(tid) && sbNorm(item.tiles[tid]) === word);
      used.add(id);
      return id;
    });
  }

  const displayWord = (item, id, position) => {
    const word = item.tiles[id];
    return position === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  };

  /* ─── Rendering ──────────────────────────────────────────── */
  function renderBar() {
    const item = items[current];
    const st = states[current];
    const count = `<span class="sb-count">(${item.words.length} words)</span>`;
    barLabel.textContent = `Sentence ${current + 1} / ${total}`;
    barEl.classList.toggle('is-ok', st.status === 'won');
    barEl.classList.toggle('is-muted', st.status === 'lost');

    if (st.status !== 'playing') {
      barText.innerHTML = `<span class="sb-bar-answer">${escapeHTML(item.text)}</span> <span class="sb-bar-pt">${escapeHTML(item.pt)}</span>`;
    } else if (!model.hintOnRequest || st.pt) {
      barText.innerHTML = `<span class="sb-bar-main">“${escapeHTML(item.pt)}”</span> ${count}`;
    } else {
      barText.innerHTML = `<span class="sb-bar-hidden">Put the words in order.</span> ${count} <button type="button" class="sb-pt-btn" data-show-pt>Show translation</button>`;
    }
  }

  function tileButton(item, id, { position = -1, cls = '', label = '' } = {}) {
    const text = position >= 0 ? displayWord(item, id, position) : item.tiles[id];
    return `<button type="button" class="sb-tile ${cls}" data-tile="${id}"${label ? ` aria-label="${escapeHTML(label)}"` : ''}>${escapeHTML(text)}</button>`;
  }

  function renderAnswer(animate = false) {
    const item = items[current];
    const st = states[current];
    const done = st.status !== 'playing';

    answerEl.classList.toggle('is-won', st.status === 'won');
    answerEl.classList.toggle('is-lost', st.status === 'lost');

    if (!st.placed.length && !done) {
      answerEl.innerHTML = '<span class="sb-answer-empty">Tap the words below to build the sentence.</span>';
      return;
    }

    const tiles = st.placed.map((id, k) => {
      let cls = 'in-answer';
      if (st.status === 'won') cls += ' is-ok';
      else if (st.status === 'lost') cls += ' is-shown';
      else if (st.marks !== null) cls += k < st.marks ? ' is-ok' : ' is-bad';
      if (animate && k === st.placed.length - 1) cls += ' is-new';
      return tileButton(item, id, { position: k, cls, label: done ? '' : `Remove “${item.tiles[id]}”` });
    });

    // The final punctuation sticks to the last word, so it never wraps alone
    const last = tiles.pop() || '';
    answerEl.innerHTML = `${tiles.join('')}<span class="sb-last">${last}<span class="sb-end" aria-hidden="true">${item.end}</span></span>`;
    answerEl.querySelectorAll('.sb-tile').forEach(btn => { btn.disabled = done; });
  }

  function renderBank() {
    const item = items[current];
    const st = states[current];
    const done = st.status !== 'playing';
    const inAnswer = new Set(st.placed);

    bankEl.innerHTML = item.order.map((id) => {
      const used = inAnswer.has(id);
      const isExtra = id >= item.words.length;
      let cls = used ? 'is-used' : '';
      if (done && !used && isExtra) cls = 'is-extra';
      return tileButton(item, id, { cls, label: used ? '' : `Add “${item.tiles[id]}”` });
    }).join('');

    bankEl.querySelectorAll('.sb-tile').forEach((btn) => {
      const used = btn.classList.contains('is-used');
      btn.disabled = done || used;
      if (used) btn.setAttribute('aria-hidden', 'true');
    });
  }

  function renderControls() {
    const item = items[current];
    const st = states[current];
    const playing = st.status === 'playing';
    const left = Math.max(0, model.tries - st.tries);

    // After a wrong check, change something before checking again
    checkBtn.disabled = !playing || st.placed.length !== item.words.length || st.marks !== null;
    clearBtn.disabled = !playing || !st.placed.length;
    checkBtn.hidden = !playing;
    clearBtn.hidden = !playing;
    triesEl.hidden = !playing;
    triesEl.innerHTML = Array.from({ length: model.tries }, (_, i) => `<span class="sb-try${i < left ? ' is-left' : ''}"></span>`).join('') +
      `<span class="sb-tries-text">${left} ${left === 1 ? 'try' : 'tries'} left</span>`;
  }

  function renderRound() {
    scoreEl.innerHTML = `
      <span class="sb-score-num">${wonCount()}</span>
      <span class="sb-score-of">/ ${total}</span>
      <span class="sb-score-label">Correct</span>`;

    roundEl.innerHTML = '';
    items.forEach((item, i) => {
      const st = states[i];
      let title = `Sentence ${i + 1}`;
      let meta = `${item.words.length} words`;
      if (st.status === 'won') {
        title = escapeHTML(item.text);
        meta = isPerfect(st) ? 'Correct on the first try' : `Correct · ${st.tries} wrong ${st.tries === 1 ? 'try' : 'tries'}${st.hints ? ` · ${st.hints} ${st.hints === 1 ? 'hint' : 'hints'}` : ''}`;
      } else if (st.status === 'lost') {
        title = escapeHTML(item.text);
        meta = 'Answer shown';
      } else if (isStarted(st)) {
        meta = `In progress · ${st.placed.length} / ${item.words.length} words`;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sb-round-item is-${st.status}${i === current ? ' is-current' : ''}${st.status === 'playing' && isStarted(st) ? ' is-started' : ''}`;
      btn.setAttribute('aria-current', i === current ? 'true' : 'false');
      btn.innerHTML = `
        <span class="sb-round-num">${i + 1}</span>
        <span class="sb-round-body">
          <span class="sb-round-title">${title}</span>
          <span class="sb-round-meta">${meta}</span>
        </span>`;
      btn.addEventListener('click', () => goTo(i));

      const li = document.createElement('li');
      li.appendChild(btn);
      roundEl.appendChild(li);
    });
  }

  // withNext adds the "Next sentence" button after the message
  function setStatus(html, tone = '', withNext = false) {
    const label = finished() === total ? 'See results' : 'Next sentence';
    statusEl.innerHTML = `<span>${html}</span>${withNext ? `<button type="button" class="sb-next" data-next>${label} →</button>` : ''}`;
    statusEl.className = `sb-status${tone ? ` ${tone}` : ''}`;
  }

  function defaultStatus() {
    const item = items[current];
    const st = states[current];
    if (st.status === 'won') setStatus(isPerfect(st) ? '<b>Perfect!</b>' : '<b>Correct!</b>', 'ok', true);
    else if (st.status === 'lost') setStatus('<b>Here is the correct sentence.</b>', 'warn', true);
    else if (st.placed.length === item.words.length) setStatus('All words in place. Press <b>Check</b> when you are ready.');
    else if (model.extras) setStatus(`Use ${item.words.length} words. ${model.extras === 1 ? 'One word doesn\'t' : `${model.extras} words don't`} belong in the sentence.`);
    else setStatus('Tap the words in the right order.');
  }

  function shake() {
    answerEl.classList.remove('is-shake');
    void answerEl.getBoundingClientRect();
    answerEl.classList.add('is-shake');
  }

  // Largest tile size that keeps the stage free of scrolling (desktop only).
  // Within one sentence the size only shrinks, so tiles don't jump while playing.
  let fitKey = '';
  let fitSize = 24;
  function fitStage() {
    const stacked = window.matchMedia('(max-width: 900px)').matches;
    if (stacked) {
      stageEl.style.setProperty('--sb-fs', '16px');
      return;
    }
    const available = stageEl.clientHeight;
    if (!available) return;

    const key = `${current}|${stageEl.clientWidth}x${available}`;
    if (key !== fitKey) {
      fitKey = key;
      fitSize = 24;
    }
    for (let s = fitSize; s >= 13; s -= 1) {
      fitSize = s;
      stageEl.style.setProperty('--sb-fs', `${s}px`);
      if (innerEl.offsetHeight <= available) break;
    }
  }

  /* ─── Progress ───────────────────────────────────────────── */
  function commit({ animate = false } = {}) {
    renderBar();
    renderAnswer(animate);
    renderBank();
    renderControls();
    renderRound();
    fitStage();

    const done = finished();
    const complete = done === total;
    counter.textContent = `${done} / ${total}`;
    counter.classList.toggle('complete', complete);
    resetBtn.disabled = !states.some(isStarted);

    if (!states.some(isStarted)) {
      SB_STORE.set(puzzle.id, null);
    } else {
      SB_STORE.set(puzzle.id, {
        sig: model.sig,
        current,
        items: states.map(s => ({ p: s.placed, s: s.status, t: s.tries, h: s.hints, c: s.pt ? 1 : 0 })),
        progress: done,
        complete
      });
    }

    if (complete && !wasComplete) {
      clearTimeout(dialogTimer);
      dialogTimer = setTimeout(openDialog, 1600);
    }
    wasComplete = complete;
  }

  function openDialog() {
    clearTimeout(dialogTimer);
    if (dialog.isOpen()) return;
    const won = wonCount();
    const perfect = states.filter(isPerfect).length;
    let message = won === total
      ? `You built all ${total} sentences in “${puzzle.theme}”`
      : `You built ${won} of ${total} sentences in “${puzzle.theme}”`;
    message += perfect ? `, ${perfect} of them on the first try.` : '.';
    dialog.open(message);
  }

  /* ─── Game actions ───────────────────────────────────────── */
  function addTile(id) {
    const item = items[current];
    const st = states[current];
    if (st.status !== 'playing' || dialog.isOpen() || st.placed.includes(id)) return;
    if (st.placed.length >= item.words.length) {
      setStatus(`The sentence has ${item.words.length} words. Remove one before adding another.`, 'warn');
      return;
    }
    st.placed.push(id);
    st.marks = null;
    commit({ animate: true });
    defaultStatus();
  }

  function removeTile(id) {
    const st = states[current];
    if (st.status !== 'playing' || dialog.isOpen()) return;
    st.placed = st.placed.filter(tid => tid !== id);
    st.marks = null;
    commit();
    defaultStatus();
  }

  function clearAnswer() {
    const st = states[current];
    if (st.status !== 'playing' || !st.placed.length) return;
    st.placed = [];
    st.marks = null;
    commit();
    defaultStatus();
  }

  function check() {
    const item = items[current];
    const st = states[current];
    if (st.status !== 'playing' || dialog.isOpen()) return;
    if (st.placed.length !== item.words.length) {
      setStatus(`Use ${item.words.length} words to build the sentence.`, 'warn');
      return;
    }

    const attempt = attemptOf(item, st);
    if (item.answers.some(answer => answer.join(' ') === attempt.join(' '))) {
      st.status = 'won';
      st.marks = null;
      commit();
      defaultStatus();
      return;
    }

    st.tries++;
    const { length } = sbBestPrefix(item.answers, attempt);

    if (st.tries >= model.tries) {
      st.status = 'lost';
      st.marks = null;
      st.placed = answerTiles(item);
      commit();
      shake();
      setStatus('<b>Not quite.</b> Here is the correct sentence.', 'warn', true);
      return;
    }

    st.marks = length;
    commit();
    shake();
    const left = model.tries - st.tries;
    const leftText = `${left} ${left === 1 ? 'try' : 'tries'} left.`;
    setStatus(length
      ? `Not yet. The first <b>${length}</b> ${length === 1 ? 'word is' : 'words are'} in the right place. ${leftText}`
      : `Not yet. Check the <b>first word</b>. ${leftText}`, 'warn');
  }

  // Keeps the correct start, then adds the next word of the closest answer
  function revealWord() {
    const item = items[current];
    const st = states[current];
    if (st.status !== 'playing') { toast('This sentence is already finished.'); return; }

    const { answer, length } = sbBestPrefix(item.answers, attemptOf(item, st));
    st.placed = st.placed.slice(0, length);
    const need = answer[length];
    const id = item.order.find(tid => !st.placed.includes(tid) && sbNorm(item.tiles[tid]) === need);
    if (id === undefined) return;

    st.placed.push(id);
    st.hints++;
    st.marks = st.placed.length;

    if (st.placed.length === item.words.length) {
      st.status = 'won';
      st.marks = null;
      commit({ animate: true });
      setStatus('<b>Correct!</b> (with hints)', 'ok', true);
      return;
    }
    commit({ animate: true });
    setStatus(`Added <b>${escapeHTML(displayWord(item, id, st.placed.length - 1))}</b>.`, 'warn');
  }

  function showAnswer() {
    const item = items[current];
    const st = states[current];
    if (st.status !== 'playing') { toast('This sentence is already finished.'); return; }
    if (!confirm('Show the answer? This sentence will count as not correct.')) return;
    st.status = 'lost';
    st.marks = null;
    st.placed = answerTiles(item);
    commit();
    defaultStatus();
  }

  function showTranslation() {
    const st = states[current];
    if (!model.hintOnRequest || st.pt) return;
    st.pt = true;
    commit();
  }

  function goTo(i) {
    if (i < 0 || i >= total || dialog.isOpen()) return;
    current = i;
    states[i].marks = null;
    commit();
    defaultStatus();
  }

  function nextSentence() {
    for (let k = 1; k <= total; k++) {
      const i = (current + k) % total;
      if (states[i].status === 'playing') { goTo(i); return; }
    }
    openDialog();
  }

  /* ─── Events ─────────────────────────────────────────────── */
  bankEl.addEventListener('click', (e) => {
    const tile = e.target.closest('.sb-tile');
    if (tile && !tile.disabled) addTile(Number(tile.dataset.tile));
  });

  answerEl.addEventListener('click', (e) => {
    const tile = e.target.closest('.sb-tile');
    if (tile && !tile.disabled) removeTile(Number(tile.dataset.tile));
  });

  checkBtn.addEventListener('click', check);
  clearBtn.addEventListener('click', clearAnswer);

  statusEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) nextSentence();
  });
  barText.addEventListener('click', (e) => {
    if (e.target.closest('[data-show-pt]')) showTranslation();
  });

  document.getElementById('sb-prev').addEventListener('click', () => goTo(current - 1));
  document.getElementById('sb-next-sentence').addEventListener('click', () => goTo(current + 1));

  document.querySelectorAll('#pz-puzzle .pz-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'next-word') revealWord();
      else if (btn.dataset.action === 'show-answer') showAnswer();
    });
  });

  // Enter checks (or moves on), Backspace removes the last word,
  // and typing selects the next bank word that starts with those letters
  let typed = '';
  let typedTimer = null;
  document.addEventListener('keydown', (e) => {
    if (dialog.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target.closest ? e.target : document.body;
    if (target.closest('input, textarea, select')) return;
    const st = states[current];
    const onControl = target.closest('button, a');

    if (e.key === 'Enter' && !onControl) {
      e.preventDefault();
      if (st.status === 'playing') check(); else nextSentence();
    } else if (e.key === 'Backspace' && st.status === 'playing' && st.placed.length) {
      e.preventDefault();
      removeTile(st.placed[st.placed.length - 1]);
    } else if (e.key === 'Escape') {
      clearAnswer();
    } else if (e.key === 'ArrowRight' && !onControl) {
      goTo(current + 1);
    } else if (e.key === 'ArrowLeft' && !onControl) {
      goTo(current - 1);
    } else if (/^[a-z0-9']$/i.test(e.key) && st.status === 'playing') {
      e.preventDefault();
      typed += e.key.toLowerCase();
      const item = items[current];
      const candidates = item.order.filter(id => !st.placed.includes(id) && sbNorm(item.tiles[id]).startsWith(typed));
      const words = new Set(candidates.map(id => sbNorm(item.tiles[id])));
      const addTyped = (id) => { typed = ''; clearTimeout(typedTimer); addTile(id); };

      clearTimeout(typedTimer);
      if (!candidates.length) {
        typed = '';
      } else if (words.size === 1) {
        addTyped(candidates[0]);
      } else {
        // "to" also starts "tomorrow": wait a moment for more letters
        typedTimer = setTimeout(() => {
          const exact = candidates.find(id => sbNorm(item.tiles[id]) === typed);
          typed = '';
          if (exact !== undefined) addTile(exact);
        }, 700);
      }
    }
  });

  resetBtn.addEventListener('click', () => {
    if (!states.some(isStarted)) return;
    if (!confirm(`This will restart the whole round “${puzzle.theme}”.\n\nContinue?`)) return;
    states.forEach((s, i) => { states[i] = freshState(); });
    wasComplete = false;
    goTo(0);
  });

  new ResizeObserver(() => fitStage()).observe(stageEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage);

  /* ─── Initial render ─────────────────────────────────────── */
  wasComplete = finished() === total;
  commit();
  defaultStatus();
}

/* ─── Init ──────────────────────────────────────────────────── */

startPuzzleActivity(ACTIVITIES.sentences, {
  store: SB_STORE,
  buildModel: buildSentences,
  preview: sentencesPreview,
  meta: sentencesMeta,
  statusText: sentencesStatus,
  renderPuzzle: renderSentences
});
