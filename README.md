# Hey, Teacher!™ — Site institucional

Site institucional da **Hey, Teacher!™**, escola particular de inglês online focada no mercado brasileiro. Estrutura híbrida: home funciona como landing page de alta conversão, e páginas internas aprofundam metodologia, planos, certificação e sobre o professor.

Stack: **HTML + CSS + JavaScript vanilla**. Zero dependências, zero build step, hospedado no GitHub Pages com domínio próprio (`heyteacher.com.br`).

## Estrutura de pastas

```
/
├── index.html                    Home (landing page principal)
├── sobre/index.html              Professor + filosofia + história da marca
├── metodologia/index.html        7 pilares aprofundados + timeline da aula
├── planos/index.html             3 planos + comparativo + duplas + FAQ de preço
├── certificacao/index.html       CEFR explicado + amostra do certificado
├── contato/index.html            WhatsApp + outros canais
├── politica-de-privacidade/      LGPD (modelo, pendente de revisão jurídica)
├── termos-de-uso/                Termos básicos (modelo, idem)
├── atividades/                   Jogos de inglês grátis (importados do projeto Activity Center)
│   ├── index.html                Hub com as atividades + busca por tema/conteúdo e filtros de nível e jogo (scripts/search.js)
│   ├── <slug>/index.html         Página de SEO da atividade + seleção de nível (A1–C2)
│   ├── <slug>/jogar/index.html   Tela do jogo (?level=A1&puzzle=<id>; com &embed=1, modo embed do portal), noindex
│   ├── data/*.json               Conteúdo dos jogos por nível CEFR (memory.json, sentences.json, reading.json, cloze.json e maze.json são exclusivos do site)
│   ├── scripts/                  common.js (registro das atividades e URLs), menu.js, puzzles.js + um script por jogo
│   └── styles/                   atividades.css (base, tema claro) + puzzles.css + uma folha por jogo
│                                 Ao alterar scripts, estilos ou dados dos jogos, troque ASSETS_VERSION (common.js)
│                                 e o ?v= das páginas de /atividades/, para o navegador não usar arquivos antigos em cache
│                                 (última troca: 20261024-1, com o modo embed do portal do aluno)
├── 404.html                      Página de erro on-brand
├── styles/styles.css             Folha única para todo o site
├── scripts/
│   ├── main.js                   Reveal, FAQ, smooth scroll, nav shadow, ano dinâmico
│   └── includes.js               Carrega partials de nav/footer via fetch
├── partials/
│   ├── nav.html                  Markup do nav + announcement bar
│   └── footer.html               Markup do footer + floating WhatsApp
├── images/                       Logos, foto do professor, certificado
├── sitemap.xml
├── robots.txt
└── CNAME                         heyteacher.com.br
```

## Como rodar localmente

O site usa `fetch` para carregar os partials de nav/footer. Por isso **não funciona abrindo o arquivo via `file://`** — é obrigatório servir via HTTP local.

A partir da raiz do repositório:

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000/` no navegador. Qualquer servidor estático equivalente funciona (`npx serve`, `php -S localhost:8000`, etc.).

## Como funciona o sistema de includes

Cada página HTML tem dois placeholders e dois scripts:

```html
<div data-include="nav"></div>
<!-- conteúdo -->
<div data-include="footer"></div>

<script src="/scripts/includes.js" defer></script>
<script src="/scripts/main.js" defer></script>
```

- `includes.js` busca `/partials/nav.html` e `/partials/footer.html`, substitui os `<div data-include>` pelo HTML retornado, marca o link da página atual com `.active` e dispara `CustomEvent('partials:loaded')`.
- `main.js` faz scroll-reveal, FAQ accordion e smooth-scroll imediatamente (não dependem do nav/footer). Os trechos que tocam no nav (sombra ao rolar) e no footer (ano dinâmico) ficam num handler do evento `partials:loaded`.
- Como o Googlebot moderno executa JavaScript, esse padrão preserva SEO razoável para uma operação solo. Não substitui SSR/SSG, mas é a relação custo-benefício correta para este projeto.

## Modo embed (portal do aluno)

O Portal do Aluno (`portal.heyteacher.com.br`) mostra os jogos dentro de um `<iframe>`. Para isso, as 10 páginas `atividades/<slug>/jogar/index.html` têm um modo limpo, ativado por `embed=1` na URL — por exemplo `https://heyteacher.com.br/atividades/caca-palavras/jogar/?level=B1&embed=1`. O portal guarda esse endereço em cada recurso de jogo da biblioteca e é a página-mãe.

Com `?embed=1`:

- **Sem Google Analytics**: o `gtag.js` nem é baixado (nenhum pedido a `googletagmanager.com`). Isso depende só de `embed=1` na URL, seja quem for a página-mãe.
- O `<head>` marca `<html class="ht-embed">` antes de qualquer pintura, mas só quando a página está no topo da janela ou a página-mãe é o portal (`https://portal.heyteacher.com.br`) ou `localhost`/`127.0.0.1` (desenvolvimento do portal). Num iframe de outro site, `?embed=1` só desliga o GA: nav, rodapé, WhatsApp e CTA continuam. O resto do modo depende dessa classe.
- `scripts/includes.js` não busca nav nem rodapé (que traz o WhatsApp flutuante). Por garantia, `atividades/styles/atividades.css` esconde nav, overlay, rodapé, WhatsApp e a faixa de CTA (`.ac-cta-band`, "Agendar aula gratuita"): o `includes.js` é carregado sem `?v=` e uma versão antiga em cache ainda injetaria nav e rodapé. Não reduza essa lista de seletores.
- O botão "Levels" do topo (que sairia do jogo para a página de nível) fica invisível. O botão de voltar da tela de um tema ("Themes", "Texts", "Rounds") continua, porque `puzzles.js` lhe dá a classe `ht-in-game`.
- A navegação dentro do jogo mantém `embed=1`. Qualquer outro link abre em nova aba (rede de segurança no fim de `common.js`), e a tela de erro de carregamento não mostra "Ver todas as atividades".
- A tela do jogo ocupa a altura do iframe (`--nav-h: 0px`; mínimo de 480 px a partir de 901 px de largura do iframe, porque no portal o iframe tem no máximo ~990 px; o jogo da memória e os Cartões só a partir de 1101 px). Até 900 px o jogo mantém a altura natural e rola dentro do iframe.
- Progresso no `localStorage`, gravação e PDF dos Cartões funcionam como no site.

**Sem `embed=1` nada muda**: o GA carrega com o mesmo id, nav, rodapé, WhatsApp e CTA aparecem, as URLs não ganham parâmetro e o `<html>` não recebe classe nova. Páginas fora de `atividades/<slug>/jogar/` não têm a guarda e ignoram `?embed=1`.

**Guarda do GA**: nas páginas `jogar/`, o snippet padrão do Google foi trocado por um único `<script>` logo depois de `<meta charset="UTF-8">` (que passa a ser a primeira linha do `<head>`). Ele confere `embed=1` em `location.search`: se tiver, não carrega o GA (sempre) e só marca `ht-embed` se a página-mãe for permitida; se não, cria o `dataLayer`, chama `gtag('js')` e `gtag('config', 'G-JXD2KCQXS0')` e injeta o `gtag.js` com `async`. As demais páginas do site continuam com o snippet padrão.

**Guarda da página-mãe** (no mesmo `<script>`, dentro do ramo `embed=1`, antes do `return`): o GitHub Pages não envia `frame-ancestors` nem `X-Frame-Options`, então qualquer site poderia pôr o jogo num iframe. Para o modo limpo ficar só com o portal, `ht-embed` é marcado quando `window.self === window.top`, ou quando a origem em `location.ancestorOrigins` (a do topo ou a da mãe direta) casa com `https://portal.heyteacher.com.br` ou `http://localhost`/`http://127.0.0.1` (com porta). Sem `ancestorOrigins` (Firefox), vale a origem de `document.referrer`: a do portal/localhost ou a do próprio site (navegação dentro do jogo, que já estava em modo embed). O portal manda o referrer com `strict-origin-when-cross-origin`; não troque por `no-referrer`. Se a checagem falhar, o GA continua desligado (nunca há hit por falha da checagem) e a página aparece com nav e rodapé; sem `ht-embed`, `levelUrl`/`puzzleUrl` e a rede de segurança de `common.js` não acrescentam `embed=1`.

**Regra para scripts de jogo**: toda URL interna de jogo sai de `activity.levelUrl(level)` ou `puzzleUrl(activity, level, puzzleId)` (`common.js`/`puzzles.js`), que acrescentam `&embed=1` no modo embed. Nunca monte `/jogar/?level=…` à mão. A constante `EMBED` de `common.js` diz se a página está no modo embed.

**Checklist ao criar um jogo novo** (além do registro em `common.js`):

1. Copiar o `<head>` de uma página `jogar/` existente, com `<meta charset>` primeiro e o `<script>` de guarda logo depois, inteiro: guarda do GA e guarda da página-mãe (nunca o snippet padrão do Google). As 10 páginas têm esse bloco idêntico; mudou em uma, mude em todas.
2. Botão de voltar com a classe `back-btn`; links internos só por `levelUrl`/`puzzleUrl`.
3. Testar localmente com `?level=A1&embed=1` (aberto direto na aba ou num iframe do portal rodando em localhost): sem nav, rodapé, WhatsApp e CTA, nenhum pedido a `googletagmanager.com` na aba Rede, navegação mantendo `embed=1`.
4. Avisar o portal (repositório `portal-hey-teacher`): o jogo só entra na biblioteca depois de cadastrado em `tools/library-games.json` e em `GAMES` (`site/js/resource-content.js`). A importação da biblioteca falha enquanto o registro do site e esse catálogo forem diferentes.

Publique o site (push) antes de publicar recursos de jogo no portal e espere uns 10 minutos: o GitHub Pages guarda cache por esse tempo.

## Como fazer deploy

Push para a branch `main` no GitHub:

```bash
git add .
git commit -m "..."
git push origin main
```

O GitHub Pages publica automaticamente no `heyteacher.com.br` (CNAME já configurado).

## Convenções

- **Caminhos absolutos**: todos os assets, scripts e includes usam paths absolutos a partir da raiz (`/styles/styles.css`, `/images/...`). Caminhos relativos com `../` quebram em subpastas — não usar.
- **Paleta**: navy `#032d6f`, red `#a60404`, navy-light `#8095b6`, red-light `#d18180`, branco. Definida em `:root` de `styles/styles.css`.
- **Tipografia**: Fraunces (serif editorial) para títulos, Plus Jakarta Sans (sans moderno) para corpo, JetBrains Mono para overlines e legendas técnicas.
- **CTAs de WhatsApp**: sempre `https://wa.me/5534992365872?text=<msg URL-encoded>` com mensagem contextual ao botão.
- **JSON-LD**: cada página tem seu próprio schema relevante (EducationalOrganization, Person, Service, EducationalOccupationalCredential, FAQPage, ContactPage).

## TODOs futuros

- [ ] Substituir os depoimentos da home por reais (atualmente placeholders identificados em `index.html`).
- [ ] Revisão jurídica das páginas `politica-de-privacidade` e `termos-de-uso` antes da publicação definitiva.
- [ ] Adicionar Plausible ou GA4 quando fizer sentido medir tráfego.
- [ ] Blog (futura fase) — adicionar `/blog/` com posts mensais de inglês prático.
- [ ] Imagem OG dedicada (atualmente OG aponta para o logo).
