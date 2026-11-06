#!/usr/bin/env python3
"""Prepara os temas da Tier List (página /tierlist/).

Lê cada tema em SITE/data/tierlists/<slug>.json, baixa as capas dos jogos para
SITE/assets/tierlist/ e grava o caminho de cada capa no próprio tema. Também gera
SITE/data/tierlists/index.json, a lista de temas que a página mostra no seletor.

As capas precisam ficar no próprio site: imagens de outro endereço "sujam" o canvas
e o navegador não deixa exportar a imagem da tier list.

Formato de um tema (o painel admin grava neste mesmo formato):
  {
   "slug": "jogos-do-gta",               endereço: /tierlist/?tema=jogos-do-gta
   "title": "Jogos do GTA",
   "description": "Frase curta que aparece no seletor",
   "order": 1,                            opcional: posição no seletor (menor primeiro)
   "games": [
    {"name": "GTA V", "appid": 271590},   jogo da Steam: a capa vem pelo AppID
    {"name": "Zelda", "src": "https://..."}  fora da Steam: link de uma imagem (é baixada e hospedada aqui)
   ]
  }
O script completa cada jogo com "id" (fixo, usado para lembrar a montagem de cada pessoa)
e "img" (caminho da capa no site). Não precisa escrever esses dois à mão.

Se uma capa falhar, o script avisa e mantém a anterior: nunca apaga o que já funcionava.
Uso manual:  python scripts/atualizar_tierlists.py
Só usa a biblioteca padrão.
"""
import hashlib, json, os, re, sys, urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_paginas import slugify  # mesma regra de endereço do resto do site

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(RAIZ, "SITE")
PASTA = os.path.join(SITE, "data", "tierlists")
CAPAS = os.path.join(SITE, "assets", "tierlist")
INDICE = os.path.join(PASTA, "index.json")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import USER_AGENT as UA  # noqa: E402  (scripts/config.py)
APPDETAILS = "https://store.steampowered.com/api/appdetails?appids={}&filters=basic&l=brazilian"
# endereço antigo da capa: funciona para quase todos os jogos se a API da Steam falhar
CAPA_PADRAO = "https://cdn.akamai.steamstatic.com/steam/apps/{}/header.jpg"
MAX_BYTES = 2_000_000
SLUG_OK = re.compile(r"^[a-z0-9-]{2,60}$")
IMG_OK = re.compile(r"^/assets/tierlist/[a-z0-9._-]+$")
TIPOS = {b"\xff\xd8\xff": ".jpg", b"\x89PNG": ".png", b"RIFF": ".webp"}


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read(MAX_BYTES + 1)


def extensao(dados):
    """Confere pelos primeiros bytes que é mesmo uma imagem (e não uma página de erro)."""
    for magica, ext in TIPOS.items():
        if dados.startswith(magica) and (ext != ".webp" or dados[8:12] == b"WEBP"):
            return ext
    return ""


def capa_steam(appid):
    """Endereço da capa (header) que a própria Steam informa, e o nome do jogo."""
    try:
        d = json.loads(baixar(APPDETAILS.format(appid)))[str(appid)]
        if d.get("success"):
            info = d.get("data") or {}
            url = info.get("header_image") or ""
            if url.startswith("https://"):
                return url, info.get("name", "")
    except Exception as e:
        print(f"[aviso] Steam {appid}: {e}")
    return CAPA_PADRAO.format(appid), ""


def salvar_capa(jogo):
    """Baixa a capa do jogo para assets/tierlist/ e devolve o caminho no site (ou "" se falhar)."""
    appid, src = jogo.get("appid"), jogo.get("src", "")
    if appid:
        base, (url, nome_steam) = str(appid), capa_steam(appid)
        if nome_steam and not jogo.get("name"):
            jogo["name"] = nome_steam
    elif src:
        base, url = "u" + hashlib.sha1(src.encode()).hexdigest()[:12], src
    else:
        return ""
    try:
        dados = baixar(url)
    except Exception as e:
        print(f"[erro] capa de {jogo.get('name') or base}: {e}")
        return ""
    ext = extensao(dados)
    if not ext or len(dados) > MAX_BYTES:
        print(f"[erro] capa de {jogo.get('name') or base}: o endereço não trouxe uma imagem válida (jpg, png ou webp até 2 MB)")
        return ""
    os.makedirs(CAPAS, exist_ok=True)
    with open(os.path.join(CAPAS, base + ext), "wb") as f:
        f.write(dados)
    print(f"[ok]   capa de {jogo.get('name') or base}")
    return "/assets/tierlist/" + base + ext


def precisa_baixar(jogo):
    img = jogo.get("img", "")
    if not IMG_OK.match(img or "") or not os.path.isfile(os.path.join(SITE, img.lstrip("/"))):
        return True
    # trocaram o AppID ou o link da imagem: a capa antiga não serve mais
    nome = os.path.splitext(os.path.basename(img))[0]
    if jogo.get("appid"):
        return nome != str(jogo["appid"])
    return bool(jogo.get("src")) and nome != "u" + hashlib.sha1(jogo["src"].encode()).hexdigest()[:12]


def arrumar(tema, arquivo):
    """Valida o tema, completa id/img de cada jogo e devolve o tema limpo (ou None se for inválido)."""
    slug = tema.get("slug") or os.path.splitext(arquivo)[0]
    if not SLUG_OK.match(slug or "") or not str(tema.get("title") or "").strip():
        print(f"[erro] {arquivo}: precisa de \"title\" e de um \"slug\" só com letras minúsculas, números e hífen")
        return None
    jogos, ids = [], set()
    for j in tema.get("games") or []:
        if not isinstance(j, dict):
            continue
        jogo = {"name": str(j.get("name") or "").strip()[:80]}
        try:
            if j.get("appid"):
                jogo["appid"] = int(j["appid"])
        except (TypeError, ValueError):
            print(f"[erro] {arquivo}: AppID inválido em {jogo['name'] or j}")
        if not jogo.get("appid") and re.match(r"^https://\S+$", str(j.get("src") or "")):
            jogo["src"] = j["src"]
        if not jogo["name"] and not jogo.get("appid"):
            continue
        jogo["img"] = j.get("img", "") if IMG_OK.match(str(j.get("img") or "")) else ""
        if precisa_baixar(jogo):
            antiga = jogo["img"] if jogo["img"] and os.path.isfile(os.path.join(SITE, jogo["img"].lstrip("/"))) else ""
            jogo["img"] = salvar_capa(jogo) or antiga  # falhou: fica a capa anterior, se existir
        jogo["name"] = jogo["name"] or f"Jogo {jogo.get('appid')}"
        # id fixo: a montagem salva no navegador de cada pessoa usa esse id
        jid = j.get("id") if re.match(r"^[a-z0-9-]{1,60}$", str(j.get("id") or "")) else slugify(jogo["name"])
        while jid in ids:
            jid += "-2"
        ids.add(jid)
        jogos.append({"id": jid, **jogo})
    out = {"slug": slug, "title": str(tema["title"]).strip()[:80],
           "description": str(tema.get("description") or "").strip()[:200]}
    if isinstance(tema.get("order"), (int, float)):
        out["order"] = tema["order"]
    out["games"] = jogos
    return out


def gravar_json(caminho, dados):
    """Só grava se mudou (evita commits e deploys à toa). Devolve True se gravou."""
    texto = json.dumps(dados, ensure_ascii=False, indent=1) + "\n"
    try:
        if open(caminho, encoding="utf-8").read() == texto:
            return False
    except FileNotFoundError:
        pass
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(texto)
    return True


def main():
    if not os.path.isdir(PASTA):
        print("Nenhum tema de tier list (pasta data/tierlists não existe).")
        return
    temas, mudou = [], 0
    for arquivo in sorted(os.listdir(PASTA)):
        if not arquivo.endswith(".json") or arquivo == "index.json":
            continue
        caminho = os.path.join(PASTA, arquivo)
        try:
            tema = json.load(open(caminho, encoding="utf-8"))
        except Exception as e:
            print(f"[erro] {arquivo}: JSON inválido ({e}); tema ignorado")
            continue
        limpo = arrumar(tema, arquivo)
        if not limpo:
            continue
        mudou += gravar_json(caminho, limpo)
        temas.append(limpo)
        sem_capa = [j["name"] for j in limpo["games"] if not j["img"]]
        if sem_capa:
            print(f"[aviso] {limpo['title']}: sem capa para {', '.join(sem_capa)}")

    temas.sort(key=lambda t: (t.get("order", 999), t["title"].lower()))
    indice = [{"slug": t["slug"], "title": t["title"], "description": t["description"], "count": len(t["games"]),
               "covers": [j["img"] for j in t["games"] if j["img"]][:4]} for t in temas]
    try:
        antigo = json.load(open(INDICE, encoding="utf-8"))
    except Exception:
        antigo = {}
    if antigo.get("themes") != indice:
        mudou += gravar_json(INDICE, {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "themes": indice})

    # apaga capas que nenhum tema usa mais (só dentro de assets/tierlist/, que é deste script)
    usadas = {os.path.basename(j["img"]) for t in temas for j in t["games"] if j["img"]}
    removidas = 0
    if os.path.isdir(CAPAS):
        for nome in os.listdir(CAPAS):
            if nome not in usadas and re.match(r"^[a-z0-9._-]+\.(jpg|png|webp)$", nome):
                os.remove(os.path.join(CAPAS, nome))
                removidas += 1
    print(f"{len(temas)} temas · {mudou} arquivos atualizados · {removidas} capas antigas removidas")


if __name__ == "__main__":
    main()
