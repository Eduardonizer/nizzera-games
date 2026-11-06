/* ===== Tier List (página /tierlist/) =====
   Temas: data/tierlists/<slug>.json, listados em data/tierlists/index.json (veja scripts/atualizar_tierlists.py).
   Arrastar: Pointer Events (mouse, caneta e toque). No toque, segure a capa um instante para arrastar;
   um toque rápido seleciona a capa e o próximo toque numa faixa coloca ela lá (também funciona com teclado).
   A montagem fica salva no navegador, por tema. A imagem para compartilhar é desenhada no canvas. */
(function(){
  var root=document.getElementById("tierlist");if(!root)return;
  var SITE_URL="nizzera-games.vercel.app";
  /* faixas: letra e cor (as mesmas cores da paleta do site) */
  var TIERS=[["S","#ff5c7a"],["A","#ff8a3d"],["B","#ffd23f"],["C","#12b886"],["D","#4f7cff"]];
  var KEYS=TIERS.map(function(t){return t[0]});
  var HOLD=170;          /* toque: tempo segurando (ms) para começar a arrastar */
  var MOVE_MOUSE=5;      /* mouse: quantos px mexer para virar arrasto */
  var MOVE_TOUCH=10;     /* toque: mexeu mais que isso antes do tempo = está rolando a página */
  function $(i){return document.getElementById(i)}
  var pick=$("tl-pick"),board=$("tl-board"),themesEl=$("tl-themes"),rowsEl=$("tl-rows"),pool=$("tl-pool"),statusEl=$("tl-status"),titleEl=$("tl-title");
  var TITLE0=document.title,THEMES=[],THEME=null,GAMES={},IMGS={},SEL=null,drag=null,skipClick=false;

  function lsGet(k){try{return localStorage.getItem(k)}catch(_){return null}}
  function lsSet(k,v){try{localStorage.setItem(k,v)}catch(_){}}
  function lsDel(k){try{localStorage.removeItem(k)}catch(_){}}
  function say(t){statusEl.textContent=t}
  function getJson(u){return fetch(u,{cache:"no-cache"}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})}
  function okImg(u){return /^\/assets\/tierlist\/[a-z0-9._-]+$/.test(u||"")}
  function plural(n,a,b){return n+" "+(n===1?a:b)}

  /* ---------- estado ----------
     exportState()/importState() são o formato único da montagem: hoje vão para o localStorage;
     nas próximas versões servem também para o link compartilhável, o "Meu Top 5" e a "Tier list da galera". */
  function exportState(){
    var t={};KEYS.forEach(function(k){t[k]=ids(dropOf(k))});
    return {v:1,theme:THEME.slug,tiers:t};
  }
  function importState(s){
    var used={},out={pool:[]};
    KEYS.forEach(function(k){
      out[k]=(s&&s.tiers&&Array.isArray(s.tiers[k])?s.tiers[k]:[]).filter(function(id){
        if(!GAMES[id]||used[id])return false;used[id]=1;return true;
      });
    });
    /* o que não está em nenhuma faixa (inclusive jogos novos no tema) fica embaixo, na ordem do tema */
    THEME.games.forEach(function(g){if(!used[g.id])out.pool.push(g.id)});
    return out;
  }
  function storeKey(){return "nz-tier:"+THEME.slug}
  function save(){
    var s=exportState(),any=KEYS.some(function(k){return s.tiers[k].length});
    if(any)lsSet(storeKey(),JSON.stringify(s));else lsDel(storeKey());
  }
  function load(){var s=null;try{s=JSON.parse(lsGet(storeKey())||"null")}catch(_){}return importState(s)}

  /* ---------- temas ---------- */
  function themeCard(t){
    var cov=(t.covers||[]).filter(okImg).slice(0,4).map(function(c){return '<img src="'+esc(c)+'" alt="" loading="lazy" decoding="async">'}).join("");
    return '<a class="tl-theme" href="/tierlist/?tema='+esc(t.slug)+'" data-theme-slug="'+esc(t.slug)+'"><span class="tl-cov" aria-hidden="true">'+cov+'</span>'
      +'<span class="tl-ttx"><b>'+esc(t.title)+'</b><span>'+esc(t.description||"")+'</span><small>'+plural(+t.count||0,"jogo","jogos")+'</small></span></a>';
  }
  function loadThemes(){
    return getJson("/data/tierlists/index.json").then(function(d){
      THEMES=(d&&Array.isArray(d.themes)?d.themes:[]).filter(function(t){return t&&/^[a-z0-9-]{2,60}$/.test(t.slug||"")});
      themesEl.innerHTML=THEMES.length?THEMES.map(themeCard).join(""):'<p class="soon">Nenhum tema por enquanto. Volte em breve!</p>';
    },function(){
      if(!themesEl.querySelector(".tl-theme"))themesEl.innerHTML='<p class="soon">Não consegui carregar os temas. Confira sua internet e recarregue a página.</p>';
    });
  }
  function slugFromUrl(){var m=/[?&]tema=([a-z0-9-]{2,60})(?:&|$)/.exec(location.search);return m?m[1]:""}
  function showPick(){
    THEME=null;clearSel();board.hidden=true;pick.hidden=false;
    document.title=TITLE0;
  }
  function openTheme(slug,push){
    say("");
    return getJson("/data/tierlists/"+slug+".json").then(function(t){
      if(!t||!Array.isArray(t.games))throw new Error("tema inválido");
      THEME={slug:slug,title:String(t.title||slug),games:[]};GAMES={};
      t.games.forEach(function(g){
        if(!g||!/^[a-z0-9-]{1,60}$/.test(g.id||"")||GAMES[g.id])return;
        var x={id:g.id,name:String(g.name||g.id),img:okImg(g.img)?g.img:""};
        GAMES[x.id]=x;THEME.games.push(x);
      });
      preload();
      if(push)history.pushState({tema:slug},"","/tierlist/?tema="+slug);
      render(load());
      pick.hidden=true;board.hidden=false;
      titleEl.textContent=THEME.title;
      document.title="Tier List: "+THEME.title+" | Nizzera Games";
      titleEl.focus({preventScroll:true});
      if(push)board.scrollIntoView({block:"start",behavior:"auto"});
    }).catch(function(){
      showPick();say("");
      themesEl.insertAdjacentHTML("afterbegin",'<p class="soon tl-err">Esse tema não existe mais ou não carregou. Escolha outro.</p>');
    });
  }
  /* capas já carregadas = imagem gerada na hora do clique (o compartilhar do celular exige isso) */
  function preload(){
    THEME.games.forEach(function(g){
      if(!g.img||IMGS[g.img])return;
      var im=new Image();im.decoding="async";im.src=g.img;IMGS[g.img]=im;
    });
  }

  /* ---------- desenho ---------- */
  function tile(g){
    return '<button class="tl-item" type="button" role="listitem" data-id="'+esc(g.id)+'" title="'+esc(g.name)+'" aria-label="'+esc(g.name)+'">'
      +(g.img?'<img src="'+esc(g.img)+'" alt="" draggable="false" decoding="async">':'<span class="tl-noimg">'+esc(g.name)+'</span>')+'</button>';
  }
  function render(st){
    rowsEl.innerHTML=TIERS.map(function(t){
      return '<div class="tl-row" style="--tc:'+t[1]+'"><button class="tl-lab" type="button" data-place="'+t[0]+'" aria-label="Colocar na faixa '+t[0]+'"><span>'+t[0]+'</span></button>'
        +'<div class="tl-drop" data-tier="'+t[0]+'" role="list" aria-label="Faixa '+t[0]+'">'+st[t[0]].map(function(id){return tile(GAMES[id])}).join("")+'</div></div>';
    }).join("");
    pool.innerHTML=st.pool.map(function(id){return tile(GAMES[id])}).join("");
    counts();
  }
  function dropOf(k){return k==="pool"?pool:rowsEl.querySelector('.tl-drop[data-tier="'+k+'"]')}
  function ids(el){return [].map.call(el.querySelectorAll(".tl-item"),function(b){return b.dataset.id})}
  function counts(){
    var left=pool.querySelectorAll(".tl-item").length;
    pool.classList.toggle("tl-done",!left);
    pool.setAttribute("data-empty",left?"":"Tudo no lugar! Agora é só baixar ou compartilhar a imagem.");
  }
  function itemOf(id){return root.querySelector('.tl-item[data-id="'+id+'"]')}
  function tierName(k){return k==="pool"?"a área de baixo":"a faixa "+k}

  /* ---------- clique / toque / teclado: seleciona a capa e depois escolhe a faixa ---------- */
  function clearSel(){if(SEL){var b=itemOf(SEL);if(b)b.classList.remove("tl-sel")}SEL=null;root.classList.remove("tl-selecting")}
  function select(id){
    clearSel();SEL=id;var b=itemOf(id);if(b)b.classList.add("tl-sel");root.classList.add("tl-selecting");
    say(GAMES[id].name+" selecionado: toque numa faixa para colocar (ou na área de baixo para tirar).");
  }
  function place(id,k,before){
    var b=itemOf(id),d=dropOf(k);if(!b||!d)return;
    if(before&&before!==b)d.insertBefore(b,before);else d.appendChild(b);
    clearSel();counts();save();
    say(GAMES[id].name+" foi para "+tierName(k)+".");
    b.focus({preventScroll:true});
  }
  root.addEventListener("click",function(e){
    if(skipClick){skipClick=false;e.preventDefault();return}
    var a=e.target.closest(".tl-theme");
    if(a&&a.dataset.themeSlug){if(e.ctrlKey||e.metaKey||e.shiftKey||e.button)return;e.preventDefault();openTheme(a.dataset.themeSlug,true);return}
    var it=e.target.closest(".tl-item");
    if(it){
      var id=it.dataset.id,box=it.parentNode,selBox=SEL&&itemOf(SEL)?itemOf(SEL).parentNode:null;
      if(SEL===id){clearSel();say("");return}
      /* com uma capa selecionada, tocar noutra capa coloca a selecionada antes dela
         (na área de baixo, entre duas capas que ainda não foram colocadas, só troca a seleção) */
      if(SEL&&!(box===pool&&selBox===pool)){place(SEL,box.dataset.tier,it);return}
      select(id);return;
    }
    if(!SEL)return;
    var lab=e.target.closest("[data-place]");if(lab){place(SEL,lab.dataset.place);return}
    var dr=e.target.closest(".tl-drop,.tl-row,.tl-poolbox");
    if(dr){var d=dr.classList.contains("tl-drop")?dr:dr.querySelector(".tl-drop");if(d)place(SEL,d.dataset.tier)}
  });
  document.addEventListener("keydown",function(e){
    if(e.key!=="Escape")return;
    if(drag){endDrag(true);return}
    if(SEL){clearSel();say("")}
  });

  /* ---------- arrastar (Pointer Events: mouse, caneta e toque) ---------- */
  function onDown(e){
    skipClick=false; /* um novo toque/clique começou: o "clique fantasma" do arrasto anterior já passou */
    var it=e.target.closest(".tl-item");
    if(!it||drag||(e.pointerType==="mouse"&&e.button!==0))return;
    var r=it.getBoundingClientRect();
    drag={it:it,id:it.dataset.id,pid:e.pointerId,touch:e.pointerType!=="mouse",x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,
      dx:e.clientX-r.left,dy:e.clientY-r.top,w:r.width,h:r.height,on:false,from:it.parentNode,next:it.nextSibling,timer:0,raf:0};
    if(drag.touch)drag.timer=setTimeout(startDrag,HOLD);
  }
  function startDrag(){
    var d=drag;if(!d||d.on)return;
    d.on=true;clearSel();
    var g=d.it.cloneNode(true);g.className="tl-item tl-ghost";g.removeAttribute("id");g.setAttribute("aria-hidden","true");
    g.style.width=d.w+"px";g.style.height=d.h+"px";document.body.appendChild(g);d.ghost=g;
    d.it.classList.add("tl-ph");document.documentElement.classList.add("tl-dragging");
    if(d.touch&&navigator.vibrate)try{navigator.vibrate(12)}catch(_){}
    moveGhost();d.raf=requestAnimationFrame(autoScroll);
  }
  function onMove(e){
    var d=drag;if(!d||e.pointerId!==d.pid)return;
    d.x=e.clientX;d.y=e.clientY;
    var dist=Math.max(Math.abs(d.x-d.x0),Math.abs(d.y-d.y0));
    if(!d.on){
      if(d.touch){if(dist>MOVE_TOUCH){clearTimeout(d.timer);drag=null}return} /* mexeu antes do tempo: é rolagem */
      if(dist<MOVE_MOUSE)return;
      startDrag();
    }
    e.preventDefault();moveGhost();hover();
  }
  function moveGhost(){var d=drag;d.ghost.style.transform="translate("+(d.x-d.dx)+"px,"+(d.y-d.dy)+"px) rotate(-3deg) scale(1.06)"}
  /* acha a faixa debaixo do dedo e mostra onde a capa vai cair (a própria capa faz de marcador) */
  function hover(){
    var d=drag,el=document.elementFromPoint(d.x,d.y),zone=null;
    if(el){
      var row=el.closest(".tl-row,.tl-poolbox");
      zone=el.closest(".tl-drop")||(row&&row.querySelector(".tl-drop"));
    }
    [].forEach.call(root.querySelectorAll(".tl-over"),function(z){if(z!==zone)z.classList.remove("tl-over")});
    if(!zone)return;
    zone.classList.add("tl-over");
    var before=null,kids=zone.querySelectorAll(".tl-item");
    for(var i=0;i<kids.length;i++){
      var k=kids[i];if(k===d.it)continue;
      var r=k.getBoundingClientRect();
      if(d.y<r.top||(d.y<=r.bottom&&d.x<r.left+r.width/2)){before=k;break}
    }
    if(before){if(d.it.nextSibling!==before||d.it.parentNode!==zone)zone.insertBefore(d.it,before)}
    else if(d.it.parentNode!==zone||d.it.nextSibling)zone.appendChild(d.it);
  }
  /* perto da borda da tela, a página rola sozinha (importante no celular) */
  function autoScroll(){
    var d=drag;if(!d||!d.on)return;
    var edge=Math.min(90,innerHeight*.14),v=0;
    if(d.y<edge)v=-Math.ceil((edge-d.y)/6);else if(d.y>innerHeight-edge)v=Math.ceil((d.y-(innerHeight-edge))/6);
    if(v){scrollBy(0,v);hover()}
    d.raf=requestAnimationFrame(autoScroll);
  }
  function onUp(e){var d=drag;if(!d||e.pointerId!==d.pid)return;endDrag(e.type==="pointercancel")}
  function endDrag(cancel){
    var d=drag;drag=null;if(!d)return;
    clearTimeout(d.timer);
    if(!d.on)return; /* foi só um toque/clique: o evento click cuida */
    cancelAnimationFrame(d.raf);
    if(d.ghost)d.ghost.remove();
    d.it.classList.remove("tl-ph");document.documentElement.classList.remove("tl-dragging");
    [].forEach.call(root.querySelectorAll(".tl-over"),function(z){z.classList.remove("tl-over")});
    skipClick=true;setTimeout(function(){skipClick=false},50);
    if(cancel){d.from.insertBefore(d.it,d.next&&d.next.parentNode===d.from?d.next:null);say("Movimento cancelado.");return}
    counts();save();
    say(GAMES[d.id].name+" foi para "+tierName(d.it.parentNode.dataset.tier)+".");
  }
  board.addEventListener("pointerdown",onDown);
  window.addEventListener("pointermove",onMove,{passive:false});
  window.addEventListener("pointerup",onUp);
  window.addEventListener("pointercancel",onUp);
  /* enquanto arrasta com o dedo, a página não rola (o arrasto é que manda) */
  document.addEventListener("touchmove",function(e){if(drag&&drag.on)e.preventDefault()},{passive:false});
  board.addEventListener("contextmenu",function(e){if(e.target.closest(".tl-item"))e.preventDefault()});
  board.addEventListener("dragstart",function(e){e.preventDefault()});

  /* ---------- botões ---------- */
  $("tl-change").onclick=function(){history.pushState({},"","/tierlist/");showPick();pick.scrollIntoView({block:"start"})};
  $("tl-reset").onclick=function(){
    var placed=KEYS.some(function(k){return dropOf(k).querySelector(".tl-item")});
    if(placed&&!confirm("Voltar todos os jogos para a área de baixo?"))return;
    lsDel(storeKey());render(importState(null));clearSel();say("Tudo de volta para baixo. Pode recomeçar!");
  };
  $("tl-share").onclick=shareImage;
  window.addEventListener("popstate",function(){var s=slugFromUrl();if(s)openTheme(s,false);else showPick()});

  /* ---------- imagem para compartilhar (Canvas API, igual em qualquer aparelho) ---------- */
  var W=1080,PAD=44,LAB=132,GAP=10,COLS=4,TW=(W-PAD*2-LAB-GAP*2-GAP*(COLS-1))/COLS,TH=Math.round(TW*215/460);
  var logo=new Image();logo.src="/assets/icons/icon-192.png";
  var FONT_T='"Bricolage Grotesque","DM Sans",system-ui,sans-serif',FONT_B='"DM Sans",system-ui,sans-serif';
  if(document.fonts&&document.fonts.load){document.fonts.load('800 56px "Bricolage Grotesque"');document.fonts.load('700 28px "DM Sans"')}
  function rr(c,x,y,w,h,r){c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,r);else{c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}}
  function wrap(c,text,maxW,maxLines){
    var words=String(text).split(/\s+/),lines=[],cur="";
    words.forEach(function(w){var t=cur?cur+" "+w:w;if(c.measureText(t).width<=maxW||!cur)cur=t;else{lines.push(cur);cur=w}});
    if(cur)lines.push(cur);
    if(lines.length>maxLines){lines=lines.slice(0,maxLines);var l=lines[maxLines-1];while(l&&c.measureText(l+"…").width>maxW)l=l.slice(0,-1);lines[maxLines-1]=l.replace(/\s+$/,"")+"…"}
    return lines;
  }
  function ready(im){return im&&im.complete&&im.naturalWidth>0}
  function drawTile(c,g,x,y){
    c.save();rr(c,x,y,TW,TH,10);c.clip();
    var im=g.img&&IMGS[g.img];
    if(ready(im)){
      var s=Math.max(TW/im.naturalWidth,TH/im.naturalHeight),w=im.naturalWidth*s,h=im.naturalHeight*s;
      c.drawImage(im,x+(TW-w)/2,y+(TH-h)/2,w,h);
    }else{
      c.fillStyle="#2a2f75";c.fillRect(x,y,TW,TH);
      c.fillStyle="#f2f0ff";c.font="700 22px "+FONT_B;c.textAlign="center";c.textBaseline="middle";
      var ls=wrap(c,g.name,TW-20,3),lh=26;
      ls.forEach(function(l,i){c.fillText(l,x+TW/2,y+TH/2+(i-(ls.length-1)/2)*lh)});
    }
    c.restore();
  }
  function drawImage(){
    var st={};KEYS.forEach(function(k){st[k]=ids(dropOf(k)).map(function(id){return GAMES[id]})});
    var meas=document.createElement("canvas").getContext("2d");meas.font="800 54px "+FONT_T;
    var title=wrap(meas,"Minha tier list: "+THEME.title,W-PAD*2,2),HEAD=PAD+title.length*60+28;
    var rowH=KEYS.map(function(k){var n=Math.max(1,Math.ceil(st[k].length/COLS));return n*TH+(n-1)*GAP+GAP*2});
    var FOOT=118,H=HEAD+rowH.reduce(function(a,b){return a+b+GAP},0)+FOOT;
    var cv=document.createElement("canvas");cv.width=W;cv.height=H;var c=cv.getContext("2d");
    /* fundo */
    c.fillStyle="#0e1033";c.fillRect(0,0,W,H);
    c.fillStyle="#2433f0";c.fillRect(0,0,W,10);
    /* título */
    c.fillStyle="#f2f0ff";c.font="800 54px "+FONT_T;c.textBaseline="top";c.textAlign="left";
    title.forEach(function(l,i){c.fillText(l,PAD,PAD+i*60)});
    /* faixas */
    var y=HEAD;
    TIERS.forEach(function(t,i){
      var h=rowH[i];
      c.fillStyle="#15184a";rr(c,PAD,y,W-PAD*2,h,16);c.fill();
      c.fillStyle=t[1];rr(c,PAD,y,LAB,h,16);c.fill();c.fillRect(PAD+LAB-16,y,16,h);
      c.fillStyle="#0e1033";c.font="800 64px "+FONT_T;c.textAlign="center";c.textBaseline="middle";
      c.fillText(t[0],PAD+LAB/2,y+h/2+3);
      st[t[0]].forEach(function(g,j){drawTile(c,g,PAD+LAB+GAP+(j%COLS)*(TW+GAP),y+GAP+Math.floor(j/COLS)*(TH+GAP))});
      y+=h+GAP;
    });
    /* rodapé: logo + endereço do site */
    var fy=H-FOOT+30;
    if(ready(logo))c.drawImage(logo,PAD,fy,58,58);
    c.textAlign="left";c.textBaseline="middle";c.fillStyle="#f2f0ff";c.font="800 32px "+FONT_T;
    c.fillText("Nizzera Games",PAD+(ready(logo)?74:0),fy+29);
    c.textAlign="right";c.fillStyle="#ffd23f";c.font="700 26px "+FONT_B;
    c.fillText(SITE_URL,W-PAD,fy+29);
    return cv;
  }
  /* canvas -> arquivo sem esperar nada (toBlob é assíncrono e faria o celular negar o compartilhar) */
  function toFile(cv,name){
    var b64=cv.toDataURL("image/png").split(",")[1],bin=atob(b64),u=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    var blob=new Blob([u],{type:"image/png"});
    try{return new File([blob],name,{type:"image/png"})}catch(_){blob.name=name;return blob}
  }
  function download(file){
    var a=document.createElement("a");a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1500);
    say("Imagem baixada: "+file.name);
  }
  function shareImage(){
    if(!THEME)return;
    var placed=KEYS.some(function(k){return dropOf(k).querySelector(".tl-item")});
    if(!placed){say("Coloque pelo menos um jogo numa faixa antes de gerar a imagem.");return}
    var file;
    try{file=toFile(drawImage(),"tier-list-"+THEME.slug+".png")}catch(err){say("Não consegui gerar a imagem neste navegador.");return}
    var data={files:[file],title:"Minha tier list: "+THEME.title,text:"Minha tier list de "+THEME.title+" no Nizzera Games: https://"+SITE_URL+"/tierlist/?tema="+THEME.slug};
    /* celular: abre o compartilhar do sistema (WhatsApp, Instagram...). PC: baixa o PNG */
    var touch=matchMedia("(pointer:coarse)").matches;
    if(touch&&navigator.canShare&&navigator.share&&navigator.canShare({files:[file]})){
      navigator.share(data).then(function(){say("Imagem compartilhada!")},function(err){if(!err||err.name!=="AbortError")download(file);else say("")});
    }else download(file);
  }

  /* ---------- início ---------- */
  var first=slugFromUrl();
  loadThemes();
  if(first)openTheme(first,false);
})();
