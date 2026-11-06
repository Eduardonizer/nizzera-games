#!/usr/bin/env python3
"""Busca os jogos mais jogados da Steam e grava em SITE/data/maisjogados.json.

A Steam publica a lista dos mais jogados (ISteamChartsService), mas ela não vem em ordem de
jogadores simultâneos. Então o script pega os primeiros da lista, pergunta quantos jogadores
cada um tem neste momento (ISteamUserStats) e guarda os 10 maiores. Programas que não são
jogos ficam de fora (a Steam marca alguns como jogo; esses vão na lista NAO_JOGOS).

Se a busca falhar, o script avisa e mantém a lista anterior: nunca apaga o que já funcionava.
Só usa a biblioteca padrão. Uso manual:  python scripts/atualizar_maisjogados.py
"""
import json, os, re, urllib.request
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "SITE", "data", "maisjogados.json")
UA = "Mozilla/5.0 (nizzera-games)"
LISTA = "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/"
AGORA = "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={}"
APP = "https://store.steampowered.com/api/appdetails?appids={}&cc=br&l=brazilian&filters=basic"
CANDIDATOS = 25   # quantos da lista da Steam conferir
TOP = 10
NAO_JOGOS = {431960}   # Wallpaper Engine: a Steam o chama de jogo, mas é um programa


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def https(u):
    return u.strip() if isinstance(u, str) and re.match(r"^https://\S+$", u.strip()) else ""


def info_app(appid, cache):
    """Nome, tipo e imagem do app. Reaproveita o que já sabia da rodada anterior."""
    if appid in cache:
        return cache[appid]
    x = (baixar(APP.format(appid)).get(str(appid)) or {})
    d = x.get("data") or {}
    nome = re.sub(r"\s*[™®©]\s*", " ", d.get("name", "")).strip()
    info = {"name": re.sub(r"\s{2,}", " ", nome), "type": d.get("type", ""), "img": https(d.get("header_image"))} if x.get("success") else None
    cache[appid] = info
    return info


def mais_jogados(anterior):
    resp = baixar(LISTA).get("response") or {}
    ranks = resp.get("ranks") or []
    # o pico é o do dia que a Steam já fechou (normalmente ontem)
    try:
        dia_pico = datetime.fromtimestamp(int(resp.get("rollup_date")), timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        dia_pico = ""
    ranks = sorted(ranks, key=lambda r: r.get("rank", 999))[:CANDIDATOS]
    # nomes já conhecidos (só de jogos: o tipo não é guardado no arquivo)
    cache = {g["id"]: {"name": g["name"], "type": "game", "img": g.get("img", "")} for g in anterior if g.get("id") and g.get("name")}
    out = []
    for r in ranks:
        appid = int(r.get("appid") or 0)
        if not appid or appid in NAO_JOGOS:
            continue
        try:
            info = info_app(appid, cache)
            if not info or info["type"] != "game" or not info["name"]:
                continue
            agora = int(((baixar(AGORA.format(appid)).get("response") or {}).get("player_count")) or 0)
        except Exception as e:
            print(f"[aviso] Steam: não deu para ler o app {appid}: {e}")
            continue
        if not agora:
            continue
        d = {"id": appid, "name": info["name"], "players": agora, "peak": int(r.get("peak_in_game") or 0)}
        if info.get("img"):
            d["img"] = info["img"]
        out.append(d)
    out.sort(key=lambda d: -d["players"])
    out = out[:TOP]
    # posição na rodada anterior, para mostrar quem subiu ou caiu
    antes = {g["id"]: i + 1 for i, g in enumerate(anterior) if g.get("id")}
    for i, d in enumerate(out):
        if d["id"] in antes:
            d["prev"] = antes[d["id"]]
    return out, dia_pico


def main():
    try:
        with open(SAIDA, encoding="utf-8") as f:
            atual = json.load(f)
    except Exception:
        atual = {}
    try:
        jogos, dia_pico = mais_jogados(atual.get("games") or [])
    except Exception as e:
        print(f"[erro] Steam: {e}")
        return  # mantém a lista anterior
    if len(jogos) < 3:
        print(f"[aviso] Steam: só {len(jogos)} jogos; mantendo a lista anterior")
        return
    print(f"[ok]   Steam: top {len(jogos)} (1º: {jogos[0]['name']}, {jogos[0]['players']} jogadores)")
    novo = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "peak_day": dia_pico, "games": jogos}
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(novo, f, ensure_ascii=False, indent=1)
    print("maisjogados.json atualizado.")


if __name__ == "__main__":
    main()
