#!/usr/bin/env python3
"""Gera as páginas que o Google indexa, a partir das notícias do SITE/index.html.

Cria, dentro de SITE/:
  noticia/<id>-<titulo>/index.html   uma página estática por notícia (com dados estruturados)
  reviews/index.html                 lista de reviews de jogos
  review/<id>-<jogo>/index.html      uma página por review
  ofertas/index.html                 página das ofertas da semana
  gratis/index.html                  página dos jogos grátis da semana (Epic e Steam)
  comentarios/index.html             página de comentários e feedback
  404.html                           página de "não encontrado"
  sitemap.xml                        lista de todas as páginas, para o Google
  feed.xml                           feed RSS das notícias mais recentes

Todas usam o mesmo menu lateral, rodapé e caixa "Fale com a gente" do index.html
(copiados de lá a cada execução, para nunca ficarem diferentes).

Também grava um "slug" (o pedaço do endereço) em cada notícia que ainda não tem,
para o endereço não mudar se o título for editado depois.

Roda sozinho no GitHub Actions. Uso manual:  python scripts/gerar_paginas.py
Só usa a biblioteca padrão.
"""
import html, json, os, re, shutil, sys, unicodedata
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atualizar_noticias import assunto  # mesma regra de "assunto em alta" do robô e do site

# ---------------- CONFIGURAÇÃO ----------------
SITE_URL = "https://nizzera-games.vercel.app"   # sem barra no final; troque se tiver domínio próprio
RELACIONADAS = 3                                # quantas "leia também" no fim de cada notícia
NO_FEED = 30                                    # quantas notícias entram no feed RSS
TREND_DIAS = 21                                 # igual a TREND_DIAS de assets/js/core.js
FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 01-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1-9.5z"/></svg>'
# ----------------------------------------------

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(RAIZ, "SITE")
INDEX = os.path.join(SITE, "index.html")
PASTA = os.path.join(SITE, "noticia")
PASTA_RV = os.path.join(SITE, "review")
MARCA = "<!-- gerado por scripts/gerar_paginas.py: não edite à mão -->"
BLOCO = re.compile(r'(<script id="nz-data" type="application/json">\s*)(.*?)(\s*</script>)', re.S)
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]
SLUG_OK = re.compile(r"^[a-z0-9-]{1,90}$")
REVIEWS = []


def e(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def slugify(t):
    """Igual à função slugify() de assets/js/core.js: mantenha as duas iguais."""
    s = unicodedata.normalize("NFD", str(t or ""))
    s = re.sub("[̀-ͯ]", "", s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > 60:
        s = s[:60]
        k = s.rfind("-")
        if k > 30:
            s = s[:k]
    return s.rstrip("-") or "noticia"


def data_br(d):
    try:
        x = datetime.strptime(d, "%Y-%m-%d")
        return f"{x.day} de {MESES[x.month - 1]} de {x.year}"
    except Exception:
        return ""


def data_rss(d):
    try:
        x = datetime.strptime(d, "%Y-%m-%d").replace(hour=12)
    except Exception:
        x = datetime.now()
    dias = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    meses = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{dias[x.weekday()]}, {x.day:02d} {meses[x.month - 1]} {x.year} 12:00:00 -0300"


def http(u):
    return u if re.match(r"^https?://", u or "", re.I) else ""


def img_ok(u):
    return http(u) or (u if re.match(r"^data:image/(png|jpe?g|webp|gif);base64,", u or "", re.I) else "")


def paragrafos(t):
    partes = [p.strip() for p in re.split(r"\n\s*\n", str(t or "")) if p.strip()]
    return "".join("<p>" + e(p).replace("\n", "<br>") + "</p>" for p in partes)


def json_ld(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def url_noticia(n):
    return f"{SITE_URL}/noticia/{n['slug']}/"


def arte(n, prioridade=False):
    """<img> se a notícia tem foto; senão um espaço que o core.js preenche com a arte em pixel."""
    u = img_ok(n.get("img", ""))
    if not u:
        return f'<div class="art" data-art="{int(n.get("id") or 0)}"></div>'
    pos = n.get("pos") if n.get("pos") in ("top", "bottom") else ""
    estilo = f' style="object-position:center {pos}"' if pos else ""
    carga = 'fetchpriority="high"' if prioridade else 'loading="lazy"'
    return (f'<div class="art"><img src="{e(u)}" alt="{e(n.get("alt") or n.get("title"))}" {carga} '
            f'decoding="async" referrerpolicy="no-referrer" data-fid="{int(n.get("id") or 0)}"{estilo}></div>')


def card(n, trend=()):
    return (f'<a class="card" href="/noticia/{e(n["slug"])}/">{arte(n)}<div class="tx">'
            f'<span class="tags"><span class="tag">{e(n.get("cat"))}</span>{selo(n, trend)}</span><h3>{e(n.get("title"))}</h3>'
            f'<p>{e(n.get("sum"))}</p><span class="meta">{e(data_br(n.get("date", "")))}</span></div></a>')


def cabeca_comum():
    return """<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0b12">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/assets/icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="Nizzera Games" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
<script src="/assets/js/tema.js"></script>
<script defer src="/_vercel/insights/script.js"></script>"""


def casca(texto, site):
    """Pega do index.html o menu lateral, o rodapé e a caixa de mensagem."""
    def pedaco(ini, fim):
        i = texto.index(ini)
        return texto[i:texto.index(fim, i) + len(fim)]
    menu = pedaco('<button class="mbtn"', "</aside>").replace('href="#topo" data-go="topo"', 'href="/"')
    rodape = pedaco("<footer>", "</footer>")
    rodape = re.sub(r'<span id="ftxt">.*?</span>', lambda _: f'<span id="ftxt">{e(site.get("footer"))}</span>', rodape, flags=re.S)
    if site.get("credit"):
        rodape = re.sub(r'<strong id="fcredit">.*?</strong>', lambda _: f'<strong id="fcredit">{e(site["credit"])}</strong>', rodape, flags=re.S)
        rodape = rodape.replace('<p class="by" hidden>', '<p class="by">')
    else:
        rodape = re.sub(r'<p class="by"[^>]*>.*?</p>', "", rodape, flags=re.S)
    chat = pedaco('<button class="chat-fab"', '<section class="chat"') [:-len('<section class="chat"')]
    chat += pedaco('<section class="chat"', "</section>")
    return {"menu": menu, "rodape": rodape, "chat": chat}


def layout(c, nome, cabeca, corpo, scripts=""):
    """Esqueleto comum: menu lateral + barra do topo + conteúdo + rodapé + chat."""
    return f"""<!DOCTYPE html>
{MARCA}
<html lang="pt-BR">
<head>
{cabeca_comum()}
{cabeca}
</head>
<body>
{c['menu']}
<header class="topbar">
  <div class="wrap">
    <a class="logo" href="/"><i></i><span>{e(nome)}</span></a>
    <button class="tbtn" id="theme" type="button">Alternar tema</button>
  </div>
</header>
{corpo}
{c['rodape']}
{c['chat']}
<script src="/assets/js/core.js"></script>
<script src="/assets/js/site.js"></script>
<script src="/assets/js/comunidade.js"></script>
{scripts}</body>
</html>
"""


def meta_pagina(titulo, desc, url, nome, tipo="website", indexar=True):
    return f"""<title>{e(titulo)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<meta name="robots" content="{'index, follow, max-image-preview:large' if indexar else 'noindex'}">
<meta property="og:type" content="{tipo}">
<meta property="og:site_name" content="{e(nome)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="{e(titulo)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}">"""


def trilha(atual):
    return (f'<nav class="crumbs" aria-label="Você está em"><ol><li><a href="/">Início</a></li>'
            f'<li aria-current="page">{e(atual)}</li></ol></nav>')


def pagina_ofertas(c, site):
    nome = site.get("name") or "Nizzera Games"
    cab = meta_pagina(f"Ofertas da semana na Steam | {nome}",
                      "Os maiores descontos da semana na Steam, com preço em reais, atualizados automaticamente.",
                      SITE_URL + "/ofertas/", nome)
    corpo = f"""<main class="wrap page">
  {trilha("Ofertas da semana")}
  <h1 class="ph">Ofertas da semana na Steam</h1>
  <p class="lead">Os maiores descontos do momento, com preço em reais. Atualizado automaticamente.</p>
  <div class="dtabs" id="dtabs" role="tablist" aria-label="Loja"></div>
  <div class="deals" id="deals" aria-live="polite"><p class="soon">Carregando ofertas…</p></div>
  <p class="meta" id="dmeta"></p>
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/ofertas.js"></script>\n')


def pagina_gratis(c, site):
    nome = site.get("name") or "Nizzera Games"
    cab = meta_pagina(f"Jogos grátis da semana na Epic e na Steam | {nome}",
                      "Os jogos grátis da semana na Epic Games Store e os fins de semana grátis da Steam, atualizados automaticamente.",
                      SITE_URL + "/gratis/", nome)
    corpo = f"""<main class="wrap page">
  {trilha("Jogos grátis")}
  <h1 class="ph">Jogos grátis da semana</h1>
  <p class="lead">Os jogos grátis da Epic Games Store e os fins de semana grátis da Steam, num lugar só. Atualizado automaticamente.</p>
  <div id="gratis" aria-live="polite"><div class="deals"><p class="soon">Carregando jogos grátis…</p></div></div>
  <p class="meta" id="gmeta"></p>
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/gratis.js"></script>\n')


def pagina_comentarios(c, site):
    nome = site.get("name") or "Nizzera Games"
    cab = meta_pagina(f"Comentários e feedback | {nome}",
                      "Deixe sua sugestão, correção ou pedido de pauta para o Nizzera Games.",
                      SITE_URL + "/comentarios/", nome)
    corpo = f"""<main class="wrap page cm" id="feedback">
  {trilha("Comentários")}
  <header class="cm-head">
    <div>
      <h1 class="ph">Comentários e feedback</h1>
      <p class="lead">Sugestões, correções, pedidos de pauta ou só um oi: os comentários aparecem aqui para todo mundo.</p>
    </div>
    <p class="cm-stat" id="cm-stat" aria-live="polite"></p>
  </header>
  <div class="cm-grid">
    <aside class="cm-side">
      <form class="cm-form" id="fb-form" novalidate>
        <h2>Deixe seu comentário</h2>
        <label for="fb-name">Seu nome <small>(opcional)</small></label>
        <input class="fb-in" id="fb-name" maxlength="40" autocomplete="nickname" placeholder="Como você quer aparecer">
        <label for="fb-msg">Comentário</label>
        <textarea class="fb-in" id="fb-msg" maxlength="500" rows="5" placeholder="O que achou do site? Que notícia ou jogo você quer ver aqui?"></textarea>
        <div class="hp" aria-hidden="true"><label>Não preencha este campo<input id="fb-hp" tabindex="-1" autocomplete="off"></label></div>
        <div class="fb-row"><span class="fb-count" id="fb-count">0/500</span><button class="fb-btn" id="fb-send" type="submit">Publicar comentário</button></div>
        <div class="fb-status" id="fb-status" role="status"></div>
      </form>
      <div class="cm-rules">
        <h3>Antes de comentar</h3>
        <ul>
          <li>Seja respeitoso: ofensas e spam são removidos pela moderação.</li>
          <li>Links não são permitidos nos comentários.</li>
          <li>Quer falar só com a equipe? Use o <button type="button" class="cm-link" data-open-chat>Fale com a gente</button>.</li>
        </ul>
      </div>
    </aside>
    <section class="cm-main" aria-labelledby="cm-list-t">
      <h2 class="cm-title" id="cm-list-t">Últimos comentários</h2>
      <div class="cm-list" id="cmlist" aria-live="polite" aria-busy="true">
        <div class="cm-skel"></div><div class="cm-skel"></div><div class="cm-skel"></div>
      </div>
      <button class="cm-more" id="cm-more" type="button" hidden>Ver mais comentários</button>
    </section>
  </div>
</main>"""
    return layout(c, nome, cab, corpo)


def rv_slug(r):
    s = r.get("slug", "")
    return s if SLUG_OK.match(s or "") else f"{int(r.get('id') or 0)}-{slugify(r.get('game'))}"


def rv_nota(r):
    s, mx = r.get("score") or 0, r.get("scoreMax") or 100
    txt = (f"{s}".replace(".", ",") if mx == 10 else f"{s}")
    pct = (s / mx * 100) if mx else 0
    tom = "great" if pct >= 85 else "good" if pct >= 70 else "low"
    return txt, tom


def rv_card(r):
    nota, tom = rv_nota(r)
    rotulo = (r.get("scoreLabel") or "nota").split(" ")[0]
    return (f'<a class="rv-card" href="/review/{e(rv_slug(r))}/">{arte({"id": r.get("id"), "img": r.get("img"), "alt": r.get("alt") or r.get("game"), "title": r.get("game")})}'
            f'<span class="rv-score {tom}" title="{e(r.get("scoreLabel"))}"><b>{e(nota)}</b><small>{e(rotulo)}</small></span>'
            f'<div class="tx"><span class="tag rv-tag">Review</span><h3>{e(r.get("game"))}</h3><p>{e(r.get("verdict"))}</p>'
            f'<span class="meta">{e(r.get("platforms"))}</span></div></a>')


def lista(itens):
    return "".join(f"<li>{e(x)}</li>" for x in itens if str(x).strip())


def pagina_reviews(c, site, revs):
    nome = site.get("name") or "Nizzera Games"
    cab = meta_pagina(f"Reviews de games | {nome}",
                      "Reviews dos jogos do momento: nota da crítica, sinopse, novidades, prós e contras e o que os jogadores estão achando.",
                      SITE_URL + "/reviews/", nome)
    cards = "".join(rv_card(r) for r in revs) or '<p class="soon">As primeiras reviews chegam em breve.</p>'
    corpo = f"""<main class="wrap page">
  {trilha("Reviews")}
  <h1 class="ph">Reviews de games</h1>
  <p class="lead">Os jogos do momento em um só lugar: nota da crítica, sinopse, o que mudou, prós e contras e o que os jogadores estão achando.</p>
  <div class="rv-grid">{cards}</div>
</main>"""
    return layout(c, nome, cab, corpo)


def pagina_review(r, c, site, noticias):
    nome = site.get("name") or "Nizzera Games"
    url = f"{SITE_URL}/review/{rv_slug(r)}/"
    titulo, jogo = r.get("title") or r.get("game", ""), r.get("game", "")
    desc = r.get("verdict") or titulo
    desc = desc if len(desc) <= 160 else desc[:157].rsplit(" ", 1)[0] + "…"
    foto = http(r.get("img", ""))
    nota, tom = rv_nota(r)
    mx = r.get("scoreMax") or 100
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": titulo[:110], "description": desc,
          "inLanguage": "pt-BR", "mainEntityOfPage": url,
          "about": {"@type": "VideoGame", "name": jogo, "gamePlatform": r.get("platforms", ""),
                    "genre": r.get("genre", ""), "publisher": {"@type": "Organization", "name": r.get("dev", "")}},
          "author": {"@type": "Organization", "name": nome, "url": SITE_URL + "/"},
          "publisher": {"@type": "Organization", "name": nome, "url": SITE_URL + "/",
                        "logo": {"@type": "ImageObject", "url": SITE_URL + "/assets/icons/icon-192.png"}}}
    if r.get("date"):
        ld["datePublished"] = ld["dateModified"] = r["date"]
    if foto:
        ld["image"] = [foto]
    og = (f'<meta property="og:image" content="{e(foto)}">\n<meta name="twitter:card" content="summary_large_image">' if foto
          else f'<meta property="og:image" content="{SITE_URL}/assets/icons/icon-192.png">\n<meta name="twitter:card" content="summary">')
    cab = meta_pagina(f"Review: {jogo} | {nome}", desc, url, nome, tipo="article") + f"""
{og}
<script type="application/ld+json">{json_ld(ld)}</script>"""

    ficha = [("Plataformas", r.get("platforms")), ("Lançamento", data_br(r.get("release", "")) or r.get("release")),
             ("Desenvolvedora", r.get("dev")), ("Gênero", r.get("genre"))]
    ficha_html = "".join(f"<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>" for k, v in ficha if v)
    criticos = "".join(
        f'<li><span>{(f"<a href={chr(34)}{e(x["url"])}{chr(34)} target=_blank rel=noopener>{e(x["name"])}</a>") if http(x.get("url", "")) else e(x.get("name"))}</span><b>{e(x.get("score"))}</b></li>'
        for x in r.get("critics", []) if x.get("name"))
    minha = (f'<p class="rv-mine">Nota {e(nome)}: <b>{e(r["myScore"])}</b></p>' if r.get("myScore") else "")
    fontes = "".join(f'<li><a href="{e(x["url"])}" target="_blank" rel="noopener">{e(x.get("name") or x["url"])}</a></li>'
                     for x in r.get("sources", []) if http(x.get("url", "")))
    # notícias do site sobre o jogo (palavras do nome do jogo depois dos ":")
    chave = plain_jogo(jogo)
    rel = [n for n in sorted(noticias, key=lambda n: n.get("date", ""), reverse=True)
           if chave and chave in plain_jogo(n.get("title", "") + " " + n.get("sum", ""))][:3]

    corpo = f"""<main class="wrap">
  <nav class="crumbs" aria-label="Você está em"><ol><li><a href="/">Início</a></li><li><a href="/reviews/">Reviews</a></li><li aria-current="page">{e(jogo)}</li></ol></nav>
  <article class="post rv">
    <span class="tags"><span class="tag rv-tag">Review</span></span>
    <h1>{e(titulo)}</h1>
    <p class="lead">{e(r.get("verdict"))}</p>
    <p class="meta">Publicada em <time datetime="{e(r.get("date"))}">{e(data_br(r.get("date", "")))}</time></p>
    <figure>{arte({"id": r.get("id"), "img": r.get("img"), "alt": r.get("alt") or jogo, "title": jogo}, prioridade=True)}{('<figcaption>Imagem: ' + e(r["credit"]) + '</figcaption>') if r.get("credit") else ''}</figure>

    <section class="rv-panel" aria-label="Nota e ficha técnica">
      <div class="rv-big {tom}"><b>{e(nota)}</b><small>de {e(mx)}</small></div>
      <div class="rv-pinfo">
        <p class="rv-label">{e(r.get("scoreLabel"))}</p>
        {minha}
        <dl class="rv-ficha">{ficha_html}</dl>
      </div>
    </section>

    {('<section class="rv-sec"><h2>Notas da crítica</h2><ul class="rv-critics">' + criticos + '</ul></section>') if criticos else ''}
    {('<section class="rv-sec"><h2>Sinopse</h2><div class="body">' + paragrafos(r["synopsis"]) + '</div></section>') if r.get("synopsis") else ''}
    {('<section class="rv-sec"><h2>O que há de novo</h2><ul class="rv-list">' + lista(r["changes"]) + '</ul></section>') if r.get("changes") else ''}
    <section class="rv-sec rv-pc">
      {('<div class="rv-pros"><h2>O que a crítica elogia</h2><ul>' + lista(r.get("pros", [])) + '</ul></div>') if r.get("pros") else ''}
      {('<div class="rv-cons"><h2>Pontos de atenção</h2><ul>' + lista(r.get("cons", [])) + '</ul></div>') if r.get("cons") else ''}
    </section>
    {('<section class="rv-sec rv-public"><h2>O que o público está achando</h2><div class="body">' + paragrafos(r["public"]) + '</div></section>') if r.get("public") else ''}
    {('<section class="rv-sec"><h2>Fontes</h2><ul class="rv-src">' + fontes + '</ul></section>') if fontes else ''}
    <p class="share"><span>Link desta review:</span> <a href="{e(url)}">{e(url)}</a></p>
  </article>
  {('<section class="related" aria-label="Notícias sobre o jogo"><h2 class="sec">Notícias sobre o jogo</h2><div class="cards">' + ''.join(card(x) for x in rel) + '</div></section>') if rel else ''}
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/artigo.js"></script>\n')


def plain_jogo(t):
    """Parte principal do nome do jogo, sem acentos ("The Legend of Zelda: Ocarina of Time" -> "ocarina of time")."""
    t = unicodedata.normalize("NFD", str(t or ""))
    t = re.sub("[\u0300-\u036f]", "", t).lower()
    if ":" in t and len(t.split(":")[-1].strip()) > 3:
        t = t.split(":")[-1]
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def pagina_404(c, site):
    nome = site.get("name") or "Nizzera Games"
    cab = meta_pagina(f"Página não encontrada | {nome}", "Essa página não existe.", SITE_URL + "/", nome, indexar=False)
    corpo = """<main class="wrap notfound">
  <h1>Game over: 404</h1>
  <p class="meta">Essa página não existe ou a notícia saiu do ar.</p>
  <a class="a" href="/">Voltar para as notícias</a>
</main>"""
    return layout(c, nome, cab, corpo)


def em_alta(n, trend):
    """Nome do assunto em alta da notícia (se for recente), ou ""."""
    i = assunto(n.get("title", ""), n.get("sum", ""), trend)
    try:
        idade = (date.today() - date.fromisoformat(n.get("date", ""))).days
    except ValueError:
        idade = 999
    return trend[i]["name"] if i is not None and idade <= TREND_DIAS else ""


def selo(n, trend):
    nome = em_alta(n, trend)
    return f'<span class="hot">{FLAME}{e(nome)}</span>' if nome else ""


def pagina(n, todas, site, c, trend):
    nome = site.get("name") or "Nizzera Games"
    url = url_noticia(n)
    titulo = n.get("title", "")
    resumo = n.get("sum") or titulo
    desc = resumo if len(resumo) <= 160 else resumo[:157].rsplit(" ", 1)[0] + "…"
    foto = http(n.get("img", ""))
    data = n.get("date", "")
    fonte, link_fonte = n.get("src", ""), http(n.get("url", ""))

    ld_artigo = {
        "@context": "https://schema.org", "@type": "NewsArticle",
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "headline": titulo[:110], "description": desc, "inLanguage": "pt-BR",
        "articleSection": n.get("cat", ""),
        "author": {"@type": "Organization", "name": nome, "url": SITE_URL + "/"},
        "publisher": {"@type": "Organization", "name": nome, "url": SITE_URL + "/",
                      "logo": {"@type": "ImageObject", "url": SITE_URL + "/assets/icons/icon-192.png",
                               "width": 192, "height": 192}},
    }
    if data:
        ld_artigo["datePublished"] = ld_artigo["dateModified"] = data
    if foto:
        ld_artigo["image"] = [foto]
    if link_fonte:
        ld_artigo["isBasedOn"] = link_fonte
    ld_trilha = {
        "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Início", "item": SITE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": n.get("cat") or "Notícias",
             "item": f"{SITE_URL}/?categoria={slugify(n.get('cat'))}"},
            {"@type": "ListItem", "position": 3, "name": titulo[:110], "item": url}]}

    # "leia também": primeiro o mesmo assunto em alta, depois a mesma categoria, depois as mais novas
    meu = em_alta(n, trend)
    tema = [x for x in todas if x is not n and meu and em_alta(x, trend) == meu]
    mesma = [x for x in todas if x is not n and x not in tema and x.get("cat") == n.get("cat")]
    outras = [x for x in todas if x is not n and x not in tema and x not in mesma]
    rel = (tema + mesma + outras)[:RELACIONADAS]

    credito = []
    if n.get("credit"):
        credito.append("Imagem: " + e(n["credit"]))
    meta_og_img = (f'<meta property="og:image" content="{e(foto)}">\n<meta name="twitter:card" content="summary_large_image">'
                   if foto else f'<meta property="og:image" content="{SITE_URL}/assets/icons/icon-192.png">\n<meta name="twitter:card" content="summary">')
    bloco_fonte = (f'<p class="src">Leia a matéria completa em <a href="{e(link_fonte)}" target="_blank" rel="noopener">{e(fonte or link_fonte)}</a>.</p>'
                   if link_fonte else "")

    cab = meta_pagina(f"{titulo} | {nome}", desc, url, nome, tipo="article") + f"""
{meta_og_img}
<meta property="article:published_time" content="{e(data)}">
<meta property="article:section" content="{e(n.get('cat'))}">
<script type="application/ld+json">{json_ld(ld_artigo)}</script>
<script type="application/ld+json">{json_ld(ld_trilha)}</script>"""
    corpo = f"""<main class="wrap">
  <nav class="crumbs" aria-label="Você está em">
    <ol><li><a href="/">Início</a></li><li><a href="/?categoria={e(slugify(n.get('cat')))}#noticias">{e(n.get('cat'))}</a></li><li aria-current="page">Notícia</li></ol>
  </nav>
  <article class="post">
    <span class="tags"><span class="tag">{e(n.get('cat'))}</span>{selo(n, trend)}</span>
    <h1>{e(titulo)}</h1>
    <p class="lead">{e(resumo)}</p>
    <p class="meta"><time datetime="{e(data)}">{e(data_br(data))}</time> · {int(n.get('read') or 1)} min de leitura{(' · Fonte: ' + e(fonte)) if fonte else ''}</p>
    <figure>{arte(n, prioridade=True)}{('<figcaption>' + ' · '.join(credito) + '</figcaption>') if credito else ''}</figure>
    <div class="body">{paragrafos(n.get('body') or resumo)}</div>
    {bloco_fonte}
    <p class="share"><span>Link desta notícia:</span> <a href="{e(url)}">{e(url)}</a></p>
    <p class="likes"><button class="like" id="like" type="button" aria-pressed="false" data-post="{e(n['slug'])}" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span class="like-t">Curtir</span><b id="like-n"></b></button></p>
  </article>
  {comentarios_noticia(n, titulo)}
  {('<section class="related" aria-label="Leia também"><h2 class="sec">Leia também</h2><div class="cards">' + ''.join(card(x, trend) for x in rel) + '</div></section>') if rel else ''}
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/artigo.js"></script>\n')


def comentarios_noticia(n, titulo):
    """Comentários abaixo da notícia (usa o mesmo formulário e script da página /comentarios/)."""
    return f"""<section class="post-cm" id="comentarios" aria-labelledby="cm-list-t">
    <header class="cm-head"><h2 class="cm-title" id="cm-list-t">Comentários</h2><p class="cm-stat" id="cm-stat" aria-live="polite"></p></header>
    <form class="cm-form" id="fb-form" data-post="{e(n['slug'])}" data-title="{e(titulo)}" novalidate>
      <label for="fb-name">Seu nome <small>(opcional)</small></label>
      <input class="fb-in" id="fb-name" maxlength="40" autocomplete="nickname" placeholder="Como você quer aparecer">
      <label for="fb-msg">Comentário</label>
      <textarea class="fb-in" id="fb-msg" maxlength="500" rows="4" placeholder="O que você achou dessa notícia?"></textarea>
      <div class="hp" aria-hidden="true"><label>Não preencha este campo<input id="fb-hp" tabindex="-1" autocomplete="off"></label></div>
      <div class="fb-row"><span class="fb-count" id="fb-count">0/500</span><button class="fb-btn" id="fb-send" type="submit">Publicar comentário</button></div>
      <div class="fb-status" id="fb-status" role="status"></div>
      <p class="cm-note">Seja respeitoso: ofensas e spam são removidos. Links não são permitidos.</p>
    </form>
    <div class="cm-list" id="cmlist" aria-live="polite" aria-busy="true"><div class="cm-skel"></div></div>
    <button class="cm-more" id="cm-more" type="button" hidden>Ver mais comentários</button>
  </section>"""


# ---------------- página inicial já preenchida no HTML ----------------
# O Google, as prévias de link (WhatsApp etc.) e quem está sem JavaScript leem o index.html cru.
# Aqui as mesmas partes que o assets/js/app.js monta são escritas direto no HTML; quando o
# JavaScript roda, ele substitui tudo pela versão interativa (filtros, busca, paginação).
POR_PAGINA = 12  # igual a PER de assets/js/app.js


def idade_dias(n):
    try:
        return max(0, (date.today() - date.fromisoformat(n.get("date", ""))).days)
    except ValueError:
        return 999


def mais_relevantes(noticias, trend, maximo):
    """Igual a topNews() de app.js: destaque, depois assuntos em alta recentes, depois as mais novas."""
    def nota(n):
        i, idade = assunto(n.get("title", ""), n.get("sum", ""), trend), idade_dias(n)
        return 1000 - i * 100 - idade if i is not None and idade <= TREND_DIAS else -idade
    l = sorted(noticias, key=lambda n: n.get("date", ""), reverse=True)
    l.sort(key=lambda n: (1 if n.get("featured") else 0, nota(n)), reverse=True)
    return l[:maximo]


def trocar(texto, padrao, novo, obrigatorio=True):
    """Troca um trecho do index.html; avisa (e não troca) se o trecho sumiu."""
    out, n = re.subn(padrao, lambda _: novo, texto, count=1, flags=re.S)
    if not n and obrigatorio:
        print(f"[aviso] index.html: não achei {padrao[:60]!r}; essa parte fica para o JavaScript")
    return out


def miolo(texto, nome, conteudo):
    return trocar(texto, rf"<!--ssr:{nome}-->.*?<!--/ssr:{nome}-->", f"<!--ssr:{nome}-->{conteudo}<!--/ssr:{nome}-->")


def oculto(texto, id_, esconder):
    """Liga/desliga o atributo hidden na tag de abertura com esse id."""
    def f(m):
        tag = re.sub(r"\s+hidden(?=[\s>])", "", m.group(0))
        return tag[:-1] + " hidden>" if esconder else tag
    return re.sub(rf'<[a-z]+\b[^>]*\bid="{id_}"[^>]*>', f, texto, count=1)


def num_br(n):
    return f"{int(n):,}".replace(",", ".")


def mais_jogados():
    """Top 10 da Steam (SITE/data/maisjogados.json, gravado por atualizar_maisjogados.py)."""
    try:
        with open(os.path.join(SITE, "data", "maisjogados.json"), encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        return "", ""
    jogos = [g for g in d.get("games") or [] if g.get("id") and g.get("name") and g.get("players")]
    if not jogos:
        return "", ""
    maior = max(g["players"] for g in jogos)
    com_historico = any(g.get("prev") for g in jogos)  # na 1ª rodada não há com o que comparar
    m = re.match(r"^\d{4}-(\d{2})-(\d{2})$", d.get("peak_day") or "")
    dia_pico = f"{int(m.group(2))}/{int(m.group(1))}" if m else ""
    linhas = []
    for i, g in enumerate(jogos, 1):
        prev = g.get("prev")
        if not com_historico:
            mov = '<span class="stop-mv"></span>'
        elif not prev:
            mov = '<span class="stop-mv new" title="Novo no top 10">novo</span>'
        elif prev > i:
            mov = f'<span class="stop-mv up" title="Subiu {prev - i} desde a última atualização">▲{prev - i}</span>'
        elif prev < i:
            mov = f'<span class="stop-mv down" title="Caiu {i - prev} desde a última atualização">▼{i - prev}</span>'
        else:
            mov = '<span class="stop-mv same" title="Mesma posição">=</span>'
        img = g.get("img", "")
        img = (f'<img src="{e(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
               if re.match(r"^https://\S+$", img) else '<span class="stop-noimg" aria-hidden="true"></span>')
        pct = max(2, round(g["players"] / maior * 100))
        linhas.append(
            f'<li><a class="stop-row" href="https://store.steampowered.com/app/{int(g["id"])}/" target="_blank" rel="noopener noreferrer">'
            f'<span class="stop-n">{i}</span>{img}'
            f'<span class="stop-name"><b>{e(g["name"])}</b><i class="stop-bar" style="width:{pct}%"></i>'
            + (f'<small>pico em {dia_pico}: {num_br(g["peak"])}</small>' if g.get("peak") and dia_pico else "") + '</span>'
            f'<span class="stop-num"><b>{num_br(g["players"])}</b><small>jogando</small></span>{mov}</a></li>')
    quando = ""
    try:
        t = datetime.strptime(d.get("updated", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) - timedelta(hours=3)
        quando = f"Jogadores ao mesmo tempo · atualizado em {t.day}/{t.month} às {t:%H:%M} (Brasília)"
    except Exception:
        quando = "Jogadores ao mesmo tempo"
    return "".join(linhas), e(quando)


def pagina_inicial(texto, dados, trend):
    site, noticias = dados.get("site", {}), dados.get("news", [])
    nome = site.get("name") or "Nizzera Games"
    tag = site.get("tagline") or ""
    # título digitado, texto do topo e rodapé
    texto = trocar(texto, r'<h1 id="typed"[^>]*>.*?</h1>', f'<h1 id="typed" class="typed" aria-label="{e(tag)}">{e(tag)}</h1>')
    texto = trocar(texto, r'<p id="intro">.*?</p>', f'<p id="intro">{e(site.get("intro"))}</p>')
    texto = trocar(texto, r'<span id="ftxt">.*?</span>', f'<span id="ftxt">{e(site.get("footer"))}</span>')
    texto = trocar(texto, r'<strong id="fcredit">.*?</strong>', f'<strong id="fcredit">{e(site.get("credit"))}</strong>')
    texto = trocar(texto, r'<p class="by"[^>]*>', '<p class="by">' if site.get("credit") else '<p class="by" hidden>')
    texto = re.sub(r'<span class="(lbl )?sname">.*?</span>', lambda m: f'<span class="{m.group(1) or ""}sname">{e(nome)}</span>', texto)

    # destaque do topo (o 1º do carrossel de destaques)
    top = mais_relevantes(noticias, trend, 10)
    if top:
        f = top[0]
        slide = (f'<div class="slide">{arte(f, prioridade=True)}<div class="tx"><span class="tags"><span class="tag">{e(f.get("cat"))}</span>{selo(f, trend)}</span>'
                 f'<h2>{e(f.get("title"))}</h2><span class="meta">{e(data_br(f.get("date", "")))} · {int(f.get("read") or 1)} min de leitura</span></div></div>')
        texto = trocar(texto, r'<a class="feat" id="feat"[^>]*>.*?</a>',
                       f'<a class="feat" id="feat" href="/noticia/{e(f["slug"])}/" aria-label="Destaque: {e(f.get("title"))}">{slide}</a>')

    # "Em alta": os mesmos cards do carrossel, parados (o JavaScript põe a animação)
    texto = miolo(texto, "carr", ('<div class="track" style="animation:none">' + "".join(card(n, trend) for n in top) + "</div>") if top else "")
    texto = oculto(texto, "carrossel", not top)

    # assuntos do momento
    vivos = [x for x in trend if any(em_alta(n, trend) == x["name"] for n in noticias)]
    barra = ('<span class="tlabel">Assuntos do momento</span>' + "".join(
        f'<a class="tchip" href="/?assunto={e(slugify(x["name"]))}#noticias">{FLAME}{e(x["name"])}</a>' for x in vivos)) if vivos else ""
    texto = trocar(texto, r'(<div class="trendbar" id="trendbar"[^>]*>).*?</div>', f'<div class="trendbar" id="trendbar">{barra}</div>')
    texto = oculto(texto, "trendbar", not vivos)

    # mais jogados na Steam (top 10)
    lista, quando = mais_jogados()
    texto = miolo(texto, "stoplist", lista)
    texto = miolo(texto, "stopupd", quando)
    texto = oculto(texto, "maisjogados", not lista)

    # reviews (as 3 mais recentes)
    revs = sorted([r for r in dados.get("reviews", []) if r.get("game")], key=lambda r: r.get("date", ""), reverse=True)[:3]
    texto = miolo(texto, "rvgrid", "".join(rv_card(r) for r in revs))
    texto = oculto(texto, "reviews", not revs)

    # lista de notícias: a 1ª página em cards, e as demais como links simples (o JavaScript troca pela paginação)
    texto = miolo(texto, "cards", "".join(card(n, trend) for n in noticias[:POR_PAGINA]))
    resto = noticias[POR_PAGINA:]
    mais = ('<h3 class="ssr-h">Mais notícias</h3><ul class="ssr-more">' + "".join(
        f'<li><a href="/noticia/{e(n["slug"])}/">{e(n.get("title"))}</a> <span class="meta">{e(data_br(n.get("date", "")))}</span></li>' for n in resto) + "</ul>") if resto else ""
    texto = trocar(texto, r'<nav class="pager" id="pager"[^>]*>.*?</nav>',
                   f'<nav class="pager" id="pager" aria-label="Paginação das notícias"{"" if resto else " hidden"}>{mais}</nav>')
    total = len(noticias)
    texto = trocar(texto, r'<p class="pinfo meta" id="pinfo"[^>]*>.*?</p>',
                   f'<p class="pinfo meta" id="pinfo" aria-live="polite">{total} notícia{"s" if total != 1 else ""}</p>' if total else
                   '<p class="pinfo meta" id="pinfo" aria-live="polite"></p>')
    return texto


def sitemap(todas):
    hoje = datetime.now(timezone.utc).date().isoformat()
    mais_nova = max([n.get("date", "") for n in todas] + [""]) or hoje
    linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
              f"  <url><loc>{SITE_URL}/</loc><lastmod>{mais_nova}</lastmod></url>",
              f"  <url><loc>{SITE_URL}/reviews/</loc></url>",
              f"  <url><loc>{SITE_URL}/ofertas/</loc></url>",
              f"  <url><loc>{SITE_URL}/gratis/</loc></url>",
              f"  <url><loc>{SITE_URL}/comentarios/</loc></url>"]
    for n in todas:
        lm = f"<lastmod>{e(n['date'])}</lastmod>" if re.match(r"^\d{4}-\d{2}-\d{2}$", n.get("date", "")) else ""
        linhas.append(f"  <url><loc>{e(url_noticia(n))}</loc>{lm}</url>")
    for r in REVIEWS:
        lm = f"<lastmod>{e(r['date'])}</lastmod>" if re.match(r"^\d{4}-\d{2}-\d{2}$", r.get("date", "")) else ""
        linhas.append(f"  <url><loc>{SITE_URL}/review/{e(rv_slug(r))}/</loc>{lm}</url>")
    linhas.append("</urlset>")
    return "\n".join(linhas) + "\n"


def feed(todas, site):
    nome = site.get("name") or "Nizzera Games"
    itens = []
    for n in todas[:NO_FEED]:
        itens.append(
            f"  <item><title>{e(n.get('title'))}</title><link>{e(url_noticia(n))}</link>"
            f"<guid isPermaLink=\"true\">{e(url_noticia(n))}</guid><pubDate>{data_rss(n.get('date', ''))}</pubDate>"
            f"<category>{e(n.get('cat'))}</category><description>{e(n.get('sum'))}</description></item>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n'
            f"  <title>{e(nome)}</title>\n  <link>{SITE_URL}/</link>\n"
            f"  <description>{e(site.get('intro') or 'Notícias de games')}</description>\n  <language>pt-BR</language>\n"
            f'  <atom:link href="{SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>\n'
            + "\n".join(itens) + "\n</channel>\n</rss>\n")


def gravar(caminho, texto):
    """Só grava se mudou (evita commits e deploys à toa). Devolve True se gravou."""
    try:
        if open(caminho, encoding="utf-8").read() == texto:
            return False
    except FileNotFoundError:
        pass
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(texto)
    return True


def main():
    texto = open(INDEX, encoding="utf-8").read()
    m = BLOCO.search(texto)
    if not m:
        sys.exit("Bloco nz-data não encontrado em " + INDEX)
    dados = json.loads(m.group(2))
    site, noticias = dados.get("site", {}), dados.get("news", [])

    # 1) endereço fixo para cada notícia
    vistos, novos_slugs = set(), 0
    for n in noticias:
        s = n.get("slug", "")
        if not SLUG_OK.match(s or "") or s in vistos:
            s = f"{int(n.get('id') or 0)}-{slugify(n.get('title'))}"
            if s in vistos:
                s += "-" + str(len(vistos))
            n["slug"] = s
            novos_slugs += 1
        vistos.add(s)
    if novos_slugs:
        js = json.dumps(dados, ensure_ascii=False, indent=1).replace("<", "\\u003c")
        texto = texto[:m.start(2)] + js + texto[m.end(2):]
    trend = [x for x in dados.get("trend", []) if isinstance(x, dict) and x.get("terms")]
    index_mudou = gravar(INDEX, pagina_inicial(texto, dados, trend))

    # 2) páginas das notícias (mais recentes primeiro, para as "leia também")
    todas = sorted(noticias, key=lambda n: (n.get("date", ""), n.get("id", 0)), reverse=True)
    c = casca(texto, site)
    mudou = int(index_mudou) + sum(gravar(os.path.join(PASTA, n["slug"], "index.html"), pagina(n, todas, site, c, trend)) for n in todas)
    # reviews
    global REVIEWS
    REVIEWS = sorted([r for r in dados.get("reviews", []) if r.get("game")], key=lambda r: r.get("date", ""), reverse=True)
    mudou += gravar(os.path.join(SITE, "reviews", "index.html"), pagina_reviews(c, site, REVIEWS))
    rv_vivos = set()
    for r in REVIEWS:
        rv_vivos.add(rv_slug(r))
        mudou += gravar(os.path.join(PASTA_RV, rv_slug(r), "index.html"), pagina_review(r, c, site, noticias))
    if os.path.isdir(PASTA_RV):
        for nome_pasta in os.listdir(PASTA_RV):
            arq = os.path.join(PASTA_RV, nome_pasta, "index.html")
            if nome_pasta not in rv_vivos and os.path.isfile(arq) and MARCA in open(arq, encoding="utf-8").read(400):
                shutil.rmtree(os.path.join(PASTA_RV, nome_pasta))
    mudou += gravar(os.path.join(SITE, "ofertas", "index.html"), pagina_ofertas(c, site))
    mudou += gravar(os.path.join(SITE, "gratis", "index.html"), pagina_gratis(c, site))
    mudou += gravar(os.path.join(SITE, "comentarios", "index.html"), pagina_comentarios(c, site))
    mudou += gravar(os.path.join(SITE, "404.html"), pagina_404(c, site))

    # 3) apaga páginas de notícias que saíram do site (só as que este script criou)
    removidas = 0
    if os.path.isdir(PASTA):
        for nome in os.listdir(PASTA):
            arq = os.path.join(PASTA, nome, "index.html")
            if nome in vistos or not os.path.isfile(arq):
                continue
            if MARCA in open(arq, encoding="utf-8").read(400):
                shutil.rmtree(os.path.join(PASTA, nome))
                removidas += 1

    # 4) sitemap e feed
    gravar(os.path.join(SITE, "sitemap.xml"), sitemap(todas))
    gravar(os.path.join(SITE, "feed.xml"), feed(todas, site))
    print(f"{len(todas)} notícias · {mudou} páginas atualizadas · {removidas} removidas · {novos_slugs} endereços novos")


if __name__ == "__main__":
    main()
