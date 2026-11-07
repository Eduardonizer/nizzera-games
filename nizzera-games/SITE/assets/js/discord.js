/* ===== /comunidade/: "X membros · Y online" do servidor do Discord =====
   Os números vêm de /api/discord (que guarda a resposta do Discord por 10 minutos).
   Se a chamada falhar, o contador continua escondido e a página segue normal. */
(function(){
  var box=document.getElementById("dccount"),t=document.getElementById("dccount-t");
  if(!box||!t||!window.fetch)return;
  function n(v){return Number(v).toLocaleString("pt-BR")}
  fetch("/api/discord",{credentials:"omit"}).then(function(r){return r.json()}).then(function(j){
    if(!j||!j.ok||!(j.members>0))return;
    t.textContent=n(j.members)+(j.members===1?" membro":" membros")+" · "+n(j.online)+" online";
    box.hidden=false;
  }).catch(function(){});
})();
