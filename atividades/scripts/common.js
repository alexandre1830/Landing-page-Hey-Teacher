const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const ACTIVITIES_ROOT = '/atividades';

// Asset version: bump it (together with the ?v= in the /atividades/ pages) whenever a
// deploy changes game scripts, styles or data, so browsers never mix cached old files.
const ASSETS_VERSION = '20260917-7';

/* ─── Activity registry ─────────────────────────────────────────
   To add a new activity: register it here, create its folder
   (/atividades/<slug>/index.html + /atividades/<slug>/jogar/index.html)
   and its JSON file (with a "levels" object keyed by CEFR level, each
   level having "name" and "description").
──────────────────────────────────────────────────────────────── */

const ACTIVITIES = {
  conversation: {
    id: 'conversation',
    slug: 'cartoes-de-conversacao',
    title: 'Cartões de Conversação',
    kicker: 'Speaking',
    dataUrl: `${ACTIVITIES_ROOT}/data/questions.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.questions.length} perguntas`,
    visual: `
      <div class="ac-stack" aria-hidden="true">
        <span class="ac-stack-card back">12</span>
        <span class="ac-stack-card mid">7</span>
        <span class="ac-stack-card front">
          <span class="ac-stack-line"></span>
          <span class="ac-stack-line short"></span>
          <span class="ac-stack-tag"></span>
        </span>
      </div>`
  },

  crosswords: {
    id: 'crosswords',
    slug: 'palavras-cruzadas',
    title: 'Palavras Cruzadas',
    kicker: 'Vocabulário',
    dataUrl: `${ACTIVITIES_ROOT}/data/crosswords.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} cruzadas`,
    visual: `
      <div class="ac-mini-grid" aria-hidden="true">
        ${[
          // [row, col, letter, state]
          [0, 1, 'C', ''], [1, 1, 'R', ''], [2, 0, 'W', ''], [2, 1, 'O', ''],
          [2, 2, 'R', ''], [2, 3, 'D', ''], [3, 1, 'S', ''], [4, 1, 'S', ''],
          [1, 4, 'U', 'word'], [2, 4, 'S', 'word'], [3, 4, '', 'active'], [4, 4, '', 'word']
        ].map(([r, c, ch, st]) =>
          `<span class="ac-tile ${st}" style="grid-row:${r + 1};grid-column:${c + 1}">${ch}</span>`
        ).join('')}
      </div>`
  },

  wordsearch: {
    id: 'wordsearch',
    slug: 'caca-palavras',
    title: 'Caça-Palavras',
    kicker: 'Vocabulário',
    dataUrl: `${ACTIVITIES_ROOT}/data/wordsearch.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} grades`,
    visual: `
      <svg class="ac-ws" viewBox="0 0 6 5" aria-hidden="true">
        <line x1="1.5" y1="1.5" x2="5.5" y2="1.5" stroke="#f2a7a6"/>
        <line x1="1.5" y1="4.5" x2="4.5" y2="4.5" stroke="#9fc3ec"/>
        <line x1="0.5" y1="0.5" x2="0.5" y2="3.5" stroke="#a8dcbf"/>
        ${['FINDXE', 'AWORDS', 'SLETZB', 'TUNHOP', 'CSEEKR'].map((row, r) =>
          [...row].map((ch, c) => `<text x="${c + 0.5}" y="${r + 0.54}">${ch}</text>`).join('')
        ).join('')}
      </svg>`
  },

  memory: {
    id: 'memory',
    slug: 'jogo-da-memoria',
    title: 'Jogo da Memória',
    kicker: 'Vocabulário',
    dataUrl: `${ACTIVITIES_ROOT}/data/memory.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} rodadas · ${ld.pairs} pares`,
    visual: `
      <div class="ac-mm" aria-hidden="true">
        ${[
          ['', ''], ['open word', 'brave'], ['', ''], ['found word', 'cat'],
          ['found def', '~'], ['', ''], ['open def', '~'], ['', '']
        ].map(([st, text]) => {
          if (!st) return '<span class="ac-mm-card"><b>?</b></span>';
          const inner = text === '~' ? '<i></i><i></i><i class="short"></i>' : text;
          return `<span class="ac-mm-card up ${st}">${inner}</span>`;
        }).join('')}
      </div>`
  },

  sentences: {
    id: 'sentences',
    slug: 'monte-a-frase',
    title: 'Monte a Frase',
    kicker: 'Gramática',
    dataUrl: `${ACTIVITIES_ROOT}/data/sentences.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} rodadas · ${ld.puzzles.reduce((sum, p) => sum + p.sentences.length, 0)} frases`,
    visual: `
      <div class="ac-sb" aria-hidden="true">
        <div class="ac-sb-line">
          ${['She', 'has', 'already'].map(w => `<span class="ok">${w}</span>`).join('')}<span class="slot"></span><span class="end">.</span>
        </div>
        <div class="ac-sb-bank">
          ${[['finished', ''], ['', 'used'], ['yet', 'extra'], ['', 'used'], ['work', ''], ['her', ''], ['', 'used']].map(([w, st]) =>
            `<span class="${st}">${w}</span>`
          ).join('')}
        </div>
      </div>`
  },

  reading: {
    id: 'reading',
    slug: 'interpretacao-de-texto',
    title: 'Interpretação de Texto',
    kicker: 'Leitura',
    dataUrl: `${ACTIVITIES_ROOT}/data/reading.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} textos · ${ld.questions} perguntas cada`,
    visual: `
      <div class="ac-rd" aria-hidden="true">
        <div class="ac-rd-page">
          <span class="ac-rd-title"></span>
          <i></i><i></i><i class="mark"></i><i class="short"></i>
          <i></i><i></i><i class="short"></i>
        </div>
        <div class="ac-rd-card">
          <span class="ac-rd-q"></span>
          ${[['A', ''], ['B', 'ok'], ['C', '']].map(([key, st]) => `<span class="ac-rd-opt ${st}"><b>${key}</b><i></i></span>`).join('')}
        </div>
      </div>`
  },

  cloze: {
    id: 'cloze',
    slug: 'complete-o-texto',
    title: 'Complete o Texto',
    kicker: 'Gramática e vocabulário',
    dataUrl: `${ACTIVITIES_ROOT}/data/cloze.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} textos · ${ld.gaps} lacunas cada`,
    visual: `
      <div class="ac-ct" aria-hidden="true">
        <div class="ac-ct-page">
          <span class="ac-ct-title"></span>
          <p><i style="width:24%"></i><b class="ok">went</b><i style="width:30%"></i></p>
          <p><i style="width:46%"></i><b class="active"></b><i style="width:12%"></i></p>
          <p><i style="width:16%"></i><b></b><i style="width:40%"></i></p>
          <p><i style="width:58%"></i></p>
        </div>
        <div class="ac-ct-bank">
          ${[['went', 'used'], ['since', ''], ['bought', ''], ['goed', 'extra'], ['ago', '']].map(([w, st]) =>
            `<span class="${st}">${w}</span>`
          ).join('')}
        </div>
      </div>`
  },

  maze: {
    id: 'maze',
    slug: 'come-palavras',
    title: 'Come-Palavras',
    kicker: 'Arcade',
    dataUrl: `${ACTIVITIES_ROOT}/data/maze.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} rodadas · ${ld.options} respostas`,
    visual: `
      <svg class="ac-mz" viewBox="0 0 124 86" aria-hidden="true">
        <g class="ac-mz-wall">
          ${[[6, 8, 34, 8], [50, 8, 24, 8], [84, 8, 34, 8], [6, 26, 8, 30], [24, 26, 26, 8],
             [60, 26, 8, 30], [78, 26, 26, 8], [110, 26, 8, 30], [24, 44, 8, 30], [42, 62, 40, 8],
             [96, 44, 8, 12], [6, 66, 8, 12]].map(([x, y, w, h]) =>
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`).join('')}
        </g>
        <g class="ac-mz-dot">
          ${[18, 30, 42, 54, 66, 78, 90, 102].map(x => `<circle cx="${x}" cy="21" r="1.8"/>`).join('')}
          ${[18, 30, 90, 102].map(x => `<circle cx="${x}" cy="60" r="1.8"/>`).join('')}
        </g>
        <path class="ac-mz-pac" d="M24 60 L33.5 54.5 A11 11 0 1 1 33.5 65.5 Z"/>
        <g class="ac-mz-ghost" transform="translate(96 52)">
          <path d="M-9 10 V0 A9 9 0 0 1 9 0 V10 L6 7 L3 10 L0 7 L-3 10 L-6 7 Z"/>
          <circle class="eye" cx="-3.4" cy="-1" r="2.6"/>
          <circle class="eye" cx="3.4" cy="-1" r="2.6"/>
        </g>
        <g class="ac-mz-token">
          <rect x="40" y="36" width="44" height="18" rx="9"/>
          <text x="62" y="49">goes</text>
        </g>
      </svg>`
  },

  hangman: {
    id: 'hangman',
    slug: 'jogo-da-forca',
    title: 'Jogo da Forca',
    kicker: 'Ortografia',
    dataUrl: `${ACTIVITIES_ROOT}/data/hangman.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} rodadas`,
    visual: `
      <div class="ac-hm" aria-hidden="true">
        <svg class="ac-hm-drawing" viewBox="0 0 120 130">
          <path class="gallows" d="M12 122 H78 M34 122 V10 H88 V26 M34 36 L58 10"/>
          <circle cx="88" cy="40" r="13"/>
          <path d="M88 53 V88 M88 62 L74 78"/>
        </svg>
        <div class="ac-hm-word">
          ${[...'H?NGM?N'].map(ch => `<span class="${ch === '?' ? 'blank' : ''}">${ch === '?' ? '' : ch}</span>`).join('')}
        </div>
      </div>`
  },

  quiz: {
    id: 'quiz',
    slug: 'quiz-de-gramatica',
    title: 'Quiz de Gramática',
    kicker: 'Gramática',
    dataUrl: `${ACTIVITIES_ROOT}/data/quiz.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} tópicos`,
    visual: `
      <div class="ac-qz" aria-hidden="true">
        <div class="ac-qz-question">
          <svg class="ac-qz-timer" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/><circle class="left" cx="18" cy="18" r="15" pathLength="100"/></svg>
          She <span class="ac-qz-gap">is</span> happy.
        </div>
        <div class="ac-qz-options">
          ${[['A', 'am', ''], ['B', 'is', 'ok'], ['C', 'are', ''], ['D', 'be', '']].map(([key, text, st]) =>
            `<span class="${st}"><b>${key}</b>${text}</span>`
          ).join('')}
        </div>
      </div>`
  }
};

// URLs derived from the slug: landing page (levels) and play page
for (const activity of Object.values(ACTIVITIES)) {
  activity.pageUrl  = `${ACTIVITIES_ROOT}/${activity.slug}/`;
  activity.levelUrl = level => `${activity.pageUrl}jogar/?level=${encodeURIComponent(level)}`;
}

/* ─── Helpers ───────────────────────────────────────────────── */

// Deterministic hashing + PRNG, so generated puzzles look the same for everyone
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstSentence(text) {
  return text.match(/^[^.!?]+[.!?]/)?.[0] ?? text;
}

function pageTitle(...parts) {
  return `${parts.join(' · ')} | Hey, Teacher!™`;
}

/* ─── Data Loading ──────────────────────────────────────────── */

async function loadJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    // Replaces only the activity area, so the site nav and footer stay usable
    const target = document.querySelector('[data-activity-root]') || document.body;
    target.innerHTML = `
      <div class="ac-error" role="alert">
        <div class="ac-error-title">Não foi possível carregar a atividade</div>
        <p>Verifique a sua conexão e tente novamente em alguns instantes.</p>
        <div class="ac-error-actions">
          <button type="button" class="btn btn-primary" onclick="location.reload()">Tentar de novo</button>
          <a class="btn btn-ghost" href="${ACTIVITIES_ROOT}/">Ver todas as atividades</a>
        </div>
      </div>`;
    throw err;
  }
}

/* ─── Page transitions ──────────────────────────────────────── */

// Staggered entrance used by menu and level cards
function revealStaggered(el, i, baseDelay = 80) {
  const delay = baseDelay + i * 80;
  el.style.opacity = '0';
  el.style.transform = 'translateY(22px)';
  el.style.transition = `
    opacity   0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms,
    transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms,
    background 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.30s ease
  `;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    // Hand transform back to the stylesheet (hover effects) once revealed
    setTimeout(() => {
      el.style.transform = '';
      el.style.transition = '';
    }, delay + 600);
  }));
}

// Plays the exit animation on a link card before following it.
// Modified clicks (new tab, etc.) keep the browser default.
function attachExitNavigation(link) {
  link.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    link.classList.add('exiting');
    setTimeout(() => { window.location.href = link.href; }, 260);
  });
}

// Pages restored from the back/forward cache would keep the exit state
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    document.querySelectorAll('.exiting').forEach(el => el.classList.remove('exiting'));
  }
});
