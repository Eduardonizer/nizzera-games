/* ===== comentários + caixa de mensagem (envia e-mail) ===== */
(function(){
  var MAIL="nizzeragames@gmail.com";
  function $(i){return document.getElementById(i)}
  function jreq(method,path,body){
    return fetch(path,{method:method,credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){j.status=r.status;return j})});
  }

  /* ---------- comentários ---------- */
  var list=$("cmlist"),form=$("fb-form"),fmsg=$("fb-msg"),fname=$("fb-name"),fst=$("fb-status"),fsend=$("fb-send"),fcount=$("fb-count");
  function say(el,t,cls){el.textContent=t;el.className="fb-status"+(cls?" "+cls:"")}
  function dt(ts){var d=new Date(ts);return isNaN(d)?"":d.toLocaleDateString("pt-BR",{day:"numeric",month:"short",year:"numeric"})}
  function item(c){return '<article class="fb-item"><header><b>'+esc(c.name||"Anônimo")+'</b><time>'+esc(dt(c.ts))+'</time></header><p>'+esc(c.msg)+'</p></article>'}
  function unavailable(){list.innerHTML='<p class="soon">Os comentários não estão disponíveis agora.</p>'}
  function load(){
    jreq("GET","/api/comments").then(function(j){
      if(j.ok&&Array.isArray(j.items)){
        list.innerHTML=j.items.length?j.items.map(item).join(""):'<p class="soon">Ainda não há comentários. Seja a primeira pessoa a escrever!</p>';
      }else unavailable();
    },unavailable);
  }
  fmsg.addEventListener("input",function(){fcount.textContent=fmsg.value.length+"/500"});
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var msg=fmsg.value.trim();
    if(msg.length<3){say(fst,"Escreva pelo menos algumas palavras.","err");fmsg.focus();return}
    fsend.disabled=true;say(fst,"Enviando…","");
    jreq("POST","/api/comments",{name:fname.value.trim(),msg:msg,hp:$("fb-hp").value}).then(function(r){
      fsend.disabled=false;
      if(r.ok){fmsg.value="";fcount.textContent="0/500";say(fst,"Obrigado! Seu comentário foi publicado.","ok");load()}
      else if(r.status===429)say(fst,"Muitos comentários em pouco tempo. Tente de novo em alguns minutos.","err");
      else say(fst,r.error||"Não consegui enviar agora. Tente mais tarde.","err");
    },function(){fsend.disabled=false;say(fst,"Não consegui falar com o servidor. Confira sua internet.","err")});
  });
  load();

  /* ---------- botão flutuante: caixa de mensagem ---------- */
  var fab=$("chat-fab"),panel=$("chat"),cb=$("chat-b"),cf=$("chat-f"),cmsg=$("chat-msg"),cname=$("chat-name"),cmail=$("chat-mail"),csend=$("chat-send"),greeted=false;
  function bub(t,cls){var d=document.createElement("div");d.className="bub "+cls;d.textContent=t;cb.appendChild(d);cb.scrollTop=cb.scrollHeight;return d}
  function openChat(){
    panel.hidden=false;fab.setAttribute("aria-expanded","true");fab.setAttribute("aria-label","Fechar caixa de mensagem");
    if(!greeted){greeted=true;bub("Olá! Tem alguma dúvida, sugestão ou pedido de pauta? Escreva aqui embaixo: a mensagem chega direto no e-mail do Nizzera Games.","bot")}
    setTimeout(function(){cmsg.focus()},30);
  }
  function closeChat(back){panel.hidden=true;fab.setAttribute("aria-expanded","false");fab.setAttribute("aria-label","Abrir caixa de mensagem");if(back)fab.focus()}
  fab.addEventListener("click",function(){if(panel.hidden)openChat();else closeChat(false)});
  $("chat-x").addEventListener("click",function(){closeChat(true)});
  addEventListener("keydown",function(e){if(e.key==="Escape"&&!panel.hidden&&!document.querySelector("dialog[open]"))closeChat(true)});
  cmsg.addEventListener("keydown",function(e){if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();if(cf.requestSubmit)cf.requestSubmit();else csend.click()}});
  cf.addEventListener("submit",function(e){
    e.preventDefault();
    var msg=cmsg.value.trim(),mail=cmail.value.trim(),name=cname.value.trim();
    if(msg.length<5){bub("Escreva um pouquinho mais para eu entender a sua mensagem.","bot");cmsg.focus();return}
    if(mail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)){bub("Esse e-mail parece incompleto. Confira ou deixe o campo vazio.","bot");cmail.focus();return}
    bub(msg,"me");csend.disabled=true;var wait=bub("Enviando…","bot");
    function fail(t){csend.disabled=false;wait.remove();bub(t+" Se preferir, escreva direto para "+MAIL+".","err")}
    jreq("POST","/api/contact",{name:name,email:mail,msg:msg,hp:$("chat-hp").value}).then(function(r){
      if(r.ok){
        csend.disabled=false;wait.remove();cmsg.value="";
        bub(mail?"Mensagem enviada! Vamos responder no e-mail que você informou.":"Mensagem enviada! Como você não deixou e-mail, não vamos conseguir responder, mas ela será lida com atenção.","bot");
      }
      else if(r.status===429){csend.disabled=false;wait.remove();bub("Você enviou várias mensagens seguidas. Tente de novo em alguns minutos.","err")}
      else fail(r.error||"Não consegui enviar agora.");
    },function(){fail("Não consegui falar com o servidor.")});
  });
  window.nzChat={open:openChat,close:closeChat};
})();
