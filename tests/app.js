// Tests de l'appli assemblée (www/), dans Chromium :
//  1. l'écran de la classe seul : épisodes, élèves, mots, voix et surligneur, écho, défi d'une minute, progrès, sauvegarde ;
//  2. le téléphone relié par un relais local : code tapé, télécommande, défi mené depuis le téléphone,
//     résultats recopiés sur l'écran, puis un ordinateur remis à zéro qui retrouve tout auprès du téléphone ;
//  3. Tamallette P2 : voix de T1, lecture sans voix de T2 à T6, aucun emplacement d'image, défis séparés du feuilleton ;
//  4. un téléphone neuf partage le lien puis retrouve un ordinateur neuf ; partage, annulation et copie ;
//  5. petits écrans : pas de défilement horizontal.
// Usage : python3 outils/build.py && npm test
const { chromium } = require("playwright");
const path = require("path"), os = require("os"), fs = require("fs");
const { site, relais } = require("./serveurs");
const CAPT = path.join(__dirname, "captures"); fs.mkdirSync(CAPT, { recursive: true });
const attends = async (fn, ms, msg) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error("délai dépassé : " + msg); };
const lecteurAuDebut = () => {
  const audio = document.querySelector("#audio");
  return audio.paused && audio.currentTime < 0.15 && document.querySelector("#pno").textContent === "Titre" && !document.querySelector("#txt .w.on, #txt .s.echo") && document.querySelector("#echobar").hidden;
};
const lecturePremierePage = () => {
  const audio = document.querySelector("#audio"), texte = Banc.ep(Ecran.route().id);
  return !audio.paused && /^Page 1 \/ /.test(document.querySelector("#pno").textContent) && !!document.querySelector("#txt .w.on") && audio.currentTime < texte.pages[1].a + 3;
};
let ok = 0; const vrai = (c, m) => { if (!c) throw new Error("ÉCHEC : " + m); ok++; console.log("  ✓", m); };

(async () => {
  const { serveur, base } = await site();
  const R = await relais();
  const Q = "?relais=" + encodeURIComponent("nostr:" + R.url);
  const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const erreurs = [];
  const ouvre = async (ctx, url, tel) => { const p = await ctx.newPage(); await p.setViewportSize(tel ? { width: 390, height: 844 } : { width: 1366, height: 768 });
    p.on("pageerror", e => erreurs.push((tel ? "tel" : "écran") + " : " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/WebSocket|Failed to load resource/.test(m.text())) erreurs.push((tel ? "tel" : "écran") + " : " + m.text()); });
    await p.goto(url); return p; };
  try {
    console.log("1. L'écran de la classe");
    const ctxE = await b.newContext();
    let tbi = await ouvre(ctxE, base + Q + "#ecran");
    await attends(() => tbi.evaluate(() => document.querySelectorAll(".ep").length === 13), 5000, "accueil");
    vrai(await tbi.evaluate(() => [...document.querySelectorAll(".chip.ok")].filter(c => c.textContent === "Voix enregistrée").length) === 8, "les 7 épisodes et T1 ont leur voix");
    await tbi.screenshot({ path: path.join(CAPT, "1-accueil.png") });
    await tbi.click("[data-go=students]"); await tbi.fill("#n0", "Test A"); await tbi.fill("#g0", "70"); await tbi.fill("#n1", "Test B"); await tbi.click("#sv");
    await attends(() => tbi.evaluate(() => Banc.Donnees.eleves()[0].nom === "Test A"), 3000, "élèves enregistrés");
    vrai(true, "les prénoms et les objectifs s'enregistrent");
    await tbi.click("[data-go=home]"); await tbi.click(".ep >> nth=0");
    await attends(() => tbi.evaluate(() => document.querySelector("#wd").textContent === "préau"), 3000, "mots");
    await tbi.click("#wn"); vrai(await tbi.evaluate(() => document.querySelector("#wd").textContent === "aperçoit"), "les mots à préparer défilent");
    await tbi.click(".step >> nth=1");
    await tbi.click("#play");
    await attends(() => tbi.evaluate(() => { const a = document.querySelector("#audio"); return !a.paused && a.currentTime > 1.6; }), 6000, "lecture");
    vrai(await tbi.evaluate(() => { const a = document.querySelector("#audio"), v = +document.querySelector("#speed [aria-pressed=true]").dataset.v; return a.readyState >= 2 && v === 0.8 && a.playbackRate === v && a.defaultPlaybackRate === v; }), "E1 : après chargement, la voix joue à la vitesse 0,8 affichée");
    await attends(() => tbi.evaluate(() => !!document.querySelector("#txt .w.on")), 3000, "surligneur");
    vrai(await tbi.evaluate(() => document.querySelector("#pno").textContent === "Page 1 / 5"), "« Écouter » passe du titre à la page 1 et la voix démarre");
    vrai(await tbi.evaluate(() => /Dans|la|cour|de|l’école/.test(document.querySelector("#txt .w.on").textContent)), "le surligneur suit les premiers mots (" + await tbi.evaluate(() => document.querySelector("#txt .w.on").textContent) + ")");
    await tbi.screenshot({ path: path.join(CAPT, "2-lecture.png") });
    await tbi.evaluate(() => { const E = Banc.ep("E1"); document.querySelector("#audio").currentTime = E.pages[1].b - 0.4; });
    await attends(() => tbi.evaluate(() => document.querySelector("#pno").textContent === "Page 2 / 5"), 4000, "page suivante");
    vrai(true, "la page se tourne toute seule à la fin de la page");
    await tbi.click("#play"); // pause
    await tbi.click(".step >> nth=2"); await tbi.click("#next"); await tbi.click("#play");
    await attends(() => tbi.evaluate(() => !document.querySelector("#echobar").hidden), 15000, "fin de la première phrase");
    vrai(await tbi.evaluate(() => document.querySelector("#audio").paused && !!document.querySelector(".s.echo")), "l'écho s'arrête après une phrase et attend la classe");
    await tbi.click("#enext");
    await attends(() => tbi.evaluate(() => document.querySelectorAll(".s")[1].classList.contains("echo")), 3000, "phrase suivante");
    vrai(true, "« Phrase suivante » fait entendre la deuxième phrase");
    await tbi.evaluate(() => document.querySelector("#audio").pause());
    for (const [depart, cible] of [[1,2], [2,3], [3,1]]){
      await tbi.click(`.step >> nth=${depart}`); await tbi.click("#next"); await tbi.click("#next"); await tbi.click("#play");
      await attends(() => tbi.evaluate(() => !!document.querySelector("#txt .w.on") && document.querySelector("#audio").currentTime > Banc.ep("E1").pages[2].a + 0.1), 5000, "lecture avancée avant changement de mode");
      await tbi.click(`.step >> nth=${cible}`);
      vrai(await tbi.evaluate(lecteurAuDebut), `écran : passer de l'étape ${depart + 1} à ${cible + 1} remet voix, page et surlignage au début, en pause`);
      await tbi.click("#play");
      await attends(() => tbi.evaluate(lecturePremierePage), 5000, "reprise au début du texte");
      vrai(true, "écran : la nouvelle écoute commence à la première page, sans reprendre l'ancien passage");
    }

    await tbi.evaluate(() => history.replaceState(null, "", location.pathname + location.search + "#essai-rapide"));
    await tbi.click("[data-go=home]"); await tbi.click(".ep >> nth=0"); await tbi.click(".step >> nth=4");
    await tbi.click("#who button >> nth=0"); await tbi.click("#go");
    for (const k of [3, 7, 12]) await tbi.click(`#txt .w >> nth=${k}`);
    await attends(() => tbi.evaluate(() => /dernier mot/.test(document.querySelector("#hint").textContent)), 10000, "fin du temps");
    await tbi.click("#txt .w >> nth=40");
    await attends(() => tbi.evaluate(() => !document.querySelector("#res").hidden), 3000, "résultat");
    const r1 = await tbi.evaluate(() => Banc.Donnees.essais()[0]);
    vrai(r1 && r1.lus === 41 && r1.erreurs === 3 && Math.abs(r1.mclm - 38 * 60 / r1.secondes) < 6, `défi sur l'écran : 41 mots lus, 3 erreurs en ${r1.secondes} s → ${r1.mclm} mots/min`);
    vrai(await tbi.evaluate(() => /Premier essai/.test(document.querySelector("#res").textContent) && /Mots à retravailler/.test(document.querySelector("#res").textContent)), "le résultat montre « Premier essai ! » et les mots à retravailler");
    await tbi.screenshot({ path: path.join(CAPT, "3-defi.png") });
    await tbi.click(".step >> nth=5"); await tbi.screenshot({ path: path.join(CAPT, "4-progres-episode.png") });

    console.log("2. Le téléphone relié");
    const code = await tbi.evaluate(() => Plateforme.Liaison.code());
    vrai(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(code), "l'écran crée son code de liaison (" + code + ")");
    await tbi.click("#b-tel");
    vrai(await tbi.evaluate(() => !!document.querySelector("#lier .qr svg")), "« Relier le téléphone » montre le QR code et le code");
    await tbi.screenshot({ path: path.join(CAPT, "5-relier.png") });
    vrai(await tbi.evaluate(() => decodeURIComponent(Plateforme.Liaison.lienTel()).includes("#lien=")), "le QR code contient le lien de la télécommande");
    await tbi.click("#lier-ok");
    const ctxT = await b.newContext({ hasTouch: true, isMobile: true });
    let tel = await ouvre(ctxT, base + Q, true);
    await attends(() => tel.evaluate(() => !!document.querySelector("#t-code-in")), 4000, "écran de liaison du téléphone");
    vrai(await tel.evaluate(() => document.documentElement.dataset.role === "tel"), "sur un petit écran, l'appli s'ouvre en télécommande");
    await tel.fill("#t-code-in", code.toLowerCase().replace("-", " ")); await tel.click("#t-code button");
    await attends(() => tel.evaluate(() => document.querySelector("#t-lien-txt").textContent === "Écran relié"), 15000, "téléphone relié");
    await attends(() => tbi.evaluate(() => document.querySelector("#b-tel-txt").textContent === "Téléphone relié"), 10000, "pastille de l'écran");
    vrai(true, "le code tapé (même en minuscules) relie le téléphone et l'écran");
    vrai(await tel.evaluate(() => location.hash.includes("lien=")), "l'adresse du téléphone garde le lien (pour l'écran d'accueil)");
    await attends(() => tel.evaluate(() => Banc.Donnees.eleves()[0].nom === "Test A"), 10000, "classe recopiée");
    await attends(() => tel.evaluate(() => Banc.Donnees.essais().length === 1), 10000, "résultat recopié");
    vrai(true, "le téléphone reçoit la classe et le résultat déjà enregistrés");
    await tbi.click("[data-go=home]");
    await attends(() => tel.evaluate(() => document.querySelectorAll("[data-ep]").length === 13), 8000, "textes sur le téléphone");
    await tel.click("[data-ep=E2]");
    await attends(() => tbi.evaluate(() => Ecran.route().id === "E2" && Ecran.route().step === 0), 6000, "l'écran ouvre E2");
    vrai(true, "toucher un épisode sur le téléphone l'ouvre sur l'écran");
    await attends(() => tel.evaluate(() => !!document.querySelector("[data-clic=wn]")), 6000, "boutons des mots");
    await tel.click("[data-clic=wn]");
    await attends(() => tbi.evaluate(() => document.querySelector("#wc").textContent === "2 / 11"), 6000, "mot suivant à distance");
    vrai(true, "la télécommande montre les boutons de l'écran et les touche à distance");
    await tel.click("[data-nav='1']");
    await attends(() => tel.evaluate(() => !!document.querySelector("[data-clic=play]")), 6000, "bouton Écouter");
    await tel.screenshot({ path: path.join(CAPT, "6-telecommande.png") });
    await tel.click("[data-clic=play]");
    await attends(() => tbi.evaluate(() => { const a = document.querySelector("#audio"); return !a.paused && a.currentTime > 0.1; }), 6000, "voix lancée à distance");
    vrai(await tbi.evaluate(() => { const a = document.querySelector("#audio"), v = +document.querySelector("#speed [aria-pressed=true]").dataset.v; return a.readyState >= 2 && v === 0.8 && a.playbackRate === v && a.defaultPlaybackRate === v; }), "E2 : charger une autre voix depuis le téléphone conserve la vitesse 0,8 affichée");
    await attends(() => tel.evaluate(() => /lecture en cours/.test(document.querySelector("#t-main").textContent)), 6000, "état « lecture »");
    vrai(true, "« Écouter » sur le téléphone lance la voix sur l'écran");
    await tel.click("[data-clic=play]");
    await attends(() => tbi.evaluate(() => document.querySelector("#audio").paused), 6000, "pause à distance");
    for (const [depart, cible] of [[1,2], [2,3], [3,1]]){
      await tel.click(`[data-nav='${depart}']`);
      await attends(() => tbi.evaluate(lecteurAuDebut), 5000, "mode initial depuis le téléphone");
      await attends(() => tel.evaluate(() => !!document.querySelector("[data-clic=next]")), 5000, "pages à distance");
      await tel.click("[data-clic=next]");
      await attends(() => tbi.evaluate(() => /^Page 1 \/ /.test(document.querySelector("#pno").textContent)), 5000, "première page à distance");
      await tel.click("[data-clic=next]");
      await attends(() => tbi.evaluate(() => /^Page 2 \/ /.test(document.querySelector("#pno").textContent)), 5000, "deuxième page à distance");
      await tel.click("[data-clic=play]");
      await attends(() => tbi.evaluate(() => !!document.querySelector("#txt .w.on") && document.querySelector("#audio").currentTime > Banc.ep("E2").pages[2].a + 0.1), 5000, "lecture avancée commandée depuis le téléphone");
      await tel.click(`[data-nav='${cible}']`);
      await attends(() => tbi.evaluate(lecteurAuDebut), 5000, "remise au début à distance");
      vrai(true, `téléphone : passer de l'étape ${depart + 1} à ${cible + 1} remet voix, page et surlignage au début, en pause`);
      await tel.click("[data-clic=play]");
      await attends(() => tbi.evaluate(lecturePremierePage), 5000, "reprise au début depuis le téléphone");
      vrai(true, "téléphone : la nouvelle écoute commence à la première page, sans reprendre l'ancien passage");
    }
    await tel.click("[data-clic=play]");
    await attends(() => tbi.evaluate(() => document.querySelector("#audio").paused), 5000, "pause après vérification des modes");

    await tel.evaluate(() => { location.hash = location.hash + "&essai-rapide"; });
    await tbi.evaluate(() => { history.replaceState(null, "", location.pathname + location.search + "#essai-rapide"); });
    await tel.click("[data-tab=defi]");
    await tel.selectOption("#t-ep", "E2");
    await tel.click("#t-who [data-eleve=e2]");
    await attends(() => tbi.evaluate(() => Ecran.route().step === 4 && Ecran.route().id === "E2" && /se prépare/.test(document.querySelector("#hint").textContent)), 8000, "l'écran ouvre le défi");
    vrai(true, "choisir l'élève sur le téléphone ouvre le défi sur l'écran");
    await tel.click("#t-go");
    await attends(() => tbi.evaluate(() => /lit/.test(document.querySelector("#hint").textContent)), 6000, "chrono sur l'écran");
    vrai(true, "« Départ » sur le téléphone lance le chrono de l'écran");
    for (const k of [2, 5]) await tel.click(`#t-txt .w >> nth=${k}`);
    vrai(await tbi.evaluate(() => !document.querySelector("#txt .w.err")), "les erreurs notées sur le téléphone ne s'affichent pas pendant la lecture");
    await tel.screenshot({ path: path.join(CAPT, "7-defi-telephone.png") });
    await attends(() => tel.evaluate(() => /dernier mot lu/.test(document.querySelector("#t-main").textContent)), 10000, "fin du temps sur le téléphone");
    await tel.click("#t-txt .w >> nth=30");
    await attends(() => tel.evaluate(() => !!document.querySelector("#t-res")), 3000, "résultat sur le téléphone");
    const r2 = await tel.evaluate(() => Telephone.defi().resultat);
    vrai(r2.lus === 31 && r2.erreurs === 2 && r2.ep === "E2" && r2.eleve === "e2", `défi sur le téléphone : 31 mots lus, 2 erreurs → ${r2.mclm} mots/min`);
    await attends(() => tbi.evaluate(m => !document.querySelector("#res").hidden && document.querySelector("#res .big-num").textContent === String(m), r2.mclm), 8000, "résultat sur l'écran");
    vrai(await tbi.evaluate(() => document.querySelectorAll("#txt .w.err").length === 2 && !!document.querySelector("#txt .w.last")), "l'écran montre le résultat, le dernier mot lu et les erreurs");
    await tbi.screenshot({ path: path.join(CAPT, "8-defi-ecran.png") });
    await tel.screenshot({ path: path.join(CAPT, "9-resultat-telephone.png") });
    await attends(() => tbi.evaluate(() => Banc.Donnees.essais().length === 2), 8000, "essai recopié sur l'écran");
    vrai(true, "l'essai fait sur le téléphone est enregistré aussi sur l'écran");

    console.log("   Ordinateur remis à zéro");
    await tbi.close(); await ctxE.close();
    const ctxE2 = await b.newContext();
    tbi = await ouvre(ctxE2, base + Q + "#ecran&lien=" + code);
    await attends(() => tbi.evaluate(() => Banc.Donnees.essais().length === 2 && Banc.Donnees.eleves()[1].nom === "Test B"), 15000, "récupération");
    vrai(true, "un ordinateur tout neuf relié avec le même code retrouve la classe et les deux essais");
    await tel.click("[data-tab=progres]");
    await attends(() => tel.evaluate(() => /Test A/.test(document.querySelector("#progression-eleves").textContent)), 4000, "liste des élèves dans les progrès sur le téléphone");
    await tel.screenshot({ path: path.join(CAPT, "10-progres-telephone.png"), fullPage: true });
    vrai(true, "les progrès s'affichent aussi sur le téléphone");
    const lectureASupprimer = await tel.evaluate(() => Banc.Donnees.essais()[0]);
    const suppr = lectureASupprimer.id;
    await tel.click(`[data-progress-eleve="${lectureASupprimer.eleve}"]`);
    if(!await tel.locator("#tous").evaluate(e=>e.open))await tel.locator("#tous > summary").click();
    if(!await tel.locator(`[data-progress-lecture="${suppr}"]`).evaluate(e=>e.open))await tel.locator(`[data-progress-lecture="${suppr}"] > summary`).click();
    await tel.click(`[data-suppr="${suppr}"]`); await tel.click(`[data-suppr="${suppr}"]`);
    await attends(() => tbi.evaluate(() => Banc.Donnees.essais().length === 1), 8000, "suppression recopiée");
    vrai(true, "un essai supprimé sur le téléphone l'est aussi sur l'écran");
    const sauvegarde = await tbi.evaluate(() => Banc.Donnees.sauvegarde());
    vrai(sauvegarde.format === "banc-des-maitres/sauvegarde" && sauvegarde.resultats.liste.length === 2 && sauvegarde.resultats.liste.filter(r => r.suppr).length === 1 && sauvegarde.classe.eleves[0].nom === "Test A", "la sauvegarde contient la classe et les essais (avec la suppression)");
    await tbi.evaluate(async () => { await Banc.Donnees.importe({ students: [{ id: "a", name: "Test V1", goal: "60" }], results: [{ sid: "a", ep: "E1", date: "2026-10-10T10:00:00.000Z", essai: 1, mclm: 48, read: 50, err: 2, secs: 60 }], speed: 0.8 }); });
    vrai(await tbi.evaluate(() => Banc.Donnees.essais().length === 2 && Banc.Donnees.eleves()[0].nom === "Test V1"), "une sauvegarde de la première version s'importe (classe remplacée, essais ajoutés)");

    console.log("3. Tamallette P2");
    const ctxP2 = await b.newContext();
    const p2 = await ouvre(ctxP2, base + Q + "#ecran&essai-rapide");
    await attends(() => p2.evaluate(() => document.querySelectorAll("#eps-tamallette .ep").length === 6), 5000, "accueil Tamallette");
    vrai(await p2.evaluate(() => document.querySelectorAll("#eps .ep").length === 7 && document.querySelectorAll("#eps-tamallette .ep").length === 6), "l'accueil sépare les 7 épisodes et les 6 textes Tamallette");
    vrai(await p2.evaluate(() => [1,2,3,4,5,6].every(n => {
      const x = Banc.ep("T" + n);
      return x && x.collection === "tamallette-p2" && x.nbMots > 50 && x.mots.length > 0 && x.source && x.pages.slice(1).every(p => p.img === null) && (n === 1
        ? /T1\.mp3$/.test(x.audio) && x.pages.slice(1).every(p => Number.isFinite(p.a) && p.b > p.a && p.toks.every(t => Number.isFinite(t[1]) && t[2] >= t[1]))
        : x.audio === null && x.pages.slice(1).every(p => p.a === null && p.b === null));
    })), "les 6 textes Tamallette sont complets et attribués ; seule la voix T1 est présente et alignée, aucune image absente n'est déclarée");
    await p2.click("[data-ep=E1]"); await p2.click(".step >> nth=1"); await p2.click("#play");
    await attends(() => p2.evaluate(() => !document.querySelector("#audio").paused), 5000, "voix du feuilleton avant T1");
    await p2.click("[data-go=home]"); await p2.click("[data-ep=T1]"); await p2.click(".step >> nth=1");
    vrai(await p2.evaluate(() => {
      const a = document.querySelector("#audio"), stage = document.querySelector(".stage"), texte = document.querySelector(".textbox");
      return a.dataset.ep === "T1" && /\/T1\.mp3$/.test(a.src) && a.paused && a.currentTime < 0.15 && /J['’]écoute/.test(document.querySelectorAll(".step")[1].textContent) && document.querySelector("#pic").hidden && !document.querySelector(".ph, .noaudio") && texte.getBoundingClientRect().width >= stage.getBoundingClientRect().width - 2;
    }), "passer du feuilleton à T1 charge la bonne voix, en pause, avec un texte en pleine largeur sans faux emplacement d'image");
    await p2.click("#play");
    await attends(() => p2.evaluate(() => {
      const a = document.querySelector("#audio");
      return !a.paused && a.readyState >= 2 && /^Page 1 \/ /.test(document.querySelector("#pno").textContent) && !!document.querySelector("#txt .w.on");
    }), 10000, "voix et surlignage de T1");
    vrai(await p2.evaluate(() => {
      const a = document.querySelector("#audio"), mots = [...document.querySelectorAll("#txt .w")], i = mots.findIndex(x => x.classList.contains("on")), mot = Banc.ep("T1").pages[1].toks[i];
      return a.dataset.ep === "T1" && a.playbackRate === 0.8 && mot && mots[i].textContent === mot[0] && a.currentTime >= mot[1] - 0.15 && a.currentTime <= mot[2] + 0.2;
    }), "la nouvelle voix T1 se lit à la vitesse choisie et surligne le mot aligné de la première page");
    await p2.click(".step >> nth=2"); await p2.click("#next"); await p2.click("#play");
    await attends(() => p2.evaluate(() => !document.querySelector("#echobar").hidden), 15000, "première phrase T1 en écho");
    vrai(await p2.evaluate(() => {
      const a = document.querySelector("#audio"), fin = Banc.ep("T1").pages[1].sents[0][3];
      return a.paused && document.querySelectorAll("#txt .s")[0].classList.contains("echo") && a.currentTime >= fin && a.currentTime < fin + 1;
    }), "l'écho T1 s'arrête à la fin de sa première phrase et attend la classe");
    await p2.click(".step >> nth=1"); await p2.click("#play");
    await attends(() => p2.evaluate(() => !document.querySelector("#audio").paused), 5000, "T1 en lecture avant un texte sans audio");
    await p2.click("[data-go=home]"); await p2.click("[data-ep=T3]"); await p2.click(".step >> nth=1"); await p2.click("#next");
    await p2.click("#txt .w >> nth=0");
    vrai(await p2.evaluate(() => document.querySelector("#audio").paused && !document.querySelector("#play, #txt .w.on") && /Voix à venir/.test(document.querySelector(".noaudio").textContent)), "passer de T1 en lecture à T3 arrête la voix ; toucher un mot sans enregistrement ne relance aucun son");
    await p2.click("[data-go=home]"); await p2.click("[data-ep=E1]"); await p2.click(".step >> nth=1");
    vrai(await p2.evaluate(() => {
      const a = document.querySelector("#audio");
      return a.dataset.ep === "E1" && /\/E1\.mp3$/.test(a.src) && a.paused && a.currentTime < 0.15 && !document.querySelector("#pic").hidden;
    }), "revenir au feuilleton après T3 restaure sa propre voix et son illustration, au début et en pause");
    await p2.click("[data-go=home]");
    for (const id of ["T2", "T3", "T4", "T5", "T6"]){
      await p2.click(`[data-ep=${id}]`);
      vrai(await p2.evaluate(() => /Tamallette/.test(document.querySelector(".ephead h2").textContent) && !/Épisode/.test(document.querySelector(".ephead h2").textContent) && /Je lis/.test(document.querySelectorAll(".step")[1].textContent)), id + " porte son libellé Tamallette et propose « Je lis »");
      await p2.click(".step >> nth=1"); await p2.click("#next");
      vrai(await p2.evaluate(() => {
        const stage = document.querySelector(".stage"), texte = document.querySelector(".textbox");
        return document.querySelector("#pic").hidden && !document.querySelector(".ph") && !document.querySelector("#play") && /Voix à venir/.test(document.querySelector(".noaudio").textContent) && document.querySelectorAll("#txt .w").length > 0 && texte.getBoundingClientRect().width >= stage.getBoundingClientRect().width - 2;
      }), id + " se lit en pleine largeur, sans faux emplacement d'image ni commande audio");
      if (id === "T3"){
        await p2.click(".step >> nth=2"); await p2.click("#next");
        vrai(await p2.evaluate(() => !document.querySelector("#play") && document.querySelector("#audio").paused && /Voix à venir/.test(document.querySelector(".noaudio").textContent)), "l'étape écho reste lisible sans lancer une autre voix");
        await p2.screenshot({ path: path.join(CAPT, "11-tamallette-lecture.png") });
      }
      await p2.click("[data-go=home]");
    }
    await p2.evaluate(async () => {
      await Banc.Donnees.ajoute({ id:"test-episode-temoin", eleve:"e1", ep:"E1", date:"2026-10-10T10:00:00.000Z", mclm:50, lus:52, erreurs:2, secondes:60 });
    });
    await p2.click("[data-ep=T3]"); await p2.click(".step >> nth=4");
    await p2.click("#who [data-eleve=e1]"); await p2.click("#go"); await p2.click("#txt .w >> nth=2");
    await attends(() => p2.evaluate(() => /dernier mot/.test(document.querySelector("#hint").textContent)), 10000, "fin du défi Tamallette");
    await p2.click("#txt .w >> nth=19");
    await attends(() => p2.evaluate(() => !document.querySelector("#res").hidden), 3000, "résultat Tamallette");
    vrai(await p2.evaluate(() => {
      const t = Banc.Donnees.essaisDe("e1", "T3"), e = Banc.Donnees.essaisDe("e1", "E1");
      return t.length === 1 && t[0].ep === "T3" && t[0].essai === 1 && t[0].lus === 20 && t[0].erreurs === 1 && e.length === 1 && e[0].id === "test-episode-temoin" && e[0].mclm === 50;
    }), "le défi Tamallette sans audio conserve T3 et son numéro d'essai sans modifier le résultat E1");
    await p2.click("[data-go=progress]");
    await p2.click('[data-progress-eleve="e1"]');
    vrai(await p2.evaluate(() => {
      const textes = [...document.querySelectorAll("#progression-texte option")].map(x => x.value);
      return textes.includes("E1") && textes.includes("T3") && document.querySelectorAll("[data-progress-point]").length===2;
    }), "le suivi de l'élève propose séparément É1 et T3 et montre les deux lectures");
    for (const id of ["E1","T3"]){
      await p2.selectOption("#progression-texte",id);
      vrai(await p2.evaluate(id => {
        const points=[...document.querySelectorAll("[data-progress-point]")].map(x=>x.dataset.progressPoint);
        const lectures=Banc.Donnees.essaisDe("e1",id);
        return points.length===1 && points[0]===lectures[0].id && document.querySelectorAll("[data-progress-lecture]").length===1;
      },id), id+" : le filtre garde uniquement sa lecture dans la courbe et la liste");
    }
    await p2.close(); await ctxP2.close();

    console.log("4. Premier lien envoyé depuis le téléphone");
    const ctxPartage = await b.newContext({ hasTouch:true, isMobile:true });
    await ctxPartage.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable:true, value:async donnees => {
        sessionStorage.setItem("test-partage-url", donnees.url);
        sessionStorage.setItem("test-partage-n", String(+(sessionStorage.getItem("test-partage-n") || 0) + 1));
        if (sessionStorage.getItem("test-partage-annule")) throw new DOMException("Partage annulé", "AbortError");
      } });
    });
    const partageTel = await ouvre(ctxPartage, base + Q + "#tel", true);
    await attends(() => partageTel.evaluate(() => !!document.querySelector("#t-envoi") && Plateforme.Liaison.code() === null), 5000, "partage depuis un téléphone neuf");
    vrai(await partageTel.locator("#t-envoi").isVisible(), "le téléphone neuf propose « Envoyer le lien à l’ordinateur » sans code préalable");
    await partageTel.click("#t-envoi");
    await attends(() => partageTel.evaluate(() => sessionStorage.getItem("test-partage-n") === "1" && !!Plateforme.Liaison.code() && location.hash.includes("lien=") && !!document.querySelector("#t-envoi")), 8000, "rechargement après création du lien");
    const partageUrl = await partageTel.evaluate(() => sessionStorage.getItem("test-partage-url"));
    const partageCode = await partageTel.evaluate(() => Plateforme.Liaison.code());
    vrai(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(partageCode) && new URL(partageUrl).hash === "#lien=" + partageCode + "&ecran", "le premier partage crée et garde un code de 10 caractères dans un lien destiné à l'écran");
    vrai(await partageTel.locator("#t-envoi").isVisible() && await partageTel.locator("#t-envoi-lien").isVisible(), "le bouton et le lien restent accessibles en attendant l'ordinateur");
    await partageTel.click("#t-envoi");
    await attends(() => partageTel.evaluate(() => sessionStorage.getItem("test-partage-n") === "2"), 3000, "second partage");
    vrai(await partageTel.evaluate(c => Plateforme.Liaison.code() === c && sessionStorage.getItem("test-partage-url") === Plateforme.Liaison.lienEcran(), partageCode), "partager une deuxième fois réutilise le même code");
    await partageTel.evaluate(() => sessionStorage.setItem("test-partage-annule", "1"));
    await partageTel.click("#t-envoi");
    await attends(() => partageTel.evaluate(() => sessionStorage.getItem("test-partage-n") === "3" && !document.querySelector("#t-envoi").disabled), 3000, "annulation du partage");
    vrai(await partageTel.evaluate(c => Plateforme.Liaison.code() === c, partageCode), "annuler le partage conserve le code de liaison");
    const urlOrdinateur = new URL(partageUrl); urlOrdinateur.searchParams.set("relais", "nostr:" + R.url);
    const ctxOrdinateur = await b.newContext();
    const partageEcran = await ouvre(ctxOrdinateur, urlOrdinateur.href);
    await attends(() => partageTel.evaluate(() => document.querySelector("#t-lien-txt").textContent === "Écran relié"), 15000, "liaison par le lien partagé");
    await attends(() => partageEcran.evaluate(() => document.querySelector("#b-tel-txt").textContent === "Téléphone relié"), 10000, "nouvel écran relié");
    vrai(await partageEcran.evaluate(c => Banc.ROLE === "ecran" && Plateforme.Liaison.code() === c, partageCode), "ouvrir le lien sur un ordinateur neuf suffit pour relier les deux appareils");
    vrai(await partageTel.locator("#t-envoi").isVisible(), "le bouton de partage reste disponible quand l'écran est relié");
    await attends(() => partageTel.evaluate(() => document.querySelectorAll("[data-ep]").length === 13), 5000, "liste du nouvel écran");
    await partageTel.click("[data-ep=T3]");
    await attends(() => partageEcran.evaluate(() => Ecran.route().id === "T3"), 5000, "Tamallette ouvert à distance");
    await attends(() => partageTel.evaluate(() => /Je lis/.test(document.querySelector("[data-nav='1']").textContent)), 5000, "lecture libre sur la télécommande");
    await partageTel.click("[data-nav='1']");
    await attends(() => partageTel.evaluate(() => !!document.querySelector(".noaudio") && !document.querySelector("[data-clic=play]")), 5000, "Tamallette sans audio sur le téléphone");
    vrai(await partageTel.evaluate(() => /Tamallette/.test(document.querySelector("#t-main h2").textContent)), "la télécommande ouvre T3 avec les bons libellés et sans commande de voix");
    await partageTel.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable:true, value:undefined });
      Object.defineProperty(navigator, "clipboard", { configurable:true, value:{ writeText:async () => { throw new Error("Presse-papiers indisponible pour cet essai"); } } });
    });
    await partageTel.click("#t-envoi");
    await attends(() => partageTel.evaluate(() => /Copie le lien ci-dessous/.test(document.querySelector("#t-envoi-info").textContent)), 3000, "lien de repli");
    vrai(await partageTel.locator("#t-envoi-lien").isVisible() && await partageTel.locator("#t-envoi-lien a").getAttribute("href") === partageUrl, "si partage et presse-papiers sont indisponibles, le bon lien reste visible et sélectionnable");
    await partageTel.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable:true, value:{ writeText:async texte => sessionStorage.setItem("test-lien-copie", texte) } }));
    await partageTel.click("#t-envoi");
    await attends(() => partageTel.evaluate(() => /Lien copié/.test(document.querySelector("#t-envoi-info").textContent)), 3000, "copie du lien");
    vrai(await partageTel.evaluate(url => sessionStorage.getItem("test-lien-copie") === url, partageUrl), "le repli presse-papiers copie le même lien de liaison");
    await partageTel.click("[data-tab=defi]");
    vrai(await partageTel.evaluate(() => {
      const options = [...document.querySelectorAll("#t-ep option")];
      return options.length === 13 && options.filter(x => /^T/.test(x.value)).length === 6 && options.filter(x => /^T/.test(x.value)).every(x => /Tamallette/.test(x.textContent) && !/Épisode/.test(x.textContent));
    }), "le sélecteur de défi du téléphone contient les 13 textes et distingue Tamallette");
    await partageTel.selectOption("#t-ep", "T3");
    vrai(await partageTel.evaluate(() => document.querySelectorAll("#t-txt .w").length === Banc.motsDefi(Banc.ep("T3")).length), "le défi T3 sur téléphone affiche tout le texte sans dépendre d'un enregistrement");
    await partageTel.screenshot({ path:path.join(CAPT, "12-tamallette-telephone.png"), fullPage:true });

    console.log("5. Petits écrans");
    const m = await ouvre(await b.newContext(), base + Q + "#ecran", false); await m.setViewportSize({ width: 400, height: 820 });
    await m.click(".ep >> nth=0"); await m.click(".step >> nth=1");
    vrai(await m.evaluate(() => document.documentElement.scrollWidth <= 400), "écran étroit : pas de défilement horizontal");
    vrai(await tel.evaluate(() => document.documentElement.scrollWidth <= 390), "téléphone : pas de défilement horizontal");
    await m.click("[data-go=home]"); await m.click("[data-ep=T6]"); await m.click(".step >> nth=1"); await m.click("#next");
    vrai(await m.evaluate(() => document.documentElement.scrollWidth <= 400 && document.querySelector("#pic").hidden && document.querySelectorAll("#txt .w").length > 0), "Tamallette se lit aussi sur écran étroit sans espace d'image ni débordement");
    vrai(await partageTel.evaluate(() => document.documentElement.scrollWidth <= 390), "le défi Tamallette tient dans la largeur du téléphone");
    await partageTel.click("[data-tab=ecran]");
    vrai(await partageTel.evaluate(() => document.documentElement.scrollWidth <= 390), "la télécommande et le lien de partage tiennent dans la largeur du téléphone");
    vrai(erreurs.length === 0, "aucune erreur JavaScript" + (erreurs.length ? " : " + erreurs.join(" | ") : ""));
    console.log(`\n${ok} vérifications réussies (${R.messages()} messages par le relais local). Captures : tests/captures/`);
  } catch (e) { console.error(e.message || e); if (erreurs.length) console.error("Erreurs de la page :", erreurs.join("\n")); process.exitCode = 1; }
  finally { await b.close(); serveur.close(); R.wss.close(); }
})();
