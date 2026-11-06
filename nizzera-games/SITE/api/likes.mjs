// api/likes.mjs — curtidas das notícias do Nizzera Games
//   GET  /api/likes?post=SLUG          -> { count, liked }   (liked = este visitante já curtiu)
//   GET  /api/likes?posts=A,B,C        -> { counts: {A: n, B: n, ...} }   (cards da página inicial, até 40)
//   POST /api/likes  { post, like }    -> like:true curte, like:false desfaz; devolve { count, liked }
//
// Cada visitante (pelo hash do IP, sem guardar o IP) curte uma vez por notícia; a marca dura 60 dias.
// Contagem: hash "nz:likes" (campo = slug da notícia). Guardado no Upstash Redis, veja api/_redis.mjs.
import { redis, redisReady, visitor, tooMany, readBody, sameOrigin, POST_OK } from "./_redis.mjs";

const KEY = "nz:likes";
const MARK_TTL = 60 * 24 * 3600;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!redisReady()) return res.status(503).json({ ok: false, error: "Curtidas ainda não configuradas no servidor." });
  if (req.method === "POST" && !sameOrigin(req)) return res.status(403).json({ ok: false, error: "Origem não permitida." });
  try {
    const lista = req.method === "GET" && req.query && req.query.posts;
    if (lista) {
      const posts = [...new Set(String(lista).split(","))].filter((p) => POST_OK.test(p)).slice(0, 40);
      if (!posts.length) return res.status(200).json({ ok: true, counts: {} });
      const [vals] = await redis([["HMGET", KEY, ...posts]]);
      const counts = {};
      posts.forEach((p, i) => { counts[p] = Math.max(0, Number(vals && vals[i]) || 0); });
      return res.status(200).json({ ok: true, counts });
    }
    const b = req.method === "POST" ? readBody(req) : {};
    const post = String((req.method === "POST" ? b.post : req.query && req.query.post) || "");
    if (!POST_OK.test(post)) return res.status(400).json({ ok: false, error: "Notícia inválida." });
    const mark = "nz:lk:" + post + ":" + visitor(req);

    if (req.method === "GET") {
      const [count, liked] = await redis([["HGET", KEY, post], ["EXISTS", mark]]);
      return res.status(200).json({ ok: true, count: Math.max(0, Number(count) || 0), liked: Number(liked) === 1 });
    }

    if (req.method === "POST") {
      if (await tooMany(req, "lk", 40, 600)) {
        return res.status(429).json({ ok: false, error: "Muitas curtidas em pouco tempo. Tente de novo em alguns minutos." });
      }
      let liked;
      if (b.like === false) {
        const [gone] = await redis([["DEL", mark]]);
        if (Number(gone) === 1) await redis([["HINCRBY", KEY, post, -1]]);
        liked = false;
      } else {
        const [set] = await redis([["SET", mark, "1", "EX", MARK_TTL, "NX"]]);
        if (set === "OK") await redis([["HINCRBY", KEY, post, 1]]);
        liked = true;
      }
      const [count] = await redis([["HGET", KEY, post]]);
      return res.status(200).json({ ok: true, count: Math.max(0, Number(count) || 0), liked });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Método não permitido." });
  } catch (e) {
    console.error("likes:", e && e.message);
    return res.status(500).json({ ok: false, error: "Erro no servidor. Tente de novo em instantes." });
  }
}
