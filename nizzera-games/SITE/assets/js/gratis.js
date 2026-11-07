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
function gSlug(n){return String(n||"jogo").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)||"jogo"}
/* msg: o texto que vai junto do link ao compartilhar (ex.: "Flotsam está grátis na Epic até qui, 12 nov") */
function gCard(url,img,name,tag,orig,right,msg){
  var id="g-"+gSlug(name);
  return '<div class="gcard" id="'+esc(id)+'"><a class="deal" href="'+esc(safeUrl(url))+'" target="_blank" rel="noopener noreferrer">'+img+'<div class="dx"><b>'+esc(name||"")+'</b><div class="dp"><span class="dd">'+esc(tag)+'</span>'+(orig?'<s>'+esc(orig)+'</s>':'')+(right?'<strong>'+esc(right)+'</strong>':'')+'</div></div></a>'
    +'<div class="gshare"><button class="shr-b gshr" type="button" data-gshr="'+esc(id)+'" data-msg="'+esc(msg||name)+'" aria-expanded="false">'
    +'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/></svg><span>Compartilhar</span></button></div></div>';
}
/* ---- compartilhar um jogo (mesmos botões das notícias) ---- */
var G_IC={wa:'<path d="M12 3a9 9 0 00-7.8 13.5L3 21l4.6-1.2A9 9 0 1012 3z"/><path d="M8.5 8.5c0 4 3 7 7 7l1.3-1.6-2.2-1.1-1 1c-1.4-.6-2.4-1.6-3-3l1-1-1.1-2.2z"/>',
  x:'<path d="M4 4l16 16M20 4L4 20"/>',fb:'<path d="M14 8h3V4h-3a4 4 0 00-4 4v2H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
  tg:'<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>',
  ln:'<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'};
function gIc(n){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+G_IC[n]+'</svg>'}
function gShareBar(id,msg){
  var url=location.origin+location.pathname+"#"+id,E=encodeURIComponent,full=msg+" | Nizzera Games";
  function net(cls,href,ic,label){return '<a class="shr-b '+cls+'" href="'+href+'" target="_blank" rel="noopener" aria-label="Compartilhar no '+label+'">'+gIc(ic)+'<span>'+label+'</span></a>'}
  return '<div class="shr gshr-bar" role="group" aria-label="Compartilhar este jogo">'
    +net("wa","https://wa.me/?text="+E(full+"\n"+url),"wa","WhatsApp")
    +net("x","https://twitter.com/intent/tweet?text="+E(full)+"&url="+E(url),"x","X")
    +net("fb","https://www.facebook.com/sharer/sharer.php?u="+E(url),"fb","Facebook")
    +net("tg","https://t.me/share/url?url="+E(url)+"&text="+E(full),"tg","Telegram")
    +'<button type="button" class="shr-b" data-gcopy="'+esc(url)+'">'+gIc("ln")+'<span>Copiar link</span></button></div>';
}
gEl.addEventListener("click",function(e){
  var b=e.target.closest("[data-gshr]");
  if(b){
    var id=b.getAttribute("data-gshr"),msg=b.getAttribute("data-msg"),url=location.origin+location.pathname+"#"+id;
    if(navigator.share&&matchMedia("(pointer:coarse)").matches){navigator.share({title:msg,text:msg+" | Nizzera Games",url:url}).catch(function(){});return}
    var box=b.parentNode,bar=box.querySelector(".gshr-bar");
    [].forEach.call(gEl.querySelectorAll(".gshr-bar"),function(x){if(x!==bar){x.remove();var o=x.parentNode&&x.parentNode.querySelector("[data-gshr]");if(o)o.setAttribute("aria-expanded","false")}});
    if(bar){bar.remove();b.setAttribute("aria-expanded","false")}else{box.insertAdjacentHTML("beforeend",gShareBar(id,msg));b.setAttribute("aria-expanded","true")}
    return;
  }
  var c=e.target.closest("[data-gcopy]");
  if(c){
    var u=c.getAttribute("data-gcopy"),lbl=c.querySelector("span"),done=function(){lbl.textContent="Link copiado!";setTimeout(function(){lbl.textContent="Copiar link"},2000)};
    if(navigator.clipboard)navigator.clipboard.writeText(u).then(done,function(){prompt("Copie o link:",u)});else prompt("Copie o link:",u);
  }
});
/* link compartilhado (/gratis/#g-nome-do-jogo): rola até o jogo e destaca */
function gFoco(){
  var h=location.hash;if(!/^#g-[a-z0-9-]+$/.test(h))return;var el=document.getElementById(h.slice(1));if(!el)return;
  el.classList.add("gfoco");el.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth"});
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
    if(ini<=agora)ja.push(gCard(d.url,img,d.name,"GRÁTIS",d.orig,"até "+gQuando(d.end),"🎁 "+d.name+" está grátis na Epic Games Store até "+gQuando(d.end)));
    else logo.push(gCard(d.url,img,d.name,"EM BREVE",d.orig,"a partir de "+gQuando(d.start),"🎁 "+d.name+" vai ficar grátis na Epic Games Store a partir de "+gQuando(d.start)));
  });
  var fds=[],resg=[];
  steam.forEach(function(d){
    var id=+d.id||0;if(!id)return;
    var url="https://store.steampowered.com/app/"+id+"/",img=gImgHtml(d,true);
    if(d.kind==="weekend")fds.push(gCard(url,img,d.name,"JOGUE GRÁTIS","",d.discount?"ou -"+(+d.discount)+"% por "+(d.price||""):"","🎮 "+d.name+": fim de semana grátis na Steam"));
    else resg.push(gCard(url,img,d.name,"GRÁTIS",d.orig,"para sempre","🎁 "+d.name+" está grátis para resgatar na Steam"));
  });
  var h=gSec("Epic Games Store: grátis agora","Resgate dentro do prazo e o jogo fica na sua conta para sempre.",ja,"Nenhum jogo grátis na Epic neste momento.");
  if(logo.length)h+=gSec("Epic Games Store: próximos","Os jogos que entram de graça na próxima troca.",logo,"");
  h+=gSec("Steam: fim de semana grátis","Dá para jogar de graça por tempo limitado; depois, só comprando.",fds,"Nenhum fim de semana grátis na Steam agora.");
  if(resg.length)h+=gSec("Steam: grátis para resgatar","Jogos e conteúdos com 100% de desconto: resgate e fica na biblioteca.",resg,"");
  gEl.innerHTML=h;gFoco();
  gmeta.textContent=GRATIS.updated?"Atualizado em "+fmt(String(GRATIS.updated).slice(0,10)).replace(/\.$/,"")+". Prazos e preços podem mudar; confira na loja.":"";
}
try{fetch("/data/gratis.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():null}).then(function(d){if(d&&typeof d==="object"){GRATIS=d;renderGratis()}else renderGratis()}).catch(function(){renderGratis()})}catch(_){renderGratis()}
