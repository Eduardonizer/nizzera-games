// api/_redis.mjs — funções comuns de comentários e curtidas (o "_" no nome faz a Vercel não criar rota para este arquivo)
// Usa o Upstash Redis (Vercel → Storage). Variáveis de ambiente aceitas:
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (ou KV_REST_API_URL + KV_REST_API_TOKEN)
import { createHash } from "node:crypto";

export const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
export const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const redisReady = () => !!(redisUrl() && redisToken());

export async function redis(cmds) {
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

// identificador do visitante sem guardar o IP em si (só um pedaço do hash)
export function visitor(req) {
  const fwd = String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "?");
  return createHash("sha256").update(fwd.split(",")[0].trim()).digest("hex").slice(0, 16);
}

export async function tooMany(req, bucket, max, ttl) {
  const k = "nz:rl:" + bucket + ":" + visitor(req);
  const out = await redis([["SET", k, "0", "EX", ttl, "NX"], ["INCR", k]]);
  return Number(out[1]) > max;
}

export function readBody(req) {
  const b = req.body;
  if (b && typeof b === "object") return b;
  try { return JSON.parse(b || "{}"); } catch { return {}; }
}

// recusa pedidos que não vieram do próprio site (o navegador sempre manda Origin em POST/DELETE via fetch)
export function sameOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  const origin = req.headers.origin;
  if (origin) { try { return new URL(origin).host.toLowerCase() === host; } catch { return false; } }
  return req.headers["sec-fetch-site"] === "same-origin";
}

// endereço de uma notícia (/noticia/<slug>/): só letras minúsculas, números e hífen
export const POST_OK = /^[a-z0-9][a-z0-9-]{0,119}$/;

// confere o login de admin usando a própria rota /api/me do site (a mesma que o painel usa)
export async function isAdmin(req) {
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

// comentários guardados (hash "nz:comments"), do mais novo para o mais antigo
export const COMMENTS = "nz:comments";
export async function readComments() {
  const [flat] = await redis([["HGETALL", COMMENTS]]);
  let pairs = [];
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  else if (flat && typeof flat === "object") pairs = Object.entries(flat);
  const items = [];
  for (const [id, v] of pairs) {
    try {
      const c = JSON.parse(v);
      if (c && c.msg) items.push({ id, name: c.name || "", msg: c.msg, ts: Number(c.ts) || 0, post: c.post || "", title: c.title || "", reply: c.reply || "", rts: Number(c.rts) || 0 });
    } catch { /* ignora registro quebrado */ }
  }
  items.sort((a, b) => b.ts - a.ts);
  return items;
}

// notificações do painel admin: lista "nz:events" com os 500 eventos mais recentes
// (curtidas novas, votos, mensagens do "Fale com a gente"). Os comentários vêm direto de nz:comments.
// Nunca derruba a ação principal: se o Redis falhar aqui, só registra no log.
export const EVENTS = "nz:events";
export async function logEvent(ev) {
  try {
    await redis([["LPUSH", EVENTS, JSON.stringify({ ...ev, ts: Date.now() })], ["LTRIM", EVENTS, 0, 499]]);
  } catch (e) {
    console.error("events:", e && e.message);
  }
}
