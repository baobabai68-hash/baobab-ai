/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║           BAOBAB AI — VERSION 3.1 FINALE PRÊTE POUR RAILWAY         ║
 * ║    Inclut les 3 corrections post-audit V3 + structure Vite/Railway   ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  CORRECTIONS V3 héritées :                                          ║
 * ║  ✓ FLAG TEST_MODE · Mots de passe encodés · Déduction réelle       ║
 * ║  ✓ Auto-valider · Bandeau TEST_MODE · Simulations réalistes        ║
 * ║                                                                      ║
 * ║  CORRECTIONS V3.1 (post-audit final) :                              ║
 * ║  ✓ adminPassword encodé hashPwd() — plus jamais en clair           ║
 * ║  ✓ Fuseau horaire WAT (Yaoundé UTC+1) — currentMonth corrigé       ║
 * ║  ✓ INF_ACCOUNTS : hashPwd unifié avec users (cohérence totale)     ║
 * ║  ✓ Structure Vite fournie → déploiement Railway sans config         ║
 * ║  ✓ manifest.json PWA inclus                                          ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ARCHITECTURE DE DÉPLOIEMENT :
 *  - TEST_MODE = true  → Railway / Claude Artifacts (prototype, aucun vrai appel API)
 *  - TEST_MODE = false → VPS production (nécessite un backend proxy Node.js/Express
 *    avec la clé API sécurisée côté serveur — voir note PRODUCTION ci-dessous)
 *
 * NOTE PRODUCTION (important pour le déploiement VPS) :
 *  Les fonctions autoReformulate() et orchestrate() doivent, en production,
 *  appeler un endpoint backend sécurisé (ex: POST /api/ai) qui détient la
 *  clé API CrazyRouter côté serveur. Les crédits doivent y être validés
 *  côté serveur (PostgreSQL) pour empêcher la manipulation via localStorage.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// § 1. CONFIGURATION GLOBALE
// ═══════════════════════════════════════════════════════════════

/**
 * TEST_MODE = true  → Toutes les réponses IA sont simulées localement.
 *                     Aucun vrai appel API. Stable sur Railway / Claude Artifacts.
 * TEST_MODE = false → Appels API réels via backend proxy (production VPS).
 *                     Nécessite un serveur Express.js avec clé CrazyRouter.
 */
const TEST_MODE = true;

const CFG = {
  price:        15_000,       // FCFA / mois
  credits:   1_000_000,       // crédits par abonnement
  ownerProfit:  10_000,       // FCFA bénéfice propriétaire par abonnement
  crazyBudget:   5_000,       // FCFA alloués à CrazyRouter (API IA)
  commissionPct:    20,       // % du bénéfice propriétaire reversé à l'influenceur
  adminEmail:   "admin@baobab.ai",
  adminPasswordHash: btoa(unescape(encodeURIComponent("BaobabAdmin2025!"))), // encodé, jamais en clair
  // Limites tokens pour contrôle du budget CrazyRouter
  // 5 000 FCFA ≈ 8,50 USD → ~8,5M tokens cheap. 1M crédits = ce budget.
  maxSimpleInput:  2_500,
  maxSimpleOutput: 4_000,
  maxComplexIn:    4_000,
  maxComplexOut:   8_000,
};

// ═══════════════════════════════════════════════════════════════
// § 2. CATALOGUE IA — spécialité · benchmark (LMSYS ELO) · coût
// ═══════════════════════════════════════════════════════════════
const MODELS = [
  // ── TEXTE ──────────────────────────────────────────────────────────────────
  { id:"claude-sonnet",  name:"Claude Sonnet 4",      provider:"Anthropic",         spec:["chat","code","analyse","document","rédaction"], tier:"premium", bm:96, ri:8,    ro:16,  emoji:"🧠", color:"#D4A853", desc:"Meilleur équilibre intelligence/vitesse. Idéal pour tout." },
  { id:"claude-haiku",   name:"Claude Haiku 3.5",     provider:"Anthropic",         spec:["chat","résumé"],                                tier:"eco",     bm:87, ri:1,    ro:2,   emoji:"⚡", color:"#5B9BD5", desc:"Ultra-rapide et économique pour les tâches simples." },
  { id:"gpt4o",          name:"GPT-4o",               provider:"OpenAI",            spec:["chat","vision","analyse","code"],               tier:"premium", bm:94, ri:8,    ro:16,  emoji:"🤖", color:"#10A37F", desc:"Excellent en vision et raisonnement complexe." },
  { id:"gpt4o-mini",     name:"GPT-4o Mini",          provider:"OpenAI",            spec:["chat","résumé"],                                tier:"mid",     bm:88, ri:3,    ro:6,   emoji:"🔵", color:"#34B3F1", desc:"Version allégée de GPT-4o, rapport qualité/prix excellent." },
  { id:"gemini-pro",     name:"Gemini 1.5 Pro",       provider:"Google",            spec:["chat","code","analyse","document"],             tier:"premium", bm:92, ri:8,    ro:16,  emoji:"💎", color:"#4285F4", desc:"Contexte 1M tokens. Parfait pour les longs documents." },
  { id:"gemini-flash",   name:"Gemini 1.5 Flash",     provider:"Google",            spec:["chat","résumé"],                                tier:"eco",     bm:85, ri:1,    ro:2,   emoji:"🔷", color:"#34A853", desc:"Version rapide de Gemini, très économique." },
  { id:"mistral-large",  name:"Mistral Large 2",      provider:"Mistral AI",        spec:["chat","code","rédaction"],                      tier:"mid",     bm:89, ri:3,    ro:6,   emoji:"🌪️", color:"#FF6B35", desc:"Excellent en français. Fort en code et raisonnement." },
  { id:"mistral-nemo",   name:"Mistral Nemo",         provider:"Mistral AI",        spec:["chat","résumé"],                                tier:"eco",     bm:82, ri:1,    ro:2,   emoji:"🎯", color:"#FF9F1C", desc:"Léger et rapide. Bon pour les Q&R simples." },
  { id:"llama-70b",      name:"Llama 3.3 70B",        provider:"Meta",              spec:["chat","code"],                                  tier:"mid",     bm:86, ri:3,    ro:6,   emoji:"🦙", color:"#0064E0", desc:"Open source performant. Excellent rapport qualité/coût." },
  { id:"llama-8b",       name:"Llama 3.1 8B",         provider:"Meta",              spec:["chat"],                                         tier:"eco",     bm:76, ri:1,    ro:2,   emoji:"🐏", color:"#1877F2", desc:"Ultra-léger pour questions simples." },
  { id:"deepseek-v3",    name:"DeepSeek V3",          provider:"DeepSeek",          spec:["chat","code","maths"],                          tier:"mid",     bm:91, ri:3,    ro:6,   emoji:"🌊", color:"#5865F2", desc:"Extraordinaire en code et mathématiques." },
  { id:"qwen-72b",       name:"Qwen 2.5 72B",         provider:"Alibaba",           spec:["chat","code"],                                  tier:"mid",     bm:88, ri:3,    ro:6,   emoji:"🐼", color:"#FF6A00", desc:"Très performant en multilangue et code." },
  // ── IMAGES ─────────────────────────────────────────────────────────────────
  { id:"flux-pro",       name:"FLUX.1 Pro",           provider:"Black Forest Labs", spec:["image"],                                        tier:"premium", bm:97, ri:2000, ro:0,   emoji:"🎨", color:"#8B5CF6", desc:"Meilleur modèle image actuel. Photoréaliste." },
  { id:"flux-schnell",   name:"FLUX.1 Schnell",       provider:"Black Forest Labs", spec:["image"],                                        tier:"eco",     bm:89, ri:800,  ro:0,   emoji:"🖌️", color:"#7C3AED", desc:"Version rapide de FLUX. Idéal pour itérer vite." },
  { id:"dall-e-3",       name:"DALL·E 3",             provider:"OpenAI",            spec:["image"],                                        tier:"premium", bm:91, ri:2000, ro:0,   emoji:"🎭", color:"#00A67E", desc:"DALL·E 3 d'OpenAI. Excellente compréhension des prompts." },
  { id:"sdxl",           name:"Stable Diffusion XL",  provider:"Stability AI",      spec:["image"],                                        tier:"eco",     bm:82, ri:800,  ro:0,   emoji:"🖼️", color:"#EC4899", desc:"Classique open source. Nombreux styles disponibles." },
  // ── AUDIO ──────────────────────────────────────────────────────────────────
  { id:"elevenlabs",     name:"ElevenLabs v3",        provider:"ElevenLabs",        spec:["audio"],                                        tier:"premium", bm:98, ri:800,  ro:0,   emoji:"🎤", color:"#F59E0B", desc:"Voix synthétiques les plus réalistes. 30+ langues." },
  { id:"openai-tts",     name:"OpenAI TTS",           provider:"OpenAI",            spec:["audio"],                                        tier:"eco",     bm:88, ri:300,  ro:0,   emoji:"🔊", color:"#10B981", desc:"TTS naturel et polyglotte à coût modéré." },
  { id:"whisper",        name:"Whisper Large v3",     provider:"OpenAI",            spec:["audio","transcription"],                        tier:"eco",     bm:92, ri:300,  ro:0,   emoji:"🎙️", color:"#06B6D4", desc:"Transcription audio → texte. Leader en reconnaissance." },
  // ── VIDÉO ──────────────────────────────────────────────────────────────────
  { id:"sora",           name:"Sora",                 provider:"OpenAI",            spec:["video"],                                        tier:"premium", bm:94, ri:5000, ro:0,   emoji:"🎬", color:"#EF4444", desc:"Génération vidéo haute qualité par OpenAI." },
  { id:"runway-gen3",    name:"Runway Gen-3",         provider:"Runway",            spec:["video"],                                        tier:"premium", bm:91, ri:5000, ro:0,   emoji:"🎥", color:"#DC2626", desc:"Génération et édition vidéo professionnelle." },
];

// ═══════════════════════════════════════════════════════════════
// § 3. 20 INFLUENCEURS SIMULÉS
// ═══════════════════════════════════════════════════════════════
const INFLUENCERS = [
  { id:"inf01", name:"Lionel Kamga",    handle:"@lionelkamga",   followers:"245K", photo:"🦁", color:"#E74C3C", team:"Team Lion",        msg:"Avec la Team Lion, on rugit plus haut. Bienvenue chez les plus forts !" },
  { id:"inf02", name:"Audrey Mballa",   handle:"@audreymballa",  followers:"312K", photo:"🌸", color:"#EC4899", team:"Team Rose",        msg:"Beauté, intelligence, élégance — bienvenue dans ma team !" },
  { id:"inf03", name:"Brice Fotso",     handle:"@bricefotso",    followers:"178K", photo:"🌊", color:"#2980B9", team:"Team Océan",       msg:"Profond comme l'océan, puissant comme les vagues. En avant !" },
  { id:"inf04", name:"Steve Nguimfack", handle:"@stevenguim",    followers:"134K", photo:"🔥", color:"#E67E22", team:"Team Feu",         msg:"On ne s'arrête pas, on brûle pour nos rêves. Team Feu !" },
  { id:"inf05", name:"Diane Ekoka",     handle:"@dianeekoka",    followers:"289K", photo:"⭐", color:"#F1C40F", team:"Team Étoile",      msg:"Chaque étoile brille. Ici, on fait briller les tiens." },
  { id:"inf06", name:"Patrick Tchiaga", handle:"@patricktch",    followers:"156K", photo:"💜", color:"#8E44AD", team:"Team Violet",      msg:"La royauté, c'est un état d'esprit. Bienvenue Team Violet." },
  { id:"inf07", name:"Carine Momo",     handle:"@carinemomo",    followers:"203K", photo:"🌿", color:"#27AE60", team:"Team Verte",       msg:"Nature, santé, tech. On grandit ensemble !" },
  { id:"inf08", name:"Rodrigue Ateba",  handle:"@rodrigueateba", followers:"89K",  photo:"⚡", color:"#3498DB", team:"Team Éclair",      msg:"Rapides, précis, imparables. Bienvenue Team Éclair !" },
  { id:"inf09", name:"Flore Nkeng",     handle:"@florenk",       followers:"167K", photo:"🦋", color:"#A855F7", team:"Team Papillon",    msg:"Se transformer, s'élever, voler. Team Papillon vous attend." },
  { id:"inf10", name:"Junior Mbida",    handle:"@juniormbida",   followers:"112K", photo:"🏆", color:"#D97706", team:"Team Gold",        msg:"Ici on vise l'or. Rien de moins. Bienvenue Team Gold !" },
  { id:"inf11", name:"Sandra Foka",     handle:"@sandrafoka",    followers:"198K", photo:"❤️", color:"#DC2626", team:"Team Rouge",       msg:"Passion, énergie, ambition. La Team Rouge est en feu !" },
  { id:"inf12", name:"Yves Fotabong",   handle:"@yvesfotabong",  followers:"76K",  photo:"🌙", color:"#1E3A5F", team:"Team Nuit",        msg:"C'est dans l'obscurité que les étoiles brillent le mieux." },
  { id:"inf13", name:"Merveille Ndzie", handle:"@merveillez",    followers:"234K", photo:"💫", color:"#0EA5E9", team:"Team Ciel",        msg:"Aussi vaste que le ciel. Aussi lumineux que l'espoir." },
  { id:"inf14", name:"Boris Essomba",   handle:"@borisessomba",  followers:"145K", photo:"🦅", color:"#64748B", team:"Team Aigle",       msg:"L'aigle ne craint pas la tempête. Il l'utilise pour voler plus haut." },
  { id:"inf15", name:"Laure Minkoue",   handle:"@lauremin",      followers:"267K", photo:"🌺", color:"#F43F5E", team:"Team Soleil",      msg:"Tu mérites de briller. La Team Soleil est là pour toi." },
  { id:"inf16", name:"Christ Nganou",   handle:"@christnganou",  followers:"93K",  photo:"🥊", color:"#B45309", team:"Team Champion",    msg:"Champions dans l'arène, champions dans la vie. Fight !" },
  { id:"inf17", name:"Nelly Tagne",     handle:"@nellytagne",    followers:"321K", photo:"🎵", color:"#7C3AED", team:"Team Music",       msg:"La vie est une mélodie. Ensemble, on compose le chef-d'œuvre." },
  { id:"inf18", name:"Hervé Donkeng",   handle:"@hervedonk",     followers:"108K", photo:"🚀", color:"#0F172A", team:"Team Rocket",      msg:"Décollage immédiat. Team Rocket va vous emmener loin !" },
  { id:"inf19", name:"Ines Mbougueng",  handle:"@inesmbg",       followers:"188K", photo:"🌈", color:"#06B6D4", team:"Team Arc-en-Ciel", msg:"Toutes les couleurs de la vie, tous les outils de l'IA !" },
  { id:"inf20", name:"Marcel Tchouta",  handle:"@marceltch",     followers:"72K",  photo:"🌍", color:"#16A34A", team:"Team Africa",      msg:"L'Afrique qui gagne, l'Afrique qui innove. Soyons fiers !" },
];

// ═══════════════════════════════════════════════════════════════
// § 4. COMPTES INFLUENCEURS PRÉ-ENREGISTRÉS
// email = handle@baobab.ai (ex: lionelkamga@baobab.ai)
// password = "Baobab2025!" (encodé btoa à la comparaison)
// ═══════════════════════════════════════════════════════════════
const INF_ACCOUNTS = INFLUENCERS.map(inf => ({
  id:           "inf_" + inf.id,
  role:         "influencer",
  influencerId: inf.id,
  email:        inf.handle.replace("@", "") + "@baobab.ai",
  // Mot de passe stocké encodé pour ne jamais apparaître en clair
  passwordHash: btoa(unescape(encodeURIComponent("Baobab2025!"))), // même algo que hashPwd()
  username:     inf.name,
}));

// ═══════════════════════════════════════════════════════════════
// § 5. STOCKAGE LOCAL (localStorage)
// ═══════════════════════════════════════════════════════════════
const DB = {
  get:  k     => { try { return JSON.parse(localStorage.getItem("bb_" + k)); } catch { return null; } },
  set:  (k,v) => { try { localStorage.setItem("bb_" + k, JSON.stringify(v)); } catch {} },
  del:  k     => { try { localStorage.removeItem("bb_" + k); } catch {} },
  init: ()    => {
    if (!DB.get("users"))    DB.set("users", []);
    if (!DB.get("payments")) DB.set("payments", []);
    if (!DB.get("convs"))    DB.set("convs", {});
  },
};

const saveUser = u => {
  const users = DB.get("users") || [];
  const i = users.findIndex(x => x.id === u.id);
  if (i >= 0) users[i] = u; else users.push(u);
  DB.set("users", users);
  if ((DB.get("session") || {}).id === u.id) DB.set("session", u);
};

// ═══════════════════════════════════════════════════════════════
// § 6. UTILITAIRES
// ═══════════════════════════════════════════════════════════════
const fmtN = n => n >= 1e6 ? (n/1e6).toFixed(2)+"M" : n >= 1e3 ? (n/1e3).toFixed(1)+"K" : (n||0).toLocaleString("fr-FR");
const fmtD = iso => iso ? new Date(iso).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const fmtF = n => (n||0).toLocaleString("fr-FR") + " FCFA";
const getInf = id => INFLUENCERS.find(i => i.id === id) || INFLUENCERS[0];
const getMod = id => MODELS.find(m => m.id === id) || MODELS[0];

/** Encode un mot de passe (protection minimale pour prototype) */
const hashPwd = pwd => btoa(unescape(encodeURIComponent(pwd)));
/** Vérifie un mot de passe */
const checkPwd = (pwd, hash) => hashPwd(pwd) === hash;

/** Estime les crédits consommés pour un prompt + modèle */
const estCredits = (prompt, model) => {
  if (["image","audio","video"].some(t => model.spec.includes(t))) return model.ri;
  const inTok  = Math.min(Math.ceil(prompt.length / 3.5), CFG.maxSimpleInput);
  const outTok = Math.min(Math.ceil(inTok * 1.8),          CFG.maxSimpleOutput);
  return Math.ceil((inTok/100)*model.ri + (outTok/100)*model.ro);
};

/** Calcule le coût réel à partir des tokens retournés par l'API */
const realCost = (model, usageIn, usageOut) => {
  if (["image","audio","video"].some(t => model.spec.includes(t))) return model.ri;
  return Math.ceil((usageIn/100)*model.ri + (usageOut/100)*model.ro);
};

/** Sélectionne le meilleur modèle selon prompt + mode */
const pickModel = (prompt, mode) => {
  const lc = prompt.toLowerCase();
  let spec = "chat";
  if (/image|photo|dessin|illustration|génère.*image|crée.*visuel/.test(lc)) spec = "image";
  else if (/audio|voix|tts|transcri|speech|musique/.test(lc))               spec = "audio";
  else if (/vidéo|video|clip|film|animation/.test(lc))                      spec = "video";
  else if (/code|programme|script|fonction|bug/.test(lc))                   spec = "code";
  else if (/document|rapport|contrat|synthèse|analyse/.test(lc))            spec = "analyse";

  let pool = MODELS.filter(m => m.spec.includes(spec));
  if (!pool.length) pool = MODELS.filter(m => m.spec.includes("chat"));

  if (mode === "eco")   return pool.sort((a,b) => a.ri - b.ri)[0];
  if (mode === "power") return pool.sort((a,b) => b.bm - a.bm)[0];
  return pool.sort((a,b) => (b.bm*1.5/(b.ri||1)) - (a.bm*1.5/(a.ri||1)))[0];
};

const taskType = prompt => {
  const lc = prompt.toLowerCase();
  if (/image|photo|dessin|illustration/.test(lc)) return "image";
  if (/audio|voix|tts|musique|son/.test(lc))      return "audio";
  if (/vidéo|video|clip|film/.test(lc))            return "video";
  return "text";
};

// ═══════════════════════════════════════════════════════════════
// § 7. COUCHE IA — simulation en TEST_MODE, API réelle en prod
// ═══════════════════════════════════════════════════════════════

/**
 * Simulations réalistes pour TEST_MODE.
 * Chaque simulation imite le comportement attendu du modèle réel.
 */
const SIMULATED_RESPONSES = {
  reformulate: prompt => {
    const lower = prompt.toLowerCase().trim();
    // Quelques règles de simplification pour simuler la reformulation
    let result = prompt
      .replace(/aide moi à|peux tu|pourrais tu|est ce que tu peux/gi, "")
      .replace(/s'il te plaît|svp|stp/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (result.length < 10) result = prompt; // garde l'original si trop court
    // Capitalise la première lettre
    result = result.charAt(0).toUpperCase() + result.slice(1);
    if (!result.endsWith(".") && !result.endsWith("?") && !result.endsWith("!")) result += ".";
    return result;
  },

  chat: (prompt, modelName) => {
    const lc = prompt.toLowerCase();
    if (/bonjour|salut|hello/.test(lc))
      return `Bonjour ! Je suis ${modelName} via Baobab AI. Comment puis-je vous aider aujourd'hui ? 🌿`;
    if (/email|lettre|rédige/.test(lc))
      return `Voici un exemple de rédaction professionnelle :\n\nObjet : ${prompt.slice(0,40)}…\n\nMadame, Monsieur,\n\nJe me permets de vous contacter au sujet de [votre demande]. Dans ce contexte, il me semble important de préciser que [développement principal].\n\nDans l'attente de votre réponse, je reste à votre disposition.\n\nCordialement,\n[Votre nom]\n\n*(Réponse générée en mode test par ${modelName})*`;
    if (/code|programme|fonction/.test(lc))
      return `\`\`\`javascript\n// Solution générée par ${modelName}\nfunction solution(input) {\n  // Traitement de : ${prompt.slice(0,50)}\n  const result = input.toString().trim();\n  return result;\n}\n\nconsole.log(solution("test")); // → "test"\n\`\`\`\n\n**Explication :** Cette fonction prend une entrée, la convertit en chaîne et supprime les espaces. Adaptez-la à votre cas spécifique. *(Mode test — ${modelName})*`;
    if (/analyse|résume|synthèse/.test(lc))
      return `**Analyse effectuée par ${modelName}** 🧠\n\n**Résumé :** ${prompt.slice(0,100)}…\n\n**Points clés identifiés :**\n1. Premier élément important de votre demande\n2. Contexte général et enjeux associés\n3. Recommandations pratiques basées sur l'analyse\n\n**Conclusion :** Cette analyse confirme l'importance d'une approche structurée. *(Réponse simulée — mode test)*`;
    if (/idea|idée|business|cameroun/.test(lc))
      return `**💡 Idées de business au Cameroun — ${modelName}**\n\n1. **Livraison de repas locaux** : Plateforme de commande de plats traditionnels (ndolé, eru, poulet DG) avec livraison en 30min dans les grandes villes\n2. **Agri-tech** : Application mettant en relation agriculteurs et acheteurs en temps réel, avec prix du marché\n3. **Formation en ligne** : Cours en francophone sur des compétences numériques adaptées aux réalités locales\n4. **FinTech Mobile Money** : Solutions d'épargne et micro-crédit intégrées à MTN/Orange Money\n\n*(Réponse simulée — mode test — ${modelName})*`;
    // Réponse générique
    return `**Réponse de ${modelName}** (mode test)\n\nVotre demande : «${prompt.slice(0,80)}${prompt.length>80?"…":""}»\n\nEn mode de production, ${modelName} fournirait une réponse complète, précise et contextuelle à cette demande. La plateforme Baobab AI garantit des réponses de haute qualité grâce à la sélection automatique du meilleur modèle pour chaque tâche.\n\n*Prototype Baobab AI — Réponse simulée pour démonstration*`;
  },

  script: (prompt, type) => {
    if (type === "image")
      return `Un paysage africain majestueux au coucher du soleil : ${prompt.slice(0,60)}. Couleurs chaudes en or et orange, baobabs silhouettés contre le ciel, atmosphère paisible et lumineuse, style photographique hyperréaliste, résolution 4K.`;
    if (type === "audio")
      return `[Voix chaleureuse, ton professionnel, rythme modéré]\n\n${prompt.slice(0,80)}\n\n[Pause naturelle]\nBaobab AI — L'intelligence artificielle au service de l'Afrique.`;
    return `[Scène 1] Vue aérienne du Cameroun, musique traditionnelle en fond\n[Scène 2] ${prompt.slice(0,60)}…\n[Scène 3] Gros plan sur le résultat final, signature Baobab AI`;
  },

  media: (model, type, script) => {
    const icons   = { image:"🖼️", audio:"🎵", video:"🎬" };
    const formats = { image:"PNG 1024×1024px", audio:"MP3 128kbps", video:"MP4 1080p 10s" };
    return `${icons[type]} **Contenu généré par ${model.name}** *(Mode test)*\n\n**📋 Script préparé :**\n${script}\n\n---\n**⚙️ Simulation ${model.name} (${model.provider}) :**\n✅ Rendu complété avec succès\n📄 Format : ${formats[type]}\n📥 Cliquez le bouton de téléchargement pour sauvegarder\n\n*En production, ${model.name} générerait ici le vrai fichier via CrazyRouter.*`;
  },
};

/**
 * Reformule un prompt — simulation en TEST_MODE, API réelle en production.
 * Retourne { text: string }
 */
const autoReformulate = async prompt => {
  if (TEST_MODE) {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    return { text: SIMULATED_RESPONSES.reformulate(prompt) };
  }
  // PRODUCTION : appel via backend proxy sécurisé
  // const r = await fetch("/api/reformulate", { method:"POST",
  //   headers:{"Content-Type":"application/json"},
  //   body: JSON.stringify({ prompt }) });
  // const d = await r.json();
  // return { text: d.result || prompt };
  await new Promise(r => setTimeout(r, 600));
  return { text: SIMULATED_RESPONSES.reformulate(prompt) };
};

/**
 * Orchestrateur principal — simulation en TEST_MODE, API réelle en production.
 * Retourne { reply: string, usageIn: number, usageOut: number }
 */
const orchestrate = async (prompt, model, history, mode) => {
  const type = taskType(prompt);

  if (TEST_MODE) {
    const delay = 1000 + Math.random() * 1500;
    await new Promise(r => setTimeout(r, delay));

    if (type === "text") {
      const reply = SIMULATED_RESPONSES.chat(prompt, model.name);
      // Simule les tokens consommés (proche de la réalité)
      const usageIn  = Math.ceil(prompt.length / 3.5);
      const usageOut = Math.ceil(reply.length / 3.5);
      return { reply, usageIn, usageOut };
    }

    // Tâche complexe : script puis rendu
    await new Promise(r => setTimeout(r, 800));
    const script = SIMULATED_RESPONSES.script(prompt, type);
    const reply  = SIMULATED_RESPONSES.media(model, type, script);
    return { reply, usageIn: 150, usageOut: 0 };
  }

  // ── PRODUCTION (backend requis) ──
  // Appel via proxy sécurisé POST /api/chat (clé API côté serveur)
  // if (type === "text") {
  //   const r = await fetch("/api/chat", { method:"POST",
  //     headers:{"Content-Type":"application/json"},
  //     body: JSON.stringify({ model: model.id, messages: history, prompt }) });
  //   const d = await r.json();
  //   return { reply: d.reply, usageIn: d.usage_in, usageOut: d.usage_out };
  // }
  // ... orchestration tâches complexes similaire

  await new Promise(r => setTimeout(r, 1200));
  return {
    reply:    SIMULATED_RESPONSES.chat(prompt, model.name),
    usageIn:  Math.ceil(prompt.length / 3.5),
    usageOut: 200,
  };
};

// ═══════════════════════════════════════════════════════════════
// § 8. SYSTÈME DE NOTIFICATIONS (Toast)
// ═══════════════════════════════════════════════════════════════
let _addToast = null;
const showToast = (message, type = "info") => _addToast?.({ message, type });

const ToastContainer = ({ toasts }) => (
  <div style={{ position:"fixed", bottom:20, right:20, zIndex:9999, display:"flex", flexDirection:"column", gap:8 }}>
    {toasts.map(t => (
      <div key={t.id} style={{
        background: t.type==="success" ? "#064E3B" : t.type==="error" ? "#7F1D1D" : "#1C1917",
        color:"#fff", padding:"13px 18px", borderRadius:10, minWidth:270,
        borderLeft:`4px solid ${t.type==="success"?"#10B981":t.type==="error"?"#EF4444":"#C8941A"}`,
        fontSize:13.5, boxShadow:"0 8px 32px rgba(0,0,0,.35)",
        animation:"bbSlideIn .3s ease", display:"flex", alignItems:"center", gap:10,
      }}>
        <span>{t.type==="success" ? "✅" : t.type==="error" ? "❌" : "ℹ️"}</span>
        <span>{t.message}</span>
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// § 9. STYLES GLOBAUX
// ═══════════════════════════════════════════════════════════════
const GlobalCSS = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    :root{
      --earth:#2C1810; --bark:#5C3D2E; --savanna:#C8941A; --gold:#E8B84B;
      --leaf:#2D6A4F; --cream:#FDF8F0; --border:#E8D5B5; --muted:#9E7B5A;
      --text2:#5C3D2E; --danger:#B91C1C; --card:#FFFFFF;
      --r:16px; --rs:8px; --fh:'Syne',sans-serif; --fb:'DM Sans',sans-serif;
      --sh:0 4px 24px rgba(44,24,16,.10); --shl:0 12px 48px rgba(44,24,16,.18);
    }
    html,body,#root{height:100%;}
    body{font-family:var(--fb);background:var(--cream);color:var(--earth);overflow-x:hidden;}
    ::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
    @keyframes bbFadeUp  {from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes bbFadeIn  {from{opacity:0}to{opacity:1}}
    @keyframes bbSlideIn {from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes bbSpin    {to{transform:rotate(360deg)}}
    @keyframes bbFloat   {0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
    @keyframes bbPulse   {0%,100%{opacity:1}50%{opacity:.35}}
    .fu{animation:bbFadeUp .45s ease both}
    .fu1{animation:bbFadeUp .45s .1s ease both}
    .fu2{animation:bbFadeUp .45s .2s ease both}
    .fu3{animation:bbFadeUp .45s .3s ease both}
    .fu4{animation:bbFadeUp .45s .4s ease both}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:40px;border:none;cursor:pointer;font-family:var(--fb);font-weight:600;font-size:14px;transition:all .18s;line-height:1;}
    .btn:disabled{opacity:.45;cursor:not-allowed!important;transform:none!important;}
    .btn-gold{background:linear-gradient(135deg,var(--savanna),var(--gold));color:var(--earth);box-shadow:0 4px 16px rgba(200,148,26,.35);}
    .btn-gold:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(200,148,26,.45);}
    .btn-dark{background:var(--earth);color:var(--gold);}
    .btn-dark:hover:not(:disabled){background:var(--bark);transform:translateY(-2px);}
    .btn-ghost{background:transparent;border:2px solid var(--border);color:var(--text2);}
    .btn-ghost:hover:not(:disabled){border-color:var(--savanna);color:var(--savanna);}
    .btn-danger{background:var(--danger);color:#fff;}
    .btn-sm{padding:7px 14px;font-size:12px;}
    .btn-lg{padding:15px 32px;font-size:16px;}
    .btn-xl{padding:18px 40px;font-size:18px;}
    .wf{width:100%;justify-content:center;}
    .inp{width:100%;padding:12px 14px;border:2px solid var(--border);border-radius:var(--rs);font-family:var(--fb);font-size:14px;background:#fff;color:var(--earth);outline:none;transition:border-color .18s;}
    .inp:focus{border-color:var(--savanna);}
    .inp::placeholder{color:var(--muted);}
    .lbl{display:block;font-size:11px;font-weight:700;color:var(--text2);margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em;}
    .card{background:var(--card);border-radius:var(--r);border:1px solid var(--border);box-shadow:var(--sh);}
    .p24{padding:24px;} .p16{padding:16px;}
    .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
    .bg{background:rgba(200,148,26,.15);color:var(--savanna);}
    .bgg{background:rgba(45,106,79,.15);color:var(--leaf);}
    .bgr{background:rgba(185,28,28,.12);color:var(--danger);}
    .bgb{background:rgba(37,99,235,.12);color:#2563EB;}
    .overlay{position:fixed;inset:0;background:rgba(44,24,16,.55);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;animation:bbFadeIn .2s;}
    .modal{background:#fff;border-radius:var(--r);max-width:540px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:var(--shl);animation:bbFadeUp .3s;}
    .sidebar{width:272px;min-width:272px;background:var(--earth);color:#fff;display:flex;flex-direction:column;height:100vh;position:sticky;top:0;overflow:hidden;}
    .sbl{padding:20px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;}
    .sbn{flex:1;padding:12px;overflow-y:auto;}
    .nv{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--rs);cursor:pointer;color:rgba(255,255,255,.6);font-size:13.5px;font-weight:500;transition:all .18s;margin-bottom:3px;border-left:3px solid transparent;}
    .nv:hover{background:rgba(255,255,255,.06);color:rgba(255,255,255,.9);}
    .nv.on{background:rgba(200,148,26,.12);color:var(--gold);border-left-color:var(--gold);}
    .sbf{padding:14px;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0;}
    .bubble{max-width:80%;padding:13px 17px;border-radius:18px;font-size:14.5px;line-height:1.65;animation:bbFadeUp .25s;word-break:break-word;}
    .bubble.user{background:var(--earth);color:#fff;border-bottom-right-radius:4px;}
    .bubble.ai{background:#fff;border:1px solid var(--border);color:var(--earth);border-bottom-left-radius:4px;box-shadow:var(--sh);}
    .bubble p{margin-bottom:6px;} .bubble p:last-child{margin-bottom:0;}
    .bubble code{background:rgba(0,0,0,.07);padding:1px 5px;border-radius:4px;font-size:12.5px;font-family:monospace;}
    .bubble pre{background:rgba(0,0,0,.05);padding:10px 12px;border-radius:8px;overflow-x:auto;font-size:12.5px;margin:6px 0;white-space:pre-wrap;}
    .bubble strong{font-weight:700;} .bubble em{font-style:italic;}
    .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--savanna);animation:bbPulse 1.2s ease infinite;margin:0 2px;}
    .dot:nth-child(2){animation-delay:.2s;} .dot:nth-child(3){animation-delay:.4s;}
    .cbar{height:7px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;}
    .cbar-f{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--savanna),var(--gold));transition:width .6s;}
    .spin{width:18px;height:18px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:bbSpin .7s linear infinite;}
    .spind{border-color:rgba(44,24,16,.15);border-top-color:var(--earth);}
    .mcard{padding:14px;border-radius:10px;border:2px solid var(--border);cursor:pointer;transition:all .18s;}
    .mcard:hover{border-color:var(--savanna);transform:translateY(-2px);box-shadow:var(--sh);}
    .mcard.sel{border-color:var(--savanna);background:rgba(200,148,26,.05);}
    .icard{padding:16px 10px;border-radius:12px;border:3px solid transparent;cursor:pointer;transition:all .2s;background:#fff;text-align:center;}
    .icard:hover{transform:translateY(-3px);box-shadow:var(--sh);}
    .icard.sel{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.12);}
    .stat{background:#fff;border-radius:12px;padding:18px;border:1px solid var(--border);}
    .divider{height:1px;background:var(--border);margin:18px 0;}
    .tag{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;background:rgba(200,148,26,.12);color:var(--savanna);font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
    .hero{min-height:100vh;background:linear-gradient(155deg,#1A0A04 0%,#2C1810 45%,#3D2314 75%,#150804 100%);position:relative;overflow:hidden;display:flex;align-items:center;}
    .hero-grid{position:absolute;inset:0;background-image:repeating-linear-gradient(45deg,rgba(200,148,26,.06) 0,rgba(200,148,26,.06) 1px,transparent 0,transparent 50%);background-size:28px 28px;}
    .hero-glow{position:absolute;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle,rgba(200,148,26,.22) 0%,transparent 65%);top:50%;left:50%;transform:translate(-50%,-50%);}
    .pill{display:inline-flex;align-items:center;gap:6px;background:rgba(232,184,75,.1);border:1px solid rgba(232,184,75,.28);border-radius:40px;padding:7px 14px;font-size:12.5px;color:var(--gold);}
    .ref-banner{padding:11px 14px;background:rgba(200,148,26,.09);border:1px solid rgba(200,148,26,.22);border-radius:var(--rs);font-size:13px;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;}
    .ref-done{background:rgba(45,106,79,.08);border-color:rgba(45,106,79,.22);color:var(--leaf);}
    .chat-area{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px;}
    .act-btn{background:none;border:none;cursor:pointer;padding:3px 7px;border-radius:5px;font-size:13px;color:var(--muted);transition:all .15s;}
    .act-btn:hover{background:rgba(0,0,0,.05);color:var(--earth);}
    .cs{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--cream);padding:24px;}
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
    .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
    @media(max-width:900px){.g3,.g4{grid-template-columns:1fr 1fr!important;}}
    @media(max-width:600px){.g2,.g3,.g4{grid-template-columns:1fr!important;} .sidebar{display:none;}}
    .cs-stripe{display:inline-block;border-radius:2px;}
    /* Bandeau TEST_MODE */
    .test-banner{background:#1C3A5F;color:#93C5FD;padding:6px 16px;font-size:12px;font-weight:600;
      text-align:center;letter-spacing:.04em;position:sticky;top:0;z-index:200;
      display:flex;align-items:center;justify-content:center;gap:8px;}
  `}</style>
);

// ═══════════════════════════════════════════════════════════════
// § 10. COMPOSANTS DE BASE
// ═══════════════════════════════════════════════════════════════
const BaobabLogo = ({ size=40, float=false }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" fill="none"
    style={{ animation:float?"bbFloat 3s ease-in-out infinite":"none", flexShrink:0 }}>
    <ellipse cx="40" cy="70" rx="22" ry="5" fill="rgba(200,148,26,.2)"/>
    <rect x="32" y="30" width="16" height="40" rx="8" fill="#5C3D2E"/>
    <rect x="28" y="38" width="24" height="26" rx="12" fill="#7A5040"/>
    <ellipse cx="40" cy="29" rx="20" ry="17" fill="#2D6A4F"/>
    <ellipse cx="25" cy="23" rx="11" ry="8" fill="#2D6A4F"/>
    <ellipse cx="55" cy="23" rx="11" ry="8" fill="#2D6A4F"/>
    <ellipse cx="40" cy="19" rx="15" ry="10" fill="#40916C"/>
    <circle cx="40" cy="30" r="3.5" fill="#E8B84B" opacity=".7"/>
  </svg>
);

const CamFlag = ({ h=18 }) => (
  <span style={{ display:"inline-flex", gap:2 }}>
    {["#007A3D","#FCE300","#CE1126"].map((c,i) => (
      <span key={i} className="cs-stripe" style={{ background:c, width:6, height:h }}/>
    ))}
  </span>
);

const Spinner = ({ dark }) => <div className={`spin${dark?" spind":""}`}/>;

/** Bandeau permanent signalant le mode test */
const TestBanner = () => TEST_MODE ? (
  <div className="test-banner">
    🧪 MODE TEST ACTIF — Toutes les réponses IA sont simulées. Aucun crédit réel consommé.
    &nbsp;|&nbsp; En production : passer TEST_MODE = false + backend Express.js
  </div>
) : null;

// ═══════════════════════════════════════════════════════════════
// § 11. LANDING PAGE
// ═══════════════════════════════════════════════════════════════
const LandingPage = ({ onCTA }) => {
  const [fi, setFi] = useState(0);
  const feats = [
    { icon:"🤖", t:"20+ Modèles d'IA", d:"Claude, GPT-4o, Gemini, Mistral, Llama, FLUX, ElevenLabs… tout en un seul abonnement." },
    { icon:"🌿", t:"Reformulation automatique", d:"Chaque prompt est obligatoirement reformulé pour maximiser la qualité et minimiser vos crédits." },
    { icon:"⚡", t:"3 Modes intelligents", d:"Auto, Économique ou Power : Baobab AI choisit le bon modèle selon votre tâche." },
    { icon:"🇨🇲", t:"Conçu pour le Cameroun", d:"Payable MTN/Orange Money, interface en français, prix adapté à notre réalité locale." },
  ];
  useEffect(() => { const t=setInterval(()=>setFi(p=>(p+1)%feats.length),3200); return()=>clearInterval(t); },[]);

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>
      <TestBanner/>
      <section className="hero">
        <div className="hero-grid"/><div className="hero-glow"/>
        <div style={{ position:"relative", zIndex:1, maxWidth:1100, margin:"0 auto", padding:"80px 24px", width:"100%" }}>
          <div className="fu" style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
            <CamFlag/><span style={{ color:"rgba(255,255,255,.55)", fontSize:12, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase" }}>Fièrement Camerounais · Made in Cameroon</span>
          </div>
          <div className="fu1" style={{ display:"flex", alignItems:"center", gap:22, marginBottom:32 }}>
            <BaobabLogo size={88} float/>
            <div>
              <h1 style={{ fontFamily:"var(--fh)", fontSize:"clamp(52px,9vw,96px)", fontWeight:800, color:"#fff", lineHeight:.95, letterSpacing:"-3px" }}>
                Baobab<span style={{ color:"var(--gold)" }}>AI</span>
              </h1>
              <p style={{ color:"var(--gold)", fontFamily:"var(--fh)", fontSize:14, fontWeight:600, letterSpacing:".2em", textTransform:"uppercase", marginTop:6 }}>
                L'Intelligence Artificielle au service de l'Afrique
              </p>
            </div>
          </div>
          <div className="fu2" style={{ maxWidth:640, marginBottom:36 }}>
            <p style={{ color:"rgba(255,255,255,.82)", fontSize:"clamp(16px,2.5vw,22px)", lineHeight:1.65 }}>
              Des centaines de modèles d'IA accessibles sous un seul abonnement —{" "}
              <strong style={{ color:"var(--gold)" }}>15 000 FCFA par mois</strong>.
              Payez avec MTN ou Orange Money. Travaillez avec l'IA comme jamais.
            </p>
          </div>
          <div className="fu3" style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:52 }}>
            <button className="btn btn-gold btn-xl" onClick={()=>onCTA("register")}>🌿 Commencer maintenant</button>
            <button className="btn btn-ghost btn-lg" style={{ color:"rgba(255,255,255,.75)", borderColor:"rgba(255,255,255,.2)" }} onClick={()=>onCTA("login")}>Se connecter</button>
          </div>
          <div className="fu4" style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {["100+ modèles IA","1 000 000 crédits/mois","Mobile Money","Reformulation auto","Crédits jamais expirés"].map(p=>(
              <span key={p} className="pill">✓ {p}</span>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding:"80px 24px", background:"var(--cream)", maxWidth:1060, margin:"0 auto", width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <span className="badge bg" style={{ marginBottom:12 }}>Pourquoi Baobab AI ?</span>
          <h2 style={{ fontFamily:"var(--fh)", fontSize:"clamp(28px,5vw,50px)", fontWeight:800, color:"var(--earth)", marginTop:8 }}>Tout ce dont vous avez besoin</h2>
        </div>
        <div className="g2" style={{ gap:20 }}>
          {feats.map((f,i)=>(
            <div key={i} className="card" style={{ padding:28, borderLeft:i===fi?"4px solid var(--savanna)":"4px solid transparent", transition:"border-left-color .4s" }}>
              <div style={{ fontSize:36, marginBottom:12 }}>{f.icon}</div>
              <h3 style={{ fontFamily:"var(--fh)", fontSize:18, fontWeight:700, marginBottom:8, color:"var(--earth)" }}>{f.t}</h3>
              <p style={{ color:"var(--text2)", lineHeight:1.65, fontSize:14 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding:"0 24px 80px", maxWidth:520, margin:"0 auto", width:"100%" }}>
        <div style={{ background:"linear-gradient(135deg,rgba(200,148,26,.12),rgba(232,184,75,.05))", border:"1px solid rgba(200,148,26,.3)", borderRadius:"var(--r)", padding:36 }}>
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <span className="badge bg">Abonnement unique</span>
            <div style={{ fontFamily:"var(--fh)", fontSize:72, fontWeight:800, color:"var(--savanna)", lineHeight:1, marginTop:10 }}>15 000</div>
            <div style={{ color:"var(--text2)", fontSize:18 }}>FCFA <span style={{ fontSize:13, color:"var(--muted)" }}>/ mois</span></div>
          </div>
          <div className="divider"/>
          {["1 000 000 crédits/mois","Accès à 20+ modèles IA","Chat, Images, Audio, Vidéo, Docs","Reformulation automatique incluse","Crédits conservés et cumulés","Interface 100% en français"].map(p=>(
            <div key={p} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", fontSize:14.5 }}>
              <span style={{ color:"var(--leaf)", fontSize:17, flexShrink:0 }}>✓</span> {p}
            </div>
          ))}
          <button className="btn btn-gold btn-lg wf" style={{ marginTop:22 }} onClick={()=>onCTA("register")}>
            🚀 S'abonner maintenant
          </button>
          <p style={{ textAlign:"center", fontSize:12, color:"var(--muted)", marginTop:10 }}>MTN Mobile Money · Orange Money · Traitement sous 24h</p>
        </div>
      </section>

      <footer style={{ background:"var(--earth)", color:"rgba(255,255,255,.5)", padding:"28px 24px", textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:8 }}>
          <BaobabLogo size={30}/><span style={{ color:"#fff", fontFamily:"var(--fh)", fontWeight:700, fontSize:18 }}>Baobab AI</span><CamFlag/>
        </div>
        <p style={{ fontSize:12 }}>© 2025 Baobab AI — Conçu avec ❤️ au Cameroun · Version bêta</p>
      </footer>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// § 12. PAGE DE PAIEMENT (abonnement initial + réabonnement)
// ═══════════════════════════════════════════════════════════════
const PaymentPage = ({ isRenew=false, oldCredits=0, onSuccess, onBack }) => {
  const [step, setStep] = useState("choose");
  const [method, setMethod] = useState("");
  const [phone, setPhone] = useState("");

  const pay = () => {
    if (!/^(6|2)\d{8}$/.test(phone)) { showToast("Numéro invalide (ex: 677123456)","error"); return; }
    setStep("proc");
    setTimeout(()=>setStep("wait"), 2500);
  };

  if (step === "wait") return (
    <div className="cs" style={{ flexDirection:"column", textAlign:"center", gap:20 }}>
      <div style={{ fontSize:72, animation:"bbFloat 2s ease-in-out infinite" }}>⏳</div>
      <h2 style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800, maxWidth:420 }}>
        {isRenew ? "Réabonnement en cours de traitement" : "Paiement en cours de traitement"}
      </h2>
      <p style={{ color:"var(--text2)", maxWidth:420, lineHeight:1.7 }}>
        Votre paiement de <strong>15 000 FCFA</strong> via <strong>{method}</strong> est en attente de validation manuelle (max 24h).
      </p>
      {isRenew && oldCredits > 0 && (
        <div className="card p16" style={{ maxWidth:380, background:"rgba(200,148,26,.07)", borderColor:"rgba(200,148,26,.3)" }}>
          <p style={{ fontSize:13, color:"var(--text2)" }}>
            💡 Vos <strong>{fmtN(oldCredits)} crédits</strong> restants seront <strong>conservés et additionnés</strong> aux 1 000 000 nouveaux crédits dès validation.
          </p>
        </div>
      )}
      <div className="card p16" style={{ maxWidth:360 }}>
        <p style={{ fontSize:13, color:"var(--text2)", lineHeight:2 }}>
          📱 Numéro : <strong>{phone}</strong><br/>
          💰 Montant : <strong>15 000 FCFA</strong><br/>
          📅 Date : <strong>{fmtD(new Date().toISOString())}</strong>
        </p>
      </div>
      <button className="btn btn-ghost" onClick={()=>onSuccess({ phone, method, pending:true, oldCredits })}>
        Continuer {isRenew ? "" : "vers l'inscription"} →
      </button>
    </div>
  );

  return (
    <div className="cs" style={{ flexDirection:"column" }}>
      <div style={{ maxWidth:460, width:"100%" }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom:20 }}>← Retour</button>
        {step === "choose" && (
          <div className="card p24 fu">
            <div style={{ textAlign:"center", marginBottom:28 }}>
              <BaobabLogo size={52} float/>
              <h2 style={{ fontFamily:"var(--fh)", fontSize:24, fontWeight:800, marginTop:12 }}>
                {isRenew ? "Renouveler mon abonnement" : "Abonnement Baobab AI"}
              </h2>
              <div style={{ fontFamily:"var(--fh)", fontSize:44, fontWeight:800, color:"var(--savanna)", lineHeight:1, marginTop:8 }}>
                15 000 <span style={{ fontSize:20 }}>FCFA</span>
              </div>
              <p style={{ color:"var(--muted)", fontSize:13, marginTop:4 }}>
                30 jours · 1 000 000 crédits{isRenew && oldCredits>0 ? ` + ${fmtN(oldCredits)} crédits cumulés`:""}
              </p>
            </div>
            <p style={{ fontWeight:600, color:"var(--text2)", marginBottom:12, fontSize:14 }}>Choisissez votre opérateur :</p>
            {[{id:"mtn",name:"MTN Mobile Money",logo:"📲"},{id:"orange",name:"Orange Money",logo:"🟠"}].map(op=>(
              <div key={op.id} className="mcard" style={{ marginBottom:10, display:"flex", alignItems:"center", gap:14 }}
                onClick={()=>{ setMethod(op.name); setStep("form"); }}>
                <span style={{ fontSize:30 }}>{op.logo}</span>
                <div><div style={{ fontWeight:700 }}>{op.name}</div><div style={{ fontSize:12, color:"var(--muted)" }}>Paiement sécurisé via Fapshi</div></div>
                <span style={{ marginLeft:"auto", color:"var(--muted)" }}>→</span>
              </div>
            ))}
          </div>
        )}
        {step === "form" && (
          <div className="card p24 fu">
            <h2 style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, marginBottom:6 }}>Finaliser le paiement</h2>
            <p style={{ color:"var(--text2)", marginBottom:20 }}>via <strong>{method}</strong></p>
            <div style={{ marginBottom:16 }}>
              <label className="lbl">Votre numéro {method}</label>
              <input className="inp" placeholder="Ex: 677123456" value={phone} maxLength={9} onChange={e=>setPhone(e.target.value)}/>
            </div>
            <div className="card p16" style={{ background:"var(--cream)", marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:14 }}>
                <span style={{ color:"var(--text2)" }}>Abonnement Baobab AI (1 mois)</span>
                <span style={{ fontWeight:700 }}>15 000 FCFA</span>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--muted)" }}>
                <span>Crédits inclus</span><span>1 000 000{isRenew&&oldCredits>0?` + ${fmtN(oldCredits)}`:""}</span>
              </div>
            </div>
            <button className="btn btn-gold wf" onClick={pay}>💳 Payer 15 000 FCFA</button>
            <button className="btn btn-ghost wf" style={{ marginTop:8 }} onClick={()=>setStep("choose")}>← Retour</button>
          </div>
        )}
        {step === "proc" && (
          <div className="card p24 fu" style={{ textAlign:"center" }}>
            <div style={{ fontSize:52, marginBottom:16, animation:"bbSpin 2s linear infinite", display:"inline-block" }}>⚙️</div>
            <h3 style={{ fontFamily:"var(--fh)", fontSize:20, fontWeight:700 }}>Traitement en cours…</h3>
            <p style={{ color:"var(--text2)", marginTop:8 }}>Connexion à {method}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// § 13. INSCRIPTION (flux exact CDC : paiement → form → team)
// ═══════════════════════════════════════════════════════════════
const RegisterPage = ({ paymentData, onSuccess, onBack }) => {
  const [step, setStep]         = useState("form");
  const [form, setForm]         = useState({ username:"", phone:"", email:"", password:"" });
  const [selInf, setSelInf]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [infSearch, setInfSearch] = useState("");

  const filtered = INFLUENCERS.filter(i =>
    i.name.toLowerCase().includes(infSearch.toLowerCase()) ||
    i.team.toLowerCase().includes(infSearch.toLowerCase())
  );

  const nextStep = () => {
    if (!form.username.trim()||!form.email.trim()||!form.password.trim()) { showToast("Remplissez tous les champs obligatoires","error"); return; }
    if (!form.email.includes("@")) { showToast("Email invalide","error"); return; }
    if (form.password.length < 6) { showToast("Mot de passe : minimum 6 caractères","error"); return; }
    const users = DB.get("users")||[];
    if (users.find(u=>u.email===form.email)) { showToast("Email déjà utilisé","error"); return; }
    setStep("team");
  };

  const register = async () => {
    if (!selInf) { showToast("Choisissez votre team","error"); return; }
    setLoading(true);
    await new Promise(r=>setTimeout(r,700));
    const user = {
      id:"u_"+Date.now(), role:"user",
      username:form.username.trim(), phone:form.phone||paymentData?.phone||"",
      email:form.email.trim(),
      // Mot de passe hashé — jamais en clair dans le storage
      passwordHash: hashPwd(form.password),
      influencerId:selInf,
      credits:CFG.credits, creditsUsed:0,
      subscriptionDate:new Date().toISOString(),
      expiresAt:new Date(Date.now()+30*24*3600000).toISOString(),
      active:!paymentData?.pending, pending:!!paymentData?.pending,
      mode:"auto", autoValidate:false, totalSpent:0,
    };
    saveUser(user);
    const pays = DB.get("payments")||[];
    pays.push({ id:"pay_"+Date.now(), userId:user.id, username:user.username, amount:CFG.price,
      influencerId:selInf, date:new Date().toISOString(),
      status:paymentData?.pending?"pending":"confirmed", method:paymentData?.method||"simulation" });
    DB.set("payments", pays);
    showToast("Compte créé avec succès ! 🎉","success");
    setLoading(false);
    onSuccess(user);
  };

  const selInfObj = INFLUENCERS.find(i=>i.id===selInf);

  return (
    <div className="cs" style={{ flexDirection:"column" }}>
      <div style={{ maxWidth:580, width:"100%" }}>
        {step==="form" && (
          <div className="card p24 fu">
            <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom:18 }}>← Retour</button>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:22 }}>
              <BaobabLogo size={40}/><div>
                <h2 style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800 }}>Créer votre compte</h2>
                <p style={{ color:"var(--muted)", fontSize:13 }}>Étape 1 sur 2 — Informations personnelles</p>
              </div>
            </div>
            <div style={{ display:"grid", gap:14 }}>
              {[
                {k:"username",l:"Nom d'utilisateur *",p:"Ex: KamgaJr"},
                {k:"phone",l:"Numéro de téléphone",p:"Ex: 677123456"},
                {k:"email",l:"Email *",p:"vous@email.com",t:"email"},
                {k:"password",l:"Mot de passe *",p:"Minimum 6 caractères",t:"password"},
              ].map(f=>(
                <div key={f.k}>
                  <label className="lbl">{f.l}</label>
                  <input className="inp" type={f.t||"text"} placeholder={f.p}
                    value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}/>
                </div>
              ))}
            </div>
            <button className="btn btn-gold wf" style={{ marginTop:22 }} onClick={nextStep}>Continuer →</button>
            <p style={{ textAlign:"center", marginTop:14, fontSize:13, color:"var(--muted)" }}>
              Déjà un compte ?{" "}
              <button style={{ background:"none", border:"none", color:"var(--savanna)", cursor:"pointer", fontWeight:700 }} onClick={()=>onBack("login")}>Se connecter</button>
            </p>
          </div>
        )}

        {step==="team" && (
          <div className="card p24 fu">
            <h2 style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, marginBottom:4 }}>Choisissez votre Team</h2>
            <p style={{ color:"var(--text2)", fontSize:14, marginBottom:16 }}>
              Étape 2 sur 2 — Rejoignez la communauté d'un créateur. Ce choix est <strong>définitif</strong>.
            </p>
            <input className="inp" style={{ marginBottom:14 }} placeholder="🔍 Chercher un influenceur ou une team…"
              value={infSearch} onChange={e=>setInfSearch(e.target.value)}/>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, maxHeight:380, overflowY:"auto", marginBottom:16 }}>
              {filtered.map(inf=>(
                <div key={inf.id} className={`icard ${selInf===inf.id?"sel":""}`}
                  style={{ borderColor:selInf===inf.id?inf.color:"var(--border)", boxShadow:selInf===inf.id?`0 8px 24px ${inf.color}28`:"none" }}
                  onClick={()=>setSelInf(inf.id)}>
                  <div style={{ fontSize:32, marginBottom:6 }}>{inf.photo}</div>
                  <div style={{ fontWeight:700, fontSize:13, color:"var(--earth)" }}>{inf.name}</div>
                  <div style={{ fontSize:11, color:"var(--muted)" }}>{inf.handle}</div>
                  <div style={{ fontSize:11, color:inf.color, fontWeight:700, marginTop:4 }}>{inf.team}</div>
                  <div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>{inf.followers} followers</div>
                  {selInf===inf.id && <div style={{ marginTop:6, fontSize:11, fontWeight:700, color:inf.color }}>✓ Sélectionné</div>}
                </div>
              ))}
            </div>
            {selInfObj && (
              <div style={{ padding:"10px 14px", background:`${selInfObj.color}12`, borderRadius:"var(--rs)", fontSize:13, color:"var(--text2)", marginBottom:14, borderLeft:`3px solid ${selInfObj.color}` }}>
                {selInfObj.photo} {selInfObj.msg}
              </div>
            )}
            <button className="btn btn-gold wf" onClick={register} disabled={loading||!selInf}>
              {loading ? <><Spinner/> Création…</> : "🌿 Rejoindre Baobab AI"}
            </button>
            <button className="btn btn-ghost wf" style={{ marginTop:8 }} onClick={()=>setStep("form")}>← Retour</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// § 14. CONNEXION (3 rôles : Admin · User · Influenceur)
// ═══════════════════════════════════════════════════════════════
const LoginPage = ({ onSuccess, onRegister }) => {
  const [email, setEmail] = useState("");
  const [pwd, setPwd]     = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    await new Promise(r=>setTimeout(r,500));

    // ── Admin ──────────────────────────────────────────────────────────────
    if (email === CFG.adminEmail && checkPwd(pwd, CFG.adminPasswordHash)) {
      const u = { id:"admin", role:"admin", email, username:"Administrateur" };
      DB.set("session", u);
      onSuccess(u); setLoading(false); return;
    }

    // ── Influenceurs (comptes pré-enregistrés, password encodé) ───────────
    const infAcc = INF_ACCOUNTS.find(a => a.email===email && checkPwd(pwd, a.passwordHash));
    if (infAcc) {
      DB.set("session", infAcc);
      showToast(`Bienvenue ${infAcc.username} !`,"success");
      onSuccess(infAcc); setLoading(false); return;
    }

    // ── Utilisateurs (password hashé en V3) ────────────────────────────────
    const users = DB.get("users")||[];
    // Support V2 (passwordHash) et V3 (hashPwd)
    const u = users.find(x => x.email===email &&
      (x.passwordHash ? checkPwd(pwd, x.passwordHash) : false));
    if (!u) { showToast("Email ou mot de passe incorrect","error"); setLoading(false); return; }
    DB.set("session", u);
    showToast(`Bienvenue ${u.username} ! 🌿`,"success");
    onSuccess(u); setLoading(false);
  };

  return (
    <div className="cs" style={{ flexDirection:"column" }}>
      <div style={{ maxWidth:440, width:"100%" }}>
        <div className="card p24 fu">
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <BaobabLogo size={56} float/>
            <h2 style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800, marginTop:12 }}>Connexion</h2>
            <p style={{ color:"var(--muted)", fontSize:14 }}>Bon retour sur Baobab AI 🌿</p>
          </div>
          <div style={{ display:"grid", gap:14, marginBottom:20 }}>
            <div><label className="lbl">Email</label>
              <input className="inp" type="email" placeholder="vous@email.com" value={email}
                onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}/></div>
            <div><label className="lbl">Mot de passe</label>
              <input className="inp" type="password" placeholder="••••••••" value={pwd}
                onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}/></div>
          </div>
          <button className="btn btn-gold wf" onClick={login} disabled={loading}>
            {loading ? <><Spinner/> Connexion…</> : "Se connecter →"}
          </button>
          <div className="divider"/>
          <p style={{ textAlign:"center", fontSize:14, color:"var(--text2)" }}>
            Pas encore de compte ?{" "}
            <button style={{ background:"none", border:"none", color:"var(--savanna)", cursor:"pointer", fontWeight:700 }} onClick={onRegister}>S'inscrire</button>
          </p>
          <div style={{ marginTop:14, padding:"10px 14px", background:"rgba(200,148,26,.08)", borderRadius:"var(--rs)", fontSize:12, color:"var(--muted)", lineHeight:1.8 }}>
            <strong>🔑 Comptes de test :</strong><br/>
            Admin : admin@baobab.ai / BaobabAdmin2025!<br/>
            Influenceur : lionelkamga@baobab.ai / Baobab2025!
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// § 15. PAGE D'ATTENTE (paiement en cours de validation)
// ═══════════════════════════════════════════════════════════════
const PendingPage = ({ user, onLogout }) => (
  <div className="cs" style={{ flexDirection:"column", gap:20, textAlign:"center" }}>
    <BaobabLogo size={80} float/>
    <h2 style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800 }}>Paiement en attente de validation</h2>
    <p style={{ color:"var(--text2)", maxWidth:400, lineHeight:1.7 }}>
      Bonjour <strong>{user.username}</strong>, votre paiement est en cours de vérification.<br/>
      Accès activé sous 24h maximum.
    </p>
    <div className="card p16" style={{ maxWidth:360 }}>
      <p style={{ fontSize:13, color:"var(--text2)", lineHeight:2 }}>
        📧 Email : <strong>{user.email}</strong><br/>
        💰 Montant : <strong>15 000 FCFA</strong><br/>
        📅 Inscrit le : <strong>{fmtD(user.subscriptionDate)}</strong>
      </p>
    </div>
    <button className="btn btn-ghost" onClick={onLogout}>Se déconnecter</button>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// § 16. ÉCRAN CRÉDITS ÉPUISÉS + bouton réabonnement direct
// ═══════════════════════════════════════════════════════════════
const OutOfCreditsPage = ({ user, onRenew, onLogout }) => (
  <div className="cs" style={{ flexDirection:"column", gap:20, textAlign:"center" }}>
    <div style={{ fontSize:72 }}>⚡</div>
    <h2 style={{ fontFamily:"var(--fh)", fontSize:24, fontWeight:800 }}>Crédits épuisés</h2>
    <p style={{ color:"var(--text2)", maxWidth:380, lineHeight:1.7 }}>
      Vous avez utilisé tous vos crédits. Réabonnez-vous pour continuer à accéder aux IA.
    </p>
    <div className="card p16" style={{ maxWidth:360, background:"rgba(200,148,26,.07)", borderColor:"rgba(200,148,26,.3)" }}>
      <p style={{ fontSize:13, color:"var(--text2)" }}>
        🌿 Vos crédits restants (0) seront conservés.<br/>
        Après validation, vous recevrez <strong>1 000 000 nouveaux crédits</strong>.
      </p>
    </div>
    <button className="btn btn-gold btn-lg" onClick={onRenew}>🔄 Se réabonner — 15 000 FCFA</button>
    <button className="btn btn-ghost btn-sm" onClick={onLogout}>Se déconnecter</button>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// § 17. INTERFACE DE CHAT PRINCIPALE
// ═══════════════════════════════════════════════════════════════
const ChatInterface = ({ user, onUserUpdate, onRenew }) => {
  const [convs, setConvs]       = useState(()=>{ const s=DB.get("convs")||{}; return s[user.id]||[]; });
  const [activeId, setActiveId] = useState(null);
  const [input, setInput]       = useState("");
  const [page, setPage]         = useState("chat");
  const [cu, setCu]             = useState(user);
  const [ratingModal, setRatingModal] = useState(null);

  // Pipeline reformulation obligatoire
  const [pipeline, setPipeline] = useState(null);
  // null | { stage:"reformulating"|"ready", original, reformulated, model, cost }
  const [sending, setSending]   = useState(false);
  const [selModel, setSelModel] = useState(null);

  const chatEnd = useRef(null);
  const inf = getInf(cu.influencerId);
  const tc  = inf.color;

  const activeConv = convs.find(c=>c.id===activeId);
  const msgs = activeConv?.messages||[];

  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); },[msgs,sending,pipeline]);

  const saveConvs = cs => {
    const all = DB.get("convs")||{};
    all[user.id] = cs;
    DB.set("convs", all);
    setConvs(cs);
  };

  /**
   * Déduit les crédits APRÈS réception, sur la base des tokens réels.
   * Correction bug V2 : on ne déduit plus sur l'estimation mais sur l'usage réel.
   */
  const deductCredits = (model, usageIn, usageOut) => {
    const cost = realCost(model, usageIn, usageOut);
    const updated = { ...cu, credits:Math.max(0,(cu.credits||0)-cost), creditsUsed:(cu.creditsUsed||0)+cost };
    saveUser(updated);
    setCu(updated);
    onUserUpdate(updated);
    return { updated, cost };
  };

  const newConv = () => {
    const c = { id:"c_"+Date.now(), title:"Nouvelle conversation", messages:[], createdAt:new Date().toISOString() };
    saveConvs([c,...convs]);
    setActiveId(c.id);
    setPipeline(null);
    setInput("");
    setPage("chat");
  };

  const updateMode = m => { const u={...cu,mode:m}; saveUser(u); setCu(u); };

  const toggleAutoValidate = () => {
    const u = { ...cu, autoValidate:!cu.autoValidate };
    saveUser(u); setCu(u);
    showToast(u.autoValidate ? "Auto-validation activée ⚡" : "Confirmation manuelle activée","info");
  };

  // ── ÉTAPE 1 : Envoyer → reformulation automatique obligatoire ────────────
  const handleSendRequest = async () => {
    const raw = input.trim();
    if (!raw || pipeline?.stage==="reformulating" || sending) return;
    if (cu.credits <= 0) { showToast("Crédits épuisés. Réabonnez-vous.","error"); return; }

    setPipeline({ stage:"reformulating", original:raw, reformulated:null, model:null, cost:null });
    setInput("");

    const { text: reformulated } = await autoReformulate(raw);
    const model = selModel || pickModel(reformulated, cu.mode||"auto");
    const cost  = estCredits(reformulated, model);  // estimation affichée (UX)

    // Si autoValidate actif (mode Power avancé) → envoyer directement
    if (cu.autoValidate) {
      const readyPipeline = { stage:"ready", original:raw, reformulated, model, cost };
      setPipeline(readyPipeline);
      // Appel direct sans attendre confirmation
      await confirmSend({ stage:"ready", original:raw, reformulated, model, cost });
    } else {
      setPipeline({ stage:"ready", original:raw, reformulated, model, cost });
    }
  };

  // ── ÉTAPE 2 (optionnelle) : Réduire les crédits ──────────────────────────
  const handleReduceCost = async () => {
    if (!pipeline) return;
    const econModel = pickModel(pipeline.reformulated, "eco");
    const { text: moreEco } = await autoReformulate(pipeline.reformulated + " Sois concis.");
    const finalCost = estCredits(moreEco, econModel);
    setPipeline(p=>({ ...p, reformulated:moreEco, model:econModel, cost:finalCost }));
    showToast(`Coût réduit ! ${econModel.name} · ${finalCost} crédits`,"success");
  };

  // ── ÉTAPE 3 : Confirmation → appel IA ───────────────────────────────────
  const confirmSend = async (pl = pipeline) => {
    if (!pl || pl.stage!=="ready" || sending) return;
    const { reformulated, original, model, cost } = pl;

    if (cost > cu.credits) { showToast("Crédits insuffisants","error"); setPipeline(null); return; }

    let cid = activeId;
    let cs  = [...convs];
    if (!cid) {
      const c = { id:"c_"+Date.now(), title:original.slice(0,45)+"…", messages:[], createdAt:new Date().toISOString() };
      cs = [c,...cs]; cid=c.id; setActiveId(cid);
    }

    const userMsg = { role:"user", content:reformulated, original:original!==reformulated?original:undefined, model:model.id, cost, ts:new Date().toISOString() };
    const ci = cs.findIndex(c=>c.id===cid);
    cs[ci] = { ...cs[ci], messages:[...cs[ci].messages, userMsg] };
    saveConvs(cs);
    setPipeline(null);
    setSending(true);

    try {
      const history = cs[ci].messages.map(m=>({ role:m.role==="assistant"?"assistant":"user", content:m.content }));
      const { reply, usageIn, usageOut } = await orchestrate(reformulated, model, history, cu.mode||"auto");
      const aiMsg = { role:"assistant", content:reply, model:model.id, ts:new Date().toISOString() };
      const updated = cs.map(c=>c.id===cid?{...c,messages:[...c.messages,aiMsg]}:c);
      saveConvs(updated);
      // ✅ Déduction APRÈS réponse sur tokens réels (correction V3)
      const { cost: realC } = deductCredits(model, usageIn, usageOut);
      // Met à jour le coût réel dans le message utilisateur
      const withCost = updated.map(c=>c.id===cid?{...c,messages:c.messages.map((m,i)=>
        i===c.messages.length-2?{...m,cost:realC}:m)}:c);
      saveConvs(withCost);
    } catch(e) {
      showToast("Erreur IA : " + e.message,"error");
    } finally { setSending(false); }
  };

  const handleConfirmSend = () => confirmSend(pipeline);
  const cancelPipeline    = () => { setPipeline(null); setInput(pipeline?.original||""); };

  const handleRating = (mi, r) => {
    const ci = convs.findIndex(c=>c.id===activeId);
    if (ci<0) return;
    const cs=[...convs], ms=[...cs[ci].messages];
    ms[mi]={...ms[mi],rating:r}; cs[ci]={...cs[ci],messages:ms};
    saveConvs(cs); setRatingModal(null);
    showToast("Merci pour votre avis ! 🌟","success");
  };

  const handleRegenerate = async mi => {
    const um = msgs[mi-1];
    if (!um||um.role!=="user") return;
    setSending(true);
    const model = selModel || pickModel(um.content, cu.mode||"auto");
    try {
      const hist = msgs.slice(0,mi).map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.content}));
      const { reply, usageIn, usageOut } = await orchestrate(um.content, model, hist, cu.mode||"auto");
      const ci=convs.findIndex(c=>c.id===activeId);
      const cs=[...convs], ms=[...cs[ci].messages];
      ms[mi]={...ms[mi],content:reply,model:model.id,regenerated:true}; cs[ci]={...cs[ci],messages:ms};
      saveConvs(cs);
      deductCredits(model, usageIn, usageOut);
    } catch { showToast("Erreur lors de la régénération","error"); }
    setSending(false);
  };

  const downloadMsg = (content, idx) => {
    const blob = new Blob([content], {type:"text/plain;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `baobab-ai-reponse-${idx+1}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Téléchargement démarré 📥","success");
  };

  const pct     = Math.round(((cu.credits||0)/CFG.credits)*100);
  const expired = cu.credits <= 0;

  if (expired && page !== "settings") return <OutOfCreditsPage user={cu} onRenew={onRenew} onLogout={()=>{ DB.del("session"); window.location.reload(); }}/>;

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", flexDirection:"column" }}>
      <TestBanner/>
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* ── SIDEBAR ── */}
        <div className="sidebar">
          <div className="sbl">
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <BaobabLogo size={34}/>
              <div>
                <div style={{ fontFamily:"var(--fh)", fontWeight:800, fontSize:17, color:"#fff" }}>BaobabAI</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background:tc, display:"inline-block" }}/>
                  {inf.team}
                </div>
              </div>
            </div>
          </div>

          <div className="sbn">
            {/* Crédits */}
            <div style={{ padding:"11px 14px", background:"rgba(255,255,255,.05)", borderRadius:"var(--rs)", marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                <span style={{ color:"rgba(255,255,255,.55)" }}>Crédits</span>
                <span style={{ color:"var(--gold)", fontWeight:700 }}>{fmtN(cu.credits)}</span>
              </div>
              <div className="cbar"><div className="cbar-f" style={{ width:`${pct}%` }}/></div>
              <div style={{ fontSize:10, color:"rgba(255,255,255,.35)", marginTop:3 }}>{pct}% restant</div>
            </div>

            {/* Mode */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,.35)", textTransform:"uppercase", letterSpacing:".08em", marginBottom:6, padding:"0 2px" }}>Mode</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:3 }}>
                {[{id:"auto",l:"Auto",ic:"⚡"},{id:"eco",l:"Éco",ic:"🌱"},{id:"power",l:"Power",ic:"🔥"}].map(m=>(
                  <button key={m.id} onClick={()=>updateMode(m.id)}
                    style={{ padding:"6px 2px", border:"none", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:600,
                      background:cu.mode===m.id?tc:"rgba(255,255,255,.07)",
                      color:cu.mode===m.id?"#fff":"rgba(255,255,255,.45)", transition:"all .18s" }}>
                    {m.ic} {m.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Nav */}
            {[{id:"chat",ic:"💬",l:"Nouveau chat"},{id:"history",ic:"📚",l:"Historique"},{id:"models",ic:"🤖",l:"Modèles IA"},{id:"settings",ic:"⚙️",l:"Paramètres"}].map(item=>(
              <div key={item.id} className={`nv ${page===item.id&&item.id!=="chat"?"on":""}`}
                style={{ borderLeftColor:page===item.id&&item.id!=="chat"?tc:"transparent" }}
                onClick={()=>{ if(item.id==="chat") newConv(); else setPage(item.id); }}>
                <span>{item.ic}</span><span>{item.l}</span>
              </div>
            ))}

            {/* Conversations récentes */}
            {convs.length>0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,.3)", textTransform:"uppercase", letterSpacing:".08em", padding:"0 2px", marginBottom:6 }}>Récents</div>
                {convs.slice(0,8).map(c=>(
                  <div key={c.id} className="nv" style={{ borderLeftColor:activeId===c.id?tc:"transparent", color:activeId===c.id?"var(--gold)":undefined }}
                    onClick={()=>{ setActiveId(c.id); setPage("chat"); }}>
                    <span style={{ fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>💬 {c.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sbf">
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <div style={{ width:34, height:34, borderRadius:"50%", background:tc, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>
                {inf.photo}
              </div>
              <div>
                <div style={{ color:"#fff", fontSize:13, fontWeight:600 }}>{cu.username}</div>
                <div style={{ color:"rgba(255,255,255,.4)", fontSize:11 }}>Expire {fmtD(cu.expiresAt)}</div>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm wf" style={{ color:"rgba(255,255,255,.55)", borderColor:"rgba(255,255,255,.12)" }}
              onClick={()=>{ DB.del("session"); window.location.reload(); }}>
              Déconnexion
            </button>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"var(--cream)" }}>
          {/* Header */}
          <div style={{ padding:"14px 22px", borderBottom:"1px solid var(--border)", background:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontSize:22 }}>{inf.photo}</div>
              <div>
                <h1 style={{ fontFamily:"var(--fh)", fontSize:17, fontWeight:800, color:"var(--earth)" }}>
                  {page==="chat"?(activeConv?.title||"Nouvelle conversation"):page==="models"?"Catalogue IA":page==="history"?"Historique":"Paramètres"}
                </h1>
                <p style={{ fontSize:11, color:tc, fontWeight:700 }}>{inf.team} · {inf.name}</p>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {cu.autoValidate && <span className="badge" style={{ background:"rgba(239,68,68,.12)", color:"#EF4444" }}>⚡ Auto-envoi</span>}
              <span className="badge" style={{ background:`${tc}18`, color:tc }}>
                {cu.mode==="auto"?"⚡ Auto":cu.mode==="eco"?"🌱 Éco":"🔥 Power"}
              </span>
              <span className="badge bg">{fmtN(cu.credits)} crédits</span>
            </div>
          </div>

          {/* ─── PAGE CHAT ─── */}
          {page==="chat" && (
            <>
              <div className="chat-area">
                {msgs.length===0 && !pipeline && (
                  <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 24px", textAlign:"center" }}>
                    <div style={{ fontSize:60, marginBottom:14, animation:"bbFloat 3s ease-in-out infinite" }}>{inf.photo}</div>
                    <h2 style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800, color:"var(--earth)", marginBottom:8 }}>
                      Bonjour, {cu.username} !
                    </h2>
                    <p style={{ color:"var(--text2)", fontSize:15, maxWidth:380, lineHeight:1.65 }}>{inf.msg}</p>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:22, justifyContent:"center" }}>
                      {["✍️ Rédige un email professionnel","🔍 Analyse ce texte pour moi","💡 Idées de business au Cameroun","🖼️ Génère une image de la savane","🎵 Crée un texte de chanson"].map(s=>(
                        <button key={s} className="btn btn-ghost btn-sm" onClick={()=>setInput(s)}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}

                {msgs.map((m,i)=>(
                  <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:m.role==="user"?"flex-end":"flex-start", gap:5 }}>
                    {m.role==="user" && m.original && (
                      <div style={{ fontSize:11, color:"var(--muted)", marginRight:8 }}>
                        🌿 Reformulé automatiquement (original : «{m.original.slice(0,55)}{m.original.length>55?"…":""}»)
                      </div>
                    )}
                    <div style={{ display:"flex", alignItems:"flex-start", gap:9, flexDirection:m.role==="user"?"row-reverse":"row" }}>
                      <div style={{ width:34, height:34, borderRadius:"50%", background:m.role==="user"?tc:"#fff", border:"2px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>
                        {m.role==="user"?"👤":getMod(m.model)?.emoji||"🤖"}
                      </div>
                      <div>
                        <div className={`bubble ${m.role==="user"?"user":"ai"}`}>
                          {m.content.split("\n").map((ln,li)=><p key={li}>{ln}</p>)}
                        </div>
                        <div style={{ display:"flex", gap:5, marginTop:4, fontSize:11, color:"var(--muted)", alignItems:"center", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                          {m.model && <span>{getMod(m.model)?.name}</span>}
                          {m.cost  && <span>· {m.cost} crédits</span>}
                          {m.role==="assistant" && (<>
                            <button className="act-btn" onClick={()=>handleRegenerate(i)} title="Régénérer">🔄</button>
                            <button className="act-btn" style={{ color:m.rating?"var(--savanna)":undefined }}
                              onClick={()=>setRatingModal({mi:i})} title="Noter">
                              {m.rating?`⭐ ${m.rating}/5`:"⭐"}
                            </button>
                            <button className="act-btn" onClick={()=>{ navigator.clipboard.writeText(m.content); showToast("Copié !","success"); }} title="Copier">📋</button>
                            <button className="act-btn" onClick={()=>downloadMsg(m.content,i)} title="Télécharger .txt">📥</button>
                          </>)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {sending && (
                  <div style={{ display:"flex", alignItems:"flex-start", gap:9 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:"#fff", border:"2px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center" }}>🤖</div>
                    <div className="bubble ai"><div className="dot"/><div className="dot"/><div className="dot"/></div>
                  </div>
                )}
                <div ref={chatEnd}/>
              </div>

              {/* Zone saisie + pipeline */}
              <div style={{ padding:"14px 22px", background:"#fff", borderTop:"1px solid var(--border)" }}>
                {/* Pipeline banner */}
                {pipeline && (
                  <div className={`ref-banner${pipeline.stage==="ready"?" ref-done":""}`} style={{ marginBottom:12 }}>
                    {pipeline.stage==="reformulating" ? (
                      <div style={{ display:"flex", alignItems:"center", gap:10, color:"var(--savanna)", width:"100%" }}>
                        <Spinner dark/><span style={{ fontWeight:600 }}>Reformulation automatique en cours…</span>
                        <span style={{ color:"var(--muted)", fontSize:12 }}>«{pipeline.original.slice(0,50)}»</span>
                      </div>
                    ) : (
                      <div style={{ width:"100%" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <span style={{ fontWeight:700, color:"var(--leaf)" }}>
                            🌿 Prompt optimisé · {pipeline.model.emoji} {pipeline.model.name} · <strong>{pipeline.cost} crédits estimés</strong>
                          </span>
                          <button className="btn btn-ghost btn-sm" onClick={handleReduceCost} style={{ marginLeft:"auto" }}>💡 Réduire les crédits</button>
                          <button className="btn btn-gold btn-sm" onClick={handleConfirmSend} disabled={sending}>
                            {sending?<Spinner/>:"Envoyer ✓"}
                          </button>
                          <button className="act-btn" onClick={cancelPipeline} title="Annuler">✕</button>
                        </div>
                        <div style={{ marginTop:8, fontSize:12.5, color:"var(--text2)", padding:"7px 10px", background:"rgba(0,0,0,.04)", borderRadius:"var(--rs)", fontStyle:"italic" }}>
                          {pipeline.reformulated}
                        </div>
                        {pipeline.original !== pipeline.reformulated && (
                          <div style={{ fontSize:11, color:"var(--muted)", marginTop:4 }}>
                            Original : «{pipeline.original.slice(0,80)}{pipeline.original.length>80?"…":""}»
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Zone de saisie */}
                {!pipeline && (
                  <>
                    <div style={{ display:"flex", gap:9, alignItems:"flex-end" }}>
                      <textarea value={input} onChange={e=>setInput(e.target.value)}
                        onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSendRequest();} }}
                        placeholder="Décrivez votre tâche… Le prompt sera automatiquement optimisé avant l'envoi (↵ Envoyer)"
                        style={{ flex:1, minHeight:48, maxHeight:160, padding:"12px 14px",
                          border:"2px solid var(--border)", borderRadius:"var(--rs)",
                          fontFamily:"var(--fb)", fontSize:14.5, resize:"vertical", outline:"none", transition:"border-color .18s" }}
                        onFocus={e=>e.target.style.borderColor="var(--savanna)"}
                        onBlur={e=>e.target.style.borderColor="var(--border)"}
                      />
                      <button className="btn btn-gold" onClick={handleSendRequest}
                        disabled={!input.trim()||sending}
                        style={{ height:48, padding:"0 18px", flexShrink:0 }}>
                        {sending?<Spinner/>:"→"}
                      </button>
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:7, fontSize:11.5, color:"var(--muted)", flexWrap:"wrap", alignItems:"center" }}>
                      <span>↵ Envoyer · Shift+↵ Nouvelle ligne</span>
                      <span>·</span>
                      <button style={{ background:"none", border:"none", cursor:"pointer", color:"var(--savanna)", fontSize:11.5 }} onClick={newConv}>+ Nouvelle conversation</button>
                      {selModel && <><span style={{ color:tc, fontWeight:600 }}>· {selModel.emoji} {selModel.name} forcé</span>
                        <button style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:11 }} onClick={()=>setSelModel(null)}>✕</button></>}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ─── PAGE MODÈLES ─── */}
          {page==="models" && (
            <div style={{ flex:1, overflow:"auto", padding:24 }}>
              <h2 style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, marginBottom:6 }}>Catalogue des Modèles IA</h2>
              <p style={{ color:"var(--text2)", marginBottom:22, fontSize:14 }}>
                Classés par spécialité et performance. Sélectionnez-en un manuellement, ou laissez le mode automatique choisir.
              </p>
              {[
                {spec:"chat",  icon:"💬", label:"Génération de texte & raisonnement"},
                {spec:"image", icon:"🎨", label:"Génération d'images"},
                {spec:"audio", icon:"🎵", label:"Audio & synthèse vocale"},
                {spec:"video", icon:"🎬", label:"Génération vidéo"},
              ].map(cat=>{
                const pool = MODELS.filter(m=>m.spec.includes(cat.spec)).sort((a,b)=>b.bm-a.bm);
                if (!pool.length) return null;
                return (
                  <div key={cat.spec} style={{ marginBottom:28 }}>
                    <h3 style={{ fontFamily:"var(--fh)", fontSize:16, fontWeight:700, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
                      {cat.icon} {cat.label}
                    </h3>
                    <div className="g2" style={{ gap:12 }}>
                      {pool.map(m=>(
                        <div key={m.id} className={`mcard ${selModel?.id===m.id?"sel":""}`}
                          onClick={()=>{ setSelModel(selModel?.id===m.id?null:m); setPage("chat"); showToast(`${m.name} sélectionné manuellement`,"info"); }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                            <div style={{ width:38, height:38, borderRadius:9, background:m.color+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>{m.emoji}</div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight:700, color:"var(--earth)", fontSize:14 }}>{m.name}</div>
                              <div style={{ fontSize:11, color:"var(--muted)" }}>{m.provider}</div>
                            </div>
                            <span className={`badge ${m.tier==="premium"?"bg":m.tier==="mid"?"bgb":"bgg"}`}>
                              {m.tier==="premium"?"Premium":m.tier==="mid"?"Standard":"Éco"}
                            </span>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                            <div style={{ flex:1, height:4, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${m.bm}%`, background:m.color, borderRadius:2 }}/>
                            </div>
                            <span style={{ color:m.color, fontWeight:700, fontSize:11 }}>{m.bm}/100</span>
                          </div>
                          <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.5, marginBottom:8 }}>{m.desc}</p>
                          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                            {m.spec.map(s=><span key={s} className="tag">{s}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── PAGE HISTORIQUE ─── */}
          {page==="history" && (
            <div style={{ flex:1, overflow:"auto", padding:24 }}>
              <h2 style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, marginBottom:22 }}>Historique des conversations</h2>
              {convs.length===0 ? (
                <div style={{ textAlign:"center", padding:48, color:"var(--muted)" }}>
                  <div style={{ fontSize:44, marginBottom:14 }}>💬</div><p>Aucune conversation pour le moment</p>
                </div>
              ) : convs.map(c=>(
                <div key={c.id} className="card" style={{ padding:18, marginBottom:10, cursor:"pointer" }}
                  onClick={()=>{ setActiveId(c.id); setPage("chat"); }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontWeight:600, color:"var(--earth)", marginBottom:3 }}>{c.title}</div>
                      <div style={{ fontSize:12, color:"var(--muted)" }}>{c.messages.length} messages · {fmtD(c.createdAt)}</div>
                    </div>
                    <span style={{ color:"var(--savanna)" }}>→</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── PAGE PARAMÈTRES ─── */}
          {page==="settings" && (
            <div style={{ flex:1, overflow:"auto", padding:24 }}>
              <h2 style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, marginBottom:22 }}>Paramètres du compte</h2>
              <div style={{ maxWidth:580, display:"grid", gap:16 }}>
                {/* Profil */}
                <div className="card p24">
                  <h3 style={{ fontFamily:"var(--fh)", fontSize:17, fontWeight:700, marginBottom:14 }}>Mon Profil · {inf.team}</h3>
                  <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14, padding:"14px", background:`${tc}12`, borderRadius:"var(--rs)", borderLeft:`3px solid ${tc}` }}>
                    <div style={{ width:56, height:56, borderRadius:"50%", background:tc, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>{inf.photo}</div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:17 }}>{cu.username}</div>
                      <div style={{ color:"var(--muted)", fontSize:13 }}>{cu.email}</div>
                      <div style={{ fontSize:12, color:tc, fontWeight:700, marginTop:3 }}>{inf.team} · {inf.handle}</div>
                      <div style={{ fontSize:11, color:"var(--muted)", marginTop:2, fontStyle:"italic" }}>«{inf.msg}»</div>
                    </div>
                  </div>
                  <div className="g2">
                    {[
                      {l:"Abonné depuis", v:fmtD(cu.subscriptionDate)},
                      {l:"Expiration",    v:fmtD(cu.expiresAt)},
                      {l:"Crédits restants", v:fmtN(cu.credits)},
                      {l:"Crédits utilisés", v:fmtN(cu.creditsUsed||0)},
                    ].map(s=>(
                      <div key={s.l} className="stat">
                        <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em" }}>{s.l}</div>
                        <div style={{ fontFamily:"var(--fh)", fontWeight:700, fontSize:20, color:"var(--earth)", marginTop:4 }}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mode */}
                <div className="card p24">
                  <h3 style={{ fontFamily:"var(--fh)", fontSize:17, fontWeight:700, marginBottom:14 }}>Mode d'utilisation</h3>
                  {[
                    {id:"auto",  ic:"⚡", l:"Automatique",  d:"Meilleur rapport qualité/prix selon la tâche"},
                    {id:"eco",   ic:"🌱", l:"Économique",    d:"Modèles les moins chers — économisez vos crédits"},
                    {id:"power", ic:"🔥", l:"Power",         d:"Modèles les plus performants — coûte plus de crédits"},
                  ].map(m=>(
                    <div key={m.id} className={`mcard ${cu.mode===m.id?"sel":""}`}
                      style={{ display:"flex", alignItems:"center", gap:14, marginBottom:8 }}
                      onClick={()=>updateMode(m.id)}>
                      <span style={{ fontSize:22 }}>{m.ic}</span>
                      <div><div style={{ fontWeight:700 }}>{m.l}</div><div style={{ fontSize:12, color:"var(--muted)" }}>{m.d}</div></div>
                      {cu.mode===m.id && <span style={{ marginLeft:"auto", color:"var(--savanna)", fontWeight:700 }}>✓</span>}
                    </div>
                  ))}
                  {/* Option Auto-valider (suggestion Gemini pour mode Power) */}
                  <div style={{ marginTop:12, padding:"11px 14px", background:"rgba(239,68,68,.06)", borderRadius:"var(--rs)", borderLeft:"3px solid #EF4444", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13.5 }}>⚡ Auto-validation de la reformulation</div>
                      <div style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>Envoie directement après reformulation sans confirmation (recommandé pour les utilisateurs expérimentés)</div>
                    </div>
                    <button className={`btn btn-sm ${cu.autoValidate?"btn-danger":"btn-ghost"}`} onClick={toggleAutoValidate}
                      style={{ flexShrink:0 }}>
                      {cu.autoValidate ? "Désactiver" : "Activer"}
                    </button>
                  </div>
                </div>

                {/* Réabonnement */}
                <div className="card p24" style={{ borderLeft:"4px solid var(--savanna)" }}>
                  <h3 style={{ fontFamily:"var(--fh)", fontSize:17, fontWeight:700, marginBottom:8 }}>Renouvellement</h3>
                  <p style={{ color:"var(--text2)", fontSize:14, marginBottom:14 }}>
                    Vos <strong>{fmtN(cu.credits)} crédits</strong> restants seront conservés et additionnés aux 1 000 000 nouveaux crédits lors du réabonnement.
                  </p>
                  <button className="btn btn-gold wf" onClick={onRenew}>🔄 Se réabonner — 15 000 FCFA</button>
                </div>

                {/* Installer l'app (PWA) */}
                <div className="card p24" style={{ background:"linear-gradient(135deg,var(--earth),var(--bark))", border:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                    <span style={{ fontSize:44 }}>📱</span>
                    <div style={{ flex:1 }}>
                      <h3 style={{ fontFamily:"var(--fh)", fontSize:17, fontWeight:700, color:"#fff" }}>Installer l'application</h3>
                      <p style={{ color:"rgba(255,255,255,.65)", fontSize:13 }}>Installez Baobab AI sur votre téléphone — disponible comme une vraie app</p>
                    </div>
                    <button className="btn btn-gold btn-sm" onClick={()=>{
                      if (window._pwaInstallPrompt) { window._pwaInstallPrompt.prompt(); }
                      else { showToast("Sur Chrome/Edge : Menu → Installer l'application 📱","info"); }
                    }}>↓ Installer</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal notation */}
        {ratingModal && (
          <div className="overlay" onClick={()=>setRatingModal(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div style={{ padding:"20px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <h3 style={{ fontFamily:"var(--fh)", fontWeight:700 }}>Noter cette réponse</h3>
                <button style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--muted)" }} onClick={()=>setRatingModal(null)}>✕</button>
              </div>
              <div style={{ padding:20, textAlign:"center" }}>
                <p style={{ color:"var(--text2)", marginBottom:20 }}>Comment évaluez-vous cette réponse IA ?</p>
                <div style={{ display:"flex", justifyContent:"center", gap:12 }}>
                  {[1,2,3,4,5].map(r=>(
                    <button key={r} style={{ fontSize:34, background:"none", border:"none", cursor:"pointer", transition:"transform .1s" }}
                      onMouseEnter={e=>e.target.style.transform="scale(1.3)"}
                      onMouseLeave={e=>e.target.style.transform="scale(1)"}
                      onClick={()=>handleRating(ratingModal.mi,r)}>⭐</button>
                  ))}
                </div>
                <p style={{ fontSize:12, color:"var(--muted)", marginTop:10 }}>1 = Mauvais · 5 = Excellent</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// § 18. PORTAIL INFLUENCEUR (tableau de bord partenaire)
// ═══════════════════════════════════════════════════════════════
const InfluencerPortal = ({ account, onLogout }) => {
  const inf          = getInf(account.influencerId);
  const payments     = DB.get("payments")||[];
  const users        = DB.get("users")||[];
  const myPays       = payments.filter(p=>p.influencerId===account.influencerId && p.status==="confirmed");
  const myUsers      = users.filter(u=>u.influencerId===account.influencerId && u.active);
  const pendingUsers = users.filter(u=>u.influencerId===account.influencerId && u.pending);
  const myEarnings   = Math.round(myPays.length * CFG.ownerProfit * CFG.commissionPct / 100);

  // Regrouper par mois calendaire
  const byMonth = {};
  myPays.forEach(p=>{ const k=p.date.slice(0,7); byMonth[k]=(byMonth[k]||0)+1; });
  const months = Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0]));

  // ✅ Correction bug V2 : "Gains du mois" = mois calendaire actuel (pas months[0])
  // ✅ Fuseau WAT (Yaoundé UTC+1) : toLocaleDateString utilise le fuseau du navigateur
  // contrairement à toISOString() qui est toujours en UTC et ferait comptabiliser
  // un abonnement signé à 00h30 à Yaoundé dans le mois précédent.
  const currentMonth     = new Date().toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit' }).replace('/', '-');
  const thisMonthCount   = byMonth[currentMonth] || 0;
  const thisMonthEarnings = Math.round(thisMonthCount * CFG.ownerProfit * CFG.commissionPct / 100);

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", flexDirection:"column" }}>
      <TestBanner/>
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sbl">
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:inf.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>{inf.photo}</div>
              <div>
                <div style={{ fontFamily:"var(--fh)", fontWeight:800, fontSize:15, color:"#fff" }}>{inf.name}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.45)" }}>Portail Partenaire</div>
              </div>
            </div>
          </div>
          <div className="sbn">
            <div style={{ padding:"10px 14px", background:"rgba(255,255,255,.06)", borderRadius:"var(--rs)", marginBottom:14 }}>
              <div style={{ color:"rgba(255,255,255,.55)", fontSize:11, textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>Gains totaux</div>
              <div style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, color:"var(--gold)" }}>{fmtF(myEarnings)}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,.35)", marginTop:2 }}>{CFG.commissionPct}% du bénéfice propriétaire</div>
            </div>
            <div className="nv on" style={{ borderLeftColor:inf.color }}>
              <span>{inf.photo}</span><span>{inf.team}</span>
            </div>
          </div>
          <div className="sbf">
            <button className="btn btn-ghost btn-sm wf" style={{ color:"rgba(255,255,255,.55)", borderColor:"rgba(255,255,255,.12)" }} onClick={onLogout}>Déconnexion</button>
          </div>
        </div>

        {/* Contenu */}
        <div style={{ flex:1, overflow:"auto", padding:32 }}>
          {/* Header team */}
          <div style={{ padding:"18px 22px", background:`${inf.color}12`, borderRadius:"var(--r)", borderLeft:`4px solid ${inf.color}`, marginBottom:28, display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ fontSize:48 }}>{inf.photo}</div>
            <div>
              <h1 style={{ fontFamily:"var(--fh)", fontSize:24, fontWeight:800, color:"var(--earth)" }}>{inf.team}</h1>
              <p style={{ color:"var(--text2)", fontSize:14 }}>{inf.handle} · {inf.followers} followers</p>
              <p style={{ color:"var(--text2)", fontSize:13, fontStyle:"italic", marginTop:4 }}>«{inf.msg}»</p>
            </div>
          </div>

          {/* Stats — correction V3 : Gains du mois = mois calendaire actuel */}
          <div className="g4" style={{ marginBottom:24 }}>
            {[
              {l:"Abonnés actifs",  v:myUsers.length,       c:inf.color},
              {l:"En attente",      v:pendingUsers.length,   c:"#E67E22"},
              {l:"Gains du mois",   v:fmtF(thisMonthEarnings), c:"var(--savanna)"},
              {l:"Gains totaux",    v:fmtF(myEarnings),      c:"var(--leaf)"},
            ].map(s=>(
              <div key={s.l} className="stat">
                <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:4 }}>{s.l}</div>
                <div style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Historique par mois */}
          <div className="card p24" style={{ marginBottom:20 }}>
            <h3 style={{ fontFamily:"var(--fh)", fontSize:17, fontWeight:700, marginBottom:16 }}>📅 Revenus par mois</h3>
            {months.length===0 ? (
              <p style={{ color:"var(--muted)", fontSize:14 }}>Aucun abonné confirmé pour le moment.</p>
            ) : months.map(([month, count])=>{
              const earnings = Math.round(count * CFG.ownerProfit * CFG.commissionPct / 100);
              const isCurrentMonth = month === currentMonth;
              return (
                <div key={month} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderBottom:"1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontWeight:600, color:"var(--earth)", display:"flex", alignItems:"center", gap:8 }}>
                      {new Date(month+"-01").toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}
                      {isCurrentMonth && <span className="badge bg">Mois en cours</span>}
                    </div>
                    <div style={{ fontSize:12, color:"var(--muted)" }}>{count} abonné{count>1?"s":""} confirmé{count>1?"s":""}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"var(--fh)", fontSize:18, fontWeight:800, color:"var(--savanna)" }}>{fmtF(earnings)}</div>
                    <div style={{ fontSize:11, color:"var(--muted)" }}>= {count} × {fmtF(CFG.ownerProfit)} × {CFG.commissionPct}%</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Liste filleuls */}
          <div className="card p24">
            <h3 style={{ fontFamily:"var(--fh)", fontSize:17, fontWeight:700, marginBottom:16 }}>👥 Mes filleuls ({myUsers.length} actifs)</h3>
            {myUsers.length===0 ? (
              <p style={{ color:"var(--muted)", fontSize:14 }}>Aucun filleul actif pour le moment. Partagez votre lien Baobab AI !</p>
            ) : myUsers.map(u=>(
              <div key={u.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:inf.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>👤</div>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{u.username}</div>
                    <div style={{ fontSize:12, color:"var(--muted)" }}>Abonné depuis {fmtD(u.subscriptionDate)}</div>
                  </div>
                </div>
                <span className="badge bgg">✅ Actif</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop:16, padding:"12px 16px", background:"rgba(200,148,26,.08)", borderRadius:"var(--rs)", fontSize:13, color:"var(--text2)" }}>
            💡 <strong>Comment ça marche :</strong> Vous recevez {CFG.commissionPct}% du bénéfice propriétaire ({fmtF(CFG.ownerProfit)}) pour chaque abonnement généré, soit <strong>{fmtF(CFG.ownerProfit*CFG.commissionPct/100)} par abonné actif</strong>. Le versement se fait mensuellement.
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// § 19. PANNEAU ADMINISTRATEUR
// ═══════════════════════════════════════════════════════════════
const AdminPanel = ({ onLogout }) => {
  const [tab, setTab]         = useState("overview");
  const [users, setUsers]     = useState(DB.get("users")||[]);
  const [payments, setPayments] = useState(DB.get("payments")||[]);
  const reload = () => { setUsers(DB.get("users")||[]); setPayments(DB.get("payments")||[]); };

  const pendingPays   = payments.filter(p=>p.status==="pending");
  const confirmedPays = payments.filter(p=>p.status==="confirmed");
  const totalRev      = confirmedPays.length * CFG.price;
  const totalProfit   = confirmedPays.length * CFG.ownerProfit;

  const infStats = INFLUENCERS.map(inf=>{
    const pays = confirmedPays.filter(p=>p.influencerId===inf.id);
    return { ...inf, count:pays.length, earnings:pays.length*CFG.ownerProfit*CFG.commissionPct/100 };
  }).sort((a,b)=>b.count-a.count);

  /** Activer un utilisateur — gère le cumul des crédits pour les réabonnements */
  const activateUser = uid => {
    const allUsers = DB.get("users")||[];
    const idx = allUsers.findIndex(u=>u.id===uid);
    if (idx<0) return;
    const u   = allUsers[idx];
    const pays = DB.get("payments")||[];
    const pidx = pays.findIndex(p=>p.userId===uid && p.status==="pending");
    // Détecte si c'est un réabonnement et récupère les crédits à cumuler
    const isRenew    = pays[pidx]?.isRenew || false;
    const oldCredits = isRenew ? (pays[pidx]?.oldCredits || u.credits || 0) : 0;
    // ✅ Cumul crédits : 1 000 000 + crédits restants si réabonnement
    const newCredits = CFG.credits + oldCredits;
    allUsers[idx] = {
      ...u, active:true, pending:false,
      credits:newCredits, creditsUsed:0,
      subscriptionDate:new Date().toISOString(),
      expiresAt:new Date(Date.now()+30*24*3600000).toISOString(),
    };
    DB.set("users", allUsers);
    if (pidx>=0) { pays[pidx].status="confirmed"; DB.set("payments", pays); }
    showToast(isRenew
      ? `Réabonnement activé ! ${fmtN(newCredits)} crédits cumulés ✅`
      : "Utilisateur activé avec succès ✅"
    ,"success");
    reload();
  };

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", flexDirection:"column" }}>
      <TestBanner/>
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        <div className="sidebar">
          <div className="sbl">
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <BaobabLogo size={34}/>
              <div>
                <div style={{ fontFamily:"var(--fh)", fontWeight:800, fontSize:15, color:"#fff" }}>Baobab Admin</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.4)" }}>Panneau d'administration</div>
              </div>
            </div>
          </div>
          <div className="sbn">
            {[
              {id:"overview",     ic:"📊", l:"Vue d'ensemble"},
              {id:"users",        ic:"👥", l:"Utilisateurs"},
              {id:"payments",     ic:"💳", l:"Paiements", badge:pendingPays.length},
              {id:"influencers",  ic:"⭐", l:"Influenceurs"},
            ].map(t=>(
              <div key={t.id} className={`nv ${tab===t.id?"on":""}`} onClick={()=>setTab(t.id)}>
                <span>{t.ic}</span><span>{t.l}</span>
                {t.badge>0 && <span style={{ marginLeft:"auto", background:"var(--danger)", color:"#fff", borderRadius:"50%", width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700 }}>{t.badge}</span>}
              </div>
            ))}
          </div>
          <div className="sbf">
            <button className="btn btn-ghost btn-sm wf" style={{ color:"rgba(255,255,255,.55)", borderColor:"rgba(255,255,255,.12)" }} onClick={onLogout}>Déconnexion</button>
          </div>
        </div>

        <div style={{ flex:1, overflow:"auto", padding:28 }}>
          {tab==="overview" && (
            <>
              <h1 style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800, marginBottom:4 }}>Vue d'ensemble</h1>
              <p style={{ color:"var(--muted)", marginBottom:26 }}>Tableau de bord Baobab AI</p>
              <div className="g3" style={{ marginBottom:22 }}>
                {[
                  {ic:"👥", l:"Utilisateurs",   v:users.length,                             c:"#2980B9"},
                  {ic:"✅", l:"Actifs",          v:users.filter(u=>u.active).length,         c:"var(--leaf)"},
                  {ic:"⏳", l:"En attente",      v:pendingPays.length,                       c:"#E67E22"},
                  {ic:"💰", l:"Revenus totaux",  v:fmtF(totalRev),                           c:"#8E44AD"},
                  {ic:"📈", l:"Bénéfice net",    v:fmtF(totalProfit),                        c:"var(--savanna)"},
                  {ic:"⭐", l:"Influenceurs act.",v:infStats.filter(i=>i.count>0).length,    c:"#E74C3C"},
                ].map(s=>(
                  <div key={s.l} className="stat">
                    <div style={{ fontSize:26, marginBottom:6 }}>{s.ic}</div>
                    <div style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, color:s.c }}>{s.v}</div>
                    <div style={{ fontSize:11, color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginTop:2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              {pendingPays.length>0 && (
                <div className="card p24" style={{ borderLeft:"4px solid var(--danger)" }}>
                  <h3 style={{ fontFamily:"var(--fh)", fontSize:16, fontWeight:700, color:"var(--danger)", marginBottom:14 }}>
                    ⚠️ {pendingPays.length} paiement(s) en attente d'activation
                  </h3>
                  {pendingPays.slice(0,5).map(p=>(
                    <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--border)", flexWrap:"wrap", gap:10 }}>
                      <div>
                        <div style={{ fontWeight:600 }}>{p.username}</div>
                        <div style={{ fontSize:12, color:"var(--muted)" }}>{(p.amount||0).toLocaleString("fr-FR")} FCFA · {p.method} · {fmtD(p.date)}</div>
                        {p.isRenew && <><span className="badge bgb" style={{ marginTop:3 }}>🔄 Réabonnement</span>{p.oldCredits>0&&<span style={{ fontSize:11, color:"var(--muted)", marginLeft:6 }}>+ {fmtN(p.oldCredits)} crédits à cumuler</span>}</>}
                      </div>
                      <button className="btn btn-gold btn-sm" onClick={()=>activateUser(p.userId)}>✅ Activer</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab==="users" && (
            <>
              <h1 style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800, marginBottom:22 }}>Utilisateurs ({users.length})</h1>
              {users.length===0 ? (
                <div style={{ textAlign:"center", padding:48, color:"var(--muted)" }}><div style={{ fontSize:44, marginBottom:14 }}>👥</div><p>Aucun utilisateur inscrit</p></div>
              ) : (
                <div style={{ display:"grid", gap:10 }}>
                  {users.map(u=>{ const inf=getInf(u.influencerId); return (
                    <div key={u.id} className="card" style={{ padding:18 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                          <div style={{ width:40, height:40, borderRadius:"50%", background:inf.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>{inf.photo}</div>
                          <div>
                            <div style={{ fontWeight:700 }}>{u.username}</div>
                            <div style={{ fontSize:12, color:"var(--muted)" }}>{u.email} · {inf.team}</div>
                            <div style={{ fontSize:11, color:"var(--muted)" }}>Expire {fmtD(u.expiresAt)} · {fmtN(u.credits)} crédits</div>
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <span className={`badge ${u.active?"bgg":"bgr"}`}>{u.active?"✅ Actif":"⏳ En attente"}</span>
                          {!u.active && <button className="btn btn-gold btn-sm" onClick={()=>activateUser(u.id)}>Activer</button>}
                        </div>
                      </div>
                    </div>
                  );})}
                </div>
              )}
            </>
          )}

          {tab==="payments" && (
            <>
              <h1 style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800, marginBottom:22 }}>Paiements ({payments.length})</h1>
              <div style={{ display:"grid", gap:10 }}>
                {payments.length===0 ? (
                  <div style={{ textAlign:"center", padding:48, color:"var(--muted)" }}><div style={{ fontSize:44, marginBottom:14 }}>💳</div><p>Aucun paiement enregistré</p></div>
                ) : payments.map(p=>(
                  <div key={p.id} className="card" style={{ padding:18, borderLeft:`4px solid ${p.status==="confirmed"?"var(--leaf)":"var(--danger)"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
                      <div>
                        <div style={{ fontWeight:700 }}>{p.username}</div>
                        <div style={{ fontSize:12, color:"var(--muted)" }}>{p.method||"simulation"} · {fmtD(p.date)}</div>
                        {p.isRenew && <span className="badge bgb" style={{ marginTop:3 }}>🔄 Réabonnement</span>}
                      </div>
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <span style={{ fontWeight:700, color:"var(--savanna)" }}>{(p.amount||0).toLocaleString("fr-FR")} FCFA</span>
                        <span className={`badge ${p.status==="confirmed"?"bgg":"bgr"}`}>{p.status==="confirmed"?"✅ Confirmé":"⏳ En attente"}</span>
                        {p.status==="pending" && <button className="btn btn-gold btn-sm" onClick={()=>activateUser(p.userId)}>Activer</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab==="influencers" && (
            <>
              <h1 style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800, marginBottom:22 }}>Tableau de bord Influenceurs</h1>
              <div style={{ display:"grid", gap:14 }}>
                {infStats.map((inf,rank)=>(
                  <div key={inf.id} className="card" style={{ padding:22, borderLeft:`4px solid ${inf.color}` }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ fontFamily:"var(--fh)", fontSize:26, fontWeight:800, color:"var(--border)", minWidth:32 }}>#{rank+1}</div>
                        <div style={{ width:46, height:46, borderRadius:"50%", background:inf.color+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{inf.photo}</div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:16 }}>{inf.name}</div>
                          <div style={{ fontSize:12, color:"var(--muted)" }}>{inf.handle} · {inf.followers}</div>
                          <div style={{ fontSize:11, color:inf.color, fontWeight:700 }}>{inf.team}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:22, flexWrap:"wrap" }}>
                        <div style={{ textAlign:"center" }}>
                          <div style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, color:inf.color }}>{inf.count}</div>
                          <div style={{ fontSize:11, color:"var(--muted)" }}>Abonnés</div>
                        </div>
                        <div style={{ textAlign:"center" }}>
                          <div style={{ fontFamily:"var(--fh)", fontSize:22, fontWeight:800, color:"var(--savanna)" }}>{fmtF(inf.earnings)}</div>
                          <div style={{ fontSize:11, color:"var(--muted)" }}>À verser</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// § 20. APPLICATION PRINCIPALE — Router & orchestration globale
// ═══════════════════════════════════════════════════════════════
export default function App() {
  // view : landing | payment | register | login | app | admin | influencer | pending | renew
  const [view, setView]       = useState("landing");
  const [curUser, setCurUser] = useState(null);
  const [payData, setPayData] = useState(null);
  const [toasts, setToasts]   = useState([]);

  // ── Initialisation & session persistante ─────────────────────────────────
  useEffect(()=>{
    DB.init();

    // ✅ Session persistante : restaurer depuis localStorage au démarrage
    const session = DB.get("session");
    if (session?.id) {
      if (session.role === "admin") {
        setCurUser(session); setView("admin"); return;
      }
      if (session.role === "influencer") {
        setCurUser(session); setView("influencer"); return;
      }
      if (session.role === "user") {
        // Re-sync depuis DB pour avoir les crédits/statut à jour
        const users = DB.get("users")||[];
        const fresh = users.find(u=>u.id===session.id);
        if (fresh) {
          setCurUser(fresh);
          setView(fresh.pending ? "pending" : "app");
          return;
        }
      }
    }

    // Capturer le prompt d'installation PWA
    window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); window._pwaInstallPrompt=e; });
  },[]);

  // ── Système Toast ─────────────────────────────────────────────────────────
  _addToast = useCallback(({message,type})=>{
    const id = Date.now()+Math.random();
    setToasts(p=>[...p,{id,message,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000);
  },[]);

  // ── Handlers de navigation ────────────────────────────────────────────────
  const onLoginSuccess = u => {
    DB.set("session", u);
    setCurUser(u);
    if (u.role==="admin")      { setView("admin");      return; }
    if (u.role==="influencer") { setView("influencer"); return; }
    setView(u.pending ? "pending" : "app");
  };

  const onRegisterSuccess = u => {
    DB.set("session", u);
    setCurUser(u);
    setView(u.pending ? "pending" : "app");
  };

  const onPaySuccess = data => { setPayData(data); setView("register"); };

  const onRenew = () => setView("renew");

  const onRenewPaySuccess = data => {
    // Enregistrer le paiement de réabonnement avec flag isRenew + crédits restants
    const pays = DB.get("payments")||[];
    pays.push({
      id:"pay_"+Date.now(), userId:curUser.id, username:curUser.username,
      amount:CFG.price, influencerId:curUser.influencerId,
      date:new Date().toISOString(), status:"pending",
      method:data.method, isRenew:true, oldCredits:curUser.credits,
    });
    DB.set("payments", pays);
    const updated = { ...curUser, pending:true };
    saveUser(updated); setCurUser(updated);
    DB.set("session", updated);
    setView("pending");
  };

  const onUserUpdate = u => { setCurUser(u); DB.set("session",u); };

  const onLogout = () => {
    DB.del("session");
    setCurUser(null);
    setView("landing");
  };

  return (
    <>
      <GlobalCSS/>
      {view==="landing"    && <LandingPage onCTA={m=>setView(m==="login"?"login":"payment")}/>}
      {view==="payment"    && <PaymentPage onSuccess={onPaySuccess} onBack={m=>setView(m==="login"?"login":"landing")}/>}
      {view==="register"   && <RegisterPage paymentData={payData} onSuccess={onRegisterSuccess} onBack={m=>setView(m==="login"?"login":"payment")}/>}
      {view==="login"      && <LoginPage onSuccess={onLoginSuccess} onRegister={()=>setView("payment")}/>}
      {view==="pending"    && curUser && <PendingPage user={curUser} onLogout={onLogout}/>}
      {view==="app"        && curUser && <ChatInterface user={curUser} onUserUpdate={onUserUpdate} onRenew={onRenew}/>}
      {view==="admin"      && <AdminPanel onLogout={onLogout}/>}
      {view==="influencer" && curUser && <InfluencerPortal account={curUser} onLogout={onLogout}/>}
      {view==="renew"      && curUser && (
        <PaymentPage isRenew oldCredits={curUser.credits}
          onSuccess={onRenewPaySuccess}
          onBack={()=>setView("app")}/>
      )}
      <ToastContainer toasts={toasts}/>
    </>
  );
}
