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
