/* Accès conservés sur Android : aucun secret dans le manifest envoyé à WebAPK.
   Ce module précède Plateforme, qui fixe le rôle dès son chargement. */
"use strict";
const ParentsAcces = (() => {
  const CLE="fluence-parents-acces-v1", MAX=20;
  const QR="Rouvrez le QR code ou le lien personnel transmis par l’enseignante.";
  const natif=()=>{try{return !!window.Capacitor?.isNativePlatform?.();}catch(e){return true;}};
  const android=()=>/Android/i.test(navigator.userAgent)&&["https:","http:"].includes(location.protocol)&&!natif();
  const parametres=()=>new URLSearchParams(location.hash.slice(1));
  const parent=p=>p.getAll("parents").length===1&&p.get("parents")==="";
  const prenom=v=>{
    if(typeof v!=="string")throw Error();
    const s=v.normalize("NFC").trim().replace(/\s+/g," ");
    if(s.length>80||/[<>\x00-\x1f\x7f]/.test(s))throw Error();
    return s;
  };
  function lien(p=parametres()){
    if(!parent(p)||p.getAll("famille").length!==1||!/^[a-f0-9]{64}$/.test(p.get("famille")||"")||p.getAll("prenom").length>1||["tel","ecran","bilan","access_token","refresh_token"].some(k=>p.has(k)))return null;
    try{return {token:p.get("famille"),prenom:prenom(p.get("prenom")||"")};}catch(e){return null;}
  }
  function lit(){
    const texte=localStorage.getItem(CLE);if(texte===null)return [];
    if(texte.length>16000)throw Error();
    const d=JSON.parse(texte);
    if(!d||d.version!==1||!Array.isArray(d.acces)||d.acces.length>MAX)throw Error();
    const vus=new Set();
    return d.acces.map(a=>{
      if(!a||typeof a!=="object"||Array.isArray(a)||Object.keys(a).some(k=>!["token","prenom"].includes(k))||typeof a.token!=="string"||!/^[a-f0-9]{64}$/.test(a.token)||vus.has(a.token))throw Error();
      vus.add(a.token);return {token:a.token,prenom:prenom(a.prenom)};
    });
  }
  function fragment(a){
    const p=new URLSearchParams();p.set("parents","");p.set("famille",a.token);
    if(a.prenom)p.set("prenom",a.prenom);
    return "#"+p.toString();
  }
  function restaure(a){history.replaceState(null,"",location.pathname+location.search+fragment(a));}
  function memorise(){
    if(!android())return {ok:false,message:""};
    const a=lien();
    if(!a)return {ok:false,message:"Ce lien personnel est incomplet. "+QR};
    try{
      const acces=lit(),i=acces.findIndex(x=>x.token===a.token);
      if(i<0){if(acces.length>=MAX)throw Error();acces.push(a);}else acces[i]=a;
      const texte=JSON.stringify({version:1,acces});
      localStorage.setItem(CLE,texte);
      if(localStorage.getItem(CLE)!==texte)throw Error();
      return {ok:true,message:"Cet accès est conservé sur ce téléphone."};
    }catch(e){return {ok:false,message:"Cet accès ne peut pas être conservé sur ce téléphone. "+QR+" Cela ne modifie pas les lectures déjà enregistrées."};}
  }

  let choix=null;
  if(android()){
    const p=parametres();
    // Le manifest public est commun à toutes les familles, même si le lien reçu
    // contient un prénom ou un secret. Le manifest iPhone/enseignante reste intact.
    if(/[#&]parents\b/.test(location.hash)){
      const manifest=document.querySelector('link[rel="manifest"]');
      if(manifest)manifest.setAttribute("href","parents.webmanifest");
    }
    const personnel=lien(p);
    if(personnel)memorise();
    if(/[#&]parents\b/.test(location.hash)&&p.has("app")&&!personnel){
      const lancement=parent(p)&&p.getAll("app").length===1&&p.get("app")==="1"&&[...p.keys()].length===2;
      if(!lancement)choix={acces:[],erreur:"L’adresse d’ouverture est incomplète. "+QR};
      else{
        try{
          const acces=lit();
          if(acces.length===1)restaure(acces[0]);
          else choix={acces,erreur:acces.length?"":QR};
        }catch(e){choix={acces:[],erreur:"Les accès de ce téléphone ne peuvent pas être relus. "+QR};}
      }
    }
  }
  function afficheChoix(view){
    if(!choix||!android()||!/[#&]parents\b/.test(location.hash)||!view)return false;
    document.getElementById("app-tel").hidden=true;
    const app=document.getElementById("app-ecran");app.hidden=false;
    app.querySelector(".bar").hidden=true;
    document.title="Fluence à la maison";
    const section=document.createElement("section");section.className="card";section.id="maison-choix-acces";
    const titre=document.createElement("h1");titre.tabIndex=-1;
    titre.textContent=choix.acces.length?"Quel enfant ouvre Fluence ?":"Ouvrir l’accès de votre enfant";
    section.appendChild(titre);
    const aide=document.createElement("p");aide.id="maison-choix-info";aide.setAttribute("role","status");
    aide.textContent=choix.erreur||"Choisissez l’enfant pour retrouver ses textes et ses progrès.";
    section.appendChild(aide);
    choix.acces.forEach((a,i)=>{
      const bouton=document.createElement("button");bouton.type="button";bouton.className="btn primary";
      bouton.dataset.accesChoix=String(i);bouton.textContent=a.prenom||"Accès "+(i+1);
      bouton.style.cssText="display:flex;width:100%;margin-top:12px";
      bouton.onclick=()=>{
        // Un autre onglet peut avoir modifié le stockage depuis l'ouverture.
        try{
          const courant=lit().find(x=>x.token===a.token);
          if(!courant)throw Error();
          restaure(courant);location.reload();
        }catch(e){aide.textContent="Cet accès ne peut pas être rouvert. "+QR;}
      };
      section.appendChild(bouton);
    });
    const note=document.createElement("p");note.className="muted";
    note.textContent="Les lectures déjà enregistrées sur ce téléphone sont conservées.";
    section.appendChild(note);view.replaceChildren(section);titre.focus({preventScroll:true});
    // Un nouveau QR/lien peut arriver dans cette même fenêtre, avant Parents.
    window.addEventListener("hashchange",()=>location.reload(),{once:true});
    return true;
  }
  return {memorise,afficheChoix};
})();
window.ParentsAcces=ParentsAcces;
