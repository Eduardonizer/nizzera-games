// Funções de apoio do painel admin (arquivos com "_" no começo não viram endpoints na Vercel).
//
// Variáveis de ambiente (Vercel > Settings > Environment Variables):
//   ADMIN_PASSWORD     senha do painel (use 16+ caracteres)
//   SESSION_SECRET     texto aleatório de 32+ caracteres que assina a sessão
//   ADMIN_TOTP_SECRET  opcional: ativa o código de 6 dígitos do app autenticador (2FA)
//   GITHUB_REPO, GITHUB_TOKEN, GITHUB_BRANCH, GITHUB_FILE   usados para publicar
const crypto = require("crypto");

// "__Host-" faz o navegador recusar o cookie se ele não for Secure, Path=/ e sem Domain
const COOKIE = "__Host-nz_admin";
const TTL_SECONDS = 8 * 60 * 60; // sessão dura 8 horas

function configured() {
  const s = process.env.SESSION_SECRET;
  return !!(process.env.ADMIN_PASSWORD && s && s.length >= 32);
}

// A chave da sessão depende do segredo E da senha: trocar qualquer um dos dois
// derruba na hora todas as sessões abertas (útil se você desconfiar de algo).
function key() {
  if (!configured()) throw new Error("SESSION_SECRET ausente ou curta (mínimo 32 caracteres)");
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update("nz-session:" + process.env.ADMIN_PASSWORD).digest();
}

function sign(payload) {
  return crypto.createHmac("sha256", key()).update(payload).digest("base64url");
}

// compara duas strings sem vazar informação pelo tempo de resposta
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeToken() {
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + TTL_SECONDS * 1000, n: crypto.randomBytes(9).toString("base64url") })).toString("base64url");
  return payload + "." + sign(payload);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

function isAuthed(req) {
  try {
    if (!configured()) return false;
    const [payload, sig] = readCookie(req, COOKIE).split(".");
    if (!payload || !sig) return false;
    if (!safeEqual(sig, sign(payload))) return false;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch (_) {
    return false;
  }
}

function setSession(res, token, maxAge) {
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (_) { b = null; } }
  return b && typeof b === "object" ? b : {};
}

function isJson(req) {
  return /^application\/json\b/i.test(req.headers["content-type"] || "");
}

// Bloqueia pedidos vindos de outros sites (CSRF): o navegador sempre manda Origin
// ou Sec-Fetch-Site em requisições POST feitas por fetch().
function sameOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  const origin = req.headers.origin;
  if (origin) {
    try { return new URL(origin).host.toLowerCase() === host; } catch (_) { return false; }
  }
  return req.headers["sec-fetch-site"] === "same-origin";
}

// Checagens que todo POST do painel precisa passar. Devolve true se já respondeu com erro.
function rejectPost(req, res) {
  if (req.method !== "POST") { send(res, 405, { ok: false, error: "Método não permitido." }); return true; }
  if (!isJson(req)) { send(res, 415, { ok: false, error: "Requisição inválida." }); return true; }
  if (!sameOrigin(req)) { send(res, 403, { ok: false, error: "Origem não permitida." }); return true; }
  return false;
}

function clientIp(req) {
  return String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
}

/* ---- código de 6 dígitos (TOTP, RFC 6238), compatível com Google Authenticator, Authy etc. ---- */
function base32(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(s || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0;
  const out = [];
  for (const c of clean) {
    val = ((val << 5) | A.indexOf(c)) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(k, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", k).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const num = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(num % 1000000).padStart(6, "0");
}

function totpEnabled() {
  return !!process.env.ADMIN_TOTP_SECRET;
}

let lastStep = 0; // impede reusar o mesmo código duas vezes (por instância do servidor)
function checkTotp(code) {
  if (!totpEnabled()) return true;
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  const k = base32(process.env.ADMIN_TOTP_SECRET);
  const now = Math.floor(Date.now() / 30000);
  for (let w = -1; w <= 1; w++) {
    const step = now + w;
    if (step > lastStep && safeEqual(hotp(k, step), code)) { lastStep = step; return true; }
  }
  return false;
}

module.exports = {
  TTL_SECONDS, configured, makeToken, isAuthed, setSession, send, readBody, isJson,
  safeEqual, sameOrigin, rejectPost, clientIp, totpEnabled, checkTotp, hotp, base32,
};
