// api/comments.mjs — comentários do site Nizzera Games
//   GET    /api/comments            -> lista pública (100 mais recentes)
//   GET    /api/comments?all=1      -> lista do admin (até 300) — exige login de admin
//   POST   /api/comments            -> { name, msg } publica um comentário
//   DELETE /api/comments?id=XXXX    -> remove um comentário — exige login de admin
//
// Guarda os dados no Upstash Redis (Vercel → Storage). Variáveis de ambiente aceitas:
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (ou KV_REST_API_URL + KV_REST_API_TOKEN)
import { createHash, randomBytes } from "node:crypto";

const KEY = "nz:comments";
const MAX_STORED = 500;

const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmds) {
  const r = await fetch(redisUrl().replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + redisToken(), "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error("redis HTTP " + r.status);
  const out = await r.json();
  return out.map((x) => {
    if (x && x.error) throw new Error("redis: " + x.error);
    return x ? x.result : null;
  });
}

// confere o login de admin usando a própria rota /api/me do site (a mesma que o painel usa)
async function isAdmin(req) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    if (!host || !req.headers.cookie) return false;
    const r = await fetch("https://" + host + "/api/me", { headers: { cookie: req.headers.cookie } });
    const j = await r.json().catch(() => ({}));
    return !!(r.ok && j && j.ok);
  } catch {
    return false;
  }
}

async function tooMany(req, bucket, max, ttl) {
  const fwd = String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "?");
  const ip = fwd.split(",")[0].trim();
  const k = "nz:rl:" + bucket + ":" + createHash("sha256").update(ip).digest("hex").slice(0, 16);
  const out = await redis([["SET", k, "0", "EX", ttl, "NX"], ["INCR", k]]);
  return Number(out[1]) > max;
}

const clean = (s, max) =>
  String(s == null ? "" : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

function readBody(req) {
  const b = req.body;
  if (b && typeof b === "object") return b;
  try { return JSON.parse(b || "{}"); } catch { return {}; }
}

async function readAll() {
  const [flat] = await redis([["HGETALL", KEY]]);
  let pairs = [];
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  else if (flat && typeof flat === "object") pairs = Object.entries(flat);
  const items = [];
  for (const [id, v] of pairs) {
    try {
      const c = JSON.parse(v);
      if (c && c.msg) items.push({ id, name: c.name || "", msg: c.msg, ts: Number(c.ts) || 0 });
    } catch { /* ignora registro quebrado */ }
  }
  items.sort((a, b) => b.ts - a.ts);
  return items;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!redisUrl() || !redisToken()) {
    return res.status(503).json({ ok: false, error: "Os comentários ainda não foram configurados no servidor." });
  }
  try {
    if (req.method === "GET") {
      const all = req.query && req.query.all === "1";
      if (all && !(await isAdmin(req))) return res.status(401).json({ ok: false, error: "Faça login como admin." });
      const items = await readAll();
      return res.status(200).json({ ok: true, items: items.slice(0, all ? 300 : 100) });
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
      if (await tooMany(req, "cm", 3, 600)) {
        return res.status(429).json({ ok: false, error: "Muitos comentários em pouco tempo. Tente de novo em alguns minutos." });
      }
      const id = Date.now().toString(36) + randomBytes(3).toString("hex");
      await redis([["HSET", KEY, id, JSON.stringify({ name, msg, ts: Date.now() })]]);
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
