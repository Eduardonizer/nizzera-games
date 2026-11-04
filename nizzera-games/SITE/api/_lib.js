// Funções de apoio do painel admin (arquivos com "_" no começo não viram endpoints na Vercel)
const crypto = require("crypto");

const COOKIE = "nz_admin";
const TTL_SECONDS = 12 * 60 * 60; // sessão dura 12 horas

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curta (mínimo 32 caracteres)");
  return s;
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

// compara duas strings sem vazar informação pelo tempo de resposta
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TTL_SECONDS * 1000 })).toString("base64url");
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
    const token = readCookie(req, COOKIE);
    const [payload, sig] = token.split(".");
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
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (_) { b = null; } }
  return b && typeof b === "object" ? b : {};
}

function isJson(req) {
  return /application\/json/i.test(req.headers["content-type"] || "");
}

module.exports = { TTL_SECONDS, makeToken, isAuthed, setSession, send, readBody, isJson, safeEqual };
