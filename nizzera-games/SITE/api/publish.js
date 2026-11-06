const { isAuthed, send, readBody, rejectPost } = require("./_lib");

// Recebe SÓ os dados (notícias, categorias e textos) do painel, valida tudo aqui no servidor
// e troca apenas o bloco <script id="nz-data"> do index.html que está no GitHub.
// Assim, nem uma sessão roubada consegue colocar HTML ou JavaScript no site.
// A Vercel republica sozinha em seguida, e o GitHub Actions gera as páginas das notícias.

const BLOCK = /(<script id="nz-data" type="application\/json">)[\s\S]*?(<\/script>)/;
const HTTP = /^https?:\/\/[^\s"'<>]+$/i;
const DATA_IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

class Bad extends Error {}

function str(v, max, label) {
  const s = v == null ? "" : String(v);
  if (s.length > max) throw new Bad(`${label} passou do limite de ${max} caracteres.`);
  return s;
}

function clean(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.news) || !Array.isArray(d.cats)) throw new Bad("Dados em formato inválido.");
  const s = d.site || {};
  const site = {
    name: str(s.name, 80, "O nome do site").trim(),
    tagline: str(s.tagline, 200, "A frase do topo"),
    intro: str(s.intro, 600, "O texto de introdução"),
    footer: str(s.footer, 600, "O rodapé"),
    credit: str(s.credit, 120, "O crédito"),
  };
  if (!site.name) throw new Bad("O nome do site não pode ficar vazio.");

  if (d.cats.length > 50) throw new Bad("Categorias demais (máximo 50).");
  const cats = d.cats.map((c) => str(c, 40, "O nome de uma categoria").trim());
  if (cats.some((c) => !c || c === "Todas")) throw new Bad("Há uma categoria com nome inválido.");

  if (d.news.length > 1000) throw new Bad("Notícias demais (máximo 1000).");
  const ids = new Set();
  const news = d.news.map((n) => {
    if (!n || typeof n !== "object") throw new Bad("Há uma notícia inválida.");
    const id = Number(n.id);
    if (!Number.isInteger(id) || id < 1 || id > 1e9 || ids.has(id)) throw new Bad("Há notícias com identificador inválido ou repetido.");
    ids.add(id);
    const title = str(n.title, 300, "Um título").trim();
    if (!title) throw new Bad("Há uma notícia sem título.");
    const img = str(n.img, 3_000_000, "Uma imagem");
    if (!img) throw new Bad(`A notícia "${title.slice(0, 40)}" está sem imagem. Toda notícia precisa de foto.`);
    if (img && !(img.length <= 2000 && HTTP.test(img)) && !DATA_IMG.test(img)) throw new Bad(`A imagem da notícia "${title.slice(0, 40)}" é inválida.`);
    const url = str(n.url, 2000, "Um link");
    if (url && !HTTP.test(url)) throw new Bad(`O link da notícia "${title.slice(0, 40)}" precisa começar com http:// ou https://.`);
    const date = str(n.date, 10, "Uma data");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Bad("Há uma data inválida.");
    const slug = str(n.slug, 90, "Um endereço");
    return {
      id,
      slug: /^[a-z0-9-]{1,90}$/.test(slug) ? slug : "",
      img,
      alt: str(n.alt, 300, "Um texto alternativo"),
      credit: str(n.credit, 200, "Um crédito de imagem"),
      pos: n.pos === "top" || n.pos === "bottom" ? n.pos : "",
      cat: str(n.cat, 40, "Uma categoria"),
      title,
      date,
      // data e hora de publicação gravadas pelo robô (ISO, com fuso)
      pub: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(String(n.pub || "")) ? String(n.pub) : "",
      // "Nossa opinião": texto próprio do site, escrito no painel
      take: str(n.take, 2000, "O texto de opinião"),
      read: Math.max(0, Math.min(120, parseInt(n.read, 10) || 0)),
      sum: str(n.sum, 1000, "Um resumo"),
      body: str(n.body, 30000, "Um texto"),
      src: str(n.src, 120, "Um nome de fonte"),
      url,
      featured: n.featured === true,
    };
  });
  // assuntos em alta: [{ name: "GTA 6", terms: ["gta 6", "gta vi"] }, ...]
  const rawTrend = Array.isArray(d.trend) ? d.trend : [];
  if (rawTrend.length > 12) throw new Bad("Assuntos em alta demais (máximo 12).");
  const trend = rawTrend.map((x) => {
    if (!x || typeof x !== "object" || !Array.isArray(x.terms) || x.terms.length > 15) throw new Bad("Há um assunto em alta inválido.");
    const name = str(x.name, 30, "O nome de um assunto").trim();
    const terms = x.terms.map((w) => str(w, 40, "Uma palavra-chave").trim()).filter(Boolean);
    if (!name || !terms.length) throw new Bad("Cada assunto em alta precisa de nome e de pelo menos uma palavra-chave.");
    return { name, terms };
  });
  // reviews de jogos
  const rawRv = Array.isArray(d.reviews) ? d.reviews : [];
  if (rawRv.length > 200) throw new Bad("Reviews demais (máximo 200).");
  const rvIds = new Set();
  const arr = (v, max, label) => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.length > max) throw new Bad(`${label}: no máximo ${max} itens.`);
    return v;
  };
  const reviews = rawRv.map((r) => {
    if (!r || typeof r !== "object") throw new Bad("Há uma review inválida.");
    const id = Number(r.id);
    if (!Number.isInteger(id) || id < 1 || id > 1e9 || rvIds.has(id)) throw new Bad("Há reviews com identificador inválido ou repetido.");
    rvIds.add(id);
    const game = str(r.game, 120, "O nome de um jogo").trim();
    if (!game) throw new Bad("Há uma review sem o nome do jogo.");
    const img = str(r.img, 3_000_000, "Uma imagem de review");
    if (img && !(img.length <= 2000 && HTTP.test(img)) && !DATA_IMG.test(img)) throw new Bad(`A imagem da review de "${game.slice(0, 40)}" é inválida.`);
    const scoreMax = [5, 10, 100].includes(Number(r.scoreMax)) ? Number(r.scoreMax) : 100;
    const score = Number(r.score);
    if (!Number.isFinite(score) || score < 0 || score > scoreMax) throw new Bad(`A nota da review de "${game.slice(0, 40)}" precisa ficar entre 0 e ${scoreMax}.`);
    const date = str(r.date, 10, "Uma data"), release = str(r.release, 10, "Uma data de lançamento");
    if ((date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) || (release && !/^\d{4}-\d{2}-\d{2}$/.test(release))) throw new Bad("Há uma data inválida numa review.");
    const link = (u, label) => { const s = str(u, 2000, label); if (s && !HTTP.test(s)) throw new Bad(`${label} precisa começar com http:// ou https://.`); return s; };
    const slug = str(r.slug, 90, "Um endereço");
    return {
      id,
      slug: /^[a-z0-9-]{1,90}$/.test(slug) ? slug : "",
      game,
      title: str(r.title, 200, "Um título de review"),
      verdict: str(r.verdict, 600, "Um veredito"),
      img,
      alt: str(r.alt, 300, "Um texto alternativo"),
      credit: str(r.credit, 200, "Um crédito de imagem"),
      platforms: str(r.platforms, 150, "As plataformas"),
      release,
      dev: str(r.dev, 120, "A desenvolvedora"),
      genre: str(r.genre, 80, "O gênero"),
      score,
      scoreMax,
      scoreLabel: str(r.scoreLabel, 80, "A origem da nota"),
      myScore: str(r.myScore, 20, "A nota própria"),
      critics: arr(r.critics, 20, "Notas da crítica").map((x) => ({
        name: str(x && x.name, 60, "O nome de um veículo"), score: str(x && x.score, 20, "Uma nota"), url: link(x && x.url, "O link de uma nota"),
      })),
      synopsis: str(r.synopsis, 5000, "A sinopse"),
      changes: arr(r.changes, 20, "Novidades").map((x) => str(x, 400, "Uma novidade")),
      pros: arr(r.pros, 20, "Pontos positivos").map((x) => str(x, 400, "Um ponto positivo")),
      cons: arr(r.cons, 20, "Pontos de atenção").map((x) => str(x, 400, "Um ponto de atenção")),
      public: str(r.public, 5000, "A opinião do público"),
      sources: arr(r.sources, 30, "Fontes").map((x) => ({ name: str(x && x.name, 150, "O nome de uma fonte"), url: link(x && x.url, "O link de uma fonte") })),
      date,
    };
  });
  return { site, cats, trend, reviews, news };
}

// Notícias que o robô colocou no site depois que você começou a editar
// (não estavam em "known") são mantidas, em vez de apagadas pela sua versão.
function mergeRobot(data, current, known) {
  if (!Array.isArray(known) || !current || !Array.isArray(current.news)) return 0;
  const knownSet = new Set(known.map(Number));
  const used = new Set(data.news.map((n) => n.id));
  let next = Math.max(0, ...used, ...current.news.map((n) => Number(n.id) || 0)) + 1;
  const extra = [];
  for (const n of current.news) {
    const id = Number(n.id);
    if (knownSet.has(id)) continue;
    let cleanN;
    try { cleanN = clean({ site: data.site, cats: [], news: [n] }).news[0]; } catch (_) { continue; }
    if (used.has(cleanN.id)) cleanN.id = next++;
    used.add(cleanN.id);
    if (cleanN.cat && !data.cats.includes(cleanN.cat)) data.cats.push(cleanN.cat);
    extra.push(cleanN);
  }
  data.news = extra.concat(data.news);
  return extra.length;
}

module.exports = async (req, res) => {
  if (rejectPost(req, res)) return;
  if (!isAuthed(req)) return send(res, 401, { ok: false, error: "Sessão expirada. Entre de novo." });

  const repo = process.env.GITHUB_REPO; // ex.: Eduardonizer/nizzera-games
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || "main";
  const path = process.env.GITHUB_FILE || "nizzera-games/SITE/index.html";
  if (!repo || !token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return send(res, 500, { ok: false, error: "A publicação ainda não foi configurada no servidor." });
  }

  const body = readBody(req);
  let data;
  try {
    data = clean(body.data);
  } catch (e) {
    return send(res, 400, { ok: false, error: e instanceof Bad ? e.message : "Dados inválidos. Nada foi publicado." });
  }
  const known = Array.isArray(body.known) && body.known.length <= 5000 ? body.known : null;

  const url = "https://api.github.com/repos/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  const headers = {
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nizzera-games-admin",
  };

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ref = "?ref=" + encodeURIComponent(branch);
      const [meta, raw] = await Promise.all([
        fetch(url + ref, { headers: { ...headers, Accept: "application/vnd.github+json" } }),
        fetch(url + ref, { headers: { ...headers, Accept: "application/vnd.github.raw+json" } }),
      ]);
      if (!meta.ok || !raw.ok) {
        return send(res, 502, { ok: false, error: "Não consegui ler o site no GitHub (código " + (meta.ok ? raw.status : meta.status) + "). Confira o token e o repositório." });
      }
      const sha = (await meta.json()).sha;
      const html = await raw.text();
      const m = html.match(BLOCK);
      if (!m) return send(res, 500, { ok: false, error: "O index.html do GitHub não tem o bloco de dados. Nada foi publicado." });

      let current = null;
      try { current = JSON.parse(html.slice(m.index + m[1].length, m.index + m[0].length - m[2].length)); } catch (_) {}
      const out = { site: data.site, cats: data.cats.slice(), trend: data.trend, reviews: data.reviews, news: data.news.slice() };
      const merged = mergeRobot(out, current, known);

      const json = JSON.stringify(out, null, 1).replace(/</g, "\\u003c");
      const next = html.slice(0, m.index) + m[1] + "\n" + json + "\n" + m[2] + html.slice(m.index + m[0].length);
      if (next.length > 6_000_000) return send(res, 413, { ok: false, error: "O site ficou grande demais. Use links de imagem em vez de enviar fotos do computador." });

      const put = await fetch(url, {
        method: "PUT",
        headers: { ...headers, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Atualização pelo painel admin",
          content: Buffer.from(next, "utf8").toString("base64"),
          branch,
          sha,
        }),
      });
      if (put.ok) return send(res, 200, { ok: true, merged, data: out });
      // 409: o robô gravou no mesmo instante. Lê de novo e tenta mais uma vez.
      if (put.status === 409 && attempt === 0) continue;
      return send(res, 502, { ok: false, error: "O GitHub recusou a gravação (código " + put.status + "). O token precisa de permissão de escrita em Contents." });
    }
    return send(res, 409, { ok: false, error: "O site mudou enquanto você publicava. Tente de novo." });
  } catch (_) {
    return send(res, 502, { ok: false, error: "Falha ao falar com o GitHub. Tente de novo." });
  }
};
