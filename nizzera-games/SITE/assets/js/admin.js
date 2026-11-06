/* ===== área admin (página /admin/, não há link para ela no site) ===== */
(function(){
  var adm=document.getElementById("admin");
  var UKEY="nz-unpub",KKEY="nz-known",PKEY="nz-pub",FILE="index.html";
  var st={tab:"home",sel:null,draft:null,isNew:false,dirty:false,q:"",cats:[]},tt,authOk=false,needTotp=false,SRC="";
  var IC={
    home:'<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
    news:'<path d="M5 4h11a2 2 0 012 2v14H7a2 2 0 01-2-2zM18 8h2v10a2 2 0 01-2 2M8 8h7M8 12h7M8 16h4"/>',
    star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    chat:'<path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H10l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z"/><path d="M8 10h8M8 13h5"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    upload:'<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
    bell:'<path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0"/>',
    heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    vote:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    out:'<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
    back:'<path d="M15 6l-6 6 6 6"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
  };
  function svg(n){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+IC[n]+'</svg>'}
  function refreshAll(){} /* nesta página não há site para redesenhar */
  function lsGet(k){try{return localStorage.getItem(k)}catch(_){return null}}
  function lsSet(k,v){try{localStorage.setItem(k,v);return true}catch(_){return false}}
  function lsDel(k){try{localStorage.removeItem(k)}catch(_){}}
  function $(s){return adm.querySelector(s)}
  var toastEl=document.createElement("div");toastEl.id="a-toast";toastEl.className="a-toast";toastEl.setAttribute("role","status");toastEl.setAttribute("aria-live","polite");document.body.appendChild(toastEl);
  function toast(m,err){toastEl.textContent=m;toastEl.className="a-toast show"+(err?" err":"");clearTimeout(tt);tt=setTimeout(function(){toastEl.className="a-toast"},err?6500:2800)}

  /* ---- utilidades ---- */
  function today(){var d=new Date();return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
  function words(s){return String(s||"").trim().split(/\s+/).filter(Boolean).length}
  function nextId(){return DATA.news.reduce(function(m,n){return Math.max(m,n.id)},0)+1}
  function find(id){return DATA.news.filter(function(n){return n.id===id})[0]}
  function idx(id){for(var i=0;i<DATA.news.length;i++)if(DATA.news[i].id===id)return i;return -1}
  function fld(label,id,val,type){return '<label for="'+id+'">'+label+'</label><input class="a-in" id="'+id+'" type="'+(type||"text")+'" value="'+esc(val==null?"":val)+'">'}
  function area(label,id,val,rows){return '<label for="'+id+'">'+label+'</label><textarea class="a-in" id="'+id+'" rows="'+rows+'">'+esc(val==null?"":val)+'</textarea>'}
  function authed(){return authOk}
  function api(method,path,body){
    return fetch(path,{method:method,credentials:"same-origin",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){j.status=r.status;return j})});
  }

  /* ---- carregar o conteúdo publicado (lido do próprio site) ---- */
  function loadSite(){
    return fetch("/",{cache:"no-store",credentials:"same-origin"}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(txt){
      SRC=txt;BASE=readBase(new DOMParser().parseFromString(txt,"text/html"));
      if(!BASE||!Array.isArray(BASE.news))throw 0;
      DATA=loadData();
      /* acabou de publicar e o site ainda não atualizou: continua mostrando o que foi publicado */
      var pub=null;try{pub=JSON.parse(lsGet(PKEY)||"null")}catch(_){}
      if(pub&&Date.now()-pub.at<15*60000&&pub.sig!==baseSig()){try{var d=JSON.parse(lsGet(DKEY));if(d&&Array.isArray(d.news))DATA=d}catch(_){}}
      else lsDel(PKEY);
      /* rascunho salvo antes de existirem reviews/assuntos: completa com o publicado, para não apagá-los ao publicar */
      ["trend","reviews"].forEach(function(k){if(!Array.isArray(DATA[k])&&Array.isArray(BASE[k]))DATA[k]=clone(BASE[k])});
    });
  }
  function knownIds(){var k=null;try{k=JSON.parse(lsGet(KKEY)||"null")}catch(_){}return Array.isArray(k)?k:BASE.news.map(function(n){return n.id})}

  /* ---- salvar (com reversão se o navegador não deixar gravar) ---- */
  function persist(){
    /* guarda quais notícias existiam quando a edição começou: o servidor usa isso para
       não apagar notícias que o robô adicionou enquanto você editava */
    if(lsGet(UKEY)!=="1")lsSet(KKEY,JSON.stringify(BASE.news.map(function(n){return n.id})));
    if(!lsSet(DKEY,JSON.stringify(DATA))){toast("Não deu para salvar neste navegador (armazenamento cheio ou bloqueado). Tente uma imagem menor ou um link de imagem.",true);return false}
    lsSet("nz-base-sig",baseSig());lsSet(UKEY,"1");return true;
  }
  function mutate(fn,msg){
    var snap=JSON.stringify(DATA);fn();
    if(!persist()){DATA=JSON.parse(snap);return false}
    refreshAll();status();if(msg)toast(msg);return true;
  }
  function status(){var c=$("#a-status");if(!c)return;var u=lsGet(UKEY)==="1";c.className="a-chip"+(u?" warn":"");c.textContent=u?"● Alterações ainda não publicadas":"✓ Tudo publicado"}

  /* ---- iniciar ---- */
  function init(){
    adm.innerHTML='<div class="a-login"><div class="a-card"><p class="a-hint">Verificando acesso…</p></div></div>';
    Promise.all([
      api("GET","/api/me").then(function(r){authOk=!!r.ok;needTotp=!!r.totp},function(){authOk=false}),
      loadSite()
    ]).then(paint,function(){
      adm.innerHTML='<div class="a-login"><div class="a-card"><h2>Não consegui carregar o site</h2><p class="a-hint">Confira sua internet e recarregue a página.</p></div></div>';
    });
  }
  function logout(){
    if(st.dirty&&!confirm("Há alterações não salvas. Sair mesmo assim?"))return;
    st.dirty=false;st.draft=null;st.isNew=false;st.sel=null;authOk=false;
    api("POST","/api/logout").then(paint,paint);
  }
  function paint(){if(!authed()){loginView();return}shell();tab(st.tab)}

  /* ---- login ---- */
  function loginView(){
    adm.innerHTML='<div class="a-login"><form id="a-lf" class="a-card" novalidate><h2>Entrar na área admin</h2><p class="a-hint">Digite a senha do administrador.</p>'
      +'<input type="text" name="username" autocomplete="username" value="admin" hidden>'+'<label for="l-pw">Senha</label><input class="a-in" id="l-pw" type="password" autocomplete="current-password" maxlength="200">'
      +(needTotp?'<label for="l-code">Código do app autenticador</label><input class="a-in" id="l-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000">':'')
      +'<div class="a-err" id="l-err" role="alert"></div><div class="a-act"><button class="a-btn pri" type="submit" id="l-go">Entrar</button><a class="a-btn" href="/">Voltar ao site</a></div></form></div>';
    setTimeout(function(){var i=$("#l-pw");if(i)i.focus()},30);
  }

  /* ---- estrutura ---- */
  /* abas: [id, ícone, nome, nome curto (barra do celular)] */
  var TABS=[["home","home","Início"],["news","news","Notícias"],["rv","star","Reviews"],["cm","chat","Comentários","Coment."],["site","gear","Site e categorias","Site"],["back","upload","Publicar e backup","Publicar"]];
  function shell(){
    adm.innerHTML='<header class="a-top"><span class="a-logo" aria-hidden="true"></span><strong class="a-title">Painel</strong><span class="a-chip" id="a-status"></span><span class="a-sp"></span>'
      +'<button class="a-ico" type="button" id="a-bell" aria-label="Notificações" title="Notificações">'+svg("bell")+'<b class="a-badge" data-badge hidden></b></button>'
      +'<a class="a-ico" href="/" target="_blank" rel="noopener" title="Ver site">'+svg("ext")+'<span class="a-ilbl">Ver site</span></a>'
      +'<button class="a-ico" type="button" id="a-out" title="Sair">'+svg("out")+'<span class="a-ilbl">Sair</span></button></header>'
      +'<nav class="a-tabs" role="tablist" aria-label="Seções do painel">'+TABS.map(function(t){
        return '<button class="a-tab" role="tab" type="button" data-tab="'+t[0]+'"><span class="a-ti">'+svg(t[1])+(t[0]==="home"?'<b class="a-badge" data-badge hidden></b>':'')+'</span><span class="a-tl">'+t[2]+'</span><span class="a-ts">'+(t[3]||t[2])+'</span></button>';
      }).join("")+'</nav><div class="a-body" id="a-body"></div>';
    status();badge();ntStart();
  }
  function tab(n){
    if(n!==st.tab){if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;st.dirty=false;st.draft=null;st.sel=null;st.isNew=false;st.rvDraft=null;st.rvSel=null;st.rvNew=false}
    st.tab=n;
    [].forEach.call(adm.querySelectorAll(".a-tab"),function(b){b.setAttribute("aria-selected",b.dataset.tab===n)});
    var body=$("#a-body");if(body)body.scrollTop=0;
    ({home:homeView,news:newsView,rv:rvView,cm:cmView,site:siteView,back:backView})[n]();
    if(n==="back")svcView();
  }

  /* ---- notificações (curtidas, comentários, votos e mensagens) ----
     O servidor guarda até onde você já leu: abrir o Início marca tudo como lido em todos os aparelhos. */
  var NT={items:[],seen:0,unread:0,stats:null,err:"",loaded:false,filter:"all",hl:Infinity,hlPending:true,timer:null,busy:false};
  var POLLNAMES={"goty-2026":{t:"GOTY 2026",o:{zelda:"Zelda: Ocarina of Time",gta6:"GTA 6"}}};
  function badge(){
    var n=NT.unread,txt=n>99?"99+":String(n);
    [].forEach.call(adm.querySelectorAll("[data-badge]"),function(b){b.textContent=txt;b.hidden=!n});
    var bell=$("#a-bell");if(bell)bell.setAttribute("aria-label",n?n+" notificação(ões) nova(s)":"Notificações");
    document.title=(n?"("+txt+") ":"")+"Painel · Nizzera Games";
  }
  function ntStart(){
    clearInterval(NT.timer);
    NT.timer=setInterval(function(){if(authOk&&!document.hidden)ntLoad()},60000);
    ntLoad();
  }
  document.addEventListener("visibilitychange",function(){if(!document.hidden&&authOk&&NT.loaded)ntLoad()});
  function ntLoad(){
    if(NT.busy)return;NT.busy=true;
    api("GET","/api/notifications").then(function(r){
      NT.busy=false;
      if(r.status===401){authOk=false;clearInterval(NT.timer);toast("Sua sessão expirou. Entre de novo.",true);paint();return}
      NT.loaded=true;
      if(!r.ok){NT.err=r.error||"Não consegui carregar as notificações.";if(st.tab==="home")homeFill();return}
      NT.err="";NT.items=r.items||[];NT.seen=+r.seen||0;NT.unread=+r.unread||0;NT.stats=r.stats||null;
      if(st.tab==="home"){
        if(NT.hlPending){NT.hl=NT.seen;NT.hlPending=false}
        homeFill();
        if(NT.unread>0)ntSeen();
      }
      badge();
    },function(){NT.busy=false;NT.loaded=true;NT.err="Não consegui falar com o servidor.";if(st.tab==="home")homeFill()});
  }
  function ntSeen(){
    api("POST","/api/notifications",{action:"seen"}).then(function(r){if(r.ok){NT.seen=+r.seen||Date.now();NT.unread=0;badge()}},function(){});
  }
  /* de onde veio: a notícia, a review ou a página de comentários */
  function place(post){
    post=String(post||"");
    if(!post)return {kind:"Página",label:"Comentários e feedback",url:"/comentarios/"};
    if(/^review-/.test(post)){
      var s=post.slice(7),r=rvList().filter(function(x){return reviewSlug(x)===s})[0];
      return {kind:"Review",label:r?r.game:pretty(s),url:"/review/"+s+"/",img:r?{id:r.id,img:r.img,title:r.game}:null};
    }
    var n=DATA.news.filter(function(x){return newsSlug(x)===post})[0];
    return {kind:"Notícia",label:n?n.title:pretty(post),url:"/noticia/"+post+"/",img:n||null};
  }
  function pretty(s){s=String(s).replace(/^\d+-/,"").replace(/-/g," ");return s.charAt(0).toUpperCase()+s.slice(1)}
  function ago(ts){
    var s=Math.round((Date.now()-ts)/1000);
    if(s<60)return "agora";if(s<3600)return "há "+Math.floor(s/60)+" min";if(s<86400)return "há "+Math.floor(s/3600)+" h";
    var d=new Date(ts);return d.toLocaleDateString("pt-BR",{day:"numeric",month:"short"})+", "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  }
  function dayLabel(ts){
    var d=new Date(ts),t=new Date();t.setHours(0,0,0,0);var x=new Date(d);x.setHours(0,0,0,0);
    var diff=Math.round((t-x)/86400000);
    return diff===0?"Hoje":diff===1?"Ontem":d.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});
  }
  function initials(n){var p=String(n||"").trim().split(/\s+/);return ((p[0]||"?")[0]+(p.length>1?p[p.length-1][0]:"")).toUpperCase()}
  var AVC=["#2433f0","#ff5c7a","#0f9f6e","#7a3cff","#e07a00","#0e7fa8"];
  function avColor(n){var h=0;String(n||"?").split("").forEach(function(c){h=(h*31+c.charCodeAt(0))>>>0});return AVC[h%AVC.length]}
  function placeLink(p,hash){return '<a class="n-where" href="'+esc(p.url+(hash||""))+'" target="_blank" rel="noopener"><span class="n-kind">'+esc(p.kind)+'</span><span class="n-lbl">'+esc(p.label)+'</span>'+svg("ext")+'</a>'}
  function ntRow(x){
    var isNew=x.ts>NT.hl,icon,cls,head="",body="",p,act="";
    if(x.t==="comment"){
      p=place(x.post);icon="chat";cls="cm";
      head='<b>'+esc(x.name||"Anônimo")+'</b> comentou'+(x.blocked?' <span class="a-flag" title="Tem palavra da lista de api/_filtro.mjs: não aparece no site">Oculto pelo filtro</span>':'');
      body='<p class="n-msg">'+esc(x.msg)+'</p>'+placeLink(p,"#comentarios");
      act='<button type="button" class="a-mini dan" data-cmdel="'+esc(x.id)+'" title="Remover comentário">'+svg("trash")+'<span>Remover</span></button>';
    }else if(x.t==="like"){
      p=place(x.post);icon="heart";cls="lk";
      head='Alguém <b>curtiu</b> '+(p.kind==="Review"?"a review":"a notícia");
      body=placeLink(p);
    }else if(x.t==="vote"){
      var P=POLLNAMES[x.poll]||{t:x.poll,o:{}};icon="vote";cls="vt";
      head='Novo <b>voto</b> na votação '+esc(P.t);
      body='<p class="n-sub">Escolheu <b>'+esc(P.o[x.opt]||x.opt)+'</b></p>';
    }else if(x.t==="msg"){
      icon="mail";cls="ms";
      head='<b>'+esc(x.name||"Visitante")+'</b> mandou mensagem pelo “Fale com a gente”';
      body='<p class="n-msg">'+esc(x.msg)+'</p><p class="n-sub">'+(x.mail?"A resposta vai pelo e-mail: a mensagem completa está na caixa de entrada.":"Não deixou e-mail para resposta.")+'</p>';
    }else return "";
    return '<li class="n-it n-'+cls+(isNew?" new":"")+'"><span class="n-ic">'+svg(icon)+'</span><div class="n-tx"><div class="n-head"><span>'+head+'</span><time datetime="'+new Date(x.ts).toISOString()+'" title="'+esc(cmDate(x.ts))+'">'+esc(ago(x.ts))+'</time></div>'+body+(act?'<div class="n-act">'+act+'</div>':'')+'</div>'+(isNew?'<span class="n-dot" aria-label="Novo"></span>':'')+'</li>';
  }
  function feedHtml(list){
    var h="",day="";
    list.forEach(function(x){var d=dayLabel(x.ts);if(d!==day){if(day)h+='</ul>';h+='<h3 class="n-day">'+esc(d)+'</h3><ul class="n-list">';day=d}h+=ntRow(x)});
    return h?h+'</ul>':"";
  }

  /* ---- aba Início: resumo e notificações ---- */
  var FILTERS=[["all","Tudo"],["comment","Comentários"],["like","Curtidas"],["vote","Votos"],["msg","Mensagens"]];
  function homeView(){
    NT.hlPending=true;
    $("#a-body").innerHTML='<div class="a-home"><div class="a-hello"><h1>'+hello()+'</h1><p class="a-hint">O que aconteceu no site: curtidas, comentários, votos e mensagens, com o lugar de onde vieram.</p></div>'
      +'<div class="a-stats" id="h-stats"></div>'
      +'<div class="a-homegrid"><section class="a-card a-feed" aria-labelledby="h-ft"><div class="a-fhead"><h2 id="h-ft">Notificações</h2><button class="a-mini" type="button" id="h-reload" title="Atualizar">Atualizar</button></div>'
      +'<div class="a-filters" role="group" aria-label="Filtrar notificações">'+FILTERS.map(function(f){return '<button type="button" class="a-fchip" data-nf="'+f[0]+'" aria-pressed="'+(NT.filter===f[0])+'">'+f[1]+'<b></b></button>'}).join("")+'</div>'
      +'<div id="h-feed"><div class="a-skel"></div><div class="a-skel"></div><div class="a-skel"></div></div></section>'
      +'<aside class="a-side"><section class="a-card" aria-labelledby="h-tt"><h2 id="h-tt">Mais curtidas</h2><div id="h-top"><p class="a-hint">Carregando…</p></div></section>'
      +'<section class="a-card" aria-labelledby="h-pt"><h2 id="h-pt">Votação GOTY 2026</h2><div id="h-poll"><p class="a-hint">Carregando…</p></div></section></aside></div></div>';
    if(NT.loaded)homeFill();
    ntLoad();
  }
  function hello(){var h=new Date().getHours();return h<12?"Bom dia!":h<18?"Boa tarde!":"Boa noite!"}
  function homeFill(){
    var feed=$("#h-feed");if(!feed)return;
    if(NT.err&&!NT.items.length){feed.innerHTML='<p class="a-err">'+esc(NT.err)+'</p>';return}
    var S=NT.stats||{},votes=0,pl=(S.polls||{})["goty-2026"]||{};for(var k in pl)votes+=pl[k];
    var since=Date.now()-86400000,today=NT.items.filter(function(x){return x.ts>since}).length;
    function tile(cls,icon,n,label,sub,go){return '<button type="button" class="a-stat s-'+cls+'"'+(go?' data-nf="'+go+'"':'')+'><span class="a-sic">'+svg(icon)+'</span><b>'+n.toLocaleString("pt-BR")+'</b><span>'+label+'</span>'+(sub?'<small>'+sub+'</small>':'')+'</button>'}
    $("#h-stats").innerHTML=tile("nw","bell",NT.unread||NT.items.filter(function(x){return x.ts>NT.hl}).length,"novas","desde a última visita","all")
      +tile("lk","heart",S.likes||0,"curtidas","no total","like")+tile("cm","chat",S.comments||0,"comentários","no total","comment")+tile("vt","vote",votes,"votos","GOTY 2026","vote");
    /* contagem por tipo nos filtros */
    var cnt={all:NT.items.length};NT.items.forEach(function(x){cnt[x.t]=(cnt[x.t]||0)+1});
    [].forEach.call(adm.querySelectorAll(".a-fchip"),function(b){b.setAttribute("aria-pressed",b.dataset.nf===NT.filter);b.querySelector("b").textContent=cnt[b.dataset.nf]||0});
    var list=NT.items.filter(function(x){return NT.filter==="all"||x.t===NT.filter}).slice(0,120);
    feed.innerHTML=feedHtml(list)||'<div class="a-empty">'+svg("bell")+'<b>Nada por aqui ainda.</b><span>'+(NT.filter==="all"?"Quando alguém curtir, comentar, votar ou mandar mensagem, aparece aqui.":"Nenhuma notificação deste tipo.")+'</span></div>';
    if(today)feed.insertAdjacentHTML("afterbegin",'<p class="a-hint n-today">'+today+' nas últimas 24 horas</p>');
    /* mais curtidas */
    var top=(S.top||[]),mx=top.length?top[0].n:1;
    $("#h-top").innerHTML=top.length?'<ol class="a-top5">'+top.map(function(t){var p=place(t.post);
      return '<li><a href="'+esc(p.url)+'" target="_blank" rel="noopener">'+(p.img?'<span class="art">'+pic(p.img)+'</span>':'<span class="art"></span>')+'<span class="t5-tx"><b>'+esc(p.label)+'</b><i style="width:'+Math.max(6,Math.round(t.n/mx*100))+'%"></i></span><span class="t5-n">'+svg("heart")+t.n+'</span></a></li>'}).join("")+'</ol>':'<p class="a-hint">Nenhuma curtida ainda.</p>';
    /* votação */
    var P=POLLNAMES["goty-2026"],opts=Object.keys(P.o);
    $("#h-poll").innerHTML=votes?opts.map(function(o){var n=pl[o]||0,pc=Math.round(n/votes*100);
      return '<div class="a-pollr"><div><b>'+esc(P.o[o])+'</b><span>'+pc+'% · '+n+' voto'+(n===1?"":"s")+'</span></div><i><u style="width:'+pc+'%"></u></i></div>'}).join("")+'<p class="a-hint">Os números exatos só aparecem aqui; o site mostra só as porcentagens.</p>':'<p class="a-hint">Nenhum voto ainda.</p>';
    fillArt($("#h-top"));
  }

  /* no celular, lista e editor ocupam a tela um de cada vez */
  function editing(on){var w=$(".a-news");if(w)w.classList.toggle("editing",on)}
  function toTop(){var b=$("#a-body");if(b)b.scrollTop=0}
  function backBtn(k){return '<button type="button" class="a-backl" data-backlist="'+k+'">'+svg("back")+'Voltar à lista</button>'}
  function backList(k){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;
    if(k==="news"){st.draft=null;st.sel=null;st.isNew=false;items();editor()}
    else{st.rvDraft=null;st.rvSel=null;st.rvNew=false;rvItems();rvEditor()}
    toTop();
  }

  /* ---- aba Notícias ---- */
  function newsView(){
    $("#a-body").innerHTML='<div class="a-news"><aside class="a-list" aria-label="Lista de notícias"><div class="a-lhead"><button class="a-btn pri" type="button" id="a-new">+ Nova notícia</button><button class="a-btn" type="button" id="a-sort" title="Mais recentes primeiro">Ordenar por data</button></div>'
      +'<input class="a-in" id="a-q" type="search" placeholder="Buscar na lista" aria-label="Buscar na lista" value="'+esc(st.q)+'"><div class="a-items" id="a-items"></div></aside><section id="a-edit"></section></div>';
    items();editor();
  }
  function items(){
    var q=st.q.toLowerCase(),h="";
    DATA.news.forEach(function(n){
      if(q&&(n.title+" "+n.cat).toLowerCase().indexOf(q)<0)return;
      h+='<div class="a-rowi'+(n.id===st.sel?" on":"")+'"><div class="art a-th">'+pic(n)+'</div><button type="button" class="a-pick" data-pick="'+n.id+'"><b>'+esc(n.title||"(sem título)")+'</b><small>'+esc(n.cat)+" · "+esc(fmt(n.date))+(n.featured?" · ★ destaque":"")+'</small>'+(String(n.take||"").trim()?'<span class="a-tk ok">✓ com opinião</span>':'<span class="a-tk">sem opinião</span>')+'</button>'
       +'<span class="a-mv"><button type="button" data-mv="-1" data-mid="'+n.id+'" aria-label="Subir" title="Subir">↑</button><button type="button" data-mv="1" data-mid="'+n.id+'" aria-label="Descer" title="Descer">↓</button></span></div>';
    });
    $("#a-items").innerHTML=h||'<p class="a-hint">Nenhuma notícia encontrada.</p>';
  }
  function editor(){
    var box=$("#a-edit"),d=st.draft;
    editing(!!d);
    if(!d){box.innerHTML='<div class="a-card a-ph"><h2>Editar notícia</h2><p>Escolha uma notícia na lista ao lado ou crie uma nova.</p></div>';return}
    var opts=DATA.cats.map(function(c){return '<option'+(c===d.cat?" selected":"")+'>'+esc(c)+'</option>'}).join("");
    var isData=/^data:/.test(d.img||"");
    var pos=[["","Centro"],["top","Topo"],["bottom","Base"]].map(function(p){return '<option value="'+p[0]+'"'+((d.pos||"")===p[0]?" selected":"")+'>'+p[1]+'</option>'}).join("");
    box.innerHTML='<form id="a-form" class="a-card" novalidate>'+backBtn("news")+'<h2>'+(st.isNew?"Nova notícia":"Editar notícia")+'</h2>'
      +fld("Título","f-title",d.title)
      +'<div class="a-row3"><div><label for="f-cat">Categoria</label><select class="a-in" id="f-cat">'+opts+'</select></div><div><label for="f-date">Data</label><input class="a-in" id="f-date" type="date" value="'+esc(d.date)+'"></div><div><label for="f-read">Leitura (min)</label><input class="a-in" id="f-read" type="number" min="1" max="60" placeholder="auto" value="'+esc(d.read||"")+'"></div></div>'
      +area("Resumo (aparece no card)","f-sum",d.sum,2)
      +area("Texto completo (uma linha em branco separa os parágrafos)","f-body",d.body,8)
      +'<div class="a-take"><label for="f-take">Nossa opinião <small>(texto seu: 2 ou 3 frases com opinião ou contexto)</small></label>'
      +'<textarea class="a-in" id="f-take" rows="3" maxlength="2000" placeholder="Ex.: O que isso muda para quem joga? Vale a pena? Como se compara com o anterior?">'+esc(d.take||"")+'</textarea>'
      +'<p class="a-hint">O Google dá pouco valor a páginas que só repetem outro site. Este texto aparece em destaque na notícia e é o que torna a página sua.</p></div>'
      +'<div class="a-row2"><div>'+fld("Nome da fonte","f-src",d.src)+'</div><div>'+fld("Link da matéria original","f-url",d.url,"url")+'</div></div>'
      +'<h3>Capa</h3><div class="a-cover"><div class="art a-prev" id="a-prev"></div><div>'
      +'<label for="f-img" style="margin-top:0">Endereço (link) da imagem</label><input class="a-in" id="f-img" type="url" placeholder="'+(isData?"Imagem enviada do computador":"https://...")+'" value="'+esc(isData?"":d.img)+'">'
      +'<div class="a-act"><button type="button" class="a-btn" id="a-up">Enviar do computador</button></div><input type="file" id="a-file" accept="image/*" hidden>'
      +'<label for="f-pos">Enquadramento</label><select class="a-in" id="f-pos">'+pos+'</select>'
      +fld("Texto alternativo (para leitores de tela)","f-alt",d.alt)+fld("Crédito da imagem (opcional)","f-credit",d.credit)+'</div></div>'
      +'<label class="a-chk"><input type="checkbox" id="f-feat"'+(d.featured?" checked":"")+'> Mostrar como destaque no topo do site</label>'
      +'<div class="a-err" id="f-err" role="alert"></div>'
      +'<div class="a-act a-save"><button class="a-btn pri" type="submit">Salvar</button><button type="button" class="a-btn" id="a-disc">Descartar</button>'+(st.isNew?"":'<button type="button" class="a-btn dan" id="a-del">Excluir</button>')+'</div></form>';
    preview();
  }
  function readForm(){
    var d=st.draft;if(!d||!$("#a-form"))return;
    d.title=$("#f-title").value.trim();d.cat=$("#f-cat").value;d.date=$("#f-date").value;d.read=parseInt($("#f-read").value,10)||0;
    d.sum=$("#f-sum").value.trim();d.body=$("#f-body").value.trim();d.take=$("#f-take").value.trim();d.src=$("#f-src").value.trim();d.url=$("#f-url").value.trim();
    d.alt=$("#f-alt").value.trim();d.credit=$("#f-credit").value.trim();d.pos=$("#f-pos").value;d.featured=$("#f-feat").checked;
  }
  function preview(){var d=st.draft,p=$("#a-prev");if(!p||!d)return;p.innerHTML=pic({id:d.id,img:d.img,alt:d.alt,title:d.title,pos:d.pos})}
  function pick(id){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.isNew=false;st.sel=id;st.draft=clone(find(id));items();editor();
    toTop();
  }
  function addNew(){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.isNew=true;st.sel=null;
    st.draft={id:nextId(),img:"",alt:"",pos:"",credit:"",cat:DATA.cats[0]||"",title:"",date:today(),read:0,sum:"",body:"",src:"",url:"",featured:false};
    items();editor();toTop();var t=$("#f-title");if(t)t.focus({preventScroll:true});
  }
  function saveNews(){
    var d=st.draft;if(!d)return;readForm();var err=$("#f-err");err.textContent="";
    if(!d.title){err.textContent="Dê um título à notícia.";$("#f-title").focus();return}
    if(!d.img){err.textContent="Toda notícia precisa de uma imagem: cole o link de uma foto ou envie do computador.";$("#f-img").focus();return}
    if(!d.cat){err.textContent="Crie uma categoria na aba “Site e categorias” antes de salvar.";return}
    if(d.url&&!/^https?:\/\//i.test(d.url)){err.textContent="O link da matéria precisa começar com http:// ou https://";$("#f-url").focus();return}
    if(d.img&&/^\s*(javascript:|data:(?!image\/))/i.test(d.img)){err.textContent="Endereço de imagem inválido.";$("#f-img").focus();return}
    if(!d.date)d.date=today();
    /* o endereço da notícia é fixado na primeira gravação e não muda se o título mudar */
    if(!d.slug){var orig=st.isNew?null:find(d.id);d.slug=orig?newsSlug(orig):d.id+"-"+slugify(d.title)}
    if(!d.read)d.read=Math.max(1,Math.round(words(d.body||d.sum)/180));
    var ok=mutate(function(){
      if(d.featured)DATA.news.forEach(function(x){x.featured=false});
      if(st.isNew)DATA.news.unshift(clone(d));else DATA.news[idx(d.id)]=clone(d);
    },"Notícia salva.");
    if(ok){st.isNew=false;st.sel=d.id;st.dirty=false;st.draft=clone(find(d.id));items();editor()}
  }
  function delNews(){
    var d=st.draft;if(!d||st.isNew)return;
    if(!confirm("Excluir “"+d.title+"”? Para desfazer só importando um backup.")) return;
    if(mutate(function(){DATA.news.splice(idx(d.id),1)},"Notícia excluída.")){st.sel=null;st.draft=null;st.dirty=false;items();editor()}
  }
  function move(id,dir){
    var i=idx(id),j=i+dir;if(i<0||j<0||j>=DATA.news.length)return;
    mutate(function(){var t=DATA.news[i];DATA.news[i]=DATA.news[j];DATA.news[j]=t});items();
  }
  function onFile(f){
    if(!f)return;if(!/^image\//.test(f.type)){toast("Escolha um arquivo de imagem.",true);return}
    var fr=new FileReader();fr.onerror=function(){toast("Não consegui ler o arquivo.",true)};
    fr.onload=function(){
      var im=new Image();im.onerror=function(){toast("Não consegui abrir essa imagem.",true)};
      im.onload=function(){
        var r=Math.min(1,1200/im.width),c=document.createElement("canvas");c.width=Math.max(1,Math.round(im.width*r));c.height=Math.max(1,Math.round(im.height*r));
        var x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
        st.draft.img=c.toDataURL("image/jpeg",.82);st.dirty=true;
        var fi=$("#f-img");fi.value="";fi.placeholder="Imagem enviada do computador";preview();toast("Imagem carregada. Clique em Salvar para aplicar.");
      };im.src=fr.result;
    };fr.readAsDataURL(f);
  }

  /* ---- aba Reviews ---- */
  function rvList(){if(!Array.isArray(DATA.reviews))DATA.reviews=[];return DATA.reviews}
  function rvFind(id){return rvList().filter(function(r){return r.id===id})[0]}
  function trimS(s){return String(s).trim()}
  function lines(a){return (a||[]).join("\n")}
  function pairs(a,keys){return (a||[]).map(function(x){return keys.map(function(k){return x[k]||""}).join(" | ").replace(/( \| )+$/,"")}).join("\n")}
  function parseLines(s){return String(s||"").split("\n").map(trimS).filter(Boolean)}
  function parsePairs(s,keys){return parseLines(s).map(function(l){var p=l.split("|").map(trimS),o={};keys.forEach(function(k,i){o[k]=p[i]||""});return o})}
  function rvView(){
    $("#a-body").innerHTML='<div class="a-news"><aside class="a-list" aria-label="Lista de reviews"><div class="a-lhead"><button class="a-btn pri" type="button" id="rv-new">+ Nova review</button></div><div class="a-items" id="rv-items"></div></aside><section id="rv-edit"></section></div>';
    rvItems();rvEditor();
  }
  function rvItems(){
    var l=rvList().slice().sort(function(a,b){return String(b.date||"").localeCompare(String(a.date||""))});
    $("#rv-items").innerHTML=l.map(function(r){
      return '<div class="a-rowi'+(r.id===st.rvSel?" on":"")+'"><div class="art a-th">'+pic({id:r.id,img:r.img,title:r.game})+'</div><button type="button" class="a-pick" data-rvpick="'+r.id+'"><b>'+esc(r.game||"(sem nome)")+'</b><small>Nota '+esc(scoreTxt(r))+' · '+esc(fmt(r.date))+'</small></button><span></span></div>';
    }).join("")||'<p class="a-hint">Nenhuma review ainda.</p>';
  }
  function rvEditor(){
    var box=$("#rv-edit"),r=st.rvDraft;
    editing(!!r);
    if(!r){box.innerHTML='<div class="a-card a-ph"><h2>Editar review</h2><p>Escolha uma review na lista ao lado ou crie uma nova. Use notas e opiniões de fontes reais e liste as fontes no fim.</p></div>';return}
    var mx=[100,10,5].map(function(v){return '<option value="'+v+'"'+((+r.scoreMax||100)===v?" selected":"")+'>de 0 a '+v+'</option>'}).join("");
    box.innerHTML='<form id="rv-form" class="a-card" novalidate>'+backBtn("rv")+'<h2>'+(st.rvNew?"Nova review":"Editar review")+'</h2>'
      +fld("Nome do jogo","r-game",r.game)+fld("Título da review","r-title",r.title)
      +area("Veredito (1 ou 2 frases; aparece no card)","r-verdict",r.verdict,2)
      +'<h3>Nota</h3><div class="a-row3"><div>'+fld("Nota","r-score",r.score,"number")+'</div><div><label for="r-max">Escala</label><select class="a-in" id="r-max">'+mx+'</select></div><div>'+fld("Nota própria (opcional)","r-mine",r.myScore)+'</div></div>'
      +fld("De onde vem a nota (ex.: Metacritic (média da crítica))","r-label",r.scoreLabel)
      +area("Notas da crítica: uma por linha, no formato  Veículo | nota | link","r-critics",pairs(r.critics,["name","score","url"]),5)
      +'<h3>Ficha</h3><div class="a-row2"><div>'+fld("Plataformas","r-plat",r.platforms)+'</div><div>'+fld("Lançamento","r-rel",r.release,"date")+'</div></div>'
      +'<div class="a-row2"><div>'+fld("Desenvolvedora","r-dev",r.dev)+'</div><div>'+fld("Gênero","r-genre",r.genre)+'</div></div>'
      +'<h3>Imagem</h3>'+fld("Link da imagem","r-img",/^data:/.test(r.img||"")?"":r.img,"url")
      +'<div class="a-row2"><div>'+fld("Texto alternativo","r-alt",r.alt)+'</div><div>'+fld("Crédito da imagem","r-credit",r.credit)+'</div></div>'
      +'<h3>Conteúdo</h3>'+area("Sinopse (uma linha em branco separa os parágrafos)","r-syn",r.synopsis,6)
      +area("O que há de novo: um item por linha","r-chg",lines(r.changes),5)
      +'<div class="a-row2"><div>'+area("O que a crítica elogia: um por linha","r-pros",lines(r.pros),6)+'</div><div>'+area("Pontos de atenção: um por linha","r-cons",lines(r.cons),6)+'</div></div>'
      +area("O que o público está achando","r-pub",r.public,5)
      +area("Fontes: uma por linha, no formato  Nome | link","r-src",pairs(r.sources,["name","url"]),5)
      +fld("Data de publicação","r-date",r.date,"date")
      +'<div class="a-err" id="r-err" role="alert"></div><div class="a-act a-save"><button class="a-btn pri" type="submit">Salvar review</button><button type="button" class="a-btn" id="rv-disc">Descartar</button>'
      +(st.rvNew?"":'<a class="a-btn" href="'+esc(reviewUrl(r))+'" target="_blank" rel="noopener">Ver página ↗</a><button type="button" class="a-btn dan" id="rv-del">Excluir</button>')+'</div></form>';
  }
  function rvRead(){
    var r=st.rvDraft,g=function(i){return $(i).value.trim()};
    r.game=g("#r-game");r.title=g("#r-title");r.verdict=g("#r-verdict");r.score=parseFloat(g("#r-score").replace(",","."));r.scoreMax=+$("#r-max").value;
    r.myScore=g("#r-mine");r.scoreLabel=g("#r-label");r.critics=parsePairs($("#r-critics").value,["name","score","url"]);
    r.platforms=g("#r-plat");r.release=g("#r-rel");r.dev=g("#r-dev");r.genre=g("#r-genre");
    var im=g("#r-img");if(im||!/^data:/.test(r.img||""))r.img=im;r.alt=g("#r-alt");r.credit=g("#r-credit");
    r.synopsis=g("#r-syn");r.changes=parseLines($("#r-chg").value);r.pros=parseLines($("#r-pros").value);r.cons=parseLines($("#r-cons").value);
    r.public=g("#r-pub");r.sources=parsePairs($("#r-src").value,["name","url"]);r.date=g("#r-date")||today();
  }
  function rvSave(){
    var r=st.rvDraft;if(!r)return;rvRead();var err=$("#r-err");err.textContent="";
    if(!r.game){err.textContent="Escreva o nome do jogo.";$("#r-game").focus();return}
    if(!(r.score>=0&&r.score<=r.scoreMax)){err.textContent="A nota precisa ficar entre 0 e "+r.scoreMax+".";$("#r-score").focus();return}
    if(r.img&&!/^https?:\/\//i.test(r.img)){err.textContent="O link da imagem precisa começar com http:// ou https://";$("#r-img").focus();return}
    var bad=r.critics.concat(r.sources).filter(function(x){return x.url&&!/^https?:\/\//i.test(x.url)})[0];
    if(bad){err.textContent="Link inválido: "+bad.url+" (precisa começar com http:// ou https://)";return}
    if(!r.slug)r.slug=r.id+"-"+slugify(r.game);
    var ok=mutate(function(){var l=rvList(),i=-1;l.forEach(function(x,k){if(x.id===r.id)i=k});if(i<0)l.unshift(clone(r));else l[i]=clone(r)},"Review salva. Publique para ela valer no site.");
    if(ok){st.rvNew=false;st.rvSel=r.id;st.dirty=false;st.rvDraft=clone(rvFind(r.id));rvItems();rvEditor()}
  }
  function rvDel(){
    var r=st.rvDraft;if(!r||st.rvNew||!confirm("Excluir a review de “"+r.game+"”?"))return;
    if(mutate(function(){DATA.reviews=rvList().filter(function(x){return x.id!==r.id})},"Review excluída.")){st.rvSel=null;st.rvDraft=null;st.dirty=false;rvItems();rvEditor()}
  }
  function rvPick(id){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.rvNew=false;st.rvSel=id;st.rvDraft=clone(rvFind(id));rvItems();rvEditor();
    toTop();
  }
  function rvNew(){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.rvNew=true;st.rvSel=null;
    var id=rvList().reduce(function(m,r){return Math.max(m,+r.id||0)},0)+1;
    st.rvDraft={id:id,slug:"",game:"",title:"",verdict:"",img:"",alt:"",credit:"",platforms:"",release:"",dev:"",genre:"",score:0,scoreMax:100,scoreLabel:"Metacritic (média da crítica)",myScore:"",critics:[],synopsis:"",changes:[],pros:[],cons:[],public:"",sources:[],date:today()};
    rvItems();rvEditor();toTop();var f=$("#r-game");if(f)f.focus({preventScroll:true});
  }

  /* ---- aba Comentários ---- */
  function cmView(){
    $("#a-body").innerHTML='<div class="a-wrap"><div class="a-card"><h2>Comentários e feedback</h2><p class="a-hint">O que os visitantes escreveram no site. Ao remover, o comentário some na hora para todo mundo.</p>'
      +'<div class="a-act"><button class="a-btn" type="button" id="cm-reload">Atualizar lista</button><span class="a-hint" id="cm-count"></span></div><div id="cm-list" style="margin-top:12px"></div></div></div>';
    cmLoad();
  }
  function cmDate(ts){var d=new Date(ts);return isNaN(d)?"":d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}
  function cmLoad(){
    var box=$("#cm-list");if(box)box.innerHTML='<p class="a-hint">Carregando…</p>';
    api("GET","/api/comments?all=1").then(function(r){
      box=$("#cm-list");if(!box)return;
      if(r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint();return}
      if(!r.ok||!Array.isArray(r.items)){box.innerHTML='<p class="a-err">'+esc(r.error||"Não consegui carregar os comentários.")+'</p>';return}
      var n=$("#cm-count");if(n)n.textContent=r.items.length+" comentário(s)";
      box.innerHTML=r.items.length?'<ul class="n-list">'+r.items.map(function(c){
        var p=place(c.post);if(c.title&&p.label===pretty(String(c.post).replace(/^review-/,"")))p.label=c.title;
        return '<li class="n-it n-cm"><span class="cm-av" style="background:'+avColor(c.name)+'">'+esc(initials(c.name||"Anônimo"))+'</span><div class="n-tx"><div class="n-head"><span><b>'+esc(c.name||"Anônimo")+'</b>'+(c.blocked?' <span class="a-flag" title="Tem palavra da lista de api/_filtro.mjs: não aparece no site">Oculto pelo filtro</span>':'')+'</span><time title="'+esc(cmDate(c.ts))+'">'+esc(ago(c.ts))+'</time></div><p class="n-msg">'+esc(c.msg)+'</p>'+placeLink(p,c.post?"#comentarios":"")+'<div class="n-act"><button type="button" class="a-mini dan" data-cmdel="'+esc(c.id)+'">'+svg("trash")+'<span>Remover</span></button></div></div></li>';
      }).join("")+'</ul>':'<div class="a-empty">'+svg("chat")+'<b>Nenhum comentário ainda.</b></div>';
    },function(){box=$("#cm-list");if(box)box.innerHTML='<p class="a-err">Não consegui falar com o servidor.</p>'});
  }
  function cmDel(cid,btn){
    if(!confirm("Remover este comentário? Não dá para desfazer."))return;
    btn.disabled=true;
    api("DELETE","/api/comments?id="+encodeURIComponent(cid)).then(function(r){
      if(r.ok){toast("Comentário removido.");NT.items=NT.items.filter(function(x){return !(x.t==="comment"&&x.id===cid)});if(NT.stats)NT.stats.comments=Math.max(0,(NT.stats.comments||1)-1);if(st.tab==="home")homeFill();else cmLoad()}
      else if(r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint()}
      else{btn.disabled=false;toast(r.error||"Não consegui remover.",true)}
    },function(){btn.disabled=false;toast("Não consegui falar com o servidor.",true)});
  }

  /* ---- aba Site e categorias ---- */
  function siteView(){
    var S=DATA.site;st.cats=DATA.cats.map(function(c){return {orig:c,name:c}});
    $("#a-body").innerHTML='<div class="a-wrap"><form id="a-site" class="a-card" novalidate><h2>Textos do site</h2>'
      +fld("Nome do site","s-name",S.name)+fld("Frase animada do topo","s-tag",S.tagline)+area("Texto abaixo da frase","s-intro",S.intro,3)+area("Texto do rodapé","s-foot",S.footer,3)+fld("Criado por (deixe vazio para ocultar)","s-cred",S.credit)
      +'<div class="a-act"><button class="a-btn pri" type="submit">Salvar textos</button></div></form>'
      +'<div class="a-card"><h2>Assuntos em alta</h2><p class="a-hint">As notícias recentes (até '+TREND_DIAS+' dias) sobre estes assuntos sobem para o “Em alta” e o destaque do topo, ganham o selo 🔥 e viram botões de filtro. O robô também dá preferência a elas. Um assunto por linha, na ordem de importância, no formato <b>Nome: palavra, palavra</b>. O assunto é reconhecido pelo título e pelo resumo da notícia.</p>'
      +'<label for="t-list">Assuntos</label><textarea class="a-in" id="t-list" rows="6" placeholder="GTA 6: gta 6, gta vi, grand theft auto vi">'+esc(trendText())+'</textarea><p class="a-hint" id="t-prev"></p>'
      +'<div class="a-err" id="t-err" role="alert"></div><div class="a-act"><button class="a-btn pri" type="button" id="a-savetrend">Salvar assuntos</button></div></div>'
      +'<div class="a-card"><h2>Categorias</h2><p class="a-hint">A ordem aqui é a ordem dos filtros e do menu lateral. Uma categoria só pode ser excluída quando não tem notícias.</p><div id="a-cats"></div>'
      +'<div class="a-err" id="c-err" role="alert"></div><div class="a-act"><button class="a-btn" type="button" id="a-addcat">+ Adicionar categoria</button><button class="a-btn pri" type="button" id="a-savecats">Salvar categorias</button></div></div></div>';
    catRows();trendPreview();
  }
  function trendText(){return (DATA.trend||[]).map(function(x){return x.name+": "+x.terms.join(", ")}).join("\n")}
  function parseTrend(txt){
    var out=[],err="";
    String(txt||"").split("\n").forEach(function(line,i){
      line=line.trim();if(!line||err)return;
      var k=line.indexOf(":"),name=(k>-1?line.slice(0,k):line).trim(),terms=(k>-1?line.slice(k+1):line).split(",").map(function(w){return w.trim()}).filter(Boolean);
      if(!name||name.length>30){err="Linha "+(i+1)+": o nome do assunto precisa ter de 1 a 30 caracteres.";return}
      if(!terms.length||terms.length>15||terms.some(function(w){return w.length>40})){err="Linha "+(i+1)+": use de 1 a 15 palavras-chave, separadas por vírgula.";return}
      out.push({name:name,terms:terms});
    });
    if(!err&&out.length>12)err="Use no máximo 12 assuntos.";
    return {list:out,err:err};
  }
  /* mostra quantas notícias atuais cada assunto pega, para conferir as palavras-chave */
  function trendPreview(){
    var box=$("#t-prev"),ta=$("#t-list");if(!box||!ta)return;
    var r=parseTrend(ta.value);if(r.err){box.textContent="";return}
    var keep=DATA.trend;DATA.trend=r.list;
    var parts=r.list.map(function(x){var n=DATA.news.filter(function(m){var t=trendOf(m);return t&&t.name===x.name}).length;return x.name+": "+n+" notícia(s)"});
    DATA.trend=keep;box.textContent=parts.length?"Hoje: "+parts.join(" · "):"";
  }
  function saveTrend(){
    var r=parseTrend($("#t-list").value),err=$("#t-err");err.textContent=r.err;if(r.err)return;
    mutate(function(){DATA.trend=r.list},"Assuntos em alta salvos.");
  }
  function catCount(c){return DATA.news.filter(function(n){return n.cat===c}).length}
  function catRows(){
    $("#a-cats").innerHTML=st.cats.map(function(c,i){var n=c.orig?catCount(c.orig):0;
      return '<div class="a-crow"><input class="a-in" data-ci="'+i+'" value="'+esc(c.name)+'" aria-label="Nome da categoria"><small class="a-hint">'+n+' notícia(s)</small><button type="button" data-cm="-1" data-ci="'+i+'" aria-label="Subir" title="Subir">↑</button><button type="button" data-cm="1" data-ci="'+i+'" aria-label="Descer" title="Descer">↓</button><button type="button" data-cd="'+i+'" aria-label="Excluir"'+(n?' disabled title="Mova ou exclua as notícias desta categoria primeiro"':' title="Excluir"')+'>✕</button></div>'}).join("")||'<p class="a-hint">Nenhuma categoria.</p>';
  }
  function saveSite(){
    var g=function(i){return $(i).value.trim()};
    if(!g("#s-name")){toast("O nome do site não pode ficar vazio.",true);return}
    mutate(function(){DATA.site={name:g("#s-name"),tagline:g("#s-tag"),intro:g("#s-intro"),footer:g("#s-foot"),credit:g("#s-cred")}},"Textos salvos.");
  }
  function saveCats(){
    var err=$("#c-err"),names=st.cats.map(function(c){return c.name.trim()}),low={};err.textContent="";
    for(var i=0;i<names.length;i++){
      if(!names[i]){err.textContent="Há uma categoria sem nome.";return}
      if(names[i].toLowerCase()==="todas"){err.textContent="“Todas” já existe automaticamente; escolha outro nome.";return}
      if(low[names[i].toLowerCase()]){err.textContent="Há categorias repetidas: “"+names[i]+"”.";return}
      low[names[i].toLowerCase()]=1;
    }
    var map={};st.cats.forEach(function(c,i){if(c.orig)map[c.orig]=names[i]});
    if(mutate(function(){DATA.news.forEach(function(n){if(map.hasOwnProperty(n.cat))n.cat=map[n.cat]});DATA.cats=names.slice()},"Categorias salvas.")){siteView()}
  }

  /* ---- aba Publicar e backup ---- */
  function backView(){
    $("#a-body").innerHTML='<div class="a-wrap">'
      +'<div class="a-card"><h2>Situação do servidor</h2><p class="a-hint">O que já está configurado na Vercel (Settings → Environment Variables). Depois de criar ou mudar uma variável, faça um novo deploy para ela valer.</p><ul class="a-svc" id="a-svc"><li>Verificando…</li></ul>'
      +'<div class="a-act"><button class="a-btn" type="button" id="a-mailtest">Enviar e-mail de teste</button></div><div class="a-err" id="a-mailerr" role="alert"></div></div>'
      +'<div class="a-card" id="a-2fa"><h2>Verificação em 2 etapas</h2><p class="a-hint">Verificando…</p></div>'
      +'<div class="a-card"><h2>Publicar no site</h2><p class="a-hint">Suas alterações já aparecem aqui no painel e no site aberto neste navegador. Para valerem para todo mundo, clique em publicar: os dados são gravados no GitHub e a Vercel atualiza o site em 1 a 2 minutos. As páginas individuais das notícias e o sitemap são gerados logo em seguida.</p><div class="a-act"><button class="a-btn pri" type="button" id="a-pub">Publicar no site agora</button><button class="a-btn" type="button" id="a-dl">Baixar index.html (cópia)</button></div></div>'
      +'<div class="a-card"><h2>Backup das notícias</h2><p class="a-hint">Um arquivo .json com todas as notícias, categorias e textos. Serve para guardar uma cópia ou levar para outro navegador.</p><div class="a-act"><button class="a-btn" type="button" id="a-json">Baixar notícias (.json)</button><button class="a-btn" type="button" id="a-imp">Importar notícias (.json)</button></div><input type="file" id="a-impf" accept=".json,application/json" hidden></div>'
      +'<div class="a-card"><h2>Voltar ao original</h2><p class="a-hint">Apaga as alterações ainda não publicadas deste navegador e volta ao conteúdo que está no site publicado.</p><div class="a-act"><button class="a-btn dan" type="button" id="a-reset">Descartar alterações deste navegador</button></div></div></div>';
  }
  function svcView(){
    api("GET","/api/me").then(function(r){
      var box=$("#a-svc");if(!box)return;var s=r.services;
      if(!s){box.innerHTML='<li>Não consegui verificar agora.</li>';return}
      function row(ok,title,okTxt,noTxt){return '<li class="'+(ok?"ok":"no")+'"><b>'+(ok?"✓":"✕")+' '+title+'</b><span>'+(ok?okTxt:noTxt)+'</span></li>'}
      box.innerHTML=row(s.email,"E-mail (Fale com a gente)","Configurado. As mensagens vão para "+esc(s.emailTo)+".","Falta RESEND_API_KEY. Veja o passo a passo no README.")
        +row(s.comments,"Comentários","Configurado (Upstash Redis).","Falta o banco Upstash Redis.")
        +row(s.publish,"Publicar pelo painel","Configurado (GitHub).","Faltam GITHUB_REPO e GITHUB_TOKEN.")
        +row(s.totp,"Verificação em 2 etapas","Ativada.","Desativada (opcional). Use o assistente abaixo.");
      tfaCard(s.totp);
    },function(){var box=$("#a-svc");if(box)box.innerHTML='<li>Não consegui falar com o servidor.</li>'});
  }
  /* ---- assistente da verificação em 2 etapas (Google Authenticator, Authy, Microsoft Authenticator) ----
     A chave nasce aqui no navegador e não é enviada a lugar nenhum: você mesmo cola na Vercel.
     Antes disso, o painel confere um código do app, para não ativar com uma chave errada. */
  var tfa=null; /* {key: bytes, b32: texto} */
  function b32enc(bytes){
    var A="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",bits=0,val=0,out="";
    for(var i=0;i<bytes.length;i++){val=(val<<8)|bytes[i];bits+=8;while(bits>=5){out+=A[(val>>>(bits-5))&31];bits-=5}val&=(1<<bits)-1}
    if(bits>0)out+=A[(val<<(5-bits))&31];
    return out;
  }
  function totpAt(keyBytes,step){
    var msg=new ArrayBuffer(8),dv=new DataView(msg);dv.setUint32(0,Math.floor(step/4294967296));dv.setUint32(4,step>>>0);
    return crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-1"},false,["sign"]).then(function(k){return crypto.subtle.sign("HMAC",k,msg)}).then(function(sig){
      var h=new Uint8Array(sig),o=h[h.length-1]&15,n=((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];
      return ("00000"+(n%1000000)).slice(-6);
    });
  }
  function tfaCheck(keyBytes,code){
    var now=Math.floor(Date.now()/30000);
    return Promise.all([totpAt(keyBytes,now-1),totpAt(keyBytes,now),totpAt(keyBytes,now+1)]).then(function(l){return l.indexOf(code)>-1});
  }
  function tfaCard(on){
    var box=$("#a-2fa");if(!box)return;
    if(on){box.innerHTML='<h2>Verificação em 2 etapas</h2><p class="a-hint"><b>Ativada.</b> O login pede a senha e o código de 6 dígitos do app autenticador.</p>'
      +'<p class="a-hint">Trocou de celular ou perdeu o app? Na Vercel, apague a variável <code>ADMIN_TOTP_SECRET</code> e faça um novo deploy: o login volta a pedir só a senha. Depois, ative de novo por aqui.</p>';return}
    box.innerHTML='<h2>Verificação em 2 etapas</h2><p class="a-hint">Hoje o login pede só a senha. Com a verificação em 2 etapas, ele também pede um código de 6 dígitos que muda a cada 30 segundos no seu celular: mesmo quem descobrir a senha não consegue entrar.</p>'
      +'<div class="a-act"><button class="a-btn pri" type="button" id="tfa-start">Configurar agora</button></div><div id="tfa-flow"></div>';
  }
  function tfaStart(){
    var bytes=new Uint8Array(20);crypto.getRandomValues(bytes);tfa={key:bytes,b32:b32enc(bytes)};
    var grouped=tfa.b32.replace(/(.{4})/g,"$1 ").trim();
    var uri="otpauth://totp/"+encodeURIComponent("Nizzera Games:admin")+"?secret="+tfa.b32+"&issuer="+encodeURIComponent("Nizzera Games")+"&digits=6&period=30&algorithm=SHA1";
    $("#tfa-flow").innerHTML='<ol class="a-steps tfa">'
      +'<li><b>Instale o app</b> Google Authenticator (ou Authy / Microsoft Authenticator) no celular.</li>'
      +'<li><b>No app, toque em “+” → “Inserir chave de configuração”</b> e preencha:<div class="tfa-key"><span>Conta: <b>Nizzera Games</b></span><span>Chave: <code id="tfa-k">'+esc(grouped)+'</code></span><span>Tipo: <b>Baseada no horário</b></span></div>'
      +'<div class="a-act"><button class="a-btn" type="button" id="tfa-copy">Copiar chave</button><a class="a-btn" href="'+esc(uri)+'">Abrir no app autenticador (no celular)</a></div></li>'
      +'<li><b>Digite o código de 6 dígitos</b> que apareceu no app:<div class="a-act"><input class="a-in tfa-in" id="tfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Código do app"><button class="a-btn pri" type="button" id="tfa-verify">Conferir código</button></div><div class="a-err" id="tfa-err" role="alert"></div></li>'
      +'</ol><div id="tfa-done"></div>';
    var c=$("#tfa-code");if(c)c.focus();
  }
  function tfaVerify(){
    var code=($("#tfa-code").value||"").replace(/\D/g,""),err=$("#tfa-err");err.textContent="";
    if(!tfa){return}if(code.length!==6){err.textContent="Digite os 6 dígitos que aparecem no app.";return}
    tfaCheck(tfa.key,code).then(function(ok){
      if(!ok){err.textContent="Esse código não confere. Veja se digitou a chave certa no app e se o horário do celular está automático, e tente o código seguinte.";return}
      $("#tfa-done").innerHTML='<div class="tfa-ok"><p><b>✓ Código certo!</b> O app está configurado. Falta ligar no servidor:</p><ol class="a-steps">'
        +'<li>Na Vercel: <b>Settings → Environment Variables → Add</b>.</li>'
        +'<li><b>Key:</b> <code>ADMIN_TOTP_SECRET</code> &nbsp; <b>Value:</b> <code id="tfa-v">'+esc(tfa.b32)+'</code> <button class="a-btn" type="button" id="tfa-copy2">Copiar valor</button></li>'
        +'<li>Marque <b>Production</b>, salve e faça <b>Redeploy</b> (Deployments → ⋯ → Redeploy).</li>'
        +'<li>Saia do painel e entre de novo: agora ele pede a senha e o código do app.</li></ol>'
        +'<p class="a-hint">Esta chave não fica salva em lugar nenhum além do seu app e da Vercel. Se fechar esta página antes de colar na Vercel, é só começar de novo (e apagar a conta antiga no app).</p></div>';
    });
  }
  function copyTxt(txt,btn){
    var done=function(){var o=btn.textContent;btn.textContent="Copiado!";setTimeout(function(){btn.textContent=o},1800)};
    if(navigator.clipboard)navigator.clipboard.writeText(txt).then(done,function(){prompt("Copie:",txt)});else prompt("Copie:",txt);
  }
  function mailTest(b){
    var err=$("#a-mailerr");err.textContent="";b.disabled=true;b.textContent="Enviando…";
    api("POST","/api/contact",{test:true}).then(function(r){
      b.disabled=false;b.textContent="Enviar e-mail de teste";
      if(r.ok)toast("E-mail de teste enviado para "+r.to+". Confira a caixa de entrada (e o spam).");
      else if(r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint()}
      else err.textContent=(r.error||"Não consegui enviar.")+(r.detail?" (Resposta do Resend: "+r.detail+")":"");
    },function(){b.disabled=false;b.textContent="Enviar e-mail de teste";err.textContent="Não consegui falar com o servidor."});
  }
  function norm(d){
    if(!d||!Array.isArray(d.news))return null;
    var o={site:{},cats:[],trend:[],news:[]},s=d.site||{},seen={};
    if(Array.isArray(d.reviews))o.reviews=d.reviews.filter(function(r){return r&&r.game&&+r.id});
    if(Array.isArray(d.trend))o.trend=d.trend.filter(function(x){return x&&x.name&&Array.isArray(x.terms)}).map(function(x){return {name:String(x.name),terms:x.terms.map(String)}});
    ["name","tagline","intro","footer","credit"].forEach(function(k){o.site[k]=String(s[k]==null?BASE.site[k]:s[k])});
    d.news.forEach(function(n,i){
      if(!n||!n.title)return;var id=+n.id||i+1;while(seen[id])id++;seen[id]=1;
      o.news.push({id:id,slug:/^[a-z0-9-]{1,90}$/.test(n.slug||"")?n.slug:"",img:String(n.img||""),alt:String(n.alt||""),credit:String(n.credit||""),pos:/^(top|bottom)$/.test(n.pos)?n.pos:"",cat:String(n.cat||""),title:String(n.title),date:String(n.date||""),pub:String(n.pub||""),take:String(n.take||""),read:+n.read||0,sum:String(n.sum||""),body:String(n.body||""),src:String(n.src||""),url:String(n.url||""),featured:!!n.featured});
    });
    var cs=(Array.isArray(d.cats)?d.cats:[]).map(String).filter(function(c){return c&&c!=="Todas"});
    o.news.forEach(function(n){if(n.cat&&cs.indexOf(n.cat)<0)cs.push(n.cat)});
    o.cats=cs;return o;
  }
  function jsonForHtml(o){return JSON.stringify(o,null,1).replace(/</g,"\\u003c")}
  /* cópia do index.html publicado com os dados atuais (só para backup manual) */
  function buildHtml(){
    return SRC.replace(/(<script id="nz-data" type="application\/json">)[\s\S]*?(<\/script>)/,function(_,a,b){return a+"\n"+jsonForHtml(DATA)+"\n"+b});
  }
  function download(name,type,text){
    var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:type}));a.download=name;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},800);
  }

  /* ---- eventos ---- */
  adm.addEventListener("click",function(e){
    var t=e.target.closest("button");if(!t)return;var id=t.id,ds=t.dataset;
    if(ds.tab){tab(ds.tab);return}
    if(id==="a-bell"){if(st.tab!=="home")tab("home");else{NT.filter="all";homeFill();var f=$(".a-feed");if(f)f.scrollIntoView({behavior:"smooth",block:"start"})}return}
    if(ds.nf){NT.filter=ds.nf;homeFill();if(t.classList.contains("a-stat")){var fd=$(".a-feed");if(fd)fd.scrollIntoView({behavior:"smooth",block:"start"})}return}
    if(id==="h-reload"){t.disabled=true;ntLoad();setTimeout(function(){t.disabled=false},1200);return}
    if(ds.backlist){backList(ds.backlist);return}
    if(ds.pick){pick(+ds.pick);return}
    if(ds.rvpick){rvPick(+ds.rvpick);return}
    if(id==="rv-new"){rvNew();return}
    if(id==="rv-del"){rvDel();return}
    if(id==="rv-disc"){st.dirty=false;st.rvDraft=st.rvNew?null:clone(rvFind(st.rvSel));st.rvNew=false;rvItems();rvEditor();return}
    if(ds.cmdel){cmDel(ds.cmdel,t);return}
    if(id==="cm-reload"){cmLoad();return}
    if(ds.mv){move(+ds.mid,+ds.mv);return}
    if(ds.cm!==undefined){var i=+ds.ci,j=i+(+ds.cm);if(j>=0&&j<st.cats.length){var x=st.cats[i];st.cats[i]=st.cats[j];st.cats[j]=x;catRows()}return}
    if(ds.cd!==undefined){st.cats.splice(+ds.cd,1);catRows();return}
    if(id==="a-out"){logout();return}
    if(id==="a-new"){addNew();return}
    if(id==="a-sort"){mutate(function(){DATA.news.sort(function(a,b){return String(b.date).localeCompare(String(a.date))})},"Ordenado por data (mais recentes primeiro).");items();return}
    if(id==="a-up"){$("#a-file").click();return}
    if(id==="a-disc"){st.dirty=false;st.draft=st.isNew?null:clone(find(st.sel));if(st.isNew)st.isNew=false;items();editor();return}
    if(id==="a-del"){delNews();return}
    if(id==="a-addcat"){st.cats.push({orig:null,name:""});catRows();var ins=adm.querySelectorAll(".a-crow input[data-ci]");var li=ins[ins.length-1];if(li)li.focus();return}
    if(id==="a-savecats"){saveCats();return}
    if(id==="a-savetrend"){saveTrend();return}
    if(id==="a-mailtest"){mailTest(t);return}
    if(id==="tfa-start"){tfaStart();return}
    if(id==="tfa-verify"){tfaVerify();return}
    if(id==="tfa-copy"&&tfa){copyTxt(tfa.b32,t);return}
    if(id==="tfa-copy2"&&tfa){copyTxt(tfa.b32,t);return}
    if(id==="a-pub"){
      if(!confirm("Publicar as alterações no site agora?"))return;
      t.disabled=true;t.textContent="Publicando…";
      api("POST","/api/publish",{data:DATA,known:knownIds()}).then(function(r){
        t.disabled=false;t.textContent="Publicar no site agora";
        if(r.ok){
          if(r.data&&Array.isArray(r.data.news))DATA=r.data; /* inclui notícias que o robô adicionou nesse meio-tempo */
          lsSet(DKEY,JSON.stringify(DATA));lsDel(UKEY);lsDel(KKEY);
          BASE=clone(DATA);lsSet("nz-base-sig",baseSig());lsSet(PKEY,JSON.stringify({at:Date.now(),sig:baseSig()}));
          status();if(st.tab==="news")items();
          toast("Publicado! O site atualiza em 1 a 2 minutos."+(r.merged?" "+r.merged+" notícia(s) nova(s) do robô foram mantidas.":""));
        }
        else if(r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint()}
        else toast(r.error||"Não consegui publicar.",true);
      },function(){t.disabled=false;t.textContent="Publicar no site agora";toast("Não consegui falar com o servidor.",true)});
      return;
    }
    if(id==="a-dl"){download(FILE,"text/html",buildHtml());lsDel(UKEY);status();toast("Arquivo baixado. Agora é só trocar pelo arquivo antigo no seu site.");return}
    if(id==="a-json"){download("nizzera-noticias.json","application/json",JSON.stringify(DATA,null,1));toast("Backup baixado.");return}
    if(id==="a-imp"){$("#a-impf").click();return}
    if(id==="a-reset"){if(confirm("Descartar tudo o que foi alterado neste navegador e voltar ao conteúdo original do arquivo?")){DATA=clone(BASE);lsDel(DKEY);lsDel(UKEY);lsDel(KKEY);lsDel(PKEY);status();toast("Conteúdo original restaurado.")}return}
  });
  adm.addEventListener("submit",function(e){
    e.preventDefault();var id=e.target.id;
    if(id==="a-lf"){
      var pw=$("#l-pw").value,code=$("#l-code")?$("#l-code").value.replace(/\D/g,""):"",err=$("#l-err"),go=$("#l-go");err.textContent="";
      if(!pw){err.textContent="Digite a senha.";return}
      if(needTotp&&code.length!==6){err.textContent="Digite o código de 6 dígitos do app autenticador.";return}
      go.disabled=true;
      api("POST","/api/login",{password:pw,code:code}).then(function(r){
        if(r.ok){authOk=true;paint()}
        else if(r.totp&&!needTotp){needTotp=true;loginView();var e2=$("#l-err");if(e2)e2.textContent="Digite também o código do app autenticador."}
        else{go.disabled=false;err.textContent=r.error||"Não consegui entrar."}
      },function(){go.disabled=false;err.textContent="Não consegui falar com o servidor. Confira sua internet."});
    }
    else if(id==="a-form")saveNews();
    else if(id==="a-site")saveSite();
    else if(id==="rv-form")rvSave();

  });
  adm.addEventListener("input",function(e){
    var t=e.target;
    if(t.id==="a-q"){st.q=t.value;items();return}
    if(t.id==="t-list"){trendPreview();return}
    if(t.dataset&&t.dataset.ci!==undefined&&t.tagName==="INPUT"){st.cats[+t.dataset.ci].name=t.value;return}
    if(t.closest&&t.closest("#rv-form")){st.dirty=true;return}
    if(!t.closest||!t.closest("#a-form")||!st.draft)return;
    st.dirty=true;readForm();
    if(t.id==="f-img")st.draft.img=t.value.trim();
    if(["f-img","f-alt","f-pos","f-title"].indexOf(t.id)>-1)preview();
  });
  adm.addEventListener("change",function(e){
    var t=e.target;
    if(t.id==="a-file"){onFile(t.files&&t.files[0]);t.value=""}
    else if(t.id==="a-impf"){
      var f=t.files&&t.files[0];t.value="";if(!f)return;
      var fr=new FileReader();fr.onerror=function(){toast("Não consegui ler o arquivo.",true)};
      fr.onload=function(){
        var d;try{d=norm(JSON.parse(fr.result))}catch(_){d=null}
        if(!d||!d.news.length){toast("Esse arquivo não parece um backup válido do site.",true);return}
        if(!confirm("Importar "+d.news.length+" notícia(s)? Isso substitui as notícias, categorias e textos atuais."))return;
        if(mutate(function(){DATA=d},"Backup importado.")){st.sel=null;st.draft=null;st.dirty=false;tab(st.tab)}
      };fr.readAsText(f);
    }
  });
  addEventListener("beforeunload",function(e){if(st.dirty){e.preventDefault();e.returnValue=""}});
  init();
})();
