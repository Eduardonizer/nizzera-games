"""Configuração comum dos scripts do Nizzera Games.

SITE_URL é o endereço do site, usado em canonical, og:url, sitemap, feed, robots.txt e JSON-LD.
Para mudar de domínio:
  1. troque SITE_URL aqui e coloque o endereço anterior em DOMINIOS_ANTIGOS;
  2. rode  python nizzera-games/scripts/gerar_paginas.py  (ele acerta todas as páginas, o robots.txt,
     o index.html, o 404.html e o tierlist.js);
  3. atualize o redirecionamento do SITE/vercel.json e gere de novo o banner (scripts/og_banner.html).
"""

SITE_URL = "https://www.nizzeragames.com.br"  # sem barra no final

# endereços que o site já teve: o gerador troca qualquer resto deles por SITE_URL
DOMINIOS_ANTIGOS = ["https://nizzera-games.vercel.app"]

# como os robôs se identificam ao visitar lojas e feeds (com o endereço do site, como manda a boa prática)
USER_AGENT = f"Mozilla/5.0 (compatible; NizzeraGamesBot/1.0; +{SITE_URL})"

# convite do servidor do Discord (página /comunidade/). Use um convite que NÃO expira:
# no Discord, clique com o botão direito no servidor > Convidar pessoas > Editar link do convite >
# "Expirar depois de: Nunca". Ex.: "https://discord.gg/abc123". Vazio = o botão mostra "em breve".
DISCORD_INVITE = "https://discord.gg/8RmMYmQgVS"  # permanente, sem limite de usos; cai no #boas-vindas
