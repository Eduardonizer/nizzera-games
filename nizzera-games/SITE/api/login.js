const { TTL_SECONDS, configured, makeToken, setSession, send, readBody, safeEqual, rejectPost, clientIp, totpEnabled, checkTotp } = require("./_lib");

// Freio contra adivinhação de senha: a cada 5 erros seguidos o IP fica bloqueado,
// e o bloqueio cresce (1 min, 5 min, 15 min, 1 h). Vale por instância do servidor.
const tries = new Map();
const LOCKS = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (rejectPost(req, res)) return;
  if (!configured()) {
    return send(res, 500, { ok: false, error: "O painel ainda não foi configurado no servidor." });
  }

  const ip = clientIp(req);
  const now = Date.now();
  const t = tries.get(ip) || { n: 0, level: 0, until: 0 };
  if (now < t.until) {
    const min = Math.ceil((t.until - now) / 60000);
    return send(res, 429, { ok: false, error: `Muitas tentativas. Aguarde ${min} minuto(s).` });
  }

  const body = readBody(req);
  const pw = String(body.password || "").slice(0, 200);
  const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
  // os dois são sempre conferidos, para não revelar qual deles estava errado
  const pwOk = pw.length > 0 && safeEqual(pw, process.env.ADMIN_PASSWORD);
  const codeOk = checkTotp(code);

  if (pwOk && codeOk) {
    tries.delete(ip);
    setSession(res, makeToken(), TTL_SECONDS);
    return send(res, 200, { ok: true });
  }

  t.n += 1;
  if (t.n >= 5) {
    t.n = 0;
    t.until = now + LOCKS[Math.min(t.level, LOCKS.length - 1)];
    t.level += 1;
  }
  tries.set(ip, t);
  if (tries.size > 5000) tries.clear(); // não deixa a memória crescer sem limite
  await wait(800 + Math.floor(Math.random() * 400)); // deixa cada chute lento
  return send(res, 401, {
    ok: false,
    totp: totpEnabled(),
    error: totpEnabled() ? "Senha ou código incorreto." : "Senha incorreta.",
  });
};
