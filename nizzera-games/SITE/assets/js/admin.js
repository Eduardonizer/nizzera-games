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
    chart:'<path d="M4 20h16"/><path d="M6 16l4-5 3 3 5-7"/><circle cx="18" cy="7" r="1.2"/>',
    bell:'<path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0"/>',
    heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    vote:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    out:'<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
    back:'<path d="M15 6l-6 6 6 6"/>',
    tiers:'<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="13" height="4" rx="1"/><rect x="3" y="16" width="8" height="4" rx="1"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    draft:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4M17 15l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/>'
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
  var TABS=[["home","home","Início"],["an","chart","Análise"],["news","news","Notícias"],["dr","draft","Rascunhos","Rascunho"],["rv","star","Reviews"],["tl","tiers","Tier List","Tier"],["cm","chat","Comentários","Coment."],["site","gear","Site e categorias","Site"],["back","upload","Publicar e backup","Publicar"]];
  function shell(){
    adm.innerHTML='<header class="a-top"><span class="a-logo" aria-hidden="true"></span><strong class="a-title">Painel</strong><span class="a-chip" id="a-status"></span><span class="a-sp"></span>'
      +'<button class="a-ico" type="button" id="a-bell" aria-label="Notificações" title="Notificações">'+svg("bell")+'<b class="a-badge" data-badge hidden></b></button>'
      +'<a class="a-ico" href="/" target="_blank" rel="noopener" title="Ver site">'+svg("ext")+'<span class="a-ilbl">Ver site</span></a>'
      +'<button class="a-ico" type="button" id="a-out" title="Sair">'+svg("out")+'<span class="a-ilbl">Sair</span></button></header>'
      +'<nav class="a-tabs" role="tablist" aria-label="Seções do painel">'+TABS.map(function(t){
        return '<button class="a-tab" role="tab" type="button" data-tab="'+t[0]+'"><span class="a-ti">'+svg(t[1])+(t[0]==="home"?'<b class="a-badge" data-badge hidden></b>':t[0]==="dr"?'<b class="a-badge" data-drn hidden></b>':'')+'</span><span class="a-tl">'+t[2]+'</span><span class="a-ts">'+(t[3]||t[2])+'</span></button>';
      }).join("")+'</nav><div class="a-body" id="a-body"></div>';
    status();badge();ntStart();drLoad();
  }
  function tab(n){
    if(n!==st.tab){if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;st.dirty=false;st.draft=null;st.sel=null;st.isNew=false;st.rvDraft=null;st.rvSel=null;st.rvNew=false;st.tlDraft=null;st.tlSel=null;st.tlNew=false;st.drDraft=null;st.drSel=null}
    st.tab=n;
    [].forEach.call(adm.querySelectorAll(".a-tab"),function(b){b.setAttribute("aria-selected",b.dataset.tab===n)});
    var body=$("#a-body");if(body)body.scrollTop=0;
    ({home:homeView,an:anView,news:newsView,dr:drView,rv:rvView,tl:tlView,cm:cmView,site:siteView,back:backView})[n]();
    if(n==="back")svcView();
  }

  /* ---- aba Análise: números do Vercel Web Analytics (via /api/notifications?analytics=DIAS) ----
     O token da Vercel fica só no servidor. Cores validadas (claro e escuro) para daltonismo e contraste. */
  var AN={dias:7,data:{},busy:false,table:false};
  var PAGINAS={"/":"Página inicial","/ofertas/":"Ofertas da semana","/gratis/":"Jogos grátis","/reviews/":"Reviews","/eventos/":"Eventos",
    "/comunidade/":"Comunidade","/comentarios/":"Comentários","/maisjogados/":"Mais jogados","/tierlist/":"Tier List","/sobre/":"Sobre",
    "/privacidade/":"Privacidade","/gta6/":"GTA VI: imagens","/admin/":"Painel admin"};
  function anNum(n){return Number(n||0).toLocaleString("pt-BR")}
  function anPage(p){
    if(!p)return "(sem endereço)";var k=p.replace(/\/?$/,"/").replace(/^\/\//,"/");
    if(PAGINAS[k])return PAGINAS[k];
    var m=k.match(/^\/noticia\/([^/]+)\/$/);if(m){var n=(DATA.news||[]).filter(function(x){return x.slug===m[1]})[0];return n?n.title:"Notícia: "+m[1].replace(/^\d+-/,"").replace(/-/g," ")}
    m=k.match(/^\/review\/([^/]+)\/$/);if(m){var r=((DATA.reviews)||[]).filter(function(x){return (x.slug||"")===m[1]})[0];return r?"Review: "+r.game:"Review: "+m[1].replace(/^\d+-/,"").replace(/-/g," ")}
    return p;
  }
  var anRegion=null;try{anRegion=new Intl.DisplayNames(["pt-BR"],{type:"region"})}catch(_){}
  function anCountry(c){if(!c)return "Desconhecido";try{return anRegion?anRegion.of(c):c}catch(_){return c}}
  function anDevice(d){return ({desktop:"Computador",mobile:"Celular",tablet:"Tablet"})[String(d||"").toLowerCase()]||d||"Outro"}
  function anRef(h){return h?h.replace(/^www\./,""):"Direto (sem origem)"}
  function anView(){
    $("#a-body").innerHTML='<div class="a-wrap an-wrap"><div class="a-card an-head"><div><h2>Análise do site</h2><p class="a-hint">Visitas do site publicado, direto do Vercel Analytics. Os números chegam com alguns minutos de atraso.</p></div>'
      +'<div class="an-range" role="group" aria-label="Período">'+[[1,"Hoje"],[7,"7 dias"],[30,"30 dias"]].map(function(x){return '<button class="a-btn" type="button" data-andias="'+x[0]+'" aria-pressed="'+(AN.dias===x[0])+'">'+x[1]+'</button>'}).join("")
      +'<button class="a-ico an-reload" type="button" id="an-reload" title="Atualizar" aria-label="Atualizar">↻</button></div></div><div id="an-body"><p class="a-hint">Carregando…</p></div></div>';
    anLoad(false);
  }
  function anLoad(force){
    var d=AN.data[AN.dias];if(d&&!force){anFill();return}
    if(AN.busy)return;AN.busy=true;var dias=AN.dias,box=$("#an-body");if(box&&!d)box.innerHTML='<p class="a-hint">Carregando…</p>';
    api("GET","/api/notifications?analytics="+dias).then(function(r){
      AN.busy=false;
      if(r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint();return}
      AN.data[dias]=r;if(st.tab==="an"&&AN.dias===dias)anFill();
    },function(){AN.busy=false;AN.data[dias]={ok:false,error:"Não consegui falar com o servidor."};if(st.tab==="an")anFill()});
  }
  function anDelta(cur,prev){
    if(prev==null)return "";if(!prev)return cur?'<span class="an-d up">novo</span>':"";
    var p=Math.round((cur-prev)/prev*100);
    return '<span class="an-d '+(p>0?"up":p<0?"down":"")+'" title="Comparado com o período anterior">'+(p>0?"▲ ":p<0?"▼ ":"")+Math.abs(p)+'%</span>';
  }
  function anFill(){
    var box=$("#an-body"),d=AN.data[AN.dias];if(!box||!d)return;
    [].forEach.call(adm.querySelectorAll("[data-andias]"),function(b){b.setAttribute("aria-pressed",+b.dataset.andias===AN.dias)});
    if(!d.ok){box.innerHTML=d.setup?anSetup(d.error):'<div class="a-card"><p class="a-err">'+esc(d.error||"Não consegui carregar a análise.")+'</p></div>';return}
    var T=d.totals,P=d.prev,ppv=T.visitors?(T.pageviews/T.visitors):0,pppv=P&&P.visitors?(P.pageviews/P.visitors):null;
    var nomeP={1:"nas últimas 24 h",7:"nos últimos 7 dias",30:"nos últimos 30 dias"}[AN.dias];
    var h='<div class="an-kpis">'
      +'<div class="a-card an-kpi"><span>Visualizações</span><b>'+anNum(T.pageviews)+'</b>'+anDelta(T.pageviews,P&&P.pageviews)+'</div>'
      +'<div class="a-card an-kpi"><span>Visitantes</span><b>'+anNum(T.visitors)+'</b>'+anDelta(T.visitors,P&&P.visitors)+'</div>'
      +'<div class="a-card an-kpi"><span>Páginas por visitante</span><b>'+ppv.toLocaleString("pt-BR",{maximumFractionDigits:1})+'</b>'+(pppv!=null?anDelta(ppv,pppv):"")+'</div></div>'
      +'<div class="a-card"><div class="an-ctop"><h3>Visitas '+esc(nomeP)+'</h3><div class="an-legend"><span><i class="an-sw s1"></i>Visualizações</span><span><i class="an-sw s2"></i>Visitantes</span></div></div>'
      +'<div class="an-chart" id="an-chart"></div><button class="a-btn an-tbtn" type="button" id="an-table" aria-expanded="'+AN.table+'">'+(AN.table?"Esconder tabela":"Ver como tabela")+'</button>'
      +(AN.table?anTable(d):"")+'</div>'
      +'<div class="an-grid">'
      +anList("Páginas mais vistas",d.top.pages,anPage,true)
      +anList("De onde vêm",d.top.refs,anRef)
      +anList("Países",d.top.countries,anCountry)
      +anList("Aparelhos",d.top.devices,anDevice)
      +anList("Navegadores",d.top.browsers,function(x){return x||"Outro"})
      +anList("Sistemas",d.top.os,function(x){return x||"Outro"})
      +'</div><p class="a-hint">Fonte: Vercel Web Analytics (só o site publicado). No plano grátis a Vercel guarda 1 mês de dados.</p>';
    box.innerHTML=h;anChart(d);
  }
  function anSetup(err){
    return '<div class="a-card"><h2>Falta ligar a análise</h2><p class="a-err" style="margin-top:0">'+esc(err||"")+'</p><ol class="a-steps">'
      +'<li>Na Vercel, abra <b>Account Settings → Tokens</b> (vercel.com/account/tokens) e clique em <b>Create</b>. Dê um nome (ex.: <i>Painel Nizzera</i>), escolha o escopo da sua conta e uma validade.</li>'
      +'<li>Copie o token. No projeto do site na Vercel: <b>Settings → Environment Variables → Add</b>, com <b>Key</b> <code>VERCEL_ANALYTICS_TOKEN</code> e o token em <b>Value</b>. Marque <b>Production</b> e salve.</li>'
      +'<li>Se o projeto na Vercel não se chama <code>nizzera-games</code>, crie também <code>VERCEL_ANALYTICS_PROJECT</code> com o nome dele.</li>'
      +'<li>Faça um <b>Redeploy</b> (Deployments → ⋯ → Redeploy) e volte aqui.</li></ol>'
      +'<p class="a-hint">O token fica só no servidor da Vercel: ele não aparece no site nem no navegador.</p></div>';
  }
  function anList(titulo,rows,nome,isPage){
    rows=(rows||[]).filter(function(r){return r.pageviews>0});
    var max=rows.reduce(function(m,r){return Math.max(m,r.pageviews)},0)||1;
    return '<div class="a-card an-list"><h3>'+esc(titulo)+'</h3>'+(rows.length?'<ol>'+rows.map(function(r){
      var label=nome(r.k),w=Math.max(2,Math.round(r.pageviews/max*100));
      return '<li title="'+esc(label)+': '+anNum(r.pageviews)+' visualizações, '+anNum(r.visitors)+' visitantes"><div class="an-lrow"><span class="an-lname">'
        +(isPage&&r.k?'<a href="'+esc(r.k)+'" target="_blank" rel="noopener">'+esc(label)+'</a>':esc(label))+'</span><span class="an-lval">'+anNum(r.pageviews)+'</span></div>'
        +'<span class="an-bar"><i style="width:'+w+'%"></i></span></li>';
    }).join("")+'</ol>':'<p class="a-hint">Ainda sem dados neste período.</p>')+'</div>';
  }
  function anLabel(t,gran,curto){
    var x=new Date(t);if(isNaN(x))return "";
    if(gran==="hour")return x.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    return x.toLocaleDateString("pt-BR",curto?{day:"2-digit",month:"2-digit"}:{weekday:"short",day:"numeric",month:"short"});
  }
  function anTable(d){
    return '<div class="an-tablewrap"><table class="an-table"><thead><tr><th scope="col">'+(d.gran==="hour"?"Hora":"Dia")+'</th><th scope="col">Visualizações</th><th scope="col">Visitantes</th></tr></thead><tbody>'
      +d.series.map(function(r){return '<tr><td>'+esc(anLabel(r.t,d.gran))+'</td><td>'+anNum(r.pageviews)+'</td><td>'+anNum(r.visitors)+'</td></tr>'}).join("")+'</tbody></table></div>';
  }
  function anChart(d){
    var el=$("#an-chart");if(!el)return;var S=d.series||[];
    if(!S.length){el.innerHTML='<p class="a-hint">Ainda sem visitas neste período.</p>';return}
    var W=Math.max(320,el.clientWidth||640),H=220,L=44,R=12,Tp=12,B=28,iw=W-L-R,ih=H-Tp-B;
    var max=Math.max(1,S.reduce(function(m,r){return Math.max(m,r.pageviews,r.visitors)},0));
    var step=Math.pow(10,Math.floor(Math.log10(max))),nice=Math.ceil(max/step)*step;if(nice/step>5&&step>=1)nice=Math.ceil(max/(step*2))*step*2;
    var x=function(i){return L+(S.length<2?iw/2:i*iw/(S.length-1))},y=function(v){return Tp+ih-v/nice*ih};
    var path=function(k){return S.map(function(r,i){return (i?"L":"M")+x(i).toFixed(1)+","+y(r[k]).toFixed(1)}).join("")};
    var grid="",ticks=4;
    for(var g=0;g<=ticks;g++){var v=nice*g/ticks,yy=y(v).toFixed(1);grid+='<line class="an-gl" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text class="an-ax" x="'+(L-6)+'" y="'+yy+'" dy="4" text-anchor="end">'+anNum(Math.round(v))+'</text>'}
    var every=Math.max(1,Math.ceil(S.length/(W<480?4:7))),xl="";
    S.forEach(function(r,i){if(i%every===0||i===S.length-1)xl+='<text class="an-ax" x="'+x(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+esc(anLabel(r.t,d.gran,true))+'</text>'});
    var dots=S.length<=40?S.map(function(r,i){return '<circle class="an-dot s1" cx="'+x(i).toFixed(1)+'" cy="'+y(r.pageviews).toFixed(1)+'" r="3"/><circle class="an-dot s2" cx="'+x(i).toFixed(1)+'" cy="'+y(r.visitors).toFixed(1)+'" r="3"/>'}).join(""):"";
    el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" role="img" aria-label="Gráfico de visualizações e visitantes; use Ver como tabela para os números">'
      +grid+xl+'<path class="an-line s1" d="'+path("pageviews")+'"/><path class="an-line s2" d="'+path("visitors")+'"/>'+dots
      +'<line class="an-cross" id="an-cross" y1="'+Tp+'" y2="'+(Tp+ih)+'" x1="0" x2="0"/>'
      +'<rect class="an-hit" x="'+L+'" y="'+Tp+'" width="'+iw+'" height="'+ih+'"/></svg><div class="an-tip" id="an-tip" hidden></div>';
    var svgEl=el.querySelector("svg"),hit=el.querySelector(".an-hit"),cross=el.querySelector("#an-cross"),tip=el.querySelector("#an-tip");
    function move(ev){
      var p=ev.touches?ev.touches[0]:ev,rc=svgEl.getBoundingClientRect(),px=(p.clientX-rc.left)*W/rc.width;
      var i=S.length<2?0:Math.round((px-L)/iw*(S.length-1));i=Math.max(0,Math.min(S.length-1,i));var r=S[i],cx=x(i);
      cross.setAttribute("x1",cx);cross.setAttribute("x2",cx);cross.classList.add("on");
      tip.innerHTML='<b>'+esc(anLabel(r.t,d.gran))+'</b><span><i class="an-sw s1"></i>'+anNum(r.pageviews)+' visualizações</span><span><i class="an-sw s2"></i>'+anNum(r.visitors)+' visitantes</span>';
      tip.hidden=false;var left=cx/W*rc.width;tip.style.left=Math.min(Math.max(left,70),rc.width-70)+"px";
    }
    function out(){cross.classList.remove("on");tip.hidden=true}
    hit.addEventListener("mousemove",move);hit.addEventListener("mouseleave",out);
    hit.addEventListener("touchstart",move,{passive:true});hit.addEventListener("touchmove",move,{passive:true});hit.addEventListener("touchend",function(){setTimeout(out,1500)});
  }
  addEventListener("resize",function(){if(st.tab==="an"&&AN.data[AN.dias]&&AN.data[AN.dias].ok){clearTimeout(AN.rt);AN.rt=setTimeout(function(){anChart(AN.data[AN.dias])},150)}});

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
  /* ---- resposta do Nizzera Games aos comentários (aparece embaixo do comentário no site) ---- */
  var CMR={}; /* id do comentário -> resposta atual */
  function repView(id){
    var r=CMR[id]||"";
    return r?'<div class="n-reply"><span class="n-rlbl">Sua resposta</span><p>'+esc(r)+'</p></div>':"";
  }
  function repBox(c){CMR[c.id]=c.reply||"";return '<div class="n-rep" data-rep="'+esc(c.id)+'">'+repView(c.id)+'</div>'}
  function repBtn(c){return '<button type="button" class="a-mini" data-cmrep="'+esc(c.id)+'">'+svg("chat")+'<span>'+(c.reply?"Editar resposta":"Responder")+'</span></button>'}
  function repOpen(id,btn){
    var li=btn.closest("li"),box=li&&li.querySelector('.n-rep');if(!box)return;
    var cur=CMR[id]||"";
    box.innerHTML='<div class="n-rform"><label class="a-hint" for="cmr-'+esc(id)+'">Resposta do Nizzera Games (aparece embaixo do comentário, para todo mundo)</label>'
      +'<textarea class="a-in" id="cmr-'+esc(id)+'" rows="3" maxlength="1000" placeholder="Escreva sua resposta…">'+esc(cur)+'</textarea>'
      +'<div class="n-act"><button type="button" class="a-btn pri" data-cmsave="'+esc(id)+'">Publicar resposta</button><button type="button" class="a-btn" data-cmcancel="'+esc(id)+'">Cancelar</button>'
      +(cur?'<button type="button" class="a-mini dan" data-cmunrep="'+esc(id)+'">'+svg("trash")+'<span>Apagar resposta</span></button>':'')+'</div></div>';
    btn.hidden=true;var ta=box.querySelector("textarea");if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length)}
  }
  function repClose(id,btn){
    var li=btn.closest("li");if(!li)return;var box=li.querySelector(".n-rep"),rb=li.querySelector("[data-cmrep]");
    if(box)box.innerHTML=repView(id);
    if(rb){rb.hidden=false;rb.querySelector("span").textContent=CMR[id]?"Editar resposta":"Responder"}
  }
  function repSave(id,btn,apagar){
    var li=btn.closest("li"),ta=li&&li.querySelector("textarea"),txt=apagar?"":(ta?ta.value.trim():"");
    if(!apagar&&!txt){toast("Escreva a resposta antes de publicar.",true);if(ta)ta.focus();return}
    if(apagar&&!confirm("Apagar sua resposta a este comentário?"))return;
    btn.disabled=true;
    api("PATCH","/api/comments",{id:id,reply:txt}).then(function(r){
      btn.disabled=false;
      if(r.ok){CMR[id]=r.reply||"";NT.items.forEach(function(x){if(x.t==="comment"&&x.id===id)x.reply=r.reply||undefined});repClose(id,btn);toast(apagar?"Resposta apagada.":"Resposta publicada no site.")}
      else if(r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint()}
      else toast(r.error||"Não consegui salvar a resposta.",true);
    },function(){btn.disabled=false;toast("Não consegui falar com o servidor.",true)});
  }
  function ntRow(x){
    var isNew=x.ts>NT.hl,icon,cls,head="",body="",p,act="";
    if(x.t==="comment"){
      p=place(x.post);icon="chat";cls="cm";
      head='<b>'+esc(x.name||"Anônimo")+'</b> comentou'+(x.blocked?' <span class="a-flag" title="Tem palavra da lista de api/_filtro.mjs: não aparece no site">Oculto pelo filtro</span>':'');
      body='<p class="n-msg">'+esc(x.msg)+'</p>'+repBox(x)+placeLink(p,"#comentarios");
      act=repBtn(x)+'<button type="button" class="a-mini dan" data-cmdel="'+esc(x.id)+'" title="Remover comentário">'+svg("trash")+'<span>Remover</span></button>';
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
    else if(k==="tl"){st.tlDraft=null;st.tlSel=null;st.tlNew=false;tlItems();tlEditor()}
    else if(k==="dr"){st.drDraft=null;st.drSel=null;drItems();drEditor()}
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
      +'<div class="a-take"><label for="f-take">Na opinião do Nizzera <small>(texto seu: 2 ou 3 frases com opinião ou contexto)</small></label>'
      +'<textarea class="a-in" id="f-take" rows="3" maxlength="2000" placeholder="Ex.: O que isso muda para quem joga? Vale a pena? Como se compara com o anterior?">'+esc(d.take||"")+'</textarea>'
      +'<p class="a-hint">O Google dá pouco valor a páginas que só repetem outro site. Este texto aparece em destaque na notícia e é o que torna a página sua.</p></div>'
      +'<div class="a-row2"><div>'+fld("Nome da fonte","f-src",d.src)+'</div><div>'+fld("Link da matéria original","f-url",d.url,"url")+'</div></div>'
      +'<h3>Capa</h3><div class="a-cover"><div class="art a-prev" id="a-prev"></div><div>'
      +'<label for="f-img" style="margin-top:0">Endereço (link) da imagem</label><input class="a-in" id="f-img" type="url" placeholder="'+(isData?"Imagem enviada do computador":"https://...")+'" value="'+esc(isData?"":d.img)+'">'
      +'<div class="a-act"><button type="button" class="a-btn" id="a-up">Enviar do computador</button><button type="button" class="a-btn" data-imgfind="news">Buscar outras imagens</button></div><input type="file" id="a-file" accept="image/*" hidden>'
      +'<label for="f-pos">Enquadramento</label><select class="a-in" id="f-pos">'+pos+'</select>'
      +fld("Texto alternativo (para leitores de tela)","f-alt",d.alt)+fld("Crédito da imagem (opcional)","f-credit",d.credit)+'</div></div><div class="a-imgs" id="news-imgs"></div>'
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

  /* ---- aba Tier List: temas em data/tierlists/<slug>.json (gravados no GitHub por /api/tierlist) ---- */
  var TL={themes:null,err:""};
  function tlView(){
    $("#a-body").innerHTML='<div class="a-news"><aside class="a-list" aria-label="Lista de temas"><div class="a-lhead"><button class="a-btn pri" type="button" id="tl-new">+ Novo tema</button></div><div class="a-items" id="tl-items"></div></aside><section id="tl-edit"></section></div>';
    tlItems();tlEditor();
    if(!TL.themes)tlLoad();
  }
  function tlLoad(){
    fetch("/data/tierlists/index.json",{cache:"no-store"}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){
      TL.themes=Array.isArray(d.themes)?d.themes:[];TL.err="";if(st.tab==="tl")tlItems();
    },function(){TL.themes=[];TL.err="Não consegui carregar a lista de temas.";if(st.tab==="tl")tlItems()});
  }
  function tlItems(){
    var box=$("#tl-items");if(!box)return;
    if(!TL.themes){box.innerHTML='<p class="a-hint">Carregando…</p>';return}
    box.innerHTML=(TL.err?'<p class="a-err">'+esc(TL.err)+'</p>':"")+(TL.themes.map(function(t){
      var c=(t.covers||[])[0];
      return '<div class="a-rowi'+(t.slug===st.tlSel?" on":"")+'"><div class="a-th">'+(/^\/assets\/tierlist\/[a-z0-9._-]+$/.test(c||"")?'<img src="'+esc(c)+'" alt="" loading="lazy">':"")+'</div><button type="button" class="a-pick" data-tlpick="'+esc(t.slug)+'"><b>'+esc(t.title)+'</b><small>'+(+t.count||0)+' jogos · /tierlist/?tema='+esc(t.slug)+'</small></button><span></span></div>';
    }).join("")||'<p class="a-hint">Nenhum tema ainda.</p>');
  }
  function tlLines(games){return (games||[]).map(function(g){return g.name+(g.appid?" | "+g.appid:g.src?" | "+g.src:"")}).join("\n")}
  function tlEditor(){
    var box=$("#tl-edit"),t=st.tlDraft;if(!box)return;
    editing(!!t);
    if(!t){box.innerHTML='<div class="a-card a-ph"><h2>Temas da Tier List</h2><p>Escolha um tema na lista ao lado ou crie um novo. Cada tema é uma lista de jogos que os visitantes arrastam para as faixas S, A, B, C e D na página <a href="/tierlist/" target="_blank" rel="noopener">/tierlist/</a>.</p></div>';return}
    box.innerHTML='<form id="tl-form" class="a-card" novalidate>'+backBtn("tl")+'<h2>'+(st.tlNew?"Novo tema":"Editar tema")+'</h2>'
      +fld("Título (ex.: Jogos do GTA)","tl-title",t.title)
      +'<div class="a-row2"><div>'+fld("Endereço (só letras minúsculas, números e hífen)","tl-slug",t.slug)+'</div><div>'+fld("Posição no seletor (opcional; menor aparece primeiro)","tl-order",t.order,"number")+'</div></div>'
      +fld("Descrição curta (aparece no card do tema)","tl-desc",t.description)
      +area("Jogos: um por linha, no formato  Nome | AppID da Steam","tl-games",t.lines,12)
      +'<p class="a-hint">O AppID é o número do endereço do jogo na loja da Steam: em store.steampowered.com/app/<b>271590</b>/… o AppID é 271590 (pode colar o endereço inteiro no lugar do número). Jogo fora da Steam: use  Nome | link https de uma imagem. Depois de salvar, o robô do GitHub baixa as capas e o tema aparece no site em 1 a 2 minutos.</p>'
      +'<div class="a-err" id="tl-err" role="alert"></div><div class="a-act a-save"><button class="a-btn pri" type="submit" id="tl-save">Salvar tema</button><button type="button" class="a-btn" id="tl-disc">Descartar</button>'
      +(st.tlNew?"":'<a class="a-btn" href="/tierlist/?tema='+esc(t.slug)+'" target="_blank" rel="noopener">Ver página ↗</a><button type="button" class="a-btn dan" id="tl-del">Excluir</button>')+'</div></form>';
    var sl=$("#tl-slug");if(sl&&!st.tlNew)sl.readOnly=true;
  }
  function tlPick(slug){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.tlNew=false;st.tlSel=slug;st.tlDraft=null;tlItems();
    var box=$("#tl-edit");if(box)box.innerHTML='<div class="a-card"><p class="a-hint">Carregando o tema…</p></div>';
    fetch("/data/tierlists/"+encodeURIComponent(slug)+".json",{cache:"no-store"}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){
      if(st.tlSel!==slug)return;
      st.tlDraft={slug:slug,title:d.title||"",description:d.description||"",order:d.order||"",lines:tlLines(d.games)};tlEditor();toTop();
    },function(){if(box)box.innerHTML='<div class="a-card"><p class="a-err">Não consegui carregar esse tema. Se ele acabou de ser criado, espere o site atualizar (1 a 2 minutos).</p></div>'});
  }
  function tlNew(){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.tlNew=true;st.tlSel=null;st.tlDraft={slug:"",title:"",description:"",order:"",lines:""};
    tlItems();tlEditor();toTop();var f=$("#tl-title");if(f)f.focus({preventScroll:true});
  }
  /* lê o formulário; devolve o tema no formato do JSON ou uma mensagem de erro */
  function tlRead(){
    var g=function(i){return $(i).value.trim()},t=st.tlDraft;
    t.title=g("#tl-title");t.slug=g("#tl-slug");t.description=g("#tl-desc");t.order=g("#tl-order");t.lines=$("#tl-games").value;
    var games=[],bad="";
    parseLines(t.lines).forEach(function(l,i){
      var p=l.split("|").map(trimS),name=p[0],v=p.slice(1).join("|").trim(),m;
      if(!v&&/^(\d+|https?:\/\/store\.steampowered\.com\/app\/\d+.*)$/.test(name)){v=name;name=""} /* linha só com o AppID ou o endereço da loja */
      if((m=/store\.steampowered\.com\/app\/(\d+)/.exec(v)))v=m[1];   /* colou o endereço da loja */
      var o={name:name};
      if(/^\d+$/.test(v))o.appid=+v;else if(/^https:\/\//i.test(v))o.src=v;
      else if(v){bad=bad||"Linha "+(i+1)+": depois da barra vai o AppID (número) ou um link https da imagem.";return}
      if(!o.appid&&!o.src&&!bad)bad="Linha "+(i+1)+" (“"+name+"”): falta o AppID da Steam ou o link da imagem.";
      games.push(o);
    });
    if(!t.title)return {err:"Escreva o título do tema.",f:"#tl-title"};
    if(!/^[a-z0-9-]{2,60}$/.test(t.slug))return {err:"O endereço precisa ter de 2 a 60 caracteres: letras minúsculas, números e hífen.",f:"#tl-slug"};
    if(bad)return {err:bad,f:"#tl-games"};
    if(games.length<2)return {err:"Coloque pelo menos 2 jogos.",f:"#tl-games"};
    var th={slug:t.slug,title:t.title,description:t.description,games:games};if(+t.order>0)th.order=+t.order;
    return {theme:th};
  }
  function tlSave(){
    if(!st.tlDraft)return;var r=tlRead(),err=$("#tl-err"),btn=$("#tl-save");err.textContent="";
    if(r.err){err.textContent=r.err;var f=$(r.f);if(f)f.focus();return}
    btn.disabled=true;btn.textContent="Salvando…";
    api("POST","/api/tierlist",{action:"save",theme:r.theme,isNew:st.tlNew}).then(function(x){
      btn.disabled=false;btn.textContent="Salvar tema";
      if(x.ok){
        if(Array.isArray(x.themes))TL.themes=x.themes;
        st.dirty=false;st.tlNew=false;st.tlSel=x.theme.slug;
        st.tlDraft={slug:x.theme.slug,title:x.theme.title,description:x.theme.description,order:x.theme.order||"",lines:tlLines(x.theme.games)};
        tlItems();tlEditor();toast("Tema salvo! Aparece no site em 1 a 2 minutos, com as capas.");
      }
      else if(x.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint()}
      else err.textContent=x.error||"Não consegui salvar.";
    },function(){btn.disabled=false;btn.textContent="Salvar tema";err.textContent="Não consegui falar com o servidor."});
  }
  function tlDel(btn){
    var t=st.tlDraft;if(!t||st.tlNew||!confirm("Excluir o tema “"+t.title+"”? A montagem salva dos visitantes deixa de abrir."))return;
    btn.disabled=true;
    api("POST","/api/tierlist",{action:"delete",slug:t.slug}).then(function(x){
      btn.disabled=false;
      if(x.ok){if(Array.isArray(x.themes))TL.themes=x.themes;st.dirty=false;st.tlDraft=null;st.tlSel=null;tlItems();tlEditor();toast("Tema excluído.")}
      else if(x.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint()}
      else toast(x.error||"Não consegui excluir.",true);
    },function(){btn.disabled=false;toast("Não consegui falar com o servidor.",true)});
  }

  /* ---- aba Rascunhos: matérias escritas com IA (Gemini) pelo robô diário, para revisar e publicar ----
     O robô (scripts/rascunhos_ia.py) grava no Upstash Redis; esta aba lê e edita por /api/drafts. */
  var DR={items:null,err:"",filter:"rascunho",gemini:false};
  var DRF=[["rascunho","Pendentes"],["publicado","Publicados"],["descartado","Descartados"]];
  function drFind(id){return (DR.items||[]).filter(function(d){return d.id===id})[0]}
  function drWhen(iso){var d=new Date(iso);return isNaN(d)?"":d.toLocaleDateString("pt-BR",{day:"numeric",month:"short"})+", "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
  function drBadge(){
    var n=(DR.items||[]).filter(function(d){return d.status==="rascunho"}).length;
    [].forEach.call(adm.querySelectorAll("[data-drn]"),function(b){b.textContent=n>99?"99+":String(n);b.hidden=!n});
  }
  function drView(){
    $("#a-body").innerHTML='<div class="a-news"><aside class="a-list" aria-label="Lista de rascunhos"><div class="a-lhead"><button class="a-btn" type="button" id="dr-reload">Atualizar</button></div>'
      +'<div class="a-filters" role="group" aria-label="Filtrar rascunhos">'+DRF.map(function(f){return '<button type="button" class="a-fchip" data-drf="'+f[0]+'" aria-pressed="'+(DR.filter===f[0])+'">'+f[1]+'<b></b></button>'}).join("")+'</div>'
      +'<div class="a-items" id="dr-items"></div></aside><section id="dr-edit"></section></div>';
    drItems();drEditor();
    if(!DR.items)drLoad();
  }
  function drLoad(){
    var b=$("#dr-reload");if(b)b.disabled=true;
    api("GET","/api/drafts").then(function(r){
      if(b)b.disabled=false;
      if(r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint();return}
      if(!r.ok){DR.items=DR.items||[];DR.err=r.error||"Não consegui carregar os rascunhos.";}
      else{DR.items=r.items||[];DR.err="";DR.gemini=!!r.gemini}
      drBadge();if(st.tab==="dr")drItems();
    },function(){if(b)b.disabled=false;DR.items=DR.items||[];DR.err="Não consegui falar com o servidor.";if(st.tab==="dr")drItems()});
  }
  function drItems(){
    var box=$("#dr-items");if(!box)return;
    var all=DR.items||[],cnt={};all.forEach(function(d){cnt[d.status]=(cnt[d.status]||0)+1});
    [].forEach.call(adm.querySelectorAll("[data-drf]"),function(b){b.setAttribute("aria-pressed",b.dataset.drf===DR.filter);b.querySelector("b").textContent=cnt[b.dataset.drf]||0});
    if(!DR.items){box.innerHTML='<div class="a-skel"></div><div class="a-skel"></div><div class="a-skel"></div>';return}
    var list=all.filter(function(d){return d.status===DR.filter});
    box.innerHTML=(DR.err?'<p class="a-err">'+esc(DR.err)+'</p>':"")+(list.map(function(d){
      var nf=(d.fontes||[]).length,op=String(d.opiniao||"").trim();
      return '<div class="a-rowi'+(d.id===st.drSel?" on":"")+'"><div class="art a-th">'+pic({id:0,img:d.img,alt:"",title:d.titulo})+'</div><button type="button" class="a-pick" data-drpick="'+esc(d.id)+'"><b>'+esc(d.titulo||"(sem título)")+'</b><small>'+esc(drWhen(d.criado))+' · '+nf+' fonte'+(nf===1?"":"s")+(d.alta?' · '+esc(d.alta):'')+'</small>'
        +(d.status==="rascunho"?(op?'<span class="a-tk ok">✓ com opinião</span>':'<span class="a-tk">sem opinião</span>'):'')+'</button><span></span></div>';
    }).join("")||'<div class="a-empty">'+svg("draft")+'<b>'+(DR.filter==="rascunho"?"Nenhum rascunho pendente.":"Nada por aqui.")+'</b><span>'+(DR.filter==="rascunho"?"O robô escreve os rascunhos 1 vez por dia, de madrugada, a partir das notícias novas dos feeds.":"")+'</span></div>');
    fillArt(box);
  }
  function drEditor(){
    var box=$("#dr-edit"),d=st.drDraft;if(!box)return;
    editing(!!d);
    if(!d){box.innerHTML='<div class="a-card a-ph"><h2>Rascunhos com IA</h2><p>Todo dia de madrugada, o robô pega as notícias novas dos feeds, junta a mesma notícia de até 3 sites e pede ao Google Gemini uma matéria original. Nada vai para o site sozinho: escolha um rascunho na lista, revise, escreva a sua opinião e publique.</p></div>';return}
    var pend=d.status==="rascunho",opts=DATA.cats.map(function(c){return '<option'+(c===d.cat?" selected":"")+'>'+esc(c)+'</option>'}).join("");
    if(d.cat&&DATA.cats.indexOf(d.cat)<0)opts='<option selected>'+esc(d.cat)+'</option>'+opts;
    var fontes=(d.fontes||[]).map(function(f){return '<li><a href="'+esc(f.url)+'" target="_blank" rel="noopener"><b>'+esc(f.nome)+'</b> '+esc(f.titulo||"")+'</a></li>'}).join("");
    var head=pend?'':(d.status==="publicado"?'<p class="a-note ok">✓ Publicado'+(d.publicado&&d.publicado.em?" em "+esc(drWhen(d.publicado.em)):"")+'.'+(d.publicado&&d.publicado.slug?' <a href="/noticia/'+esc(d.publicado.slug)+'/" target="_blank" rel="noopener">Ver no site ↗</a> (a página aparece em 1 a 2 minutos). Para mudar o texto agora, use a aba Notícias.':'')+'</p>':'<p class="a-note">Este rascunho foi descartado.</p>');
    box.innerHTML='<form id="dr-form" class="a-card" novalidate>'+backBtn("dr")+'<h2>'+(pend?"Revisar rascunho":"Rascunho")+'</h2>'+head
      +'<p class="a-hint">Escrito pelo '+esc(d.modelo||"Gemini")+' em '+esc(drWhen(d.criado))+(d.gerado_de_novo?" (gerado de novo "+d.gerado_de_novo+"×)":"")+'. Confira os fatos nas fontes antes de publicar.</p>'
      +fld("Título","d-title",d.titulo)+fld("Subtítulo (uma linha; aparece no card e abaixo do título)","d-sub",d.subtitulo)
      +'<div class="a-row2"><div><label for="d-cat">Categoria</label><select class="a-in" id="d-cat">'+opts+'</select></div><div>'+fld("Palavras-chave (separadas por vírgula)","d-tags",(d.tags||[]).join(", "))+'</div></div>'
      +'<label for="d-body">Texto <small class="a-wc" id="d-wc"></small></label><textarea class="a-in" id="d-body" rows="14">'+esc(d.texto||"")+'</textarea><p class="a-hint">Uma linha em branco separa os parágrafos. As fontes entram sozinhas no fim da matéria.</p>'
      +'<div class="a-take"><label for="d-take">Na opinião do Nizzera <small>(texto seu, em destaque no fim da matéria)</small></label>'
      +'<textarea class="a-in" id="d-take" rows="4" maxlength="2000" placeholder="O que você acha dessa notícia?">'+esc(d.opiniao||"")+'</textarea>'
      +(d.minha_opiniao?'<div class="a-sug"><span><b>Sugestão da IA:</b> '+esc(d.minha_opiniao)+'</span><button type="button" class="a-mini" id="d-usesug">Usar como ponto de partida</button></div>':'')+'</div>'
      +'<h3>Capa</h3><div class="a-cover"><div class="art a-prev" id="d-prev"></div><div>'
      +'<label for="d-img" style="margin-top:0">Endereço (link) da imagem</label><input class="a-in" id="d-img" type="url" placeholder="https://..." value="'+esc(d.img||"")+'">'
      +(pend?'<div class="a-act"><button type="button" class="a-btn" data-imgfind="dr">Buscar outras imagens</button></div>':'')
      +fld("Crédito da imagem","d-credit",d.credito)+'<p class="a-hint">Aparece abaixo da foto como “Imagem: '+esc(d.credito||"divulgação / fonte")+'”.</p></div></div><div class="a-imgs" id="dr-imgs"></div>'
      +'<h3>Fontes</h3><ul class="a-srcs">'+fontes+'</ul>'
      +'<div class="a-err" id="d-err" role="alert"></div>'
      +'<div class="a-act a-save">'+(pend?'<button class="a-btn pri" type="button" id="d-pub">Publicar</button><button class="a-btn" type="submit" id="d-save">Salvar rascunho</button><button class="a-btn" type="button" id="d-regen"'+(DR.gemini?'':' title="Falta a GEMINI_API_KEY na Vercel"')+'>Gerar de novo</button><button class="a-btn dan" type="button" id="d-disc">Descartar</button>'
        :(d.status==="descartado"?'<button class="a-btn" type="button" id="d-undo">Voltar para pendentes</button>':''))+'</div></form>';
    if(!pend)[].forEach.call(box.querySelectorAll("input,textarea,select"),function(el){el.disabled=true});
    drPrev();drCount();
  }
  function drPrev(){var d=st.drDraft,p=$("#d-prev");if(p&&d){p.innerHTML=pic({id:0,img:d.img,alt:"",title:d.titulo});fillArt(p)}}
  function drCount(){var w=$("#d-wc"),b=$("#d-body");if(w&&b){var n=words(b.value);w.textContent="("+n+" palavras)"}}
  function drRead(){
    var d=st.drDraft;if(!d||!$("#dr-form"))return d;
    var g=function(i){return $(i).value.trim()};
    d.titulo=g("#d-title");d.subtitulo=g("#d-sub");d.cat=$("#d-cat").value;d.texto=g("#d-body");d.opiniao=g("#d-take");d.img=g("#d-img");d.credito=g("#d-credit");
    d.tags=g("#d-tags").split(",").map(trimS).filter(Boolean);
    return d;
  }
  function drPick(id){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.drSel=id;st.drDraft=clone(drFind(id));drItems();drEditor();toTop();
  }
  function drPut(d){var i=(DR.items||[]).map(function(x){return x.id}).indexOf(d.id);if(i>-1)DR.items[i]=d;else(DR.items=DR.items||[]).unshift(d);drBadge()}
  function drFail(r,err){
    if(r&&r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint();return}
    var m=(r&&r.error)||"Não consegui falar com o servidor.";if(err)err.textContent=m;else toast(m,true);
  }
  function drSave(quiet){
    var d=drRead(),err=$("#d-err");if(!d)return Promise.reject();err.textContent="";
    if(!d.titulo){err.textContent="Dê um título à matéria.";$("#d-title").focus();return Promise.reject()}
    if(d.img&&!/^https?:\/\//i.test(d.img)){err.textContent="O link da imagem precisa começar com http:// ou https://";$("#d-img").focus();return Promise.reject()}
    return api("POST","/api/drafts",{action:"save",id:d.id,draft:d}).then(function(r){
      if(!r.ok){drFail(r,err);throw 0}
      drPut(r.draft);st.dirty=false;st.drDraft=clone(r.draft);if(!quiet){drItems();toast("Rascunho salvo.")}
      return r.draft;
    },function(e){drFail(null,err);throw e});
  }
  function nowIso(){var d=new Date(),o=-d.getTimezoneOffset(),p=function(n){return ("0"+Math.floor(Math.abs(n))).slice(-2)};
    return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds())+(o<0?"-":"+")+p(o/60)+":"+p(o%60)}
  function drPublish(btn){
    var d=drRead(),err=$("#d-err");if(!d)return;err.textContent="";
    if(!d.titulo){err.textContent="Dê um título à matéria.";$("#d-title").focus();return}
    if(words(d.texto)<30){err.textContent="O texto está vazio ou curto demais.";$("#d-body").focus();return}
    if(!d.img){err.textContent="Toda notícia do site precisa de uma imagem: cole o link de uma foto em “Capa”.";$("#d-img").focus();return}
    if(!DATA.cats.length){err.textContent="Crie uma categoria na aba “Site e categorias” antes de publicar.";return}
    /* aviso, sem bloquear */
    if(!d.opiniao&&!confirm("Você não escreveu nada em “Na opinião do Nizzera”.\n\nA sua opinião é o que torna a matéria sua (e o Google valoriza isso). Publicar mesmo assim?"))return;
    if(d.opiniao&&d.minha_opiniao&&d.opiniao===d.minha_opiniao.trim()&&!confirm("A opinião está igual à sugestão da IA, sem nenhuma mudança. Publicar mesmo assim?"))return;
    var extra=lsGet(UKEY)==="1";
    if(!confirm("Publicar “"+d.titulo+"” no site agora?"+(extra?"\n\nAtenção: há outras alterações do painel ainda não publicadas, e elas vão junto.":"")))return;
    btn.disabled=true;btn.textContent="Publicando…";
    var done=function(){btn.disabled=false;btn.textContent="Publicar"};
    drSave(true).then(function(saved){
      var id=nextId(),fontes=(saved.fontes||[]).filter(function(f){return f.nome&&/^https?:\/\//i.test(f.url||"")});
      var n={id:id,slug:id+"-"+slugify(saved.titulo),img:saved.img,alt:saved.titulo,credit:saved.credito||"",pos:"",cat:DATA.cats.indexOf(saved.cat)>-1?saved.cat:DATA.cats[0],
        title:saved.titulo,date:today(),pub:nowIso(),take:saved.opiniao||"",read:Math.max(1,Math.round(words(saved.texto)/180)),sum:saved.subtitulo||"",body:saved.texto,
        src:fontes[0]?fontes[0].nome:"",url:fontes[0]?fontes[0].url:"",featured:false};
      if(fontes.length)n.sources=fontes.map(function(f){return {name:f.nome,url:f.url}});
      if((saved.tags||[]).length)n.tags=saved.tags.slice(0,10);
      if(!mutate(function(){DATA.news.unshift(n)})){done();return}
      return publishData().then(function(r){
        if(!r.ok){
          mutate(function(){var i=idx(id);if(i>-1)DATA.news.splice(i,1)});done();drFail(r,err);return;
        }
        var pubN=DATA.news.filter(function(x){return x.slug===n.slug})[0]||n;
        return api("POST","/api/drafts",{action:"status",id:saved.id,status:"publicado",newsId:pubN.id,slug:pubN.slug}).then(function(x){
          done();
          if(x.ok){drPut(x.draft);st.drDraft=clone(x.draft)}else drFail(x);
          drItems();drEditor();
          toast("Publicado! A matéria aparece no site em 1 a 2 minutos.");
        },function(){done();toast("A matéria foi publicada, mas não consegui marcar o rascunho como publicado. Descarte-o na lista.",true)});
      },function(){mutate(function(){var i=idx(id);if(i>-1)DATA.news.splice(i,1)});done();err.textContent="Não consegui falar com o servidor. Nada foi publicado."});
    },function(){done()});
  }
  function drStatus(status,btn){
    var d=st.drDraft;if(!d)return;
    if(status==="descartado"&&!confirm("Descartar este rascunho? Ele sai da lista de pendentes (dá para trazer de volta na lista “Descartados”)."))return;
    btn.disabled=true;
    api("POST","/api/drafts",{action:"status",id:d.id,status:status}).then(function(r){
      btn.disabled=false;
      if(!r.ok){drFail(r);return}
      drPut(r.draft);st.dirty=false;
      if(status==="descartado"){st.drDraft=null;st.drSel=null;toast("Rascunho descartado.")}else{st.drDraft=clone(r.draft);toast("O rascunho voltou para os pendentes.")}
      drItems();drEditor();
    },function(){btn.disabled=false;drFail(null)});
  }
  function drRegen(btn){
    var d=drRead();if(!d)return;
    if(!DR.gemini){toast("Para gerar de novo pelo painel, cadastre a GEMINI_API_KEY na Vercel (Settings → Environment Variables) e faça um Redeploy.",true);return}
    if(!confirm("Pedir ao Gemini uma nova versão?\n\nO título, o subtítulo, o texto e as palavras-chave atuais serão trocados. A sua opinião, a capa e a categoria ficam."))return;
    var keep={opiniao:d.opiniao,img:d.img,credito:d.credito,cat:d.cat};
    btn.disabled=true;btn.textContent="Gerando… (até 1 minuto)";
    api("POST","/api/drafts",{action:"regen",id:d.id}).then(function(r){
      btn.disabled=false;btn.textContent="Gerar de novo";
      if(!r.ok){drFail(r,$("#d-err"));return}
      var nd=r.draft,mud=false;
      for(var k in keep){if((nd[k]||"")!==(keep[k]||"")){nd[k]=keep[k];mud=true}}
      drPut(nd);st.drDraft=clone(nd);st.dirty=mud;drItems();drEditor();
      toast("Nova versão pronta."+(mud?" Clique em Salvar rascunho para guardar a sua opinião e a capa.":""));
    },function(){btn.disabled=false;btn.textContent="Gerar de novo";drFail(null,$("#d-err"))});
  }

  /* ---- "Buscar outras imagens" (rascunhos e notícias): fotos das matérias de origem e da Steam, via /api/drafts ---- */
  var IMGS={list:[],kind:""};
  function imgItem(kind){
    if(kind==="dr"){var d=drRead();return d&&{titulo:d.titulo,tags:d.tags||[],img:d.img,fontes:(d.fontes||[]).map(function(f){return {nome:f.nome,url:f.url}})}}
    readForm();var n=st.draft;if(!n)return null;
    var f=(n.sources&&n.sources.length?n.sources:[{name:n.src,url:n.url}]).filter(function(x){return x&&/^https?:\/\//i.test(x.url||"")}).map(function(x){return {nome:x.name||"fonte",url:x.url}});
    return {titulo:n.title,tags:n.tags||[],img:/^https?:/i.test(n.img||"")?n.img:"",fontes:f};
  }
  function imgFind(kind,btn){
    var item=imgItem(kind),box=$("#"+kind+"-imgs");if(!item||!box)return;
    btn.disabled=true;btn.textContent="Buscando…";box.innerHTML='<p class="a-hint">Procurando fotos nas matérias de origem e na Steam…</p>';
    api("POST","/api/drafts",{action:"images",item:item}).then(function(r){
      btn.disabled=false;btn.textContent="Buscar outras imagens";
      if(r.status===401){authOk=false;toast("Sua sessão expirou. Entre de novo.",true);paint();return}
      if(!r.ok){box.innerHTML='<p class="a-err">'+esc(r.error||"Não consegui buscar imagens.")+'</p>';return}
      IMGS={list:r.images||[],kind:kind};
      box.innerHTML=IMGS.list.length?'<p class="a-hint">Clique numa imagem para usar como capa. O crédito é preenchido junto. Confira se a foto é mesmo do assunto.</p><div class="a-igrid">'
        +IMGS.list.map(function(x,i){return '<button type="button" class="a-iopt" data-iopt="'+i+'" title="'+esc(x.origem)+'"><img src="'+esc(x.url)+'" alt="" loading="lazy" referrerpolicy="no-referrer"'+(x.menor?' data-menor="'+esc(x.menor)+'"':'')+'><small>'+esc(x.origem)+'</small></button>'}).join("")+'</div>'
        :'<p class="a-hint">Não achei outras imagens. Isso acontece quando o site de origem bloqueia o robô e o jogo não está na Steam. Cole o link de uma imagem no campo acima'+(kind==="news"?' ou envie do computador':'')+'.</p>';
    },function(){btn.disabled=false;btn.textContent="Buscar outras imagens";box.innerHTML='<p class="a-err">Não consegui falar com o servidor.</p>'});
  }
  function imgUse(i,el){
    var x=IMGS.list[i];if(!x)return;
    var im=el.querySelector("img"),url=im&&im.dataset.menor&&im.dataset.failed?im.dataset.menor:x.url;
    if(IMGS.kind==="dr"){if(!st.drDraft)return;$("#d-img").value=url;$("#d-credit").value=x.credito;st.drDraft.img=url;st.drDraft.credito=x.credito;drPrev()}
    else{if(!st.draft)return;$("#f-img").value=url;$("#f-credit").value=x.credito;st.draft.img=url;st.draft.credit=x.credito;preview()}
    st.dirty=true;
    [].forEach.call(adm.querySelectorAll(".a-iopt"),function(b){b.classList.toggle("on",b===el)});
    toast(IMGS.kind==="dr"?"Capa trocada. Clique em Salvar rascunho (ou Publicar) para guardar.":"Capa trocada. Clique em Salvar para guardar.");
  }
  /* imagem que não abre: tenta a versão menor; se também falhar, some da lista */
  adm.addEventListener("error",function(e){
    var im=e.target;if(!im||im.tagName!=="IMG"||!im.closest(".a-iopt"))return;
    if(im.dataset.menor&&!im.dataset.failed){im.dataset.failed="1";im.src=im.dataset.menor;return}
    im.closest(".a-iopt").remove();
  },true);

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
        return '<li class="n-it n-cm"><span class="cm-av" style="background:'+avColor(c.name)+'">'+esc(initials(c.name||"Anônimo"))+'</span><div class="n-tx"><div class="n-head"><span><b>'+esc(c.name||"Anônimo")+'</b>'+(c.blocked?' <span class="a-flag" title="Tem palavra da lista de api/_filtro.mjs: não aparece no site">Oculto pelo filtro</span>':'')+'</span><time title="'+esc(cmDate(c.ts))+'">'+esc(ago(c.ts))+'</time></div><p class="n-msg">'+esc(c.msg)+'</p>'+repBox(c)+placeLink(p,c.post?"#comentarios":"")+'<div class="n-act">'+repBtn(c)+'<button type="button" class="a-mini dan" data-cmdel="'+esc(c.id)+'">'+svg("trash")+'<span>Remover</span></button></div></div></li>';
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
        +row(s.gemini,"Gerar de novo (rascunhos com IA)","Configurado (Google Gemini).","Falta GEMINI_API_KEY. Os rascunhos diários são feitos pelo GitHub e não dependem dela.")
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
      var last=o.news[o.news.length-1];
      if(Array.isArray(n.sources)&&n.sources.length)last.sources=n.sources.filter(function(x){return x&&x.name&&/^https?:\/\//i.test(x.url||"")}).map(function(x){return {name:String(x.name),url:String(x.url)}});
      if(Array.isArray(n.tags)&&n.tags.length)last.tags=n.tags.map(String);
    });
    var cs=(Array.isArray(d.cats)?d.cats:[]).map(String).filter(function(c){return c&&c!=="Todas"});
    o.news.forEach(function(n){if(n.cat&&cs.indexOf(n.cat)<0)cs.push(n.cat)});
    o.cats=cs;return o;
  }
  /* grava DATA no GitHub (/api/publish); usado pelo botão "Publicar no site agora" e pelo Publicar dos rascunhos */
  function publishData(){
    return api("POST","/api/publish",{data:DATA,known:knownIds()}).then(function(r){
      if(r.ok){
        if(r.data&&Array.isArray(r.data.news))DATA=r.data; /* inclui notícias que o robô adicionou nesse meio-tempo */
        lsSet(DKEY,JSON.stringify(DATA));lsDel(UKEY);lsDel(KKEY);
        BASE=clone(DATA);lsSet("nz-base-sig",baseSig());lsSet(PKEY,JSON.stringify({at:Date.now(),sig:baseSig()}));
        status();if(st.tab==="news")items();
      }
      return r;
    });
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
    if(ds.andias){AN.dias=+ds.andias;AN.table=false;anFill();anLoad(false);return}
    if(id==="an-reload"){delete AN.data[AN.dias];anLoad(true);return}
    if(id==="an-table"){AN.table=!AN.table;anFill();return}
    if(ds.cmdel){cmDel(ds.cmdel,t);return}
    if(ds.cmrep){repOpen(ds.cmrep,t);return}
    if(ds.cmsave){repSave(ds.cmsave,t,false);return}
    if(ds.cmunrep){repSave(ds.cmunrep,t,true);return}
    if(ds.cmcancel){repClose(ds.cmcancel,t);return}
    if(ds.imgfind){imgFind(ds.imgfind,t);return}
    if(ds.iopt!==undefined){imgUse(+ds.iopt,t);return}
    if(ds.drpick){drPick(ds.drpick);return}
    if(ds.drf){DR.filter=ds.drf;drItems();return}
    if(id==="dr-reload"){drLoad();return}
    if(id==="d-pub"){drPublish(t);return}
    if(id==="d-regen"){drRegen(t);return}
    if(id==="d-disc"){drStatus("descartado",t);return}
    if(id==="d-undo"){drStatus("rascunho",t);return}
    if(id==="d-usesug"&&st.drDraft){var ta=$("#d-take");if(ta){ta.value=st.drDraft.minha_opiniao||"";st.dirty=true;ta.focus();toast("Agora edite com as suas palavras.")}return}
    if(ds.tlpick){tlPick(ds.tlpick);return}
    if(id==="tl-new"){tlNew();return}
    if(id==="tl-del"){tlDel(t);return}
    if(id==="tl-disc"){st.dirty=false;if(st.tlNew){st.tlNew=false;st.tlDraft=null;tlEditor()}else tlPick(st.tlSel);return}
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
      publishData().then(function(r){
        t.disabled=false;t.textContent="Publicar no site agora";
        if(r.ok)toast("Publicado! O site atualiza em 1 a 2 minutos."+(r.merged?" "+r.merged+" notícia(s) nova(s) do robô foram mantidas.":""));
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
    else if(id==="tl-form")tlSave();
    else if(id==="dr-form")drSave().catch(function(){});
    else if(id==="a-site")saveSite();
    else if(id==="rv-form")rvSave();

  });
  adm.addEventListener("input",function(e){
    var t=e.target;
    if(t.id==="a-q"){st.q=t.value;items();return}
    if(t.id==="t-list"){trendPreview();return}
    if(t.dataset&&t.dataset.ci!==undefined&&t.tagName==="INPUT"){st.cats[+t.dataset.ci].name=t.value;return}
    if(t.closest&&t.closest("#dr-form")){st.dirty=true;if(t.id==="d-body")drCount();if(t.id==="d-img"&&st.drDraft){st.drDraft.img=t.value.trim();drPrev()}return}
    if(t.closest&&t.closest("#rv-form")){st.dirty=true;return}
    if(t.closest&&t.closest("#tl-form")){st.dirty=true;if(t.id==="tl-title"&&st.tlNew){var sl=$("#tl-slug");if(sl&&!sl.dataset.touched)sl.value=t.value.trim()?slugify(t.value):""}if(t.id==="tl-slug")t.dataset.touched="1";return}
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
