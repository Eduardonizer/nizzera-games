/* ===== Nizzera Games: roda no <head>, antes de desenhar a página ===== */
/* aplica o tema escolhido e o menu recolhido já no primeiro quadro (sem "piscar" ao trocar de página) */
(function(){
  try{
    var r=document.documentElement,t=localStorage.getItem("nz-theme");
    if(t==="dark"||t==="light")r.setAttribute("data-theme",t);
    if(localStorage.getItem("nz-nav")==="1")r.classList.add("nav-collapsed");
  }catch(_){}
})();
