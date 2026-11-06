const { isAuthed, send, totpEnabled } = require("./_lib");

module.exports = (req, res) => {
  if (req.method !== "GET") return send(res, 405, { ok: false });
  const ok = isAuthed(req);
  const out = { ok, totp: totpEnabled() };
  // só para o admin logado: o que já está configurado na Vercel (nunca mostra os valores)
  if (ok) {
    const env = process.env;
    out.services = {
      email: !!env.RESEND_API_KEY,
      emailTo: env.CONTACT_TO || "nizzeragames@gmail.com",
      comments: !!((env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) || (env.KV_REST_API_URL && env.KV_REST_API_TOKEN)),
      publish: !!(env.GITHUB_REPO && env.GITHUB_TOKEN),
      gemini: !!env.GEMINI_API_KEY,
      totp: totpEnabled(),
    };
  }
  send(res, 200, out);
};
