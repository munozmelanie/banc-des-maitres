/* Captures réelles : le repère indique où toucher dans son propre navigateur. */
"use strict";
const InstallationAnimation = (() => {
  const doigt='<svg class="animation-doigt" viewBox="0 0 32 40" aria-hidden="true"><path d="M10 20V6a3 3 0 0 1 6 0v10-2a3 3 0 0 1 6 0v3a3 3 0 0 1 5 2v7c0 5-3 10-8 10h-2c-3 0-5-2-7-4L4 24a3 3 0 0 1 5-3l1 1Z" fill="#fff" stroke="#25364B" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  // Coordonnées en pourcentage de la capture entière, relevées sur les vrais pixels.
  const etapes={
    ios:[
      {src:"img/installation-ios-1.png",legende:"Touchez le menu de la page.",x:26,y:94},
      {src:"img/installation-ios-2.png",legende:"Touchez Partager.",x:66,y:54.05},
      {src:"img/installation-ios-3.png",legende:"Faites défiler le menu, puis touchez « Sur l’écran d’accueil ».",x:80,y:74.5},
      {src:"img/installation-ios-4.png",legende:"Laissez « Ouvrir comme app web » activé.",x:88,y:32.6,verifie:true},
      {src:"img/installation-ios-5.png",legende:"Touchez Ajouter.",x:85,y:10.9}
    ],
    android:[
      {src:"img/installation-android-1.png",legende:"Ouvrez le menu de Chrome (⋮).",x:93.89,y:9.15},
      {src:"img/installation-android-2.png",legende:"Touchez Ajouter à l’écran d’accueil.",x:68.52,y:82.91},
      {src:"img/installation-android-3.png",legende:"Dans Créer un raccourci, touchez Ajouter.",x:82.04,y:60.60},
      {src:"img/installation-android-4.png",legende:"Touchez « Add to home screen » (Ajouter à l’écran d’accueil).",x:77.04,y:93.59}
    ]
  };
  function monte(hote,{systeme="ios"}={}){
    systeme=systeme==="android"?"android":"ios";
    const captures=etapes[systeme],reduction=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const [largeur,hauteur]=systeme==="ios"?[1320,2868]:[1080,2340];
    let etape=0,timer=null,vivant=true,imageCourante=null,joue=!reduction?.matches&&!document.hidden;
    const box=document.createElement("div");box.className="installation-animation";box.dataset.installationAnimation=systeme;box.dataset.frameCount=captures.length;
    box.innerHTML=`<figure class="animation-apercu" data-animation-preview>
      <figcaption class="animation-demo-titre"><strong>Tutoriel animé</strong><span>${systeme==="ios"?"Safari sur iPhone":"Chrome sur Android"}</span></figcaption>
      <p class="animation-reproduire">Regardez, puis reproduisez les gestes sur votre téléphone.</p>
      <div class="animation-capture" aria-hidden="true"></div>
      <p class="animation-erreur" role="status" hidden>Cette capture ne s’est pas chargée. Vous pouvez consulter les étapes écrites ci-dessous.</p>
      <div class="animation-legende"><span class="animation-numero"></span><p data-animation-caption></p></div>
    </figure>
    <div class="animation-commandes"><button class="btn" type="button" data-animation-prev aria-label="Étape précédente">←</button><button class="btn" type="button" data-animation-play></button><button class="btn" type="button" data-animation-next aria-label="Étape suivante">→</button></div>
    <div class="animation-etapes" aria-label="Choisir une étape"></div>`;
    const ecran=box.querySelector(".animation-capture"),erreur=box.querySelector(".animation-erreur"),caption=box.querySelector("[data-animation-caption]"),numero=box.querySelector(".animation-numero"),play=box.querySelector("[data-animation-play]"),choix=box.querySelector(".animation-etapes");
    const arreteTimer=()=>{clearTimeout(timer);timer=null;};
    function programme(){arreteTimer();if(vivant&&joue&&!document.hidden&&box.isConnected&&imageCourante?.complete&&imageCourante.naturalWidth>0)timer=setTimeout(()=>{timer=null;etape=(etape+1)%captures.length;dessine();},3500);}
    function dessine(){
      if(!vivant)return;
      arreteTimer();
      box.dataset.frame=etape;box.dataset.playing=String(joue);
      box.dataset.loaded="false";erreur.hidden=true;
      const capture=captures[etape];
      const cible=Number.isFinite(capture.x)&&Number.isFinite(capture.y);
      ecran.innerHTML=cible?`<span class="animation-repere${capture.x>80?" animation-repere-gauche":""}${capture.verifie?" animation-repere-verification":""}" data-animation-target style="left:${capture.x}%;top:${capture.y}%"><span class="animation-anneau"></span>${capture.verifie?"":doigt}</span>`:"";
      const img=document.createElement("img");imageCourante=img;img.alt="";img.draggable=false;img.width=largeur;img.height=hauteur;
      let chargee=false;
      const prete=()=>{if(chargee||!vivant||imageCourante!==img||!img.isConnected||!img.complete||!img.naturalWidth)return;chargee=true;box.dataset.loaded="true";programme();};
      img.onload=prete;
      img.onerror=()=>{if(!vivant||imageCourante!==img)return;pause();erreur.hidden=false;};
      ecran.prepend(img);img.src=capture.src;
      caption.textContent=capture.legende;numero.textContent=`${etape+1}/${captures.length}`;
      play.textContent=joue?"Pause":"Lire l’animation";play.setAttribute("aria-label",joue?"Mettre l’animation en pause":"Lire l’animation");
      choix.querySelectorAll("button").forEach((b,i)=>b.setAttribute("aria-current",i===etape?"step":"false"));
      prete();
    }
    function pause(){if(!vivant)return;joue=false;arreteTimer();box.dataset.playing="false";play.textContent="Lire l’animation";play.setAttribute("aria-label","Lire l’animation");}
    function va(i){if(!vivant)return;joue=false;etape=(i+captures.length)%captures.length;dessine();}
    captures.forEach((capture,i)=>{const b=document.createElement("button");b.type="button";b.className="animation-etape";b.dataset.animationStep=i;b.textContent=i+1;b.setAttribute("aria-label",`Étape ${i+1} : ${capture.legende}`);b.onclick=()=>va(i);choix.appendChild(b);});
    box.querySelector("[data-animation-prev]").onclick=()=>va(etape-1);
    box.querySelector("[data-animation-next]").onclick=()=>va(etape+1);
    play.onclick=()=>{if(joue)pause();else if(!document.hidden){joue=true;dessine();}};
    const visibilite=()=>{if(document.hidden)pause();},reduit=()=>{if(reduction?.matches)pause();};
    document.addEventListener("visibilitychange",visibilite);window.addEventListener("pagehide",pause);window.addEventListener("hashchange",pause);reduction?.addEventListener?.("change",reduit);
    hote.appendChild(box);dessine();
    return ()=>{vivant=false;joue=false;imageCourante=null;arreteTimer();box.dataset.playing="false";document.removeEventListener("visibilitychange",visibilite);window.removeEventListener("pagehide",pause);window.removeEventListener("hashchange",pause);reduction?.removeEventListener?.("change",reduit);box.remove();};
  }
  return {monte};
})();
window.InstallationAnimation=InstallationAnimation;
