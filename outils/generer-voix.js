/* ══════════════════════════════════════════════════════════════
   Génère les voix des mascottes avec ElevenLabs.

   Utilisation (dans le dossier ludoboxdevivi) :
     node outils/generer-voix.js girafe --essai   (liste sans rien générer)
     node outils/generer-voix.js girafe           (génère audio/girafe/*.mp3)
     node outils/generer-voix.js lion             (complète les fichiers manquants de audio/lion/)

   Nécessite :
     outils/cle-elevenlabs.txt   la clé API (jamais envoyée sur GitHub)
     outils/voix-mascottes.json  les identifiants de voix, ex. { "lion": "abc123", ... }

   Les fichiers déjà présents ne sont pas regénérés : on peut relancer
   le script sans risque après une coupure ou un manque de crédits.
   ══════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..');
const MASCOTTES = ['lion', 'girafe', 'panthere', 'koala'];
const MODELE = 'eleven_multilingual_v2';
const MODELE_ANGLAIS = 'eleven_turbo_v2_5'; // accepte language_code: 'en'
const VITESSE = 0.85; // 1 = vitesse normale d'ElevenLabs, trop rapide pour les petits

/* ── 1. Récupérer toutes les phrases de jeu depuis l'appli ── */
function phrasesDuJeu() {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const js = html.slice(html.indexOf("<script>\n'use strict'") + 8, html.lastIndexOf('</script>'));
  const rien = new Proxy(function () {}, {
    get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : rien,
    apply: () => rien, construct: () => rien, set: () => true,
  });
  const fen = new Proxy({}, { get: (t, k) => k in t ? t[k] : rien, set: (t, k, v) => (t[k] = v, true) });
  const ctx = {
    console: { log() {} }, Math, JSON, Promise, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    document: rien, window: fen, navigator: rien, localStorage: { getItem: () => null, setItem() {} },
    Audio: rien, Image: rien, speechSynthesis: rien, CSS: { escape: x => x }, performance: { now: () => 0 },
    requestAnimationFrame: () => 0, alert() {}, confirm: () => false,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'voix.js'), 'utf8'), ctx);
  vm.runInContext(js + ';globalThis.__x={buildQ,parentSettings,AUDIO_BANK,STICKERS,BRAVO_FEEDBACK,ENCOURAGE_FEEDBACK}', ctx);
  const X = ctx.__x;

  const phrases = new Map(); // fichier -> { texte, en }
  const ajouter = (fichier, texte, en = false) => {
    if (!fichier || !texte || phrases.has(fichier)) return;
    if (/^(lion|girafe|panthere|koala)_/.test(fichier)) return; // phrases propres à chaque mascotte
    texte = String(texte).replace(/[●]+/g, '').replace(/\s*—\s*/g, ' ').replace(/\s+:\s+/g, ' : ')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
    phrases.set(fichier, { texte, en });
  };
  // Une clé absente de AUDIO_BANK désigne directement le fichier <clé>.mp3 (comme dans l'appli)
  const fichierDeCle = k => k && (X.AUDIO_BANK[k] ? path.basename(X.AUDIO_BANK[k], '.mp3') : k);

  // Consignes et félicitations (tirages répétés pour tout couvrir)
  X.parentSettings.difficulty = 'hard';
  for (const mod of ['alphabet', 'chiffres', 'couleurs', 'formes', 'animaux', 'nourriture', 'lecture', 'regles', 'contraires', 'anglais', 'vetements'])
    for (let i = 0; i < 200; i++)
      for (const q of X.buildQ(mod)) {
        ajouter(fichierDeCle(q.audioKey), q.consigneDisplay || q.consigne);
        ajouter(fichierDeCle(q.audioBravo), q.bravo);
      }
  X.STICKERS.forEach(s => ajouter(fichierDeCle(s.audioKey), s.voice));
  X.BRAVO_FEEDBACK.concat(X.ENCOURAGE_FEEDBACK).forEach(f => ajouter(fichierDeCle(f.key), f.text));
  // Phrases écrites directement dans le code : direAudio('cle', "texte")
  for (const m of html.matchAll(/direAudio\('([a-z_0-9]+)',\s*(["'])(.*?)\2/g)) ajouter(fichierDeCle(m[1]), m[3]);
  // Mots des réponses et phrases diverses
  ctx.window.VOIX_PHRASES.forEach(p => ajouter(p.fichier, p.texte, !!p.en));
  return phrases;
}

/* ── 2. Appel ElevenLabs ── */
async function generer(cle, voixId, reglages, texte, en) {
  const corps = { text: texte, model_id: en ? MODELE_ANGLAIS : MODELE, voice_settings: { ...reglages, speed: VITESSE } };
  if (en) corps.language_code = 'en';
  for (let essai = 1; essai <= 5; essai++) {
    const rep = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voixId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': cle, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(corps),
    });
    if (rep.ok) return Buffer.from(await rep.arrayBuffer());
    const msg = await rep.text();
    if (rep.status === 429 || rep.status >= 500) { await new Promise(r => setTimeout(r, 3000 * essai)); continue; }
    const err = new Error(`ElevenLabs ${rep.status} : ${msg.slice(0, 300)}`);
    err.fatal = rep.status === 401 || /quota|credits/i.test(msg);
    throw err;
  }
  throw new Error('ElevenLabs ne répond pas (trop de tentatives)');
}

/* ── 3. Programme ── */
(async () => {
  const mascotte = process.argv[2];
  const essai = process.argv.includes('--essai');
  if (!MASCOTTES.includes(mascotte)) {
    console.log('Indique une mascotte : ' + MASCOTTES.join(', '));
    process.exit(1);
  }
  const dossier = path.join(RACINE, 'audio', mascotte);
  const phrases = phrasesDuJeu();
  const aFaire = [...phrases].filter(([f]) => !fs.existsSync(path.join(dossier, f + '.mp3')));
  const nbCar = aFaire.reduce((a, [, p]) => a + p.texte.length, 0);
  console.log(`${mascotte} : ${aFaire.length} phrases à générer sur ${phrases.size} (${nbCar} caractères)`);

  if (essai) {
    aFaire.forEach(([f, p]) => console.log(`  ${f}${p.en ? ' [EN]' : ''} : ${p.texte}`));
    return;
  }

  const cle = fs.readFileSync(path.join(__dirname, 'cle-elevenlabs.txt'), 'utf8').trim();
  const voixId = JSON.parse(fs.readFileSync(path.join(__dirname, 'voix-mascottes.json'), 'utf8'))[mascotte];
  if (!voixId) { console.log(`Pas d'identifiant de voix pour « ${mascotte} » dans voix-mascottes.json`); process.exit(1); }
  fs.mkdirSync(dossier, { recursive: true });
  // Réglages enregistrés de la voix (stabilité, similarité…), seule la vitesse est modifiée
  const rs = await fetch(`https://api.elevenlabs.io/v1/voices/${voixId}/settings`, { headers: { 'xi-api-key': cle } });
  const reglages = rs.ok ? await rs.json() : {};

  let ok = 0, erreurs = 0;
  for (const [fichier, p] of aFaire) {
    try {
      const mp3 = await generer(cle, voixId, reglages, p.texte, p.en);
      fs.writeFileSync(path.join(dossier, fichier + '.mp3'), mp3);
      ok++;
      console.log(`✅ ${ok}/${aFaire.length} ${fichier}`);
    } catch (e) {
      erreurs++;
      console.log(`❌ ${fichier} : ${e.message}`);
      if (e.fatal) { console.log('Arrêt (clé invalide ou crédits épuisés). Relancer plus tard reprendra ici.'); break; }
    }
  }
  console.log(`Terminé : ${ok} générées, ${erreurs} erreurs.`);
})();
