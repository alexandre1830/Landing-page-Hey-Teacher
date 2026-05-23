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
