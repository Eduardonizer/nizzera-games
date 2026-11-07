#!/usr/bin/env python3
"""Gera as páginas que o Google indexa, a partir das notícias do SITE/index.html.

Cria, dentro de SITE/:
  noticia/<id>-<titulo>/index.html   uma página estática por notícia (com dados estruturados)
  reviews/index.html                 lista de reviews de jogos
  review/<id>-<jogo>/index.html      uma página por review
  ofertas/index.html                 página das ofertas da semana
  gratis/index.html                  página dos jogos grátis da semana (Epic e Steam)
  comentarios/index.html             página de comentários e feedback
  sobre/index.html                   página "Sobre" (quem faz o site e como falar com ele)
  privacidade/index.html             política de privacidade (o que o site guarda e por quê)
  tierlist/index.html                Tier List interativa (temas em data/tierlists/, ver atualizar_tierlists.py)
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
from config import SITE_URL, DOMINIOS_ANTIGOS, DISCORD_INVITE  # noqa: E402  (o domínio fica só em scripts/config.py)
RELACIONADAS = 3                                # quantas "leia também" no fim de cada notícia
NO_FEED = 30                                    # quantas notícias entram no feed RSS
STEAM_PERFIL = ""                               # endereço do seu perfil na Steam (vazio = página Sobre sem o botão)
TREND_DIAS = 21                                 # igual a TREND_DIAS de assets/js/core.js
BANNER = "/assets/og/nizzera-games.png"        # imagem dos cards de compartilhamento (1200x630; fonte em scripts/og_banner.html)
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
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/assets/icons/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/assets/icons/favicon-96.png" type="image/png" sizes="96x96">
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
    <button class="tsw" id="theme" type="button" role="switch" aria-checked="false" aria-label="Modo escuro" title="Alternar tema claro/escuro"><svg class="pad" viewBox="0 0 72 44" aria-hidden="true"><path class="pad-body" d="M20 6h32c8 0 13 5 15 13l3 13c1.5 6-2 10-7 10-3.5 0-5.5-2-7.5-5l-3-4H19.5l-3 4c-2 3-4 5-7.5 5-5 0-8.5-4-7-10l3-13C7 11 12 6 20 6z"/><path class="pad-dpad" d="M16 13h4v4h4v4h-4v4h-4v-4h-4v-4h4z"/><circle class="pad-stick" cx="28" cy="27" r="3.4"/><circle class="pad-stick" cx="44" cy="27" r="3.4"/><rect class="pad-scr" x="30" y="9" width="12" height="10" rx="2.5"/><g class="pad-sun"><circle cx="36" cy="14" r="2"/><path d="M36 10.6v.9M36 16.5v.9M32.6 14h.9M38.5 14h.9M33.6 11.6l.6.6M37.8 15.8l.6.6M33.6 16.4l.6-.6M37.8 12.2l.6-.6"/></g><path class="pad-moon" d="M38.4 15.4A3.2 3.2 0 0134.6 11a3.2 3.2 0 103.8 4.4z"/><circle class="pad-b by" cx="52" cy="14.6" r="2.5"/><circle class="pad-b bx" cx="47.4" cy="19" r="2.5"/><circle class="pad-b bb" cx="56.6" cy="19" r="2.5"/><circle class="pad-b ba" cx="52" cy="23.4" r="2.5"/></svg></button>
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


# palavras que não devem ficar soltas no fim de um título cortado
_SOLTAS = {"a", "o", "as", "os", "e", "é", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos", "que", "para", "com",
           "por", "um", "uma", "ao", "aos", "à", "às", "se", "sem", "sobre", "mais", "seu", "sua", "pelo", "pela", "ou", "mas",
           "até", "entre", "após", "como", "quando", "onde", "já", "não", "muito", "seus", "suas", "este", "esta", "num", "numa"}


def titulo_seo(titulo, nome, maximo=60):
    """Título da aba e do Google: o Google mostra ~60 caracteres. Põe o nome do site se couber;
    se o título for longo, corta numa palavra (sem deixar "de", "que"... no fim) e sem reticências."""
    titulo = re.sub(r"\s+", " ", str(titulo or "")).strip()
    if len(titulo) + len(nome) + 3 <= maximo + 5:
        return f"{titulo} | {nome}"
    if len(titulo) <= maximo + 5:
        return titulo
    palavras = titulo[:maximo + 1].split(" ")[:-1] or [titulo[:maximo]]
    while len(palavras) > 3 and (palavras[-1].lower().strip(",:;–-") in _SOLTAS or palavras[-1] in ("–", "-", "|")):
        palavras.pop()
    return " ".join(palavras).rstrip(",:;–- ")


def descricao(*textos, maximo=155):
    """Descrição do Google (~155 caracteres): junta frases inteiras; só corta com "…" se a primeira frase já for maior."""
    txt = re.sub(r"\s+", " ", " ".join(str(t or "") for t in textos if t)).strip()
    # fim de frase = pontuação + espaço + maiúscula/número ("4.1.2" e "Sr." no meio não contam)
    frases = [f for f in re.split(r"(?<=[.!?…])\s+(?=[A-ZÀ-Ú0-9\"“'])", txt) if re.search(r"[.!?…]$", f)]
    out = ""
    for f in frases:
        f = f.strip()
        if out and f in out:  # o corpo costuma repetir o resumo
            continue
        if len(out) + len(f) + 1 > maximo:
            break
        out = (out + " " + f).strip()
    if out and not out.endswith("…"):
        return out
    base = (frases[0] if frases else txt).strip().rstrip("…").strip()
    if len(base) <= maximo:
        return base
    virgula = base[:maximo].rfind(", ")  # frase longa: fecha na última vírgula, se sobrar bastante texto
    if virgula > maximo * 0.55:
        return base[:virgula] + "."
    return base[:maximo - 1].rsplit(" ", 1)[0].rstrip(",;:–- ") + "…"


def og_imagem(foto=""):
    """Imagem do card no WhatsApp, Discord, X...: a foto da matéria ou, sem foto, o banner do site (1200x630)."""
    if foto:
        return f'<meta property="og:image" content="{e(foto)}">\n<meta name="twitter:card" content="summary_large_image">'
    return (f'<meta property="og:image" content="{SITE_URL}{BANNER}">\n<meta property="og:image:width" content="1200">\n'
            f'<meta property="og:image:height" content="630">\n'
            f'<meta property="og:image:alt" content="Nizzera Games: seu lugar, a parada gamer">\n'
            f'<meta name="twitter:card" content="summary_large_image">')


def meta_pagina(titulo, desc, url, nome, tipo="website", indexar=True, og_titulo=None, foto=""):
    return f"""<title>{e(titulo)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<meta name="robots" content="{'index, follow, max-image-preview:large' if indexar else 'noindex'}">
<meta property="og:type" content="{tipo}">
<meta property="og:site_name" content="{e(nome)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="{e(og_titulo or titulo)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}">
{og_imagem(foto)}"""


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


def pagina_maisjogados(c, site):
    """Top 10 da Steam numa página própria (no menu lateral; saiu da página inicial)."""
    nome = site.get("name") or "Nizzera Games"
    lista, quando = mais_jogados()
    cab = meta_pagina(f"Mais jogados na Steam agora | {nome}",
                      "Os 10 jogos com mais gente jogando ao mesmo tempo na Steam, atualizados automaticamente todo dia.",
                      SITE_URL + "/maisjogados/", nome)
    conteudo = (f'<ol class="stop-list" id="stoplist">{lista}</ol>' if lista else
                '<p class="soon">A lista dos mais jogados não está disponível agora. Volte mais tarde.</p>')
    corpo = f"""<main class="wrap page stop" id="maisjogados">
  {trilha("Mais jogados")}
  <h1 class="ph">Mais jogados na Steam agora</h1>
  <p class="lead">Os 10 jogos com mais gente jogando ao mesmo tempo na Steam.</p>
  <p class="meta stop-upd">{quando}</p>
  {conteudo}
</main>"""
    return layout(c, nome, cab, corpo)


# ---------------- eventos (SITE/data/eventos.json, gravado por atualizar_eventos.py) ----------------
MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
COR_JOGO = {"CS2": "cs2", "Valorant": "val", "LoL": "lol", "Dota 2": "dota", "Rainbow Six": "r6", "Free Fire": "ff"}


def periodo(ini, fim):
    """'10 dez 2026' ou '24 nov – 13 dez 2026'."""
    if ini == fim:
        return f"{ini.day} {MESES_CURTOS[ini.month - 1]} {ini.year}"
    if ini.year != fim.year:
        return f"{ini.day} {MESES_CURTOS[ini.month - 1]} {ini.year} – {fim.day} {MESES_CURTOS[fim.month - 1]} {fim.year}"
    if ini.month == fim.month:
        return f"{ini.day} a {fim.day} {MESES_CURTOS[ini.month - 1]} {ini.year}"
    return f"{ini.day} {MESES_CURTOS[ini.month - 1]} – {fim.day} {MESES_CURTOS[fim.month - 1]} {fim.year}"


def ev_card(x, ini, fim, hoje):
    grupo = x.get("game") or x.get("kind") or "Evento"
    filtro = slugify(x.get("game") or "feiras")
    ao_vivo = ini <= hoje <= fim
    modo = x.get("mode", "")
    onde = " · ".join(v for v in [x.get("venue", ""), x.get("place", "")] if v)
    info = [("Quando", periodo(ini, fim) + (f" · {x['time']}" if x.get("time") else ""))]
    if onde:
        info.append(("Onde", onde))
    elif modo == "Online":
        info.append(("Onde", "Online, com transmissão ao vivo"))
    if x.get("organizer"):
        info.append(("Organização", x["organizer"]))
    if x.get("prize"):
        info.append(("Premiação", x["prize"]))
    dl = "".join(f"<div><dt>{e(k)}</dt><dd>{e(v)}</dd></div>" for k, v in info)
    link = (f'<a class="ev-more" href="{e(x["url"])}" target="_blank" rel="noopener">Mais informações{(" no " + e(x["source"])) if x.get("source") else ""} ↗</a>'
            if http(x.get("url")) else "")
    return (f'<article class="ev" data-f="{e(filtro)}" data-start="{ini.isoformat()}" data-end="{fim.isoformat()}">'
            f'<div class="ev-date" aria-hidden="true"><b>{ini.day}</b><span>{MESES_CURTOS[ini.month - 1]}</span></div>'
            f'<div class="ev-tx"><div class="ev-tags"><span class="ev-game {COR_JOGO.get(x.get("game"), "ev-other")}">{e(grupo)}</span>'
            + (f'<span class="ev-mode">{e(modo)}</span>' if modo else "")
            + (f'<span class="ev-tier">{e(x["tier"])}</span>' if x.get("tier") else "")
            + f'<span class="ev-live"{"" if ao_vivo else " hidden"}>● Ao vivo</span></div>'
            f'<h3>{e(x["name"])}</h3>'
            + (f'<p class="ev-info">{e(x["info"])}</p>' if x.get("info") else "")
            + f'<dl class="ev-dl">{dl}</dl>{link}</div></article>')


def ev_ld(x, ini, fim):
    """Dados estruturados (schema.org/Event): ajudam o Google a mostrar os eventos na busca."""
    modo = x.get("mode", "")
    lugar_real = {"@type": "Place", "name": x.get("venue") or x.get("place") or x["name"],
                  "address": x.get("place") or x.get("venue") or ""}
    virtual = {"@type": "VirtualLocation", "url": x.get("url") or SITE_URL + "/eventos/"}
    ld = {"@type": "Event", "name": x["name"], "startDate": ini.isoformat(), "endDate": fim.isoformat(),
          "eventStatus": "https://schema.org/EventScheduled",
          "eventAttendanceMode": ("https://schema.org/OnlineEventAttendanceMode" if modo == "Online" else
                                  "https://schema.org/MixedEventAttendanceMode" if modo == "Presencial e online" else
                                  "https://schema.org/OfflineEventAttendanceMode"),
          "location": virtual if modo == "Online" else [lugar_real, virtual] if modo == "Presencial e online" else lugar_real,
          "description": x.get("info") or f"{x.get('kind', 'Evento')} de {x.get('game') or 'games'}: {x['name']}."}
    if x.get("organizer"):
        ld["organizer"] = {"@type": "Organization", "name": x["organizer"]}
    if http(x.get("url")):
        ld["url"] = x["url"]
    return ld


def pagina_eventos(c, site):
    nome = site.get("name") or "Nizzera Games"
    try:
        with open(os.path.join(SITE, "data", "eventos.json"), encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        d = {}
    hoje = datetime.now(timezone(timedelta(hours=-3))).date()
    lista = []
    for x in d.get("events") or []:
        try:
            ini, fim = date.fromisoformat(x["start"]), date.fromisoformat(x.get("end") or x["start"])
        except (KeyError, ValueError):
            continue
        if fim >= hoje and x.get("name"):
            lista.append((ini, fim, x))
    lista.sort(key=lambda t: (t[0], t[1], t[2]["name"]))
    agora = [t for t in lista if t[0] <= hoje]
    depois = [t for t in lista if t[0] > hoje]

    # filtros: os jogos que aparecem + feiras e premiações
    jogos = []
    for _, _, x in lista:
        g = x.get("game") or ""
        if g and g not in jogos:
            jogos.append(g)
    tem_feiras = any(not x.get("game") for _, _, x in lista)
    chips = '<button class="chip" type="button" data-evf="" aria-pressed="true">Todos</button>' + "".join(
        f'<button class="chip" type="button" data-evf="{e(slugify(g))}" aria-pressed="false">{e(g)}</button>' for g in jogos)
    if tem_feiras:
        chips += '<button class="chip" type="button" data-evf="feiras" aria-pressed="false">Feiras e premiações</button>'

    blocos = []
    if agora:
        blocos.append('<section class="ev-sec" aria-labelledby="ev-now"><h2 class="ev-h" id="ev-now"><span class="ev-dot"></span>Acontecendo agora</h2>'
                      '<div class="ev-list">' + "".join(ev_card(x, i, f, hoje) for i, f, x in agora) + "</div></section>")
    mes_atual, cards = None, []
    for i, f, x in depois:
        chave = (i.year, i.month)
        if chave != mes_atual:
            if cards:
                blocos.append(cards_html(mes_atual, cards))
            mes_atual, cards = chave, []
        cards.append(ev_card(x, i, f, hoje))
    if cards:
        blocos.append(cards_html(mes_atual, cards))
    corpo_lista = "".join(blocos) if blocos else '<p class="soon">Nenhum evento encontrado agora. A lista é atualizada todo dia.</p>'

    quando = ""
    try:
        t = datetime.strptime(d.get("updated", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) - timedelta(hours=3)
        quando = f"Atualizado em {t.day}/{t.month} às {t:%H:%M} (Brasília)."
    except Exception:
        pass
    ld = {"@context": "https://schema.org", "@graph": [ev_ld(x, i, f) for i, f, x in lista[:40]]}
    cab = meta_pagina(f"Eventos de games: campeonatos, feiras e premiações | {nome}",
                      "Calendário de eventos de games: campeonatos de CS2, Valorant, LoL, Dota 2, Rainbow Six e Free Fire, "
                      "feiras e premiações como The Game Awards, presenciais e online, em ordem de data.",
                      SITE_URL + "/eventos/", nome) + (f'\n<script type="application/ld+json">{json_ld(ld)}</script>' if lista else "")
    corpo = f"""<main class="wrap page evp">
  {trilha("Eventos")}
  <h1 class="ph">Eventos de games</h1>
  <p class="lead">Campeonatos de esports, feiras e premiações pelo mundo, presenciais e online, em ordem de data. Atualizado todo dia.</p>
  <div class="tools ev-tools" role="group" aria-label="Filtrar eventos">{chips}</div>
  <div id="evlist">{corpo_lista}</div>
  <p class="ev-empty" id="evempty" hidden>Nenhum evento desse tipo agora.</p>
  <p class="meta ev-src">{e(quando)} Campeonatos: dados do <a href="https://liquipedia.net/" target="_blank" rel="noopener">Liquipedia</a> (CC BY-SA). Datas e locais podem mudar: confira no link de cada evento.</p>
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/eventos.js"></script>\n')


def cards_html(mes, cards):
    ano, m = mes
    titulo = f"{MESES[m - 1].capitalize()} de {ano}"
    return f'<section class="ev-sec"><h2 class="ev-h">{e(titulo)}</h2><div class="ev-list">{"".join(cards)}</div></section>'


# ---------------- comunidade do Discord ----------------
DISCORD_SVG = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 4.4A19.6 19.6 0 0015.4 3l-.6 1.3a18.2 18.2 0 00-5.6 0L8.6 3'
               'a19.5 19.5 0 00-4.9 1.4C.6 9 0 13.6.3 18.1a19.8 19.8 0 006 3l1.3-2a12.8 12.8 0 01-2-1l.5-.4a14 14 0 0012 0l.5.4'
               'a12.8 12.8 0 01-2 1l1.3 2a19.7 19.7 0 006-3c.4-5.2-.7-9.8-3.6-13.7zM8.5 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4'
               ' 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm7 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>')
CANAIS_DISCORD = [  # (canal, emoji, o que chega lá) — os mesmos canais que recebem os posts automáticos
    ("todas-as-notícias", "📰", "Todas as notícias do site, assim que saem."),
    ("lançamentos", "🚀", "Jogos novos, datas e trailers."),
    ("steam", "🖥️", "Novidades da Steam e do PC."),
    ("playstation", "🎮", "Tudo de PS5 e PlayStation Plus."),
    ("xbox", "🟢", "Novidades do Xbox e do PC da Microsoft."),
    ("nintendo", "🍄", "Switch 2, Zelda, Mario e companhia."),
    ("game-pass", "🎟️", "O que entra e o que sai do Game Pass."),
    ("serviços", "☁️", "Assinaturas e jogos na nuvem."),
    ("esports", "🏆", "CS2, Valorant, LoL e mais campeonatos."),
    ("eventos", "📅", "Feiras, premiações e o calendário de eventos."),
    ("reviews", "⭐", "As reviews do site, com a nota."),
    ("ofertas-da-semana", "🔥", "As melhores promoções da semana."),
    ("jogos-grátis", "🎁", "Jogos grátis para resgatar na Epic e na Steam."),
    ("novidades-do-site", "✨", "Recursos novos do Nizzera Games."),
]


def botao_discord(classe=""):
    if http(DISCORD_INVITE):
        return (f'<a class="dc-btn {classe}" href="{e(DISCORD_INVITE)}" target="_blank" rel="noopener">'
                f'{DISCORD_SVG}<span>Entrar no servidor</span></a>')
    return f'<span class="dc-btn off {classe}" aria-disabled="true">{DISCORD_SVG}<span>Convite chegando em breve</span></span>'


def pagina_comunidade(c, site):
    nome = site.get("name") or "Nizzera Games"
    cab = meta_pagina(f"Comunidade no Discord | {nome}",
                      f"Entre no servidor do {nome} no Discord: notícias, ofertas, jogos grátis, eventos e reviews chegando "
                      "na hora, em canais separados por plataforma, e papo com outros gamers.",
                      SITE_URL + "/comunidade/", nome)
    canais = "".join(f'<li class="dc-ch"><span class="dc-emo" aria-hidden="true">{emo}</span><div><b># {e(n)}</b>'
                     f'<span>{e(t)}</span></div></li>' for n, emo, t in CANAIS_DISCORD)
    corpo = f"""<main class="wrap page dcp">
  {trilha("Comunidade")}
  <section class="dc-hero" aria-labelledby="dc-t">
    <div class="dc-hero-tx">
      <span class="dc-kicker">{DISCORD_SVG}Servidor no Discord</span>
      <h1 class="ph" id="dc-t">A comunidade do {e(nome)}</h1>
      <p class="lead">O nosso cantinho no Discord: tudo o que sai no site chega lá na hora, em canais separados por plataforma.
      E, claro, espaço para trocar ideia com outros gamers, chamar a galera pra jogar e dar pitaco nas notícias.</p>
      <div class="dc-cta">{botao_discord("big")}<a class="dc-sec" href="#dc-canais">Ver os canais ↓</a></div>
      <p class="dc-count" id="dccount" aria-live="polite" hidden><span class="dc-on" aria-hidden="true"></span><span id="dccount-t"></span></p>
    </div>
    <div class="dc-art" aria-hidden="true">
      <div class="dc-msg"><span class="dc-av"></span><div><b>Nizzera Games <i>BOT</i></b><p>📰 Saiu notícia nova no site!</p><span class="dc-card"></span></div></div>
      <div class="dc-msg"><span class="dc-av u1"></span><div><b>gamer_br</b><p>bora uma partida hoje? 🎮</p></div></div>
      <div class="dc-msg"><span class="dc-av u2"></span><div><b>steamzeira</b><p>essa oferta tá muito boa 🔥</p></div></div>
    </div>
  </section>

  <section class="dc-sec-b" aria-labelledby="dc-como">
    <h2 class="sec" id="dc-como">Por que entrar</h2>
    <ul class="dc-why">
      <li><b>⚡ Na hora</b><span>Notícia, review, oferta e jogo grátis chegam no Discord assim que aparecem no site.</span></li>
      <li><b>🎯 Só o que você curte</b><span>Canais por plataforma: silencie o que não te interessa e fique só com a sua.</span></li>
      <li><b>💬 Papo de gamer</b><span>Comente as notícias, ache gente pra jogar e sugira pautas pro site.</span></li>
    </ul>
  </section>

  <section class="dc-sec-b" id="dc-canais" aria-labelledby="dc-ch-t">
    <h2 class="sec" id="dc-ch-t">Canais com posts automáticos do site</h2>
    <ul class="dc-chs">{canais}</ul>
  </section>

  <section class="dc-end">
    <h2>Bora pro servidor?</h2>
    <p>É de graça e leva um clique: você cai direto no <b>#boas-vindas</b>. Se ainda não tem Discord, dá pra usar no navegador, no PC ou no celular.</p>
    {botao_discord("big")}
  </section>
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/discord.js"></script>\n')


# ---------------- GTA VI: galeria oficial (SITE/data/gta6.json, gravado por atualizar_gta6.py) ----------------
# As fotos vêm direto do servidor da Rockstar, no tamanho pedido (imwidth): nada pesa no nosso servidor.
GTA6_RESUMO = ("A Rockstar publicou em 5 de novembro uma nova leva de 38 screenshots de GTA VI, a duas semanas do "
               "lançamento, marcado para 19 de novembro no PS5 e no Xbox Series X|S. As imagens mostram Jason e Lucia, "
               "Vice City e outras regiões de Leonida, e quem olhou com calma achou detalhes como iguanas pelas ruas, "
               "cenários debaixo d'água e referências a pontes abandonadas da vida real.")
GTA6_NOVA_DIAS = 14
GTA6_DESTAQUES = ["Jason and Lucia", "Vice City", "Lucia Caminos", "Jason Duval", "Leonida Keys", "Grassrivers",
                  "Port Gellhorn", "Mount Kalaga National Park"]
GRUPOS_GTA6 = ["Jogo", "Ultimate Edition", "Vintage Vice City"]


def gta6_dados():
    try:
        with open(os.path.join(SITE, "data", "gta6.json"), encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        return []
    return [x for x in d.get("images", []) if re.match(r"^https://www\.rockstargames\.com/\S+$", x.get("src", ""))]


def g6_img(x, w=480):
    return f"{x['src']}?akim=1&imdensity=1&imwidth={w}"


def g6_alt(x):
    return f"GTA VI: {x['tag']}" + (f" ({x['group']})" if x["group"] != "Jogo" else "")


def g6_nova(x):
    try:
        return (date.today() - date.fromisoformat(x.get("first") or "")).days <= GTA6_NOVA_DIAS
    except ValueError:
        return False


def g6_thumb(x, i, grande=False, link="", ident=""):
    """Miniatura. Na galeria abre a foto grande (o galeria.js mostra em tela cheia); na inicial, link = /gta6/#foto-N."""
    w = 960 if grande else 480
    srcset = ", ".join(f"{g6_img(x, v)} {v}w" for v in ((480, 960, 1280) if grande else (320, 480, 720)))
    sizes = "(max-width:700px) 100vw, 50vw" if grande else "(max-width:560px) 50vw, (max-width:1000px) 33vw, 240px"
    alvo = f'href="{e(link)}"' if link else f'href="{e(g6_img(x, 1920))}" target="_blank" rel="noopener"'
    return (f'<a{(" id=" + chr(34) + ident + chr(34)) if ident else ""} class="g6-t{" big" if grande else ""}" {alvo} data-i="{i}" '
            f'data-full="{e(g6_img(x, 1920))}" data-orig="{e(x["src"])}" data-tag="{e(x["tag"])}">'
            f'<img src="{e(g6_img(x, w))}" srcset="{e(srcset)}" sizes="{sizes}" alt="{e(g6_alt(x))}" width="16" height="9" '
            f'loading="lazy" decoding="async" referrerpolicy="no-referrer">'
            + ('<span class="g6-new">Nova</span>' if g6_nova(x) else "") + "</a>")


def g6_numeros(fotos):
    cont = {g: sum(1 for x in fotos if x["group"] == g) for g in GRUPOS_GTA6}
    partes = [f"<b>{len(fotos)}</b> imagens oficiais"] + [f"{n} {'do jogo' if g == 'Jogo' else g}" for g, n in cont.items() if n]
    return " · ".join(partes)


def gta6_home(fotos):
    """Seção da página inicial (abaixo das reviews): resumo + 9 fotos (1 grande + 8, fecha a grade de 4) + link para a galeria."""
    if not fotos:
        return ""
    escolhidas, vistos = [], set()
    for tag in GTA6_DESTAQUES:  # uma foto de cada personagem/lugar, para variar
        for i, x in enumerate(fotos):
            if x["tag"] == tag and tag not in vistos:
                escolhidas.append((i, x)); vistos.add(tag); break
    for i, x in enumerate(fotos):
        if len(escolhidas) >= 9:
            break
        if (i, x) not in escolhidas and x["group"] == "Jogo":
            escolhidas.append((i, x))
    mosaico = "".join(g6_thumb(x, i, grande=(k == 0), link=f"/gta6/#foto-{i}") for k, (i, x) in enumerate(escolhidas[:9]))
    return (f'<div class="g6-box"><div class="g6-head"><span class="g6-kicker">Atualização da Rockstar</span>'
            f'<h2 class="g6-title" id="g6h-t">GTA VI: as novas imagens oficiais</h2>'
            f'<p class="g6-sum">{e(GTA6_RESUMO)}</p><p class="g6-nums">{g6_numeros(fotos)} · Lançamento em <b>19 de novembro</b></p>'
            f'<a class="g6-cta" href="/gta6/">Ver todas as {len(fotos)} imagens →</a></div>'
            f'<div class="g6-mosaic">{mosaico}</div>'
            f'<p class="g6-credit">Imagens: <a href="https://www.rockstargames.com/VI/media/screenshots" target="_blank" rel="noopener">Rockstar Games</a></p></div>')


def pagina_gta6(c, site, noticias):
    nome = site.get("name") or "Nizzera Games"
    fotos = gta6_dados()
    url = SITE_URL + "/gta6/"
    capa = g6_img(fotos[0], 1280) if fotos else ""
    cab = meta_pagina(f"GTA VI: todas as imagens oficiais da Rockstar | {nome}",
                      f"Galeria com as {len(fotos)} imagens oficiais de GTA VI: Jason, Lucia, Vice City, Leonida, "
                      "Ultimate Edition e Vintage Vice City, com resumo das novidades.", url, nome, foto=capa)
    # notícias do site sobre as imagens
    rel = [n for n in noticias if re.search(r"gta ?(6|vi)|grand theft auto", (n.get("title", "") + " " + n.get("sum", "")).lower())
           and re.search(r"imagens|screenshots|capturas", (n.get("title", "") + " " + n.get("sum", "")).lower())][:3]
    chips = (f'<button class="chip" type="button" data-g6f="" aria-pressed="true">Todas ({len(fotos)})</button>'
             + "".join(f'<button class="chip" type="button" data-g6f="{e(slugify(g))}" aria-pressed="false">'
                       f'{e("Do jogo" if g == "Jogo" else g)} ({sum(1 for x in fotos if x["group"] == g)})</button>'
                       for g in GRUPOS_GTA6 if any(x["group"] == g for x in fotos)))
    blocos = []
    for g in GRUPOS_GTA6:
        do_grupo = [(i, x) for i, x in enumerate(fotos) if x["group"] == g]
        if not do_grupo:
            continue
        tags = []
        for _, x in do_grupo:
            if x["tag"] not in tags:
                tags.append(x["tag"])
        partes = []
        for t in tags:
            itens = [(i, x) for i, x in do_grupo if x["tag"] == t]
            partes.append(f'<div class="g6-tag"><h3>{e(t)} <small>{len(itens)}</small></h3><div class="g6-grid">'
                          + "".join(g6_thumb(x, i, ident=f"foto-{i}") for i, x in itens)
                          + "</div></div>")
        blocos.append(f'<section class="g6-group" data-g6="{e(slugify(g))}"><h2 class="sec">{e("Imagens do jogo" if g == "Jogo" else g)}</h2>{"".join(partes)}</section>')
    galeria = "".join(blocos) if blocos else '<p class="soon">A galeria não está disponível agora. Volte mais tarde.</p>'
    leia = ('<section class="g6-news"><h2 class="sec">Leia no site</h2><div class="cards">' + "".join(card(n) for n in rel) + "</div></section>") if rel else ""
    corpo = f"""<main class="wrap page g6p">
  {trilha("GTA VI: imagens")}
  <span class="g6-kicker">Atualização da Rockstar</span>
  <h1 class="ph">GTA VI: todas as imagens oficiais</h1>
  <p class="lead">{e(GTA6_RESUMO)} A galeria oficial reúne agora {len(fotos)} imagens, incluindo as da Ultimate Edition e do pacote Vintage Vice City. Clique em qualquer foto para ver em tela cheia.</p>
  <p class="g6-nums">{g6_numeros(fotos) if fotos else ""}</p>
  <div class="tools g6-tools" role="group" aria-label="Filtrar imagens">{chips if fotos else ""}</div>
  {galeria}
  {leia}
  <p class="meta g6-src">Imagens oficiais © Rockstar Games, exibidas direto do <a href="https://www.rockstargames.com/VI/media/screenshots" target="_blank" rel="noopener">site oficial de GTA VI</a>. O {e(nome)} não tem ligação com a Rockstar Games.</p>
</main>
<div class="g6-lb" id="g6lb" role="dialog" aria-modal="true" aria-label="Imagem em tela cheia" hidden>
  <button class="g6-x" type="button" data-lb="close" aria-label="Fechar">✕</button>
  <button class="g6-nav prev" type="button" data-lb="prev" aria-label="Imagem anterior">‹</button>
  <figure><img alt="" referrerpolicy="no-referrer"><figcaption><span class="g6-cap"></span><a class="g6-orig" target="_blank" rel="noopener">Abrir em alta resolução ↗</a></figcaption></figure>
  <button class="g6-nav next" type="button" data-lb="next" aria-label="Próxima imagem">›</button>
</div>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/galeria.js"></script>\n')


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
      <nav class="cm-pager" id="cm-pager" aria-label="Páginas dos comentários" hidden></nav>
    </section>
  </div>
</main>"""
    return layout(c, nome, cab, corpo)

def pagina_sobre(c, site):
    nome = site.get("name") or "Nizzera Games"
    autor = site.get("credit") or "Eduardo Nizer"
    email = "nizzeragames@gmail.com"
    desc = ("Notícias que importam, promoções que valem a pena, jogos grátis da semana e análises sinceras, "
            "num só lugar. Conheça o Nizzera Games.")
    url = SITE_URL + "/sobre/"
    ld = {"@context": "https://schema.org", "@type": "AboutPage", "url": url, "name": f"Sobre o {nome}",
          "description": desc, "inLanguage": "pt-BR",
          "about": {"@type": "Organization", "name": nome, "url": SITE_URL + "/", "email": email,
                    "founder": {"@type": "Person", "name": autor, "homeLocation": "Curitiba, PR"}}}
    cab = meta_pagina(f"Sobre o {nome}", desc, url, nome) + \
        f'\n<script type="application/ld+json">{json_ld(ld)}</script>'
    steam = http(STEAM_PERFIL)
    botao_steam = (f'<a class="sb-btn alt" href="{e(steam)}" target="_blank" rel="noopener">Ver meu perfil na Steam</a>'
                   if steam else "")
    corpo = f"""<main class="wrap page sobre">
  {trilha("Sobre")}
  <header class="sb-head">
    <h1 class="ph">Sobre o {e(nome)}</h1>
    <p class="lead">Aqui é a sua parada gamer.</p>
  </header>

  <section class="sb-sec" aria-label="O que é o {e(nome)}">
    <p>O {e(nome)} nasceu com uma ideia simples: juntar num só lugar tudo o que um gamer de hoje precisa pra ficar por dentro. As notícias que importam, as promoções que valem a pena, os jogos grátis da semana e análises sinceras de quem joga de verdade.</p>
    <ul class="sb-tiles">
      <li><a href="/#noticias"><b>Notícias</b><span>O que importa, sem enrolação</span></a></li>
      <li><a href="/ofertas/"><b>Promoções</b><span>Descontos que valem a pena</span></a></li>
      <li><a href="/gratis/"><b>Jogos grátis</b><span>O que dá pra pegar de graça</span></a></li>
      <li><a href="/reviews/"><b>Análises</b><span>Sinceras, de quem joga</span></a></li>
    </ul>
    <p>Nada de enrolação nem de texto gigante pra dizer pouca coisa. A ideia é você chegar, se atualizar e voltar pro jogo.</p>
  </section>

  <section class="sb-sec sb-card" aria-labelledby="sb-quem">
    <div class="sb-av" aria-hidden="true">EN</div>
    <div>
      <h2 id="sb-quem">Quem tá por trás</h2>
      <p>Prazer, eu sou o {e(autor)}, de Curitiba. Sou apaixonado por games e tecnologia desde sempre, daqueles que passam mais tempo lendo sobre jogo do que deveriam (e jogando mais ainda).</p>
      <p>Criei o {e(nome)} pra ser o site que eu mesmo gostaria de visitar todo dia. Ele foi feito do zero por mim, e cada parte dele vai crescendo junto com a comunidade.</p>
      <p>Também escrevo análises na Steam. Se quiser conferir o que ando jogando, é só dar uma passada no meu perfil.</p>
      {botao_steam}
    </div>
  </section>

  <section class="sb-sec sb-card sb-talk" aria-labelledby="sb-fala">
    <div>
      <h2 id="sb-fala">Fala comigo</h2>
      <p>Tem sugestão, achou algum erro ou quer só trocar uma ideia sobre games? Manda um <a href="/comentarios/">comentário aqui no site</a> ou um e-mail pra <a href="mailto:{email}">{email}</a>. Eu leio tudo.</p>
      <div class="sb-acts">
        <a class="sb-btn" href="/comentarios/">Deixar um comentário</a>
        <a class="sb-btn alt" href="mailto:{email}">Mandar um e-mail</a>
      </div>
    </div>
  </section>

  <p class="sb-end">Bem-vindo ao seu novo save point. <span aria-hidden="true">🎮</span></p>
</main>"""
    return layout(c, nome, cab, corpo)


def pagina_privacidade(c, site):
    nome = site.get("name") or "Nizzera Games"
    email = "nizzeragames@gmail.com"
    atualizada = "6 de novembro de 2026"
    desc = ("O que o Nizzera Games guarda quando você comenta, curte, vota ou manda mensagem, por quanto tempo, "
            "com quem divide e como pedir para apagar.")
    cab = meta_pagina(f"Política de privacidade | {nome}", desc, SITE_URL + "/privacidade/", nome)
    corpo = f"""<main class="wrap page sobre priv">
  {trilha("Política de privacidade")}
  <header class="sb-head">
    <h1 class="ph">Política de privacidade</h1>
    <p class="lead">Sem letra miúda: o que o {e(nome)} guarda, por quê e como você pede para apagar.</p>
    <p class="meta">Atualizada em {atualizada}.</p>
  </header>

  <section class="sb-sec sb-card sb-talk" aria-labelledby="pv-resumo">
    <div>
      <h2 id="pv-resumo">Resumo</h2>
      <ul>
        <li>Para ler o site você não precisa de cadastro, e não usamos cookies de propaganda nem de rastreamento.</li>
        <li>Guardamos só o que você mesmo manda (comentário, mensagem) e o mínimo para contar curtidas e votos sem repetição.</li>
        <li>Não vendemos nem repassamos seus dados para ninguém.</li>
        <li>Quer que algo seja apagado? Escreva para <a href="mailto:{email}">{email}</a>.</li>
      </ul>
    </div>
  </section>

  <section class="sb-sec" aria-labelledby="pv-quem">
    <h2 id="pv-quem">Quem cuida dos seus dados</h2>
    <p>O {e(nome)} é mantido por {e(site.get("credit") or "Eduardo Nizer")}, de Curitiba (PR), que é o responsável pelos dados tratados no site, nos termos da Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018). Contato: <a href="mailto:{email}">{email}</a>.</p>
  </section>

  <section class="sb-sec" aria-labelledby="pv-o-que">
    <h2 id="pv-o-que">O que o site guarda e por quê</h2>
    <h3>Comentários</h3>
    <p>Quando você comenta, guardamos o nome que você escolher (é opcional), o texto e a data e hora. O comentário fica <b>público</b> para todo mundo, na página de comentários ou embaixo da notícia ou review. Ele continua no site até ser removido pela moderação ou a seu pedido (o site guarda no máximo os 2.000 comentários mais recentes). Não pedimos e-mail nem login para comentar.</p>
    <h3>Curtidas e votações</h3>
    <p>Para cada pessoa curtir uma notícia ou votar uma vez só, o servidor guarda um <b>código curto calculado a partir do seu endereço IP</b> (o IP em si não é guardado). Esse código vale 60 dias nas curtidas e até 13 meses nas votações; depois disso, é apagado sozinho. Os números que aparecem no site (quantas curtidas, porcentagem dos votos) não identificam ninguém.</p>
    <h3>Proteção contra spam</h3>
    <p>O mesmo tipo de código é usado por 10 minutos para limitar quantos comentários, votos ou mensagens saem da mesma conexão em pouco tempo.</p>
    <h3>Mensagens do “Fale com a gente”</h3>
    <p>O nome, o e-mail (opcional, só se você quiser resposta) e o texto são enviados para o e-mail {email}. No painel do administrador fica um aviso com o nome e o começo da mensagem, entre as 500 notificações mais recentes. Usamos esses dados só para ler e responder você.</p>
    <h3>Estatísticas de visita</h3>
    <p>Usamos o Vercel Web Analytics para saber quantas pessoas visitam cada página. Ele conta as visitas de forma agregada, <b>sem cookies</b> e sem identificar você.</p>
    <h3>Registros técnicos</h3>
    <p>Como qualquer site, o servidor da hospedagem recebe o seu endereço IP e dados do navegador para entregar as páginas e se proteger de ataques. Esses registros são da hospedagem (Vercel) e não são usados para identificar visitantes.</p>
  </section>

  <section class="sb-sec" aria-labelledby="pv-local">
    <h2 id="pv-local">O que fica só no seu navegador</h2>
    <p>Algumas preferências ficam guardadas no seu próprio aparelho (no armazenamento local do navegador) e <b>não são enviadas</b> para o site: o tema claro ou escuro, o menu recolhido e as tier lists que você montou. Para apagar, limpe os dados do site nas configurações do navegador.</p>
    <p>O único cookie do site é o do login do painel de administração, usado só pelo administrador.</p>
  </section>

  <section class="sb-sec" aria-labelledby="pv-terceiros">
    <h2 id="pv-terceiros">Serviços que ajudam a fazer o site funcionar</h2>
    <ul>
      <li><b>Vercel</b>: hospedagem do site e estatísticas de visita.</li>
      <li><b>Upstash</b>: banco de dados dos comentários, curtidas, votos e notificações.</li>
      <li><b>Resend</b>: envio das mensagens do “Fale com a gente” para o nosso e-mail.</li>
      <li><b>Google Fonts</b>: as fontes do site são baixadas dos servidores do Google pelo seu navegador.</li>
      <li><b>Sites das fontes das notícias e Steam</b>: algumas imagens são carregadas direto dos sites de origem.</li>
    </ul>
    <p>Esses serviços podem ter servidores fora do Brasil. Eles recebem só o necessário para fazer a sua parte e têm as próprias políticas de privacidade. Os links para outros sites (como a matéria original de uma notícia) levam para páginas que não controlamos.</p>
    <p>Hoje o site não exibe anúncios. Se um dia passar a exibir (por exemplo, com o Google AdSense), esta página será atualizada antes.</p>
  </section>

  <section class="sb-sec" aria-labelledby="pv-direitos">
    <h2 id="pv-direitos">Seus direitos</h2>
    <p>Pela LGPD, você pode pedir para saber quais dados seus temos, corrigir ou apagar esses dados, e tirar dúvidas sobre como eles são usados. É só escrever para <a href="mailto:{email}">{email}</a>. Como os comentários não têm login, para apagar um comentário seu diga o nome usado, onde ele está e mais ou menos quando foi feito. Respondemos o quanto antes, em até 15 dias.</p>
  </section>

  <section class="sb-sec" aria-labelledby="pv-mudancas">
    <h2 id="pv-mudancas">Mudanças nesta política</h2>
    <p>Se o site passar a guardar algo novo, esta página muda antes, e a data no topo é atualizada.</p>
  </section>
</main>"""
    return layout(c, nome, cab, corpo)


def temas_tierlist():
    """Lista de temas gerada por scripts/atualizar_tierlists.py (vazia se ainda não rodou)."""
    try:
        with open(os.path.join(SITE, "data", "tierlists", "index.json"), encoding="utf-8") as f:
            temas = json.load(f).get("themes") or []
    except Exception:
        return []
    return [t for t in temas if isinstance(t, dict) and SLUG_OK.match(str(t.get("slug") or ""))]


def card_tema(t):
    """Card de um tema no seletor (o assets/js/tierlist.js desenha igual, a partir do mesmo index.json)."""
    capas = "".join(f'<img src="{e(c)}" alt="" loading="lazy" decoding="async">'
                    for c in (t.get("covers") or [])[:4] if str(c).startswith("/assets/tierlist/"))
    n = int(t.get("count") or 0)
    return (f'<a class="tl-theme" href="/tierlist/?tema={e(t["slug"])}" data-theme-slug="{e(t["slug"])}">'
            f'<span class="tl-cov" aria-hidden="true">{capas}</span><span class="tl-ttx"><b>{e(t.get("title"))}</b>'
            f'<span>{e(t.get("description"))}</span><small>{n} jogo{"s" if n != 1 else ""}</small></span></a>')


def pagina_tierlist(c, site):
    nome = site.get("name") or "Nizzera Games"
    desc = ("Monte sua tier list de jogos: arraste as capas para as faixas S, A, B, C e D, "
            "no PC ou no celular, e compartilhe a imagem com os amigos.")
    cab = meta_pagina(f"Tier List de jogos: monte e compartilhe | {nome}", desc, SITE_URL + "/tierlist/", nome,
                      og_titulo=f"Monte sua Tier List de jogos | {nome}")
    temas = "".join(card_tema(t) for t in temas_tierlist()) or '<p class="soon">Carregando temas…</p>'
    corpo = f"""<main class="wrap page tl" id="tierlist">
  {trilha("Tier List")}
  <h1 class="ph">Tier List</h1>
  <p class="lead">Escolha um tema, arraste os jogos para as faixas e compartilhe a sua com os amigos.</p>

  <section class="tl-pick" id="tl-pick" aria-labelledby="tl-pick-t">
    <h2 class="sec" id="tl-pick-t">Escolha um tema</h2>
    <div class="tl-themes" id="tl-themes">{temas}</div>
  </section>

  <section class="tl-board" id="tl-board" aria-labelledby="tl-title" hidden>
    <div class="tl-bar">
      <h2 class="sec" id="tl-title" tabindex="-1"></h2>
      <div class="tl-acts">
        <button class="tl-btn ghost" type="button" id="tl-change">Trocar tema</button>
        <button class="tl-btn ghost" type="button" id="tl-reset">Recomeçar</button>
        <button class="tl-btn" type="button" id="tl-share">Baixar / Compartilhar imagem</button>
      </div>
    </div>
    <p class="tl-hint" id="tl-hint">Arraste as capas para as faixas. No celular, segure a capa um instante e arraste, ou toque na capa e depois na faixa.</p>
    <div class="tl-rows" id="tl-rows"></div>
    <div class="tl-poolbox">
      <h3>Jogos para colocar</h3>
      <div class="tl-drop tl-pool" id="tl-pool" data-tier="pool" role="list" aria-label="Jogos ainda não colocados"></div>
    </div>
    <p class="tl-status" id="tl-status" role="status" aria-live="polite"></p>
  </section>
  <noscript><p class="empty">A Tier List precisa de JavaScript para funcionar.</p></noscript>
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/tierlist.js"></script>\n')


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
    cab = meta_pagina(f"Review: {jogo} | {nome}", desc, url, nome, tipo="article", foto=foto) + f"""
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
    <p class="likes"><button class="like" id="like" type="button" aria-pressed="false" data-post="review-{e(rv_slug(r))}" data-what="esta review" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span class="like-t">Curtir</span><b id="like-n"></b></button></p>
  </article>
  {comentarios_bloco("review-" + rv_slug(r), "Review: " + jogo, "O que você achou de " + jogo + "? Concorda com a nota?")}
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
    opiniao = str(n.get("take") or "").strip()
    desc = descricao(resumo, n.get("body"))
    foto = http(n.get("img", ""))
    data = n.get("date", "")
    # data com hora e fuso (o robô grava "pub"; notícias antigas ou do painel ficam às 9h de Brasília)
    publicado = n.get("pub") if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", str(n.get("pub") or "")) else (f"{data}T09:00:00-03:00" if data else "")
    fonte, link_fonte = n.get("src", ""), http(n.get("url", ""))
    # matérias dos rascunhos com IA trazem todas as fontes usadas (painel admin, aba Rascunhos)
    fontes = [(str(x.get("name") or "").strip(), http(x.get("url", ""))) for x in (n.get("sources") or []) if isinstance(x, dict)]
    fontes = [(nm, u) for nm, u in fontes if nm and u]
    tags = [str(t).strip() for t in (n.get("tags") or []) if str(t).strip()]

    ld_artigo = {
        "@context": "https://schema.org", "@type": "NewsArticle",
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "url": url, "headline": titulo[:110], "description": desc, "inLanguage": "pt-BR",
        "articleSection": n.get("cat", ""), "isAccessibleForFree": True,
        "author": {"@type": "Organization", "name": nome, "url": SITE_URL + "/"},
        "publisher": {"@type": "Organization", "name": nome, "url": SITE_URL + "/",
                      "logo": {"@type": "ImageObject", "url": SITE_URL + "/assets/icons/icon-192.png",
                               "width": 192, "height": 192}},
    }
    if publicado:
        ld_artigo["datePublished"] = ld_artigo["dateModified"] = publicado
    if foto:
        ld_artigo["image"] = [foto]
        ld_artigo["thumbnailUrl"] = foto
    if opiniao:  # o texto próprio do site, que o Google valoriza
        ld_artigo["abstract"] = opiniao
    if fontes:
        ld_artigo["isBasedOn"] = [u for _, u in fontes]
    elif link_fonte:
        ld_artigo["isBasedOn"] = link_fonte
    if tags:
        ld_artigo["keywords"] = ", ".join(tags)
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
    bloco_fonte = (f'<p class="src">Leia a matéria completa em <a href="{e(link_fonte)}" target="_blank" rel="noopener">{e(fonte or link_fonte)}</a>.</p>'
                   if link_fonte else "")
    if fontes:
        bloco_fonte = ('<p class="src"><b>Fontes:</b> ' + ", ".join(
            f'<a href="{e(u)}" target="_blank" rel="noopener">{e(nm)}</a>' for nm, u in fontes) + '.</p>')
    nomes_fonte = ", ".join(nm for nm, _ in fontes) if fontes else fonte

    cab = meta_pagina(titulo_seo(titulo, nome), desc, url, nome, tipo="article", og_titulo=titulo, foto=foto) + f"""
<meta property="article:published_time" content="{e(publicado)}">
<meta property="article:modified_time" content="{e(publicado)}">
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
    <p class="meta"><time datetime="{e(data)}">{e(data_br(data))}</time> · {int(n.get('read') or 1)} min de leitura{((' · Fontes: ' if len(fontes) > 1 else ' · Fonte: ') + e(nomes_fonte)) if nomes_fonte else ''}</p>
    <figure>{arte(n, prioridade=True)}{('<figcaption>' + ' · '.join(credito) + '</figcaption>') if credito else ''}</figure>
    <div class="body">{paragrafos(n.get('body') or resumo)}</div>
    {('<aside class="take" aria-label="Na opinião do Nizzera"><h2>Na opinião do Nizzera</h2>' + paragrafos(opiniao) + '</aside>') if opiniao else ''}
    {bloco_fonte}
    <p class="share"><span>Link desta notícia:</span> <a href="{e(url)}">{e(url)}</a></p>
    <p class="likes"><button class="like" id="like" type="button" aria-pressed="false" data-post="{e(n['slug'])}" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span class="like-t">Curtir</span><b id="like-n"></b></button></p>
  </article>
  {comentarios_noticia(n, titulo)}
  {('<section class="related" aria-label="Leia também"><h2 class="sec">Leia também</h2><div class="cards">' + ''.join(card(x, trend) for x in rel) + '</div></section>') if rel else ''}
</main>"""
    return layout(c, nome, cab, corpo, '<script src="/assets/js/artigo.js"></script>\n')


def comentarios_noticia(n, titulo):
    return comentarios_bloco(n["slug"], titulo, "O que você achou dessa notícia?")


def comentarios_bloco(chave, titulo, dica):
    """Comentários abaixo de uma notícia ou review (mesmo formulário e script da página /comentarios/).
    chave: o slug da notícia, ou "review-" + slug da review (assim nunca se misturam)."""
    return f"""<section class="post-cm" id="comentarios" aria-labelledby="cm-list-t">
    <header class="cm-head"><h2 class="cm-title" id="cm-list-t">Comentários</h2><p class="cm-stat" id="cm-stat" aria-live="polite"></p></header>
    <form class="cm-form" id="fb-form" data-post="{e(chave)}" data-title="{e(titulo)}" novalidate>
      <label for="fb-name">Seu nome <small>(opcional)</small></label>
      <input class="fb-in" id="fb-name" maxlength="40" autocomplete="nickname" placeholder="Como você quer aparecer">
      <label for="fb-msg">Comentário</label>
      <textarea class="fb-in" id="fb-msg" maxlength="500" rows="4" placeholder="{e(dica)}"></textarea>
      <div class="hp" aria-hidden="true"><label>Não preencha este campo<input id="fb-hp" tabindex="-1" autocomplete="off"></label></div>
      <div class="fb-row"><span class="fb-count" id="fb-count">0/500</span><button class="fb-btn" id="fb-send" type="submit">Publicar comentário</button></div>
      <div class="fb-status" id="fb-status" role="status"></div>
      <p class="cm-note">Seja respeitoso: ofensas e spam são removidos. Links não são permitidos.</p>
    </form>
    <div class="cm-list" id="cmlist" aria-live="polite" aria-busy="true"><div class="cm-skel"></div></div>
    <nav class="cm-pager" id="cm-pager" aria-label="Páginas dos comentários" hidden></nav>
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

    # reviews (as 3 mais recentes)
    revs = sorted([r for r in dados.get("reviews", []) if r.get("game")], key=lambda r: r.get("date", ""), reverse=True)[:3]
    g6 = gta6_home(gta6_dados())
    texto = miolo(texto, "gta6home", g6)
    texto = oculto(texto, "gta6", not g6)
    texto = miolo(texto, "rvgrid", "".join(rv_card(r) for r in revs))
    texto = trocar(texto, r'<section class="wrap rv-home" id="reviews"[^>]*>',
                   f'<section class="wrap rv-home" id="reviews" aria-labelledby="rvh-t" data-n="{len(revs)}"{"" if revs else " hidden"}>')

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
              f"  <url><loc>{SITE_URL}/maisjogados/</loc></url>",
              f"  <url><loc>{SITE_URL}/eventos/</loc></url>",
              f"  <url><loc>{SITE_URL}/comunidade/</loc></url>",
              f"  <url><loc>{SITE_URL}/gta6/</loc></url>",
              f"  <url><loc>{SITE_URL}/comentarios/</loc></url>",
              f"  <url><loc>{SITE_URL}/sobre/</loc></url>",
              f"  <url><loc>{SITE_URL}/tierlist/</loc></url>",
              f"  <url><loc>{SITE_URL}/privacidade/</loc></url>"]
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
            f"  <description>{e(site.get('intro') or 'Notícias, ofertas, jogos grátis e reviews de games')}</description>\n  <language>pt-BR</language>\n"
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


# arquivos escritos à mão que também têm o endereço do site (o resto é gerado a partir de SITE_URL)
FIXOS = ["index.html", "404.html", os.path.join("admin", "index.html"), "robots.txt", os.path.join("assets", "js", "tierlist.js")]


def acertar_dominio():
    """Troca qualquer endereço antigo (DOMINIOS_ANTIGOS) por SITE_URL nos arquivos fixos.
    Assim, mudar de domínio é só trocar scripts/config.py e rodar este gerador."""
    host = re.sub(r"^https?://", "", SITE_URL)
    mudou = 0
    for nome in FIXOS:
        caminho = os.path.join(SITE, nome)
        if not os.path.exists(caminho):
            continue
        txt = open(caminho, encoding="utf-8").read()
        novo = txt
        for antigo in DOMINIOS_ANTIGOS:
            novo = novo.replace(antigo, SITE_URL).replace(re.sub(r"^https?://", "", antigo), host)
        if nome.endswith("tierlist.js"):  # endereço que aparece no rodapé da imagem exportada (sem "www.")
            novo = re.sub(r'var SITE_URL="[^"]*";', 'var SITE_URL="' + re.sub(r"^www\.", "", host) + '";', novo)
        if novo != txt:
            open(caminho, "w", encoding="utf-8").write(novo)
            mudou += 1
    return mudou


def main():
    if acertar_dominio():
        print("Endereço do site atualizado nos arquivos fixos para " + SITE_URL)
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
    mudou += gravar(os.path.join(SITE, "maisjogados", "index.html"), pagina_maisjogados(c, site))
    mudou += gravar(os.path.join(SITE, "eventos", "index.html"), pagina_eventos(c, site))
    mudou += gravar(os.path.join(SITE, "comunidade", "index.html"), pagina_comunidade(c, site))
    mudou += gravar(os.path.join(SITE, "gta6", "index.html"), pagina_gta6(c, site, todas))
    mudou += gravar(os.path.join(SITE, "comentarios", "index.html"), pagina_comentarios(c, site))
    mudou += gravar(os.path.join(SITE, "sobre", "index.html"), pagina_sobre(c, site))
    mudou += gravar(os.path.join(SITE, "tierlist", "index.html"), pagina_tierlist(c, site))
    mudou += gravar(os.path.join(SITE, "privacidade", "index.html"), pagina_privacidade(c, site))
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
