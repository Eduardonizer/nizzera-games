const { isAuthed, send, readBody, rejectPost } = require("./_lib");

// Temas da Tier List, editados no painel admin (aba "Tier List").
//   POST /api/tierlist { action: "save", theme: { slug, title, description, order, games: [{ name, appid | src }] } }
//   POST /api/tierlist { action: "delete", slug }
// Grava SÓ JSON validado aqui no servidor em SITE/data/tierlists/<slug>.json e atualiza o index.json
// (a lista do seletor), no GitHub, como o publish.js. Exige login de admin.
// Depois disso o GitHub Actions roda scripts/atualizar_tierlists.py, que baixa as capas para
// SITE/assets/tierlist/ (precisam ficar no próprio site para a imagem da tier list poder ser exportada).

const SLUG = /^[a-z0-9-]{2,60}$/;
const ID = /^[a-z0-9-]{1,60}$/;
const IMG = /^\/assets\/tierlist\/[a-z0-9._-]+$/;
const HTTPS = /^https:\/\/[^\s"'<>]+$/i;
const MAX_GAMES = 60;

class Bad extends Error {}

function str(v, max, label) {
  const s = v == null ? "" : String(v).trim();
  if (s.length > max) throw new Bad(`${label} passou do limite de ${max} caracteres.`);
  return s;
}

function slugify(t) {
  // igual a slugify() de assets/js/core.js e de scripts/gerar_paginas.py
  let s = String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 60) { s = s.slice(0, 60); const k = s.lastIndexOf("-"); if (k > 30) s = s.slice(0, k); }
  return s.replace(/-+$/, "") || "jogo";
}

// valida o tema vindo do painel; aproveita id e capa dos jogos que já existiam no arquivo atual
function clean(t, current) {
  if (!t || typeof t !== "object" || !Array.isArray(t.games)) throw new Bad("Dados do tema em formato inválido.");
  const slug = String(t.slug || "");
  if (!SLUG.test(slug)) throw new Bad("O endereço do tema só pode ter letras minúsculas, números e hífen (2 a 60 caracteres).");
  const title = str(t.title, 80, "O título");
  if (!title) throw new Bad("O tema precisa de um título.");
  const description = str(t.description, 200, "A descrição");
  if (t.games.length < 2) throw new Bad("Coloque pelo menos 2 jogos no tema.");
  if (t.games.length > MAX_GAMES) throw new Bad(`Jogos demais (máximo ${MAX_GAMES}).`);

  const old = Array.isArray(current && current.games) ? current.games : [];
  const used = new Set();
  const games = t.games.map((g, i) => {
    if (!g || typeof g !== "object") throw new Bad(`O jogo da linha ${i + 1} é inválido.`);
    const name = str(g.name, 80, `O nome do jogo da linha ${i + 1}`);
    let appid = g.appid == null || g.appid === "" ? 0 : Number(g.appid);
    if (!Number.isInteger(appid) || appid < 0 || appid > 1e8) throw new Bad(`O AppID de "${name || "linha " + (i + 1)}" é inválido.`);
    const src = appid ? "" : str(g.src, 500, `O link da imagem de "${name}"`);
    if (src && !HTTPS.test(src)) throw new Bad(`O link da imagem de "${name}" precisa começar com https://`);
    if (!name && !appid) throw new Bad(`A linha ${i + 1} precisa do nome do jogo ou do AppID da Steam.`);
    // mesmo jogo de antes (pelo AppID, pelo link ou pelo nome): mantém o id e a capa já baixada
    const prev = old.find((o) => o && ((appid && o.appid === appid) || (src && o.src === src) || (!appid && !src && name && o.name === name)));
    let id = prev && ID.test(prev.id || "") ? prev.id : slugify(name || "jogo-" + appid);
    while (used.has(id)) id += "-2";
    used.add(id);
    const out = { id, name: name || (prev && prev.name) || `Jogo ${appid}` };
    if (appid) out.appid = appid;
    if (src) out.src = src;
    out.img = prev && IMG.test(prev.img || "") && (prev.appid || 0) === appid && (prev.src || "") === src ? prev.img : "";
    // jogo sem AppID nem link: só vale se já tinha capa (ex.: imagem colocada à mão)
    if (!appid && !src && !out.img) throw new Bad(`"${name}" precisa do AppID da Steam ou de um link de imagem (https://).`);
    return out;
  });
  const order = Number(t.order);
  const theme = { slug, title, description };
  if (Number.isFinite(order) && order > 0 && order < 1e6) theme.order = order;
  theme.games = games;
  return theme;
}

function entry(t) {
  return { slug: t.slug, title: t.title, description: t.description, count: t.games.length,
    covers: t.games.map((g) => g.img).filter((u) => IMG.test(u || "")).slice(0, 4) };
}

module.exports = async (req, res) => {
  if (rejectPost(req, res)) return;
  if (!isAuthed(req)) return send(res, 401, { ok: false, error: "Sessão expirada. Entre de novo." });

  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || "main";
  // a pasta do site é a mesma do index.html que o painel publica (GITHUB_FILE)
  const base = (process.env.GITHUB_FILE || "nizzera-games/SITE/index.html").replace(/\/?[^/]*$/, "");
  if (!repo || !token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return send(res, 500, { ok: false, error: "A publicação ainda não foi configurada no servidor." });
  }
  const headers = { Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nizzera-games-admin", Accept: "application/vnd.github+json" };
  const fileUrl = (p) => "https://api.github.com/repos/" + repo + "/contents/" + (base ? base + "/" : "") + p.split("/").map(encodeURIComponent).join("/");

  async function read(p) {
    const r = await fetch(fileUrl(p) + "?ref=" + encodeURIComponent(branch), { headers });
    if (r.status === 404) return { sha: null, data: null };
    if (!r.ok) throw new Bad("Não consegui ler os temas no GitHub (código " + r.status + "). Confira o token e o repositório.");
    const j = await r.json();
    let data = null;
    try { data = JSON.parse(Buffer.from(j.content || "", "base64").toString("utf8")); } catch (_) {}
    return { sha: j.sha, data };
  }
  async function write(p, data, sha, message) {
    const r = await fetch(fileUrl(p), {
      method: "PUT", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: Buffer.from(JSON.stringify(data, null, 1) + "\n", "utf8").toString("base64"), branch, ...(sha ? { sha } : {}) }),
    });
    if (r.status === 409 || r.status === 422) throw new Bad("Os temas mudaram enquanto você salvava. Tente de novo.");
    if (!r.ok) throw new Bad("O GitHub recusou a gravação (código " + r.status + "). O token precisa de permissão de escrita em Contents.");
  }
  async function remove(p, sha, message) {
    const r = await fetch(fileUrl(p), { method: "DELETE", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ message, branch, sha }) });
    if (!r.ok && r.status !== 404) throw new Bad("O GitHub recusou a exclusão (código " + r.status + ").");
  }
  async function saveIndex(change) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = await read("data/tierlists/index.json");
      const themes = (cur.data && Array.isArray(cur.data.themes) ? cur.data.themes : []).filter((t) => t && SLUG.test(t.slug || ""));
      const next = change(themes);
      try {
        await write("data/tierlists/index.json", { updated: new Date().toISOString().replace(/\.\d+Z$/, "Z"), themes: next }, cur.sha, "Tier List: atualiza a lista de temas pelo painel admin");
        return next;
      } catch (e) { if (attempt) throw e; } // o robô gravou no mesmo instante: lê de novo e tenta mais uma vez
    }
  }

  const body = readBody(req);
  try {
    if (body.action === "save") {
      const slug = String((body.theme && body.theme.slug) || "");
      if (!SLUG.test(slug)) throw new Bad("O endereço do tema só pode ter letras minúsculas, números e hífen (2 a 60 caracteres).");
      const path = "data/tierlists/" + slug + ".json";
      const cur = await read(path);
      if (body.isNew && cur.sha) throw new Bad("Já existe um tema com esse endereço. Escolha outro.");
      const theme = clean(body.theme, cur.data);
      await write(path, theme, cur.sha, "Tier List: " + (cur.sha ? "edita" : "cria") + " o tema \"" + theme.title + "\" pelo painel admin");
      const themes = await saveIndex((list) => {
        const i = list.findIndex((t) => t.slug === slug);
        if (i < 0) list.push(entry(theme)); else list[i] = entry(theme);
        return list;
      });
      return send(res, 200, { ok: true, theme, themes });
    }
    if (body.action === "delete") {
      const slug = String(body.slug || "");
      if (!SLUG.test(slug)) throw new Bad("Tema inválido.");
      const path = "data/tierlists/" + slug + ".json";
      const cur = await read(path);
      if (cur.sha) await remove(path, cur.sha, "Tier List: exclui o tema \"" + slug + "\" pelo painel admin");
      const themes = await saveIndex((list) => list.filter((t) => t.slug !== slug));
      return send(res, 200, { ok: true, themes });
    }
    return send(res, 400, { ok: false, error: "Ação inválida." });
  } catch (e) {
    if (e instanceof Bad) return send(res, 400, { ok: false, error: e.message });
    return send(res, 502, { ok: false, error: "Falha ao falar com o GitHub. Tente de novo." });
  }
};
