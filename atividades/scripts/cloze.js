/* Complete the text (gap fill with a word bank) — requires scripts/common.js and scripts/puzzles.js */

const CT_STORE          = createProgressStore('heyTeacher:cloze');
const CT_LAYOUT_VERSION = 1;     // bump when gap handling changes (invalidates saved answers)

const CT_KINDS = {
  facts:    { label: 'Facts & curiosities', short: 'Facts' },
  everyday: { label: 'Everyday life',       short: 'Everyday' },
  grammar:  { label: 'Grammar practice',    short: 'Grammar' }
};

// Gap status
const CT_OPEN  = 0;
const CT_OK    = 1;
const CT_WRONG = 2;
const CT_SHOWN = 3;

const ctNorm = s => String(s).trim().replace(/\s+/g, ' ').replace(/[‘’`´]/g, "'").toLowerCase();
const ctStacked = () => window.matchMedia('(max-width: 900px)').matches;
const ctPlural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ─── Model ───────────────────────────────────────────────────
   In the data, gaps are written as [answer] inside the text, or
   [answer|alternative] when another word is also correct there.
──────────────────────────────────────────────────────────────── */

function buildCloze(puzzle, levelData) {
  const gaps = [];
  const plain = [];

  const paragraphs = puzzle.text.map((raw, para) => {
    const parts = [];
    let text = '';
    let last = 0;
    raw.replace(/\[([^\]]+)\]/g, (match, inner, offset) => {
      const before = raw.slice(last, offset);
      const [answer, ...alts] = inner.split('|').map(s => s.trim());
      parts.push(before);
      text += before;
      gaps.push({ index: gaps.length, answer, norms: [answer, ...alts].map(ctNorm), para, at: text.length });
      parts.push(gaps.length - 1);
      text += answer;
      last = offset + match.length;
      return match;
    });
    parts.push(raw.slice(last));
    text += raw.slice(last);
    plain.push(text);
    return parts;
  });

  gaps.forEach((g) => { g.pos = g.at / Math.max(1, plain[g.para].length); });

  // The bank is alphabetical, so its order gives nothing away
  const bank = [...gaps.map(g => g.answer), ...(puzzle.extra || [])]
    .map(word => ({ word, norm: ctNorm(word) }))
    .sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));

  const kind = CT_KINDS[puzzle.kind] ? puzzle.kind : 'facts';
  return {
    id: puzzle.id,
    sig: hashString([CT_LAYOUT_VERSION, ...puzzle.text, ...(puzzle.extra || [])].join('\n')).toString(36),
    kind,
    focus: kind === 'grammar' ? puzzle.focus || '' : '',
    rule: kind === 'grammar' ? puzzle.rule || '' : '',
    paragraphs,
    plain,
    gaps,
    bank,
    extra: bank.length - gaps.length,
    words: plain.join(' ').split(/\s+/).filter(w => /\w/.test(w)).length,
    hints: Number.isInteger(levelData.hints) ? levelData.hints : 0
  };
}

/* ══════════════════════════════════════════════════════════════
   THEME CARDS
══════════════════════════════════════════════════════════════ */

// Lines of text with the gaps drawn as boxes, colored by result
function clozePreview(model, saved) {
  const status = (saved && saved.status) || [];
  const pad = 9;
  const width = 230;
  const full = width - pad * 2;
  const gapW = 22;
  const totalChars = model.plain.reduce((sum, p) => sum + p.length, 0) || 1;
  const counts = model.plain.map(p => Math.max(1, Math.round((p.length / totalChars) * 8)));
  const totalLines = counts.reduce((sum, n) => sum + n, 0);
  // Dialogues have many short paragraphs: squeeze them so the page keeps its shape
  const lineH = Math.min(10, 96 / totalLines);
  const space = totalLines > 10 ? 1.5 : 4;
  const boxH = Math.min(7.2, lineH * 0.74);

  let y = pad;
  let lines = `<rect class="title" x="${pad}" y="${y}" width="92" height="5.2" rx="1.6"/>`;
  let boxes = '';
  y += 13;

  model.plain.forEach((p, para) => {
    const count = counts[para];
    const lineW = i => (i === count - 1 && count > 1 ? 120 : full);

    for (let i = 0; i < count; i++) {
      lines += `<rect x="${pad}" y="${(y + i * lineH + boxH / 2 - 1.4).toFixed(1)}" width="${lineW(i)}" height="2.8" rx="1.4"/>`;
    }

    let prevLine = -1;
    let prevX = 0;
    model.gaps.filter(g => g.para === para).forEach((g) => {
      let line = Math.min(count - 1, Math.floor(g.pos * count));
      let x = pad + (g.pos * count - line) * (lineW(line) - gapW);
      if (line === prevLine && x < prevX + gapW + 4) x = prevX + gapW + 4;
      if (x > pad + lineW(line) - gapW && line < count - 1) { line += 1; x = pad; }
      x = Math.min(x, pad + full - gapW);

      const st = Number(status[g.index]);
      const cls = st === CT_OK ? ' won' : st === CT_WRONG ? ' lost' : st === CT_SHOWN ? ' shown' : '';
      boxes += `<rect class="gap${cls}" x="${x.toFixed(1)}" y="${(y + line * lineH).toFixed(1)}" width="${gapW}" height="${boxH.toFixed(1)}" rx="2"/>`;
      prevLine = line;
      prevX = x;
    });

    y += count * lineH + space;
  });

  const pageH = y + pad - 5;
  return `<svg class="ct-preview" viewBox="0 0 ${width} ${pageH.toFixed(1)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect class="page" x="0" y="0" width="${width}" height="${pageH.toFixed(1)}" rx="4"/>${lines}${boxes}</svg>`;
}

function clozeMeta(model) {
  return `${CT_KINDS[model.kind].short} · ${model.words} words · ${model.gaps.length} gaps`;
}

function clozeStatus(model, saved) {
  const total = model.gaps.length;
  if (saved && saved.complete) return { cls: 'complete', text: `Score ${saved.firstTry || 0} / ${total}` };
  if (saved) return { cls: 'progress', text: `${saved.progress || 0} / ${total} gaps` };
  return { cls: '', text: 'Not started' };
}

/* ══════════════════════════════════════════════════════════════
   GAME
══════════════════════════════════════════════════════════════ */

function renderCloze({ activity, level, levelData, puzzle, puzzleIndex, model }) {
  const { gaps, bank } = model;
  const total = gaps.length;

  /* ─── Elements ───────────────────────────────────────────── */
  const textEl   = document.getElementById('ct-text');
  const bodyEl   = document.getElementById('ct-body');
  const bankWrap = document.getElementById('ct-bank-wrap');
  const bankEl   = document.getElementById('ct-bank');
  const scoreEl  = document.getElementById('ct-score');
  const hintBtn  = document.getElementById('ct-hint');
  const checkBtn = document.getElementById('ct-check');
  const counter  = document.getElementById('progress-counter');
  const resetBtn = document.getElementById('reset-btn');

  const toast = createToast();
  const dialog = createCompletionDialog({ activity, level, levelData, puzzleIndex });

  document.getElementById('pz-back-label').textContent = 'Texts';
  document.getElementById('pz-back').setAttribute('aria-label', 'Back to texts');
  document.getElementById('ct-kind').textContent = CT_KINDS[model.kind].label;
  document.getElementById('ct-meta').textContent = `${model.words} words · ${total} gaps`;
  document.getElementById('ct-title').textContent = puzzle.theme;
  document.getElementById('ct-bank-info').textContent = model.extra
    ? `${bank.length} words · ${model.extra} won't be used`
    : `${bank.length} words`;
  counter.title = 'Gaps completed';

  if (model.focus) {
    const focusEl = document.getElementById('ct-focus');
    document.getElementById('ct-focus-name').textContent = model.focus;
    document.getElementById('ct-focus-rule').textContent = model.rule;
    focusEl.hidden = false;
  }
  if (!model.hints) hintBtn.hidden = true;

  /* ─── State ──────────────────────────────────────────────── */
  const values = gaps.map(() => '');
  const status = gaps.map(() => CT_OPEN);
  const misses = gaps.map(() => 0);
  let hintsUsed = 0;
  let lastFocused = -1;
  let wasComplete = false;
  let dialogTimer = null;
  let saveTimer = null;

  const saved = CT_STORE.get(puzzle.id, model.sig);
  if (saved) {
    gaps.forEach((g, i) => {
      const st = Number((saved.status || [])[i]);
      status[i] = [CT_OK, CT_WRONG, CT_SHOWN].includes(st) ? st : CT_OPEN;
      values[i] = status[i] === CT_OK || status[i] === CT_SHOWN ? g.answer : String((saved.values || [])[i] || '');
      misses[i] = Math.max(0, Number((saved.misses || [])[i]) || 0);
    });
    hintsUsed = Math.min(model.hints, Math.max(0, Number(saved.hints) || 0));
  }

  const isLocked   = i => status[i] === CT_OK || status[i] === CT_SHOWN;
  const doneCount  = () => status.filter((_, i) => isLocked(i)).length;
  const isComplete = () => doneCount() === total;
  const firstTry   = () => gaps.filter((_, i) => status[i] === CT_OK && !misses[i]).length;
  const isStarted  = () => hintsUsed > 0 || values.some(v => v.trim()) || status.some(s => s !== CT_OPEN);

  /* ─── Text with the gaps ─────────────────────────────────── */
  bodyEl.innerHTML = model.paragraphs.map(parts => `<p class="ct-p">${parts.map(part => (typeof part === 'number'
    ? `<input class="ct-gap" type="text" data-gap="${part}" placeholder="${part + 1}" aria-label="Gap ${part + 1}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next">`
    : escapeHTML(part))).join('')}</p>`).join('');
  const inputs = [...bodyEl.querySelectorAll('.ct-gap')];

  // Gaps grow with what is typed, so their width doesn't reveal the answer
  const measure = document.createElement('canvas').getContext('2d');
  function sizeGap(input) {
    const style = getComputedStyle(input);
    const fontSize = parseFloat(style.fontSize) || 16;
    measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const textWidth = measure.measureText(input.value || '').width;
    input.style.width = `${Math.ceil(Math.max(fontSize * 4.4, textWidth + fontSize * 0.6) + padding)}px`;
  }
  const sizeAll = () => inputs.forEach(sizeGap);

  /* ─── Word bank ──────────────────────────────────────────── */
  // Gives each typed word a bank word. Solved gaps pick first, then the
  // gaps in reading order; a word typed twice only takes one bank word.
  function assignBank() {
    const owner = bank.map(() => -1);
    const warn = gaps.map(() => '');
    const order = gaps.map((_, i) => i).sort((a, b) => Number(isLocked(b)) - Number(isLocked(a)) || a - b);

    order.forEach((i) => {
      const norm = ctNorm(values[i]);
      if (!norm) return;
      const matches = bank.map((b, k) => (b.norm === norm ? k : -1)).filter(k => k >= 0);
      const free = matches.find(k => owner[k] < 0);
      if (free !== undefined) owner[free] = i;
      else if (!isLocked(i)) warn[i] = matches.length ? 'twice' : 'missing';
    });
    return { owner, warn };
  }

  /* ─── Rendering ──────────────────────────────────────────── */
  function render() {
    const { owner, warn } = assignBank();
    const complete = isComplete();

    inputs.forEach((input, i) => {
      const st = status[i];
      const locked = isLocked(i);
      const w = !locked && st !== CT_WRONG && document.activeElement !== input ? warn[i] : '';
      input.classList.toggle('is-ok', st === CT_OK);
      input.classList.toggle('is-wrong', st === CT_WRONG);
      input.classList.toggle('is-shown', st === CT_SHOWN);
      input.classList.toggle('is-warn', !!w);
      input.title = w === 'missing' ? 'This word is not in the word bank'
        : w === 'twice' ? 'This word is already in another gap' : '';
      input.readOnly = locked;
      input.tabIndex = locked ? -1 : 0;
      if (st === CT_WRONG) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      if (input.value !== values[i]) {
        input.value = values[i];
        sizeGap(input);
      }
    });

    bankEl.innerHTML = bank.map((b, k) => {
      const cls = owner[k] < 0 ? '' : isLocked(owner[k]) ? ' is-done' : ' is-used';
      return `<li class="ct-chip${cls}">${escapeHTML(b.word)}</li>`;
    }).join('');

    const done = doneCount();
    scoreEl.innerHTML = `
      <div class="ct-score-line">
        <span class="ct-score-num">${done}</span>
        <span class="ct-score-of">/ ${total}</span>
        <span class="ct-score-label">Gaps done</span>
      </div>
      <div class="ct-progress" aria-hidden="true"><i style="width:${(done / total) * 100}%"></i></div>`;

    const hintsLeft = model.hints - hintsUsed;
    hintBtn.textContent = hintsLeft > 0 ? `Reveal a word (${hintsLeft})` : 'No reveals left';
    hintBtn.disabled = complete || hintsLeft <= 0;
    checkBtn.textContent = complete ? 'Text complete' : 'Check answers';
    checkBtn.disabled = complete;

    counter.textContent = `${done} / ${total}`;
    counter.classList.toggle('complete', complete);
    resetBtn.disabled = !isStarted();
  }

  /* ─── Progress ───────────────────────────────────────────── */
  function save() {
    clearTimeout(saveTimer);
    if (!isStarted()) {
      CT_STORE.set(puzzle.id, null);
      return;
    }
    CT_STORE.set(puzzle.id, {
      sig: model.sig,
      values,
      status,
      misses,
      hints: hintsUsed,
      progress: doneCount(),
      firstTry: firstTry(),
      complete: isComplete()
    });
  }

  function commit() {
    render();
    save();
    const complete = isComplete();
    if (complete && !wasComplete) {
      clearTimeout(dialogTimer);
      dialogTimer = setTimeout(openDialog, 1100);
    }
    wasComplete = complete;
  }

  function openDialog() {
    clearTimeout(dialogTimer);
    if (dialog.isOpen()) return;
    const right = firstTry();
    let message = right === total
      ? `Perfect! You filled all ${total} gaps in “${puzzle.theme}” right on the first try.`
      : `You completed “${puzzle.theme}” with ${right} of ${total} gaps right on the first try`;
    if (right < total) message += hintsUsed ? ` and ${ctPlural(hintsUsed, 'word')} revealed.` : '.';
    dialog.open(message);
  }

  /* ─── Helpers ────────────────────────────────────────────── */
  function flash(input, cls) {
    input.classList.remove(cls);
    void input.offsetWidth;
    input.classList.add(cls);
  }

  // Brings a gap into view: inside the text panel on wide screens,
  // below the sticky word bank on phones
  function showGap(input) {
    const r = input.getBoundingClientRect();
    if (ctStacked()) {
      const top = bankWrap.getBoundingClientRect().bottom + 16;
      const bottom = (window.visualViewport ? window.visualViewport.height : window.innerHeight) - 16;
      if (r.top < top || r.bottom > bottom) {
        window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top - 60), behavior: 'smooth' });
      }
    } else {
      const t = textEl.getBoundingClientRect();
      if (r.top < t.top + 24 || r.bottom > t.bottom - 24) {
        textEl.scrollTo({ top: Math.max(0, textEl.scrollTop + r.top - t.top - textEl.clientHeight / 3), behavior: 'smooth' });
      }
    }
  }

  function focusGap(i, { select = false } = {}) {
    const input = inputs[i];
    if (!input) return;
    input.focus({ preventScroll: true });
    if (select) input.select();
    showGap(input);
  }

  // Next gap that still needs a word, starting after "from"
  function nextEmpty(from, step = 1) {
    for (let k = 1; k <= total; k++) {
      const i = (from + step * k + total * 2) % total;
      if (!isLocked(i) && !values[i].trim()) return i;
    }
    return -1;
  }

  /* ─── Actions ────────────────────────────────────────────── */
  function check() {
    if (dialog.isOpen() || isComplete()) return;
    const pending = gaps.map((_, i) => i).filter(i => !isLocked(i) && values[i].trim());
    if (!pending.length) {
      toast('Type a word from the bank in a gap first.', 'warn');
      const first = nextEmpty(-1);
      if (first >= 0 && !ctStacked()) focusGap(first);
      return;
    }

    let right = 0;
    const wrong = [];
    pending.forEach((i) => {
      if (gaps[i].norms.includes(ctNorm(values[i]))) {
        status[i] = CT_OK;
        values[i] = ctNorm(values[i]) === ctNorm(gaps[i].answer) ? gaps[i].answer : values[i].trim();
        right++;
      } else {
        status[i] = CT_WRONG;
        misses[i]++;
        wrong.push(i);
      }
    });
    commit();

    pending.forEach(i => flash(inputs[i], status[i] === CT_OK ? 'is-pop' : 'is-shake'));
    const left = total - doneCount();
    if (!left) {
      toast('All gaps complete!', 'ok');
    } else if (!wrong.length) {
      toast(`${right} correct! ${ctPlural(left, 'gap')} to go.`, 'ok');
    } else {
      toast(right ? `${right} correct, ${wrong.length} to fix.` : `Not quite: ${ctPlural(wrong.length, 'gap')} to fix.`, 'warn');
    }

    if (wrong.length) focusGap(wrong[0], { select: true });
    else if (left && !ctStacked()) {
      const next = nextEmpty(-1);
      if (next >= 0) focusGap(next);
    }
  }

  function reveal() {
    if (dialog.isOpen() || isComplete() || hintsUsed >= model.hints) return;
    const active = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.ct-gap') : null;
    let i = active ? Number(active.dataset.gap) : lastFocused;
    if (i < 0 || isLocked(i)) i = -1;
    if (i < 0) i = status.findIndex(s => s === CT_WRONG);
    if (i < 0) i = nextEmpty(-1);
    if (i < 0) i = gaps.findIndex((_, k) => !isLocked(k));
    if (i < 0) return;

    status[i] = CT_SHOWN;
    values[i] = gaps[i].answer;
    hintsUsed++;
    commit();
    flash(inputs[i], 'is-pop');
    showGap(inputs[i]);
    toast(`Gap ${i + 1}: “${gaps[i].answer}”`);
  }

  /* ─── Events ─────────────────────────────────────────────── */
  bodyEl.addEventListener('input', (e) => {
    const input = e.target.closest('.ct-gap');
    if (!input) return;
    const i = Number(input.dataset.gap);
    if (isLocked(i)) return;
    values[i] = input.value;
    if (status[i] === CT_WRONG) status[i] = CT_OPEN;
    sizeGap(input);
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  });

  bodyEl.addEventListener('focusin', (e) => {
    const input = e.target.closest('.ct-gap');
    if (!input) return;
    lastFocused = Number(input.dataset.gap);
    render();
  });

  bodyEl.addEventListener('focusout', (e) => {
    if (e.target.closest('.ct-gap')) {
      save();
      // The warning for a word outside the bank shows once you leave the gap
      requestAnimationFrame(render);
    }
  });

  // Enter jumps to the next empty gap (Shift+Enter goes back); with every gap
  // filled, it checks the answers
  bodyEl.addEventListener('keydown', (e) => {
    const input = e.target.closest('.ct-gap');
    if (!input || e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { check(); return; }
    const i = Number(input.dataset.gap);
    const next = nextEmpty(i, e.shiftKey ? -1 : 1);
    if (next >= 0 && next !== i) focusGap(next);
    else if (!e.shiftKey) check();
  });

  document.addEventListener('keydown', (e) => {
    if (dialog.isOpen() || e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    if (e.target.closest && e.target.closest('.ct-gap')) return;
    e.preventDefault();
    check();
  });

  checkBtn.addEventListener('click', check);
  // Keeps the focused gap as the target of a reveal
  hintBtn.addEventListener('mousedown', e => e.preventDefault());
  hintBtn.addEventListener('click', reveal);

  resetBtn.addEventListener('click', () => {
    if (!isStarted()) return;
    if (!confirm(`This will clear your answers for “${puzzle.theme}”.\n\nContinue?`)) return;
    gaps.forEach((_, i) => {
      values[i] = '';
      status[i] = CT_OPEN;
      misses[i] = 0;
    });
    hintsUsed = 0;
    lastFocused = -1;
    wasComplete = false;
    clearTimeout(dialogTimer);
    textEl.scrollTop = 0;
    commit();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sizeAll, 150);
  });

  /* ─── Initial render ─────────────────────────────────────── */
  wasComplete = isComplete();
  render();
  sizeAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeAll);
}

/* ─── Init ──────────────────────────────────────────────────── */

startPuzzleActivity(ACTIVITIES.cloze, {
  store: CT_STORE,
  buildModel: buildCloze,
  preview: clozePreview,
  meta: clozeMeta,
  statusText: clozeStatus,
  renderPuzzle: renderCloze
});
