# Nizzera Games

Site de notícias de games, feito em HTML, CSS e JavaScript puro e hospedado na Vercel:
https://nizzera-games.vercel.app. Criado por Eduardo Nizer.

## Estrutura

```
.
├── .github/workflows/
│   └── atualizar-noticias.yml    robô: busca notícias/ofertas e gera as páginas
├── nizzera-games/
│   ├── SITE/                     ← raiz do site na Vercel
│   │   ├── index.html            página inicial + notícias em JSON (<script id="nz-data">)
│   │   ├── vercel.json           cabeçalhos de segurança e rotas
│   │   ├── robots.txt
│   │   ├── sitemap.xml           ┐
│   │   ├── feed.xml              ├ gerados por scripts/gerar_paginas.py (não edite à mão)
│   │   ├── noticia/<id>-<titulo>/┘ uma página por notícia, para o Google
│   │   ├── admin/index.html      painel admin (endereço /admin, sem link no site)
│   │   ├── 404.html
│   │   ├── site.webmanifest, favicon.ico
│   │   ├── assets/
│   │   │   ├── css/style.css     visual do site
│   │   │   ├── css/admin.css     visual do painel
│   │   │   ├── js/core.js        funções comuns (dados, arte em pixel, endereços)
│   │   │   ├── js/app.js         página inicial: lista, paginação, destaque, ofertas
│   │   │   ├── js/menu.js        menu lateral
│   │   │   ├── js/artigo.js      páginas das notícias
│   │   │   ├── js/comunidade.js  comentários e caixa "Fale com a gente"
│   │   │   ├── js/admin.js       painel admin
│   │   │   └── icons/
│   │   ├── data/ofertas.json     ofertas da semana (gerado pelo robô)
│   │   ├── googlecd4f...html     verificação do Google Search Console (não apague)
│   │   └── api/                  funções da Vercel: login, sessão, publicar, comentários, contato
│   └── scripts/
│       ├── atualizar_noticias.py lê os feeds RSS e grava as notícias no index.html
│       ├── atualizar_ofertas.py  busca as promoções da Steam
│       ├── gerar_paginas.py      gera noticia/, sitemap.xml e feed.xml
│       └── gerar_segredos.py     gera SESSION_SECRET e a chave do 2FA
├── .gitignore
└── README.md
```

## Como funciona

1. A cada 4 horas o GitHub Actions busca notícias e ofertas, gera as páginas e faz commit.
2. Quando você publica pelo painel admin, o mesmo robô roda na hora e gera as páginas novas.
3. A Vercel publica a pasta `nizzera-games/SITE` a cada commit.

As notícias ficam dentro do `index.html`. O painel e o robô editam só esse bloco de dados.

## Google

- Cada notícia tem endereço próprio (`/noticia/12-titulo/`), com HTML pronto, dados
  estruturados `NewsArticle`, link canônico e prévia para redes sociais.
- O endereço é fixado na primeira publicação e não muda se o título for editado.
- `sitemap.xml` lista todas as páginas. Depois do deploy, cadastre o site no
  [Google Search Console](https://search.google.com/search-console) e envie
  `https://nizzera-games.vercel.app/sitemap.xml`.
- Se mudar de domínio, troque `SITE_URL` em `scripts/gerar_paginas.py` e o endereço no
  `<head>` do `index.html` e no `robots.txt`.

## Painel admin

Endereço: **https://nizzera-games.vercel.app/admin**. Não há botão no site, e o Google não indexa essa página.

Variáveis na Vercel (Settings → Environment Variables), depois faça um novo deploy:

| Variável | Para quê |
|---|---|
| `ADMIN_PASSWORD` | senha do painel. Use 16 caracteres ou mais |
| `SESSION_SECRET` | 32+ caracteres aleatórios (`python nizzera-games/scripts/gerar_segredos.py`) |
| `ADMIN_TOTP_SECRET` | opcional, liga o código de 6 dígitos (2FA) |
| `GITHUB_REPO` | `Eduardonizer/nizzera-games` |
| `GITHUB_TOKEN` | token fine-grained só deste repositório, com permissão *Contents: Read and write* |
| `GITHUB_FILE` | `nizzera-games/SITE/index.html` |
| `GITHUB_BRANCH` | opcional, padrão `main` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | comentários (Vercel → Storage → Upstash Redis). `KV_REST_API_URL`/`KV_REST_API_TOKEN` também servem |
| `RESEND_API_KEY` | envio da caixa "Fale com a gente" (resend.com) |
| `CONTACT_TO` / `CONTACT_FROM` | opcionais: quem recebe e quem envia o e-mail |

**2FA:** rode `python nizzera-games/scripts/gerar_segredos.py`, cadastre a chave mostrada no
Google Authenticator (ou Authy, Microsoft Authenticator) e coloque o mesmo valor em
`ADMIN_TOTP_SECRET` na Vercel. A partir daí, o login pede senha + código.

**Desconfiou de algo?** Troque `ADMIN_PASSWORD` ou `SESSION_SECRET` na Vercel e faça um novo
deploy: todas as sessões abertas caem na hora.

## Segurança

- Cabeçalhos em `vercel.json`: CSP que só aceita scripts do próprio site, HSTS, proteção
  contra ser exibido em iframe, `nosniff`, Permissions-Policy.
- Login com bloqueio progressivo após 5 erros, resposta lenta a cada erro e 2FA opcional.
- Cookie de sessão `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, assinado, válido por 8 horas.
- Toda ação do painel, os comentários e o contato conferem se o pedido veio do próprio site (proteção contra CSRF).
- Comentários e contato têm limite de envios por pessoa (Redis) e campo-armadilha contra robôs.
- A publicação só aceita dados (textos, links `http(s)`, imagens), validados no servidor, e
  troca só o bloco de dados do `index.html`. Nem uma sessão roubada consegue injetar código no site.
- Se o robô adicionar notícias enquanto você edita, elas são mantidas ao publicar.

## Rodar na sua máquina

```
python nizzera-games/scripts/atualizar_noticias.py
python nizzera-games/scripts/atualizar_ofertas.py
python nizzera-games/scripts/gerar_paginas.py
cd nizzera-games/SITE && python -m http.server
```

Abra http://localhost:8000. O painel e a API só funcionam na Vercel (ou com `vercel dev`).

## Atenção ao mexer no projeto

O robô faz commits sozinho. Antes de editar algo na sua máquina, rode `git pull`
para não dar conflito.
