#!/usr/bin/env python3
"""Busca as ofertas da semana da Steam e grava em SITE/ofertas.json.
PlayStation e Xbox ficam vazios por enquanto (não têm API pública)."""
import json, os, urllib.request
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "SITE", "ofertas.json")
URL = "https://store.steampowered.com/api/featuredcategories?cc=br&l=brazilian"


def brl(centavos):
    v = f"{int(centavos) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return "R$ " + v


def ofertas_steam(limite=12):
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (nizzera-games)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        dados = json.load(r)
    itens = (dados.get("specials") or {}).get("items") or []
    out, vistos = [], set()
    for i in itens:
        if not i.get("discounted") or not i.get("id") or i["id"] in vistos:
            continue
        vistos.add(i["id"])
        out.append({
            "id": i["id"],
            "name": i.get("name", ""),
            "discount": int(i.get("discount_percent") or 0),
            "orig": brl(i["original_price"]) if i.get("original_price") else "",
            "price": brl(i.get("final_price", 0)),
        })
    out.sort(key=lambda d: -d["discount"])
    return out[:limite]


def main():
    try:
        with open(SAIDA, encoding="utf-8") as f:
            atual = json.load(f)
    except Exception:
        atual = {}
    try:
        steam = ofertas_steam()
        print(f"[ok]   Steam: {len(steam)} ofertas")
    except Exception as e:
        print(f"[erro] Steam: {e}")
        steam = atual.get("steam", [])  # mantém as anteriores se falhar
    novo = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "steam": steam,
        "playstation": atual.get("playstation", []),
        "xbox": atual.get("xbox", []),
    }
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
