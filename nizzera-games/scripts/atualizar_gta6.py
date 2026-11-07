#!/usr/bin/env python3
"""Lê a galeria oficial de imagens de GTA VI (rockstargames.com/VI/media/screenshots) e grava
SITE/data/gta6.json com a lista das fotos (endereço, grupo e personagem/lugar).

As fotos NÃO são baixadas: o site mostra direto do servidor da Rockstar, que entrega cada uma no
tamanho pedido (parâmetro imwidth). Assim nada pesa no servidor do Nizzera Games.
Foto que aparece pela primeira vez ganha a data "first" (o site marca como "Nova" por 14 dias).
Se a página da Rockstar falhar ou mudar, mantém a lista anterior. Só usa a biblioteca padrão.

Uso:  python scripts/atualizar_gta6.py
"""
import html, json, os, re, sys, urllib.request
from datetime import datetime, timedelta, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "SITE", "data", "gta6.json")
PAGINA = "https://www.rockstargames.com/VI/media/screenshots"
ORIGEM = "https://www.rockstargames.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
FUSO = timezone(timedelta(hours=-3))
MINIMO = 30  # menos fotos que isso = a página mudou de formato: não mexe na lista


def nome_bonito(t):
    t = t.replace("_", " ").strip()
    return t.title() if t.isupper() else t


def ler_fotos(texto):
    vistos, fotos = set(), []
    for m in re.finditer(r"<img\b[^>]*>", texto):
        tag = m.group(0)
        src = re.search(r'srcSet="([^"]+)"', tag) or re.search(r'src="([^"]+)"', tag)
        if not src:
            continue
        caminho = html.unescape(src.group(1)).split(",")[0].strip().split(" ")[0].split("?")[0]
        arquivo = caminho.rsplit("/", 1)[-1]
        mm = re.match(r"^(.+?)_(\d+)\.[\w~.-]+\.(jpe?g|png|webp)$", arquivo, re.I)
        if "/_next/static/media/" not in caminho or not mm or caminho in vistos:
            continue  # logos, selos e repetidas ficam de fora
        vistos.add(caminho)
        base, num = mm.group(1), int(mm.group(2))
        B = base.upper()
        if B.startswith("ULTIMATE_EDITION"):
            grupo = "Ultimate Edition"
            assunto = nome_bonito(base[len("ULTIMATE_EDITION"):].strip("_")) or "Ultimate Edition"
        elif B.startswith("VINTAGE_VICE_CITY"):
            grupo = "Vintage Vice City"
            resto = re.sub(r"^PACK_?", "", base[len("VINTAGE_VICE_CITY"):].strip("_"), flags=re.I)
            assunto = nome_bonito(resto) or "Vintage Vice City Pack"
        else:
            grupo, assunto = "Jogo", nome_bonito(base)
        fotos.append({"src": ORIGEM + caminho, "group": grupo, "tag": assunto, "n": num})
    return fotos


def main():
    try:
        anterior = json.load(open(SAIDA, encoding="utf-8"))
    except Exception:
        anterior = {}
    try:
        req = urllib.request.Request(PAGINA, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.8"})
        with urllib.request.urlopen(req, timeout=40) as r:
            texto = r.read().decode("utf-8", "replace")
        fotos = ler_fotos(texto)
    except Exception as e:
        print(f"[erro] Rockstar: {e}. Mantenho a lista anterior.")
        return
    if len(fotos) < MINIMO:
        print(f"[aviso] só {len(fotos)} fotos encontradas: a página deve ter mudado. Mantenho a lista anterior.")
        return
    hoje = datetime.now(FUSO).date().isoformat()
    primeira_vez = not anterior.get("images")
    datas = {x["src"]: x.get("first") for x in anterior.get("images", [])}
    novas = 0
    for f in fotos:
        if f["src"] in datas:
            f["first"] = datas[f["src"]]
        else:
            f["first"] = "" if primeira_vez else hoje  # na 1ª leitura ninguém é marcado como "nova"
            novas += 0 if primeira_vez else 1
    out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": PAGINA, "images": fotos}
    if anterior.get("images") == fotos:
        print("Galeria de GTA VI sem mudanças.")
        return
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    grupos = {}
    for x in fotos:
        grupos[x["group"]] = grupos.get(x["group"], 0) + 1
    print(f"gta6.json atualizado: {len(fotos)} fotos {grupos}, {novas} novas.")


if __name__ == "__main__":
    sys.exit(main())
