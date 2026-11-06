// api/_filtro.mjs — filtro de palavras ofensivas dos comentários (nome e mensagem)
//
// Comentário com palavra bloqueada é recusado no envio (nem chega a ser publicado). Comentários
// antigos que tenham uma palavra adicionada depois somem da lista pública na hora; o admin
// continua vendo, marcados como "oculto pelo filtro", e pode remover de vez.
//
// O filtro entende os disfarces mais comuns: acentos (viádo), letras repetidas (puuuta),
// números e símbolos no lugar de letras (p0rr4, @rrombado, $exo) e letras separadas (p.u.t.a, f d p).
// Ele compara palavras inteiras, então "computador" não é bloqueado por causa de "puta".
//
// COMO EDITAR A LISTA (escreva em minúsculas, sem acento; tanto faz se tiver letras repetidas):
//   "palavra"   bloqueia só a palavra exata
//   "radical*"  bloqueia tudo que começa assim ("arrombad*" pega arrombado, arrombada, arrombados...)
//               cuidado com radical curto: "viad*" pegaria "viaduto", por isso a lista usa as formas inteiras
//   "duas palavras"  bloqueia a expressão (as palavras em sequência)
//   "=palavra"  compara as letras dobradas como estão (use quando juntar "gg" em "g" criaria confusão)
// Palavra normal sendo bloqueada por engano? Coloque em PERMITIDAS, mais abaixo.
// Depois de editar, faça commit: a Vercel publica e o filtro passa a valer.

const LISTA = [
  // palavrões e ofensas
  "puta", "putas", "putinh*", "putaria*", "puteiro*", "putao",
  "caralh*", "krl", "krlh*", "crlh*", "buceta*", "bucetinh*", "boceta*", "xoxota*", "xereca*", "piroca*", "pirocud*",
  "foder*", "fuder*", "fodid*", "fudid*", "fodase", "fudeu", "foda se",
  "arrombad*", "cuzao*", "cuzona*", "cuzinh*", "cu", "cus", "toma no cu", "tomar no cu", "pau no cu",
  "fdp", "filho da puta", "filha da puta", "filhos da puta", "filhodaputa", "vsf", "vtnc", "vtmnc", "tnc", "pqp", "pqparil",
  "vai se foder", "vai se fuder", "vai te foder", "vai a merda", "vai pra merda", "va se foder",
  "desgracad*", "vagabund*", "otari*", "idiota", "idiotas", "imbecil*", "babaca*", "corno", "cornos", "cornao*", "cretin*",
  "escrot*", "retardad*", "mongoloide*", "debil mental", "lixo humano", "chupa meu pau", "chupa rola",
  "punhet*", "bronha*", "siririca*", "boquete*", "rapariga*", "vadia*",
  // preconceito (racismo, homofobia, transfobia, capacitismo, machismo)
  "viado", "viados", "viadinh*", "viadage*", "viadao", "bicha", "bichas", "bichona*", "boiola*", "baitola*",
  "traveco*", "sapatao*", "sapatona*", "aleijad*",
  "macaco imundo", "crioulo", "crioula", "crioulos", "crioulas", "preto imundo", "preto safado",
  "volta pra cozinha", "lugar de mulher e na cozinha",
  // inglês ("=" no começo: compara as letras dobradas como estão, para "nigger" não pegar "Niger" nem "night")
  "fuck*", "motherfuck*", "fuk", "fck", "bitch*", "cunt*", "whore*", "slut*", "asshole*", "dickhead*",
  "=nigga", "=niggas", "=nigger*", "=faggot*", "fag", "fags", "retard", "retards", "retarded", "kys", "kill yourself",
  // ameaças
  "vou te matar",
];

// palavras normais que lembram uma bloqueada depois da normalização: sempre liberadas
// ("fodder", de "cannon fodder", vira "foder" quando as letras dobradas são juntadas)
const PERMITIDAS = ["fodder"];
const RE_PERMITIDAS = new RegExp("(^|[^\\p{L}\\p{N}])(" + PERMITIDAS.join("|") + ")(?=$|[^\\p{L}\\p{N}])", "giu");

// p0rr4 -> porra, @ -> a, $ -> s ... (só dentro de palavras que têm letras, para não mexer em "2026")
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i" };

// separa em palavras normalizadas: sem acento, minúsculas, leet trocado.
// dobras=false junta letras repetidas (puuuuta -> puta); dobras=true só corta 3+ para 2 (niiigger -> niigger)
function palavras(s, dobras) {
  const brutas = String(s == null ? "" : s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9@$!]+/).filter(Boolean);
  const out = [];
  for (let w of brutas) {
    w = w.replace(/!+$/, "");  // "puta!!!" -> "puta"
    if (/[a-z]/.test(w)) w = w.replace(/[0-9@$!]/g, (c) => LEET[c] || c);
    w = w.replace(/[^a-z0-9]/g, "").replace(dobras ? /(.)\1{2,}/g : /(.)\1+/g, dobras ? "$1$1" : "$1");
    if (w) out.push(w);
  }
  // 3 ou mais letras soltas em sequência viram uma palavra: "p u t a" / "f.d.p" -> "puta" / "fdp"
  const juntas = [];
  for (let i = 0; i < out.length; ) {
    let j = i;
    while (j < out.length && out[j].length === 1) j++;
    if (j - i >= 3) { juntas.push(out.slice(i, j).join("")); i = j; }
    else { juntas.push(out[i]); i++; }
  }
  return juntas;
}

// a lista passa pela mesma normalização ("arrombad*" vira "arombad*")
const REGRAS = { false: { exatas: new Set(), prefixos: [], frases: [] }, true: { exatas: new Set(), prefixos: [], frases: [] } };
for (let item of LISTA) {
  const dobras = item.startsWith("=");
  if (dobras) item = item.slice(1);
  const prefixo = item.endsWith("*");
  const ps = palavras(prefixo ? item.slice(0, -1) : item, dobras);
  const r = REGRAS[dobras];
  if (!ps.length) continue;
  if (ps.length > 1) r.frases.push(" " + ps.join(" ") + " ");
  else if (prefixo) r.prefixos.push(ps[0]);
  else r.exatas.add(ps[0]);
}

function bate(ps, r) {
  for (const w of ps) {
    if (r.exatas.has(w)) return true;
    for (const p of r.prefixos) if (w.startsWith(p)) return true;
  }
  const frase = " " + ps.join(" ") + " ";
  for (const f of r.frases) if (frase.includes(f)) return true;
  return false;
}

/** true se o texto tem alguma palavra ou expressão bloqueada */
export function ofensivo(...textos) {
  return textos.some((t) => {
    t = String(t == null ? "" : t).replace(RE_PERMITIDAS, "$1 ");
    return bate(palavras(t, false), REGRAS[false]) || bate(palavras(t, true), REGRAS[true]);
  });
}
