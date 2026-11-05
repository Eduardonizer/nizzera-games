/* ===== página /ofertas/: ofertas da semana (dados em data/ofertas.json, atualizados pelo robô) ===== */
var DEALS=null, dealTab="steam", DNAMES={steam:"Steam"};
var dtabs=document.getElementById("dtabs"), dealsEl=document.getElementById("deals"), dmeta=document.getElementById("dmeta");
function dealImgs(d){
  var l=[],id=+d.id||0;
  if(typeof d.img==="string"&&/^https:\/\/\S+$/.test(d.img))l.push(d.img);
  if(dealTab==="steam"&&id)l.push(
    "https://cdn.akamai.steamstatic.com/steam/apps/"+id+"/header.jpg",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/"+id+"/header.jpg",
    "https://cdn.cloudflare.steamstatic.com/steam/apps/"+id+"/header.jpg",
    "https://cdn.akamai.steamstatic.com/steam/apps/"+id+"/capsule_616x353.jpg");
  return l;
}
function initials(n){var w=String(n||"").replace(/[^\p{L}\p{N} ]/gu,"").split(/\s+/).filter(Boolean);return (w.slice(0,2).map(function(x){return x[0]}).join("")||"?").toUpperCase()}
function dealImgHtml(d){
  var l=dealImgs(d),ph=initials(d.name);
  if(!l.length)return '<div class="dnoimg" aria-hidden="true">'+esc(ph)+'</div>';
  return '<img src="'+esc(l[0])+'" data-next="'+esc(l.slice(1).join(" "))+'" data-ph="'+esc(ph)+'" alt="" loading="lazy" referrerpolicy="no-referrer">';
}
/* se uma imagem não existe, tenta a próxima; no fim, mostra um quadrado colorido com as iniciais */
dealsEl.addEventListener("error",function(e){
  var im=e.target;if(!im||im.tagName!=="IMG")return;
  var nx=(im.getAttribute("data-next")||"").split(" ").filter(Boolean);
  if(nx.length){im.setAttribute("data-next",nx.slice(1).join(" "));im.src=nx[0];return}
  var ph=document.createElement("div");ph.className="dnoimg";ph.setAttribute("aria-hidden","true");ph.textContent=im.getAttribute("data-ph")||"?";im.replaceWith(ph);
},true);
function renderDeals(){
  if(Object.keys(DNAMES).length<2){dtabs.style.display="none";dtabs.innerHTML=""}
  else{dtabs.style.display="";dtabs.innerHTML=Object.keys(DNAMES).map(function(k){return '<button type="button" class="chip" role="tab" data-deal="'+k+'" aria-pressed="'+(k===dealTab)+'">'+DNAMES[k]+'</button>'}).join("")}
  var l=DEALS&&Array.isArray(DEALS[dealTab])?DEALS[dealTab]:[];
  if(!l.length){
    dealsEl.innerHTML='<p class="soon">'+(DEALS?"Nenhuma oferta de "+DNAMES[dealTab]+" disponível no momento.":"As ofertas ainda não foram carregadas.")+'</p>';dmeta.textContent="";return;
  }
  dealsEl.innerHTML=l.map(function(d){
    var id=+d.id||0,url=(dealTab==="steam"&&id)?"https://store.steampowered.com/app/"+id+"/":safeUrl(d.url);
    return '<a class="deal" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+dealImgHtml(d)+'<div class="dx"><b>'+esc(d.name||"")+'</b><div class="dp"><span class="dd">-'+(+d.discount||0)+'%</span>'+(d.orig?'<s>'+esc(d.orig)+'</s>':'')+'<strong>'+esc(d.price||"")+'</strong></div></div></a>';
  }).join("");
  dmeta.textContent=DEALS.updated?"Atualizado em "+fmt(String(DEALS.updated).slice(0,10)).replace(/\.$/,"")+". Preços e descontos podem mudar; confira na loja.":"";
}
function setDeal(k){if(DNAMES[k]){dealTab=k;renderDeals()}}
dtabs.onclick=function(e){var b=e.target.closest("button");if(b)setDeal(b.dataset.deal)};
renderDeals();
try{fetch("/data/ofertas.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():null}).then(function(d){if(d&&typeof d==="object"){DEALS=d;renderDeals()}}).catch(function(){})}catch(_){}
