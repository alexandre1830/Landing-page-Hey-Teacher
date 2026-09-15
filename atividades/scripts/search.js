/* ══════════════════════════════════════════════════════════════
   ACTIVITY SEARCH (/atividades/) — requires scripts/common.js
   Searches every round of every game (theme, description and content),
   in English or Portuguese, with level and game filters.
   Links like /atividades/?q=rotina&nivel=A1&jogo=crosswords open with
   the search already applied.
══════════════════════════════════════════════════════════════ */

const SEARCH_PAGE_SIZE = 24;

const SEARCH_LEVEL_NAMES = {
  A1: 'Iniciante', A2: 'Básico', B1: 'Intermediário',
  B2: 'Intermediário superior', C1: 'Avançado', C2: 'Proficiente'
};

const clip = (text, max = 70) => (text.length > max ? `${text.slice(0, max - 1).trim()}…` : text);

// How each game's data becomes searchable rounds, in the order they appear on the hub
const SEARCH_GAMES = [
  {
    id: 'crosswords',
    name: 'Palavras cruzadas',
    aliases: 'palavras cruzadas cruzadinha cruzadinhas crossword crosswords vocabulario vocabulary',
    count: p => `${p.words.length} palavras`,
    items: p => p.words.map(w => ({ label: w.answer.toLowerCase(), text: `${w.answer} ${w.clue}` }))
  },
  {
    id: 'wordsearch',
    name: 'Caça-palavras',
    aliases: 'caca palavras cacapalavras word search wordsearch vocabulario vocabulary',
    count: p => `${p.words.length} palavras`,
    items: p => p.words.map(w => ({ label: w.answer.toLowerCase(), text: `${w.answer} ${w.clue || ''}` }))
  },
  {
    id: 'memory',
    name: 'Jogo da memória',
    aliases: 'jogo da memoria memoria memory game vocabulario vocabulary pares definicoes',
    count: p => `${p.words.length} pares`,
    items: p => p.words.map(w => ({ label: w.word, text: `${w.word} ${w.definition}` }))
  },
  {
    id: 'hangman',
    name: 'Jogo da forca',
    aliases: 'jogo da forca forca hangman ortografia spelling vocabulario vocabulary',
    count: p => `${p.words.length} palavras`,
    items: p => p.words.map(w => ({ label: w.answer.toLowerCase(), text: `${w.answer} ${w.clue}` }))
  },
  {
    id: 'quiz',
    name: 'Quiz de gramática',
    aliases: 'quiz de gramatica quiz gramatica grammar',
    count: p => `${p.questions.length} perguntas`,
    items: p => p.questions.map((q) => {
      const main = q.prompt || q.sentence || q.answer || '';
      const extra = [...(q.options || []), ...(q.answers || []), q.fix || ''].join(' ');
      return { label: clip(main.replace(/ \/ /g, ' ').replace(/[[\]]/g, '')), text: `${main} ${extra}` };
    })
  },
  {
    id: 'sentences',
    name: 'Monte a frase',
    aliases: 'monte a frase montar frases frase frases ordem das palavras sentence builder gramatica grammar',
    count: p => `${p.sentences.length} frases`,
    items: p => p.sentences.map(s => ({ label: clip(s.text), text: `${s.text} ${s.pt || ''}` }))
  },
  {
    id: 'reading',
    name: 'Interpretação de texto',
    aliases: 'interpretacao de texto interpretacao compreensao de texto leitura ler textos texto reading comprehension',
    count: p => `${p.questions.length} perguntas`,
    // Each sentence of the text is an item, then each question with its options
    items: p => [
      ...(p.text.join(' ').match(/[^.!?]+[.!?]+[”"’]?/g) || []).map(s => ({ label: clip(s.trim()), text: s })),
      ...p.questions.map(q => ({ label: clip(q.q), text: `${q.q} ${(q.options || []).join(' ')}` }))
    ]
  },
  {
    id: 'conversation',
    name: 'Cartões de conversação',
    aliases: 'cartoes de conversacao cartoes conversacao conversation speaking perguntas fala',
    count: p => `${p.questions.length} perguntas`,
    items: p => p.questions.map(q => ({ label: clip(q.question), text: q.question, id: q.id }))
  }
];

/* ─── Portuguese → English search terms ─────────────────────────
   Keys and terms are written without accents. A term matches the start
   of a word ("famil" finds family and families). Phrases work too.
──────────────────────────────────────────────────────────────── */

const SEARCH_SYNONYMS = [
  // Everyday topics
  ['rotina|rotinas', 'routine|chores'],
  ['cotidiano|dia a dia|diario|diaria', 'everyday|daily|routine'],
  ['tarefas domesticas|tarefas de casa|afazeres', 'chores|housework'],
  ['comida|comidas|alimento|alimentos|alimentacao|refeicao|refeicoes', 'food|meal|breakfast|lunch|dinner|snack|lunchbox'],
  ['cafe da manha', 'breakfast'],
  ['cafe|cafeteria', 'coffee|cafe|breakfast'],
  ['almoco', 'lunch|food|meal'],
  ['jantar|janta', 'dinner|food|meal'],
  ['bebida|bebidas|beber', 'drink'],
  ['fruta|frutas', 'fruit'],
  ['legume|legumes|verdura|verduras|vegetais', 'vegetable'],
  ['cozinha|cozinhar|culinaria|receita|receitas', 'kitchen|cook|recipe'],
  ['restaurante|restaurantes|lanchonete', 'restaurant|cafe|waiter|menu'],
  ['familia|parentes', 'family|parent|relative'],
  ['amigo|amigos|amiga|amigas|amizade', 'friend'],
  ['animal|animais|bicho|bichos|pet|pets|mascote', 'animal|pet|farm'],
  ['fazenda|sitio', 'farm'],
  ['casa|casas|lar|moradia|apartamento', 'home|house|housing|apartment'],
  ['roupa|roupas|vestuario|moda|acessorios', 'clothes|clothing|dress|fashion|accessor'],
  ['cor|cores', 'color|colour'],
  ['forma|formas|formato', 'shape'],
  ['clima|tempo|previsao do tempo|meteorologia', 'weather|climate|forecast|season'],
  ['estacao|estacoes|estacoes do ano', 'season'],
  ['chuva', 'rain|weather'],
  ['frio', 'cold|weather|winter'],
  ['calor|quente', 'hot|heat|weather|summer'],
  ['viagem|viagens|viajar|turismo|turista|ferias|passeio', 'travel|trip|holiday|tourist|vacation|airport'],
  ['aeroporto|voo|aviao', 'airport|flight|plane'],
  ['transporte|transportes|onibus|carro|trem|metro', 'transport|bus|car|train|road'],
  ['transito|estrada', 'road|traffic'],
  ['compras|comprar|loja|lojas|mercado|supermercado', 'shopping|shop|buy|store|market'],
  ['dinheiro|financas|financeiro|banco|bancos|gastos|economizar', 'money|bank|financ|spend|saving|budget'],
  ['economia', 'econom'],
  ['trabalho|trabalhar|emprego|empregos|profissao|profissoes|carreira|carreiras', 'work|job|career|office|profession'],
  ['escritorio', 'office'],
  ['negocio|negocios|empresa|empresas|empresarial', 'business|company|workplace'],
  ['lideranca|chefe|gestao', 'leadership|manager|boss'],
  ['cidade|cidades|urbano|urbana|bairro', 'town|city|urban'],
  ['lugar|lugares', 'place|town'],
  ['saude|medico|medicos|medicina|doenca|doencas|hospital', 'health|doctor|medic|illness|hospital|wellbeing'],
  ['bem estar', 'wellbeing|lifestyle'],
  ['estilo de vida', 'lifestyle'],
  ['corpo|rosto|partes do corpo', 'body|face'],
  ['lazer|hobby|hobbies|passatempo|passatempos|tempo livre|diversao', 'hobbies|free time|leisure|going out|entertainment'],
  ['esporte|esportes|futebol|academia|exercicio fisico', 'sport|fitness|competition|football'],
  ['competicao|competicoes', 'competition'],
  ['musica|musicas|cancao|cancoes', 'music|song'],
  ['filme|filmes|cinema|serie|series|televisao|tv', 'movie|film|cinema|series|tv|entertainment'],
  ['entretenimento', 'entertainment'],
  ['midia|midias|imprensa|noticia|noticias|jornal|jornalismo', 'media|news|press|journalis'],
  ['propaganda|publicidade|marketing|marcas|marca', 'advertis|marketing|brand'],
  ['redes sociais|rede social', 'social media'],
  ['meio ambiente|ambiente|ecologia|sustentabilidade|reciclagem|verde', 'environment|green|climate|sustainab|recycl'],
  ['natureza|paisagem|paisagens', 'nature|landscape'],
  ['desastre|desastres|desastres naturais', 'disaster'],
  ['espaco|universo|planeta', 'space|universe|planet'],
  ['tecnologia|tecnologias|internet|computador|celular|aparelhos|digital', 'technology|internet|online|gadget|computer|phone|digital'],
  ['inovacao', 'innovation'],
  ['sentimento|sentimentos|emocao|emocoes', 'feeling|emotion|mood'],
  ['personalidade|carater|temperamento|comportamento', 'personality|character|temperament|behavio'],
  ['educacao|escola|escolas|estudo|estudos|estudar|aula|aulas|aprendizado|aprender', 'education|school|learn|class|student|study'],
  ['habilidades|competencias', 'skills'],
  ['academico|academica|universidade|faculdade', 'academic|research|university'],
  ['ciencia|ciencias|cientifico|pesquisa|laboratorio', 'science|scientific|research|lab'],
  ['crime|crimes|lei|leis|justica|direito|tribunal|policia', 'crime|law|justice|court|legal|police'],
  ['politica|politicas|governo|eleicao|eleicoes|poder', 'politic|govern|election|power'],
  ['sociedade|social|sociais|problemas sociais', 'society|social'],
  ['relacionamento|relacionamentos|relacoes|namoro', 'relationship'],
  ['comunicacao|conversa|falar', 'communication|speak|talk'],
  ['psicologia|mente|mental', 'psycholog|mind|mental'],
  ['arte|artes|cultura|cultural|estetica', 'art|culture|aesthetic'],
  ['literatura|livro|livros|literario', 'literar|book|reading|story|stories'],
  ['filosofia|etica|valores', 'philosoph|ethic|values'],
  ['argumento|argumentacao|debate|retorica|discurso', 'argument|rhetoric|debate|discourse'],
  ['verdade|mentira|mentiras|enganacao', 'truth|decept|lie'],
  ['idioma|idiomas|lingua|linguas|linguagem|linguistica', 'language|linguist'],
  ['festa|festas|comemoracao|comemoracoes|celebracao|feriado|feriados', 'party|parties|celebrat|holiday'],
  ['pais|paises|nacionalidade|nacionalidades', 'countr|nationalit'],
  ['mundo|global|globalizacao', 'world|global'],
  ['identidade', 'identity'],
  ['numero|numeros|dias da semana|datas', 'number|days|date'],
  ['objeto|objetos|coisas', 'object|thing'],
  ['pessoas|descrever pessoas|aparencia', 'people|describing|appearance'],
  ['apresentacao|apresentacoes|se apresentar|conhecer pessoas|cumprimentos', 'meeting|introduc|greeting'],
  ['gostos|preferencias|gostar', 'likes|dislikes|preference'],
  ['planos|planejamento', 'plans|future'],
  ['fim de semana', 'weekend'],
  ['experiencia|experiencias', 'experience'],
  ['habito|habitos|costume|costumes', 'habit|used to'],
  ['desejo|desejos|arrependimento|arrependimentos', 'wish|regret'],
  ['regra|regras|conselho|conselhos|obrigacao', 'rule|advice|must|should'],
  ['pedido|pedidos|oferta|ofertas|educado|educada', 'request|offer|polite'],
  ['aniversario|aniversarios|convite|convites', 'birthday|invit'],
  ['cachorro|cachorros|cao|caes', 'dog'],
  ['voluntariado|voluntario|voluntarios', 'volunteer'],
  ['bicicleta|bicicletas|bike|ciclismo', 'bike|cycl'],
  ['sono|dormir|insonia', 'sleep'],
  ['solidao|isolamento|sozinho', 'loneliness|lonely|isolat'],
  ['felicidade|feliz', 'happiness|happy|wellbeing'],
  ['tedio|entediado', 'boredom|bored'],
  ['procrastinacao|procrastinar', 'procrastinat'],
  ['foco|concentracao|atencao|multitarefa', 'focus|concentrat|attention|multitask'],
  ['privacidade|dados pessoais', 'privacy|personal data'],
  ['algoritmo|algoritmos|inteligencia artificial', 'algorithm|machine learning'],
  ['traducao|traduzir|tradutor', 'translat'],
  ['museu|museus', 'museum'],
  ['historia|historias', 'history|histor|story|stories'],
  ['escolha|escolhas|decisao|decisoes', 'choice|decision'],
  ['avaliacao|resenha|critica', 'review'],
  ['email|e mail|carta|cartas', 'email|letter'],
  ['avo|avos', 'grandm|grandp|grandparent'],
  ['festival|festivais|show|shows', 'festival|concert'],
  ['panqueca|panquecas', 'pancake'],
  ['vaga|vagas|anuncio de emprego|entrevista de emprego', 'job|interview|candidate'],
  ['lista de compras', 'shopping|supermarket'],
  ['morar fora|exterior|intercambio|imigracao|imigrante|imigrantes', 'abroad|immigra|migra'],
  ['golpe|golpes|fraude|fraudes', 'scam|fraud'],
  ['plastico|plasticos', 'plastic'],
  ['dever de casa|licao de casa', 'homework'],
  ['aplicativo|aplicativos|app|apps', 'app'],
  ['vinil|disco|discos', 'vinyl|record'],
  ['noticias falsas|fake news|desinformacao|boato|boatos', 'fake news|misinformation|false news'],
  ['zoologico|zoologicos', 'zoo'],
  ['gamificacao|games|videogame|videogames', 'gamif|game'],
  ['carne', 'meat'],
  ['extincao|linguas em extincao', 'endanger|extinct'],
  ['genetica|genes|dna|edicao genetica', 'gene|genetic|dna|crispr'],
  ['barulho|ruido|poluicao sonora', 'noise'],
  ['silencio', 'silence|quiet'],
  ['olimpiadas|copa do mundo|nacionalismo', 'olympic|world cup|nation'],
  ['confianca|especialista|especialistas|cientista|cientistas', 'trust|expert|scientist'],

  // Skills and grammar
  ['gramatica', 'grammar'],
  ['vocabulario', 'vocabulary'],
  ['ortografia|soletrar', 'spelling'],
  ['conversacao|speaking|oral', 'conversation|speaking'],
  ['verbo to be|verbo ser|ser e estar', 'to be'],
  ['presente simples', 'simple present|present simple'],
  ['presente continuo|presente progressivo', 'present continuous|right now'],
  ['passado simples', 'simple past|past simple'],
  ['passado continuo|passado progressivo', 'past continuous'],
  ['passado', 'past|last weekend'],
  ['presente perfeito', 'present perfect'],
  ['passado perfeito|mais que perfeito', 'past perfect'],
  ['futuro', 'future|will|going to'],
  ['futuro perfeito', 'future perfect'],
  ['condicional|condicionais|oracoes condicionais', 'conditional|if clause'],
  ['voz passiva|passiva', 'passive'],
  ['discurso indireto|fala indireta|discurso direto', 'reported speech'],
  ['perguntas indiretas|pergunta indireta', 'indirect question|polite question'],
  ['pergunta|perguntas|interrogativas', 'question'],
  ['oracoes relativas|oracao relativa|pronomes relativos', 'relative clause'],
  ['gerundio|infinitivo', 'gerund|infinitive|verb patterns'],
  ['modal|modais|verbos modais', 'modal|must|should|can'],
  ['deducao', 'deduction|must have'],
  ['inversao', 'inversion'],
  ['subjuntivo', 'subjunctive'],
  ['enfase', 'emphasis|emphatic|fronting|cleft'],
  ['formalidade|linguagem formal', 'formal|register'],
  ['conectivos|conectores|conjuncoes|ligar ideias', 'link|conjunction'],
  ['preposicao|preposicoes', 'preposition|in on at'],
  ['artigo|artigos', 'article'],
  ['plural|plurais', 'plural'],
  ['pronome|pronomes|possessivos', 'pronoun|possessive'],
  ['adjetivo|adjetivos', 'adjective'],
  ['adverbio|adverbios', 'adverb'],
  ['comparativo|comparativos|comparacao|superlativo|superlativos', 'compar|superlative'],
  ['quantificadores|contaveis|incontaveis', 'some any|much|many|countable'],
  ['expressoes idiomaticas|expressoes|expressao|girias|idiomatico', 'idiom|expression'],
  ['verbos frasais', 'phrasal verb'],
  ['verbos irregulares', 'irregular|simple past'],
  ['verbo|verbos', 'verb'],
  ['palavras emprestadas|estrangeirismos', 'borrowed words'],
  ['figuras de linguagem', 'literary devices'],
  ['frequencia|adverbios de frequencia', 'frequency'],
  ['tempos verbais', 'tense']
];

// Common Portuguese words that shouldn't narrow the search
const SEARCH_STOPWORDS = new Set('de da do das dos e em no na nos nas o os as um uma uns umas com para por sobre jogo jogos atividade atividades ingles'.split(' '));

// "Café, Rotina!" -> "cafe rotina"
function searchNormalize(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SYNONYM_ENTRIES = SEARCH_SYNONYMS.flatMap(([keys, terms]) =>
  keys.split('|').map(key => [key, terms.split('|')]));

const PHRASE_KEYS = SYNONYM_ENTRIES
  .map(([key]) => key)
  .filter(key => key.includes(' '))
  .sort((a, b) => b.length - a.length);

// Each group is a set of alternative terms; every group must match (AND)
function parseSearch(raw) {
  let rest = ` ${searchNormalize(raw)} `;
  const groups = [];

  for (const phrase of PHRASE_KEYS) {
    if (rest.includes(` ${phrase} `)) {
      groups.push(expandTerm(phrase));
      rest = rest.replace(` ${phrase} `, ' ');
    }
  }

  rest.split(' ')
    .filter(term => term.length >= 2 && !SEARCH_STOPWORDS.has(term))
    .forEach(term => groups.push(expandTerm(term)));

  return groups;
}

// A term also matches Portuguese keys it starts (while typing: "rot" -> rotina)
// or that start it (plurals and endings: "rotinas" -> rotina)
function expandTerm(term) {
  const terms = new Set([term]);
  for (const [key, english] of SYNONYM_ENTRIES) {
    const typing = term.length >= 3 && key.startsWith(term);
    const ending = key.length >= 4 && !key.includes(' ') && term.startsWith(key);
    if (key === term || typing || ending) english.forEach(t => terms.add(t));
  }
  return [...terms];
}

const hasWordStart = (text, term) => text.includes(` ${term}`);

/* ─── Index ─────────────────────────────────────────────────── */

function buildSearchIndex(dataByGame) {
  const rounds = [];

  SEARCH_GAMES.forEach((game, gameOrder) => {
    const data = dataByGame[game.id];
    const activity = ACTIVITIES[game.id];
    if (!data || !activity) return;

    LEVEL_ORDER.forEach((level) => {
      const ld = data.levels[level];
      if (!ld) return;
      const meta = ` ${searchNormalize(`${game.aliases} ${game.name} ${level} ${SEARCH_LEVEL_NAMES[level]} ${ld.name}`)} `;

      // Conversation cards have no themes: group the questions by topic
      const puzzles = game.id === 'conversation'
        ? Object.values(ld.questions.reduce((groups, q) => {
          const topic = q.topic.replace(/_/g, ' ');
          (groups[topic] = groups[topic] || { id: q.topic, theme: topic.charAt(0).toUpperCase() + topic.slice(1), description: 'Conversation questions about this topic.', questions: [] }).questions.push(q);
          return groups;
        }, {}))
        : ld.puzzles;

      puzzles.forEach((puzzle, index) => {
        const items = game.items(puzzle).map(item => ({ ...item, norm: ` ${searchNormalize(item.text)} ` }));
        rounds.push({
          game, gameOrder, level, index, puzzle, items, meta,
          title: ` ${searchNormalize(puzzle.theme)} `,
          desc: ` ${searchNormalize(puzzle.description || '')} `,
          content: items.map(i => i.norm).join(' '),
          baseUrl: activity.levelUrl(level)
        });
      });
    });
  });

  return rounds;
}

const itemHasGroup = (item, group) => group.some(term => hasWordStart(item.norm, term));

// null when some group doesn't match. "strong" means every group matched the theme,
// the description or the game/level names, not only the words inside the round.
function scoreRound(round, groups) {
  let score = 0;
  const contentOnly = [];
  for (const group of groups) {
    let best = 0;
    for (const term of group) {
      if (hasWordStart(round.title, term)) { best = 10; break; }
      if (hasWordStart(round.desc, term)) best = Math.max(best, 6);
      else if (hasWordStart(round.meta, term)) best = Math.max(best, 4);
      else if (best < 2 && hasWordStart(round.content, term)) best = 2;
    }
    if (!best) return null;
    if (best === 2) contentOnly.push(group);
    score += best;
  }

  // "present perfect" inside the content must be in the same word, clue or sentence
  if (contentOnly.length > 1 && !round.items.some(item => contentOnly.every(group => itemHasGroup(item, group)))) {
    return null;
  }
  return { score, strong: !contentOnly.length };
}

/* ─── UI ────────────────────────────────────────────────────── */

function initActivitySearch(root) {
  const input      = root.querySelector('#ac-search-input');
  const clearBtn   = root.querySelector('#ac-search-clear');
  const levelGroup = root.querySelector('#ac-level-filter');
  const gameSelect = root.querySelector('#ac-game-filter');
  const suggestions = root.querySelector('#ac-search-suggestions');
  const resultsEl  = document.getElementById('ac-results');
  const summaryEl  = document.getElementById('ac-results-summary');
  const listEl     = document.getElementById('ac-results-list');
  const moreBtn    = document.getElementById('ac-results-more');
  const catalogEl  = document.getElementById('activities-grid');

  let rounds = null;
  let loading = null;
  let level = '';
  let shown = SEARCH_PAGE_SIZE;
  let lastResults = [];
  let debounceTimer = null;
  let trackTimer = null;
  let lastTracked = '';

  SEARCH_GAMES.forEach((game) => {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name;
    gameSelect.appendChild(option);
  });

  // Game data is only downloaded when someone starts searching
  function ensureIndex() {
    if (rounds) return Promise.resolve(rounds);
    if (!loading) {
      loading = Promise.all(SEARCH_GAMES.map(game =>
        fetch(ACTIVITIES[game.id].dataUrl)
          .then(res => (res.ok ? res.json() : null))
          .catch(() => null)
          .then(data => [game.id, data])
      )).then((entries) => {
        rounds = buildSearchIndex(Object.fromEntries(entries));
        return rounds;
      });
    }
    return loading;
  }

  const isActive = () => !!(input.value.trim() || level || gameSelect.value);

  function setLevel(value) {
    level = value;
    levelGroup.querySelectorAll('[data-level]').forEach((btn) => {
      const on = btn.dataset.level === value;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function matchSnippets(round, groups) {
    const labels = [];
    for (const item of round.items) {
      const hit = groups.some(group => group.some(term => hasWordStart(item.norm, term)));
      if (hit && !labels.includes(item.label)) labels.push(item.label);
      if (labels.length === 3) break;
    }
    return labels;
  }

  function resultUrl(round, groups) {
    if (round.game.id !== 'conversation') {
      return `${round.baseUrl}&puzzle=${encodeURIComponent(round.puzzle.id)}`;
    }
    const hit = groups.length
      ? round.items.find(item => groups.some(group => group.some(term => hasWordStart(item.norm, term))))
      : null;
    return `${round.baseUrl}&card=${encodeURIComponent((hit || round.items[0]).id)}`;
  }

  function renderResults(groups) {
    const query = input.value.trim();
    const hasStrong = lastResults.some(r => r.strong);
    listEl.innerHTML = lastResults.slice(0, shown).map(({ round, score, strong }, i) => {
      const themeHit = groups.some(group => group.some(term => hasWordStart(round.title, term) || hasWordStart(round.desc, term)));
      const snippets = groups.length && !themeHit ? matchSnippets(round, groups) : [];
      // Content-only matches come after the theme matches, under their own label
      const heading = !strong && (i === 0 || lastResults[i - 1].strong)
        ? `<p class="ac-results-group">${hasStrong ? 'A busca também aparece dentro destas rodadas' : 'A busca aparece dentro destas rodadas'}</p>`
        : '';
      return `${heading}
        <a class="ac-result" href="${resultUrl(round, groups)}" data-score="${score}">
          <span class="ac-result-top">
            <span class="ac-result-game">${escapeHTML(round.game.name)}</span>
            <span class="ac-result-level" title="${SEARCH_LEVEL_NAMES[round.level]}">${round.level}</span>
          </span>
          <span class="ac-result-title" lang="en">${escapeHTML(round.puzzle.theme)}</span>
          <span class="ac-result-desc" lang="en">${escapeHTML(round.puzzle.description || '')}</span>
          ${snippets.length ? `<span class="ac-result-match">Contém: <span lang="en">${snippets.map(s => `<b>${escapeHTML(s)}</b>`).join(', ')}</span></span>` : ''}
          <span class="ac-result-foot">
            <span>${round.game.count(round.puzzle)}</span>
            <span class="ac-result-open">Jogar <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
          </span>
        </a>`;
    }).join('');

    const remaining = lastResults.length - shown;
    moreBtn.hidden = remaining <= 0;
    moreBtn.textContent = `Mostrar mais ${Math.min(remaining, SEARCH_PAGE_SIZE)} de ${remaining}`;

    if (!lastResults.length) {
      listEl.innerHTML = `
        <div class="ac-results-empty">
          <p><strong>Nenhuma atividade encontrada${query ? ` para “${escapeHTML(query)}”` : ''}.</strong></p>
          <p>Tente outro tema, em português ou em inglês (por exemplo: viagem, comida, trabalho ou present perfect), ou remova os filtros.</p>
          <button type="button" class="btn btn-ghost" data-clear-search>Limpar busca</button>
        </div>`;
    }
  }

  function summaryText() {
    const query = input.value.trim();
    const count = lastResults.length;
    const strong = lastResults.filter(r => r.strong).length;
    const parts = [`<strong>${count}</strong> ${count === 1 ? 'rodada encontrada' : 'rodadas encontradas'}`];
    if (query) parts.push(`para “${escapeHTML(query)}”`);
    if (level) parts.push(`no nível ${level}`);
    if (gameSelect.value) parts.push(`em ${escapeHTML(SEARCH_GAMES.find(g => g.id === gameSelect.value).name)}`);
    if (strong && strong < count) parts.push(`(${strong} pelo tema, ${count - strong} pelo conteúdo)`);
    return parts.join(' ');
  }

  async function update({ resetPage = true } = {}) {
    clearBtn.hidden = !input.value;

    if (!isActive()) {
      resultsEl.hidden = true;
      catalogEl.hidden = false;
      suggestions.hidden = false;
      levelGroup.querySelectorAll('.ac-chip-count').forEach(el => { el.textContent = ''; });
      return;
    }

    resultsEl.hidden = false;
    catalogEl.hidden = true;
    suggestions.hidden = true;
    if (!rounds) {
      summaryEl.textContent = 'Carregando as atividades…';
      listEl.innerHTML = '';
      moreBtn.hidden = true;
    }

    await ensureIndex();
    if (!isActive()) return;   // cleared while the data was loading

    const groups = parseSearch(input.value);
    const game = gameSelect.value;

    // Score once without the level filter, so each level chip can show its count
    const matches = [];
    for (const round of rounds) {
      if (game && round.game.id !== game) continue;
      const result = groups.length ? scoreRound(round, groups) : { score: 1, strong: true };
      if (result) matches.push({ round, ...result });
    }

    const perLevel = Object.fromEntries(LEVEL_ORDER.map(l => [l, 0]));
    matches.forEach(({ round }) => { perLevel[round.level]++; });
    levelGroup.querySelectorAll('[data-level]').forEach((btn) => {
      const count = btn.dataset.level ? perLevel[btn.dataset.level] : matches.length;
      btn.querySelector('.ac-chip-count').textContent = count;
      btn.classList.toggle('is-empty', !count);
    });

    lastResults = matches
      .filter(({ round }) => !level || round.level === level)
      .sort((a, b) => b.strong - a.strong
        || b.score - a.score
        || LEVEL_ORDER.indexOf(a.round.level) - LEVEL_ORDER.indexOf(b.round.level)
        || a.round.gameOrder - b.round.gameOrder
        || a.round.index - b.round.index);

    if (resetPage) shown = SEARCH_PAGE_SIZE;
    summaryEl.innerHTML = summaryText();
    renderResults(groups);
    trackSearch();
  }

  // What people look for is useful to plan new content (Google Analytics "search" event)
  function trackSearch() {
    clearTimeout(trackTimer);
    const term = input.value.trim().toLowerCase().slice(0, 60);
    if (term.length < 3 || term === lastTracked || typeof gtag !== 'function') return;
    trackTimer = setTimeout(() => {
      lastTracked = term;
      gtag('event', 'search', { search_term: term, results: lastResults.length });
    }, 1500);
  }

  function clearSearch() {
    input.value = '';
    gameSelect.value = '';
    setLevel('');
    update();
    input.focus();
  }

  /* ─── Events ─────────────────────────────────────────────── */
  input.addEventListener('focus', () => { ensureIndex(); }, { once: true });

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    clearBtn.hidden = !input.value;
    debounceTimer = setTimeout(update, 140);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      input.value = '';
      update();
    }
  });

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(debounceTimer);
    update();
    if (window.matchMedia('(max-width: 720px)').matches) input.blur();   // hides the phone keyboard
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    update();
    input.focus();
  });

  levelGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-level]');
    if (!btn) return;
    setLevel(btn.dataset.level === level ? '' : btn.dataset.level);
    update();
  });

  gameSelect.addEventListener('change', () => update());

  suggestions.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-suggest]');
    if (!btn) return;
    input.value = btn.dataset.suggest;
    update();
  });

  moreBtn.addEventListener('click', () => {
    shown += SEARCH_PAGE_SIZE;
    update({ resetPage: false });
  });

  resultsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear-search]')) clearSearch();
  });

  /* ─── Search from the URL ────────────────────────────────── */
  const params = new URLSearchParams(window.location.search);
  const urlLevel = (params.get('nivel') || '').toUpperCase();
  const urlGame = params.get('jogo') || '';
  input.value = params.get('q') || '';
  if (LEVEL_ORDER.includes(urlLevel)) setLevel(urlLevel);
  if (SEARCH_GAMES.some(g => g.id === urlGame)) gameSelect.value = urlGame;
  if (isActive()) update();
}

(() => {
  const root = document.getElementById('ac-search');
  if (root) initActivitySearch(root);
})();
