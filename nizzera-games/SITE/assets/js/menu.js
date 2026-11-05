/* ===== menu lateral: edite os itens aqui ===== */
(function(){
  var html=document.documentElement, list=document.getElementById("slist"), mbtn=document.getElementById("mbtn");
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
    search:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
    theme:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/>',
    monitor:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    ticket:'<path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4z"/><path d="M14 6v12"/>',
    chev:'<path d="M15 6l-6 6 6 6"/>',
    chat:'<path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H10l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z"/><path d="M8 10h8M8 13h5"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'
  };
  var CATICON={"Todas":"news","Lançamentos":"rocket","Nintendo":"pad","Serviços":"cloud","Steam":"monitor","Game Pass":"ticket","Esports":"trophy","Eventos":"cal"};
  function svg(n){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+IC[n]+'</svg>'}
  function fmtN(n){return n>999?"999+":n}
  function count(c){return c==="Todas"?NEWS.length:NEWS.filter(function(n){return n.cat===c}).length}
  function buildSide(){
  var h='<div class="grp">Navegar</div>'
   +'<a class="item" href="#topo" data-go="topo" title="Início">'+svg("home")+'<span class="lbl">Início</span></a>';
  ["Todas","Eventos"].forEach(function(c){
    if(CATS.indexOf(c)<0)return;
    var lab=esc(c==="Todas"?"Todas as notícias":c);
    h+='<button class="item" type="button" data-cat="'+esc(c)+'" title="'+lab+'">'+svg(CATICON[c]||"tag")+'<span class="lbl">'+lab+'</span><span class="n">'+fmtN(count(c))+'</span></button>';
  });
  h+='<a class="item" href="#feedback" data-go="feedback" title="Comentários e feedback">'+svg("chat")+'<span class="lbl">Comentários</span></a>';
  h+='<div class="grp">Ofertas</div>'
   +'<button class="item" type="button" data-act="deals" title="Ofertas da semana na Steam">'+svg("tag")+'<span class="lbl">Ofertas da semana</span></button>';
  h+='<div class="grp">Ferramentas</div>'
   +'<button class="item" type="button" data-act="contact" title="Fale com a gente">'+svg("mail")+'<span class="lbl">Fale com a gente</span></button>'
   +'<button class="item" type="button" data-act="search" title="Buscar notícia">'+svg("search")+'<span class="lbl">Buscar</span></button>'
   +'<button class="item" type="button" data-act="theme" title="Alternar tema claro/escuro">'+svg("theme")+'<span class="lbl">Tema claro/escuro</span></button>'
   +'<div style="flex:1"></div><div class="foot"><button class="item collapse" type="button" data-act="collapse" title="Recolher ou expandir menu">'+svg("chev")+'<span class="lbl">Recolher menu</span></button></div>';
  list.innerHTML=h;
  items=[].slice.call(list.querySelectorAll(".item"));
  if(typeof update==="function")update();
  }
  var items=[], brand=document.querySelector(".side .brand");
  var smooth=!matchMedia("(prefers-reduced-motion:reduce)").matches;
  function go(id){var el=document.getElementById(id);if(el)el.scrollIntoView({behavior:smooth?"smooth":"auto",block:"start"})}
  function setCat(c){var b=[].filter.call(document.querySelectorAll("#chips .chip"),function(x){return x.textContent===c})[0];if(b)b.click()}
  function section(){var s="topo";["noticias","feedback"].forEach(function(id){var el=document.getElementById(id);if(el&&el.getBoundingClientRect().top<=100)s=id});return s}
  function update(){
    var s=section();
    items.forEach(function(it){
      var on=false;
      if(it.dataset.go)on=it.dataset.go===s;
      else if(it.dataset.cat)on=(s==="noticias"&&cat===it.dataset.cat);
      if(on)it.setAttribute("aria-current","true");else it.removeAttribute("aria-current");
    });
  }
  function openMenu(o){
    html.classList.toggle("menu-open",o);mbtn.setAttribute("aria-expanded",o);
    if(o){var f=list.querySelector(".item");if(f)f.focus()}else if(matchMedia("(max-width:899px)").matches)mbtn.focus();
  }
  function closeMenu(){if(html.classList.contains("menu-open"))openMenu(false)}

  document.getElementById("side").addEventListener("click",function(e){
    var it=e.target.closest(".item,.brand");if(!it)return;
    if(it.dataset.go){e.preventDefault();go(it.dataset.go);closeMenu()}
    else if(it.dataset.cat){setCat(it.dataset.cat);go("noticias");closeMenu()}
    else if(it.dataset.act==="deals"){closeMenu();openDeals()}
    else if(it.dataset.act==="search"){closeMenu();go("noticias");setTimeout(function(){var q=document.querySelector(".search");if(q)q.focus({preventScroll:true})},smooth?450:0)}
    else if(it.dataset.act==="contact"){closeMenu();if(window.nzChat)window.nzChat.open()}
    else if(it.dataset.act==="theme"){document.getElementById("theme").click()}
    else if(it.dataset.act==="collapse"){var c=html.classList.toggle("nav-collapsed");try{localStorage.setItem("nz-nav",c?"1":"0")}catch(_){}}
  });
  mbtn.onclick=function(){openMenu(true)};
  document.getElementById("sclose").onclick=function(){openMenu(false)};
  document.getElementById("scrim").onclick=function(){openMenu(false)};
  addEventListener("keydown",function(e){if(e.key==="Escape")closeMenu()});
  addEventListener("resize",function(){if(!matchMedia("(max-width:899px)").matches)html.classList.remove("menu-open")});
  try{if(localStorage.getItem("nz-nav")==="1")html.classList.add("nav-collapsed")}catch(_){}

  var tick=false;
  addEventListener("scroll",function(){if(!tick){tick=true;requestAnimationFrame(function(){tick=false;update()})}},{passive:true});
  var _render=render;render=function(){_render();update()};
  window.buildSide=buildSide;window.updateSide=update;buildSide();
})();
