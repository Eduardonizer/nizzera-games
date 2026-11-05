/* ===== Nizzera Games: funções comuns ao site, às páginas de notícia e ao admin ===== */

/* Vercel Web Analytics: fila de eventos (o script /_vercel/insights/script.js é carregado no HTML) */
window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};

/* ---- dados (o JSON fica em <script id="nz-data"> no index.html) ---- */
var DKEY="nz-data-v1", BASE=null, DATA=null;
function clone(o){return JSON.parse(JSON.stringify(o))}
function readBase(root){var e=(root||document).getElementById("nz-data");return e?JSON.parse(e.textContent):null}
function baseSig(){var t=JSON.stringify(BASE),h=5381;for(var i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return String(h)}
/* o rascunho do admin (localStorage) só vale se há alterações não publicadas,
   ou se o site publicado não mudou desde que ele foi salvo */
function loadData(){try{var r=localStorage.getItem(DKEY);if(r){
  if(localStorage.getItem("nz-unpub")==="1"||localStorage.getItem("nz-base-sig")===baseSig()){var d=JSON.parse(r);if(d&&Array.isArray(d.news)&&Array.isArray(d.cats)&&d.site)return d}
  else localStorage.removeItem(DKEY)}}catch(_){}return clone(BASE)}

/* ---- texto e links ---- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fmt(d){if(!d)return "";var x=new Date(d+"T12:00:00");return isNaN(x)?"":x.toLocaleDateString("pt-BR",{day:"numeric",month:"short"})}
function safeUrl(u){return /^https?:\/\//i.test(u||"")?u:"#"}
function bodyHtml(t){return String(t||"").split(/\n\s*\n/).map(function(p){return p.trim()}).filter(Boolean).map(function(p){return "<p>"+esc(p).replace(/\n/g,"<br>")+"</p>"}).join("")}
/* mesmo algoritmo de scripts/gerar_paginas.py: mantenha os dois iguais */
function slugify(t){
  var s=String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  if(s.length>60){s=s.slice(0,60);var k=s.lastIndexOf("-");if(k>30)s=s.slice(0,k)}
  return s.replace(/-+$/,"")||"noticia";
}
function newsSlug(n){return /^[a-z0-9-]{1,90}$/.test(n.slug||"")?n.slug:(+n.id||0)+"-"+slugify(n.title)}
function newsUrl(n){return "/noticia/"+newsSlug(n)+"/"}

var PAL = [["#ff5c7a","#ffd23f"],["#2433f0","#7be0ff"],["#12b886","#0e1033"],["#9b5cff","#ffd23f"],["#ff8a3d","#2433f0"],["#0e1033","#ff5c7a"]];

/* ===== util: arte pixelada gerada por semente ===== */
function rng(s){return function(){s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
function art(id){
  if(SCENES[id])return SCENES[id]();
  var r=rng(id*977+13), p=PAL[id%PAL.length], N=9, c=18, svg="";
  var bg=p[0], fg=p[1];
  svg+='<rect width="100%" height="100%" fill="'+bg+'"/>';
  for(var k=0;k<14;k++){ // estrelas
    svg+='<rect x="'+(r()*160|0)*6+'" y="'+(r()*90|0)*6+'" width="6" height="6" fill="'+fg+'" opacity=".25"/>';
  }
  var cells="", ox=(960-N*c*2)/2, oy=(540-N*c*2)/2;
  for(var y=0;y<N;y++)for(var x=0;x<(N+1)/2|0;x++){
    if(r()>.45){
      [x,N-1-x].forEach(function(xx){cells+='<rect x="'+(ox+xx*c*2)+'" y="'+(oy+y*c*2)+'" width="'+c*2+'" height="'+c*2+'" fill="'+fg+'"/>'});
    }
  }
  return '<svg viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustração pixelada">'+svg+cells+'</svg>';
}

/* ===== Imagens das notícias ===== */
/* Cada notícia pode ter uma foto própria: preencha  img:"imagens/arquivo.jpg"  (e alt:"descrição").
   Se img estiver vazio ou não carregar, aparece a ilustração em pixel art abaixo. */
var K=12;
function R(x,y,w,h,c,o){return '<rect x="'+x*K+'" y="'+y*K+'" width="'+w*K+'" height="'+h*K+'" fill="'+c+'"'+(o?' opacity="'+o+'"':'')+'/>'}
function C(cx,cy,r,c){var s="";for(var y=-r;y<=r;y++){var w=Math.floor(Math.sqrt(r*r-y*y)+.5);s+=R(cx-w,cy+y,w*2+1,1,c)}return s}
function E(cx,cy,rx,ry,c){var s="";for(var y=-ry;y<=ry;y++){var w=Math.floor(rx*Math.sqrt(1-y*y/(ry*ry))+.5);s+=R(cx-w,cy+y,w*2+1,1,c)}return s}
var FONT={"1":"010110010010111","5":"111100111001111","H":"101101111101101","2":"111001111100111"};
function PT(str,x,y,c,s){var o="";for(var i=0;i<str.length;i++){var g=FONT[str[i]];for(var k=0;k<15;k++)if(g[k]==="1")o+=R(x+i*4*s+(k%3)*s,y+Math.floor(k/3)*s,s,s,c)}return o}
function sv(inner,label){return '<svg viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" role="img" aria-label="'+label+'">'+inner+'</svg>'}
function stars(seed,col,n){var r=rng(seed),o="";for(var i=0;i<n;i++)o+=R(r()*78|0,r()*26|0,1,1,col,.5+r()*.4);return o}
function plus(x,y,c){return R(x,y-1,1,3,c)+R(x-1,y,3,1,c)}
function note(x,y,c){return R(x,y,1,4,c)+R(x-2,y+3,2,2,c)+R(x+1,y,2,1,c)}
function palm(bx,lean,h,top){var o="",tx=bx,i;for(i=0;i<=h;i++){tx=bx+Math.round(lean*(i/h)*3);o+=R(tx,top+h-i,2,1,"#0e1033")}
  var cx=tx+1,cy=top,F=[[-1,.5,.14],[-1,.1,.16],[1,.5,.14],[1,.1,.16],[-1,.9,.1],[1,.9,.1]];
  F.forEach(function(f){for(var t=0;t<8;t++)o+=R(cx+f[0]*t,cy-Math.round(f[1]*t)+Math.floor(t*t*f[2]),1,2,"#0e1033")});return o}

var SCENES={
1:function(){ // GTA 6: pôr do sol, palmeiras e carro
  var o="",B=[["#2a0a4a",0,6],["#5b1a7a",6,6],["#b0307a",12,5],["#ff5c7a",17,4],["#ff8a3d",21,3],["#ffd23f",24,3]];
  B.forEach(function(b){o+=R(0,b[1],80,b[2],b[0])});
  o+=C(40,24,11,"#fff4b0")+R(29,19,23,1,"#ff5c7a")+R(29,21,23,1,"#ff8a3d")+R(29,23,23,1,"#ff8a3d")+R(29,25,23,1,"#ffd23f");
  [[8,4,6],[13,3,9],[17,4,5],[22,3,11],[26,5,7],[54,4,8],[59,3,12],[63,5,6],[68,4,10],[72,3,5]].forEach(function(b){o+=R(b[0],27-b[2],b[1],b[2],"#1a0838")});
  o+=R(0,27,80,18,"#1a0838")+R(35,29,10,1,"#ff5c7a")+R(37,31,6,1,"#ff8a3d")+R(38,33,4,1,"#ffd23f");
  o+=R(0,34,80,11,"#2b1250")+R(0,34,80,1,"#ff5c7a");
  for(var x=2;x<80;x+=10)o+=R(x,40,5,1,"#ffd23f");
  o+=palm(10,1,12,22)+palm(68,-1,12,22);
  o+=R(30,37,22,4,"#00e5c3")+R(35,34,11,3,"#00e5c3")+R(36,35,4,2,"#0e1033")+R(41,35,4,2,"#0e1033")+R(51,38,1,1,"#fff4b0")+R(30,38,1,1,"#ff5c7a")
    +C(36,41,2,"#0e1033")+R(36,41,1,1,"#c9ccf5")+C(46,41,2,"#0e1033")+R(46,41,1,1,"#c9ccf5");
  return sv(o,"Ilustração pixelada de um carro ao pôr do sol entre palmeiras")},
2:function(){ // Xbox Cloud Gaming: nuvem, controle e limite de horas
  var o=R(0,0,80,45,"#0e5a1e")+R(0,26,80,19,"#0b4a18"),r=rng(7),i;
  for(i=0;i<22;i++)o+=R(r()*78|0,r()*44|0,1,1,"#7be0a0",.35);
  o+=C(28,19,5,"#f2f0ff")+C(37,14,8,"#f2f0ff")+C(47,18,6,"#f2f0ff")+R(23,19,30,5,"#f2f0ff")+R(23,22,30,2,"#c9ccf5");
  o+=C(66,12,5,"#ffd23f")+C(66,12,3,"#0e1033")+R(66,10,1,3,"#ffd23f")+R(66,12,3,1,"#ffd23f");
  o+=E(40,31,13,6,"#1b1f5e")+C(29,34,4,"#1b1f5e")+C(51,34,4,"#1b1f5e")+R(35,25,10,1,"#1b1f5e");
  o+=C(33,30,2,"#55597f")+R(36,33,3,1,"#f2f0ff")+R(37,32,1,3,"#f2f0ff")+R(39,29,2,2,"#12b886")
    +R(46,27,2,2,"#ffd23f")+R(44,29,2,2,"#2433f0")+R(48,29,2,2,"#ff5c7a")+R(46,31,2,2,"#12b886")+C(43,34,2,"#55597f");
  o+=R(16,40,48,3,"#082f10")+R(16,40,32,3,"#ffd23f")+R(48,40,1,3,"#fff4b0");
  return sv(o,"Ilustração pixelada de uma nuvem, um controle e uma barra de horas")},
3:function(){ // Worlds: troféu sobre o skyline de Nova York
  var o=R(0,0,80,10,"#0b0d2b")+R(0,10,80,10,"#141a6e")+R(0,20,80,25,"#2433f0")+stars(3,"#f2f0ff",30),i,r=rng(21);
  for(i=0;i<9;i++){var w=Math.floor(11-i*1.1);if(w>0)o+=R(40-w,i,w*2,1,"#fff4b0",.12)}
  [[3,5,14],[9,4,10],[14,6,26],[15,4,6],[16,2,4],[17,1,4],[22,5,12],[28,4,8],[52,4,9],[57,6,16],[64,4,11],[69,5,18],[75,4,8]].forEach(function(b){
    var h=b[2],yy=45-h;o+=R(b[0],yy,b[1],h,"#070920");
    for(var wy=yy+2;wy<43;wy+=3)for(var wx=b[0]+1;wx<b[0]+b[1]-1;wx+=2)if(r()>.5)o+=R(wx,wy,1,1,"#ffd23f")});
  for(i=0;i<7;i++)o+=R(10+i*10,22,2,2,"#ff5c7a");
  for(i=0;i<22;i++)o+=R(r()*74+3|0,r()*30+2|0,1,1,["#ff5c7a","#ffd23f","#7be0ff","#ffffff"][i%4]);
  var w;[[10,18],[16,16],[17,14],[18,12],[19,10],[20,8],[21,6]].forEach(function(p){o+=R(40-p[1]/2,p[0]+1,p[1],1,"#ffd23f")});
  o+=R(31,11,18,5,"#ffd23f")+R(33,11,2,6,"#fff4b0")+R(38,22,4,6,"#e0a800")+R(33,28,14,2,"#ffd23f")+R(31,30,18,3,"#e0a800");
  o+=R(27,11,5,1,"#ffd23f")+R(27,11,1,7,"#ffd23f")+R(27,17,5,1,"#ffd23f")+R(49,11,5,1,"#ffd23f")+R(53,11,1,7,"#ffd23f")+R(49,17,5,1,"#ffd23f");
  o+=plus(40,14,"#fff4b0");
  return sv(o,"Ilustração pixelada de um troféu diante do skyline de uma cidade à noite")},
4:function(){ // Ocarina: instrumento, notas e colinas
  var o=R(0,0,80,12,"#0e1033")+R(0,12,80,12,"#103a5c")+R(0,24,80,21,"#0f6b6b")+stars(11,"#f2f0ff",26),x,i;
  for(x=0;x<80;x++){var y=35+Math.round(3*Math.sin(x/7));o+=R(x,y,1,45-y,"#0b3d2e")}
  for(x=0;x<80;x++){var y2=39+Math.round(2*Math.sin(x/5+2));o+=R(x,y2,1,45-y2,"#082a20")}
  for(i=0;i<6;i++)o+=R(49+i,18-i,3,2,"#2d6bff");
  o+=R(55,10,3,2,"#1a3fb0")+E(40,24,14,9,"#1f4fd1")+E(39,23,12,7,"#2d6bff")+E(35,20,5,2,"#9be8ff");
  [[33,25],[38,27],[43,27],[47,25],[36,22],[41,22]].forEach(function(h){o+=R(h[0],h[1],2,2,"#0e1033")});
  o+=plus(20,12,"#fff4b0")+plus(62,26,"#fff4b0")+plus(67,9,"#ffd23f")+plus(13,28,"#ffd23f")
    +note(16,16,"#ffd23f")+note(64,16,"#ffd23f")+note(24,30,"#fff4b0")+note(58,30,"#fff4b0");
  return sv(o,"Ilustração pixelada de uma ocarina azul com notas musicais")},
5:function(){ // Pikmin 4 no Switch 2: console com broto na tela
  var o=R(0,0,80,32,"#7be0ff")+R(0,6,80,26,"#bff3ff")+R(0,32,80,13,"#12b886")+R(0,38,80,7,"#0e8f6a"),i;
  o+=C(68,8,3,"#ffd23f")+R(8,4,8,2,"#fff")+R(10,3,4,1,"#fff")+R(52,6,10,2,"#fff")+R(54,5,5,1,"#fff");
  o+=R(22,10,6,16,"#2cc7ff")+R(52,10,6,16,"#ff5c7a")+R(27,8,26,19,"#0e1033")+R(28,9,24,17,"#7be0ff")+R(28,19,24,7,"#12b886")
    +R(39,14,1,6,"#0e8f6a")+R(36,13,3,2,"#0e8f6a")+R(40,12,3,2,"#0e8f6a")+R(31,22,2,1,"#0e8f6a")+R(46,21,2,1,"#0e8f6a");
  o+=C(25,14,1,"#0e1033")+R(24,20,3,1,"#0e1033")+R(55,13,2,1,"#fff")+R(55,17,2,1,"#fff")+R(54,20,1,3,"#0e1033")+R(23,26,34,1,"#0e8f6a",.6);
  [[8,38,"#ff5c7a"],[16,41,"#ffd23f"],[64,39,"#ff5c7a"],[72,42,"#ffd23f"],[30,41,"#9b5cff"],[50,41,"#fff"]].forEach(function(f){o+=R(f[0],f[1]+1,1,3,"#0b6b4e")+plus(f[0],f[1],f[2])+R(f[0],f[1],1,1,"#ffd23f")});
  for(i=3;i<80;i+=7)o+=R(i,31,1,2,"#0e8f6a")+R(i+1,30,1,3,"#0e8f6a");
  o+=C(62,31,5,"#ff5c7a")+PT("2",60,29,"#fff",1);
  return sv(o,"Ilustração pixelada de um console portátil com um broto na tela, em um gramado")},
6:function(){ // Hoxxes Halloween: caverna, abóbora e morcegos
  var o=R(0,0,80,45,"#3a1470")+R(0,22,80,23,"#2a0a4a"),i;
  o+=C(62,14,6,"#fff4b0")+R(60,12,2,2,"#e8d98a")+R(64,16,2,1,"#e8d98a");
  [[2,8,9],[11,6,6],[19,8,10],[46,6,7],[52,8,9],[62,6,6],[70,9,8]].forEach(function(s){for(i=0;i<s[2];i++){var w=s[1]-Math.floor(i*s[1]/s[2]);if(w>0)o+=R(s[0]+Math.floor((s[1]-w)/2),i,w,1,"#0b0420")}});
  [[14,9],[22,8],[57,11],[48,7]].forEach(function(b){var x=b[0],y=b[1];o+=R(x,y,2,1,"#0b0420")+R(x+5,y,2,1,"#0b0420")+R(x,y+1,7,1,"#0b0420")+R(x+3,y,1,2,"#0b0420")+R(x+2,y+2,3,1,"#0b0420")});
  o+=R(0,40,80,5,"#0b0420")+R(8,38,3,2,"#ffd23f")+R(13,39,2,1,"#ffd23f")+R(66,38,3,2,"#ffd23f");
  o+=R(18,34,2,6,"#12b886")+R(20,36,2,4,"#7be0ff")+R(16,37,2,3,"#7be0ff")+R(60,34,2,6,"#12b886")+R(62,36,2,4,"#7be0ff");
  o+=E(40,29,13,10,"#d9631a")+E(34,29,4,9,"#e87420")+E(46,29,4,9,"#e87420")+E(40,29,5,10,"#ff9a52")+R(39,17,3,3,"#0e8f6a")+R(42,17,2,1,"#0e8f6a");
  o+=R(35,24,2,1,"#ffd23f")+R(34,25,4,1,"#ffd23f")+R(33,26,6,1,"#ffd23f")+R(44,24,2,1,"#ffd23f")+R(43,25,4,1,"#ffd23f")+R(42,26,6,1,"#ffd23f")
    +R(40,28,1,1,"#ffd23f")+R(39,29,3,1,"#ffd23f")+R(34,32,13,2,"#ffd23f")+R(37,32,2,1,"#e87420")+R(42,32,2,1,"#e87420")+R(39,33,2,1,"#e87420");
  return sv(o,"Ilustração pixelada de uma abóbora de Halloween numa caverna com morcegos")}
};

function pic(n){
  var u=n.img;
  if(u&&/^(https?:|data:image\/|\/|[^:]*$)/i.test(u))return '<img src="'+esc(u)+'" alt="'+esc(n.alt||n.title)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fid="'+(+n.id||0)+'"'+(/^(top|bottom)$/.test(n.pos)?' style="object-position:center '+n.pos+'"':'')+'>';
  return art(n.id);
}
/* imagem quebrada vira arte em pixel (sem onerror inline, que a CSP bloqueia) */
function imgFail(el){var p=el.parentNode;if(p)p.innerHTML=art(+el.getAttribute("data-fid")||0)}
document.addEventListener("error",function(e){var t=e.target;if(t&&t.tagName==="IMG"&&t.hasAttribute("data-fid"))imgFail(t)},true);
/* preenche os espaços <div class="art" data-art="ID"> das páginas estáticas */
function fillArt(root){
  [].forEach.call((root||document).querySelectorAll("[data-art]"),function(el){el.innerHTML=art(+el.getAttribute("data-art")||0);el.removeAttribute("data-art")});
  [].forEach.call((root||document).querySelectorAll("img[data-fid]"),function(im){if(im.complete&&!im.naturalWidth)imgFail(im)});
}
