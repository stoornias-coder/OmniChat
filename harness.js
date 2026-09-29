// Harnais commun B3 (Playwright/Chromium — jsdom indisponible hors-ligne). Le fichier HTML n'est jamais modifié :
// une copie en mémoire est servie avec un espion sur l'original de buildSystemPrompt (comme b2-test).
const {chromium}=require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs=require('fs');
const SPY_SRC='const _origBuildSystemPrompt = buildSystemPrompt;';
const INIT=`
 window.__cap={search:[],tavily:[],groqChat:[],groqRewrite:[],other:[]};
 window.__searchImpl=null;      // (body,headers)=>({status,json})  ; null => 503
 window.__tavilyImpl=null;
 window.__rewrite='';
 window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 window.IntersectionObserver=window.ResizeObserver;
 window.requestIdleCallback=f=>setTimeout(f,1);
 window.scrollTo=()=>{};
 window.pdfjsLib={GlobalWorkerOptions:{}};
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:null}})},from:()=>({select:()=>Promise.resolve({data:[],error:null})}),rpc:async()=>({data:null,error:null})})};
 const J=(o,st=200)=>({ok:st>=200&&st<300,status:st,json:async()=>o,text:async()=>JSON.stringify(o)});
 window.fetch=async(url,opts)=>{const u=String(url);let body={};try{body=JSON.parse(opts&&opts.body)}catch(e){}
  const headers=(opts&&opts.headers)||{};
  if(u.includes('/api/search')){window.__cap.search.push({url:u,body,headers});
    if(!window.__searchImpl)return J({},503);
    const r=window.__searchImpl(body,headers);if(r&&r.throw)throw new Error(r.throw);return J(r.json,r.status||200);}
  if(u.includes('api.tavily.com')){window.__cap.tavily.push({url:u,body});
    if(!window.__tavilyImpl)return J({results:[]});return J(window.__tavilyImpl(body));}
  if(u.includes('api.groq.com')){
   if(body.max_tokens===60){window.__cap.groqRewrite.push(body);return J({choices:[{message:{content:window.__rewrite||''}}]});}
   window.__cap.groqChat.push(body);
   if(body.stream){const enc=new TextEncoder();const ch=['data: {"choices":[{"delta":{"content":"ok"}}]}\\n\\n','data: [DONE]\\n\\n'];let i=0;
    return{ok:true,status:200,body:{getReader:()=>({read:async()=>i<ch.length?{done:false,value:enc.encode(ch[i++])}:{done:true},cancel(){}})},json:async()=>({})};}
   return J({choices:[{message:{content:'{}'}}]});}
  if(u.includes('/health'))return J({});
  window.__cap.other.push(u);return J({},0);};
`;
async function open(file){
  let html=fs.readFileSync(file,'utf8');
  if(html.split(SPY_SRC).length!==2) throw new Error('ancre espion introuvable');
  html=html.replace(SPY_SRC,'const _origBuildSystemPrompt = (function(f){return function(){window.__origArgs=[].slice.call(arguments);return f.apply(this,arguments);};})(buildSystemPrompt);');
  const br=await chromium.launch();const ctx=await br.newContext({viewport:{width:400,height:800}});const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
  await ctx.route('**/*',r=>{const u=r.request().url();
   if(u==='https://localhost/')return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
   return r.abort();});
  await page.addInitScript(INIT);
  await page.goto('https://localhost/',{waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,2500));
  const G=code=>page.evaluate(c=>(0,eval)(c),code);
  await G("tavilyKey='tvly-testkey-123456'; groqKey='gsk_testkey_123456';");
  return {br,page,G,errs};
}
module.exports={open};
