const { TTL_SECONDS, makeToken, setSession, send, readBody, isJson, safeEqual } = require("./_lib");

// proteção extra contra tentativas em sequência (vale por instância do servidor)
const tries = new Map();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "Método não permitido." });
  if (!isJson(req)) return send(res, 415, { ok: false, error: "Requisição inválida." });

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !process.env.SESSION_SECRET) {
    return send(res, 500, { ok: false, error: "O servidor ainda não tem a senha configurada na Vercel." });
  }

  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const t = tries.get(ip) || { n: 0, until: 0 };
  if (Date.now() < t.until) {
    return send(res, 429, { ok: false, error: "Muitas tentativas. Aguarde um minuto." });
  }

  const pw = String(readBody(req).password || "");
  if (pw && safeEqual(pw, expected)) {
    tries.delete(ip);
    setSession(res, makeToken(), TTL_SECONDS);
    return send(res, 200, { ok: true });
  }

  t.n += 1;
  if (t.n >= 5) { t.n = 0; t.until = Date.now() + 60000; }
  tries.set(ip, t);
  await wait(900); // deixa o chute de senha lento
  return send(res, 401, { ok: false, error: "Senha incorreta." });
};
