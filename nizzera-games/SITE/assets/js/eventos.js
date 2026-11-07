/* ===== página /eventos/ (gerada por scripts/gerar_paginas.py a partir de data/eventos.json) =====
   Filtro por jogo e, pela data de hoje, marca "Ao vivo" e esconde o que já terminou
   (a página é gerada 1 vez por dia; isto deixa ela certa mesmo se ficar aberta). */
(function(){
  var list=document.getElementById("evlist"),empty=document.getElementById("evempty"),tools=document.querySelector(".ev-tools");
  if(!list)return;
  var d=new Date(),hoje=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2),filtro="";
  var evs=[].slice.call(list.querySelectorAll(".ev"));
  evs.forEach(function(ev){
    var ini=ev.getAttribute("data-start"),fim=ev.getAttribute("data-end"),live=ev.querySelector(".ev-live");
    if(fim<hoje)ev.setAttribute("data-past","");
    if(live)live.hidden=!(ini<=hoje&&hoje<=fim);
  });
  function apply(){
    var shown=0;
    evs.forEach(function(ev){var ok=!ev.hasAttribute("data-past")&&(!filtro||ev.getAttribute("data-f")===filtro);ev.hidden=!ok;if(ok)shown++});
    [].forEach.call(list.querySelectorAll(".ev-sec"),function(sec){sec.hidden=!sec.querySelector(".ev:not([hidden])")});
    if(empty)empty.hidden=shown>0;
  }
  if(tools)tools.addEventListener("click",function(e){
    var b=e.target.closest("[data-evf]");if(!b)return;
    filtro=b.getAttribute("data-evf");
    [].forEach.call(tools.querySelectorAll("[data-evf]"),function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});
    apply();
  });
  apply();
})();
