/* Guide local pour ajouter l’accès personnel à l’écran d’accueil. */
"use strict";
const ParentsInstallation = (() => {
  let contexte="", lienSession="", dialogue=null, retourFocus=null, vu=false, arreteAnimation=null;
  const cle=()=>"fluence-installation-parents-v1:"+contexte;
  const lienPersonnel=()=>{
    const p=new URLSearchParams(location.hash.slice(1)),t=p.get("famille");
    return Banc.ROLE==="parents"&&p.has("parents")&&p.getAll("famille").length===1&&/^[a-f0-9]{64}$/.test(t||"")?t:"";
  };
  const autonome=()=>navigator.standalone===true||window.matchMedia?.("(display-mode: standalone)").matches||window.matchMedia?.("(display-mode: fullscreen)").matches;
  const ios=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent)||/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1;
  const mobile=()=>ios()||/Android/i.test(navigator.userAgent);
  const autorise=()=>!!contexte&&!!lienSession&&lienPersonnel()===lienSession&&mobile()&&!Plateforme.NATIF&&!autonome()&&/^https?:$/.test(location.protocol);

  function memorise(){
    vu=true;
    try{localStorage.setItem(cle(),"vu");}catch(e){}
  }
  function ferme({memoriser=true}={}){
    if(memoriser&&autorise())memorise();
    arreteAnimation?.();arreteAnimation=null;
    if(dialogue){const ancien=dialogue;dialogue=null;ancien.close();ancien.remove();}
    if(retourFocus?.isConnected)retourFocus.focus({preventScroll:true});
    retourFocus=null;
  }
  function ouvre(avecEtapes=false,origine=null){
    if(!autorise()||dialogue)return;
    retourFocus=origine||document.activeElement;
    const d=document.createElement("dialog");dialogue=d;d.id="maison-installation";d.className="maison-installation";
    d.setAttribute("aria-labelledby","maison-installation-titre");
    d.innerHTML=`<div class="maison-installation-contenu">
      <img class="maison-installation-logo" alt="" width="88" height="88">
      <p class="label">Fluence à la maison</p>
      <h1 id="maison-installation-titre" tabindex="-1">Un accès facile depuis votre téléphone</h1>
      <p class="maison-installation-intro">Ajoutez une icône sur votre écran d’accueil pour retrouver les textes et les progrès de votre enfant.</p>
      <p class="maison-installation-prive">Ce lien et cette icône sont personnels. Gardez-les pour votre famille.</p>
      <button class="btn primary" type="button" id="maison-installer">Ajouter à l’écran d’accueil</button>
      <section id="maison-installation-etapes" aria-labelledby="maison-installation-mode" hidden>
        <h2 id="maison-installation-mode" tabindex="-1"></h2>
        <div id="maison-installation-animation"></div>
        <details class="maison-installation-ecrit"><summary>Voir les étapes écrites</summary><ol></ol></details>
        <p class="muted" id="maison-installation-aide"></p>
        <button class="btn" type="button" id="maison-installation-copier">Copier mon lien personnel</button>
        <p id="maison-installation-message" role="status"></p>
      </section>
      <button class="btn" type="button" id="maison-installation-continuer">Continuer sans installer</button>
      <p class="maison-installation-note">Vous pouvez aussi utiliser Fluence directement dans cette page.</p>
    </div>`;
    d.querySelector("img").src=document.querySelector("#home-link img")?.src||"icones/icone-192.png";
    const etapes=d.querySelector("#maison-installation-etapes"),titre=d.querySelector("#maison-installation-mode"),liste=etapes.querySelector("ol"),aide=d.querySelector("#maison-installation-aide");
    const apple=ios();
    titre.textContent=apple?"Tutoriel animé sur iPhone ou iPad":"Tutoriel animé sur Android";
    const instructions=apple?[
      "Dans Safari, touchez le menu de la page, puis Partager (le carré avec une flèche vers le haut).",
      "Faites défiler le menu, puis touchez « Sur l’écran d’accueil ».",
      "Vérifiez que « Ouvrir comme app web » est activé si cette option apparaît, puis touchez « Ajouter »."
    ]:[
      "Ouvrez le menu de Chrome (les trois points).",
      "Choisissez « Ajouter à l’écran d’accueil ». Si Chrome propose « Installer et créer un raccourci », choisissez ensuite « Créer un raccourci ».",
      "Touchez « Ajouter », puis confirmez l’ajout à l’écran d’accueil (parfois « Add to home screen »). Gardez l’adresse personnelle de cette page."
    ];
    instructions.forEach(texte=>{const li=document.createElement("li");li.textContent=texte;liste.appendChild(li);});
    aide.textContent=apple?"Selon Safari, Partager peut être directement visible. Depuis une messagerie, ouvrez ce même lien dans Safari.":"Les libellés varient selon Chrome. Depuis une messagerie, ouvrez ce même lien dans Chrome. Le raccourci peut ouvrir Chrome.";
    const montreEtapes=()=>{
      etapes.hidden=false;d.classList.add("maison-installation-guide");d.setAttribute("aria-labelledby","maison-installation-mode");d.querySelector("#maison-installer").hidden=true;
      if(!arreteAnimation)arreteAnimation=window.InstallationAnimation?.monte(d.querySelector("#maison-installation-animation"),{systeme:apple?"ios":"android"})||null;
      titre.focus({preventScroll:true});d.scrollTop=0;
    };
    d.querySelector("#maison-installer").onclick=montreEtapes;
    d.querySelector("#maison-installation-copier").onclick=async()=>{
      if(!autorise())return;
      const info=d.querySelector("#maison-installation-message");
      try{
        if(!navigator.clipboard?.writeText)throw new Error("Presse-papiers indisponible");
        await navigator.clipboard.writeText(location.href);
        if(dialogue===d&&autorise())info.textContent="Lien copié. Collez-le dans "+(apple?"Safari":"Chrome")+", puis suivez les étapes ci-dessus.";
      }catch(e){if(dialogue===d)info.textContent="La copie n’est pas disponible ici. Faites un appui long sur le lien reçu de l’enseignante pour le copier.";}
    };
    d.querySelector("#maison-installation-continuer").onclick=()=>ferme();
    d.addEventListener("cancel",e=>{e.preventDefault();ferme();});
    document.body.appendChild(d);d.showModal();
    if(avecEtapes)montreEtapes();else d.querySelector("h1").focus({preventScroll:true});
  }
  function ajouteAcces(view){
    if(!autorise()||view.querySelector("#maison-guide-installation"))return;
    const bouton=document.createElement("button");bouton.type="button";bouton.id="maison-guide-installation";bouton.className="maison-guide-installation";
    bouton.textContent="Ajouter Fluence à l’écran d’accueil";bouton.onclick=()=>ouvre(true,bouton);
    view.querySelector("h1")?.after(bouton);
  }
  function demarre(options={}){
    if(Banc.ROLE!=="parents"||Plateforme.NATIF)return;
    contexte=/^[a-f0-9]{64}$/.test(options.contexte||"")?options.contexte:"";
    lienSession=lienPersonnel();
    if(!autorise())return;
    const view=document.querySelector("#view");if(view)ajouteAcces(view);
    try{vu=localStorage.getItem(cle())==="vu";}catch(e){vu=false;}
    if(!vu&&mobile())ouvre();
  }
  window.addEventListener("hashchange",()=>{if(lienSession&&lienPersonnel()!==lienSession){ferme({memoriser:false});contexte="";lienSession="";}});
  return {demarre,ajouteAcces};
})();
window.ParentsInstallation=ParentsInstallation;
