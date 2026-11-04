const { isAuthed, send, readBody, isJson } = require("./_lib");

// Recebe o HTML novo do painel e grava no GitHub. A Vercel republica sozinha em seguida.
module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "Método não permitido." });
  if (!isJson(req)) return send(res, 415, { ok: false, error: "Requisição inválida." });
  if (!isAuthed(req)) return send(res, 401, { ok: false, error: "Sessão expirada. Entre de novo." });

  const repo = process.env.GITHUB_REPO;      // ex.: seuusuario/nizzera-games
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || "main";
  const path = process.env.GITHUB_FILE || "index.html";
  if (!repo || !token) {
    return send(res, 500, { ok: false, error: "GITHUB_REPO e GITHUB_TOKEN ainda não foram configurados na Vercel." });
  }

  const html = readBody(req).html;
  if (typeof html !== "string" || html.length < 2000 || html.length > 4000000 ||
      !/^<!DOCTYPE html>/i.test(html) || html.indexOf('id="nz-data"') < 0) {
    return send(res, 400, { ok: false, error: "O arquivo enviado não parece ser o site. Nada foi publicado." });
  }

  const url = "https://api.github.com/repos/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nizzera-games-admin",
  };

  try {
    let sha;
    const cur = await fetch(url + "?ref=" + encodeURIComponent(branch), { headers });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) {
      return send(res, 502, { ok: false, error: "Não consegui ler o repositório (GitHub respondeu " + cur.status + "). Confira o token e o nome do repositório." });
    }

    const put = await fetch(url, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: JSON.stringify({
        message: "Atualização pelo painel admin",
        content: Buffer.from(html, "utf8").toString("base64"),
        branch,
        sha,
      }),
    });
    if (!put.ok) {
      return send(res, 502, { ok: false, error: "O GitHub recusou a gravação (código " + put.status + "). O token precisa de permissão de escrita em Contents." });
    }
    return send(res, 200, { ok: true });
  } catch (_) {
    return send(res, 502, { ok: false, error: "Falha ao falar com o GitHub. Tente de novo." });
  }
};
