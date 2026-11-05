#!/usr/bin/env python3
"""Gera as páginas que o Google indexa, a partir das notícias do SITE/index.html.

Cria, dentro de SITE/:
  noticia/<id>-<titulo>/index.html   uma página estática por notícia (com dados estruturados)
  ofertas/index.html                 página das ofertas da semana
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
from datetime import datetime, timezone

# ---------------- CONFIGURAÇÃO ----------------
SITE_URL = "https://nizzera-games.vercel.app"   # sem barra no final; troque se tiver domínio próprio
RELACIONADAS = 3                                # quantas "leia também" no fim de cada notícia
NO_FEED = 30                                    # quantas notícias entram no feed RSS
# ----------------------------------------------

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(RAIZ, "SITE")
INDEX = os.path.join(SITE, "index.html")
PASTA = os.path.join(SITE, "noticia")
MARCA = "<!-- gerado por scripts/gerar_paginas.py: não edite à mão -->"
BLOCO = re.compile(r'(<script id="nz-data" type="application/json">\s*)(.*?)(\s*</script>)', re.S)
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]
SLUG_OK = re.compile(r"^[a-z0-9-]{1,90}$")


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


def card(n):
    return (f'<a class="card" href="/noticia/{e(n["slug"])}/">{arte(n)}<div class="tx">'
            f'<span class="tag">{e(n.get("cat"))}</span><h3>{e(n.get("title"))}</h3>'
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
    rodape = rodape.replace('<span id="ftxt"></span>', f'<span id="ftxt">{e(site.get("footer"))}</span>')
    if site.get("credit"):
        rodape = rodape.replace('<strong id="fcredit"></strong>', f'<strong id="fcredit">{e(site["credit"])}</strong>')
    else:
        rodape = re.sub(r'<p class="by">.*?</p>', "", rodape, flags=re.S)
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


def pagina_comentarios(c, site):
    nome = site.get("name") or "Nizzera Games"
    cab = meta_pagina(f"Comentários e feedback | {nome}",
                      "Deixe sua sugestão, correção ou pedido de pauta para o Nizzera Games.",
                      SITE_URL + "/comentarios/", nome)
    corpo = f"""<main class="wrap page fb" id="feedback">
  {trilha("Comentários")}
  <h1 class="ph" id="fb-t">Comentários e feedback</h1>
  <p class="fb-intro">Gostou do site? Tem sugestão, correção ou pedido de pauta? Deixe seu comentário: ele aparece aqui para todo mundo.</p>
  <div class="fb-grid">
    <form class="fb-form" id="fb-form" novalidate>
      <label for="fb-name">Seu nome (opcional)</label>
      <input class="fb-in" id="fb-name" maxlength="40" autocomplete="nickname">
      <label for="fb-msg">Comentário</label>
      <textarea class="fb-in" id="fb-msg" maxlength="500" rows="4"></textarea>
      <div class="hp" aria-hidden="true"><label>Não preencha este campo<input id="fb-hp" tabindex="-1" autocomplete="off"></label></div>
      <div class="fb-row"><span class="fb-count" id="fb-count">0/500</span><button class="fb-btn" id="fb-send" type="submit">Enviar comentário</button></div>
      <div class="fb-status" id="fb-status" role="status"></div>
    </form>
    <div class="fb-list" id="cmlist" aria-live="polite"><p class="soon">Carregando comentários…</p></div>
  </div>
</main>"""
    return layout(c, nome, cab, corpo)


def pagina_404(c, site):
    nome = site.get("name") or "Nizzera Games"
    cab = meta_pagina(f"Página não encontrada | {nome}", "Essa página não existe.", SITE_URL + "/", nome, indexar=False)
    corpo = """<main class="wrap notfound">
  <h1>Game over: 404</h1>
  <p class="meta">Essa página não existe ou a notícia saiu do ar.</p>
  <a class="a" href="/">Voltar para as notícias</a>
</main>"""
    return layout(c, nome, cab, corpo)


def pagina(n, todas, site, c):
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

    mesma = [x for x in todas if x is not n and x.get("cat") == n.get("cat")]
    outras = [x for x in todas if x is not n and x.get("cat") != n.get("cat")]
    rel = (mesma + outras)[:RELACIONADAS]

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
    <span class="tag">{e(n.get('cat'))}</span>
    <h1>{e(titulo)}</h1>
    <p class="lead">{e(resumo)}</p>
    <p class="meta"><time datetime="{e(data)}">{e(data_br(data))}</time> · {int(n.get('read') or 1)} min de leitura{(' · Fonte: ' + e(fonte)) if fonte else ''}</p>
    <figure>{arte(n, prioridade=True)}{('<figcaption>' + ' · '.join(credito) + '</figcaption>') if credito else ''}</figure>
    <div class="body">{paragrafos(n.get('body') or resumo)}</div>
    {bloco_fonte}
    <p class="share"><span>Link desta notícia:</span> <a href="{e(url)}">{e(url)}</a></p>
  </article>
  {('<section class="related" aria-label="Leia também"><h2 class="sec">Leia também</h2><div class="cards">' + ''.join(card(x) for x in rel) + '</div></section>') if rel else ''}
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/artigo.js"></script>\n')


def sitemap(todas):
    hoje = datetime.now(timezone.utc).date().isoformat()
    mais_nova = max([n.get("date", "") for n in todas] + [""]) or hoje
    linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
              f"  <url><loc>{SITE_URL}/</loc><lastmod>{mais_nova}</lastmod></url>",
              f"  <url><loc>{SITE_URL}/ofertas/</loc></url>",
              f"  <url><loc>{SITE_URL}/comentarios/</loc></url>"]
    for n in todas:
        lm = f"<lastmod>{e(n['date'])}</lastmod>" if re.match(r"^\d{4}-\d{2}-\d{2}$", n.get("date", "")) else ""
        linhas.append(f"  <url><loc>{e(url_noticia(n))}</loc>{lm}</url>")
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
        gravar(INDEX, texto[:m.start(2)] + js + texto[m.end(2):])

    # 2) páginas das notícias (mais recentes primeiro, para as "leia também")
    todas = sorted(noticias, key=lambda n: (n.get("date", ""), n.get("id", 0)), reverse=True)
    c = casca(texto, site)
    mudou = sum(gravar(os.path.join(PASTA, n["slug"], "index.html"), pagina(n, todas, site, c)) for n in todas)
    mudou += gravar(os.path.join(SITE, "ofertas", "index.html"), pagina_ofertas(c, site))
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
