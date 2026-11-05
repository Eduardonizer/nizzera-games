/* ===== Nizzera Games: página inicial (usa as funções de core.js) ===== */
BASE=readBase(); DATA=loadData();
var NEWS=DATA.news, CATS=["Todas"].concat(DATA.cats);

/* ===== lista, filtros e paginação ===== */
var PER=12;                      /* notícias por página */
var cat="Todas", q="", page=1;
var chips=document.getElementById("chips"), cards=document.getElementById("cards");
var pager=document.getElementById("pager"), pinfo=document.getElementById("pinfo");
var s=document.createElement("input");s.className="search";s.type="search";s.placeholder="Buscar notícia";s.setAttribute("aria-label","Buscar notícia");s.maxLength=80;
function norm(t){return String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
s.oninput=function(){q=norm(s.value.trim());page=1;syncUrl(false);render()};

/* o estado da lista fica no endereço (?categoria=nintendo&busca=zelda&pagina=2):
   dá para voltar, recarregar e compartilhar a página exata */
function urlFor(pg){
  var p=[];
  if(cat!=="Todas")p.push("categoria="+encodeURIComponent(slugify(cat)));
  if(s.value.trim())p.push("busca="+encodeURIComponent(s.value.trim()));
  if(pg>1)p.push("pagina="+pg);
  return location.pathname+(p.length?"?"+p.join("&"):"");
}
function syncUrl(push){try{history[push?"pushState":"replaceState"](null,"",urlFor(page)+location.hash)}catch(_){}}
function readUrl(){
  var p=new URLSearchParams(location.search),c=p.get("categoria"),b=(p.get("busca")||"").slice(0,80);
  page=Math.max(1,Math.min(999,parseInt(p.get("pagina"),10)||1));
  cat="Todas";if(c)CATS.forEach(function(x){if(slugify(x)===c)cat=x});
  s.value=b;q=norm(b.trim());
}
function buildChips(){
  if(CATS.indexOf(cat)<0)cat="Todas";
  chips.innerHTML="";
  CATS.forEach(function(c){
    var b=document.createElement("button");b.className="chip";b.type="button";b.textContent=c;
    b.setAttribute("aria-pressed",c===cat);
    b.onclick=function(){cat=c;page=1;[].forEach.call(chips.querySelectorAll(".chip"),function(x){x.setAttribute("aria-pressed",x===b)});syncUrl(false);render()};
    chips.appendChild(b);
  });
  chips.appendChild(s);
}

function cardHtml(n,i,dup,mq){
  var inner='<div class="art">'+pic(n)+'</div><div class="tx"><span class="tag">'+esc(n.cat)+'</span><h3>'+esc(n.title)+'</h3><p>'+esc(n.sum)+'</p><span class="meta">'+fmt(n.date)+' · '+(+n.read||0)+' min de leitura</span></div>';
  /* carrossel "Em alta": só decoração (sem clique); lista: link de verdade para a página da notícia */
  if(mq)return '<div class="card'+(dup?' dup':'')+'" data-id="'+(+n.id||0)+'">'+inner+'</div>';
  return '<a class="card in" href="'+esc(newsUrl(n))+'" style="animation-delay:'+i*50+'ms" data-id="'+(+n.id||0)+'">'+inner+'</a>';
}
/* notícias mais relevantes: destaque primeiro, depois as mais recentes (com foto na frente) */
function topNews(max){
  var l=NEWS.slice().sort(function(a,b){
    return (b.featured?1:0)-(a.featured?1:0)||String(b.date||"").localeCompare(String(a.date||""))||((b.img?1:0)-(a.img?1:0));
  });
  return l.slice(0,max);
}
var carr=document.getElementById("carr");
function renderCarr(){
  var list=topNews(10);
  if(!list.length){carr.innerHTML="";carr.parentNode.hidden=true;return}
  carr.parentNode.hidden=false;
  var reps=Math.max(1,Math.ceil(8/list.length)),half=[],r;
  for(r=0;r<reps;r++)list.forEach(function(n){half.push({n:n,dup:r>0})});
  var a=half.map(function(x){return cardHtml(x.n,0,x.dup,true)}).join(""),b=half.map(function(x){return cardHtml(x.n,0,true,true)}).join("");
  carr.innerHTML='<div class="track" aria-hidden="true" style="--dur:'+half.length*8+'s">'+a+b+'</div>';
}
function filtered(){
  return NEWS.filter(function(n){return (cat==="Todas"||n.cat===cat)&&(!q||norm(n.title+" "+n.sum+" "+n.cat).indexOf(q)>-1)});
}
/* 1 … 4 5 6 … 12: sempre a primeira, a última e as vizinhas da atual */
function pageList(c,t){
  var out=[],last=0;
  for(var i=1;i<=t;i++){
    if(i===1||i===t||Math.abs(i-c)<=1||(c<=3&&i<=4)||(c>=t-2&&i>=t-3)){if(last&&i-last>1)out.push(0);out.push(i);last=i}
  }
  return out;
}
function pLink(pg,label,cls,aria,cur){
  return '<a class="pg'+(cls?" "+cls:"")+'" href="'+esc(urlFor(pg))+'#noticias" data-page="'+pg+'"'+(aria?' aria-label="'+aria+'"':"")+(cur?' aria-current="page"':"")+'>'+label+'</a>';
}
function renderPager(total,pages,start,shown){
  if(pages<2){pager.innerHTML="";pager.hidden=true}
  else{
    var h=page>1?pLink(page-1,"← Anterior","nav","Página anterior"):'<span class="pg nav" aria-disabled="true">← Anterior</span>';
    pageList(page,pages).forEach(function(p){h+=p?pLink(p,p,"","Página "+p,p===page):'<span class="pg gap" aria-hidden="true">…</span>'});
    h+=page<pages?pLink(page+1,"Próxima →","nav","Próxima página"):'<span class="pg nav" aria-disabled="true">Próxima →</span>';
    pager.innerHTML=h;pager.hidden=false;
  }
  pinfo.textContent=total?(pages>1?"Mostrando "+(start+1)+"–"+(start+shown)+" de "+total+" notícias":total+(total>1?" notícias":" notícia")):"";
}
function render(){
  var list=filtered(),pages=Math.max(1,Math.ceil(list.length/PER));
  if(page>pages)page=pages;
  cards.className="cards";
  if(!list.length){cards.innerHTML='<p class="empty">Nenhuma notícia encontrada. Tente outra categoria ou termo.</p>';renderPager(0,1,0,0);return}
  var start=(page-1)*PER,part=list.slice(start,start+PER);
  cards.innerHTML=part.map(function(n,i){return cardHtml(n,i,false,false)}).join("");
  renderPager(list.length,pages,start,part.length);
}
function goPage(p){
  page=p;syncUrl(true);render();
  var sec=document.getElementById("noticias"),h=document.getElementById("ntitle");
  sec.scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"});
  if(h)h.focus({preventScroll:true});
}
function plainClick(e){return !(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)}
pager.onclick=function(e){var a=e.target.closest("a[data-page]");if(!a||!plainClick(e))return;e.preventDefault();goPage(+a.dataset.page)};
addEventListener("popstate",function(){
  readUrl();
  [].forEach.call(chips.querySelectorAll(".chip"),function(x){x.setAttribute("aria-pressed",x.textContent===cat)});
  render();
});
/* ===== ofertas da semana (dados em data/ofertas.json, atualizados pelo robô) — abrem num painel pelo menu lateral ===== */
var DEALS=null, dealTab="steam", DNAMES={steam:"Steam"};
var dtabs=document.getElementById("dtabs"), dealsEl=document.getElementById("deals"), dmeta=document.getElementById("dmeta"), dmodal=document.getElementById("dmodal");
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
function openDeals(k){if(k)setDeal(k);if(!dmodal.open)dmodal.showModal()}
dtabs.onclick=function(e){var b=e.target.closest("button");if(b)setDeal(b.dataset.deal)};
document.getElementById("dclose").onclick=function(){dmodal.close()};
dmodal.addEventListener("click",function(e){if(e.target===dmodal)dmodal.close()});
renderDeals();
try{fetch("/data/ofertas.json",{cache:"no-cache"}).then(function(r){return r.ok?r.json():null}).then(function(d){if(d&&typeof d==="object"){DEALS=d;renderDeals()}}).catch(function(){})}catch(_){}
/* carrossel "Em alta": só anima — sem pausa e sem clique */
/* clique normal abre a leitura rápida; Ctrl/Cmd+clique abre a página da notícia em outra aba */
function cardClick(e){var b=e.target.closest(".card");if(!b||!plainClick(e))return;e.preventDefault();open(+b.dataset.id)}
cards.onclick=cardClick;

/* ===== destaque e modal ===== */
var F=null, feat=document.getElementById("feat"), fdots=document.getElementById("fdots"), HS=[], hi=0, hTimer, hHold=false;
function showSlide(i,anim){
  if(!HS.length)return;
  hi=(i+HS.length)%HS.length;F=HS[hi];
  feat.innerHTML='<div class="slide'+'"><div class="art">'+pic(F)+'</div><div class="tx"><span class="tag">'+esc(F.cat)+'</span><h2>'+esc(F.title)+'</h2><span class="meta">'+fmt(F.date)+' · '+F.read+' min de leitura</span></div></div>';
  [].forEach.call(fdots.children,function(d,k){d.setAttribute("aria-selected",k===hi)});
}
function startHero(){
  clearInterval(hTimer);
  if(HS.length<2||reduce)return;
  hTimer=setInterval(function(){if(!hHold&&!document.hidden)showSlide(hi+1)},5000);
}
function renderFeat(){
  HS=topNews(6);
  if(!HS.length){feat.hidden=true;fdots.hidden=true;feat.innerHTML="";F=null;clearInterval(hTimer);return}
  feat.hidden=false;fdots.hidden=HS.length<2;
  fdots.innerHTML=HS.map(function(n,k){return '<button type="button" role="tab" aria-label="Notícia '+(k+1)+'" data-k="'+k+'"></button>'}).join("");
  hi=0;showSlide(0);startHero();
}
fdots.onclick=function(e){var b=e.target.closest("button");if(b){showSlide(+b.dataset.k);startHero()}};
var heroSide=feat.parentNode;
heroSide.addEventListener("mouseenter",function(){hHold=true});
heroSide.addEventListener("mouseleave",function(){hHold=false});
heroSide.addEventListener("focusin",function(){hHold=true});
heroSide.addEventListener("focusout",function(){hHold=false});
feat.onclick=function(){if(F)open(F.id)};
var modal=document.getElementById("modal");
function open(id){
  var n=NEWS.filter(function(x){return x.id===id})[0];if(!n)return;
  document.getElementById("mbody").innerHTML='<div class="art">'+pic(n)+'</div><div class="tx"><span class="tag">'+esc(n.cat)+'</span><h2>'+esc(n.title)+'</h2><p class="meta">'+fmt(n.date)+' · '+n.read+' min de leitura</p>'+bodyHtml(n.body||n.sum)+((n.url||n.credit)?'<p class="meta">'+(n.url?'Fonte: <a href="'+esc(safeUrl(n.url))+'" target="_blank" rel="noopener noreferrer">'+esc(n.src||n.url)+'</a>':'')+(n.url&&n.credit?' · ':'')+(n.credit?'Imagem: '+esc(n.credit):'')+'</p>':'')+'<p class="mlink"><a href="'+esc(newsUrl(n))+'">Abrir página da notícia →</a></p></div>';
  modal.showModal();
}
document.getElementById("close").onclick=function(){modal.close()};
modal.addEventListener("click",function(e){if(e.target===modal)modal.close()});

/* ===== tema ===== */
document.getElementById("theme").onclick=function(){
  var r=document.documentElement,dark=getComputedStyle(r).getPropertyValue("--bg").trim()!=="#f2f0ff";
  r.setAttribute("data-theme",dark?"light":"dark");
};

/* ===== título digitado ===== */
var el=document.getElementById("typed"), reduce=matchMedia("(prefers-reduced-motion:reduce)").matches, typeTimer, typedNow="";
function typeTitle(txt){
  clearTimeout(typeTimer);el.setAttribute("aria-label",txt);
  if(reduce){el.textContent=txt;return}
  var k=0;(function t(){el.textContent=txt.slice(0,++k);if(k<txt.length)typeTimer=setTimeout(t,45)})();
}

/* ===== fundo de pixels que acende com o mouse ===== */
(function(){
  var cv=document.getElementById("grid"),g=cv.getContext("2d"),S=28,cols,rows,heat;
  function size(){var r=cv.getBoundingClientRect(),d=devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;g.setTransform(d,0,0,d,0,0);cols=Math.ceil(r.width/S);rows=Math.ceil(r.height/S);heat=new Float32Array(cols*rows)}
  function poke(x,y,v){var cx=x/S|0,cy=y/S|0;for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++){var X=cx+dx,Y=cy+dy;if(X>=0&&Y>=0&&X<cols&&Y<rows){var k=cols*Y+X,f=v/(1+dx*dx+dy*dy);if(f>heat[k])heat[k]=f}}}
  function pos(e){var r=cv.getBoundingClientRect(),p=e.touches?e.touches[0]:e;poke(p.clientX-r.left,p.clientY-r.top,1)}
  addEventListener("pointermove",pos);addEventListener("touchmove",pos,{passive:true});addEventListener("resize",size);size();
  if(window.ResizeObserver)new ResizeObserver(size).observe(cv);
  if(reduce)return;
  var tick=0;
  (function loop(){
    tick++; if(tick%40===0)poke(Math.random()*cv.clientWidth,Math.random()*cv.clientHeight,.6);
    g.clearRect(0,0,cv.clientWidth,cv.clientHeight);
    for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){
      var k=cols*y+x,h=heat[k];
      g.fillStyle="rgba(255,255,255,.07)";g.fillRect(x*S+12,y*S+12,3,3);
      if(h>.02){g.fillStyle="rgba(255,210,63,"+h.toFixed(2)+")";g.fillRect(x*S+3,y*S+3,S-6,S-6);heat[k]=h*.93}
    }
    requestAnimationFrame(loop);
  })();
})();

function applySite(){
  var S=DATA.site;
  document.title=S.name+" – notícias de games";
  [].forEach.call(document.querySelectorAll(".sname"),function(e){e.textContent=S.name});
  var br=document.querySelector(".side .brand");if(br)br.title=S.name;
  document.getElementById("intro").textContent=S.intro;
  document.getElementById("ftxt").textContent=S.footer;
  document.getElementById("fcredit").textContent=S.credit;
  document.querySelector("footer .by").hidden=!S.credit;
  if(typedNow!==S.tagline){typedNow=S.tagline;typeTitle(S.tagline)}
}
function refreshAll(){
  NEWS=DATA.news;CATS=["Todas"].concat(DATA.cats);
  buildChips();renderFeat();renderCarr();render();applySite();
  if(window.buildSide)window.buildSide();
}
readUrl();
refreshAll();
fillArt();
