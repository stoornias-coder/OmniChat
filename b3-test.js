// b3-test.js — tests B3 (pipeline de recherche commun). Usage : node b3-test.js <fichier.html> <label>
// jsdom indisponible hors-ligne : Chromium/Playwright (voir harness.js). Le HTML n'est jamais modifié (espion en mémoire).
// LIMITE ASSUMÉE : core/search/webSearch.js (backend) n'est pas disponible ici. /api/search est SIMULÉ ; ces tests prouvent
// le ROUTAGE et la FIDÉLITÉ du frontend, pas la qualité du fuzzy/Stage A/ranking du vrai backend.
const {open}=require('./harness');const fs=require('fs');
const file=process.argv[2],label=process.argv[3]||file;
const rows=[];const T=(id,desc,ok,info)=>rows.push([id,ok?'PASS':'FAIL',desc,info||'']);
const has=(s,x)=>String(s).includes(x);
const BE_OK=`(b,h)=>({json:{ok:true,text:'[1] Titre Exemple\\nhttps://exemple.org/a\\nRESULTAT_BACKEND_555',sources:[{title:'Titre Exemple',url:'https://exemple.org/a',snippet:'NE_DOIT_PAS_PASSER'}],queries:[{query:'q1'}]}})`;
const BE_SRC=[{title:'Titre Exemple',url:'https://exemple.org/a'}];
const TV_OK=`(b)=>({results:[{title:'LOCAL',url:'https://local.example/x',content:'contenu local '+(b.query||'')}]})`;
const CANON={text:'CANON_TEST_123 : fiche établie au tour 1.',sources:[{title:'Ancienne',url:'https://exemple.org/old'}]};
(async()=>{
 const {br,page,G,errs}=await open(file);
 await G(`window.__t=0`);
 async function run(o){
  const hist=[].concat(o.prev?[{role:'user',content:o.prev},{role:'assistant',content:'ok'}]:[],[{role:'user',content:o.msg}]);
  await G(`modes.rp=${!!o.rp}; rpActiveId=${o.charId?JSON.stringify(o.charId):'null'}; rpActiveUniId=${o.uniId?JSON.stringify(o.uniId):'null'}; rpChars=${JSON.stringify(o.chars||[])}; rpUniverses=${JSON.stringify(o.unis||[])}; webMode=${JSON.stringify(o.webMode||'auto')}; tavilyKey='tvly-testkey-123456'; chatHistory=${JSON.stringify(hist)};`);
  await page.evaluate(([c,rw])=>{window._rpCanonData=c;window.__rewrite=rw;window.__cap.search.length=0;window.__cap.tavily.length=0;window.__cap.groqRewrite.length=0;window.__cap.groqChat.length=0;},[o.canon||null,o.rewrite||'']);
  await G('window.__searchImpl='+(o.backend||'null')+';window.__tavilyImpl='+(o.tavily||'null')+';');
  await G(`window.__spy=[];(function(){const r=window.buildSystemPrompt;if(!r.__isSpy){const s=function(){window.__spy.push([].slice.call(arguments));return r.apply(this,arguments)};s.__isSpy=true;window.buildSystemPrompt=s;}})()`);
  await page.evaluate(([f,m])=>(async()=>{try{await (0,eval)(f)(m);}catch(e){window.__lastErr=e.message}})(),[o.fn||'callGroq',o.msg]);
  return page.evaluate(()=>{const a=window.__spy[window.__spy.length-1]||[];const wc=a[1]||null;
   return {search:window.__cap.search,tavily:window.__cap.tavily.length,tavilyBodies:window.__cap.tavily.map(t=>t.body),rewrites:window.__cap.groqRewrite.length,
    wc:wc?{text:wc.text,sources:wc.sources,failed:!!wc.failed,error:wc.error}:null,canonArg:a[6]||null,
    canonStored:window._rpCanonData||null,canonIsWc:!!wc&&window._rpCanonData===wc,isRPLookupCanon:!!wc&&!!window._rpCanonData&&window._rpCanonData.text===wc.text,
    sys:window.__cap.groqChat.length?String(window.__cap.groqChat[window.__cap.groqChat.length-1].messages[0].content):''};});
 }
 const Q_LOOKUP="Peux-tu chercher sur internet des infos sur la série Titre Exemple ?";
 const Q_STANDALONE="Qui joue Robin dans Titre Exemple ?";
 const Q_AUTO="Quelle est la météo à Paris aujourd'hui ?";
 const CH=[{id:'c1',name:'Perso',fandom:'Fandom Test'}], UN=[{id:'u1',name:'Univers Test'}];
 const routed=(id,d,r,extra)=>T(id,d,r.search.length===1&&r.tavily===0&&/\/api\/search$/.test(r.search[0].url)&&!!r.wc&&r.wc.text.includes('RESULTAT_BACKEND_555')&&(extra?extra(r):true),`search=${r.search.length} tavilyDirect=${r.tavily} rewrites=${r.rewrites}`);
 for(const fn of ['callGroq','callGroqStream']){
  const s=fn==='callGroq'?'':'s';
  // ---- ROUTAGE : chaque mode passe par /api/search, sans Tavily direct
  let r=await run({fn,rp:true,msg:Q_LOOKUP,backend:BE_OK,tavily:TV_OK});
  routed('R-libre'+s,`RP libre (modes.rp seul) + lookup → /api/search, 0 appel Tavily direct [${fn}]`,r,x=>x.search[0].body.text===Q_LOOKUP&&x.search[0].body.contextHint===undefined);
  r=await run({fn,rp:false,charId:'c1',chars:CH,msg:Q_LOOKUP,backend:BE_OK,tavily:TV_OK});
  routed('R-fiche'+s,`RP fiche/personnage (rpActiveId seul) + lookup → /api/search, 0 Tavily direct ; ancre fandom via contextHint [${fn}]`,r,x=>x.search[0].body.contextHint==='Fandom Test'&&x.search[0].body.text===Q_LOOKUP);
  r=await run({fn,rp:false,uniId:'u1',unis:UN,msg:Q_LOOKUP,backend:BE_OK,tavily:TV_OK});
  routed('R-univers'+s,`RP univers actif (rpActiveUniId seul) + lookup → /api/search ; ancre univers via contextHint [${fn}]`,r,x=>x.search[0].body.contextHint==='Univers Test');
  r=await run({fn,rp:true,uniId:'u1',unis:UN,msg:"Peux-tu chercher sur internet des infos sur Univers Test ?",backend:BE_OK,tavily:TV_OK});
  routed('R-univers-sans-ancre'+s,`RP univers, ancre déjà dans le message → pas de contextHint superflu [${fn}]`,r,x=>x.search[0].body.contextHint===undefined);
  r=await run({fn,rp:true,uniId:'u1',unis:UN,msg:Q_STANDALONE,backend:BE_OK,tavily:TV_OK});
  routed('R-univers-standalone'+s,`RP univers + question précise autonome → ancre NON injectée (pas de contamination) [${fn}]`,r,x=>x.search[0].body.contextHint===undefined);
  r=await run({fn,rp:true,uniId:'u1',unis:UN,msg:"Il y a un vieux film coréen dont je ne me souviens plus du titre, cherche sur le web",backend:BE_OK,tavily:TV_OK});
  routed('R-univers-fuzzy'+s,`RP univers + identification floue → ancre NON injectée (œuvre inconnue) [${fn}]`,r,x=>x.search[0].body.contextHint===undefined);
  r=await run({fn,rp:true,msg:Q_AUTO,webMode:'auto',backend:BE_OK,tavily:TV_OK}); // RP+auto sans canon : bloqué par le garde-fou de routage existant
  T('R-rp-auto-garde'+s,`RP + AUTO, requête sans œuvre identifiable : garde-fou de routage existant inchangé (aucune recherche) [${fn}]`,r.search.length===0&&r.tavily===0,`search=${r.search.length}`);
  r=await run({fn,rp:false,msg:Q_LOOKUP,webMode:'auto',backend:BE_OK,tavily:TV_OK});
  routed('R-auto-lookup'+s,`AUTO hors RP (lookup) → /api/search [${fn}]`,r,x=>x.search[0].body.text===Q_LOOKUP);
  r=await run({fn,rp:false,msg:Q_AUTO,webMode:'auto',backend:BE_OK,tavily:TV_OK});
  routed('R-auto-auto'+s,`AUTO hors RP (déclencheur factuel) → /api/search, requête non dénaturée [${fn}]`,r,x=>x.search[0].body.text===Q_AUTO&&x.search[0].body.rewritten===undefined);
  r=await run({fn,rp:true,msg:Q_LOOKUP,webMode:'auto',backend:BE_OK,tavily:TV_OK});
  routed('R-auto-rp'+s,`AUTO en RP (lookup déclenché) → /api/search [${fn}]`,r);
  r=await run({fn,rp:false,msg:Q_AUTO,webMode:'web',backend:BE_OK,tavily:TV_OK});
  routed('R-web'+s,`WEB forcé hors RP → /api/search [${fn}]`,r);
  r=await run({fn,rp:true,msg:Q_LOOKUP,webMode:'web',backend:BE_OK,tavily:TV_OK});
  routed('R-web-rp'+s,`WEB forcé en RP → /api/search [${fn}]`,r);
  // ---- REQUÊTE NON DÉNATURÉE (RP)
  r=await run({fn,rp:true,msg:"Je veux faire un RP de la série Titre Exemple",backend:BE_OK,tavily:TV_OK});
  const bodies=JSON.stringify(r.search.map(x=>x.body));
  T('Q-rp-brut'+s,`RP : aucun mot-clé arbitraire ajouté (« characters / relationships / synopsis / episode 1 ») ni suffixe « cast » [${fn}]`,r.search.length===1&&!/characters|relationships|synopsis|episode 1|cast /i.test(bodies)&&r.search[0].body.text==="Je veux faire un RP de la série Titre Exemple",bodies.slice(0,140));
  T('Q-header'+s,`clé Tavily envoyée en en-tête (jamais dans le corps) [${fn}]`,r.search.length===1&&r.search[0].headers['X-Tavily-Key']==='tvly-testkey-123456'&&!/tvly-testkey/.test(bodies));
  // ---- CANON + SOURCES
  r=await run({fn,rp:true,msg:Q_LOOKUP,backend:BE_OK,tavily:TV_OK});
  T('C-alim'+s,`RP lookup réussi : _rpCanonData alimenté par le résultat du pipeline, format {text,sources} inchangé [${fn}]`,r.canonIsWc&&Object.keys(r.canonStored).sort().join()==='sources,text'&&r.canonStored.text.includes('RESULTAT_BACKEND_555'));
  T('S-fidele'+s,`sources = exactement celles renvoyées par le backend (title+url seulement, aucun champ ajouté) [${fn}]`,JSON.stringify(r.wc.sources)===JSON.stringify(BE_SRC),JSON.stringify(r.wc.sources));
  r=await run({fn,rp:true,msg:Q_LOOKUP,backend:`(b)=>({json:{ok:true,text:'[1] X\\nhttps://exemple.org/z\\nSEUL_TEXTE',sources:[]}})`,tavily:TV_OK});
  T('S-aucune'+s,`backend sans source : le frontend n'en fabrique pas (sources vides) [${fn}]`,r.wc&&r.wc.sources.length===0&&r.tavily===0);
  // ---- ÉCHECS
  r=await run({fn,rp:true,msg:Q_LOOKUP,canon:CANON,backend:`(b)=>({json:{ok:true,text:'',sources:[]}})`,tavily:`(b)=>({results:[]})`});
  T('E-vide'+s,`RP + backend sans résultat exploitable : pas de source inventée, canon existant conservé et transmis [${fn}]`,r.wc&&!r.wc.failed&&r.wc.sources.length===0&&r.canonStored.text===CANON.text&&r.canonArg&&r.canonArg.text===CANON.text,`wc=${JSON.stringify(r.wc).slice(0,80)}`);
  r=await run({fn,rp:true,msg:Q_LOOKUP,canon:CANON,backend:`(b)=>({status:500,json:{}})`,tavily:`(b)=>{throw new Error('Tavily erreur 500')}`});
  T('E-technique'+s,`RP + backend HTTP 500 + repli local en échec : failed:true, 0 source, texte vide, erreur jamais présentée comme donnée, canon conservé [${fn}]`,r.wc&&r.wc.failed===true&&r.wc.text===''&&r.wc.sources.length===0&&!has(r.sys,'Tavily erreur')&&r.canonStored.text===CANON.text&&r.canonArg&&r.canonArg.text===CANON.text,JSON.stringify(r.wc).slice(0,90));
  r=await run({fn,rp:true,msg:Q_LOOKUP,canon:null,backend:`(b)=>({throw:'réseau coupé'})`,tavily:`(b)=>{throw new Error('Tavily erreur 500')}`});
  T('E-sans-canon'+s,`RP + tout en échec + aucun canon : aucune donnée factuelle, aucun canon créé [${fn}]`,r.wc&&r.wc.failed&&r.wc.sources.length===0&&r.canonStored===null&&!has(r.sys,'CANON DE L\'ŒUVRE')&&!has(r.sys,'DONNÉES FACTUELLES DE RÉFÉRENCE'));
  r=await run({fn,rp:true,msg:Q_LOOKUP,backend:`(b)=>({status:500,json:{}})`,tavily:TV_OK});
  T('E-repli'+s,`REPLI (backend HS) : le moteur local ne sert qu'en secours — 1 tentative /api/search PUIS Tavily local [${fn}]`,r.search.length===1&&r.tavily>=1,`search=${r.search.length} tavilyLocal=${r.tavily}`);
  // ---- HORS RP : régression
  r=await run({fn,rp:false,msg:Q_LOOKUP,backend:BE_OK,tavily:TV_OK});
  T('H-horsrp'+s,`hors RP : chemin inchangé (1 appel /api/search, texte utilisateur brut, pas de canon stocké) [${fn}]`,r.search.length===1&&r.tavily===0&&r.search[0].body.text===Q_LOOKUP&&r.canonStored===null&&r.wc.text.includes('RESULTAT_BACKEND_555'));
  r=await run({fn,rp:false,msg:Q_LOOKUP,backend:`(b)=>({status:500,json:{}})`,tavily:TV_OK});
  T('H-horsrp-repli'+s,`hors RP + backend HS : repli local comme avant [${fn}]`,r.search.length===1&&r.tavily>=1&&r.wc&&!r.wc.failed);
 }
 // ---- FUZZY / cas réel (le backend est simulé : on prouve la transmission et la fidélité, pas son classement)
 const ROBIN="Un film coréen des années 2000, le personnage masculin principal s'appelle Robin, il est le patron de l'héroïne et parle souvent anglais…";
 const GOOD={title:'Seducing Mr. Perfect (2006) - Korean film',url:'https://exemple.org/good',content:'2006 Korean romantic comedy. Male lead Daniel (Robin) is the boss of the heroine and speaks English.'};
 const FAKE1={title:'Robin Hood (2010) - American film',url:'https://exemple.org/fake1',content:'2010 American action film about Robin Hood.'};
 const FAKE2={title:'Mr. Perfect (2015) Korean drama',url:'https://exemple.org/fake2',content:'2015 Korean drama, unrelated plot.'};
 // backend simulé = ce que le pipeline (Stage A/année/indices) est CENSÉ retenir : uniquement le bon candidat
 const BE_ROBIN=`(b)=>({json:{ok:true,text:'[1] ${GOOD.title}\\n${GOOD.url}\\n${GOOD.content}',sources:[{title:${JSON.stringify(GOOD.title)},url:${JSON.stringify(GOOD.url)}}],queries:[{query:'x'}]}})`;
 for(const [mode,o] of [['non-RP AUTO',{rp:false,webMode:'auto'}],['RP libre WEB',{rp:true,webMode:'web'}],['RP univers WEB',{rp:false,uniId:'u1',unis:UN,webMode:'web'}]]){
  const r=await run({...o,msg:ROBIN,rewrite:'korean 2000s movie male lead named Robin boss speaks English',backend:BE_ROBIN,tavily:TV_OK});
  const b=r.search[0]&&r.search[0].body;
  T('F-robin-route '+mode,`Robin [${mode}] : requête envoyée à /api/search avec le texte utilisateur INTACT (tous les indices) + requête optimisée séparée`,r.search.length===1&&r.tavily===0&&b.text===ROBIN&&b.rewritten==='korean 2000s movie male lead named Robin boss speaks English'&&r.rewrites===1,`rewrites=${r.rewrites} ctx=${b&&b.contextHint}`);
  T('F-robin-fidelite '+mode,`Robin [${mode}] : le bon candidat retenu par le backend est repris tel quel ; aucun faux candidat ajouté par le frontend`,r.wc&&r.wc.text.includes('Seducing Mr. Perfect (2006)')&&!has(r.wc.text,'Robin Hood (2010)')&&!has(r.wc.text,'Mr. Perfect (2015)')&&JSON.stringify(r.wc.sources)===JSON.stringify([{title:GOOD.title,url:GOOD.url}]));
 }
 {const r=await run({rp:false,webMode:'auto',msg:ROBIN,rewrite:'korean 2000s movie male lead named Robin boss speaks English',backend:`(b)=>({json:{ok:true,text:'[1] ${GOOD.title}\\n${GOOD.url}\\n${GOOD.content}\\n\\n[2] ${FAKE1.title}\\n${FAKE1.url}\\n${FAKE1.content}',sources:[{title:${JSON.stringify(GOOD.title)},url:${JSON.stringify(GOOD.url)}},{title:${JSON.stringify(FAKE1.title)},url:${JSON.stringify(FAKE1.url)}}]}})`,tavily:TV_OK});
  T('F-robin-passthrough','le frontend ne ré-ordonne, ne filtre et ne promeut aucun résultat (ordre backend conservé : le classement/filtrage appartient au backend)',r.wc&&r.wc.sources.length===2&&r.wc.sources[0].url===GOOD.url&&r.wc.sources[1].url===FAKE1.url&&r.wc.text.indexOf(GOOD.title)<r.wc.text.indexOf(FAKE1.title));}
 {// aucune connaissance du cas dans le code envoyé : les seuls mots-clés propres au cas viennent du message de l'utilisateur
  const r=await run({rp:true,webMode:'web',msg:"Un film coréen des années 2000, le patron de l'héroïne parle souvent anglais",rewrite:'',backend:BE_OK,tavily:TV_OK});
  const bodies=JSON.stringify(r.search.map(x=>x.body));
  T('F-no-hardcode','message SANS « Robin » : rien de « Robin / Seducing / Henney / Mr. Perfect » ne apparaît dans la requête envoyée',r.search.length===1&&!/Robin|Seducing|Henney|Perfect/i.test(bodies),bodies.slice(0,120));}
 {const r=await run({rp:true,webMode:'web',msg:"Un film coréen des années 2000, le patron de l'héroïne parle souvent anglais",backend:BE_OK,tavily:TV_OK});
  T('F-no-hardcode-prompt','message SANS « Robin » : rien de « Robin / Seducing / Henney / Mr. Perfect » ne apparaît dans le prompt système de production',r.sys.length>0&&!/Robin|Seducing|Henney|Mr\.? Perfect/i.test(r.sys),`len=${r.sys.length}`);}
 // ---- AST hardcoding (identique b2)
 const acorn=require('/home/claude/.npm-global/lib/node_modules/ts-node/node_modules/acorn');const src=fs.readFileSync(file,'utf8');
 const lines=src.split('\n');const blocks=[];let st=null;
 lines.forEach((l,i)=>{if(/^<script>\s*$/.test(l))st=i+1;else if(l.trim()==='</script>'&&st!==null){blocks.push(lines.slice(st,i).join('\n'));st=null;}});
 const RX=/Robin|Seducing|Henney|Mr\.\s*Perfect/i;const hits=[];
 blocks.forEach((b,k)=>{const ast=acorn.parse(b,{ecmaVersion:'latest',locations:true});
  const walk=n=>{if(!n||typeof n.type!=='string')return;
   if(n.type==='Literal'&&typeof n.value==='string'&&RX.test(n.value))hits.push('bloc'+(k+1)+':'+n.loc.start.line);
   if(n.type==='TemplateElement'&&RX.test(n.value.cooked||n.value.raw))hits.push('bloc'+(k+1)+':'+n.loc.start.line);
   for(const key in n){const v=n[key];if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v.type==='string')walk(v);}};walk(ast);});
 T('H1','aucune occurrence Robin/Seducing/Henney/Mr. Perfect dans les chaînes/templates de production (AST, tous blocs)',hits.length===0,hits.join(','));
 await br.close();
 console.log('##### '+label+' #####');
 for(const r of rows)console.log(r[0].padEnd(24),r[1],'|',r[2].slice(0,150),r[3]?'| '+r[3]:'');
 const p=rows.filter(r=>r[1]==='PASS').length;
 console.log('PASS:',p,'/',rows.length,'| erreurs page:',errs.length,errs.slice(0,2).join(' || '));
 process.exit(0);
})();
