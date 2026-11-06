// api/poll.mjs — votações do Nizzera Games (ex.: quem leva o GOTY)
//   GET  /api/poll?id=goty-2026                   -> { pct: {zelda: 62, gta6: 38} | null, voted: "zelda" | null }
//   POST /api/poll  { id: "goty-2026", option }   -> registra o voto e devolve o mesmo formato
//
// Só devolve porcentagens (nunca o número de votos). Cada visitante (hash do IP, sem guardar o IP)
// vota uma vez por votação. Guardado no Upstash Redis: hash "nz:poll:<id>" (campo = opção).
// Para criar outra votação: acrescente em POLLS abaixo e monte o quadro no index.html (data-poll).
import { redis, redisReady, visitor, tooMany, readBody, sameOrigin, logEvent } from "./_redis.mjs";

const POLLS = {
  "goty-2026": ["zelda", "gta6"],
};
const MARK_TTL = 400 * 24 * 3600; // a marca de "já votou" dura mais que a votação

// porcentagens inteiras que sempre somam 100 (maiores restos ficam com a sobra)
function percent(opts, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const raw = counts.map((c) => (c * 100) / total);
  const out = raw.map(Math.floor);
  let falta = 100 - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta > 0) { out[i]++; falta--; } });
  return Object.fromEntries(opts.map((o, i) => [o, out[i]]));
}

async function state(id, mark) {
  const opts = POLLS[id];
  const [vals, voted] = await redis([["HMGET", "nz:poll:" + id, ...opts], ["GET", mark]]);
  const counts = opts.map((_, i) => Math.max(0, Number(vals && vals[i]) || 0));
  return { ok: true, pct: percent(opts, counts), voted: opts.includes(voted) ? voted : null };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!redisReady()) return res.status(503).json({ ok: false, error: "A votação ainda não foi configurada no servidor." });
  if (req.method === "POST" && !sameOrigin(req)) return res.status(403).json({ ok: false, error: "Origem não permitida." });
  try {
    const b = req.method === "POST" ? readBody(req) : {};
    const id = String((req.method === "POST" ? b.id : req.query && req.query.id) || "");
    if (!Object.prototype.hasOwnProperty.call(POLLS, id)) return res.status(404).json({ ok: false, error: "Votação não encontrada." });
    const mark = "nz:pv:" + id + ":" + visitor(req);

    if (req.method === "GET") return res.status(200).json(await state(id, mark));

    if (req.method === "POST") {
      const option = String(b.option || "");
      if (!POLLS[id].includes(option)) return res.status(400).json({ ok: false, error: "Opção inválida." });
      if (await tooMany(req, "pv", 10, 600)) {
        return res.status(429).json({ ok: false, error: "Muitas tentativas. Tente de novo em alguns minutos." });
      }
      const [set] = await redis([["SET", mark, option, "EX", MARK_TTL, "NX"]]);
      if (set === "OK") { await redis([["HINCRBY", "nz:poll:" + id, option, 1]]); await logEvent({ t: "vote", poll: id, opt: option }); }
      return res.status(200).json(await state(id, mark));
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Método não permitido." });
  } catch (e) {
    console.error("poll:", e && e.message);
    return res.status(500).json({ ok: false, error: "Erro no servidor. Tente de novo em instantes." });
  }
}
