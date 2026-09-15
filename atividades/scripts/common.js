const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const ACTIVITIES_ROOT = '/atividades';

// Asset version: bump it (together with the ?v= in the /atividades/ pages) whenever a
// deploy changes game scripts, styles or data, so browsers never mix cached old files.
const ASSETS_VERSION = '20260915-2';

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
    totalMeta: data => {
      const total = LEVEL_ORDER.reduce((sum, l) => sum + data.levels[l].questions.length, 0);
      return `${LEVEL_ORDER.length} níveis · ${total} perguntas`;
    },
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
    totalMeta: data => {
      const total = LEVEL_ORDER.reduce((sum, l) => sum + data.levels[l].puzzles.length, 0);
      return `${LEVEL_ORDER.length} níveis · ${total} cruzadas`;
    },
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
    totalMeta: data => {
      const total = LEVEL_ORDER.reduce((sum, l) => sum + data.levels[l].puzzles.length, 0);
      return `${LEVEL_ORDER.length} níveis · ${total} grades`;
    },
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
    totalMeta: data => {
      const total = LEVEL_ORDER.reduce((sum, l) => sum + data.levels[l].puzzles.length, 0);
      return `${LEVEL_ORDER.length} níveis · ${total} rodadas`;
    },
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
    totalMeta: data => {
      const total = LEVEL_ORDER.reduce((sum, l) => sum + data.levels[l].puzzles.reduce((s, p) => s + p.sentences.length, 0), 0);
      return `${LEVEL_ORDER.length} níveis · ${total} frases`;
    },
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
    totalMeta: data => {
      const total = LEVEL_ORDER.reduce((sum, l) => sum + data.levels[l].puzzles.length, 0);
      return `${LEVEL_ORDER.length} níveis · ${total} textos`;
    },
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

  hangman: {
    id: 'hangman',
    slug: 'jogo-da-forca',
    title: 'Jogo da Forca',
    kicker: 'Ortografia',
    dataUrl: `${ACTIVITIES_ROOT}/data/hangman.json?v=${ASSETS_VERSION}`,
    levelMeta: ld => `${ld.puzzles.length} rodadas`,
    totalMeta: data => {
      const total = LEVEL_ORDER.reduce((sum, l) => sum + data.levels[l].puzzles.length, 0);
      return `${LEVEL_ORDER.length} níveis · ${total} rodadas`;
    },
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
    totalMeta: data => {
      const total = LEVEL_ORDER.reduce((sum, l) => sum + data.levels[l].puzzles.length, 0);
      return `${LEVEL_ORDER.length} níveis · ${total} tópicos`;
    },
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
