#!/usr/bin/env python3
"""Atualiza as notícias do Nizzera Games automaticamente.

Lê feeds RSS, pega título, trecho, link e imagem de cada matéria e grava no JSON
embutido do SITE/index.html (<script id="nz-data">). Só usa a biblioteca padrão.

Uso:  python scripts/atualizar_noticias.py [caminho/do/index.html]
"""
import html, json, os, re, sys, unicodedata, urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PADRAO = os.path.join(RAIZ, "SITE", "index.html")

# ---------------- CONFIGURAÇÃO (edite aqui) ----------------
FEEDS = [  # (nome mostrado como fonte/crédito, url do RSS, só_games?)
    # Fontes de todas as plataformas; a ordem conta: as primeiras têm prioridade na rodada.
    ("Adrenaline",  "https://www.adrenaline.com.br/feed/", True),   # forte em PC/Steam
    ("IGN Brasil",  "https://br.ign.com/feed.xml",          True),
    ("GameBlast",   "https://www.gameblast.com.br/feeds/posts/default?alt=rss", True),
    ("Canaltech",   "https://canaltech.com.br/rss/games/", True),
    ("Tecnoblog",   "https://tecnoblog.net/feed/",        True),
    ("OtakuPT",     "https://www.otakupt.com/feed/",      True),
]
FONTES_PT = {"OtakuPT"}  # fontes de Portugal: o texto é convertido para o português do Brasil (abrasileirar)
MAX_POR_FEED = 5       # máximo de notícias novas por fonte a cada execução (o robô roda 1 vez por dia)
MAX_POR_RODADA = 20    # máximo de notícias novas no total por execução
DIAS_NO_SITE = 15      # notícia com mais de 15 dias sai do site (e a página dela é apagada)
MIN_NO_SITE = 12       # segurança: se as fontes pararem, as 12 mais novas ficam mesmo passando dos 15 dias
MAX_NO_SITE = 300      # teto de notícias no site; a paginação mostra 12 por vez
DESTAQUE_DIAS = 3      # destaque é trocado se tiver mais que isso de idade
MAX_IDADE_DIAS = 10    # notícia mais velha que isso não entra (alguns feeds trazem matérias de meses atrás)
EXTRA_EM_ALTA = 2      # notícias a mais por fonte quando são de um "assunto em alta"
# Os "assuntos em alta" (GTA 6, Zelda...) ficam no próprio site, em nz-data > trend,
# e são editados no painel admin (Site e categorias). O robô dá preferência a eles.
FUSO = timezone(timedelta(hours=-3))  # Brasília

CATEGORIAS = [  # primeira que casar vence; senão "Lançamentos". Steam vem primeiro: é o foco do site
    ("Steam",       ["steam", "valve", "deadlock", "half-life", "counter-strike 2", "epic games store", "para pc", "no pc", "jogos de pc"]),
    ("Game Pass",   ["game pass", "gamepass"]),
    ("Serviços",    ["playstation plus", "ps plus", "xbox cloud", "geforce now", "assinatura", "cloud gaming"]),
    ("Esports",     ["esports", "e-sports", "worlds", "campeonato", "major", "valorant", "league of legends", "counter-strike", "cs2", "free fire"]),
    ("PlayStation", ["playstation", "ps5", "ps4", "sony"]),
    ("Xbox",        ["xbox"]),
    ("Nintendo",    ["nintendo", "switch", "zelda", "pikmin", "mario", "pokémon", "pokemon", "kirby", "metroid"]),
    ("Eventos",     ["evento", "festival", "gamescom", "tgs", "the game awards", "summer game fest", "halloween", "bgs"]),
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
    txt = re.sub(RODAPE_FEED, "", txt, flags=re.S | re.I)
    txt = txt.replace("[…]", "").replace("[...]", "").replace("Read more", "").replace("Leia mais", "")
    return re.sub(r"\s+", " ", txt).strip()


# "O post X apareceu primeiro em Y", "O conteúdo X aparece primeiro em Y" etc. (rodapé que os feeds colam no texto)
RODAPE_FEED = r"(O post|The post|A matéria|O artigo|O conteúdo|Post)\s.{0,250}?(aparece(u)? primeiro|appeared first|foi publicad).*$"


# ---- português de Portugal -> do Brasil (só nas FONTES_PT) ----
PT_BR = {
    "ecrã": "tela", "ecrãs": "telas", "telemóvel": "celular", "telemóveis": "celulares",
    "consola": "console", "consolas": "consoles", "equipa": "equipe", "equipas": "equipes",
    "utilizador": "usuário", "utilizadores": "usuários", "utilizadora": "usuária", "utilizadoras": "usuárias",
    "partilhar": "compartilhar", "partilhou": "compartilhou", "partilha": "compartilha", "partilham": "compartilham",
    "partilhado": "compartilhado", "partilhada": "compartilhada", "partilhados": "compartilhados", "partilhadas": "compartilhadas",
    "pormenor": "detalhe", "pormenores": "detalhes", "videojogo": "videogame", "videojogos": "videogames",
    "registar": "registrar", "registou": "registrou", "registado": "registrado", "registada": "registrada",
    "facto": "fato", "factos": "fatos", "contacto": "contato", "contactos": "contatos", "actualização": "atualização",
    "ficheiro": "arquivo", "ficheiros": "arquivos", "descarregar": "baixar", "descarregamento": "download",
    "arranque": "início", "fecho": "fechamento", "cassete": "fita", "cassetes": "fitas", "guião": "roteiro",
    "decorre": "acontece", "decorrem": "acontecem", "decorrerá": "acontecerá", "decorreu": "aconteceu",
    "regressa": "volta", "regressam": "voltam", "regressou": "voltou", "regressaram": "voltaram", "regresso": "retorno",
    "comboio": "trem", "autocarro": "ônibus", "relvado": "gramado", "golo": "gol", "golos": "gols",
    "vais": "você vai", "podes": "você pode", "tens": "você tem", "queres": "você quer", "sabes": "você sabe",
    "estás": "você está", "teu": "seu", "tua": "sua", "teus": "seus", "tuas": "suas",
}
PT_FRASES = [  # (procura, troca): expressões de mais de uma palavra
    (r"\bbanda sonora\b", "trilha sonora"), (r"\besta (segunda|terça|quarta|quinta|sexta)-feira\b", r"nesta \1-feira"),
    (r"\beste (sábado|domingo)\b", r"neste \1"), (r"\bfica a saber\b", "saiba"),
    (r"\baprendizagem automática\b", "aprendizado de máquina"), (r"\bpara às\b", "para as"),
]
# palavras que mudam de gênero: "a consola" -> "o console", "o ecrã" -> "a tela" (artigo e adjetivo juntos)
_GENERO = [("consola", "console", {"a": "o", "da": "do", "na": "no", "pela": "pelo", "uma": "um", "esta": "este", "essa": "esse",
                                   "nova": "novo", "própria": "próprio", "sua": "seu", "uma nova": "um novo", "a nova": "o novo"}),
           ("consolas", "consoles", {"as": "os", "das": "dos", "nas": "nos", "às": "aos", "pelas": "pelos", "estas": "estes",
                                     "novas": "novos", "suas": "seus", "as novas": "os novos", "às novas": "aos novos"}),
           ("ecrã", "tela", {"o": "a", "do": "da", "no": "na", "pelo": "pela", "um": "uma", "este": "esta", "seu": "sua"}),
           ("ecrãs", "telas", {"os": "as", "dos": "das", "nos": "nas", "pelos": "pelas", "seus": "suas"})]
for _pt, _br, _arts in _GENERO:
    for _a in sorted(_arts, key=len, reverse=True):  # "uma nova" antes de "nova"
        PT_FRASES.append((r"\b" + _a.replace(" ", r"\s+") + r"\s+" + _pt + r"\b", _arts[_a] + " " + _br))
# "está a fazer" -> "está fazendo": estar/continuar/andar/ficar + a + infinitivo vira gerúndio
PT_GERUNDIO = re.compile(r"\b(est(?:á|ão|ava|avam|ou|amos|eja|ejam)|continu(?:a|am|ava|avam|ou)|and(?:a|am|ava|avam)|fic(?:a|am|ou|aram))\s+a\s+([a-zà-ú]+?)(ar|er|ir|or|ôr)\b", re.I)


def _mesma_caixa(orig, novo):
    return novo[0].upper() + novo[1:] if orig[:1].isupper() else novo


def abrasileirar(txt):
    if not txt:
        return txt
    for pad, novo in PT_FRASES:  # expressões primeiro (inclui artigo + palavra que muda de gênero)
        txt = re.sub(pad, lambda m, novo=novo: _mesma_caixa(m.group(0), m.expand(novo)), txt, flags=re.I)
    txt = re.sub(r"\b[a-zà-úA-ZÀ-Ú]+\b", lambda m: _mesma_caixa(m.group(0), PT_BR[m.group(0).lower()]) if m.group(0).lower() in PT_BR else m.group(0), txt)
    # por último o gerúndio, já com as palavras trocadas ("estão a partilhar" -> "estão compartilhando")
    return PT_GERUNDIO.sub(lambda m: f"{m.group(1)} {m.group(2)}{ {'ar': 'ando', 'er': 'endo', 'ir': 'indo', 'or': 'ondo', 'ôr': 'ondo'}[m.group(3).lower()] }", txt)


def cortar(txt, n):
    if len(txt) <= n:
        return txt
    corte = txt[:n]
    pos = max(corte.rfind(". "), corte.rfind("! "), corte.rfind("? "))
    if pos > n * 0.5:
        return corte[:pos + 1]
    return corte.rsplit(" ", 1)[0].rstrip(",;:") + "…"


def fechar_frase(txt):
    """O feed às vezes corta o texto no meio da frase: volta até a última frase completa (ou põe "…")."""
    txt = (txt or "").strip()
    if not txt or re.search(r"[.!?…\"”)]$", txt):
        return txt
    pos = max(txt.rfind(". "), txt.rfind("! "), txt.rfind("? "))
    return txt[:pos + 1] if pos > len(txt) * 0.4 else txt.rstrip(",;:- ") + "…"


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


def quando_do_item(item):
    """Data e hora de publicação, no horário de Brasília."""
    bruto = item.findtext("pubDate") or item.findtext("{http://purl.org/dc/elements/1.1/}date") or ""
    try:
        d = parsedate_to_datetime(bruto)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(FUSO).replace(microsecond=0)
    except Exception:
        return datetime.now(FUSO).replace(microsecond=0)


def ler_feed(nome, url, so_games):
    raiz = ET.fromstring(baixar(url))
    achados = []
    for item in raiz.iter("item"):
        titulo = limpar(item.findtext("title"))
        link = (item.findtext("link") or "").strip()
        if not titulo or not url_ok(link):
            continue
        texto = limpar(item.findtext("description") or item.findtext("content:encoded", namespaces=NS))
        if nome in FONTES_PT:
            titulo, texto = abrasileirar(titulo), abrasileirar(texto)
        if so_games and not eh_game(titulo, texto):
            continue
        achados.append({"nome": nome, "titulo": titulo, "link": link, "texto": texto,
                        "data": (q := quando_do_item(item)).date(), "pub": q.isoformat(), "img": imagem_do_item(item)})
    return achados


def chave(u):
    return re.sub(r"^https?://(www\.)?", "", (u or "").lower()).split("#")[0].split("?")[0].rstrip("/")


def plano(t):
    t = unicodedata.normalize("NFD", str(t or ""))
    return re.sub(r"[^a-z0-9]+", " ", re.sub("[\u0300-\u036f]", "", t).lower())


def assunto(titulo, resumo, trend):
    """Igual a trendOf() de assets/js/core.js: posição do 1º assunto citado no título/resumo, ou None."""
    txt = " " + plano(titulo + " " + resumo) + " "
    for i, x in enumerate(trend):
        for termo in x.get("terms", []):
            termo = " " + plano(termo).strip() + " "
            if len(termo) > 2 and termo in txt:
                return i
    return None


def montar(dados, coletados, hoje):
    noticias = dados["news"]
    trend = [x for x in dados.get("trend", []) if isinstance(x, dict) and x.get("terms")]
    vistas_url = {chave(n.get("url")) for n in noticias}
    vistos_tit = {re.sub(r"\W+", "", n.get("title", "").lower()) for n in noticias}
    prox_id = max([n.get("id", 0) for n in noticias] + [0]) + 1
    novas, por_feed = [], {}
    limite_idade = hoje - timedelta(days=MAX_IDADE_DIAS)
    for it in coletados:
        it["alta"] = assunto(it["titulo"], primeira_frase(it["texto"]), trend)
    # assuntos em alta primeiro (na ordem da lista), depois o resto; dentro de cada grupo, mais novas primeiro
    fila = sorted(coletados, key=lambda x: (x["alta"] is None, x["alta"] or 0, -x["data"].toordinal()))
    for it in fila:
        if it["data"] < limite_idade:
            continue
        cota = MAX_POR_FEED + (EXTRA_EM_ALTA if it["alta"] is not None else 0)
        if len(novas) >= MAX_POR_RODADA or por_feed.get(it["nome"], 0) >= cota:
            continue
        k, t = chave(it["link"]), re.sub(r"\W+", "", it["titulo"].lower())
        if k in vistas_url or t in vistos_tit or it["data"] > hoje + timedelta(days=1):
            continue
        img = it["img"] or og_image(it["link"])
        if not img:  # o site só publica notícias com foto
            print(f"[pula] sem imagem: {it['titulo'][:70]}")
            continue
        corpo = fechar_frase(cortar(it["texto"], 450)) or it["titulo"]
        novas.append({
            "id": prox_id, "img": img, "alt": it["titulo"] if img else "", "pos": "",
            "credit": it["nome"] if img else "", "cat": categoria(it["titulo"], it["texto"]),
            "title": it["titulo"], "date": it["data"].isoformat(), "pub": it["pub"], "read": 1,
            "sum": primeira_frase(it["texto"]) or it["titulo"], "body": corpo,
            "src": it["nome"], "url": it["link"], "featured": False})
        prox_id += 1
        vistas_url.add(k); vistos_tit.add(t)
        por_feed[it["nome"]] = por_feed.get(it["nome"], 0) + 1

    ordem = sorted(noticias + novas, key=lambda n: (n.get("date", ""), n.get("id", 0)), reverse=True)
    validade = (hoje - timedelta(days=DIAS_NO_SITE)).isoformat()
    todas = [n for i, n in enumerate(ordem) if i < MIN_NO_SITE or n.get("date", "") >= validade][:MAX_NO_SITE]
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


def revisar(dados):
    """Aplica a limpeza do rodapé do feed e o português do Brasil às notícias que já estão no site.
    Só mexe em notícias vindas das fontes (não toca em texto escrito no painel, como "Nossa opinião")."""
    mudou = 0
    for n in dados["news"]:
        antes = json.dumps(n, ensure_ascii=False, sort_keys=True)
        for k in ("sum", "body"):
            if n.get(k):
                n[k] = re.sub(r"\s+", " ", re.sub(RODAPE_FEED, "", n[k], flags=re.S | re.I)).strip() or n.get("title", "")
        if n.get("src") and n.get("body"):
            n["body"] = fechar_frase(n["body"])
        if n.get("src") in FONTES_PT:
            for k in ("title", "alt", "sum", "body"):
                if n.get(k):
                    n[k] = abrasileirar(n[k])
        mudou += json.dumps(n, ensure_ascii=False, sort_keys=True) != antes
    return mudou


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    caminho = args[0] if args else PADRAO
    texto = open(caminho, encoding="utf-8").read()
    m = re.search(r'(<script id="nz-data" type="application/json">\s*)(.*?)(\s*</script>)', texto, re.S)
    if not m:
        sys.exit("Bloco nz-data não encontrado em " + caminho)
    dados = json.loads(m.group(2))

    if "--revisar" in sys.argv:  # uso:  python scripts/atualizar_noticias.py --revisar
        n = revisar(dados)
        js = json.dumps(dados, ensure_ascii=False, indent=1).replace("<", "\\u003c")
        open(caminho, "w", encoding="utf-8").write(texto[:m.start(2)] + js + texto[m.end(2):])
        print(f"{n} notícia(s) revisada(s).")
        return

    coletados = []
    for nome, url, so_games in FEEDS:
        try:
            itens = ler_feed(nome, url, so_games)
            print(f"[ok]   {nome}: {len(itens)} itens lidos")
            coletados += itens
        except Exception as e:  # uma fonte fora do ar não derruba as outras
            print(f"[erro] {nome}: {e}")

    antes = len(dados["news"])
    original = json.dumps(dados, ensure_ascii=False, sort_keys=True)
    novas = montar(dados, coletados, datetime.now(FUSO).date())
    saiu = antes + len(novas) - len(dados["news"])
    if json.dumps(dados, ensure_ascii=False, sort_keys=True) == original:
        print("Nenhuma notícia nova nem vencida. Arquivo não alterado.")
        return
    js = json.dumps(dados, ensure_ascii=False, indent=1).replace("<", "\\u003c")
    texto = texto[:m.start(2)] + js + texto[m.end(2):]
    open(caminho, "w", encoding="utf-8").write(texto)
    print(f"{len(novas)} notícias novas adicionadas; {saiu} saíram por ter mais de {DIAS_NO_SITE} dias; {len(dados['news'])} no site.")
    for n in novas:
        print(f" + [{n['cat']}] {n['title']}")


if __name__ == "__main__":
    main()
