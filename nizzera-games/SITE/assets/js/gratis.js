/* ===== página /gratis/: jogos grátis da semana (dados em data/gratis.json, atualizados pelo robô) =====
   "Grátis agora" e "Em breve" são decididos aqui pelas datas, então a página acerta a troca
   da Epic (toda quinta) mesmo antes de o robô rodar de novo. */
var GRATIS=null, gEl=document.getElementById("gratis"), gmeta=document.getElementById("gmeta");
function gInitials(n){var w=String(n||"").replace(/[^\p{L}\p{N} ]/gu,"").split(/\s+/).filter(Boolean);return (w.slice(0,2).map(function(x){return x[0]}).join("")||"?").toUpperCase()}
function gImgHtml(d,steam){
  var l=[],id=+d.id||0,ph=gInitials(d.name);
  if(typeof d.img==="string"&&/^https:\/\/\S+$/.test(d.img))l.push(d.img);
  if(steam&&id)l.push(
    "https://cdn.akamai.steamstatic.com/steam/apps/"+id+"/header.jpg",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/"+id+"/header.jpg",
    "https://cdn.akamai.steamstatic.com/steam/apps/"+id+"/capsule_616x353.jpg");
  if(!l.length)return '<div class="dnoimg" aria-hidden="true">'+esc(ph)+'</div>';
  return '<img src="'+esc(l[0])+'" data-next="'+esc(l.slice(1).join(" "))+'" data-ph="'+esc(ph)+'" alt="" loading="lazy" referrerpolicy="no-referrer">';
}
/* se uma imagem não existe, tenta a próxima; no fim, mostra um quadrado colorido com as iniciais */
gEl.addEventListener("error",function(e){
  var im=e.target;if(!im||im.tagName!=="IMG")return;
  var nx=(im.getAttribute("data-next")||"").split(" ").filter(Boolean);
  if(nx.length){im.setAttribute("data-next",nx.slice(1).join(" "));im.src=nx[0];return}
  var ph=document.createElement("div");ph.className="dnoimg";ph.setAttribute("aria-hidden","true");ph.textContent=im.getAttribute("data-ph")||"?";im.replaceWith(ph);
},true);
function gQuando(iso){
  var d=new Date(iso);if(isNaN(d))return "";
  return d.toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"}).replace(/\./g,"")+", "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function gCard(url,img,name,tag,orig,right){
  return '<a class="deal" href="'+esc(safeUrl(url))+'" target="_blank" rel="noopener noreferrer">'+img+'<div class="dx"><b>'+esc(name||"")+'</b><div class="dp"><span class="dd">'+esc(tag)+'</span>'+(orig?'<s>'+esc(orig)+'</s>':'')+(right?'<strong>'+esc(right)+'</strong>':'')+'</div></div></a>';
}
function gSec(titulo,sub,cards,vazio){
  return '<h2 class="sec gsec">'+esc(titulo)+'</h2>'+(sub?'<p class="meta gsub">'+esc(sub)+'</p>':'')+
    '<div class="deals">'+(cards.length?cards.join(""):'<p class="soon">'+esc(vazio)+'</p>')+'</div>';
}
function renderGratis(){
  if(!GRATIS){gEl.innerHTML='<div class="deals"><p class="soon">Os jogos grátis ainda não foram carregados.</p></div>';gmeta.textContent="";return}
  var agora=Date.now(),epic=Array.isArray(GRATIS.epic)?GRATIS.epic:[],steam=Array.isArray(GRATIS.steam)?GRATIS.steam:[];
  var ja=[],logo=[];
  epic.forEach(function(d){
    var ini=Date.parse(d.start),fim=Date.parse(d.end);if(isNaN(ini)||isNaN(fim)||fim<=agora)return;
    var img=gImgHtml(d,false);
    if(ini<=agora)ja.push(gCard(d.url,img,d.name,"GRÁTIS",d.orig,"até "+gQuando(d.end)));
    else logo.push(gCard(d.url,img,d.name,"EM BREVE",d.orig,"a partir de "+gQuando(d.start)));
  });
  var fds=[],resg=[];
  steam.forEach(function(d){
    var id=+d.id||0;if(!id)return;
    var url="https://store.steampowered.com/app/"+id+"/",img=gImgHtml(d,true);
    if(d.kind==="weekend")fds.push(gCard(url,img,d.name,"JOGUE GRÁTIS","",d.discount?"ou -"+(+d.discount)+"% por "+(d.price||""):""));
    else resg.push(gCard(url,img,d.name,"GRÁTIS",d.orig,"para sempre"));
  });
  var h=gSec("Epic Games Store: grátis agora","Resgate dentro do prazo e o jogo fica na sua conta para sempre.",ja,"Nenhum jogo grátis na Epic neste momento.");
  if(logo.length)h+=gSec("Epic Games Store: próximos","Os jogos que entram de graça na próxima troca.",logo,"");
  h+=gSec("Steam: fim de semana grátis","Dá para jogar de graça por tempo limitado; depois, só comprando.",fds,"Nenhum fim de semana grátis na Steam agora.");
  if(resg.length)h+=gSec("Steam: grátis para resgatar","Jogos e conteúdos com 100% de desconto: resgate e fica na biblioteca.",resg,"");
  gEl.innerHTML=h;
  gmeta.textContent=GRATIS.updated?"Atualizado em "+fmt(String(GRATIS.updated).slice(0,10)).replace(/\.$/,"")+". Prazos e preços podem mudar; confira na loja.":"";
}
try{fetch("/data/gratis.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():null}).then(function(d){if(d&&typeof d==="object"){GRATIS=d;renderGratis()}else renderGratis()}).catch(function(){renderGratis()})}catch(_){renderGratis()}
