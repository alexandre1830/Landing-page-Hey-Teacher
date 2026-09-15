/* Reading comprehension — requires scripts/common.js and scripts/puzzles.js */

const RD_STORE          = createProgressStore('heyTeacher:reading');
const RD_LAYOUT_VERSION = 1;     // bump when option handling changes (invalidates saved answers)

const RD_SKILLS = {
  'main idea': 'Main idea',
  detail: 'Detail',
  vocabulary: 'Vocabulary',
  inference: 'Inference',
  reference: 'Reference',
  purpose: 'Purpose',
  tone: 'Tone & attitude'
};

const RD_TF_OPTIONS = {
  tf: ['True', 'False'],
  tfng: ['True', 'False', 'Not given']
};

const rdLetter = i => String.fromCharCode(65 + i);
const rdStacked = () => window.matchMedia('(max-width: 900px)').matches;

/* ─── Model ─────────────────────────────────────────────────── */

function buildReading(puzzle, levelData) {
  const paragraphs = puzzle.text.map(t => t.trim());
  const words = paragraphs.join(' ').split(/\s+/).filter(w => /\w/.test(w)).length;

  const questions = puzzle.questions.map((q, index) => {
    const type = RD_TF_OPTIONS[q.type] ? q.type : 'mc';
    let options;
    let correct;

    if (type === 'mc') {
      // The first option in the data is the right one: same shuffle for everyone
      const random = seededRandom(hashString(`${puzzle.id}:${index}`));
      const order = q.options.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      options = order.map(i => q.options[i]);
      correct = order.indexOf(0);
    } else {
      options = RD_TF_OPTIONS[type];
      correct = Math.max(0, options.findIndex(o => o.toLowerCase() === String(q.answer).toLowerCase()));
    }

    const para = q.quote ? paragraphs.findIndex(p => p.includes(q.quote)) : -1;
    return {
      index,
      type,
      skill: RD_SKILLS[q.skill] || 'Detail',
      q: q.q,
      options,
      correct,
      quote: para >= 0 ? q.quote : '',
      para,
      explain: q.explain || ''
    };
  });

  const sig = hashString([RD_LAYOUT_VERSION, ...paragraphs, ...questions.map(q => `${q.q}|${q.options.join('|')}|${q.correct}`)].join('\n')).toString(36);
  return {
    id: puzzle.id,
    sig,
    genre: puzzle.genre || 'Text',
    words,
    minutes: Math.max(1, Math.round(words / 150)),
    paragraphs,
    questions,
    hint: ['sentence', 'paragraph'].includes(levelData.hint) ? levelData.hint : 'none',
    // Paragraph numbers only when a question refers to them
    numbered: questions.some(q => /paragraph \d/i.test(q.q))
  };
}

/* ══════════════════════════════════════════════════════════════
   THEME CARDS
══════════════════════════════════════════════════════════════ */

// A page of text lines next to the list of questions, colored by result
function readingPreview(model, saved) {
  const answers = (saved && saved.answers) || [];
  const totalChars = model.paragraphs.reduce((sum, p) => sum + p.length, 0);
  const pad = 7;
  const pageW = 96;
  let y = pad;
  let lines = `<rect class="title" x="${pad}" y="${y}" width="52" height="4.6" rx="1.4"/>`;
  y += 10;

  model.paragraphs.forEach((p) => {
    const count = Math.max(1, Math.round((p.length / totalChars) * 11));
    for (let i = 0; i < count; i++) {
      const w = i === count - 1 && count > 1 ? 50 : pageW - pad * 2;
      lines += `<rect x="${pad}" y="${y.toFixed(1)}" width="${w}" height="2.4" rx="1.2"/>`;
      y += 4.4;
    }
    y += 2.4;
  });
  const pageH = y - 4.4 + pad;

  const n = model.questions.length;
  const step = Math.min(8, (pageH - 6) / n);
  const top = (pageH - step * (n - 1)) / 2;
  const rows = model.questions.map((q, i) => {
    const a = answers[i] ? Number(answers[i][0]) : -1;
    const cls = a >= 0 ? (a === q.correct ? ' class="won"' : ' class="lost"') : '';
    const cy = (top + i * step).toFixed(1);
    const w = 22 + ((i * 7) % 3) * 6;
    return `<circle cx="112" cy="${cy}" r="2.3"${cls}/><rect x="118" y="${(cy - 1.2).toFixed(1)}" width="${w}" height="2.4" rx="1.2"/>`;
  }).join('');

  return `<svg class="rd-preview" viewBox="0 0 152 ${pageH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect class="page" x="0" y="0" width="${pageW}" height="${pageH.toFixed(1)}" rx="4"/>${lines}${rows}</svg>`;
}

function readingMeta(model) {
  return `${model.genre} · ${model.words} words · ${model.questions.length} questions`;
}

function readingStatus(model, saved) {
  const total = model.questions.length;
  if (saved && saved.complete) return { cls: 'complete', text: `Score ${saved.correct || 0} / ${total}` };
  if (saved) return { cls: 'progress', text: `${saved.progress || 0} / ${total} answered` };
  return { cls: '', text: 'Not started' };
}

/* ══════════════════════════════════════════════════════════════
   GAME
══════════════════════════════════════════════════════════════ */

function renderReading({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { questions, paragraphs } = model;
  const total = questions.length;

  /* ─── Elements ───────────────────────────────────────────── */
  const mainEl     = document.getElementById('pz-puzzle');
  const textEl     = document.getElementById('rd-text');
  const bodyEl     = document.getElementById('rd-body');
  const questionEl = document.getElementById('rd-question');
  const scoreEl    = document.getElementById('rd-score');
  const dotsEl     = document.getElementById('rd-dots');
  const prevBtn    = document.getElementById('rd-prev');
  const hintBtn    = document.getElementById('rd-hint');
  const nextBtn    = document.getElementById('rd-next');
  const tabCount   = document.getElementById('rd-tab-count');
  const counter    = document.getElementById('progress-counter');
  const resetBtn   = document.getElementById('reset-btn');

  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex });

  document.getElementById('pz-back-label').textContent = 'Texts';
  document.getElementById('pz-back').setAttribute('aria-label', 'Back to texts');
  document.getElementById('rd-genre').textContent = model.genre;
  document.getElementById('rd-meta').textContent = `${model.words} words · about ${model.minutes} min`;
  document.getElementById('rd-title').textContent = puzzle.theme;
  counter.title = 'Questions answered';
  if (model.hint === 'none') hintBtn.hidden = true;
  textEl.classList.toggle('is-numbered', model.numbered);

  /* ─── State ──────────────────────────────────────────────── */
  // a: chosen option (-1 = not answered) · h: hint used
  const freshState = () => ({ a: -1, h: 0 });
  const states = questions.map(freshState);
  let current = 0;
  let wasComplete = false;
  let dialogTimer = null;
  let bodyKey = '';
  let shownQuestion = -1;
  let justAnswered = false;

  const saved = RD_STORE.get(puzzle.id, model.sig);
  if (saved) {
    (saved.answers || []).forEach((entry, i) => {
      if (!states[i] || !Array.isArray(entry)) return;
      const a = Number(entry[0]);
      states[i].a = Number.isInteger(a) && a >= 0 && a < questions[i].options.length ? a : -1;
      states[i].h = entry[1] ? 1 : 0;
    });
    if (Number.isInteger(saved.current) && questions[saved.current]) current = saved.current;
  }

  const isAnswered   = i => states[i].a >= 0;
  const isCorrect    = i => states[i].a === questions[i].correct;
  const answeredCount = () => states.filter(s => s.a >= 0).length;
  const correctCount = () => questions.filter((_, i) => isCorrect(i)).length;
  const isStarted    = () => states.some(s => s.a >= 0 || s.h);

  /* ─── Rendering ──────────────────────────────────────────── */

  // What the text shows for the current question: the evidence once answered,
  // or the hint (sentence or paragraph) while it is still open
  function highlight() {
    const q = questions[current];
    const st = states[current];
    if (q.para < 0) return { para: -1, mark: '' };
    if (st.a >= 0) return { para: q.para, mark: 'evidence' };
    if (st.h && model.hint === 'sentence') return { para: q.para, mark: 'hint' };
    if (st.h && model.hint === 'paragraph') return { para: q.para, mark: 'paragraph' };
    return { para: -1, mark: '' };
  }

  function renderBody() {
    const q = questions[current];
    const { para, mark } = highlight();
    const key = `${current}|${para}|${mark}`;
    if (key === bodyKey) return false;
    bodyKey = key;

    bodyEl.innerHTML = paragraphs.map((text, i) => {
      let html = escapeHTML(text);
      let cls = 'rd-p';
      if (i === para && (mark === 'evidence' || mark === 'hint')) {
        const at = text.indexOf(q.quote);
        html = `${escapeHTML(text.slice(0, at))}<mark class="rd-mark is-${mark}">${escapeHTML(q.quote)}</mark>${escapeHTML(text.slice(at + q.quote.length))}`;
      } else if (i === para && mark === 'paragraph') {
        cls += ' is-hint';
      }
      return `<p class="${cls}" data-n="${i + 1}">${html}</p>`;
    }).join('');
    return !!mark;
  }

  function renderQuestion() {
    const q = questions[current];
    const st = states[current];
    const answered = st.a >= 0;

    const kind = q.type === 'tf' ? 'True or false?' : q.type === 'tfng' ? 'True, false or not given?' : '';
    const prompt = kind
      ? `<p class="rd-q-kind">${kind}</p><p class="rd-q-text is-statement">${escapeHTML(q.q)}</p>`
      : `<p class="rd-q-text">${escapeHTML(q.q)}</p>`;

    const options = q.options.map((option, i) => {
      let cls = 'rd-option';
      if (answered) {
        if (i === q.correct) cls += ' is-correct';
        else if (i === st.a) cls += ' is-wrong';
        else cls += ' is-dim';
      }
      return `<button type="button" class="${cls}" data-option="${i}"${answered ? ' disabled' : ''}>
          <span class="rd-key" aria-hidden="true">${rdLetter(i)}</span>
          <span class="rd-option-text">${escapeHTML(option)}</span>
        </button>`;
    }).join('');

    let feedback = '';
    if (answered) {
      const ok = st.a === q.correct;
      const answerName = q.type === 'mc' ? rdLetter(q.correct) : `“${q.options[q.correct]}”`;
      const title = ok ? (st.h ? 'Correct, with a hint.' : 'Correct!') : `Not quite. The answer is ${answerName}.`;
      feedback = `
        <div class="rd-feedback ${ok ? 'is-ok' : 'is-bad'}${justAnswered ? ' is-new' : ''}">
          <p><strong>${title}</strong> ${escapeHTML(q.explain)}</p>
          ${q.quote ? '<button type="button" class="rd-link" data-show-quote>Show in the text</button>' : ''}
        </div>`;
    }

    // Animations only play for a new question or a new answer
    const isNewQuestion = shownQuestion !== current;
    questionEl.classList.toggle('is-same', shownQuestion === current);
    shownQuestion = current;
    questionEl.innerHTML = `
      <div class="rd-q-head">
        <span class="rd-q-num">Question ${current + 1} of ${total}</span>
        <span class="rd-skill">${escapeHTML(q.skill)}</span>
      </div>
      ${prompt}
      <div class="rd-options${q.type === 'mc' ? '' : ' is-short'}" role="group" aria-label="Options">${options}</div>
      <div class="rd-feedback-slot" aria-live="polite">${feedback}</div>`;
    if (isNewQuestion) questionEl.scrollTop = 0;
  }

  function renderPanel() {
    const q = questions[current];
    const st = states[current];
    const answered = st.a >= 0;
    const done = answeredCount();
    const allDone = done === total;

    scoreEl.innerHTML = `
      <span class="rd-score-num">${correctCount()}</span>
      <span class="rd-score-of">/ ${total}</span>
      <span class="rd-score-label">Correct</span>`;

    dotsEl.innerHTML = questions.map((_, i) => {
      let cls = 'rd-dot';
      let label = `Question ${i + 1}`;
      if (isAnswered(i)) {
        cls += isCorrect(i) ? ' is-ok' : ' is-bad';
        label += isCorrect(i) ? ', correct' : ', wrong';
      }
      if (i === current) cls += ' is-current';
      return `<li><button type="button" class="${cls}" data-go="${i}" aria-label="${label}"${i === current ? ' aria-current="true"' : ''}>${i + 1}</button></li>`;
    }).join('');

    prevBtn.disabled = current === 0;

    if (model.hint !== 'none') {
      hintBtn.hidden = answered;
      hintBtn.disabled = !q.quote || !!st.h;
      hintBtn.title = q.quote ? '' : 'This question is about the whole text.';
      hintBtn.textContent = st.h ? 'Hint shown' : (model.hint === 'sentence' ? 'Show the sentence' : 'Show the paragraph');
    }

    if (allDone) {
      nextBtn.textContent = 'See results';
      nextBtn.className = 'rd-btn primary';
    } else if (answered) {
      nextBtn.textContent = 'Next question →';
      nextBtn.className = 'rd-btn primary';
    } else {
      nextBtn.textContent = 'Skip →';
      nextBtn.className = 'rd-btn ghost';
    }
    // Nothing to skip to when this is the last open question
    nextBtn.disabled = !answered && done === total - 1;

    tabCount.textContent = `${done}/${total}`;
  }

  /* ─── Progress ───────────────────────────────────────────── */
  function commit({ reveal = false } = {}) {
    const marked = renderBody();
    renderQuestion();
    renderPanel();

    const done = answeredCount();
    const complete = done === total;
    counter.textContent = `${done} / ${total}`;
    counter.classList.toggle('complete', complete);
    resetBtn.disabled = !isStarted();

    if (!isStarted()) {
      RD_STORE.set(puzzle.id, null);
    } else {
      RD_STORE.set(puzzle.id, {
        sig: model.sig,
        current,
        answers: states.map(s => [s.a, s.h]),
        progress: done,
        correct: correctCount(),
        complete
      });
    }

    // On a wide screen the text scrolls by itself to the highlighted part
    if (reveal && marked && !rdStacked()) scrollToHighlight();

    if (complete && !wasComplete) {
      clearTimeout(dialogTimer);
      dialogTimer = setTimeout(openDialog, 1400);
    }
    wasComplete = complete;
  }

  function openDialog() {
    clearTimeout(dialogTimer);
    if (dialog.isOpen()) return;
    const correct = correctCount();
    const noHints = questions.filter((_, i) => isCorrect(i) && !states[i].h).length;
    let message = correct === total
      ? `Perfect! You answered all ${total} questions about “${puzzle.theme}” correctly`
      : `You answered ${correct} of ${total} questions about “${puzzle.theme}” correctly`;
    message += model.hint !== 'none' && correct && noHints < correct ? `, ${noHints} without hints.` : '.';
    dialog.open(message);
  }

  function scrollToHighlight({ flash = false } = {}) {
    const target = bodyEl.querySelector('.rd-mark, .rd-p.is-hint');
    if (!target) return;

    if (rdStacked()) {
      const top = target.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      const top = target.getBoundingClientRect().top - textEl.getBoundingClientRect().top + textEl.scrollTop - textEl.clientHeight / 3;
      textEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    if (flash) {
      target.classList.remove('is-flash');
      void target.getBoundingClientRect();
      target.classList.add('is-flash');
    }
  }

  /* ─── Actions ────────────────────────────────────────────── */
  function choose(option) {
    const st = states[current];
    if (st.a >= 0 || dialog.isOpen()) return;
    st.a = option;
    justAnswered = true;
    commit({ reveal: true });
    justAnswered = false;
    const focusTarget = nextBtn.hidden ? null : nextBtn;
    if (focusTarget && !rdStacked()) focusTarget.focus({ preventScroll: true });

    // Long questions: bring the explanation into view inside the panel
    const feedback = questionEl.querySelector('.rd-feedback');
    if (feedback && !rdStacked()) {
      const hidden = feedback.getBoundingClientRect().bottom - questionEl.getBoundingClientRect().bottom;
      if (hidden > 0) questionEl.scrollBy({ top: hidden + 16, behavior: 'smooth' });
    }
  }

  function useHint() {
    const q = questions[current];
    const st = states[current];
    if (model.hint === 'none' || st.a >= 0 || st.h || !q.quote) return;
    st.h = 1;
    commit();
    if (rdStacked()) setTab('text');
    scrollToHighlight({ flash: true });
  }

  function goTo(i) {
    if (i < 0 || i >= total || dialog.isOpen()) return;
    current = i;
    commit({ reveal: true });
  }

  function nextQuestion() {
    if (answeredCount() === total) {
      openDialog();
      return;
    }
    for (let k = 1; k < total; k++) {
      const i = (current + k) % total;
      if (!isAnswered(i)) { goTo(i); return; }
    }
  }

  /* ─── Tabs (phones and tablets) ──────────────────────────── */
  function setTab(tab) {
    mainEl.dataset.tab = tab;
    mainEl.querySelectorAll('[data-tab]').forEach((btn) => {
      if (!btn.classList.contains('rd-tab')) return;
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    });
  }

  function openTab(tab) {
    setTab(tab);
    const top = mainEl.getBoundingClientRect().top + window.scrollY - 8;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }

  /* ─── Events ─────────────────────────────────────────────── */
  questionEl.addEventListener('click', (e) => {
    const option = e.target.closest('[data-option]');
    if (option && !option.disabled) { choose(Number(option.dataset.option)); return; }
    if (e.target.closest('[data-show-quote]')) {
      if (rdStacked()) setTab('text');
      scrollToHighlight({ flash: true });
    }
  });

  dotsEl.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-go]');
    if (dot) goTo(Number(dot.dataset.go));
  });

  mainEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.rd-tab, [data-tab-go]');
    if (tab) openTab(tab.dataset.tab || tab.dataset.tabGo);
  });

  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', nextQuestion);
  hintBtn.addEventListener('click', useHint);

  // A–D or 1–4 choose an option, Enter moves on, arrows change question
  document.addEventListener('keydown', (e) => {
    if (dialog.isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target.closest ? e.target : document.body;
    if (target.closest('input, textarea, select')) return;
    if (rdStacked() && mainEl.dataset.tab === 'text') return;
    const q = questions[current];
    const onControl = target.closest('button, a');
    const key = e.key.toLowerCase();

    const letterIndex = key.length === 1 ? key.charCodeAt(0) - 97 : -1;
    const numberIndex = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    const option = letterIndex >= 0 && letterIndex < q.options.length ? letterIndex
      : numberIndex >= 0 && numberIndex < q.options.length ? numberIndex : -1;

    if (option >= 0 && !isAnswered(current)) {
      e.preventDefault();
      choose(option);
    } else if (e.key === 'Enter' && !onControl && isAnswered(current)) {
      e.preventDefault();
      nextQuestion();
    } else if (e.key === 'ArrowRight' && !onControl) {
      goTo(current + 1);
    } else if (e.key === 'ArrowLeft' && !onControl) {
      goTo(current - 1);
    }
  });

  resetBtn.addEventListener('click', () => {
    if (!isStarted()) return;
    if (!confirm(`This will clear your answers for “${puzzle.theme}”.\n\nContinue?`)) return;
    states.forEach((_, i) => { states[i] = freshState(); });
    wasComplete = false;
    current = 0;
    bodyKey = '';
    textEl.scrollTop = 0;
    commit();
  });

  /* ─── Initial render ─────────────────────────────────────── */
  setTab('text');
  wasComplete = answeredCount() === total;
  commit();
  if (!rdStacked() && isAnswered(current)) scrollToHighlight();
}

/* ─── Init ──────────────────────────────────────────────────── */

startPuzzleActivity(ACTIVITIES.reading, {
  store: RD_STORE,
  buildModel: buildReading,
  preview: readingPreview,
  meta: readingMeta,
  statusText: readingStatus,
  renderPuzzle: renderReading
});
