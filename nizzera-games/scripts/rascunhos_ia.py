#!/usr/bin/env python3
"""Gera RASCUNHOS de matérias com o Google Gemini a partir das notícias novas dos feeds.

Nada vai direto para o site: os rascunhos ficam no Upstash Redis (o mesmo banco dos comentários)
e aparecem no painel admin, aba "Rascunhos", onde você edita, publica, descarta ou gera de novo.

Como funciona:
  1. lê os feeds do scripts/atualizar_noticias.py: os brasileiros (FEEDS) e os de fora, em inglês (FEEDS_EXTERIOR),
     que o Gemini traduz;
  2. para cada notícia nova, procura a MESMA notícia nos outros feeds (título e palavras-chave)
     e junta até MAX_FONTES fontes; com uma fonte só, gera mesmo assim;
  3. pede ao Gemini uma matéria original que combine as fontes (o texto do pedido fica em
     SITE/api/_rascunho_ia.json, o mesmo que o botão "Gerar de novo" do painel usa);
  4. grava o rascunho no Redis e marca os links das fontes como usados (não gera de novo).

Variáveis de ambiente (no GitHub: Settings > Secrets and variables > Actions):
  GEMINI_API_KEY                                     chave da API do Gemini (aistudio.google.com/apikey)
  UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (ou KV_REST_API_URL + KV_REST_API_TOKEN)

Se algo falhar (sem internet, Gemini fora, limite do plano grátis), só registra o erro e segue:
este script nunca mexe no site.

Uso:  python scripts/rascunhos_ia.py            gera os rascunhos
      python scripts/rascunhos_ia.py --teste    só mostra o que geraria (não chama o Gemini nem grava nada)
"""
import hashlib, html, json, os, re, sys, time, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atualizar_noticias as AN  # noqa: E402  (feeds, leitura do RSS, categorias, assuntos em alta)

# ---------------- CONFIGURAÇÃO (edite aqui) ----------------
MODELO = "gemini-3.5-flash-lite"  # modelo Flash-Lite mais novo (lista: aistudio.google.com/docs/models)
MODELO_RESERVA = "gemini-3.1-flash-lite"  # usado quando o principal responde "muita demanda" (503); "" desliga
MAX_POR_EXECUCAO = 10    # máximo de rascunhos novos por execução (o plano grátis tem limite diário de pedidos)
MAX_TENTATIVAS = 16      # máximo de notícias tentadas por execução (contando as que deram erro)
MAX_ERROS_SEGUIDOS = 3   # o Gemini falhou 3 vezes seguidas: para e deixa o resto para a próxima execução
PAUSA_SEG = 8            # pausa entre uma chamada e outra ao Gemini
ESPERA_429_SEG = 45      # espera antes de tentar de novo quando o Gemini responde 429 (limite por minuto)
MAX_POR_ASSUNTO = 3      # máximo de rascunhos do mesmo "assunto em alta" (GTA 6, Zelda...) por execução
MAX_POR_SITE = 2         # máximo de rascunhos com o mesmo site como fonte principal (para nenhum site dominar)
MAX_FONTES = 3           # fontes por matéria (a notícia principal + as mesmas notícias em outros feeds)
IDADE_MAX_DIAS = 2       # só notícias publicadas nos últimos 2 dias (o robô roda 1 vez por dia)
TEXTO_MAX = 5000         # caracteres de cada fonte enviados ao Gemini
GUARDAR_DIAS = 30        # rascunhos publicados/descartados somem do banco depois disso
PENDENTE_DIAS = 20       # rascunho não revisado some depois disso (a notícia já ficou velha)
# -----------------------------------------------------------

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(RAIZ, "SITE")
PROMPT = os.path.join(SITE, "api", "_rascunho_ia.json")
DRAFTS, FONTES, VISTOS = "nz:drafts", "nz:drafts:src", "nz:drafts:seen"
TODOS_FEEDS = AN.FEEDS + AN.FEEDS_EXTERIOR  # brasileiros primeiro (têm preferência para completar as fontes)
EXTERIOR = {f[0] for f in AN.FEEDS_EXTERIOR}
API = "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent"
PLAT_CAT = {"Steam": "Steam", "PC": "Steam", "PlayStation": "PlayStation", "Xbox": "Xbox", "Nintendo": "Nintendo"}

# palavras que não ajudam a achar "a mesma notícia" em outro site
VAZIAS = set("""a o as os um uma uns umas de do da dos das em no na nos nas ao aos à às por pelo pela pelos pelas para pra
com sem sob sobre entre ate até e ou mas que se seu sua seus suas ele ela eles elas isso esse essa este esta como mais menos
muito muita ja já ainda tambem também agora hoje vai vao vão sera será foi sao são ser ter tem pode podem novo nova novos novas
the of and for with to in on is are new jogo jogos game games anuncia anunciado anunciada revela revelado revelada chega chegam
ganha ganham confira veja saiba diz dizem segundo apos após data lancamento lançamento trailer video vídeo oficial oficialmente
black friday oferta ofertas desconto descontos preco preço precos preços promocao promoção reduzido barato menos
an its it from after how why what when who will has have had gets get got reveals revealed announces announced
launches launch release released out now just more first here heres could would may might says said update
review preview hands this that your you all over into about than finally coming comes like
""".split())


def log(msg):
    print(msg, flush=True)


# ---------------- Redis (Upstash REST) ----------------
def redis_cfg():
    url = os.environ.get("UPSTASH_REDIS_REST_URL") or os.environ.get("KV_REST_API_URL") or ""
    tok = os.environ.get("UPSTASH_REDIS_REST_TOKEN") or os.environ.get("KV_REST_API_TOKEN") or ""
    return url.rstrip("/"), tok


def redis(cmds):
    url, tok = redis_cfg()
    req = urllib.request.Request(url + "/pipeline", data=json.dumps(cmds).encode("utf-8"),
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        out = json.load(r)
    res = []
    for x in out:
        if isinstance(x, dict) and x.get("error"):
            raise RuntimeError("redis: " + str(x["error"]))
        res.append(x.get("result") if isinstance(x, dict) else None)
    return res


def pares(flat):
    if isinstance(flat, dict):
        return list(flat.items())
    flat = flat or []
    return [(flat[i], flat[i + 1]) for i in range(0, len(flat) - 1, 2)]


# ---------------- textos ----------------
def plano(t):
    return AN.plano(t).strip()


ROMANOS = {"ii": "2", "iii": "3", "iv": "4", "vi": "6", "vii": "7", "viii": "8", "ix": "9"}  # GTA VI = GTA 6
SINONIMOS = {"ceo": "chefe", "presidente": "chefe", "diretor": "chefe", "playstation": "ps", "ps5": "ps", "sony": "ps"}


def palavras(t):
    out = set()
    for w in plano(t).split():
        w = SINONIMOS.get(ROMANOS.get(w, w), ROMANOS.get(w, w))
        if (len(w) >= 3 or w.isdigit()) and w not in VAZIAS:
            out.add(w)
    return out


PESO = {}  # palavra -> peso; palavras que aparecem em muitos títulos do dia (o jogo do momento) valem menos


def calcular_pesos(itens):
    import math
    df = {}
    for it in itens:
        for w in palavras(it["titulo"]):
            df[w] = df.get(w, 0) + 1
    n = max(len(itens), 2)
    PESO.clear()
    # palavra que aparece em 4 títulos ou mais é o "assunto do dia" (Zelda, GTA 6): quase não conta para dizer
    # que duas matérias são a MESMA notícia, senão qualquer coisa sobre o jogo vira uma notícia só
    PESO.update({w: (math.log(n / c) + 0.1) * (1 if c < 4 else 0.25) for w, c in df.items()})


def peso(ws):
    return sum(PESO.get(w, 3.0) for w in ws)


def mesma_noticia(a, b):
    """True se a e b (de sites diferentes) parecem falar da mesma notícia, e não só do mesmo jogo."""
    if a["nome"] == b["nome"] or abs((a["data"] - b["data"]).days) > 3:
        return False
    ta, tb = palavras(a["titulo"]), palavras(b["titulo"])
    comum = ta & tb
    if len(comum) < 2:
        return False
    # precisa cobrir boa parte do título menor E uma parte razoável dos dois juntos
    return peso(comum) / min(peso(ta), peso(tb)) >= 0.5 and peso(comum) / peso(ta | tb) >= 0.25


def texto_da_pagina(url):
    """Parágrafos da matéria original, quando o feed traz só um resumo."""
    try:
        pg = AN.baixar(url, 900_000).decode("utf-8", "ignore")
    except Exception:
        return ""
    m = re.search(r"<article\b.*?</article>", pg, re.S | re.I)
    trecho = m.group(0) if m else pg
    ps = [AN.limpar(p) for p in re.findall(r"<p\b[^>]*>(.*?)</p>", trecho, re.S | re.I)]
    return " ".join(p for p in ps if len(p) > 60)[:TEXTO_MAX]


def texto_da_fonte(it):
    t = it.get("completo") or it["texto"]
    if len(t) < 700:
        pg = texto_da_pagina(it["link"])
        if len(pg) > len(t):
            t = pg
    if it["nome"] in AN.FONTES_PT:
        t = AN.abrasileirar(t)
    return AN.cortar(t, TEXTO_MAX)


def carregar_json(caminho, padrao):
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


def dados_do_site():
    texto = open(os.path.join(SITE, "index.html"), encoding="utf-8").read()
    m = re.search(r'<script id="nz-data" type="application/json">\s*(.*?)\s*</script>', texto, re.S)
    return json.loads(m.group(1)) if m else {"news": []}


def dia_br(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(AN.FUSO).strftime("%d/%m")
    except Exception:
        return ""


def contexto_do_site(fontes):
    """Ofertas, jogos grátis e mais jogados do próprio site que citam um jogo das fontes."""
    base = " " + plano(" ".join(f["titulo"] + " " + f["texto"] for f in fontes)) + " "
    cita = lambda nome: len(plano(nome)) >= 5 and (" " + plano(re.sub(r"[™®©]", "", nome)) + " ") in base
    linhas = []
    of = carregar_json(os.path.join(SITE, "data", "ofertas.json"), {})
    for g in of.get("steam", []):
        if cita(g.get("name", "")):
            linhas.append(f"- Em oferta na Steam (dados de {dia_br(of.get('updated'))}): {g['name']} de {g.get('orig')} por {g.get('price')} ({g.get('discount')}% de desconto).")
    gr = carregar_json(os.path.join(SITE, "data", "gratis.json"), {})
    for g in gr.get("epic", []):
        if cita(g.get("name", "")):
            linhas.append(f"- Grátis na Epic Games Store de {dia_br(g.get('start'))} a {dia_br(g.get('end'))}: {g['name']} (custa {g.get('orig')}).")
    for g in gr.get("steam", []):
        if cita(g.get("name", "")):
            linhas.append(f"- Grátis na Steam (dados de {dia_br(gr.get('updated'))}): {g['name']}.")
    mj = carregar_json(os.path.join(SITE, "data", "maisjogados.json"), {})
    for g in mj.get("games", []):
        if cita(g.get("name", "")):
            linhas.append(f"- Entre os mais jogados da Steam (dados de {dia_br(mj.get('updated'))}): {g['name']}, com {g.get('players'):,} jogadores ao mesmo tempo (pico do dia: {g.get('peak'):,}).".replace(",", "."))
    return "\n".join(linhas[:8])


# ---------------- Gemini ----------------
class LimiteDiario(Exception):
    pass


class Sobrecarga(Exception):  # 503 "high demand" mesmo depois de tentar de novo
    pass


def preencher(modelo, campos):
    """Troca {campo} pelo valor numa passada só (um "{url}" dentro de um título não é trocado)."""
    return re.sub(r"\{(\w+)\}", lambda m: str(campos.get(m.group(1), m.group(0))), modelo)


def montar_pedido(P, fontes, contexto):
    blocos = [preencher(P["fonte"], {"n": i, "nome": f["nome"], "titulo": f["titulo"], "pub": f.get("pub") or "", "url": f["url"], "texto": f["texto"],
                                     "idioma": f.get("idioma") or "português"})
              for i, f in enumerate(fontes, 1)]
    if contexto:
        blocos.append(preencher(P["contexto"], {"contexto": contexto}))
    blocos.append(preencher(P["pedido"], {"qtd": len(fontes)}))
    return {
        "systemInstruction": {"parts": [{"text": P["instrucoes"]}]},
        "contents": [{"role": "user", "parts": [{"text": "\n\n".join(blocos)}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": P["schema"]},
    }


def espera_sugerida(corpo):
    m = re.search(r'"retryDelay"\s*:\s*"(\d+)', corpo)
    return min(max(int(m.group(1)) if m else ESPERA_429_SEG, 10), 90)


def chamar_gemini(pedido, chave):
    """Devolve (JSON gerado, modelo usado). Se o principal estiver sobrecarregado, tenta o reserva."""
    try:
        return chamar_modelo(pedido, chave, MODELO), MODELO
    except Sobrecarga:
        if not MODELO_RESERVA:
            raise
        log(f"   {MODELO} sobrecarregado; tentando {MODELO_RESERVA}…")
        return chamar_modelo(pedido, chave, MODELO_RESERVA), MODELO_RESERVA


def chamar_modelo(pedido, chave, modelo):
    """429 ou erro do servidor: espera e tenta UMA vez mais."""
    for tentativa in (1, 2):
        req = urllib.request.Request(API.format(modelo), data=json.dumps(pedido).encode("utf-8"),
                                     headers={"Content-Type": "application/json", "x-goog-api-key": chave})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                resp = json.load(r)
            break
        except urllib.error.HTTPError as e:
            corpo = e.read().decode("utf-8", "ignore")[:2000]
            if e.code == 429 and re.search(r"PerDay|per day|daily", corpo, re.I):
                raise LimiteDiario("limite diário do plano grátis atingido")
            if (e.code == 429 or e.code >= 500) and tentativa == 1:
                s = espera_sugerida(corpo) if e.code == 429 else 20
                log(f"   Gemini respondeu {e.code}; esperando {s}s para tentar de novo…")
                time.sleep(s)
                continue
            msg = (re.search(r'"message"\s*:\s*"([^"]+)', corpo) or [None, corpo[:200]])[1]
            if e.code == 503:
                raise Sobrecarga(f"Gemini HTTP 503: {msg}")
            raise RuntimeError(f"Gemini HTTP {e.code}: {msg}")
    cand = (resp.get("candidates") or [{}])[0]
    partes = (cand.get("content") or {}).get("parts") or []
    txt = "".join(p.get("text", "") for p in partes if not p.get("thought"))
    if not txt:
        raise RuntimeError("resposta vazia do Gemini (" + str(cand.get("finishReason") or resp.get("promptFeedback")) + ")")
    return json.loads(txt)


def limpa(s, n):
    s = re.sub(r"\*\*|__|^#+\s*", "", str(s or ""), flags=re.M)
    return re.sub(r"\s+", " ", s).strip()[:n]


def validar(g):
    """Confere e arruma o JSON do Gemini; erro se vier inutilizável."""
    if not isinstance(g, dict):
        raise RuntimeError("o Gemini não devolveu um objeto JSON")
    paras = g.get("texto")
    if isinstance(paras, str):
        paras = re.split(r"\n\s*\n", paras)
    paras = [limpa(p, 3000) for p in (paras or []) if limpa(p, 3000)]
    paras = [p for p in paras if not re.match(r"^fontes?\s*:", p, re.I)]
    out = {
        "titulo": limpa(g.get("titulo"), 200).rstrip("."),
        "subtitulo": limpa(g.get("subtitulo"), 300),
        "texto": "\n\n".join(paras),
        "tags": [limpa(t, 40).lower() for t in (g.get("tags") or []) if limpa(t, 40)][:8],
        "plataforma": g.get("plataforma") if g.get("plataforma") in ("PC", "Steam", "PlayStation", "Xbox", "Nintendo", "Mobile", "Geral") else "Geral",
        "minha_opiniao": limpa(g.get("minha_opiniao"), 1000),
    }
    n = len(out["texto"].split())
    if not out["titulo"] or n < 80:
        raise RuntimeError(f"matéria curta demais ou sem título ({n} palavras)")
    return out


# ---------------- principal ----------------
def agora():
    return datetime.now(AN.FUSO).replace(microsecond=0)


def faxina():
    """Apaga do banco os rascunhos velhos e os links usados há muito tempo."""
    flat, = redis([["HGETALL", DRAFTS]])
    limite_feito = (agora() - timedelta(days=GUARDAR_DIAS)).isoformat()
    limite_pend = (agora() - timedelta(days=PENDENTE_DIAS)).isoformat()
    velhos = []
    for k, v in pares(flat):
        try:
            d = json.loads(v)
        except Exception:
            velhos.append(k)
            continue
        quando = d.get("atualizado") or d.get("criado") or ""
        if (d.get("status") != "rascunho" and quando < limite_feito) or (d.get("status") == "rascunho" and (d.get("criado") or "") < limite_pend):
            velhos.append(k)
    cmds = [["ZREMRANGEBYSCORE", VISTOS, 0, int((time.time() - 45 * 86400) * 1000)]]
    if velhos:
        cmds += [["HDEL", DRAFTS] + velhos, ["HDEL", FONTES] + velhos]
    redis(cmds)
    if velhos:
        log(f"Faxina: {len(velhos)} rascunho(s) antigo(s) apagado(s).")


def main():
    teste = "--teste" in sys.argv
    chave = os.environ.get("GEMINI_API_KEY", "").strip()
    url, tok = redis_cfg()
    if not teste and (not chave or not url or not tok):
        falta = [n for n, v in (("GEMINI_API_KEY", chave), ("UPSTASH_REDIS_REST_URL", url), ("UPSTASH_REDIS_REST_TOKEN", tok)) if not v]
        log("Configuração incompleta: falta " + ", ".join(falta) + ". Nenhum rascunho gerado.")
        sys.exit(1)

    P = carregar_json(PROMPT, None)
    if not P:
        log("Não consegui ler " + PROMPT)
        sys.exit(1)

    # o que já foi usado: links das fontes de rascunhos anteriores + notícias que já estão no site
    vistos = set()
    if url and tok:
        try:
            if not teste:
                faxina()
            vistos = set(redis([["ZRANGE", VISTOS, 0, -1]])[0] or [])
        except Exception as e:
            log(f"[erro] banco de rascunhos (Redis): {e}")
            if not teste:
                sys.exit(1)
    dados = dados_do_site()
    no_site = {AN.chave(n.get("url")) for n in dados.get("news", [])} | {AN.chave(s.get("url")) for n in dados.get("news", []) for s in n.get("sources") or []}
    tit_site = {re.sub(r"\W+", "", n.get("title", "").lower()) for n in dados.get("news", [])}
    trend = [x for x in dados.get("trend", []) if isinstance(x, dict) and x.get("terms")]

    coletados = []
    for nome, feed, so_games in TODOS_FEEDS:
        try:
            itens = AN.ler_feed(nome, feed, so_games)
            log(f"[ok]   {nome}: {len(itens)} itens lidos")
            coletados += itens
        except Exception as e:  # uma fonte fora do ar não derruba as outras
            log(f"[erro] {nome}: {e}")

    hoje = agora().date()
    usados = set(vistos) | no_site
    recentes = [it for it in coletados if hoje - timedelta(days=IDADE_MAX_DIAS) <= it["data"] <= hoje + timedelta(days=1)]
    calcular_pesos(recentes)
    for it in recentes:
        it["k"] = AN.chave(it["link"])
        it["alta"] = AN.assunto(it["titulo"], AN.primeira_frase(it["texto"]), trend)
        it["grupo"] = [o for o in recentes if o is not it and mesma_noticia(it, o)]
    # assuntos em alta primeiro, depois as notícias que mais sites deram, depois as mais novas
    fila = sorted(recentes, key=lambda x: x["pub"], reverse=True)  # a ordenação abaixo mantém esta ordem nos empates
    fila.sort(key=lambda x: (x["alta"] is None, x["alta"] or 0, -len({o["nome"] for o in x["grupo"]})))

    novos, ja_cobertas, erros, por_assunto, tentadas, seguidos, por_site = [], [], 0, {}, 0, 0, {}
    for it in fila:
        if len(novos) >= MAX_POR_EXECUCAO or tentadas >= MAX_TENTATIVAS:
            break
        if seguidos >= MAX_ERROS_SEGUIDOS:
            log(f"\nO Gemini falhou {seguidos} vezes seguidas: o resto fica para a próxima execução.")
            break
        if it["alta"] is not None and por_assunto.get(it["alta"], 0) >= MAX_POR_ASSUNTO:
            continue
        if por_site.get(it["nome"], 0) >= MAX_POR_SITE:
            continue
        if it["k"] in usados or re.sub(r"\W+", "", it["titulo"].lower()) in tit_site:
            continue
        # a mesma notícia (de outro site) já virou rascunho ou está no site: não gera outra
        if any(o["k"] in usados for o in it["grupo"]):
            ja_cobertas.append(it["k"])
            usados.add(it["k"])
            continue
        outras, nomes = [], {it["nome"]}
        ordem = [f[0] for f in TODOS_FEEDS]
        for o in sorted(it["grupo"], key=lambda o: ordem.index(o["nome"])):
            if o["nome"] not in nomes and o["k"] not in usados and len(outras) < MAX_FONTES - 1:
                outras.append(o)
                nomes.add(o["nome"])
        grupo = [it] + outras
        for g in grupo:
            usados.add(g["k"])
        log(f"\n• {it['titulo'][:90]}  [{', '.join(g['nome'] for g in grupo)}]")
        if teste:
            for g in outras:
                log(f"     + {g['nome']}: {g['titulo'][:80]}")
            novos.append(it)
            if it["alta"] is not None:
                por_assunto[it["alta"]] = por_assunto.get(it["alta"], 0) + 1
            por_site[it["nome"]] = por_site.get(it["nome"], 0) + 1
            continue

        fontes = [{"nome": g["nome"], "titulo": g["titulo"], "url": g["link"], "pub": g["pub"], "texto": texto_da_fonte(g),
                   "idioma": "inglês" if g["nome"] in EXTERIOR else "português"} for g in grupo]
        contexto = contexto_do_site(fontes)
        img, credito = "", ""
        for g in grupo:
            img = g["img"] or AN.og_image(g["link"])
            if img:
                credito = "divulgação / " + g["nome"]
                break
        tentadas += 1
        try:
            if novos or erros:
                time.sleep(PAUSA_SEG)
            resposta, modelo = chamar_gemini(montar_pedido(P, fontes, contexto), chave)
            gerado = validar(resposta)
        except LimiteDiario as e:
            log(f"   [pausa] {e}. O resto fica para a próxima execução.")
            for g in grupo:
                usados.discard(g["k"])
            break
        except Exception as e:
            erros += 1
            seguidos += 1
            log(f"   [erro] {e}. Fica para a próxima execução.")
            for g in grupo:  # não marca como usada: volta na próxima execução
                usados.discard(g["k"])
            continue
        seguidos = 0

        did = "r" + hashlib.sha1(it["k"].encode()).hexdigest()[:11]
        # a plataforma dita pelo Gemini vale mais que as palavras-chave ("Majora's Mask" contém "major", de Esports)
        cat = PLAT_CAT.get(gerado["plataforma"]) or AN.categoria(gerado["titulo"] + " " + it["titulo"], gerado["texto"])
        quando = agora().isoformat()
        rascunho = {"id": did, "criado": quando, "atualizado": quando, "status": "rascunho", **gerado,
                    "cat": cat, "img": img, "credito": credito, "alta": trend[it["alta"]]["name"] if it["alta"] is not None else "",
                    "fontes": [{"nome": f["nome"], "titulo": f["titulo"], "url": f["url"], "pub": f["pub"]} for f in fontes],
                    "modelo": modelo}
        ts = int(time.time() * 1000)
        try:
            redis([["HSET", DRAFTS, did, json.dumps(rascunho, ensure_ascii=False)],
                   ["HSET", FONTES, did, json.dumps({"fontes": fontes, "contexto": contexto}, ensure_ascii=False)],
                   ["ZADD", VISTOS] + [x for f in fontes for x in (ts, AN.chave(f["url"]))]])
        except Exception as e:
            log(f"   [erro] não consegui gravar o rascunho: {e}")
            break
        novos.append(rascunho)
        if it["alta"] is not None:
            por_assunto[it["alta"]] = por_assunto.get(it["alta"], 0) + 1
        por_site[it["nome"]] = por_site.get(it["nome"], 0) + 1
        log(f"   ✓ rascunho: {gerado['titulo']}  ({len(gerado['texto'].split())} palavras, {len(fontes)} fonte(s))")

    if ja_cobertas and not teste:
        try:
            redis([["ZADD", VISTOS] + [x for k in ja_cobertas for x in (int(time.time() * 1000), k)]])
        except Exception as e:
            log(f"[erro] {e}")
    log(f"\n{len(novos)} rascunho(s) {'que seriam gerados' if teste else 'novos'}; {erros} erro(s); {len(ja_cobertas)} notícia(s) repetidas de outro site puladas.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # nunca quebra nada: só registra
        log(f"[erro inesperado] {e!r}")
        sys.exit(1)
