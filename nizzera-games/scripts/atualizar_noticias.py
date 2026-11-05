#!/usr/bin/env python3
"""Atualiza as notícias do Nizzera Games automaticamente.

Lê feeds RSS, pega título, trecho, link e imagem de cada matéria e grava no JSON
embutido do SITE/index.html (<script id="nz-data">). Só usa a biblioteca padrão.

Uso:  python scripts/atualizar_noticias.py [caminho/do/index.html]
"""
import html, json, os, re, sys, urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PADRAO = os.path.join(RAIZ, "SITE", "index.html")

# ---------------- CONFIGURAÇÃO (edite aqui) ----------------
FEEDS = [  # (nome mostrado como fonte/crédito, url do RSS, só_games?)
    ("Xbox Power",  "https://www.xboxpower.com.br/feed/", False),
    ("OtakuPT",     "https://www.otakupt.com/feed/",      True),
    ("NintendoBoy", "https://nintendoboy.com/feed",       False),
    ("Canaltech",   "https://canaltech.com.br/rss/games/", True),
    ("Tecnoblog",   "https://tecnoblog.net/feed/",        True),
]
MAX_POR_FEED = 4       # máximo de notícias novas por fonte a cada execução
MAX_POR_RODADA = 12    # máximo de notícias novas no total por execução
MAX_NO_SITE = 200      # quantas notícias ficam no site (as mais antigas saem); a paginação mostra 12 por vez
DESTAQUE_DIAS = 3      # destaque é trocado se tiver mais que isso de idade
FUSO = timezone(timedelta(hours=-3))  # Brasília

CATEGORIAS = [  # primeira que casar vence; senão "Lançamentos"
    ("Game Pass", ["game pass", "gamepass"]),
    ("Nintendo",  ["nintendo", "switch", "zelda", "pikmin", "mario", "pokémon", "pokemon", "kirby", "metroid"]),
    ("Steam",     ["steam", "valve", "deadlock", "steam deck"]),
    ("Esports",   ["esports", "e-sports", "worlds", "campeonato", "major", "valorant", "league of legends", "counter-strike", "cs2", "free fire"]),
    ("Eventos",   ["evento", "festival", "gamescom", "tgs", "the game awards", "summer game fest", "halloween", "bgs"]),
    ("Serviços",  ["playstation plus", "ps plus", "xbox cloud", "geforce now", "assinatura", "cloud gaming"]),
]
PALAVRAS_GAMES = ["game", "jogo", "xbox", "playstation", "ps5", "ps4", "nintendo", "switch", "steam",
                  "esports", "console", "gta", "fortnite", "zelda", "minecraft", "valve", "epic games"]
UA = {"User-Agent": "Mozilla/5.0 (compatible; NizzeraGamesBot/1.0)"}
NS = {"media": "http://search.yahoo.com/mrss/", "content": "http://purl.org/rss/1.0/modules/content/"}
# -----------------------------------------------------------


def baixar(url, limite=5_000_000):  # feeds grandes (ex.: Tecnoblog, ~850 KB) chegavam cortados
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read(limite)


def limpar(txt):
    txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", txt or "", flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = html.unescape(txt)
    txt = re.sub(r"(O post|The post|A matéria|Post)\s.{0,200}?(apareceu primeiro|appeared first|foi publicad).*$", "", txt, flags=re.S | re.I)
    txt = txt.replace("[…]", "").replace("[...]", "").replace("Read more", "").replace("Leia mais", "")
    return re.sub(r"\s+", " ", txt).strip()


def cortar(txt, n):
    if len(txt) <= n:
        return txt
    corte = txt[:n]
    pos = max(corte.rfind(". "), corte.rfind("! "), corte.rfind("? "))
    if pos > n * 0.5:
        return corte[:pos + 1]
    return corte.rsplit(" ", 1)[0].rstrip(",;:") + "…"


def primeira_frase(txt, n=170):
    m = re.match(r"(.+?[.!?])(\s|$)", txt)
    return cortar(m.group(1) if m and len(m.group(1)) >= 40 else txt, n)


def url_ok(u):
    return u if re.match(r"^https?://", u or "", re.I) else ""


def imagem_do_item(item):
    for el in item.findall("media:content", NS) + item.findall("media:thumbnail", NS):
        u = url_ok(el.get("url"))
        if u:
            return u
    for el in item.findall("enclosure"):
        if (el.get("type") or "").startswith("image") and url_ok(el.get("url")):
            return el.get("url")
    bruto = (item.findtext("content:encoded", namespaces=NS) or "") + (item.findtext("description") or "")
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', bruto, re.I)
    return url_ok(html.unescape(m.group(1))) if m else ""


def og_image(url):
    try:
        pagina = baixar(url, 250_000).decode("utf-8", "ignore")
    except Exception:
        return ""
    for pat in (r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']'):
        m = re.search(pat, pagina, re.I)
        if m:
            return url_ok(html.unescape(m.group(1)))
    return ""


def categoria(titulo, texto):
    base = (titulo + " " + texto).lower()
    for nome, chaves in CATEGORIAS:
        if any(c in base for c in chaves):
            return nome
    return "Lançamentos"


def eh_game(titulo, texto):
    base = (titulo + " " + texto).lower()
    return any(p in base for p in PALAVRAS_GAMES)


def data_do_item(item):
    bruto = item.findtext("pubDate") or item.findtext("{http://purl.org/dc/elements/1.1/}date") or ""
    try:
        d = parsedate_to_datetime(bruto)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(FUSO).date()
    except Exception:
        return datetime.now(FUSO).date()


def ler_feed(nome, url, so_games):
    raiz = ET.fromstring(baixar(url))
    achados = []
    for item in raiz.iter("item"):
        titulo = limpar(item.findtext("title"))
        link = (item.findtext("link") or "").strip()
        if not titulo or not url_ok(link):
            continue
        texto = limpar(item.findtext("description") or item.findtext("content:encoded", namespaces=NS))
        if so_games and not eh_game(titulo, texto):
            continue
        achados.append({"nome": nome, "titulo": titulo, "link": link, "texto": texto,
                        "data": data_do_item(item), "img": imagem_do_item(item)})
    return achados


def chave(u):
    return re.sub(r"^https?://(www\.)?", "", (u or "").lower()).split("#")[0].split("?")[0].rstrip("/")


def montar(dados, coletados, hoje):
    noticias = dados["news"]
    vistas_url = {chave(n.get("url")) for n in noticias}
    vistos_tit = {re.sub(r"\W+", "", n.get("title", "").lower()) for n in noticias}
    prox_id = max([n.get("id", 0) for n in noticias] + [0]) + 1
    novas, por_feed = [], {}
    for it in sorted(coletados, key=lambda x: x["data"], reverse=True):
        if len(novas) >= MAX_POR_RODADA or por_feed.get(it["nome"], 0) >= MAX_POR_FEED:
            continue
        k, t = chave(it["link"]), re.sub(r"\W+", "", it["titulo"].lower())
        if k in vistas_url or t in vistos_tit or it["data"] > hoje + timedelta(days=1):
            continue
        img = it["img"] or og_image(it["link"])
        if not img:  # o site só publica notícias com foto
            print(f"[pula] sem imagem: {it['titulo'][:70]}")
            continue
        corpo = cortar(it["texto"], 450) or it["titulo"]
        novas.append({
            "id": prox_id, "img": img, "alt": it["titulo"] if img else "", "pos": "",
            "credit": it["nome"] if img else "", "cat": categoria(it["titulo"], it["texto"]),
            "title": it["titulo"], "date": it["data"].isoformat(), "read": 1,
            "sum": primeira_frase(it["texto"]) or it["titulo"], "body": corpo,
            "src": it["nome"], "url": it["link"], "featured": False})
        prox_id += 1
        vistas_url.add(k); vistos_tit.add(t)
        por_feed[it["nome"]] = por_feed.get(it["nome"], 0) + 1

    todas = sorted(noticias + novas, key=lambda n: (n.get("date", ""), n.get("id", 0)), reverse=True)[:MAX_NO_SITE]
    # destaque: mantém o atual se ainda for recente; senão, a mais nova com foto
    recente = (hoje - timedelta(days=DESTAQUE_DIAS)).isoformat()
    atual = next((n for n in todas if n.get("featured")), None)
    if not atual or atual.get("date", "") < recente:
        cand = next((n for n in todas if n.get("img") and n.get("date", "") >= recente), None)
        if cand:
            for n in todas:
                n["featured"] = n is cand
    dados["news"] = todas
    return novas


def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else PADRAO
    texto = open(caminho, encoding="utf-8").read()
    m = re.search(r'(<script id="nz-data" type="application/json">\s*)(.*?)(\s*</script>)', texto, re.S)
    if not m:
        sys.exit("Bloco nz-data não encontrado em " + caminho)
    dados = json.loads(m.group(2))

    coletados = []
    for nome, url, so_games in FEEDS:
        try:
            itens = ler_feed(nome, url, so_games)
            print(f"[ok]   {nome}: {len(itens)} itens lidos")
            coletados += itens
        except Exception as e:  # uma fonte fora do ar não derruba as outras
            print(f"[erro] {nome}: {e}")

    novas = montar(dados, coletados, datetime.now(FUSO).date())
    if not novas:
        print("Nenhuma notícia nova. Arquivo não alterado.")
        return
    js = json.dumps(dados, ensure_ascii=False, indent=1).replace("<", "\\u003c")
    texto = texto[:m.start(2)] + js + texto[m.end(2):]
    open(caminho, "w", encoding="utf-8").write(texto)
    print(f"{len(novas)} notícias novas adicionadas; {len(dados['news'])} no site.")
    for n in novas:
        print(f" + [{n['cat']}] {n['title']}  ({'com foto' if n['img'] else 'sem foto'})")


if __name__ == "__main__":
    main()
