/* ===== Nizzera Games: menu lateral, tema e partes comuns a todas as páginas ===== */
(function(){
  var html=document.documentElement, list=document.getElementById("slist"), mbtn=document.getElementById("mbtn");
  if(!list)return;
  var IC={
    home:'<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
    star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    news:'<path d="M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2zM18 8h2v10a2 2 0 01-2 2M8 8h7M8 12h7M8 16h4"/>',
    rocket:'<path d="M12 3c3 2 5 5 5 9l-2 3H9l-2-3c0-4 2-7 5-9zM9 15l-2 4 3-1M15 15l2 4-3-1"/><circle cx="12" cy="10" r="1.5"/>',
    pad:'<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8 10v4M6 12h4M15.5 11h.01M18 13h.01"/>',
    cloud:'<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4.5 4.5 0 0117 18z"/>',
    trophy:'<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 20h8M10 17h4"/>',
    cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    tag:'<path d="M4 4h8l8 8-8 8-8-8z"/><circle cx="8.5" cy="8.5" r="1"/>',
    gift:'<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9C10 5 7 5 7 7s3 2 5 2c2 0 5 0 5-2s-3-2-5 2"/>',
    search:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
    theme:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/>',
    monitor:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    ticket:'<path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4z"/><path d="M14 6v12"/>',
    chev:'<path d="M15 6l-6 6 6 6"/>',
    chat:'<path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H10l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z"/><path d="M8 10h8M8 13h5"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    top:'<path d="M4 20h16"/><rect x="5" y="11" width="3.5" height="7" rx="1"/><rect x="10.25" y="5" width="3.5" height="13" rx="1"/><rect x="15.5" y="8" width="3.5" height="10" rx="1"/>',
    tiers:'<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="13" height="4" rx="1"/><rect x="3" y="16" width="8" height="4" rx="1"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'
  };
  var CATICON={"Todas":"news","Lançamentos":"rocket","PlayStation":"pad","Xbox":"pad","Nintendo":"pad","Serviços":"cloud","Steam":"monitor","Game Pass":"ticket","Esports":"trophy","Eventos":"cal"};
  var PATH=location.pathname, HOME=(PATH==="/"||PATH==="/index.html");
  var hasNews=HOME&&typeof NEWS!=="undefined";
  function svg(n){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+IC[n]+'</svg>'}
  function fmtN(n){return n>999?"999+":n}
  function count(c){return c==="Todas"?NEWS.length:NEWS.filter(function(n){return n.cat===c}).length}
  function link(href,ico,label,attrs,n){
    return '<a class="item" href="'+href+'"'+(attrs||"")+' title="'+esc(label)+'">'+svg(ico)+'<span class="lbl">'+esc(label)+'</span>'+(n!=null?'<span class="n">'+fmtN(n)+'</span>':'')+'</a>';
  }
  function btn(act,ico,label){return '<button class="item" type="button" data-act="'+act+'" title="'+esc(label)+'">'+svg(ico)+'<span class="lbl">'+esc(label)+'</span></button>'}

  /* ---- itens do menu: edite aqui ---- */
  function buildSide(){
    var h='<div class="grp">Navegar</div>'+link("/","home","Início",' data-page="topo"');
    h+=link("/#noticias","news","Todas as notícias",' data-cat="Todas"',hasNews?count("Todas"):null);
    h+=link("/eventos/","cal","Eventos",' data-page="/eventos/"');
    h+=link("/reviews/","star","Reviews",' data-page="/review"');
    h+=link("/ofertas/","tag","Ofertas da semana",' data-page="/ofertas/"');
    h+=link("/gratis/","gift","Jogos grátis",' data-page="/gratis/"');
    h+=link("/maisjogados/","top","Mais jogados",' data-page="/maisjogados/"');
    h+=link("/tierlist/","tiers","Tier List",' data-page="/tierlist/"');
    h+=link("/comentarios/","chat","Comentários",' data-page="/comentarios/"');
    h+=link("/sobre/","info","Sobre",' data-page="/sobre/"');
    h+='<div class="grp">Ferramentas</div>'+btn("contact","mail","Fale com a gente")+btn("search","search","Buscar")+btn("theme","theme","Tema claro/escuro")
     +'<div style="flex:1"></div><div class="foot"><button class="item collapse" type="button" data-act="collapse" title="Recolher ou expandir menu">'+svg("chev")+'<span class="lbl">Recolher menu</span></button></div>';
    list.innerHTML=h;
    items=[].slice.call(list.querySelectorAll(".item"));
    update();
  }
  var items=[];
  var smooth=!matchMedia("(prefers-reduced-motion:reduce)").matches;
  function go(id){var el=document.getElementById(id);if(el)el.scrollIntoView({behavior:smooth?"smooth":"auto",block:"start"})}
  function setCat(c){var b=[].filter.call(document.querySelectorAll("#chips .chip"),function(x){return x.textContent===c})[0];if(b)b.click()}
  function section(){var el=document.getElementById("noticias");return el&&el.getBoundingClientRect().top<=100?"noticias":"topo"}
  /* destaca no menu a página (ou, no início, a parte da página) em que você está */
  function update(){
    var s=HOME?section():"";
    items.forEach(function(it){
      var d=it.dataset,on=false;
      if(d.page)on=HOME?(d.page==="topo"&&s==="topo"):PATH.indexOf(d.page)===0;
      else if(d.cat)on=HOME&&s==="noticias"&&typeof cat!=="undefined"&&cat===d.cat;
      if(on)it.setAttribute("aria-current","page");else it.removeAttribute("aria-current");
    });
  }
  /* ---- celular: barra fixa embaixo, ao alcance do polegar (o CSS só mostra até 899px) ---- */
  var tabMenu=null;
  (function buildTabbar(){
    var tabs=[["/","home","Início","home"],["/reviews/","star","Reviews","/review"],["/ofertas/","tag","Ofertas","/ofertas/"],["/gratis/","gift","Grátis","/gratis/"]];
    var bar=document.createElement("nav");bar.className="tabbar";bar.id="tabbar";bar.setAttribute("aria-label","Atalhos");
    bar.innerHTML=tabs.map(function(t){
      var on=t[3]==="home"?HOME:PATH.indexOf(t[3])===0;
      return '<a class="tab" href="'+t[0]+'"'+(on?' aria-current="page"':'')+'><span class="ti">'+svg(t[1])+'</span><span class="tl">'+t[2]+'</span></a>';
    }).join("")+'<button class="tab menu" type="button" aria-controls="side" aria-expanded="false" aria-label="Abrir menu"><span class="ti">'+svg("menu")+'</span><span class="tl">Menu</span></button>';
    document.body.appendChild(bar);html.classList.add("has-tabbar");
    tabMenu=bar.querySelector(".menu");
    tabMenu.onclick=function(){openMenu(!html.classList.contains("menu-open"))};
    /* no início, tocar em "Início" volta suavemente ao topo em vez de recarregar */
    bar.querySelector(".tab").addEventListener("click",function(e){if(HOME&&!e.ctrlKey&&!e.metaKey){e.preventDefault();closeMenu();go("topo")}});
  })();
  function openMenu(o){
    html.classList.toggle("menu-open",o);mbtn.setAttribute("aria-expanded",o);
    if(tabMenu){tabMenu.setAttribute("aria-expanded",o);tabMenu.setAttribute("aria-label",o?"Fechar menu":"Abrir menu")}
    if(o){var f=list.querySelector(".item");if(f)f.focus({preventScroll:true})}
    else if(matchMedia("(max-width:899px)").matches)(tabMenu||mbtn).focus({preventScroll:true});
  }
  function closeMenu(){if(html.classList.contains("menu-open"))openMenu(false)}

  /* ---- tema claro/escuro (lembrado entre as páginas) ---- */
  var darkMq=matchMedia("(prefers-color-scheme:dark)");
  function curTheme(){return html.getAttribute("data-theme")||(darkMq.matches?"dark":"light")}
  /* interruptor do topo: ligado = modo escuro */
  function syncTheme(){
    var tb=document.getElementById("theme");if(!tb)return;
    var dark=curTheme()==="dark";tb.setAttribute("aria-checked",dark?"true":"false");
    tb.title=dark?"Mudar para o modo claro":"Mudar para o modo escuro";
  }
  function toggleTheme(){
    var nx=curTheme()==="dark"?"light":"dark";
    html.setAttribute("data-theme",nx);try{localStorage.setItem("nz-theme",nx)}catch(_){}
    syncTheme();
    var b=document.getElementById("theme");
    if(b){b.classList.remove("hit");void b.offsetWidth;b.classList.add("hit");clearTimeout(b._hit);b._hit=setTimeout(function(){b.classList.remove("hit")},360)} /* controle vibra */
    if(navigator.vibrate&&matchMedia("(pointer:coarse)").matches)try{navigator.vibrate(30)}catch(_){} /* no celular, vibra de verdade */
  }
  var tb=document.getElementById("theme");if(tb)tb.onclick=toggleTheme;
  syncTheme();
  /* sem escolha salva, segue o tema do aparelho quando ele muda */
  if(darkMq.addEventListener)darkMq.addEventListener("change",syncTheme);

  function focusSearch(){go("noticias");setTimeout(function(){var q=document.querySelector(".search");if(q)q.focus({preventScroll:true})},smooth?450:0)}
  document.getElementById("side").addEventListener("click",function(e){
    var it=e.target.closest(".item,.brand");if(!it)return;
    var d=it.dataset;
    if(e.button||e.ctrlKey||e.metaKey||e.shiftKey)return; /* deixa abrir em nova aba */
    /* no início, os atalhos da lista funcionam sem recarregar a página */
    if(HOME&&d.page==="topo"){e.preventDefault();go("topo");closeMenu()}
    else if(HOME&&d.cat&&hasNews){e.preventDefault();setCat(d.cat);go("noticias");closeMenu()}
    else if(d.act==="search"){closeMenu();if(HOME)focusSearch();else location.href="/#buscar"}
    else if(d.act==="contact"){closeMenu();if(window.nzChat)window.nzChat.open()}
    else if(d.act==="theme"){toggleTheme()}
    else if(d.act==="collapse"){var c=html.classList.toggle("nav-collapsed");try{localStorage.setItem("nz-nav",c?"1":"0")}catch(_){}}
  });
  mbtn.onclick=function(){openMenu(true)};
  document.getElementById("sclose").onclick=function(){openMenu(false)};
  document.getElementById("scrim").onclick=function(){openMenu(false)};
  addEventListener("keydown",function(e){if(e.key==="Escape")closeMenu()});
  addEventListener("resize",function(){if(!matchMedia("(max-width:899px)").matches)html.classList.remove("menu-open")});

  /* deslizar o dedo para a esquerda fecha o menu lateral */
  (function(){
    var side=document.getElementById("side"),x0=null,y0=0;
    side.addEventListener("touchstart",function(e){var t=e.touches[0];x0=t.clientX;y0=t.clientY},{passive:true});
    side.addEventListener("touchmove",function(e){
      if(x0===null)return;var t=e.touches[0],dx=t.clientX-x0,dy=t.clientY-y0;
      if(dx<-60&&Math.abs(dx)>Math.abs(dy)*1.5){x0=null;closeMenu()}
    },{passive:true});
    side.addEventListener("touchend",function(){x0=null},{passive:true});
  })();

  /* html.sdown enquanto rola para baixo: o CSS esconde o botão de mensagem para não cobrir o texto */
  var tick=false,lastY=scrollY;
  function scrollDir(){
    var y=scrollY,d=y-lastY;
    if(Math.abs(d)>10){html.classList.toggle("sdown",d>0&&y>160);lastY=y}
  }
  addEventListener("scroll",function(){if(!tick){tick=true;requestAnimationFrame(function(){tick=false;update();scrollDir()})}},{passive:true});
  if(typeof render==="function"){var _render=render;render=function(){_render();update()}}
  window.buildSide=buildSide;window.updateSide=update;buildSide();
  if(HOME&&location.hash==="#buscar")focusSearch();
})();
