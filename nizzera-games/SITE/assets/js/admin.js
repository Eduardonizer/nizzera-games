/* ===== área admin (página /admin/, não há link para ela no site) ===== */
(function(){
  var adm=document.getElementById("admin");
  var UKEY="nz-unpub",KKEY="nz-known",PKEY="nz-pub",FILE="index.html";
  var st={tab:"news",sel:null,draft:null,isNew:false,dirty:false,q:"",cats:[]},tt,authOk=false,needTotp=false,SRC="";
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
  function shell(){
    adm.innerHTML='<div class="a-top"><strong class="a-title">Área admin</strong><span class="a-chip" id="a-status"></span><span class="a-sp"></span><a class="a-btn" href="/" target="_blank" rel="noopener">Ver site ↗</a><button class="a-btn" type="button" id="a-out">Sair</button></div>'
      +'<div class="a-tabs" role="tablist"><button class="a-tab" role="tab" type="button" data-tab="news">Notícias</button><button class="a-tab" role="tab" type="button" data-tab="rv">Reviews</button><button class="a-tab" role="tab" type="button" data-tab="cm">Comentários</button><button class="a-tab" role="tab" type="button" data-tab="site">Site e categorias</button><button class="a-tab" role="tab" type="button" data-tab="back">Publicar e backup</button></div><div class="a-body" id="a-body"></div>';
    status();
  }
  function tab(n){
    if(n!==st.tab){if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;st.dirty=false;st.draft=null;st.sel=null;st.isNew=false;st.rvDraft=null;st.rvSel=null;st.rvNew=false}
    st.tab=n;
    [].forEach.call(adm.querySelectorAll(".a-tab"),function(b){b.setAttribute("aria-selected",b.dataset.tab===n)});
    ({news:newsView,rv:rvView,cm:cmView,site:siteView,back:backView})[n]();
    if(n==="back")svcView();
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
      h+='<div class="a-rowi'+(n.id===st.sel?" on":"")+'"><div class="art a-th">'+pic(n)+'</div><button type="button" class="a-pick" data-pick="'+n.id+'"><b>'+esc(n.title||"(sem título)")+'</b><small>'+esc(n.cat)+" · "+esc(fmt(n.date))+(n.featured?" · ★ destaque":"")+'</small></button>'
       +'<span class="a-mv"><button type="button" data-mv="-1" data-mid="'+n.id+'" aria-label="Subir" title="Subir">↑</button><button type="button" data-mv="1" data-mid="'+n.id+'" aria-label="Descer" title="Descer">↓</button></span></div>';
    });
    $("#a-items").innerHTML=h||'<p class="a-hint">Nenhuma notícia encontrada.</p>';
  }
  function editor(){
    var box=$("#a-edit"),d=st.draft;
    if(!d){box.innerHTML='<div class="a-card a-ph"><h2>Editar notícia</h2><p>Escolha uma notícia na lista ao lado ou crie uma nova.</p></div>';return}
    var opts=DATA.cats.map(function(c){return '<option'+(c===d.cat?" selected":"")+'>'+esc(c)+'</option>'}).join("");
    var isData=/^data:/.test(d.img||"");
    var pos=[["","Centro"],["top","Topo"],["bottom","Base"]].map(function(p){return '<option value="'+p[0]+'"'+((d.pos||"")===p[0]?" selected":"")+'>'+p[1]+'</option>'}).join("");
    box.innerHTML='<form id="a-form" class="a-card" novalidate><h2>'+(st.isNew?"Nova notícia":"Editar notícia")+'</h2>'
      +fld("Título","f-title",d.title)
      +'<div class="a-row3"><div><label for="f-cat">Categoria</label><select class="a-in" id="f-cat">'+opts+'</select></div><div><label for="f-date">Data</label><input class="a-in" id="f-date" type="date" value="'+esc(d.date)+'"></div><div><label for="f-read">Leitura (min)</label><input class="a-in" id="f-read" type="number" min="1" max="60" placeholder="auto" value="'+esc(d.read||"")+'"></div></div>'
      +area("Resumo (aparece no card)","f-sum",d.sum,2)
      +area("Texto completo (uma linha em branco separa os parágrafos)","f-body",d.body,8)
      +'<div class="a-row2"><div>'+fld("Nome da fonte","f-src",d.src)+'</div><div>'+fld("Link da matéria original","f-url",d.url,"url")+'</div></div>'
      +'<h3>Capa</h3><div class="a-cover"><div class="art a-prev" id="a-prev"></div><div>'
      +'<label for="f-img" style="margin-top:0">Endereço (link) da imagem</label><input class="a-in" id="f-img" type="url" placeholder="'+(isData?"Imagem enviada do computador":"https://...")+'" value="'+esc(isData?"":d.img)+'">'
      +'<div class="a-act"><button type="button" class="a-btn" id="a-up">Enviar do computador</button></div><input type="file" id="a-file" accept="image/*" hidden>'
      +'<label for="f-pos">Enquadramento</label><select class="a-in" id="f-pos">'+pos+'</select>'
      +fld("Texto alternativo (para leitores de tela)","f-alt",d.alt)+fld("Crédito da imagem (opcional)","f-credit",d.credit)+'</div></div>'
      +'<label class="a-chk"><input type="checkbox" id="f-feat"'+(d.featured?" checked":"")+'> Mostrar como destaque no topo do site</label>'
      +'<div class="a-err" id="f-err" role="alert"></div>'
      +'<div class="a-act"><button class="a-btn pri" type="submit">Salvar</button><button type="button" class="a-btn" id="a-disc">Descartar alterações</button>'+(st.isNew?"":'<button type="button" class="a-btn dan" id="a-del">Excluir</button>')+'</div></form>';
    preview();
  }
  function readForm(){
    var d=st.draft;if(!d||!$("#a-form"))return;
    d.title=$("#f-title").value.trim();d.cat=$("#f-cat").value;d.date=$("#f-date").value;d.read=parseInt($("#f-read").value,10)||0;
    d.sum=$("#f-sum").value.trim();d.body=$("#f-body").value.trim();d.src=$("#f-src").value.trim();d.url=$("#f-url").value.trim();
    d.alt=$("#f-alt").value.trim();d.credit=$("#f-credit").value.trim();d.pos=$("#f-pos").value;d.featured=$("#f-feat").checked;
  }
  function preview(){var d=st.draft,p=$("#a-prev");if(!p||!d)return;p.innerHTML=pic({id:d.id,img:d.img,alt:d.alt,title:d.title,pos:d.pos})}
  function pick(id){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.isNew=false;st.sel=id;st.draft=clone(find(id));items();editor();
    if(innerWidth<900)$("#a-edit").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function addNew(){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.isNew=true;st.sel=null;
    st.draft={id:nextId(),img:"",alt:"",pos:"",credit:"",cat:DATA.cats[0]||"",title:"",date:today(),read:0,sum:"",body:"",src:"",url:"",featured:false};
    items();editor();var t=$("#f-title");if(t)t.focus();
    if(innerWidth<900)$("#a-edit").scrollIntoView({behavior:"smooth",block:"start"});
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
    if(!r){box.innerHTML='<div class="a-card a-ph"><h2>Editar review</h2><p>Escolha uma review na lista ao lado ou crie uma nova. Use notas e opiniões de fontes reais e liste as fontes no fim.</p></div>';return}
    var mx=[100,10,5].map(function(v){return '<option value="'+v+'"'+((+r.scoreMax||100)===v?" selected":"")+'>de 0 a '+v+'</option>'}).join("");
    box.innerHTML='<form id="rv-form" class="a-card" novalidate><h2>'+(st.rvNew?"Nova review":"Editar review")+'</h2>'
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
      +'<div class="a-err" id="r-err" role="alert"></div><div class="a-act"><button class="a-btn pri" type="submit">Salvar review</button><button type="button" class="a-btn" id="rv-disc">Descartar alterações</button>'
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
    if(innerWidth<900)$("#rv-edit").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function rvNew(){
    if(st.dirty&&!confirm("Descartar alterações não salvas?"))return;
    st.dirty=false;st.rvNew=true;st.rvSel=null;
    var id=rvList().reduce(function(m,r){return Math.max(m,+r.id||0)},0)+1;
    st.rvDraft={id:id,slug:"",game:"",title:"",verdict:"",img:"",alt:"",credit:"",platforms:"",release:"",dev:"",genre:"",score:0,scoreMax:100,scoreLabel:"Metacritic (média da crítica)",myScore:"",critics:[],synopsis:"",changes:[],pros:[],cons:[],public:"",sources:[],date:today()};
    rvItems();rvEditor();var f=$("#r-game");if(f)f.focus();
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
      box.innerHTML=r.items.length?r.items.map(function(c){
        return '<div class="a-cm"><div class="a-cm-top"><b>'+esc(c.name||"Anônimo")+'</b><small>'+esc(cmDate(c.ts))+'</small><span class="a-sp"></span><button type="button" class="a-btn dan" data-cmdel="'+esc(c.id)+'">Remover</button></div><p>'+esc(c.msg)+'</p></div>';
      }).join(""):'<p class="a-hint">Nenhum comentário ainda.</p>';
    },function(){box=$("#cm-list");if(box)box.innerHTML='<p class="a-err">Não consegui falar com o servidor.</p>'});
  }
  function cmDel(cid,btn){
    if(!confirm("Remover este comentário? Não dá para desfazer."))return;
    btn.disabled=true;
    api("DELETE","/api/comments?id="+encodeURIComponent(cid)).then(function(r){
      if(r.ok){toast("Comentário removido.");cmLoad()}
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
        +row(s.totp,"Verificação em 2 etapas","Ativada.","Desativada (opcional): ADMIN_TOTP_SECRET.");
    },function(){var box=$("#a-svc");if(box)box.innerHTML='<li>Não consegui falar com o servidor.</li>'});
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
      o.news.push({id:id,slug:/^[a-z0-9-]{1,90}$/.test(n.slug||"")?n.slug:"",img:String(n.img||""),alt:String(n.alt||""),credit:String(n.credit||""),pos:/^(top|bottom)$/.test(n.pos)?n.pos:"",cat:String(n.cat||""),title:String(n.title),date:String(n.date||""),read:+n.read||0,sum:String(n.sum||""),body:String(n.body||""),src:String(n.src||""),url:String(n.url||""),featured:!!n.featured});
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
