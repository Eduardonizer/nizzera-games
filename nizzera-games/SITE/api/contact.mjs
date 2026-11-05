// api/contact.mjs — caixa de mensagem do site: envia a mensagem para o e-mail do Nizzera Games
//   POST /api/contact  { name, email, msg }
//
// Envia pelo Resend (resend.com). Variáveis de ambiente:
//   RESEND_API_KEY   (obrigatória)  chave criada no painel do Resend
//   CONTACT_TO       (opcional)     e-mail que recebe; padrão nizzeragames@gmail.com
//   CONTACT_FROM     (opcional)     remetente; padrão "Nizzera Games <onboarding@resend.dev>"
//   (o limite de mensagens por pessoa usa o mesmo Upstash Redis dos comentários, se estiver configurado)
import { createHash } from "node:crypto";

const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const mem = new Map(); // plano B (por instância) quando não há Redis

async function tooMany(req, max, ttl) {
  const fwd = String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "?");
  const ip = fwd.split(",")[0].trim();
  const k = "nz:rl:ct:" + createHash("sha256").update(ip).digest("hex").slice(0, 16);
  if (redisUrl() && redisToken()) {
    try {
      const r = await fetch(redisUrl().replace(/\/$/, "") + "/pipeline", {
        method: "POST",
        headers: { Authorization: "Bearer " + redisToken(), "Content-Type": "application/json" },
        body: JSON.stringify([["SET", k, "0", "EX", ttl, "NX"], ["INCR", k]]),
      });
      const out = await r.json();
      return Number(out && out[1] && out[1].result) > max;
    } catch { /* cai no plano B */ }
  }
  const now = Date.now(), e = mem.get(k);
  if (!e || e.until < now) { mem.set(k, { n: 1, until: now + ttl * 1000 }); return false; }
  e.n++;
  return e.n > max;
}

const clean = (s, max) =>
  String(s == null ? "" : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

// confere o login de admin usando a própria rota /api/me do site
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

// envia pelo Resend; devolve { ok } ou { ok:false, status, detail }
async function sendMail(key, { subject, text, replyTo }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM || "Nizzera Games <onboarding@resend.dev>",
      to: [process.env.CONTACT_TO || "nizzeragames@gmail.com"],
      reply_to: replyTo || undefined,
      subject: subject.replace(/[\r\n]+/g, " "),
      text,
    }),
  });
  if (r.ok) return { ok: true };
  const body = (await r.text()).slice(0, 500);
  let detail = body;
  try { detail = JSON.parse(body).message || body; } catch { /* texto puro */ }
  return { ok: false, status: r.status, detail };
}

// traduz os erros mais comuns do Resend para o painel
function explain(status, detail) {
  const d = String(detail || "");
  if (status === 401 || /api key is invalid/i.test(d)) return "A chave RESEND_API_KEY está errada ou foi apagada. Crie outra no Resend e troque na Vercel.";
  if (status === 403 && /own email|testing emails|verify a domain/i.test(d)) {
    return "O Resend só deixa enviar para o e-mail da própria conta enquanto você não tem domínio verificado. Crie a conta do Resend com o mesmo e-mail que recebe as mensagens (CONTACT_TO), ou ajuste CONTACT_TO para o e-mail da conta.";
  }
  if (status === 403 || status === 422) return "O Resend recusou o remetente. Se você mudou CONTACT_FROM, use um domínio verificado no Resend ou apague essa variável.";
  if (status === 429) return "Limite de envios do Resend atingido. Espere um pouco e tente de novo.";
  return "O Resend respondeu com erro " + status + ".";
}

function readBody(req) {
  const b = req.body;
  if (b && typeof b === "object") return b;
  try { return JSON.parse(b || "{}"); } catch { return {}; }
}

// recusa pedidos que não vieram do próprio site (o navegador sempre manda Origin em POST/DELETE via fetch)
function sameOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  const origin = req.headers.origin;
  if (origin) { try { return new URL(origin).host.toLowerCase() === host; } catch { return false; } }
  return req.headers["sec-fetch-site"] === "same-origin";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método não permitido." });
  }
  if (!sameOrigin(req)) return res.status(403).json({ ok: false, error: "Origem não permitida." });
  try {
    const b = readBody(req);
    if (b.hp) return res.status(200).json({ ok: true }); // robô: finge que deu certo

    // e-mail de teste do painel admin (mostra o motivo exato se falhar)
    if (b.test === true) {
      if (!(await isAdmin(req))) return res.status(401).json({ ok: false, error: "Faça login como admin." });
      const key = process.env.RESEND_API_KEY;
      if (!key) return res.status(503).json({ ok: false, error: "Falta a variável RESEND_API_KEY na Vercel (e um novo deploy depois de criar)." });
      const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const out = await sendMail(key, {
        subject: "[Nizzera Games] Teste de envio de e-mail",
        text: "Se você recebeu este e-mail, a caixa \"Fale com a gente\" do site está funcionando.\n\nEnviado pelo painel admin em " + when + " (horário de Brasília).\n",
      });
      if (out.ok) return res.status(200).json({ ok: true, to: process.env.CONTACT_TO || "nizzeragames@gmail.com" });
      console.error("contact test: resend", out.status, out.detail);
      return res.status(502).json({ ok: false, error: explain(out.status, out.detail), detail: String(out.detail).slice(0, 300) });
    }

    const name = clean(b.name, 60).replace(/\s+/g, " ");
    const email = clean(b.email, 120);
    const msg = clean(b.msg, 1500);
    if (msg.length < 5) return res.status(400).json({ ok: false, error: "Escreva um pouco mais na mensagem." });
    if (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "O e-mail informado parece inválido." });
    }

    const key = process.env.RESEND_API_KEY;
    if (!key) return res.status(503).json({ ok: false, error: "O envio de e-mail ainda não foi configurado no servidor." });

    if (await tooMany(req, 3, 600)) {
      return res.status(429).json({ ok: false, error: "Muitas mensagens em pouco tempo. Tente de novo em alguns minutos." });
    }

    const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const text =
      "Nova mensagem pelo site Nizzera Games\n\n" +
      "Nome: " + (name || "(não informado)") + "\n" +
      "E-mail: " + (email || "(não informado)") + "\n" +
      "Enviada em: " + when + " (horário de Brasília)\n\n" +
      "Mensagem:\n" + msg + "\n";

    const out = await sendMail(key, { subject: "[Nizzera Games] Mensagem de " + (name || "visitante"), text, replyTo: email });
    if (!out.ok) {
      console.error("contact: resend", out.status, out.detail);
      return res.status(502).json({ ok: false, error: "Não consegui enviar o e-mail agora." });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("contact:", e && e.message);
    return res.status(500).json({ ok: false, error: "Erro no servidor. Tente de novo em instantes." });
  }
}
