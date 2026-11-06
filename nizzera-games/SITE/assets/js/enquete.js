/* ===== votação da página inicial (quadro com data-poll; servidor em api/poll.mjs) =====
   Mostra só porcentagens. Cada pessoa vota uma vez: depois do voto, os botões somem e o
   quadro mostra a escolha dela e como está a disputa. */
(function(){
  var box=document.querySelector("[data-poll]");if(!box||!window.fetch)return;
  var id=box.getAttribute("data-poll"),msg=box.querySelector(".poll-msg"),busy=false;
  var opts=[].slice.call(box.querySelectorAll(".poll-opt")),btns=[].slice.call(box.querySelectorAll("[data-vote]"));
  function req(method,body){
    return fetch("/api/poll"+(method==="GET"?"?id="+encodeURIComponent(id):""),{method:method,credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){j.status=r.status;return j})});
  }
  function draw(j,justVoted){
    var pct=j.pct||{},best=-1;
    opts.forEach(function(o){var v=pct[o.getAttribute("data-opt")];if(v>best)best=v});
    opts.forEach(function(o){
      var k=o.getAttribute("data-opt"),v=j.pct?(pct[k]||0):0,bar=o.querySelector(".poll-bar");
      o.querySelector(".poll-pct").textContent=j.pct?v+"%":"0%";
      bar.querySelector("i").style.width=v+"%";
      bar.setAttribute("aria-valuenow",v);bar.setAttribute("aria-valuetext",v+"% dos votos");
      o.classList.toggle("lead",!!j.pct&&v===best&&v>0);
      o.classList.toggle("mine",j.voted===k);
    });
    box.classList.toggle("done",!!j.voted);
    btns.forEach(function(b){b.hidden=!!j.voted;b.disabled=false});
    if(j.voted)msg.textContent=justVoted?"Voto registrado! Obrigado por participar.":"Você já votou. Veja como está a disputa.";
    else msg.textContent=j.pct?"Escolha o seu favorito e clique em votar.":"Ainda não há votos. Seja a primeira pessoa a votar!";
  }
  function fail(t){msg.textContent=t;btns.forEach(function(b){b.disabled=false})}
  req("GET").then(function(j){
    if(j.ok)draw(j,false);else{btns.forEach(function(b){b.hidden=true});msg.textContent="A votação não está disponível agora."}
  },function(){btns.forEach(function(b){b.hidden=true});msg.textContent="A votação não está disponível agora."});
  box.addEventListener("click",function(e){
    var b=e.target.closest("[data-vote]");if(!b||busy)return;
    busy=true;btns.forEach(function(x){x.disabled=true});msg.textContent="Registrando seu voto…";
    req("POST",{id:id,option:b.getAttribute("data-vote")}).then(function(j){
      busy=false;
      if(j.ok)draw(j,true);
      else fail(j.status===429?"Muitas tentativas. Tente de novo em alguns minutos.":(j.error||"Não consegui registrar seu voto. Tente de novo."));
    },function(){busy=false;fail("Não consegui falar com o servidor. Confira sua internet.")});
  });
})();
