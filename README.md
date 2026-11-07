# Nizzera Games

Site de notícias de games, feito em HTML, CSS e JavaScript puro e hospedado na Vercel:
https://www.nizzeragames.com.br. Criado por Eduardo Nizer.

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
│   │   ├── noticia/<id>-<titulo>/│ uma página por notícia (endereço próprio)
│   │   ├── reviews/              │ lista de reviews de jogos
│   │   ├── review/<id>-<jogo>/   │ uma página por review
│   │   ├── ofertas/              │ página das ofertas da semana
│   │   ├── gratis/               │ página dos jogos grátis da semana (Epic e Steam)
│   │   ├── comentarios/          │ página de comentários e feedback
│   │   ├── 404.html              ┘ página de "não encontrado"
│   │   ├── admin/index.html      painel admin (endereço /admin, sem link no site)
│   │   ├── site.webmanifest, favicon.ico
│   │   ├── assets/
│   │   │   ├── css/style.css     visual do site
│   │   │   ├── css/admin.css     visual do painel
│   │   │   ├── js/core.js        funções comuns (dados, arte em pixel, endereços)
│   │   │   ├── js/tema.js        aplica o tema e o menu recolhido antes de desenhar a página
│   │   │   ├── js/site.js        menu lateral e tema (todas as páginas)
│   │   │   ├── js/app.js         página inicial: lista, paginação, destaque
│   │   │   ├── js/ofertas.js     página de ofertas
│   │   │   ├── js/gratis.js      página de jogos grátis
│   │   │   ├── js/artigo.js      páginas das notícias
│   │   │   ├── js/comunidade.js  comentários (página geral e abaixo de cada notícia) e caixa "Fale com a gente"
│   │   │   ├── js/admin.js       painel admin
│   │   │   └── icons/
│   │   ├── data/ofertas.json     ofertas da semana (gerado pelo robô)
│   │   ├── data/gratis.json      jogos grátis da Epic e da Steam (gerado pelo robô)
│   │   ├── data/maisjogados.json top 10 mais jogados da Steam (gerado pelo robô)
│   │   ├── googlecd4f...html     verificação do Google Search Console (não apague)
│   │   └── api/                  funções da Vercel: login, sessão, publicar, comentários, curtidas, votação, contato
│   └── scripts/
│       ├── atualizar_noticias.py lê os feeds RSS e grava as notícias no index.html
│       ├── atualizar_ofertas.py  busca as promoções da Steam
│       ├── atualizar_gratis.py   busca os jogos grátis da Epic e os fins de semana grátis da Steam
│       ├── atualizar_maisjogados.py busca o top 10 de jogadores ao mesmo tempo na Steam
│       ├── gerar_paginas.py      gera noticia/, sitemap.xml e feed.xml
│       └── gerar_segredos.py     gera SESSION_SECRET e a chave do 2FA
├── .gitignore
└── README.md
```

## Como funciona

1. Uma vez por dia (07:23, horário de Brasília) o GitHub Actions atualiza ofertas, jogos grátis e mais jogados,
   gera as páginas e faz commit. Notícias com mais de 15 dias saem do site sozinhas (a página delas é apagada;
   as 12 mais novas ficam sempre).
   As notícias dos feeds **não entram mais direto no site**: viram rascunhos (veja "Rascunhos com IA" abaixo).
2. Quando você publica pelo painel admin, o mesmo robô roda na hora e gera as páginas novas.
3. A Vercel publica a pasta `nizzera-games/SITE` a cada commit.

As notícias ficam dentro do `index.html`. O painel e o robô editam só esse bloco de dados.
O menu lateral, o rodapé e o chat das páginas internas são copiados do `index.html` pelo
`gerar_paginas.py`: para mudar algo neles, edite o `index.html` e rode o gerador.

**Toda notícia precisa de foto.** O robô pula notícias sem imagem, e o painel e o servidor
recusam salvar notícia sem foto.

## Rascunhos com IA

Todo dia às 03:40 (Brasília) o workflow `.github/workflows/rascunhos-ia.yml` roda `scripts/rascunhos_ia.py`:

1. lê os feeds de `scripts/atualizar_noticias.py`: os brasileiros (`FEEDS`) e os de fora, em inglês
   (`FEEDS_EXTERIOR`: IGN, GameSpot, Eurogamer, Gematsu, PC Gamer, Push Square e Nintendo Life), que o
   Gemini traduz. Para cada notícia nova, procura a mesma notícia nos outros feeds (até 3 fontes; com uma só,
   gera mesmo assim). No máximo 2 rascunhos por site e 3 por assunto em alta a cada dia;
2. pede ao Google Gemini (modelo em `MODELO`, no topo do script) uma matéria original que combine as fontes.
   O texto do pedido (tom, tamanho, regras de fatos) fica em `SITE/api/_rascunho_ia.json`;
3. grava o rascunho no Upstash Redis (o mesmo banco dos comentários). Nada vai para o site sozinho.

No painel, aba **Rascunhos**: edite título, subtítulo, texto e o bloco **Na opinião do Nizzera**, e clique em
**Publicar** (vira notícia normal, com "Fontes:" no fim), **Descartar** ou **Gerar de novo**.
**Buscar outras imagens** (no rascunho e no editor de notícias) mostra fotos do mesmo assunto, tiradas das
matérias de origem e da página do jogo na Steam, para trocar a capa; o crédito é preenchido junto.
Limites do plano grátis: no máximo `MAX_POR_EXECUCAO` (10) por dia, com pausa entre as chamadas.
Teste sem gastar nada: `python nizzera-games/scripts/rascunhos_ia.py --teste` (mostra o que seria gerado).
Para voltar ao modo antigo (notícia dos feeds direto no site): `PUBLICAR_DIRETO = True` em `atualizar_noticias.py`.

Secrets no GitHub (Settings → Secrets and variables → Actions → New repository secret):
`GEMINI_API_KEY`, `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (copie os dois da Vercel).

## Reviews

No painel admin, aba **Reviews**: nome do jogo, título, veredito, nota (com a escala e de onde ela vem),
notas de cada veículo, ficha técnica, sinopse, novidades, prós, pontos de atenção, o que o público
está achando e as fontes. A página `/review/<id>-<jogo>/` é gerada depois de publicar; a review mais
nova aparece no início, logo após o carrossel, e todas ficam em `/reviews/`.

Use notas e opiniões de fontes reais e liste-as em "Fontes". O campo **Nota própria** fica para quando
alguém da equipe jogar e quiser dar a nota do Nizzera Games.

## Assuntos em alta

No painel admin, aba **Site e categorias → Assuntos em alta**, você lista os assuntos do
momento (ex.: `GTA 6: gta 6, gta vi, grand theft auto vi`), em ordem de importância.

- Notícias recentes (até 21 dias) sobre eles abrem o "Em alta" e o destaque do topo e ganham o selo 🔥.
- Viram botões de filtro acima do carrossel (`/?assunto=gta-6`).
- O robô dá preferência a eles ao escolher notícias novas (e ignora matérias com mais de 10 dias).
- O assunto é reconhecido pelo título e pelo resumo da notícia. Troque a lista quando a moda mudar.

## Google

- Cada notícia tem endereço próprio (`/noticia/12-titulo/`), com HTML pronto, dados
  estruturados `NewsArticle`, link canônico e prévia para redes sociais.
- O endereço é fixado na primeira publicação e não muda se o título for editado.
- `sitemap.xml` lista todas as páginas. Depois do deploy, cadastre o site no
  [Google Search Console](https://search.google.com/search-console) e envie
  `https://www.nizzeragames.com.br/sitemap.xml`.
- Domínio: **https://www.nizzeragames.com.br** (o sem www redireciona para ele, pela Vercel).
  O endereço antigo `nizzera-games.vercel.app` redireciona com 301 para o domínio (`redirects` no `SITE/vercel.json`).
- Se mudar de domínio de novo: troque `SITE_URL` em `nizzera-games/scripts/config.py` (e ponha o endereço
  anterior em `DOMINIOS_ANTIGOS`) e rode `python nizzera-games/scripts/gerar_paginas.py`: ele acerta todas as
  páginas, o sitemap, o feed, o `robots.txt`, o `index.html`, o `404.html` e o `tierlist.js`. Falta só, à mão,
  o redirecionamento do `SITE/vercel.json` e o banner (`scripts/og_banner.html`, gere a imagem de novo).

## Painel admin

Endereço: **https://www.nizzeragames.com.br/admin**. Não há botão no site, e o Google não indexa essa página.

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
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | comentários, curtidas e votação do GOTY (Vercel → Storage → Upstash Redis). `KV_REST_API_URL`/`KV_REST_API_TOKEN` também servem |
| `RESEND_API_KEY` | envio da caixa "Fale com a gente" (resend.com) |
| `GEMINI_API_KEY` | botão "Gerar de novo" da aba Rascunhos (aistudio.google.com/apikey). Os rascunhos diários usam o secret do GitHub |
| `CONTACT_TO` / `CONTACT_FROM` | opcionais: quem recebe e quem envia o e-mail |

**E-mail da caixa "Fale com a gente" (Resend):**
1. Crie uma conta grátis em https://resend.com **usando o e-mail que vai receber as mensagens**
   (`nizzeragames@gmail.com`). Sem domínio próprio, o Resend só envia para o e-mail da própria conta.
2. No Resend: **API Keys → Create API Key**, permissão *Sending access*. Copie a chave (`re_...`).
3. Na Vercel: **Settings → Environment Variables → `RESEND_API_KEY`** = a chave, para *Production*.
4. **Deployments → ⋯ no último deploy → Redeploy** (variável nova só vale num deploy novo).
5. No painel `/admin` → **Publicar e backup → Enviar e-mail de teste**. Se falhar, o painel mostra o motivo.
   Confira também a pasta de spam na primeira vez.

Com domínio próprio no futuro: verifique o domínio no Resend e use `CONTACT_FROM` (ex.: `Nizzera Games <contato@seudominio.com.br>`).

**2FA (código do Google Authenticator):** no painel `/admin` → **Publicar e backup** →
**Verificação em 2 etapas → Configurar agora**. O assistente gera a chave no navegador, você cadastra no
app, ele confere um código e só então mostra o valor de `ADMIN_TOTP_SECRET` para colar na Vercel (depois, Redeploy).
Perdeu o celular? Apague `ADMIN_TOTP_SECRET` na Vercel e faça Redeploy: o login volta a pedir só a senha.

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
python nizzera-games/scripts/atualizar_gratis.py
python nizzera-games/scripts/atualizar_maisjogados.py
python nizzera-games/scripts/gerar_paginas.py
cd nizzera-games/SITE && python -m http.server
```

Abra http://localhost:8000. O painel e a API só funcionam na Vercel (ou com `vercel dev`).

## Atenção ao mexer no projeto

O robô faz commits sozinho. Antes de editar algo na sua máquina, rode `git pull`
para não dar conflito.

## Eventos (/eventos/)

`scripts/atualizar_eventos.py` roda todo dia e grava `SITE/data/eventos.json`:

- **Campeonatos** (CS2, Valorant, LoL, Dota 2, Rainbow Six, Free Fire): vêm do [Liquipedia](https://liquipedia.net/)
  (só S-Tier e A-Tier, sem classificatórias). Licença CC BY-SA: a página cita o Liquipedia e cada evento tem link para lá.
- **Feiras, premiações e apresentações** (BGS, Gamescom, The Game Awards...): não há fonte automática confiável, então
  ficam em `scripts/eventos_fixos.json`. Para adicionar um, copie um item da lista e troque os campos
  (`start`/`end` no formato AAAA-MM-DD; `time` é opcional, ex.: "22h (Brasília)"). Eventos que já passaram saem sozinhos.

## Discord (posts automáticos)

`nizzera-games/scripts/discord_sync.py` roda no GitHub Actions logo depois do `gerar_paginas.py`, tanto na rodada
diária quanto quando o painel admin publica, e posta no servidor do Discord só o que é novo:

| O quê | Canal (webhook) |
|---|---|
| Notícias | `TODAS_AS_NOTICIAS` + canal da categoria (Lançamentos, Steam, PlayStation, Xbox, Nintendo, Game Pass, Serviços, Esports, Eventos) |
| Reviews (com a nota) | `REVIEWS` |
| Ofertas da semana (até 10 por mensagem) | `OFERTAS_DA_SEMANA` |
| Jogos grátis (Epic e Steam) | `JOGOS_GRATIS` |
| Eventos novos de /eventos/ | `EVENTOS` |
| Novidades do site (manual: `--novidade "texto"`) | `NOVIDADES_DO_SITE` |

- Os webhooks ficam **só** em variáveis `DISCORD_WEBHOOK_*`: nos Secrets do GitHub Actions (produção) e, no computador,
  no arquivo `discord_webhooks.env` da raiz (está no `.gitignore`, nunca suba).
- O que já foi postado fica em `scripts/discord_enviados.json` (só ids do site). Na 1ª execução nada é postado:
  tudo o que já existe é marcado como enviado (`--backfill` posta tudo).
- Se o Discord falhar, o erro só aparece no log do Actions; o site é salvo do mesmo jeito.
- Comandos: `python nizzera-games/scripts/discord_sync.py --teste` (mensagem de teste em #novidades-do-site),
  `--seco` (mostra o que seria postado, sem postar).

## GTA VI: galeria oficial (/gta6/ e seção da página inicial)

`scripts/atualizar_gta6.py` lê todo dia a galeria oficial (rockstargames.com/VI/media/screenshots) e grava
`SITE/data/gta6.json` só com os endereços das fotos. **As fotos não são baixadas**: o site mostra direto do servidor
da Rockstar, em miniatura (480px) e grande (1920px) só ao abrir, então nada pesa no servidor do site.
Foto nova na galeria ganha a etiqueta "Nova" por 14 dias. O resumo fica em `GTA6_RESUMO` no `gerar_paginas.py`.
