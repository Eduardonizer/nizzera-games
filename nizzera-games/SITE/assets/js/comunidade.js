/* ===== comentários + caixa de mensagem (envia e-mail) ===== */
(function(){
  var MAIL="nizzeragames@gmail.com";
  function $(i){return document.getElementById(i)}
  function jreq(method,path,body){
    return fetch(path,{method:method,credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){j.status=r.status;return j})});
  }

  /* ---------- comentários (página /comentarios/) ---------- */
  if($("fb-form"))(function(){
  var list=$("cmlist"),form=$("fb-form"),fmsg=$("fb-msg"),fname=$("fb-name"),fst=$("fb-status"),fsend=$("fb-send"),fcount=$("fb-count"),more=$("cm-more"),stat=$("cm-stat");
  var ITEMS=[],SHOWN=10,PER=10,fresh="";
  var COLORS=["#2433f0","#ff5c7a","#12b886","#9b5cff","#ff8a3d","#0e8fb8"];
  function say(el,t,cls){el.textContent=t;el.className="fb-status"+(cls?" "+cls:"")}
  function full(ts){var d=new Date(ts);return isNaN(d)?"":d.toLocaleString("pt-BR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}
  /* "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", depois a data */
  function ago(ts){
    var s=(Date.now()-ts)/1000;if(!(s>=0))s=0;
    if(s<60)return "agora";if(s<3600)return "há "+Math.floor(s/60)+" min";if(s<86400)return "há "+Math.floor(s/3600)+" h";
    var d=Math.floor(s/86400);if(d===1)return "ontem";if(d<7)return "há "+d+" dias";
    var x=new Date(ts);return x.toLocaleDateString("pt-BR",{day:"numeric",month:"short",year:x.getFullYear()===new Date().getFullYear()?undefined:"numeric"});
  }
  function initials(n){var w=String(n||"").trim().split(/\s+/).filter(Boolean);return w.length?(w[0][0]+(w.length>1?w[w.length-1][0]:"")).toUpperCase():"?"}
  function color(n){var h=0,s=String(n||"anon");for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return COLORS[Math.abs(h)%COLORS.length]}
  function item(c){
    var name=c.name||"Anônimo";
    return '<article class="cm-item'+(c.id===fresh?' new':'')+'"><span class="cm-av" style="background:'+color(c.name)+'" aria-hidden="true">'+esc(initials(c.name))+'</span>'
      +'<div class="cm-body"><header><b>'+esc(name)+'</b><time datetime="'+esc(new Date(c.ts).toISOString())+'" title="'+esc(full(c.ts))+'">'+esc(ago(c.ts))+'</time></header><p>'+esc(c.msg)+'</p></div></article>';
  }
  function draw(){
    list.setAttribute("aria-busy","false");
    stat.textContent=ITEMS.length?(ITEMS.length===1?"1 comentário":ITEMS.length+" comentários"):"";
    if(!ITEMS.length){list.innerHTML='<div class="cm-empty"><b>Ainda não há comentários.</b><span>Seja a primeira pessoa a escrever!</span></div>';more.hidden=true;return}
    list.innerHTML=ITEMS.slice(0,SHOWN).map(item).join("");
    more.hidden=ITEMS.length<=SHOWN;
    more.textContent="Ver mais comentários ("+(ITEMS.length-SHOWN)+")";
  }
  function unavailable(){list.setAttribute("aria-busy","false");list.innerHTML='<div class="cm-empty"><b>Os comentários não estão disponíveis agora.</b><span>Tente de novo em alguns minutos.</span></div>'}
  function load(){
    return jreq("GET","/api/comments").then(function(j){
      if(j.ok&&Array.isArray(j.items)){ITEMS=j.items;draw()}else unavailable();
    },unavailable);
  }
  more.addEventListener("click",function(){SHOWN+=PER;draw()});
  fmsg.addEventListener("input",function(){fcount.textContent=fmsg.value.length+"/500";fcount.classList.toggle("warn",fmsg.value.length>450)});
  fmsg.addEventListener("keydown",function(e){if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();if(form.requestSubmit)form.requestSubmit();else fsend.click()}});
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var msg=fmsg.value.trim();
    if(msg.length<3){say(fst,"Escreva pelo menos algumas palavras.","err");fmsg.focus();return}
    fsend.disabled=true;say(fst,"Enviando…","");
    jreq("POST","/api/comments",{name:fname.value.trim(),msg:msg,hp:$("fb-hp").value}).then(function(r){
      fsend.disabled=false;
      if(r.ok){
        fmsg.value="";fcount.textContent="0/500";say(fst,"Obrigado! Seu comentário foi publicado.","ok");fresh=r.id||"";
        load().then(function(){var n=list.querySelector(".cm-item.new");if(n&&innerWidth<900)n.scrollIntoView({behavior:"smooth",block:"center"})});
      }
      else if(r.status===429)say(fst,"Muitos comentários em pouco tempo. Tente de novo em alguns minutos.","err");
      else say(fst,r.error||"Não consegui enviar agora. Tente mais tarde.","err");
    },function(){fsend.disabled=false;say(fst,"Não consegui falar com o servidor. Confira sua internet.","err")});
  });
  document.addEventListener("click",function(e){if(e.target.closest("[data-open-chat]")&&window.nzChat)window.nzChat.open()});
  load();
  })();

  /* ---------- botão flutuante: caixa de mensagem (todas as páginas) ---------- */
  if($("chat-fab"))(function(){
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
})();
