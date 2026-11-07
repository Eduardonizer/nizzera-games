/* ===== página de uma notícia (gerada por scripts/gerar_paginas.py) ===== */
fillArt();
/* compartilhar (notícias e reviews): WhatsApp, X, Facebook, Telegram, menu do celular e copiar link.
   A imagem e o título que aparecem na rede social vêm das tags og:image/og:title da página
   (geradas pelo gerar_paginas.py): o app lê o link e monta a prévia sozinho. */
(function(){
  var box=document.querySelector(".post .share");if(!box)return;
  var url=location.origin+location.pathname,h=document.querySelector(".post h1");
  var title=h?h.textContent.trim():document.title,msg=title+" | Nizzera Games";
  var E=encodeURIComponent;
  var IC={
    wa:'<path d="M12 3a9 9 0 00-7.8 13.5L3 21l4.6-1.2A9 9 0 1012 3z"/><path d="M8.5 8.5c0 4 3 7 7 7l1.3-1.6-2.2-1.1-1 1c-1.4-.6-2.4-1.6-3-3l1-1-1.1-2.2z"/>',
    x:'<path d="M4 4l16 16M20 4L4 20"/>',
    fb:'<path d="M14 8h3V4h-3a4 4 0 00-4 4v2H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
    tg:'<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>',
    ln:'<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    sh:'<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/>'
  };
  function ic(n){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+IC[n]+'</svg>'}
  function net(cls,href,icon,label){return '<a class="shr-b '+cls+'" href="'+href+'" target="_blank" rel="noopener" aria-label="Compartilhar no '+label+'">'+ic(icon)+'<span>'+label+'</span></a>'}
  var bar=document.createElement("div");bar.className="shr";bar.setAttribute("role","group");bar.setAttribute("aria-label","Compartilhar");
  var native=!!navigator.share;
  bar.innerHTML='<span class="shr-t">Compartilhar</span>'
    +(native?'<button type="button" class="shr-b shr-main" data-shr="native">'+ic("sh")+'<span>Compartilhar</span></button>':'')
    +net("wa","https://wa.me/?text="+E(msg+"\n"+url),"wa","WhatsApp")
    +net("x","https://twitter.com/intent/tweet?text="+E(msg)+"&url="+E(url),"x","X")
    +net("fb","https://www.facebook.com/sharer/sharer.php?u="+E(url),"fb","Facebook")
    +net("tg","https://t.me/share/url?url="+E(url)+"&text="+E(msg),"tg","Telegram")
    +'<button type="button" class="shr-b" data-shr="copy">'+ic("ln")+'<span>Copiar link</span></button>';
  box.parentNode.insertBefore(bar,box.nextSibling);
  bar.addEventListener("click",function(e){
    var b=e.target.closest("[data-shr]");if(!b)return;
    if(b.dataset.shr==="native"){navigator.share({title:title,text:msg,url:url}).catch(function(){});return}
    var lbl=b.querySelector("span"),done=function(){lbl.textContent="Link copiado!";setTimeout(function(){lbl.textContent="Copiar link"},2000)};
    if(navigator.clipboard)navigator.clipboard.writeText(url).then(done,function(){prompt("Copie o link:",url)});
    else prompt("Copie o link:",url);
  });
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
