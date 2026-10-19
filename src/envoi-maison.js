/* Bilans maison : partage choisi par la famille, puis import vérifié par l'enseignante. */
"use strict";
const EnvoiMaison = (() => {
  const {EPS, ep, esc, el, motsDefi, Donnees} = Banc;
  const FORMAT = "fluence/bilan-maison";
  const nom = v => {
    if(typeof v!=="string") throw new Error("Le prénom de l'enfant manque.");
    const s=v.normalize("NFC").trim().replace(/\s+/g," ");
    if(!s || s.length>80 || /[<>\x00-\x1f]/.test(s)) throw new Error("Vérifie le prénom de l'enfant.");
    return s;
  };
  function empreinte(id){
    const E=ep(id); if(!E) throw new Error("Ce texte n'existe pas dans cette version de Fluence.");
    let h=2166136261;
    for(const c of motsDefi(E).map(x=>x.t).join("\n")){ h^=c.charCodeAt(0);h=Math.imul(h,16777619); }
    return (h>>>0).toString(16).padStart(8,"0");
  }
  function normalise(r){
    if(!r || typeof r!=="object" || r.origine!=="maison" || !/^[a-zA-Z0-9_-]{8,80}$/.test(r.id||"")) throw new Error("Ce bilan maison n'est pas valide.");
    if(Object.hasOwn(r,"typeLecture") && !["entrainement","defi"].includes(r.typeLecture)) throw new Error("Le type de lecture n’est pas valide.");
    const E=ep(r.ep), date=new Date(r.date);
    if(!E || !Number.isFinite(date.getTime()) || date.getTime()>Date.now()+86400000) throw new Error("Le texte ou la date de ce bilan n'est pas valide.");
    const toks=motsDefi(E);
    if(!Number.isInteger(r.dernier) || r.dernier<0 || r.dernier>=toks.length || !toks[r.dernier].w || !Number.isFinite(r.secondes) || r.secondes<1 || r.secondes>60) throw new Error("La durée ou le dernier mot lu n'est pas valide.");
    if(!Array.isArray(r.fautes) || r.fautes.length>toks.length || r.fautes.some(i=>!Number.isInteger(i)||i<0||i>r.dernier||!toks[i].w) || new Set(r.fautes).size!==r.fautes.length) throw new Error("La liste des erreurs n'est pas valide.");
    const lus=toks.slice(0,r.dernier+1).filter(t=>t.w).length, erreurs=r.fautes.length;
    if(r.lus!==lus || r.erreurs!==erreurs) throw new Error("Les nombres de mots et d'erreurs ne correspondent pas au texte.");
    return {id:r.id,origine:"maison",prenom:nom(r.prenom),ep:E.id,titre:E.titre,date:date.toISOString(),secondes:r.secondes,dernier:r.dernier,fautes:r.fautes.slice().sort((a,b)=>a-b),lus,erreurs,mclm:Math.round((lus-erreurs)*60/r.secondes),...(Object.hasOwn(r,"typeLecture")?{typeLecture:r.typeLecture}:{})};
  }
  const paquet = r => { const bilan=normalise(r);return {format:FORMAT,version:1,texte:empreinte(bilan.ep),bilan}; };
  function code(d){ const bytes=new TextEncoder().encode(JSON.stringify(d)); let s="";bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
  function decode(s){ if(s.length>20000 || !/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("Le lien de bilan est incomplet.");const b=atob(s.replace(/-/g,"+").replace(/_/g,"/"));return JSON.parse(new TextDecoder().decode(Uint8Array.from(b,c=>c.charCodeAt(0)))); }
  function lit(texte){
    if(typeof texte!=="string" || new TextEncoder().encode(texte).length>30000) throw new Error("Le bilan doit faire moins de 30 Ko.");
    let d;try {const m=/[#&]bilan=([A-Za-z0-9_-]+)/.exec(texte);d=m?decode(m[1]):JSON.parse(texte);} catch(e){throw new Error("Colle le lien complet du bilan, ou choisis le fichier de bilan Fluence.");}
    if(!d || d.format!==FORMAT || d.version!==1) throw new Error("Ce fichier n'est pas un bilan maison Fluence.");
    const r=normalise(d.bilan);
    if(d.texte!==empreinte(r.ep)) throw new Error("Le texte a changé depuis cet entraînement. Garde le bilan du parent, sans l'importer dans cette version.");
    return r;
  }
  const base = () => Plateforme.Liaison.WEB();
  const idLocal = (sourceId,eleve)=>"maison:"+encodeURIComponent(eleve)+":"+sourceId;
  function lienParent(prenom=""){ const url=base();return url ? url+"#parents"+(prenom?"&prenom="+encodeURIComponent(nom(prenom)):"") : ""; }
  function prenomLien(){try {const p=new URLSearchParams(location.hash.slice(1)).get("prenom");return p?nom(p):"";}catch(e){return "";}}
  const texteBilan = r => `Fluence — ${Banc.libelleLecture(r)} à la maison\n${r.prenom} · ${r.titre}\n${new Date(r.date).toLocaleDateString("fr-FR")}\n${r.lus} mots lus, ${r.erreurs} erreur(s), ${r.secondes} secondes : ${r.mclm} mots corrects par minute.\nBilan déclaré par la famille.`;
  async function partage(r){
    const d=paquet(r), url=base()+"#bilan="+code(d), text=texteBilan(d.bilan), title="Bilan Fluence à la maison";
    if(Plateforme.partage){await Plateforme.partage.share({title,text,url});return {message:"Le partage est terminé. Le bilan reste disponible ici ; la réception n'est pas confirmée par Fluence."};}
    if(navigator.share){await navigator.share({title,text,url});return {message:"Le partage est terminé. Le bilan reste disponible ici ; la réception n'est pas confirmée par Fluence."};}
    if(navigator.clipboard?.writeText){try {await navigator.clipboard.writeText(text+"\n"+url);return {message:"Bilan et lien copiés. Colle-les dans ton message à l'enseignante, puis envoie ce message."};}catch(e){}}
    const blob=new Blob([JSON.stringify(d,null,2)],{type:"application/json"}), a=document.createElement("a"), fichier=URL.createObjectURL(blob);
    a.href=fichier;a.download=`Fluence-bilan-${d.bilan.ep}-${d.bilan.date.slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(fichier),30000);
    return {message:"Bilan téléchargé. Joins ce fichier à ton message dans l'ENT pour l'envoyer à l'enseignante."};
  }
  function ouvre(){
    if(Banc.ROLE==="parents") return;
    const existant=document.getElementById("maison-dialogue");if(existant){existant.focus();return;}
    const precedent=document.activeElement, voile=el("div",{class:"voile maison-voile"}), box=el("div",{class:"fenetre",id:"maison-dialogue",role:"dialog","aria-modal":"true","aria-label":"Accès parents et bilans maison",tabindex:"-1"}), viewport=window.visualViewport;
    let retireVue=()=>{},cadre=0;
    function ajusteFenetre(){
      for(const [cle,valeur] of Object.entries({vtop:viewport?.offsetTop||0,vleft:viewport?.offsetLeft||0,vwidth:viewport?.width||innerWidth,vheight:viewport?.height||innerHeight}))voile.style.setProperty("--maison-"+cle,valeur+"px");
      cancelAnimationFrame(cadre);cadre=requestAnimationFrame(()=>{const actif=document.activeElement;if(box.contains(actif)&&actif.matches("input,textarea,select"))actif.scrollIntoView({block:"nearest",inline:"nearest"});});
    }
    function ferme(){retireVue();cancelAnimationFrame(cadre);document.removeEventListener("keydown",clavier);window.removeEventListener("resize",ajusteFenetre);viewport?.removeEventListener("resize",ajusteFenetre);viewport?.removeEventListener("scroll",ajusteFenetre);voile.remove();if(precedent?.isConnected)precedent.focus({preventScroll:true});}
    function clavier(e){
      if(e.key==="Escape"){e.preventDefault();ferme();}
      if(e.key==="Tab"){const actifs=[...box.querySelectorAll('button:not([disabled]),a[href],input:not([hidden]),select,textarea')].filter(x=>x.offsetParent!==null),premier=actifs[0],dernier=actifs.at(-1);if(!premier)return;
        if(e.shiftKey&&(document.activeElement===premier||document.activeElement===box)){e.preventDefault();dernier.focus();}else if(!e.shiftKey&&(document.activeElement===dernier||document.activeElement===box)){e.preventDefault();premier.focus();}}
    }
    voile.appendChild(box);document.body.appendChild(voile);retireVue=vue(box,ferme);document.addEventListener("keydown",clavier);window.addEventListener("resize",ajusteFenetre);viewport?.addEventListener("resize",ajusteFenetre);viewport?.addEventListener("scroll",ajusteFenetre);ajusteFenetre();box.focus({preventScroll:true});
  }
  function ajouteBouton(box){
    if(Banc.ROLE==="parents") return;
    const b=el("button",{class:"btn",type:"button",id:"acces-parents"},"Accès parents et bilans maison");
    b.onclick=ouvre;box.insertBefore(b,box.firstChild?.nextSibling||null);
  }
  function vue(box,retour){
    if(Banc.ROLE==="parents") return;
    const eleves=Donnees.eleves();
    box.innerHTML=`<div class="row start maison-dialogue-entete"><button class="btn" id="maison-retour">Retour</button><h1 style="font-size:clamp(24px,3vw,36px)">À la maison</h1></div>
      <section class="card" id="maison-cloud" style="margin-top:16px"></section>
      <section class="card" style="margin-top:16px"><h2>Accès de lecture sans lien personnel</h2><p>Ce lien commun permet de lire, d'imprimer les textes et de s'entraîner. Pour recevoir automatiquement les bilans, crée un lien personnel dans l'espace privé ci-dessus.</p>
      <label for="maison-invitation" class="label">Lien commun ou prénom prérempli</label><select class="sel" id="maison-invitation"><option value="">Lien commun, prénom à saisir</option>${eleves.map(e=>`<option value="${esc(e.id)}">${esc(e.nom)}</option>`).join("")}</select>
      <div class="row start" style="margin-top:12px"><button class="btn primary" id="maison-partage">Partager le lien parents</button><button class="btn" id="maison-copie">Copier le lien</button><a class="btn" id="maison-ouvrir" target="_blank" rel="noopener">Ouvrir l'accès parents</a></div>
      <input id="maison-url" aria-label="Lien destiné aux parents" readonly style="width:100%;margin-top:12px"><p id="maison-partage-info" role="status"></p></section>
      <section class="card" style="margin-top:16px"><h2>Ajouter un bilan reçu</h2><p>Colle le lien reçu dans le message du parent, ou ouvre son fichier de bilan. Tu vérifieras l'élève avant d'enregistrer.</p>
      <textarea id="maison-importe" aria-label="Lien ou contenu du bilan reçu" rows="3" style="width:100%;max-width:100%"></textarea><div class="row start" style="margin-top:10px"><button class="btn" id="maison-lit">Vérifier le bilan</button><button class="btn" id="maison-fichier">Ouvrir un fichier de bilan</button><input id="maison-file" type="file" accept=".json,application/json" hidden></div><p id="maison-info" role="status"></p><div id="maison-apercu"></div></section>
      <section class="card" style="margin-top:16px"><h2>Bilans maison enregistrés</h2><p class="muted">Déclarés par les familles. Ces bilans sont séparés des essais et records réalisés en classe.</p><div id="maison-resultats"></div></section>`;
    box.querySelector("#maison-retour").onclick=()=>retour?retour():Banc.vueEleves(box);
    const selection=box.querySelector("#maison-invitation"), champ=box.querySelector("#maison-url"), statut=box.querySelector("#maison-partage-info");
    function actualiseLien(){champ.value=lienParent(eleves.find(e=>e.id===selection.value)?.nom||"");box.querySelector("#maison-ouvrir").href=champ.value;}
    selection.onchange=actualiseLien;actualiseLien();
    box.querySelector("#maison-copie").onclick=async()=>{try {await navigator.clipboard.writeText(champ.value);statut.textContent="Lien parents copié.";}catch(e){champ.focus();champ.select();statut.textContent="Sélectionne puis copie le lien affiché.";}};
    box.querySelector("#maison-partage").onclick=async()=>{try {const d={title:"Fluence à la maison",text:"Voici l'accès pour s'entraîner à la lecture à la maison. Les bilans peuvent être envoyés par l'ENT ou par message.",url:champ.value};if(Plateforme.partage)await Plateforme.partage.share(d);else if(navigator.share)await navigator.share(d);else {box.querySelector("#maison-copie").click();return;}statut.textContent="Lien proposé au partage.";}catch(e){statut.textContent=e?.name==="AbortError"?"Partage annulé.":"Le partage n'a pas abouti. Tu peux copier le lien.";}};
    const info=box.querySelector("#maison-info"), apercu=box.querySelector("#maison-apercu");
    function apercuBilan(texte){
      apercu.innerHTML="";
      try {const r=lit(texte);info.textContent="Bilan prêt à vérifier. Rien n'est encore enregistré.";
        apercu.innerHTML=`<h3>${esc(r.prenom)} — ${esc(r.titre)}</h3><p>${Banc.libelleLecture(r)}</p><p>${esc(new Date(r.date).toLocaleDateString("fr-FR"))} · ${r.lus} mots lus · ${r.erreurs} erreur(s) · ${r.secondes} secondes · <b>${r.mclm} mots/min</b></p><label class="label" for="maison-eleve">Associer à l'élève de la classe</label><select class="sel" id="maison-eleve"><option value="">Choisir l'élève…</option>${Donnees.eleves().map(e=>`<option value="${esc(e.id)}">${esc(e.nom)}</option>`).join("")}</select><div class="row start" style="margin-top:12px"><button class="btn primary" id="maison-confirme">Ajouter au suivi maison</button><button class="btn" id="maison-annule">Annuler</button></div>`;
        const sel=apercu.querySelector("#maison-eleve"), correspond=Donnees.eleves().filter(e=>e.nom.normalize("NFC").toLocaleLowerCase("fr")===r.prenom.toLocaleLowerCase("fr"));
        if(correspond.length===1) sel.value=correspond[0].id;
        apercu.querySelector("#maison-annule").onclick=()=>{apercu.innerHTML="";info.textContent="Import annulé.";};
        apercu.querySelector("#maison-confirme").onclick=async e=>{
          const eleve=Donnees.eleve(sel.value);if(!eleve){info.textContent="Choisis l'élève de la classe.";return;}
          const id=idLocal(r.id,eleve.id);
          if(Donnees.contientResultat(id)||Donnees.contientBilan(r.id)){info.textContent="Ce bilan a déjà été importé (ou supprimé). Aucun doublon ajouté.";return;}
          const bouton=e.currentTarget;bouton.disabled=true;
          const record={...r,id,sourceId:r.id,eleve:eleve.id,nomDeclare:r.prenom};delete record.prenom;
          if(!await Donnees.ajoute(record)){bouton.disabled=false;info.textContent="Impossible d'enregistrer le bilan. Réessaie.";return;}
          apercu.innerHTML="";info.textContent="Bilan ajouté au suivi maison. Les essais de classe sont inchangés.";afficheResultats();
        };
      }catch(e){info.textContent=e.message||"Ce bilan n'est pas valide.";}
    }
    box.querySelector("#maison-lit").onclick=()=>apercuBilan(box.querySelector("#maison-importe").value);
    const fichier=box.querySelector("#maison-file");box.querySelector("#maison-fichier").onclick=()=>fichier.click();
    fichier.onchange=async()=>{const f=fichier.files[0];if(!f)return;try {if(f.size>30000)throw new Error("Le bilan doit faire moins de 30 Ko.");apercuBilan(await f.text());}catch(e){info.textContent=e.message;}finally{fichier.value="";}};
    function afficheResultats(){const cible=box.querySelector("#maison-resultats"),rs=Donnees.essaisMaison().slice().reverse();
      cible.innerHTML=rs.length?`<ul class="maison-bilans-liste">${rs.map(r=>`<li class="maison-bilan-enregistre"><div class="maison-bilan-identite"><h3>${esc(Donnees.nom(r.eleve))}</h3><time datetime="${esc(r.date)}">${esc(new Date(r.date).toLocaleDateString("fr-FR"))}</time></div><p class="maison-bilan-texte">${esc(ep(r.ep)?.titre||r.ep)}</p><p class="maison-bilan-type">${Banc.libelleLecture(r)}</p><div class="maison-bilan-pied"><dl class="maison-bilan-mesures"><div><dt>Mots/min</dt><dd>${esc(r.mclm)}</dd></div><div><dt>Erreurs</dt><dd>${esc(r.erreurs)}</dd></div></dl><button class="btn danger" data-maison-supprime="${esc(r.id)}">Supprimer</button></div></li>`).join("")}</ul>`:`<p class="muted">Aucun bilan maison importé pour l'instant.</p>`;
      cible.querySelectorAll("[data-maison-supprime]").forEach(b=>b.onclick=async()=>{if(!b.dataset.confirme){b.dataset.confirme="1";b.textContent="Confirmer ?";return;}b.disabled=true;if(await Donnees.supprime(b.dataset.maisonSupprime))afficheResultats();else{b.disabled=false;info.textContent="Impossible de supprimer le bilan. Réessaie.";}});
    }
    afficheResultats();
    const arreteDonnees=Donnees.surChange(q=>{if((q==="resultats"||q==="classe")&&box.isConnected)afficheResultats();});
    const arreteCloud=MaisonCloud.vue(box.querySelector("#maison-cloud"));
    const partageRecu=/#bilan=|&bilan=/.test(location.hash);
    if(partageRecu){const recu=location.href;history.replaceState(null,"",location.pathname+location.search);box.querySelector("#maison-importe").value=recu;apercuBilan(recu);}
    return ()=>{arreteDonnees();arreteCloud();};
  }
  function recoitLien(){if(Banc.ROLE==="parents" || !/[#&]bilan=/.test(location.hash))return;ouvre();}
  return {partage,lit,paquet,empreinte,lienParent,prenomLien,idLocal,ajouteBouton,vue,ouvre,recoitLien};
})();
window.EnvoiMaison=EnvoiMaison;
