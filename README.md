# Nizzera Games

Site de notícias de games, feito em HTML/CSS/JS puro. Criado por Eduardo Nizer.

## Estrutura

```
nizzera-games/
├── SITE/                         ← é só esta pasta que vai para o ar
│   ├── index.html                (site inteiro + notícias em JSON)
│   └── _headers                  (cabeçalhos de segurança do Cloudflare)
├── atualizar_noticias.py         ← busca notícias nos feeds RSS
├── .github/workflows/noticias.yml← roda o script todo dia às 06:00 (Curitiba)
├── .gitignore
└── README.md
```

## Como funciona

1. O GitHub Actions executa `atualizar_noticias.py` todo dia.
2. O script lê os feeds, adiciona as notícias novas no JSON do `SITE/index.html` e faz commit.
3. O Cloudflare Pages detecta o commit e publica a pasta `SITE`.

## Cloudflare Pages

- Build command: vazio
- Build output directory: `SITE`

## Rodar na sua máquina

```
python atualizar_noticias.py SITE/index.html
```

Fontes, categorias e limites ficam no topo do `atualizar_noticias.py`.

## Área admin

Abra o site com `#admin` no endereço. As edições ficam no navegador até você usar
"Publicar e backup" e trocar o `SITE/index.html`.

## Atenção ao mexer no projeto

O robô faz commits sozinho. Antes de editar algo na sua máquina, rode `git pull`
para não dar conflito.
