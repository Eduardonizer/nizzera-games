// api/drafts.mjs — rascunhos de matéria escritos com IA (painel admin, aba "Rascunhos"). Exige login de admin.
//   GET  /api/drafts                                   -> lista os rascunhos (sem o texto das fontes)
//   POST /api/drafts { action: "save", id, draft }     -> grava a sua edição (título, subtítulo, texto, opinião, capa...)
//        "opiniao" é o SEU texto (bloco "Na opinião do Nizzera"); "minha_opiniao" é só a sugestão da IA
//   POST /api/drafts { action: "status", id, status }  -> "descartado", "rascunho" (desfazer) ou "publicado" (+ newsId, slug)
//   POST /api/drafts { action: "regen", id }           -> pede ao Gemini uma nova versão a partir das mesmas fontes
//
// Os rascunhos são criados 1 vez por dia pelo robô (scripts/rascunhos_ia.py) e ficam no Upstash Redis:
//   nz:drafts      hash  id -> rascunho (JSON)
//   nz:drafts:src  hash  id -> texto das fontes usado para gerar (para o "Gerar de novo")
// Variáveis de ambiente: as do Redis (veja api/_redis.mjs) e GEMINI_API_KEY (só para o "Gerar de novo").
import { readFileSync } from "node:fs";
import { redis, redisReady, readBody, sameOrigin, isAdmin } from "./_redis.mjs";

const DRAFTS = "nz:drafts", SRC = "nz:drafts:src";
const MODEL = "gemini-3.5-flash-lite"; // o mesmo de MODELO em scripts/rascunhos_ia.py (GEMINI_MODEL na Vercel troca)
const RESERVE = "gemini-3.1-flash-lite"; // usado quando o principal responde "muita demanda" (503)
const ID = /^r[0-9a-f]{11}$/;
const HTTP = /^https?:\/\/[^\s"'<>]+$/i;
const PLAT = ["PC", "Steam", "PlayStation", "Xbox", "Nintendo", "Mobile", "Geral"];
const STATUS = ["rascunho", "publicado", "descartado"];

let PROMPT = null;
function prompt() {
  if (!PROMPT) PROMPT = JSON.parse(readFileSync(new URL("./_rascunho_ia.json", import.meta.url), "utf8"));
  return PROMPT;
}

class Bad extends Error {}

const txt = (s, max) =>
  String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const line = (s, max) => txt(s, max * 2).replace(/\s+/g, " ").slice(0, max);
const now = () => {
  // horário de Brasília, no mesmo formato do robô (2026-11-06T03:40:12-03:00)
  const d = new Date(Date.now() - 3 * 3600e3);
  return d.toISOString().replace(/\.\d+Z$/, "-03:00");
};

async function getDraft(id) {
  if (!ID.test(String(id || ""))) throw new Bad("Rascunho inválido.");
  const [raw] = await redis([["HGET", DRAFTS, id]]);
  if (!raw) throw new Bad("Esse rascunho não existe mais.");
  return JSON.parse(raw);
}
async function putDraft(d) {
  d.atualizado = now();
  await redis([["HSET", DRAFTS, d.id, JSON.stringify(d)]]);
  return d;
}

// mesmo tratamento de validar() em scripts/rascunhos_ia.py
function fromGemini(g) {
  if (!g || typeof g !== "object") throw new Bad("O Gemini não devolveu um JSON válido. Tente de novo.");
  const clean = (s, n) => String(s == null ? "" : s).replace(/\*\*|__/g, "").replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim().slice(0, n);
  let paras = g.texto;
  if (typeof paras === "string") paras = paras.split(/\n\s*\n/);
  paras = (Array.isArray(paras) ? paras : []).map((p) => clean(p, 3000)).filter((p) => p && !/^fontes?\s*:/i.test(p));
  const out = {
    titulo: clean(g.titulo, 200).replace(/\.$/, ""),
    subtitulo: clean(g.subtitulo, 300),
    texto: paras.join("\n\n"),
    tags: (Array.isArray(g.tags) ? g.tags : []).map((t) => clean(t, 40).toLowerCase()).filter(Boolean).slice(0, 8),
    plataforma: PLAT.includes(g.plataforma) ? g.plataforma : "Geral",
    minha_opiniao: clean(g.minha_opiniao, 1000),
  };
  const n = out.texto.split(/\s+/).filter(Boolean).length;
  if (!out.titulo || n < 80) throw new Bad(`O Gemini devolveu uma matéria curta demais (${n} palavras). Tente de novo.`);
  return out;
}

async function regenerate(d) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Bad("Falta a variável GEMINI_API_KEY na Vercel (Settings → Environment Variables). Depois faça um Redeploy.");
  const [raw] = await redis([["HGET", SRC, d.id]]);
  let src = null;
  try { src = JSON.parse(raw || "null"); } catch (_) {}
  if (!src || !Array.isArray(src.fontes) || !src.fontes.length) throw new Bad("O texto das fontes deste rascunho não está mais guardado. Não dá para gerar de novo.");
  const P = prompt();
  // troca {campo} pelo valor numa passada só (com função: um "$" no texto da fonte não vira padrão de substituição)
  const fill = (tpl, m) => tpl.replace(/\{(\w+)\}/g, (all, k) => (k in m ? String(m[k] == null ? "" : m[k]) : all));
  const blocks = src.fontes.map((f, i) => fill(P.fonte, { n: i + 1, nome: f.nome, titulo: f.titulo, pub: f.pub, url: f.url, texto: f.texto }));
  if (src.contexto) blocks.push(fill(P.contexto, { contexto: src.contexto }));
  blocks.push(fill(P.pedido, { qtd: src.fontes.length }));
  blocks.push("Esta é uma NOVA versão: escreva diferente da anterior (outro título e outra abertura), mantendo os mesmos fatos.");
  const body = {
    systemInstruction: { parts: [{ text: P.instrucoes }] },
    contents: [{ role: "user", parts: [{ text: blocks.join("\n\n") }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: P.schema },
  };
  // principal; se der erro do servidor (503 = muita demanda), espera um pouco e tenta o modelo reserva
  const models = [process.env.GEMINI_MODEL || MODEL, RESERVE];
  let r, model;
  for (let attempt = 0; attempt < models.length; attempt++) {
    model = models[attempt];
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (r.status >= 500 && attempt === 0) { await new Promise((ok) => setTimeout(ok, 2000)); continue; }
    break;
  }
  if (r.status === 429) throw new Bad("O limite do plano grátis do Gemini foi atingido. Tente de novo daqui a 1 minuto (ou amanhã, se for o limite do dia).");
  if (r.status === 400 || r.status === 403) {
    const j = await r.json().catch(() => ({}));
    throw new Bad("O Gemini recusou o pedido (código " + r.status + "): " + String((j.error && j.error.message) || "confira a GEMINI_API_KEY").slice(0, 200));
  }
  if (!r.ok) throw new Bad(r.status === 503 ? "O Gemini está com muita demanda agora. Tente de novo daqui a alguns minutos." : "O Gemini está fora do ar agora (código " + r.status + "). Tente de novo mais tarde.");
  const j = await r.json();
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const out = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
  let g;
  try { g = JSON.parse(out); } catch (_) { throw new Bad("O Gemini não devolveu um JSON válido. Tente de novo."); }
  Object.assign(d, fromGemini(g), { modelo: model, gerado_de_novo: (d.gerado_de_novo || 0) + 1 });
  return putDraft(d);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!redisReady()) return res.status(503).json({ ok: false, error: "O banco (Upstash Redis) ainda não foi configurado no servidor." });
  if (req.method === "POST" && !sameOrigin(req)) return res.status(403).json({ ok: false, error: "Origem não permitida." });
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ ok: false, error: "Método não permitido." });
  if (!(await isAdmin(req))) return res.status(401).json({ ok: false, error: "Sessão expirada. Entre de novo." });
  try {
    if (req.method === "GET") {
      const [flat] = await redis([["HGETALL", DRAFTS]]);
      let pairs = [];
      if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) pairs.push(flat[i + 1]);
      else if (flat && typeof flat === "object") pairs = Object.values(flat);
      const items = [];
      for (const v of pairs) { try { items.push(JSON.parse(v)); } catch (_) { /* registro quebrado */ } }
      items.sort((a, b) => String(b.criado || "").localeCompare(String(a.criado || "")));
      return res.status(200).json({ ok: true, items, gemini: !!process.env.GEMINI_API_KEY });
    }
    const body = readBody(req);
    const d = await getDraft(body.id);
    if (body.action === "save") {
      const x = body.draft || {};
      const img = txt(x.img, 2000);
      if (img && !HTTP.test(img)) throw new Bad("O link da imagem precisa começar com http:// ou https://");
      Object.assign(d, {
        titulo: line(x.titulo, 200), subtitulo: line(x.subtitulo, 300), texto: txt(x.texto, 30000).replace(/\n{3,}/g, "\n\n"),
        opiniao: txt(x.opiniao, 2000), cat: line(x.cat, 40) || d.cat, img, credito: line(x.credito, 200),
        tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => line(t, 40).toLowerCase()).filter(Boolean).slice(0, 8),
      });
      if (!d.titulo) throw new Bad("O rascunho precisa de um título.");
      return res.status(200).json({ ok: true, draft: await putDraft(d) });
    }
    if (body.action === "status") {
      if (!STATUS.includes(body.status)) throw new Bad("Situação inválida.");
      d.status = body.status;
      if (body.status === "publicado") {
        d.publicado = { newsId: Number(body.newsId) || 0, slug: /^[a-z0-9-]{1,90}$/.test(body.slug || "") ? body.slug : "", em: now() };
      }
      return res.status(200).json({ ok: true, draft: await putDraft(d) });
    }
    if (body.action === "regen") {
      if (d.status !== "rascunho") throw new Bad("Só dá para gerar de novo um rascunho pendente.");
      return res.status(200).json({ ok: true, draft: await regenerate(d) });
    }
    throw new Bad("Ação inválida.");
  } catch (e) {
    if (e instanceof Bad) return res.status(400).json({ ok: false, error: e.message });
    if (e && e.name === "TimeoutError") return res.status(504).json({ ok: false, error: "O Gemini demorou demais para responder. Tente de novo." });
    console.error("drafts:", e && e.message);
    return res.status(502).json({ ok: false, error: "Falha ao falar com o banco ou com o Gemini. Tente de novo." });
  }
}
