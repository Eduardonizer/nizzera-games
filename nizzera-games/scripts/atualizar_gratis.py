#!/usr/bin/env python3
"""Busca os jogos grátis da semana e grava em SITE/data/gratis.json.

  Epic:  os jogos grátis da semana (e os próximos), pelo endpoint público da loja.
  Steam: os fins de semana grátis (destaques "Fim de semana gratuito" da loja)
         e os jogos com 100% de desconto (grátis para resgatar e ficar).

Cada loja é buscada separadamente: se uma falhar, ela mantém o que já tinha e a outra segue.
Só usa a biblioteca padrão. Uso manual:  python scripts/atualizar_gratis.py
"""
import html, json, os, re, sys, urllib.request
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "SITE", "data", "gratis.json")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import USER_AGENT as UA  # noqa: E402  (scripts/config.py)
EPIC_URL = ("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions"
            "?locale=pt-BR&country=BR&allowCountries=BR")
STEAM_DESTAQUES = "https://store.steampowered.com/api/featuredcategories?cc=br&l=brazilian"
STEAM_APP = "https://store.steampowered.com/api/appdetails?appids={}&cc=br&l=brazilian&filters=basic,price_overview"
STEAM_BUSCA = ("https://store.steampowered.com/search/results/?query&start=0&count=50"
               "&maxprice=free&specials=1&infinite=1&cc=br&l=brazilian")
LIMITE_STEAM = 12


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def https(u):
    return u.strip() if isinstance(u, str) and re.match(r"^https://\S+$", u.strip()) else ""


def brl(centavos):
    v = f"{int(centavos) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return "R$ " + v


def data_iso(s):
    """'2026-11-12T16:00:00.000Z' -> '2026-11-12T16:00:00Z' (ou '' se não for uma data)."""
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return ""


# ---------------- Epic ----------------
def epic_grates(promos):
    """Janelas (início, fim) em que o jogo sai de graça (desconto que deixa o preço em 0)."""
    out = []
    for p in promos or []:
        for o in p.get("promotionalOffers") or []:
            ds = o.get("discountSetting") or {}
            if ds.get("discountType") == "PERCENTAGE" and ds.get("discountPercentage") == 0:
                ini, fim = data_iso(o.get("startDate")), data_iso(o.get("endDate"))
                if ini and fim:
                    out.append((ini, fim))
    return out


def epic_slug(e):
    s = (e.get("productSlug") or "").split("/")[0]
    if s:
        return s
    for m in ((e.get("catalogNs") or {}).get("mappings") or []) + (e.get("offerMappings") or []):
        if m.get("pageSlug"):
            return m["pageSlug"]
    return ""


def epic_img(e):
    imgs = {}
    for i in e.get("keyImages") or []:
        u = https(i.get("url"))
        if u:
            imgs.setdefault(i.get("type"), u)
    for t in ("OfferImageWide", "DieselStoreFrontWide", "featuredMedia", "Thumbnail", "OfferImageTall"):
        if imgs.get(t):
            return imgs[t]
    return ""


def gratis_epic():
    dados = baixar(EPIC_URL)
    itens = ((((dados.get("data") or {}).get("Catalog") or {}).get("searchStore") or {}).get("elements")) or []
    out, vistos = [], set()
    for e in itens:
        promos = e.get("promotions") or {}
        preco = ((e.get("price") or {}).get("totalPrice") or {})
        # jogo que já é gratuito sempre (ex.: free-to-play) não é novidade
        if not int(preco.get("originalPrice") or 0):
            continue
        janelas = epic_grates(promos.get("promotionalOffers")) + epic_grates(promos.get("upcomingPromotionalOffers"))
        slug = epic_slug(e)
        for ini, fim in janelas:
            chave = (e.get("id"), ini)
            if chave in vistos:
                continue
            vistos.add(chave)
            d = {"name": e.get("title", ""), "start": ini, "end": fim,
                 "orig": brl(preco["originalPrice"]),
                 "url": f"https://store.epicgames.com/pt-BR/p/{slug}" if slug else "https://store.epicgames.com/pt-BR/free-games"}
            img = epic_img(e)
            if img:
                d["img"] = img
            out.append(d)
    out.sort(key=lambda d: (d["start"], d["name"]))
    return out


# ---------------- Steam ----------------
def steam_fim_de_semana():
    """Os destaques da loja marcados como 'Fim de semana gratuito'."""
    dados = baixar(STEAM_DESTAQUES)
    ids = []
    for k, v in dados.items():
        if not isinstance(v, dict) or v.get("id") != "cat_spotlight":
            continue
        for i in v.get("items") or []:
            nome = (i.get("name") or "").lower()
            m = re.search(r"/app/(\d+)", i.get("url") or "")
            if m and ("gratuito" in nome or "grátis" in nome or "free weekend" in nome):
                ids.append(int(m.group(1)))
    out = []
    for appid in dict.fromkeys(ids):
        try:
            info = (baixar(STEAM_APP.format(appid)).get(str(appid)) or {})
        except Exception as e:
            print(f"[aviso] Steam: não deu para ler o app {appid}: {e}")
            continue
        x = info.get("data") or {}
        if not info.get("success") or not x.get("name"):
            continue
        d = {"id": appid, "name": x["name"], "kind": "weekend"}
        img = https(x.get("header_image"))
        if img:
            d["img"] = img
        po = x.get("price_overview") or {}
        if po.get("discount_percent"):  # muitas vezes o jogo também fica com desconto para comprar
            d["discount"] = int(po["discount_percent"])
            d["price"] = brl(po.get("final", 0))
        out.append(d)
    return out


def steam_resgate():
    """Jogos com 100% de desconto: grátis para resgatar e ficar na biblioteca."""
    dados = baixar(STEAM_BUSCA)
    h = dados.get("results_html") or ""
    out = []
    for bloco in re.findall(r'<a [^>]*data-ds-appid="\d+".*?</a>', h, re.S):
        m_id = re.search(r'data-ds-appid="(\d+)"', bloco)
        m_nome = re.search(r'<span class="title">([^<]+)</span>', bloco)
        if not m_id or not m_nome or 'data-discount="100"' not in bloco:
            continue
        d = {"id": int(m_id.group(1)), "name": html.unescape(m_nome.group(1)).strip(), "kind": "keep"}
        m_orig = re.search(r'class="discount_original_price">([^<]+)<', bloco)
        if m_orig:
            d["orig"] = html.unescape(m_orig.group(1)).replace("R$", "R$ ").replace("  ", " ").strip()
        out.append(d)
    return out[:LIMITE_STEAM]


def gratis_steam():
    out, vistos = [], set()
    for fonte in (steam_fim_de_semana, steam_resgate):
        for d in fonte():
            if d["id"] not in vistos:
                vistos.add(d["id"])
                out.append(d)
    return out


def main():
    try:
        with open(SAIDA, encoding="utf-8") as f:
            atual = json.load(f)
    except Exception:
        atual = {}
    novo = {}
    for chave, nome, busca in (("epic", "Epic", gratis_epic), ("steam", "Steam", gratis_steam)):
        try:
            novo[chave] = busca()
            print(f"[ok]   {nome}: {len(novo[chave])} jogos grátis")
        except Exception as e:
            print(f"[erro] {nome}: {e}")
            novo[chave] = atual.get(chave, [])  # mantém os anteriores se falhar
    # vazio é uma resposta válida aqui (semana sem fim de semana grátis, por exemplo).
    # só mexe no arquivo (e na data) se algo mudou: evita um commit a cada rodada.
    if all(novo[k] == atual.get(k) for k in novo):
        print("Sem mudanças nos jogos grátis.")
        return
    novo = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **novo}
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=1)
    print("gratis.json atualizado.")


if __name__ == "__main__":
    main()
