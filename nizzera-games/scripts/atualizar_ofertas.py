#!/usr/bin/env python3
"""Busca as ofertas da semana da Steam e grava em SITE/data/ofertas.json.

Se a busca falhar, o script avisa e mantém as ofertas anteriores: nunca apaga o que já funcionava.
"""
import json, os, re, urllib.request
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "SITE", "data", "ofertas.json")
URL = "https://store.steampowered.com/api/featuredcategories?cc=br&l=brazilian"
UA = "Mozilla/5.0 (nizzera-games)"
LIMITE = 12


def brl(centavos):
    v = f"{int(centavos) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return "R$ " + v


def https(u):
    return u.strip() if isinstance(u, str) and re.match(r"^https://\S+$", u.strip()) else ""


def ofertas_steam():
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        dados = json.load(r)
    itens = (dados.get("specials") or {}).get("items") or []
    out, vistos = [], set()
    for i in itens:
        if not i.get("discounted") or not i.get("id") or i["id"] in vistos:
            continue
        vistos.add(i["id"])
        d = {
            "id": i["id"],
            "name": i.get("name", ""),
            "discount": int(i.get("discount_percent") or 0),
            "orig": brl(i["original_price"]) if i.get("original_price") else "",
            "price": brl(i.get("final_price", 0)),
        }
        # a própria Steam informa o endereço certo da imagem (jogos novos usam outro caminho)
        img = https(i.get("header_image")) or https(i.get("large_capsule_image"))
        if img:
            d["img"] = img
        out.append(d)
    out.sort(key=lambda d: -d["discount"])
    return out[:LIMITE]


def main():
    try:
        with open(SAIDA, encoding="utf-8") as f:
            atual = json.load(f)
    except Exception:
        atual = {}
    try:
        steam = ofertas_steam()
        if steam:
            print(f"[ok]   Steam: {len(steam)} ofertas")
        else:
            print("[aviso] Steam: veio vazio; mantendo as ofertas anteriores")
            steam = atual.get("steam", [])
    except Exception as e:
        print(f"[erro] Steam: {e}")
        steam = atual.get("steam", [])  # mantém as anteriores se falhar
    # só mexe no arquivo (e na data) se algo mudou: evita um commit a cada rodada.
    # (se o arquivo antigo ainda tiver PlayStation/Xbox, ele é regravado uma vez para limpar)
    if steam == atual.get("steam") and set(atual) == {"updated", "steam"}:
        print("Sem mudanças nas ofertas.")
        return
    novo = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "steam": steam}
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=1)
    print("ofertas.json atualizado.")


if __name__ == "__main__":
    main()
