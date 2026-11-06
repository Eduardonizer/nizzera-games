// api/notifications.mjs — notificações e resumo do painel admin (exige login de admin)
//   GET  /api/notifications                  -> { items, seen, unread, stats }
//   POST /api/notifications { action:"seen" } -> marca tudo como lido (vale para todos os aparelhos)
//
// items: comentários (de nz:comments, inclusive os antigos) + eventos de nz:events
//        (curtidas novas, votos e mensagens do "Fale com a gente", registrados a partir de agora),
//        do mais novo para o mais antigo. Cada item tem t ("comment" | "like" | "vote" | "msg") e ts.
// stats: totais de curtidas, comentários e votos, e as notícias/reviews mais curtidas.
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

export default async function handler(req, res) {
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
      items.push({ t: "comment", id: c.id, name: c.name, msg: c.msg, post: c.post, title: c.title, ts: c.ts, blocked: ofensivo(c.name, c.msg) || undefined });
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
