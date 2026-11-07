/* ===== galeria de GTA VI (/gta6/): filtros e foto em tela cheia =====
   As fotos vêm do servidor da Rockstar: a miniatura em 480px e a foto grande (1920px)
   só quando a pessoa abre. Teclado: ← → para navegar, Esc para fechar. No celular, deslize. */
(function(){
  var lb=document.getElementById("g6lb");if(!lb)return;
  var img=lb.querySelector("img"),cap=lb.querySelector(".g6-cap"),orig=lb.querySelector(".g6-orig"),tools=document.querySelector(".g6-tools");
  var all=[].slice.call(document.querySelectorAll("main .g6-t")),list=all,cur=-1,back=null;
  var big=function(a){return innerWidth<=760?a.getAttribute("data-full").replace(/imwidth=\d+/,"imwidth=1280"):a.getAttribute("data-full")};
  function visible(){return all.filter(function(a){return !a.closest("[hidden]")})}
  function preload(k){var a=list[(k+list.length)%list.length];if(a){var p=new Image();p.referrerPolicy="no-referrer";p.src=big(a)}}
  function show(k){
    list=visible();if(!list.length)return;
    cur=(k+list.length)%list.length;var a=list[cur];
    img.src=big(a);img.alt=a.querySelector("img").alt;
    cap.textContent=(cur+1)+" / "+list.length+" · "+a.getAttribute("data-tag");
    orig.href=a.getAttribute("data-orig");
    try{history.replaceState(null,"","#"+a.id)}catch(_){}
    preload(cur+1);preload(cur-1);
  }
  function open(a){
    back=a;list=visible();lb.hidden=false;document.documentElement.classList.add("g6-open");
    show(list.indexOf(a));lb.querySelector(".g6-x").focus();
  }
  function close(){
    lb.hidden=true;document.documentElement.classList.remove("g6-open");img.removeAttribute("src");
    try{history.replaceState(null,"",location.pathname+location.search)}catch(_){}
    if(back)back.focus();
  }
  document.addEventListener("click",function(e){
    var a=e.target.closest("main .g6-t");
    if(a&&!(e.ctrlKey||e.metaKey||e.shiftKey||e.button)){e.preventDefault();open(a);return}
    var b=e.target.closest("[data-lb]");
    if(b){var k=b.getAttribute("data-lb");if(k==="close")close();else show(cur+(k==="next"?1:-1));return}
    if(e.target===lb||e.target.tagName==="FIGURE")close();
  });
  addEventListener("keydown",function(e){
    if(lb.hidden)return;
    if(e.key==="Escape")close();else if(e.key==="ArrowRight")show(cur+1);else if(e.key==="ArrowLeft")show(cur-1);
  });
  var x0=null;
  lb.addEventListener("touchstart",function(e){x0=e.touches[0].clientX},{passive:true});
  lb.addEventListener("touchend",function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>50)show(cur+(dx<0?1:-1))});
  /* filtros: Todas / Do jogo / Ultimate Edition / Vintage Vice City */
  if(tools)tools.addEventListener("click",function(e){
    var b=e.target.closest("[data-g6f]");if(!b)return;var f=b.getAttribute("data-g6f");
    [].forEach.call(tools.querySelectorAll("[data-g6f]"),function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});
    [].forEach.call(document.querySelectorAll(".g6-group"),function(s){s.hidden=!!f&&s.getAttribute("data-g6")!==f});
  });
  /* link direto para uma foto: /gta6/#foto-12 */
  var m=/^#foto-\d+$/.test(location.hash)&&document.getElementById(location.hash.slice(1));
  if(m)open(m);
})();
