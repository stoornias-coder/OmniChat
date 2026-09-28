// Vérification du filtre contextHint : exécute les VRAIES fonctions extraites de index.html (vm, hors navigateur).
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(process.argv[2]||'index.html','utf8');
const grab=(startRx,endMarker)=>{const i=src.search(startRx);if(i<0)throw new Error('introuvable '+startRx);const j=src.indexOf(endMarker,i);return src.slice(i,j);};
const code=[
  grab(/const _FUZZY_GEO_TABLE\s*=/,'const _FUZZY_FAMILY_RX'),          // tables + cues
  grab(/const _FUZZY_NAME_STOP/,'// Un résultat est "pertinent"'),      // stop + _getFuzzyContext
  grab(/function _previousUserMessageForSearch/,'// contextHint (message précédent)'),
  grab(/const _CTXHINT_QUESTION_RX/,'// Retourne { text, sources }'),
].join('\n');
const ctx={chatHistory:[],console};vm.createContext(ctx);vm.runInContext(code,ctx);
const run=(hist,cur)=>{ctx.chatHistory=[...hist.map(c=>({role:'user',content:c})),{role:'user',content:cur}];return vm.runInContext('_contextHintForSearch('+JSON.stringify(cur)+')',ctx);};
const FUZ1="Je cherche un film coréen des années 2000 avec Robin, patron de l'héroïne, qui parle anglais.";
const P1="Je cherche un film coréen des années 2000 avec un personnage masculin nommé Robin.";
const A_ORIG="Un film coréen, le personnage masculin principal s'appelle Robin, il est le patron de l'héroïne et il parle souvent anglais. Je crois que c'est un film des années 2000, je ne me souviens plus du titre…";
const cases=[
 ['A  précise après fuzzy',             [FUZ1],"Qui joue Robin dans Seducing Mr. Perfect ?",false],
 ['A2 message A d\'origine',            [A_ORIG],"Qui joue Robin dans Seducing Mr. Perfect ?",false],
 ['A3 Quel acteur… Stranger Things',    [FUZ1],"Quel acteur joue Robin dans Stranger Things ?",false],
 ['A4 Dis-moi qui joue…',               [FUZ1],"Dis-moi qui joue Robin dans Seducing Mr. Perfect ?",false],
 ['B  Groq après film quelconque',      ["Tu as vu le film Inception ?"],"Quels sont les modèles Groq disponibles gratuitement actuellement ?",false],
 ['B2 Groq après fuzzy',                [FUZ1],"Quels sont les modèles Groq disponibles gratuitement actuellement ?",false],
 ['C  suivi déclaratif rôle/langue',    [P1],"Il est le patron de l'héroïne et parle souvent anglais.",true],
 ['C2 Robin était le patron',           [P1],"Robin était le patron de l'héroïne.",true],
 ['C3 film coréen pas un drama',        [P1],"C'est un film coréen, pas un drama.",true],
 ['C4 personnage parlait anglais',      [P1],"Le personnage parlait souvent anglais.",true],
 ['C5 question mais « dans ce film »',  [FUZ1],"Qui joue Robin dans ce film coréen ?",true],
 ['G  suivi générique court',           ["Parle-moi de Groq"],"et le prix ?",true],
 ['G2 précis indépendant, prev banal',  ["Bonjour, ça va ?"],"Quelle est la météo à Paris demain ?",false],
 ['G3 sans message précédent',          [],"Quels sont les modèles Groq gratuits ?",false],
 ['G4 message long, prev non fuzzy',    ["Parle-moi de Groq"],"Compare les tarifs de Groq et de Mistral pour Llama 3",false],
];
let ko=0;for(const [lab,h,c,want] of cases){const got=run(h,c)!==undefined;const ok=got===want;if(!ok)ko++;console.log((ok?'✔':'✘'),lab.padEnd(38),'contextHint envoyé =',String(got).padEnd(5),'(attendu',want+')');}
console.log(ko?`\n${ko} ÉCHEC(S)`:'\nTous les cas conformes');process.exit(ko?1:0);
