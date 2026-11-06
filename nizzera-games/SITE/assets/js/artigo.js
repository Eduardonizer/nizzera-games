/* ===== página de uma notícia (gerada por scripts/gerar_paginas.py) ===== */
fillArt();
/* botão para copiar (ou compartilhar, no celular) o link desta notícia */
(function(){
  var box=document.querySelector(".post .share");if(!box)return;
  var b=document.createElement("button");b.type="button";
  var url=location.origin+location.pathname,title=document.querySelector(".post h1");
  var canShare=!!navigator.share&&matchMedia("(pointer:coarse)").matches;
  b.textContent=canShare?"Compartilhar":"Copiar link";
  b.onclick=function(){
    if(canShare){navigator.share({title:title?title.textContent:document.title,url:url}).catch(function(){});return}
    var done=function(){b.textContent="Link copiado!";setTimeout(function(){b.textContent="Copiar link"},2000)};
    if(navigator.clipboard)navigator.clipboard.writeText(url).then(done,function(){prompt("Copie o link:",url)});
    else prompt("Copie o link:",url);
  };
  box.appendChild(b);
})();
/* botão de curtir: aparece só quando o servidor responde (cada visitante curte uma vez; clicar de novo desfaz) */
(function(){
  var b=document.getElementById("like");if(!b||!window.fetch)return;
  var post=b.getAttribute("data-post"),what=b.getAttribute("data-what")||"esta notícia",n=document.getElementById("like-n"),t=b.querySelector(".like-t"),busy=false;
  function show(j){
    b.hidden=false;b.setAttribute("aria-pressed",j.liked?"true":"false");b.classList.toggle("on",!!j.liked);
    t.textContent=j.liked?"Curtido":"Curtir";n.textContent=j.count>0?String(j.count):"";
    b.setAttribute("aria-label",(j.liked?"Você curtiu "+what:"Curtir "+what)+(j.count>0?" ("+j.count+(j.count===1?" curtida)":" curtidas)"):""));
  }
  function req(method,body){
    return fetch("/api/likes"+(method==="GET"?"?post="+encodeURIComponent(post):""),{method:method,credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json()});
  }
  req("GET").then(function(j){if(j&&j.ok)show(j)},function(){});
  b.addEventListener("click",function(){
    if(busy)return;busy=true;
    var want=b.getAttribute("aria-pressed")!=="true",cur=+(n.textContent||0);
    show({liked:want,count:Math.max(0,cur+(want?1:-1))}); /* responde na hora; o servidor confirma em seguida */
    if(want){b.classList.remove("pop");void b.offsetWidth;b.classList.add("pop")}
    req("POST",{post:post,like:want}).then(function(j){busy=false;if(j&&j.ok)show(j);else show({liked:!want,count:cur})},function(){busy=false;show({liked:!want,count:cur})});
  });
})();
