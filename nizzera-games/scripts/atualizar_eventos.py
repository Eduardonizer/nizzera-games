#!/usr/bin/env python3
"""Busca os eventos de games (campeonatos, feiras, premiações) e grava em SITE/data/eventos.json.

De onde vêm:
  * Campeonatos (CS2, Valorant, LoL, Dota 2, Rainbow Six, Free Fire): Liquipedia (liquipedia.net),
    página "Liquipedia:Tournaments" de cada jogo + a ficha (infobox) de cada campeonato.
    Só entram os campeonatos grandes (S-Tier e A-Tier), em andamento ou futuros.
    Regras de uso do Liquipedia: User-Agent com contato, gzip e no máximo 1 pedido a cada 2 s
    (por isso cada jogo usa só 2 pedidos: a lista e as fichas, todas juntas). Licença CC-BY-SA:
    o site cita o Liquipedia e cada evento tem link para a página de lá.
  * Feiras, premiações e apresentações (BGS, Gamescom, The Game Awards...): a lista
    scripts/eventos_fixos.json, que a gente mantém à mão (não existe uma fonte automática confiável).

Eventos que já terminaram saem sozinhos. Só usa a biblioteca padrão.
Uso:  python scripts/atualizar_eventos.py
"""
import gzip, html, json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import SITE_URL  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "SITE", "data", "eventos.json")
FIXOS = os.path.join(RAIZ, "scripts", "eventos_fixos.json")
UA = f"NizzeraGamesBot/1.0 (+{SITE_URL}; nizzeragames@gmail.com)"  # o Liquipedia pede um contato
FUSO = timezone(timedelta(hours=-3))  # Brasília

# (sigla mostrada no site, wiki do Liquipedia)
JOGOS = [
    ("CS2", "counterstrike"),
    ("Valorant", "valorant"),
    ("LoL", "leagueoflegends"),
    ("Dota 2", "dota2"),
    ("Rainbow Six", "rainbowsix"),
    ("Free Fire", "freefire"),
]
TIERS_OK = {"1", "2", "s-tier", "a-tier", "s", "a"}  # só os campeonatos grandes
MAX_POR_JOGO = 12
MAX_DIAS_FRENTE = 200  # campeonato que começa daqui a mais de ~6 meses ainda não entra

PAISES = {  # o Liquipedia escreve em inglês
    "Brazil": "Brasil", "United States": "Estados Unidos", "USA": "Estados Unidos", "Germany": "Alemanha",
    "France": "França", "Spain": "Espanha", "Italy": "Itália", "Portugal": "Portugal", "Poland": "Polônia",
    "Denmark": "Dinamarca", "Sweden": "Suécia", "Finland": "Finlândia", "Norway": "Noruega",
    "Netherlands": "Holanda", "Belgium": "Bélgica", "United Kingdom": "Reino Unido", "England": "Inglaterra",
    "Romania": "Romênia", "Serbia": "Sérvia", "Ukraine": "Ucrânia", "Russia": "Rússia", "Turkey": "Turquia",
    "Türkiye": "Turquia", "Malta": "Malta", "Hungary": "Hungria", "Austria": "Áustria", "Switzerland": "Suíça",
    "Czech Republic": "República Tcheca", "Czechia": "República Tcheca", "Greece": "Grécia",
    "China": "China", "Japan": "Japão", "South Korea": "Coreia do Sul", "Korea": "Coreia do Sul",
    "Singapore": "Singapura", "Thailand": "Tailândia", "Vietnam": "Vietnã", "Indonesia": "Indonésia",
    "Philippines": "Filipinas", "Malaysia": "Malásia", "India": "Índia", "Taiwan": "Taiwan",
    "Saudi Arabia": "Arábia Saudita", "United Arab Emirates": "Emirados Árabes Unidos", "Qatar": "Catar",
    "Kazakhstan": "Cazaquistão", "Mexico": "México", "Argentina": "Argentina", "Chile": "Chile",
    "Colombia": "Colômbia", "Peru": "Peru", "Canada": "Canadá", "Australia": "Austrália",
}


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=40) as r:
        dados = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            dados = gzip.decompress(dados)
    return json.loads(dados.decode("utf-8"))


def wikitextos(wiki, titulos):
    """Conteúdo (wikitext) de várias páginas num pedido só: {título: texto}."""
    q = urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                                "format": "json", "formatversion": "2", "redirects": "1", "titles": "|".join(titulos)})
    d = baixar(f"https://liquipedia.net/{wiki}/api.php?{q}")
    pedidos = {t.replace("_", " "): t for t in titulos}
    # redirecionamentos e normalizações: liga o título pedido ao título final
    apelido = {}
    for x in (d.get("query", {}).get("normalized", []) + d.get("query", {}).get("redirects", [])):
        apelido[x["to"]] = apelido.get(x["from"], x["from"])
    out = {}
    for p in d.get("query", {}).get("pages", []):
        if p.get("missing") or not p.get("revisions"):
            continue
        orig = apelido.get(p["title"], p["title"])
        out[pedidos.get(orig.replace("_", " "), orig)] = p["revisions"][0]["slots"]["main"]["content"]
    return out


def limpar(v):
    """Tira a marcação da wiki: [[a|b]] -> b, [url texto] -> texto, {{...}}, <ref>, &nbsp;."""
    v = re.sub(r"<ref[^>]*?/>|<ref.*?</ref>", "", v or "", flags=re.S)
    v = re.sub(r"<[^>]+>", "", v)
    v = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", v)
    v = re.sub(r"\[https?://\S+\]", "", v)
    v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    return re.sub(r"\s+", " ", html.unescape(v)).strip(" ,;")


def campo(caixa, nome):
    return limpar(caixa.get(nome, ""))


def ficha(texto):
    """Campos da {{Infobox league ...}} como dicionário. Separa pelos "|" de fora de [[...]] e {{...}}
    (alguns campeonatos escrevem vários campos na mesma linha)."""
    i = texto.find("{{Infobox league")
    if i < 0:
        return {}
    partes, atual, prof, j = [], [], 0, i + 2
    while j < len(texto):
        dois = texto[j:j + 2]
        if dois in ("{{", "[["):
            prof += 1; atual.append(dois); j += 2; continue
        if dois in ("}}", "]]"):
            if prof == 0 and dois == "}}":
                break
            prof -= 1; atual.append(dois); j += 2; continue
        if texto[j] == "|" and prof == 0:
            partes.append("".join(atual)); atual = []
        else:
            atual.append(texto[j])
        j += 1
    partes.append("".join(atual))
    out = {}
    for x in partes[1:]:
        if "=" in x:
            k, v = x.split("=", 1)
            out[k.strip().lower()] = v.strip()
    return out


def data_ok(v):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", v or "")
    if not m or m.group(2) == "??" or m.group(3) == "??":
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def lista_torneios(texto):
    """Páginas das seções Upcoming e Ongoing de Liquipedia:Tournaments."""
    paginas, secao = [], ""
    for linha in texto.splitlines():
        linha = linha.strip()
        if re.match(r"^\*[^*]", linha):
            secao = linha[1:].strip().lower()
            continue
        if linha.startswith("**") and secao in ("upcoming", "ongoing"):
            pagina = linha[2:].split("|")[0].strip()
            if pagina and pagina not in paginas:
                paginas.append(pagina)
    return paginas


def premio(caixa):
    for k in ("prizepoolusd", "prizepool"):
        v = campo(caixa, k).replace(",", "").replace("$", "").strip()
        if re.match(r"^\d+(\.\d+)?$", v) and float(v) > 0:
            return f"US$ {int(float(v)):,}".replace(",", ".")
    return ""


def campeonatos(sigla, wiki, hoje):
    lista = wikitextos(wiki, ["Liquipedia:Tournaments"]).get("Liquipedia:Tournaments", "")
    paginas = lista_torneios(lista)[:40]
    if not paginas:
        return []
    time.sleep(2.5)
    textos = wikitextos(wiki, paginas)
    out = []
    for pagina in paginas:
        caixa = ficha(textos.get(pagina, ""))
        if not caixa:
            continue
        tier = campo(caixa, "liquipediatier").lower()
        nome = campo(caixa, "name") or pagina.replace("_", " ").replace("/", " ")
        if tier not in TIERS_OK or re.search(r"qualifier|qualification|classificat", nome + " " + pagina, re.I):
            continue  # só os grandes, e sem as classificatórias
        ini, fim = data_ok(campo(caixa, "sdate") or campo(caixa, "date")), data_ok(campo(caixa, "edate") or campo(caixa, "date"))
        if not ini:
            continue
        fim = fim or ini
        if fim < hoje or (ini - hoje).days > MAX_DIAS_FRENTE:
            continue
        tipo = campo(caixa, "type").lower()
        modo = "Presencial" if tipo in ("offline", "lan") else "Online" if tipo == "online" else "Presencial e online" if "/" in tipo or "hybrid" in tipo else ""
        pais = campo(caixa, "country")
        local = ", ".join(x for x in [campo(caixa, "city") or campo(caixa, "location"), PAISES.get(pais, pais)] if x)
        out.append({
            "name": nome,
            "game": sigla, "kind": "Campeonato",
            "start": ini.isoformat(), "end": fim.isoformat(), "time": "",
            "mode": modo, "place": local if modo != "Online" else "", "venue": campo(caixa, "venue") if modo != "Online" else "",
            "organizer": campo(caixa, "organizer"), "prize": premio(caixa),
            "tier": "S-Tier" if tier in ("1", "s", "s-tier") else "A-Tier",
            "url": f"https://liquipedia.net/{wiki}/{urllib.parse.quote(pagina.replace(' ', '_'), safe='/:()')}",
            "source": "Liquipedia",
        })
    out.sort(key=lambda x: (x["start"], x["name"]))
    return out[:MAX_POR_JOGO]


def fixos(hoje):
    try:
        with open(FIXOS, encoding="utf-8") as f:
            lista = json.load(f)
    except Exception as e:
        print(f"[erro] eventos_fixos.json: {e}")
        return []
    out = []
    for x in lista:
        ini, fim = data_ok(x.get("start")), data_ok(x.get("end") or x.get("start"))
        if not ini or not x.get("name") or (fim or ini) < hoje:
            continue
        out.append({"name": x["name"], "game": x.get("game", ""), "kind": x.get("kind", "Evento"),
                    "start": ini.isoformat(), "end": (fim or ini).isoformat(), "time": x.get("time", ""),
                    "mode": x.get("mode", ""), "place": x.get("place", ""), "venue": x.get("venue", ""),
                    "organizer": x.get("organizer", ""), "prize": "", "tier": "", "info": x.get("info", ""),
                    "url": x.get("url", ""), "source": x.get("source", "")})
    return out


def main():
    hoje = datetime.now(FUSO).date()
    eventos, falhas = fixos(hoje), 0
    for sigla, wiki in JOGOS:
        try:
            achados = campeonatos(sigla, wiki, hoje)
            print(f"[ok]   {sigla}: {len(achados)} campeonatos")
            eventos += achados
        except Exception as e:  # um jogo fora do ar não derruba os outros
            falhas += 1
            print(f"[erro] {sigla}: {e}")
        time.sleep(2.5)
    if falhas == len(JOGOS) and os.path.exists(SAIDA):
        print("Liquipedia não respondeu: mantenho o eventos.json anterior.")
        return
    eventos.sort(key=lambda x: (x["start"], x["end"], x["name"]))
    out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "events": eventos}
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"eventos.json atualizado: {len(eventos)} eventos.")


if __name__ == "__main__":
    main()
