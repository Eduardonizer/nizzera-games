// api/discord.mjs — números do servidor do Discord para a página /comunidade/
//   GET /api/discord  -> { ok, members, online }
//
// Usa a API pública do convite (não precisa de token nem de widget ligado):
//   https://discord.com/api/v10/invites/<código>?with_counts=true
// A resposta fica 10 minutos no cache da CDN da Vercel (s-maxage), então o Discord é consultado
// no máximo ~6 vezes por hora, não importa quantas pessoas abram a página.
// O código do convite precisa ser o mesmo de DISCORD_INVITE em scripts/config.py.
const INVITE = "8RmMYmQgVS";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://discord.com/api/v10/invites/${INVITE}?with_counts=true`, {
      headers: { "User-Agent": "DiscordBot (https://www.nizzeragames.com.br, 1.0)" },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error("discord HTTP " + r.status);
    const d = await r.json();
    const members = Number(d.approximate_member_count) || 0;
    const online = Number(d.approximate_presence_count) || 0;
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=1800");
    res.setHeader("Vercel-CDN-Cache-Control", "max-age=600, stale-while-revalidate=1800"); // só para a CDN da Vercel
    return res.status(200).json({ ok: true, members, online });
  } catch (e) {
    console.error("discord:", e && e.message);
    // falha: cache curto, para tentar de novo logo; a página esconde o contador
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60");
    res.setHeader("Vercel-CDN-Cache-Control", "max-age=60");
    return res.status(200).json({ ok: false });
  }
}
