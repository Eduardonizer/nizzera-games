#!/usr/bin/env python3
"""Posta no Discord do Nizzera Games o que é novo no site (via webhooks, um por canal).

O que vai para onde:
  * Notícias (robô e painel admin): TODAS_AS_NOTICIAS + o canal da categoria (Lançamentos, Steam,
    PlayStation, Xbox, Nintendo, Game Pass, Serviços, Esports, Eventos). Sem webhook da categoria: só TODAS.
  * Reviews: REVIEWS (com a nota).          * Ofertas da semana: OFERTAS_DA_SEMANA (resumo, até 10 por mensagem).
  * Jogos grátis: JOGOS_GRATIS.             * Eventos novos da página /eventos/: EVENTOS.
  * Novidades do site (manual):  python discord_sync.py --novidade "Texto da novidade"

Como roda: no GitHub Actions, depois do gerar_paginas.py, em toda execução (a diária e a que o
painel admin dispara ao publicar). Os webhooks vêm de variáveis de ambiente DISCORD_WEBHOOK_*
(Secrets do GitHub); no computador, do arquivo discord_webhooks.env na raiz do repo (fora do git).

Sem duplicar: o que já foi postado fica em scripts/discord_enviados.json (só ids do site, nada secreto).
Na 1ª execução nada é postado: tudo o que já existe é marcado como enviado (use --backfill para postar).
Se o Discord falhar, só registra no log: nunca derruba o robô do site.

Uso:  python discord_sync.py            posta o que é novo
      python discord_sync.py --teste    manda uma mensagem de teste em #novidades-do-site
      python discord_sync.py --seco     mostra o que seria postado, sem postar nem marcar
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import SITE_URL  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)                      # nizzera-games/
REPO = os.path.dirname(RAIZ)                      # raiz do repositório
SITE = os.path.join(RAIZ, "SITE")
ESTADO = os.path.join(AQUI, "discord_enviados.json")
ENV_LOCAL = os.path.join(REPO, "discord_webhooks.env")
BLOCO = re.compile(r'<script id="nz-data" type="application/json">\s*(.*?)\s*</script>', re.S)

NOME = "Nizzera Games"
AVATAR = f"{SITE_URL}/assets/icons/icon-192.png"
UA = f"DiscordBot ({SITE_URL}, 1.0)"   # o Discord recusa pedidos sem User-Agent próprio
PAUSA = 1.1                            # segundos entre mensagens (limite do Discord)
MANTER_DIAS = 180                      # ids mais velhos que isso saem do discord_enviados.json

CANAIS = ["TODAS_AS_NOTICIAS", "LANCAMENTOS", "STEAM", "PLAYSTATION", "XBOX", "NINTENDO", "GAME_PASS",
          "SERVICOS", "ESPORTS", "EVENTOS", "REVIEWS", "OFERTAS_DA_SEMANA", "JOGOS_GRATIS", "NOVIDADES_DO_SITE"]
CATEGORIA_CANAL = {"Lançamentos": "LANCAMENTOS", "Steam": "STEAM", "PlayStation": "PLAYSTATION", "Xbox": "XBOX",
                   "Nintendo": "NINTENDO", "Game Pass": "GAME_PASS", "Serviços": "SERVICOS", "Esports": "ESPORTS",
                   "Eventos": "EVENTOS"}
COR_SITE = 0x2433F0
CORES = {"Steam": 0x1B2838, "PlayStation": 0x0070D1, "Xbox": 0x107C10, "Game Pass": 0x107C10, "Nintendo": 0xE60012}


# ---------------- webhooks ----------------
def carregar_env_local():
    """No computador: lê o discord_webhooks.env (as variáveis já definidas têm prioridade)."""
    try:
        with open(ENV_LOCAL, encoding="utf-8") as f:
            for linha in f:
                linha = linha.strip()
                if linha and not linha.startswith("#") and "=" in linha:
                    k, v = linha.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


def webhook(canal):
    url = os.environ.get("DISCORD_WEBHOOK_" + canal, "").strip()
    return url if re.match(r"^https://(discord|discordapp)\.com/api/webhooks/\d+/[\w-]+$", url) else ""


def enviar(canal, embeds, texto=""):
    """Manda uma mensagem (até 10 embeds) no canal. Devolve True se o Discord aceitou.
    Nunca levanta erro e nunca imprime o URL do webhook."""
    url = webhook(canal)
    if not url:
        print(f"[discord] sem webhook para {canal}: pulei")
        return False
    corpo = {"username": NOME, "avatar_url": AVATAR, "embeds": embeds[:10], "allowed_mentions": {"parse": []}}
    if texto:
        corpo["content"] = texto[:2000]
    dados = json.dumps(corpo).encode("utf-8")
    for tentativa in range(4):
        req = urllib.request.Request(url + "?wait=true", data=dados, method="POST",
                                     headers={"Content-Type": "application/json", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=20):
                pass
            time.sleep(PAUSA)
            return True
        except urllib.error.HTTPError as e:
            if e.code == 429:  # limite do Discord: espera o tempo que ele pede e tenta de novo
                try:
                    espera = float(json.loads(e.read().decode("utf-8") or "{}").get("retry_after", 2))
                except Exception:
                    espera = float(e.headers.get("Retry-After") or 2)
                print(f"[discord] {canal}: limite de envio, esperando {espera:.1f}s")
                time.sleep(min(espera, 60) + 0.3)
                continue
            detalhe = ""
            try:
                detalhe = e.read().decode("utf-8")[:200]
            except Exception:
                pass
            print(f"[discord] {canal}: erro HTTP {e.code} {detalhe}")
            return False
        except Exception as e:
            print(f"[discord] {canal}: falhou ({type(e).__name__}: {e})")
            if tentativa < 1:
                time.sleep(3)
                continue
            return False
    return False


# ---------------- montar os embeds ----------------
def corte(t, n):
    t = re.sub(r"\s+", " ", str(t or "")).strip()
    return t if len(t) <= n else t[:n - 1].rsplit(" ", 1)[0] + "…"


def imagem(u):
    return u if re.match(r"^https://\S+$", u or "") else ""


def quando(d):
    """'2026-11-06' -> ISO com fuso de Brasília (o Discord mostra no horário de quem lê)."""
    if re.match(r"^\d{4}-\d{2}-\d{2}$", d or ""):
        return d + "T12:00:00-03:00"
    if re.match(r"^\d{4}-\d{2}-\d{2}T", d or ""):
        return d
    return datetime.now(timezone.utc).isoformat()


def embed_noticia(n):
    cat = n.get("cat") or "Notícias"
    e = {"title": corte(n.get("title"), 250), "url": f"{SITE_URL}/noticia/{n['slug']}/",
         "description": corte(n.get("sum") or n.get("body"), 350), "color": CORES.get(cat, COR_SITE),
         "footer": {"text": f"{cat} · {NOME}"}, "timestamp": quando(n.get("date"))}
    if imagem(n.get("img")):
        e["image"] = {"url": n["img"]}
    if n.get("src"):
        e["author"] = {"name": f"Fonte: {corte(n['src'], 80)}"}
    return e


def slug_review(r):
    s = r.get("slug", "")
    if re.match(r"^[a-z0-9-]{1,90}$", s or ""):
        return s
    t = re.sub(r"[^a-z0-9]+", "-", str(r.get("game", "")).lower()).strip("-")
    return f"{int(r.get('id') or 0)}-{t}"


def embed_review(r):
    nota = r.get("score")
    maximo = r.get("scoreMax") or 100
    campos = []
    if nota not in (None, ""):
        campos.append({"name": "Nota", "value": f"**{nota}** de {maximo}" + (f" · {r['scoreLabel']}" if r.get("scoreLabel") else ""), "inline": True})
    if r.get("platforms"):
        campos.append({"name": "Plataformas", "value": corte(r["platforms"], 200), "inline": True})
    e = {"title": corte("Review: " + str(r.get("game") or ""), 250), "url": f"{SITE_URL}/review/{slug_review(r)}/",
         "description": corte(r.get("verdict"), 400), "color": 0xFFD23F, "fields": campos,
         "footer": {"text": f"Reviews · {NOME}"}, "timestamp": quando(r.get("date"))}
    if imagem(r.get("img")):
        e["image"] = {"url": r["img"]}
    return e


def embed_oferta(o):
    e = {"title": corte(o.get("name"), 250), "url": f"https://store.steampowered.com/app/{int(o['id'])}/",
         "color": 0x1B2838,
         "description": f"**-{o.get('discount')}%** · ~~{o.get('orig', '')}~~ por **{o.get('price', '')}** na Steam",
         "footer": {"text": f"Ofertas da semana · {NOME}"}}
    if imagem(o.get("img")):
        e["thumbnail"] = {"url": o["img"]}
    return e


def embed_gratis(g, loja):
    if loja == "epic":
        fim = ""
        try:
            t = datetime.strptime(g["end"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) - timedelta(hours=3)
            fim = f" até {t.day:02d}/{t.month:02d} às {t:%H:%M} (Brasília)"
        except Exception:
            pass
        desc = f"**Grátis na Epic Games Store**{fim}" + (f" · antes {g['orig']}" if g.get("orig") else "")
        url, cor = g.get("url") or "https://store.epicgames.com/pt-BR/free-games", 0x313131
    else:
        tipo = "Fim de semana grátis" if g.get("kind") == "weekend" else "Grátis"
        desc = f"**{tipo} na Steam**" + (f" · e com -{g['discount']}% por {g['price']}" if g.get("discount") else "")
        url, cor = f"https://store.steampowered.com/app/{int(g['id'])}/", 0x1B2838
    e = {"title": corte(g.get("name"), 250), "url": url, "description": desc, "color": cor,
         "footer": {"text": f"Jogos grátis · {NOME}"}}
    if imagem(g.get("img")):
        e["image"] = {"url": g["img"]}
    return e


def embed_evento(x):
    datas = x["start"] if x["start"] == x.get("end") else f"{x['start']} a {x.get('end')}"
    try:
        a = datetime.strptime(x["start"], "%Y-%m-%d")
        b = datetime.strptime(x.get("end") or x["start"], "%Y-%m-%d")
        datas = f"{a:%d/%m/%Y}" if a == b else f"{a:%d/%m} a {b:%d/%m/%Y}"
    except Exception:
        pass
    campos = [{"name": "Quando", "value": datas + (f" · {x['time']}" if x.get("time") else ""), "inline": True}]
    if x.get("mode"):
        campos.append({"name": "Formato", "value": x["mode"], "inline": True})
    onde = " · ".join(v for v in [x.get("venue"), x.get("place")] if v)
    if onde:
        campos.append({"name": "Onde", "value": corte(onde, 200), "inline": False})
    if x.get("prize"):
        campos.append({"name": "Premiação", "value": x["prize"], "inline": True})
    titulo = f"{x['game']}: {x['name']}" if x.get("game") else x["name"]
    return {"title": corte(titulo, 250), "url": f"{SITE_URL}/eventos/", "description": corte(x.get("info"), 300),
            "color": COR_SITE, "fields": campos, "footer": {"text": f"{x.get('kind') or 'Evento'} · {NOME}"}}


# ---------------- o que é novo ----------------
def ler_json(caminho, padrao):
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


def itens_do_site():
    """Lista de (chave única, tipo, item) de tudo o que pode ir para o Discord."""
    out = []
    try:
        texto = open(os.path.join(SITE, "index.html"), encoding="utf-8").read()
        dados = json.loads(BLOCO.search(texto).group(1))
    except Exception as e:
        print(f"[discord] não consegui ler o index.html: {e}")
        dados = {}
    for n in dados.get("news", []):
        if n.get("slug") and n.get("title"):
            out.append(("noticia:" + n["slug"], "noticia", n))
    for r in dados.get("reviews", []):
        if r.get("game"):
            out.append(("review:" + slug_review(r), "review", r))
    of = ler_json(os.path.join(SITE, "data", "ofertas.json"), {})
    for o in of.get("steam", []):
        if o.get("id") and o.get("name"):
            out.append((f"oferta:steam:{o['id']}:{o.get('price')}", "oferta", o))
    gr = ler_json(os.path.join(SITE, "data", "gratis.json"), {})
    for g in gr.get("epic", []):
        if g.get("name"):
            out.append((f"gratis:epic:{g.get('url') or g['name']}:{g.get('start', '')}", "gratis_epic", g))
    for g in gr.get("steam", []):
        if g.get("id") and g.get("name"):
            out.append((f"gratis:steam:{g['id']}:{g.get('kind', '')}", "gratis_steam", g))
    ev = ler_json(os.path.join(SITE, "data", "eventos.json"), {})
    for x in ev.get("events", []):
        if x.get("name") and x.get("start"):
            out.append((f"evento:{x.get('game', '')}:{x['name']}:{x['start']}", "evento", x))
    return out


def salvar_estado(enviados):
    limite = (datetime.now(timezone.utc) - timedelta(days=MANTER_DIAS)).date().isoformat()
    enviados = {k: v for k, v in enviados.items() if v >= limite}
    with open(ESTADO, "w", encoding="utf-8") as f:
        json.dump({"sobre": "Itens do site já postados no Discord (scripts/discord_sync.py). Só ids, nada secreto.",
                   "enviados": dict(sorted(enviados.items()))}, f, ensure_ascii=False, indent=1)
        f.write("\n")


def sincronizar(backfill=False, seco=False):
    if not webhook("TODAS_AS_NOTICIAS") and not any(webhook(c) for c in CANAIS):
        print("[discord] nenhum webhook configurado (DISCORD_WEBHOOK_*): nada a fazer.")
        return
    hoje = datetime.now(timezone.utc).date().isoformat()
    primeira = not os.path.exists(ESTADO)
    enviados = ler_json(ESTADO, {}).get("enviados", {})
    novos = [x for x in itens_do_site() if x[0] not in enviados]
    if primeira and not backfill:
        for chave, _, _ in novos:
            enviados[chave] = hoje
        if not seco:
            salvar_estado(enviados)
        print(f"[discord] 1ª execução: {len(novos)} itens já existentes marcados como enviados (nada foi postado).")
        return
    if not novos:
        print("[discord] nada novo para postar.")
        return

    print(f"[discord] {len(novos)} itens novos.")
    def marcar(chave):
        enviados[chave] = hoje

    # notícias e reviews: uma mensagem por item (notícias também no canal da categoria)
    for chave, tipo, x in novos:
        if tipo == "noticia":
            emb = embed_noticia(x)
            canal_cat = CATEGORIA_CANAL.get(x.get("cat"))
            if seco:
                print(f"  notícia → TODAS_AS_NOTICIAS{' + ' + canal_cat if canal_cat else ''}: {x['title'][:70]}")
                continue
            ok = enviar("TODAS_AS_NOTICIAS", [emb])
            if canal_cat and webhook(canal_cat):
                ok = enviar(canal_cat, [emb]) or ok
            if ok:
                marcar(chave)
        elif tipo == "review":
            if seco:
                print(f"  review → REVIEWS: {x.get('game')}")
                continue
            if enviar("REVIEWS", [embed_review(x)]):
                marcar(chave)

    # ofertas, jogos grátis e eventos: agrupados, até 10 por mensagem
    grupos = [("OFERTAS_DA_SEMANA", "oferta", "🔥 **Novas ofertas da semana na Steam**", lambda x, t: embed_oferta(x)),
              ("JOGOS_GRATIS", "gratis", "🎁 **Jogos grátis**", lambda x, t: embed_gratis(x, "epic" if t == "gratis_epic" else "steam")),
              ("EVENTOS", "evento", "📅 **Novos eventos no calendário**", lambda x, t: embed_evento(x))]
    for canal, prefixo, titulo, fazer in grupos:
        itens = [(c, t, x) for c, t, x in novos if t.startswith(prefixo)]
        for i in range(0, len(itens), 10):
            lote = itens[i:i + 10]
            if seco:
                print(f"  {len(lote)} → {canal}: " + ", ".join(x.get("name", "")[:30] for _, _, x in lote))
                continue
            texto = titulo + (f" — veja tudo em {SITE_URL}/{'ofertas' if prefixo == 'oferta' else 'gratis' if prefixo == 'gratis' else 'eventos'}/" if i == 0 else "")
            if enviar(canal, [fazer(x, t) for _, t, x in lote], texto):
                for c, _, _ in lote:
                    marcar(c)
    if not seco:
        salvar_estado(enviados)


def main():
    ap = argparse.ArgumentParser(description="Posta no Discord o que é novo no site.")
    ap.add_argument("--teste", action="store_true", help="manda uma mensagem de teste em #novidades-do-site")
    ap.add_argument("--novidade", metavar="TEXTO", help="posta uma novidade do site em #novidades-do-site")
    ap.add_argument("--backfill", action="store_true", help="na 1ª execução, posta também o que já existe")
    ap.add_argument("--seco", action="store_true", help="só mostra o que seria postado")
    a = ap.parse_args()
    carregar_env_local()
    try:
        if a.teste:
            ok = enviar("NOVIDADES_DO_SITE", [{
                "title": "Teste da integração com o site ✅", "url": SITE_URL + "/",
                "description": "Se você está vendo esta mensagem, o site Nizzera Games já consegue postar aqui no Discord.",
                "color": COR_SITE, "footer": {"text": f"Novidades do site · {NOME}"},
                "timestamp": datetime.now(timezone.utc).isoformat(), "thumbnail": {"url": AVATAR}}])
            print("[discord] teste enviado." if ok else "[discord] o teste falhou (veja o erro acima).")
            return
        if a.novidade:
            ok = enviar("NOVIDADES_DO_SITE", [{"title": "Novidade no site", "url": SITE_URL + "/",
                                               "description": corte(a.novidade, 3000), "color": COR_SITE,
                                               "footer": {"text": f"Novidades do site · {NOME}"},
                                               "timestamp": datetime.now(timezone.utc).isoformat()}])
            print("[discord] novidade postada." if ok else "[discord] não consegui postar a novidade.")
            return
        sincronizar(backfill=a.backfill, seco=a.seco)
    except Exception as e:  # o Discord nunca pode derrubar o robô do site
        print(f"[discord] erro inesperado (ignorado): {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
