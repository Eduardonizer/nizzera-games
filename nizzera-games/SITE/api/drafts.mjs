// api/drafts.mjs — rascunhos de matéria escritos com IA (painel admin, aba "Rascunhos"). Exige login de admin.
//   GET  /api/drafts                                   -> lista os rascunhos (sem o texto das fontes)
//   POST /api/drafts { action: "save", id, draft }     -> grava a sua edição (título, subtítulo, texto, opinião, capa...)
//        "opiniao" é o SEU texto (bloco "Na opinião do Nizzera"); "minha_opiniao" é só a sugestão da IA
//   POST /api/drafts { action: "status", id, status }  -> "descartado", "rascunho" (desfazer) ou "publicado" (+ newsId, slug)
//   POST /api/drafts { action: "regen", id }           -> pede ao Gemini uma nova versão a partir das mesmas fontes
//   POST /api/drafts { action: "images", id }          -> outras imagens do mesmo assunto, para trocar a capa:
//        fotos das matérias de origem e capa/capturas oficiais da Steam dos jogos citados
//   POST /api/drafts { action: "images", item: { titulo, tags, img, fontes: [{ nome, url }] } }
//        -> o mesmo para uma notícia já publicada (editor da aba Notícias)
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

/* ---- outras imagens para a capa ---- */
const UA = { "User-Agent": "Mozilla/5.0 (compatible; NizzeraGamesBot/1.0)", Accept: "text/html,application/json;q=0.9,*/*;q=0.8" };
const JUNK = /logo|icon|avatar|sprite|placeholder|emoji|gravatar|favicon|banner-?ad|\/ads?\/|pixel|1x1|blank\.|loading|spinner|badge|selo|author|autor|\.svg|\.gif/i;
// palavras que não são nome de jogo (não adianta procurar na Steam)
const NOT_GAME = new Set(["nintendo", "sony", "playstation", "ps5", "ps4", "xbox", "microsoft", "steam", "valve", "switch", "switch 2", "nintendo switch",
  "nintendo switch 2", "pc", "mobile", "android", "ios", "console", "consoles", "remake", "remaster", "trailer", "lançamento", "oferta", "ofertas",
  "amazon", "epic games", "epic games store", "game pass", "ps plus", "take-two", "rockstar", "rockstar games", "ubisoft", "ea", "capcom", "sega",
  "bandai namco", "square enix", "esports", "black friday", "pirataria", "multiplayer", "rpg", "fps", "indie"]);
const plain = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const ROMAN = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
const toks = (t) => plain(t).split(" ").filter(Boolean).map((w) => ROMAN[w] || w);

async function getText(url, max = 900000) {
  const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = await r.text();
  return t.slice(0, max);
}
function absUrl(u, base) {
  try { const x = new URL(String(u).replace(/&amp;/g, "&").trim(), base); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch (_) { return ""; }
}
// fotos de uma matéria: og:image, twitter:image e as imagens do corpo do texto
function pageImages(html, base) {
  const out = [];
  const meta = (prop) => {
    const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']+)', "i"))
      || html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', "i"));
    return m ? absUrl(m[1], base) : "";
  };
  [meta("og:image"), meta("twitter:image")].forEach((u) => u && out.push(u));
  // só o corpo da matéria: começa no bloco do texto e para antes de "relacionadas", "leia também" e comentários
  // (senão entram as fotos das outras matérias do site)
  const start = html.search(/class=["'][^"']*\b(entry-content|post-content|td-post-content|article-body|articleBody|article__body|content-body|post-body|materia|single-content|texto)\b|itemprop=["']articleBody/i);
  let art = start > -1 ? html.slice(start, start + 120000) : ((html.match(/<article\b[\s\S]*?<\/article>/i) || [""])[0]);
  const end = art.search(/relacionad|related|leia (tamb[eé]m|mais)|veja (tamb[eé]m|mais)|jp-relatedposts|yarpp|you may also|comments|coment[aá]rios|newsletter/i);
  if (end > 200) art = art.slice(0, end);
  for (const tag of art.match(/<img\b[^>]*>/gi) || []) {
    const attr = (n) => { const m = tag.match(new RegExp("\\s" + n + '=["\']([^"\']+)', "i")); return m ? m[1] : ""; };
    const w = parseInt(attr("width"), 10);
    if (w && w < 300) continue;
    let src = attr("data-src") || attr("data-lazy-src") || attr("src");
    const set = attr("data-srcset") || attr("srcset");
    if (set) { // pega a maior opção do srcset
      const best = set.split(",").map((x) => x.trim().split(/\s+/)).map(([u, d]) => [u, parseInt(d, 10) || 0]).sort((a, b) => b[1] - a[1])[0];
      if (best && best[0]) src = best[0];
    }
    const u = absUrl(src, base);
    if (u && !/^data:/i.test(src)) out.push(u);
  }
  return out;
}
// imagem do WordPress em tamanho reduzido (foto-640x400.jpg): oferece a original (o painel volta para a reduzida se não abrir)
function bigger(u) {
  const b = u.replace(/-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp)(\?|$))/i, "");
  return b !== u ? b : "";
}
async function steamImages(names) {
  const out = [];
  // "stellar blade complete edition" não acha nada na Steam: tenta também sem as últimas palavras
  const terms = [];
  for (const n of names) {
    const w = n.split(/\s+/);
    for (let k = w.length; k >= Math.min(2, w.length); k--) { const t = w.slice(0, k).join(" "); if (!terms.includes(t)) terms.push(t); }
  }
  const done = new Set();
  for (const name of terms.slice(0, 10)) {
    try {
      const j = JSON.parse(await getText("https://store.steampowered.com/api/storesearch/?cc=br&l=portuguese&term=" + encodeURIComponent(name), 200000));
      const want = toks(name);
      // só aceita o jogo se o nome dele tiver todas as palavras procuradas (evita "GTA 6" virar GTA V)
      // ou o nome do jogo inteiro dentro do termo ("Stellar Blade Complete Edition" acha "Stellar Blade™")
      const hit = (j.items || []).find((it) => {
        const name = toks(it.name), have = new Set(name), w = new Set(want);
        return want.every((x) => have.has(x)) || (plain(it.name).length >= 5 && name.every((x) => w.has(x)));
      });
      if (!hit || done.has(hit.id)) continue;
      done.add(hit.id);
      const d = JSON.parse(await getText("https://store.steampowered.com/api/appdetails?l=portuguese&appids=" + hit.id, 1500000));
      const data = d && d[hit.id] && d[hit.id].success ? d[hit.id].data : null;
      if (!data) continue;
      const pub = Array.isArray(data.publishers) && data.publishers[0] ? String(data.publishers[0]) : "";
      // "PlayStation Publishing LLC (excluding China)" -> "PlayStation Publishing"
      const credit = "divulgação / " + (pub.replace(/\s*\(.*?\)\s*/g, " ").replace(/,?\s+(LLC|Inc\.?|Ltd\.?|S\.?A\.?|GmbH|Co\.,? Ltd\.?)$/i, "").trim() || "Steam");
      const label = "Steam: " + data.name;
      if (data.header_image) out.push({ url: data.header_image, credito: credit, origem: label + " (capa)" });
      (data.screenshots || []).slice(0, 8).forEach((x) => x && x.path_full && out.push({ url: x.path_full, credito: credit, origem: label }));
    } catch (_) { /* Steam fora ou jogo não encontrado: segue */ }
    if (out.length >= 18) break;
  }
  return out;
}
// nomes próprios do título: "Stellar Blade Complete Edition chega à Nintendo Switch 2" -> "Stellar Blade Complete Edition", "Nintendo Switch 2"
function titleNames(t) {
  const words = String(t || "").replace(/[“”"«»()\[\]]/g, " ").split(/\s+/).filter(Boolean);
  const cap = (w) => /^[A-ZÀ-Ý0-9]/.test(w) || /^(i{1,3}|iv|vi{0,3}|ix|x)$/i.test(w.replace(/[:,.;!?]$/, "")) && /^[A-Z]/.test(w);
  const runs = [];
  let cur = [];
  words.forEach((w, i) => {
    const clean = w.replace(/[,.;!?]+$/, "");
    if (cap(clean)) { cur.push(clean.replace(/:$/, "")); if (/:$/.test(clean)) { runs.push(cur); cur = []; } }
    else if (cur.length && /^(of|the|and|&|de|do|da|of)$/i.test(clean) && words[i + 1] && cap(words[i + 1])) cur.push(clean);
    else { if (cur.length) runs.push(cur); cur = []; }
  });
  if (cur.length) runs.push(cur);
  return runs.map((r) => r.join(" ")).filter((n) => plain(n).length >= 4);
}
async function findImages(d) {
  const fontes = (Array.isArray(d.fontes) ? d.fontes : []).filter((f) => f && /^https?:\/\//i.test(f.url || ""));
  const fromPages = await Promise.all(fontes.map(async (f) => {
    try {
      return pageImages(await getText(f.url), f.url).map((u) => ({ url: u, credito: "divulgação / " + f.nome, origem: f.nome }));
    } catch (_) { return []; }
  }));
  // nomes de jogo: palavras-chave do rascunho que não são empresa/plataforma
  const names = [...new Set([...(d.tags || []), ...titleNames(d.titulo)].map((t) => String(t).trim().toLowerCase())
    .filter((t) => t.length >= 3 && !NOT_GAME.has(t)))].slice(0, 5);
  const steam = await steamImages(names);
  const seen = new Set(), out = [];
  const key = (u) => u.replace(/^https?:\/\//, "").replace(/\?.*$/, "").replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "").toLowerCase();
  for (const x of [].concat(...fromPages, steam)) {
    if (!x.url || JUNK.test(x.url) || x.url.length > 2000) continue;
    const k = key(x.url);
    if (seen.has(k) || (d.img && key(d.img) === k && x.url === d.img)) continue;
    seen.add(k);
    const big = bigger(x.url);
    out.push(big ? { ...x, url: big, menor: x.url } : x);
    if (out.length >= 36) break;
  }
  return out;
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
    if (body.action === "images" && !body.id) {
      const it = body.item || {};
      const item = {
        titulo: line(it.titulo, 300), img: txt(it.img, 2000),
        tags: (Array.isArray(it.tags) ? it.tags : []).slice(0, 10).map((t) => line(t, 40)),
        fontes: (Array.isArray(it.fontes) ? it.fontes : []).slice(0, 6).map((f) => ({ nome: line(f && f.nome, 120), url: txt(f && f.url, 2000) }))
          .filter((f) => HTTP.test(f.url)),
      };
      return res.status(200).json({ ok: true, images: await findImages(item) });
    }
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
    if (body.action === "images") {
      return res.status(200).json({ ok: true, images: await findImages(d) });
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
