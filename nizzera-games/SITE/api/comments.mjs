// api/comments.mjs — comentários do site Nizzera Games
//   GET    /api/comments              -> comentários gerais da página /comentarios/ (100 mais recentes)
//   GET    /api/comments?post=SLUG    -> comentários de uma notícia (/noticia/SLUG/)
//   GET    /api/comments?all=1        -> lista do admin (gerais + das notícias) — exige login de admin
//   POST   /api/comments              -> { name, msg, post?, title? } publica um comentário
//   DELETE /api/comments?id=XXXX      -> remove um comentário — exige login de admin
//
// Guarda os dados no Upstash Redis (Vercel → Storage). Veja api/_redis.mjs.
// Palavras ofensivas: veja api/_filtro.mjs (recusa no envio e esconde da lista pública).
import { randomBytes } from "node:crypto";
import { redis, redisReady, tooMany, readBody, sameOrigin, POST_OK, isAdmin, readComments as readAll, COMMENTS as KEY } from "./_redis.mjs";
import { ofensivo } from "./_filtro.mjs";

const MAX_STORED = 2000;

const clean = (s, max) =>
  String(s == null ? "" : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!redisReady()) {
    return res.status(503).json({ ok: false, error: "Os comentários ainda não foram configurados no servidor." });
  }
  if ((req.method === "POST" || req.method === "DELETE") && !sameOrigin(req)) {
    return res.status(403).json({ ok: false, error: "Origem não permitida." });
  }
  try {
    if (req.method === "GET") {
      const all = req.query && req.query.all === "1";
      if (all && !(await isAdmin(req))) return res.status(401).json({ ok: false, error: "Faça login como admin." });
      const post = String((req.query && req.query.post) || "");
      if (post && !POST_OK.test(post)) return res.status(400).json({ ok: false, error: "Notícia inválida." });
      const items = await readAll();
      if (all) return res.status(200).json({ ok: true, items: items.slice(0, 500).map((c) => (ofensivo(c.name, c.msg) ? { ...c, blocked: true } : c)) });
      // sem ?post= mostra só os comentários gerais; com ?post= só os daquela notícia.
      // os que caem no filtro (ex.: palavra adicionada depois) não aparecem para o público
      const pub = items.filter((c) => c.post === post && !ofensivo(c.name, c.msg)).map(({ title, ...c }) => c);
      return res.status(200).json({ ok: true, items: pub.slice(0, post ? 300 : 100) });
    }

    if (req.method === "POST") {
      const b = readBody(req);
      if (b.hp) return res.status(200).json({ ok: true }); // robô preencheu o campo escondido: finge que deu certo
      const name = clean(b.name, 40).replace(/\s+/g, " ");
      const msg = clean(b.msg, 500);
      if (msg.length < 3) return res.status(400).json({ ok: false, error: "Escreva pelo menos algumas palavras." });
      if (/https?:\/\/|www\./i.test(msg) || /https?:\/\/|www\./i.test(name)) {
        return res.status(400).json({ ok: false, error: "Por segurança, comentários não podem ter links." });
      }
      if (ofensivo(name, msg)) {
        return res.status(400).json({ ok: false, error: "Seu comentário tem palavras ofensivas e não foi publicado. Reescreva sem xingamentos ou preconceito." });
      }
      if (await tooMany(req, "cm", 3, 600)) {
        return res.status(429).json({ ok: false, error: "Muitos comentários em pouco tempo. Tente de novo em alguns minutos." });
      }
      const post = String(b.post || "");
      if (post && !POST_OK.test(post)) return res.status(400).json({ ok: false, error: "Notícia inválida." });
      const title = post ? clean(b.title, 160).replace(/\s+/g, " ") : "";
      const id = Date.now().toString(36) + randomBytes(3).toString("hex");
      const rec = { name, msg, ts: Date.now() };
      if (post) { rec.post = post; rec.title = title; }
      await redis([["HSET", KEY, id, JSON.stringify(rec)]]);
      const [len] = await redis([["HLEN", KEY]]);
      if (Number(len) > MAX_STORED) {
        const old = (await readAll()).slice(MAX_STORED).map((c) => c.id);
        if (old.length) await redis([["HDEL", KEY, ...old]]);
      }
      return res.status(200).json({ ok: true, id });
    }

    if (req.method === "DELETE") {
      if (!(await isAdmin(req))) return res.status(401).json({ ok: false, error: "Faça login como admin." });
      const id = String((req.query && req.query.id) || "");
      if (!/^[a-z0-9]{6,32}$/.test(id)) return res.status(400).json({ ok: false, error: "Comentário inválido." });
      await redis([["HDEL", KEY, id]]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "Método não permitido." });
  } catch (e) {
    console.error("comments:", e && e.message);
    return res.status(500).json({ ok: false, error: "Erro no servidor. Tente de novo em instantes." });
  }
}
