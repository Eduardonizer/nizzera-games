// api/notifications.mjs — notificações e resumo do painel admin (exige login de admin)
//   GET  /api/notifications                  -> { items, seen, unread, stats }
//   POST /api/notifications { action:"seen" } -> marca tudo como lido (vale para todos os aparelhos)
//
// items: comentários (de nz:comments, inclusive os antigos) + eventos de nz:events
//        (curtidas novas, votos e mensagens do "Fale com a gente", registrados a partir de agora),
//        do mais novo para o mais antigo. Cada item tem t ("comment" | "like" | "vote" | "msg") e ts.
// stats: totais de curtidas, comentários e votos, e as notícias/reviews mais curtidas.
//
//   GET  /api/notifications?analytics=7      -> números do Vercel Web Analytics (aba "Análise" do painel)
//        (dias: 1 = hoje por hora, 7 ou 30 por dia). Usa a API pública do Web Analytics da Vercel.
//        Variáveis na Vercel: VERCEL_ANALYTICS_TOKEN (obrigatória: token criado em vercel.com/account/tokens),
//        VERCEL_ANALYTICS_PROJECT (opcional, padrão "nizzera-games") e VERCEL_TEAM_ID (opcional: o painel
//        descobre sozinho o time dono do projeto). O token fica só no servidor, nunca vai para o navegador.
//        Fica nesta mesma função porque o plano grátis da Vercel aceita no máximo 12 funções.
import { redis, redisReady, readBody, sameOrigin, isAdmin, readComments, EVENTS } from "./_redis.mjs";
import { ofensivo } from "./_filtro.mjs";

const SEEN = "nz:events:seen";
const POLLS = ["goty-2026"];

function hashObj(flat) {
  const o = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = Number(flat[i + 1]) || 0;
  else if (flat && typeof flat === "object") for (const k in flat) o[k] = Number(flat[k]) || 0;
  return o;
}

// ---------------- Web Analytics da Vercel (aba "Análise") ----------------
const VA = "https://api.vercel.com";
const vaCache = new Map(); // dias -> { at, data } (5 min, enquanto a função estiver "quente")
let vaScope = null;        // { project, teamId } descoberto na 1ª chamada

async function vaGet(path, params, token) {
  const u = new URL(VA + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: { Authorization: "Bearer " + token } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j && j.error && j.error.message) || "HTTP " + r.status); e.status = r.status; throw e; }
  return j;
}

// acha o projeto e, se ele for de um time, o teamId (sem precisar configurar à mão)
async function vaDescobrir(token) {
  if (vaScope) return vaScope;
  const project = process.env.VERCEL_ANALYTICS_PROJECT || "nizzera-games";
  const fixo = process.env.VERCEL_TEAM_ID || "";
  const tentar = async (teamId) => { const p = await vaGet("/v9/projects/" + encodeURIComponent(project), { teamId }, token); return { project: p.id || project, teamId }; };
  if (fixo) return (vaScope = await tentar(fixo));
  try { return (vaScope = await tentar("")); } catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
  const t = await vaGet("/v2/teams", { limit: 20 }, token).catch(() => ({ teams: [] }));
  for (const team of t.teams || []) {
    try { return (vaScope = await tentar(team.id)); } catch { /* não é deste time */ }
  }
  const e = new Error(`Projeto "${project}" não encontrado com esse token.`); e.status = 404; throw e;
}

function vaLinhas(j, chave) {
  return (Array.isArray(j && j.data) ? j.data : []).map((x) => ({
    k: x[chave] == null ? "" : String(x[chave]), pageviews: Number(x.pageviews) || 0, visitors: Number(x.visitors) || 0,
  }));
}

async function analytics(dias) {
  const token = process.env.VERCEL_ANALYTICS_TOKEN || "";
  if (!token) return { ok: false, setup: true, error: "Falta a variável VERCEL_ANALYTICS_TOKEN na Vercel." };
  const hit = vaCache.get(dias);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;
  const { project, teamId } = await vaDescobrir(token);
  const agora = Date.now(), ini = agora - dias * 86400000;
  const base = { projectId: project, teamId };
  const periodo = { ...base, since: ini, until: agora };
  const agg = (by, limit) => vaGet("/v1/query/web-analytics/visits/aggregate", { ...periodo, by, limit }, token);
  const [tot, ant, serie, pages, refs, paises, aparelhos, navs, sos] = await Promise.all([
    vaGet("/v1/query/web-analytics/visits/count", periodo, token),
    dias <= 7 ? vaGet("/v1/query/web-analytics/visits/count", { ...base, since: ini - dias * 86400000, until: ini }, token).catch(() => null) : null,
    agg(dias <= 1 ? "hour" : "day", 100),
    agg("requestPath", 10), agg("referrerHostname", 8), agg("country", 8),
    agg("deviceType", 5), agg("browserName", 6), agg("osName", 6),
  ]);
  const num = (j) => ({ pageviews: Number(j && j.data && j.data.pageviews) || 0, visitors: Number(j && j.data && j.data.visitors) || 0 });
  const data = {
    ok: true, dias, since: ini, until: agora, gran: dias <= 1 ? "hour" : "day",
    totals: num(tot), prev: ant ? num(ant) : null,
    series: (Array.isArray(serie.data) ? serie.data : []).map((x) => ({ t: x.timestamp, pageviews: Number(x.pageviews) || 0, visitors: Number(x.visitors) || 0 })),
    top: {
      pages: vaLinhas(pages, "requestPath"), refs: vaLinhas(refs, "referrerHostname"), countries: vaLinhas(paises, "country"),
      devices: vaLinhas(aparelhos, "deviceType"), browsers: vaLinhas(navs, "browserName"), os: vaLinhas(sos, "osName"),
    },
  };
  vaCache.set(dias, { at: Date.now(), data });
  return data;
}

export default async function handler(req, res) {
  // aba "Análise": não depende do Redis, só do login de admin
  if (req.method === "GET" && req.query && req.query.analytics) {
    res.setHeader("Cache-Control", "no-store");
    if (!(await isAdmin(req))) return res.status(401).json({ ok: false, error: "Faça login como admin." });
    const dias = [1, 7, 30].includes(Number(req.query.analytics)) ? Number(req.query.analytics) : 7;
    try {
      return res.status(200).json(await analytics(dias));
    } catch (e) {
      console.error("analytics:", e && e.message);
      const s = e && e.status;
      const msg = s === 401 || s === 403 ? "O token da Vercel não tem permissão (crie um com acesso ao projeto)."
        : s === 404 ? (e.message || "Projeto não encontrado.") + " Confira VERCEL_ANALYTICS_PROJECT ou VERCEL_TEAM_ID."
        : s === 402 ? "O plano da Vercel não liberou a API do Web Analytics."
        : "Não consegui falar com a Vercel agora. Tente de novo em instantes.";
      return res.status(200).json({ ok: false, error: msg, setup: s === 401 || s === 403 || s === 404 });
    }
  }
  res.setHeader("Cache-Control", "no-store");
  if (!redisReady()) return res.status(503).json({ ok: false, error: "O banco Upstash Redis ainda não foi configurado." });
  if (req.method === "POST" && !sameOrigin(req)) return res.status(403).json({ ok: false, error: "Origem não permitida." });
  if (!(await isAdmin(req))) return res.status(401).json({ ok: false, error: "Faça login como admin." });
  try {
    if (req.method === "POST") {
      const b = readBody(req);
      if (b.action !== "seen") return res.status(400).json({ ok: false, error: "Ação inválida." });
      const now = Date.now();
      await redis([["SET", SEEN, String(now)]]);
      return res.status(200).json({ ok: true, seen: now });
    }
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Método não permitido." });
    }

    const [evs, seenRaw, likesFlat, ...polls] = await redis([
      ["LRANGE", EVENTS, 0, 499],
      ["GET", SEEN],
      ["HGETALL", "nz:likes"],
      ...POLLS.map((id) => ["HGETALL", "nz:poll:" + id]),
    ]);
    const comments = await readComments();
    // primeiro acesso: começa a contar a partir de agora (não marca como novos os comentários antigos)
    let seen = Number(seenRaw) || 0;
    if (!seen) { seen = Date.now(); await redis([["SET", SEEN, String(seen)]]); }

    const items = [];
    for (const c of comments.slice(0, 300)) {
      items.push({ t: "comment", id: c.id, name: c.name, msg: c.msg, post: c.post, title: c.title, ts: c.ts, reply: c.reply || undefined, blocked: ofensivo(c.name, c.msg) || undefined });
    }
    for (const raw of evs || []) {
      try {
        const e = JSON.parse(raw);
        if (!e || !e.t || !e.ts) continue;
        if (e.t === "like") items.push({ t: "like", post: String(e.post || ""), ts: e.ts });
        else if (e.t === "vote") items.push({ t: "vote", poll: String(e.poll || ""), opt: String(e.opt || ""), ts: e.ts });
        else if (e.t === "msg") items.push({ t: "msg", name: String(e.name || ""), msg: String(e.msg || ""), mail: !!e.mail, ts: e.ts });
      } catch { /* ignora registro quebrado */ }
    }
    items.sort((a, b) => b.ts - a.ts);
    const list = items.slice(0, 400);

    const likes = hashObj(likesFlat);
    const top = Object.entries(likes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([post, n]) => ({ post, n }));
    const pollStats = {};
    POLLS.forEach((id, i) => { pollStats[id] = hashObj(polls[i]); });

    return res.status(200).json({
      ok: true,
      seen,
      unread: list.filter((x) => x.ts > seen).length,
      items: list,
      stats: {
        likes: Object.values(likes).reduce((a, n) => a + Math.max(0, n), 0),
        comments: comments.length,
        polls: pollStats,
        top,
      },
    });
  } catch (e) {
    console.error("notifications:", e && e.message);
    return res.status(500).json({ ok: false, error: "Erro no servidor. Tente de novo em instantes." });
  }
}
