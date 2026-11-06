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
