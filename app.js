/* ============================================================
   VIDEFRIGO — app.js
   Modes : Quotidien | Sport (Sèche / Maintien / Masse)
         | Recomposition corporelle (Tonification / Endurance / Optimisation)
   ============================================================ */

/* ── State ── */
const S = {
  sc:      'home',
  dark:    false,
  mode:    'daily',
  goal:    'maintien',
  recomp:  'toning',
  ings:    new Set(),
  recs:    [],
  sel:     null,
  favs:    [],
  loading: false,
  err:     null,
  prevSc:  'home',
  // Voice
  voiceState:      'idle',   // idle | listening | done | unsupported
  voiceTranscript: '',
  voiceAdded:      [],
};

/* ── Ingredient lists ── */
const CHIPS = {
  daily: [
    {e:'🍗',l:'Poulet'},{e:'🥚',l:'Œufs'},{e:'🍚',l:'Riz'},{e:'🍝',l:'Pâtes'},
    {e:'🥔',l:'Pommes de terre'},{e:'🐟',l:'Thon en boîte'},{e:'🧀',l:'Fromage'},
    {e:'🍅',l:'Tomates'},{e:'🧅',l:'Oignons'},{e:'🧄',l:'Ail'},{e:'🥕',l:'Carottes'},
    {e:'🫘',l:'Lentilles'},{e:'🥓',l:'Jambon'},{e:'🥬',l:'Épinards'},{e:'🥦',l:'Brocoli'},
  ],
  sport: [
    {e:'🥛',l:'Yaourt grec'},{e:'🍳',l:'Blanc d\'œuf'},{e:'🐟',l:'Thon en boîte'},
    {e:'🍗',l:'Poulet'},{e:'🫘',l:'Lentilles'},{e:'🥚',l:'Œufs'},{e:'🍚',l:'Riz'},
    {e:'🥦',l:'Brocoli'},{e:'🍝',l:'Pâtes'},{e:'🥔',l:'Pommes de terre'},
    {e:'🧅',l:'Oignons'},{e:'🧄',l:'Ail'},{e:'🥕',l:'Carottes'},{e:'🥬',l:'Épinards'},
    {e:'🍅',l:'Tomates'},{e:'🧀',l:'Fromage cottage'},
  ],
  recomp: [
    {e:'🍗',l:'Poulet'},{e:'🥚',l:'Œufs'},{e:'🫘',l:'Lentilles'},{e:'🐟',l:'Thon en boîte'},
    {e:'🥛',l:'Yaourt grec'},{e:'🥦',l:'Brocoli'},{e:'🍳',l:'Blanc d\'œuf'},
    {e:'🍚',l:'Riz complet'},{e:'🥔',l:'Patate douce'},{e:'🧀',l:'Fromage cottage'},
    {e:'🥬',l:'Épinards'},{e:'🧅',l:'Oignons'},{e:'🧄',l:'Ail'},{e:'🥕',l:'Carottes'},
    {e:'🍝',l:'Pâtes complètes'},{e:'🫑',l:'Poivron'},
  ],
};

/* ── Helpers ── */
function chipOnClass() {
  return S.mode === 'sport' ? 'on-s' : S.mode === 'recomp' ? 'on-r' : 'on-g';
}
function tagClass()  { return S.mode === 'sport' ? 'sp' : S.mode === 'recomp' ? 'rc' : ''; }
function stepClass() { return S.mode === 'sport' ? 'sp' : S.mode === 'recomp' ? 'rc' : ''; }
function accentClass(){ return S.mode === 'sport' ? 'ac-s' : S.mode === 'recomp' ? 'ac-r' : 'ac-g'; }
function modeColor()  { return S.mode === 'sport' ? 'var(--sp)' : S.mode === 'recomp' ? 'var(--rc)' : 'var(--p)'; }
function modeTxt()    { return S.mode === 'sport' ? 'var(--sptxt)' : S.mode === 'recomp' ? 'var(--rctxt)' : 'var(--ptxt)'; }

/* ════════════════════════════════════════════
   VOICE RECOGNITION
   ════════════════════════════════════════════ */

// Normalize string: lowercase + remove accents + simplify
function norm(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['\s-]+/g, ' ').trim();
}

let _voiceRec = null;

function toggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    S.voiceState = 'unsupported';
    S.err = 'Reconnaissance vocale non disponible. Utilisez Chrome ou Safari sur iOS 14.5+.';
    render(); return;
  }

  // Already listening → stop
  if (S.voiceState === 'listening') {
    _voiceRec && _voiceRec.stop();
    S.voiceState = 'idle';
    render(); return;
  }

  S.voiceState      = 'listening';
  S.voiceTranscript = '';
  S.voiceAdded      = [];
  render();

  _voiceRec = new SR();
  _voiceRec.lang            = 'fr-FR';
  _voiceRec.continuous      = false;
  _voiceRec.interimResults  = true;
  _voiceRec.maxAlternatives = 1;

  _voiceRec.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ');
    S.voiceTranscript = transcript;
    const isFinal = e.results[e.results.length - 1].isFinal;
    if (isFinal) {
      S.voiceAdded = parseVoiceIngredients(transcript);
      S.voiceState = 'done';
    }
    render();
  };

  _voiceRec.onerror = (e) => {
    S.voiceState = 'idle';
    if (e.error === 'not-allowed' || e.error === 'permission-denied') {
      S.err = '🎙️ Accès au micro refusé. Autorisez-le dans les réglages de votre navigateur.';
    } else if (e.error === 'no-speech') {
      S.err = 'Aucune parole détectée. Réessayez en parlant plus clairement.';
    }
    render();
  };

  _voiceRec.onend = () => {
    if (S.voiceState === 'listening') { S.voiceState = 'idle'; render(); }
  };

  try { _voiceRec.start(); } catch(e) { S.voiceState = 'idle'; render(); }
}

function parseVoiceIngredients(transcript) {
  // Clean: remove French articles / fillers
  const cleaned = norm(transcript)
    .replace(/\b(j'?ai|il y a|il ya|dans mon frigo|dans le frigo|dans ma cuisine|chez moi|a la maison)\b/g, '')
    .replace(/\b(du|de la|des|le|la|les|un|une|de|d'?|avec|et|plus|aussi|un peu de|beaucoup de|encore|il reste|il me reste|j'?ai aussi|il y a aussi)\b/g, ' ')
    .replace(/[,;.!?\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Collect all chip labels from all modes
  const allChips = [];
  Object.values(CHIPS).forEach(list => list.forEach(c => {
    if (!allChips.some(x => x.l === c.l)) allChips.push(c);
  }));

  const added = [];

  for (const chip of allChips) {
    if (S.ings.size >= 5) break;
    if (S.ings.has(chip.l)) continue;

    const chipNorm = norm(chip.l);
    // Check each word of chip label against transcript
    const chipWords = chipNorm.split(' ');
    const mainWord  = chipWords[0]; // Most distinctive word

    // Match if transcript contains the main word (min 3 chars to avoid false positives)
    if (mainWord.length >= 3 && cleaned.includes(mainWord)) {
      S.ings.add(chip.l);
      added.push(chip.l);
    }
  }

  return added;
}

/* ── Sport Score ── */
function scoreRecipe(macros, goal, mode) {
  if (!macros) return null;
  let s = 5;
  if (mode === 'sport') {
    if (goal === 'seche') {
      if (macros.lipides_g < 10) s += 3; else if (macros.lipides_g < 15) s += 1; else if (macros.lipides_g > 25) s -= 2;
      if (macros.proteines_g > 25) s += 2; else if (macros.proteines_g > 20) s += 1;
    } else if (goal === 'masse') {
      if (macros.proteines_g > 35) s += 3; else if (macros.proteines_g > 25) s += 1;
      if (macros.calories > 400) s += 2; else if (macros.calories < 250) s -= 2;
    } else {
      const r = macros.proteines_g / Math.max(macros.lipides_g, 1);
      if (r > 2) s += 2; else if (r > 1.5) s += 1;
      if (macros.calories < 550 && macros.calories > 250) s += 1;
    }
  } else if (mode === 'recomp') {
    // Recomp score: ideal is high protein, moderate carbs, low-medium fat
    const ratio = macros.proteines_g / Math.max(macros.lipides_g, 1);
    if (ratio > 2.5) s += 3; else if (ratio > 2) s += 2; else if (ratio > 1.5) s += 1; else s -= 1;
    if (macros.calories >= 300 && macros.calories <= 550) s += 2;
    else if (macros.calories < 250 || macros.calories > 650) s -= 1;
    if (goal === 'toning' && macros.lipides_g < 15) s += 1;
    if (goal === 'endurance' && macros.glucides_g > 30) s += 1;
    if (goal === 'optim') {
      if (macros.proteines_g >= 25 && macros.lipides_g < 20) s += 1;
    }
  }
  return Math.min(10, Math.max(1, Math.round(s)));
}
function scoreLbl(s) {
  if (s >= 9) return 'Excellent ⭐'; if (s >= 7) return 'Très adapté'; if (s >= 5) return 'Correct'; return 'Peu adapté';
}

/* ── Macros HTML ── */
function macrosHtml(m, noBorder) {
  if (!m) return '';
  const items = [
    { v: m.calories,    l: 'kcal',   c: 'var(--txt2)', pct: Math.min(m.calories/600*100,100) },
    { v: m.proteines_g+'g', l: 'Prot.',  c: S.mode==='recomp'?'var(--rc)':'var(--p)',  pct: Math.min(m.proteines_g/50*100,100) },
    { v: m.lipides_g+'g',   l: 'Lip.',   c: 'var(--sp)', pct: Math.min(m.lipides_g/40*100,100) },
    { v: m.glucides_g+'g',  l: 'Gluc.',  c: '#888',      pct: Math.min(m.glucides_g/80*100,100) },
  ];
  const style = noBorder ? 'padding:0;border:none;' : '';
  return `<div class="mxs" style="${style}">${items.map(it =>
    `<div class="mxi">
      <span class="mxv">${it.v}</span>
      <span class="mxl">${it.l}</span>
      <div class="mxbw"><div class="mxbf" style="width:${Math.round(it.pct)}%;background:${it.c}"></div></div>
    </div>`
  ).join('')}</div>`;
}

/* ── Substitution HTML ── */
function subHtml(sub) {
  if (!sub) return '';
  let tip = sub.astuce;
  if (S.mode === 'sport' && sub.astuce_sport) tip = sub.astuce_sport;
  if (S.mode === 'recomp' && sub.astuce_recomp) tip = sub.astuce_recomp;
  return `
    <div class="sub">
      <div class="sublbl"><span>💡</span><span>Substitution — ${sub.ingredient_manquant}</span></div>
      <p class="subtxt">${tip}</p>
    </div>`;
}

/* ── Skeleton Loader ── */
function skelHtml() {
  return [1,2,3].map(() => `
    <div class="skel">
      <div class="skl" style="width:60%"></div>
      <div class="skl" style="width:80%"></div>
      <div class="skl" style="width:45%"></div>
    </div>`
  ).join('');
}

/* ── Recipe Card HTML ── */
function rcCardHtml(r, i, openFn) {
  const fav  = S.favs.some(f => f.titre === r.titre);
  const sc   = (S.mode !== 'daily' && r.macros) ? scoreRecipe(r.macros, S.mode==='sport'?S.goal:S.recomp, S.mode) : null;
  const badgeHtml = sc !== null
    ? (S.mode === 'recomp'
        ? `<span class="brec">✦ ${sc}/10</span>`
        : `<span class="bspt">⚡ ${sc}/10</span>`)
    : '';
  const cardClass = S.mode === 'sport' ? 'sp' : S.mode === 'recomp' ? 'rc-mode' : '';

  return `
    <div class="rc-card ${cardClass}" style="animation-delay:${i*0.1}s" onclick="${openFn}(${i})">
      <div class="rct">
        <div class="rctit">${r.titre}</div>
        <div class="rcbdg">
          <span class="btim"><i class="ti ti-clock" aria-hidden="true"></i> ${r.temps_preparation}</span>
          ${badgeHtml}
        </div>
      </div>
      <div style="padding:0 16px 10px">
        <div class="itags">${r.ingredients_base.map(x => `<span class="itag">${x}</span>`).join('')}</div>
      </div>
      ${subHtml(r.substitution_maline)}
      ${S.mode !== 'daily' && r.macros ? macrosHtml(r.macros, false) : ''}
      <div style="padding:9px 16px 11px;display:flex;justify-content:space-between;align-items:center;border-top:0.5px solid var(--bdr)">
        <span style="font-size:13px;color:var(--txt2)">Voir la recette</span>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="fbtn${fav?' on':''}" onclick="event.stopPropagation();tfav(${i},'rec')" aria-label="${fav?'Retirer des favoris':'Sauvegarder'}">
            <i class="ti ti-heart" aria-hidden="true"></i>
          </button>
          <i class="ti ti-arrow-right" style="color:var(--txt3);font-size:18px" aria-hidden="true"></i>
        </div>
      </div>
    </div>`;
}

/* ── Goal / Recomp Descriptions ── */
const GOAL_INFO = {
  sport: {
    seche:    { emoji:'🔥', short:'Sèche',    desc:'< 15g lip · > 25g prot'  },
    maintien: { emoji:'⚖️', short:'Maintien', desc:'Macros équilibrées'      },
    masse:    { emoji:'💪', short:'Masse',    desc:'> 35g prot · > 400 kcal' },
  },
  recomp: {
    toning:   { emoji:'🎯', short:'Tonification', desc:'Prot élevées · faible gras'    },
    endurance:{ emoji:'🏃', short:'Endurance',    desc:'Glucides complexes · modéré'   },
    optim:    { emoji:'⚙️', short:'Optimisation', desc:'Prot + timing · tout équilibré'},
  },
};

const ADVICE = {
  sport: {
    seche:    `<p style="margin-bottom:8px">🔥 <strong style="color:var(--txt)">Sèche :</strong> moins de 15g de lipides et plus de 25g de protéines par repas.</p><p>✅ Favoriser : blanc d'œuf, thon, poulet sans peau, yaourt grec 0%, légumineuses.<br>❌ Éviter : sauces grasses, fromages riches, sucres ajoutés.</p>`,
    maintien: `<p style="margin-bottom:8px">⚖️ <strong style="color:var(--txt)">Maintien :</strong> ratio protéines/lipides ≥ 2:1. Cible 400–550 kcal par repas.</p><p>✅ Bases : œufs entiers, légumineuses, légumes variés, glucides complexes.</p>`,
    masse:    `<p style="margin-bottom:8px">💪 <strong style="color:var(--txt)">Prise de masse :</strong> plus de 35g de protéines et plus de 400 kcal par repas.</p><p>✅ Booster avec : légumineuses, fromage blanc, œufs entiers, riz, patate douce. Combinez protéines + glucides complexes.</p>`,
  },
  recomp: {
    toning:   `<p style="margin-bottom:8px">🎯 <strong style="color:var(--txt)">Recomp — Tonification :</strong> perdre de la graisse tout en maintenant (ou légèrement gagnant) du muscle.</p>
               <p style="margin-bottom:8px">✅ Recettes idéales : protéines > 30g, lipides < 15g, glucides modérés (25–40g).<br>💡 Timing : consommer des protéines dans les 90 min post-entraînement.</p>
               <p>🚫 Éviter les pics glycémiques (sucres rapides, pain blanc).</p>`,
    endurance:`<p style="margin-bottom:8px">🏃 <strong style="color:var(--txt)">Recomp — Endurance :</strong> soutenir l'effort physique prolongé tout en préservant la masse musculaire.</p>
               <p style="margin-bottom:8px">✅ Glucides complexes > 40g par repas principal (riz complet, patate douce, pâtes complètes).<br>💡 Protéines 20–30g pour la récupération musculaire.</p>
               <p>⚡ Fenêtre nutritionnelle : manger dans les 30 min après l'effort.</p>`,
    optim:    `<p style="margin-bottom:8px">⚙️ <strong style="color:var(--txt)">Recomp — Optimisation :</strong> maximiser la partition nutritionnelle (muscle ↑, graisse ↓ simultanément).</p>
               <p style="margin-bottom:8px">✅ Ratio idéal : prot 35–40%, glucides 35–40%, lipides 20–25%.<br>💡 Favoriser les glucides autour des entraînements, les lipides sains au repos.</p>
               <p>🔄 Cyclisation : légèrement plus de glucides les jours d'entraînement intense.</p>`,
  },
};

/* ════════════════════════════════════════════
   SCREENS
   ════════════════════════════════════════════ */

/* ── HOME ── */
function renderHome(H, C) {
  const hr  = new Date().getHours();
  const grt = hr < 12 ? 'Bonjour 👋' : hr < 18 ? 'Bon après-midi 🌤' : 'Bonsoir 🌙';
  const sels = [...S.ings];
  const ok   = sels.length >= 2;
  const chips = CHIPS[S.mode] || CHIPS.daily;

  /* Mode-specific UI blocks */
  let goalBlock = '';
  if (S.mode === 'sport') {
    const goals = ['seche','maintien','masse'];
    goalBlock = `
      <span style="display:block;height:10px"></span>
      <p class="chint" style="margin-bottom:7px">Objectif</p>
      <div class="gtabs">
        ${goals.map(g => {
          const info = GOAL_INFO.sport[g];
          return `<button class="gtab${S.goal===g?' on-s':''}" onclick="setGoal('${g}')">
            <span class="gti">${info.emoji}</span>
            <span class="gtl">${info.short}</span>
          </button>`;
        }).join('')}
      </div>`;
  } else if (S.mode === 'recomp') {
    const goals = ['toning','endurance','optim'];
    goalBlock = `
      <span style="display:block;height:10px"></span>
      <p class="chint" style="margin-bottom:7px">Phase de recomposition</p>
      <div class="gtabs">
        ${goals.map(g => {
          const info = GOAL_INFO.recomp[g];
          return `<button class="gtab${S.recomp===g?' on-r':''}" onclick="setRecomp('${g}')">
            <span class="gti">${info.emoji}</span>
            <span class="gtl">${info.short}</span>
          </button>`;
        }).join('')}
      </div>`;
  }

  /* Banner */
  let bannerHtml = '';
  if (S.mode === 'sport') {
    const info = GOAL_INFO.sport[S.goal];
    bannerHtml = `
      <div class="banner sp">
        <i class="ti ti-bolt" aria-hidden="true"></i>
        <div class="bantxt"><strong class="s">Mode Sport — ${info.short}</strong> · ${info.desc}</div>
      </div>`;
  } else if (S.mode === 'recomp') {
    const info = GOAL_INFO.recomp[S.recomp];
    bannerHtml = `
      <div class="banner rc">
        <i class="ti ti-refresh" aria-hidden="true"></i>
        <div class="bantxt"><strong class="r">Recomposition — ${info.short}</strong> · ${info.desc}</div>
      </div>`;
  }

  /* CTA label & class */
  const ctaCls  = S.mode === 'sport' ? 'cta sp' : S.mode === 'recomp' ? 'cta rc' : 'cta';
  const ctaIcon = S.mode === 'recomp' ? 'ti-refresh' : 'ti-star';

  H.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <p class="chint">${grt}</p>
        <div class="h1">Vide<span class="${accentClass()}">Frigo</span></div>
      </div>
      <button class="ibtn" onclick="tDark()" aria-label="Basculer le thème">
        <i class="ti ${S.dark?'ti-sun':'ti-moon'}" aria-hidden="true"></i>
      </button>
    </div>`;

  C.innerHTML = `
    <!-- Mode selector -->
    <div class="vc">
      <div class="vcp">
        <p class="slbl">Mode</p>
        <div class="mtog">
          <button class="mtab${S.mode==='daily'?' on':''}" onclick="setMode('daily')">
            <i class="ti ti-home" aria-hidden="true"></i> Quotidien
          </button>
          <button class="mtab sp${S.mode==='sport'?' on':''}" onclick="setMode('sport')">
            <i class="ti ti-bolt" aria-hidden="true"></i> Sport
          </button>
          <button class="mtab rc${S.mode==='recomp'?' on':''}" onclick="setMode('recomp')">
            <i class="ti ti-refresh" aria-hidden="true"></i> Recomp
          </button>
        </div>
        ${goalBlock}
      </div>
    </div>

    ${bannerHtml}

    <!-- Ingredient picker -->
    <div class="vc">
      <div class="vcp">
        <p class="slbl">
          Mes ingrédients
          ${S.mode==='recomp'?' · Favoris recomposition':''}
          ${S.mode==='sport'?' · Riches en protéines':''}
        </p>
        <div class="chips" style="margin-bottom:12px">
          ${chips.map(c => `
            <button class="chip${S.ings.has(c.l)?' '+chipOnClass():''}" onclick="ting('${c.l.replace(/'/g,"\\'")}')">${c.e} ${c.l}</button>
          `).join('')}
        </div>
        <div class="crow" style="margin-bottom:12px">
          <input type="text" id="ci" placeholder="Autre ingrédient…" onkeydown="if(event.key==='Enter')addIng()" />
          <button onclick="addIng()">+ Ajouter</button>
        </div>
        <p class="chint" style="margin-bottom:${sels.length?'10px':'0'}">
          ${sels.length === 0 ? 'Choisissez 2 à 5 ingrédients'
          : sels.length < 2  ? `Encore ${2-sels.length} ingrédient(s) pour commencer`
                              : `${sels.length} sélectionné${sels.length>1?'s':''} ✓`}
        </p>
        ${sels.length ? `
          <div class="sarea">
            ${sels.map(i => `
              <div class="stag ${tagClass()}">${i}
                <button class="srm" onclick="ring('${i.replace(/'/g,"\\'")}')" aria-label="Retirer ${i}">×</button>
              </div>`).join('')}
          </div>` : ''}
      </div>
    </div>

    ${S.err ? `<div class="errb"><i class="ti ti-alert-circle" aria-hidden="true"></i><span>${S.err}</span></div>` : ''}

    <!-- Voice Input Button -->
    <button class="voice-btn ${S.voiceState === 'listening' ? 'listening' : ''}" onclick="toggleVoice()" aria-label="Dicter les ingrédients">
      ${S.voiceState === 'listening'
        ? `<span class="voice-dot"></span> J'écoute… parlez maintenant`
        : `<i class="ti ti-microphone" aria-hidden="true"></i> Dicter mes ingrédients`}
    </button>

    <!-- Voice Feedback -->
    ${S.voiceState === 'done' && S.voiceTranscript ? `
      <div class="voice-feedback">
        <p class="vf-label">🎙️ Entendu</p>
        <p class="vf-transcript">"${S.voiceTranscript}"</p>
        <p class="vf-added">
          ${S.voiceAdded.length
            ? `✅ Ajouté : ${S.voiceAdded.join(', ')}`
            : `Aucun ingrédient reconnu — ajoutez-les manuellement ci-dessus`}
        </p>
      </div>` : ''}

    <button class="${ctaCls}" id="ctabtn" ${!ok || S.loading ? 'disabled' : ''} onclick="gen()">
      ${S.loading
        ? `<span class="spin"></span> Génération en cours…`
        : `<i class="ti ${ctaIcon}" aria-hidden="true"></i> Trouver des recettes`}
    </button>

    ${S.loading ? `<span style="display:block;height:12px"></span>${skelHtml()}` : ''}`;
}

/* ── RESULTS ── */
function renderRes(H, C) {
  H.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <button class="bbtn" onclick="go('home')" aria-label="Retour"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
      <div>
        <div class="h1" style="font-size:18px">Vos recettes</div>
        <p class="chint">${[...S.ings].join(', ')}</p>
      </div>
      <button class="ibtn" style="margin-left:auto" onclick="tDark()">
        <i class="ti ${S.dark?'ti-sun':'ti-moon'}" aria-hidden="true"></i>
      </button>
    </div>`;

  let bannerHtml = '';
  if (S.mode === 'sport') {
    const info = GOAL_INFO.sport[S.goal];
    bannerHtml = `<div class="banner sp"><i class="ti ti-bolt" aria-hidden="true"></i><div class="bantxt"><strong class="s">${info.short}</strong> — macros affichées</div></div>`;
  } else if (S.mode === 'recomp') {
    const info = GOAL_INFO.recomp[S.recomp];
    bannerHtml = `<div class="banner rc"><i class="ti ti-refresh" aria-hidden="true"></i><div class="bantxt"><strong class="r">${info.short}</strong> — score recompo · macros détaillées</div></div>`;
  }

  C.innerHTML = `
    ${bannerHtml}
    ${S.recs.map((r, i) => rcCardHtml(r, i, 'openR')).join('')}
    <button class="cta ghost" style="margin-top:6px" onclick="go('home')">
      <i class="ti ti-refresh" aria-hidden="true"></i> Nouvelle recherche
    </button>`;
}

/* ── DETAIL ── */
function renderDet(H, C) {
  const r = S.sel;
  if (!r) { go('res'); return; }
  const fav = S.favs.some(f => f.titre === r.titre);
  const sc  = (S.mode !== 'daily' && r.macros) ? scoreRecipe(r.macros, S.mode==='sport'?S.goal:S.recomp, S.mode) : null;
  const snC = stepClass();

  H.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <button class="bbtn" onclick="goBack()" aria-label="Retour"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>
      <div class="h1" style="font-size:16px;flex:1;line-height:1.3">${r.titre}</div>
      <button class="fbtn${fav?' on':''}" onclick="tfav(0,'det')" aria-label="${fav?'Retirer':'Sauvegarder'}">
        <i class="ti ti-heart" aria-hidden="true"></i>
      </button>
    </div>`;

  /* Macros + score card */
  let macroCard = '';
  if (S.mode !== 'daily' && r.macros) {
    const scoreBadge = sc !== null ? `
      <div style="margin-top:12px;padding-top:10px;border-top:0.5px solid var(--bdr);display:flex;align-items:center;gap:12px">
        <div class="score-ring${S.mode==='recomp'?'':' sp'}">${sc}</div>
        <div>
          <p style="font-size:14px;font-weight:600;color:${modeColor()}">${scoreLbl(sc)}</p>
          <p class="chint">${S.mode==='recomp'?'Score recomposition':'Score sport'} /10</p>
        </div>
      </div>` : '';
    macroCard = `
      <div class="vc" style="margin-bottom:10px">
        <div class="vcp">
          <p class="slbl">Valeurs nutritionnelles estimées</p>
          ${macrosHtml(r.macros, true)}
          ${scoreBadge}
        </div>
      </div>`;
  }

  /* Substitution card */
  const subCard = r.substitution_maline ? `
    <div class="vc" style="margin-bottom:10px">
      <div class="vcp">
        <div class="sublbl"><span>💡</span><span>Substitution — ${r.substitution_maline.ingredient_manquant}</span></div>
        <p class="subtxt" style="margin-top:6px">
          ${S.mode==='recomp' && r.substitution_maline.astuce_recomp
            ? r.substitution_maline.astuce_recomp
            : S.mode==='sport' && r.substitution_maline.astuce_sport
            ? r.substitution_maline.astuce_sport
            : r.substitution_maline.astuce}
        </p>
      </div>
    </div>` : '';

  C.innerHTML = `
    <!-- Meta -->
    <div class="vc" style="margin-bottom:10px">
      <div class="vcp">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="btim"><i class="ti ti-clock" aria-hidden="true"></i> ${r.temps_preparation}</span>
          ${sc !== null ? (S.mode==='recomp'?`<span class="brec">✦ ${sc}/10</span>`:`<span class="bspt">⚡ ${sc}/10</span>`) : ''}
        </div>
        <span style="display:block;height:10px"></span>
        <p class="slbl">Ingrédients</p>
        <div class="itags">${r.ingredients_base.map(x=>`<span class="itag">${x}</span>`).join('')}</div>
      </div>
    </div>

    ${subCard}
    ${macroCard}

    <!-- Steps -->
    <div class="vc" style="margin-bottom:10px">
      <div class="vcp">
        <p class="slbl">Étapes de préparation</p>
        <ul class="stps">
          ${r.etapes.map((step, i) => `
            <li class="sti">
              <span class="stn ${snC}">${i+1}</span>
              <span class="stt">${step}</span>
            </li>`).join('')}
        </ul>
      </div>
    </div>

    <!-- Actions -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="cta ghost" style="font-size:13px;padding:11px" onclick="tfav(0,'det')">
        <i class="ti ti-heart" aria-hidden="true"></i> ${fav?'Retiré':'Sauvegarder'}
      </button>
      <button class="cta" style="font-size:13px;padding:11px;background:${modeColor()}" onclick="go('home')">
        <i class="ti ti-refresh" aria-hidden="true"></i> Nouvelle
      </button>
    </div>`;
}

/* ── FAVORITES ── */
function renderFav(H, C) {
  H.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div class="h1">Favoris</div>
        <p class="chint">${S.favs.length} recette${S.favs.length!==1?'s':''} sauvegardée${S.favs.length!==1?'s':''}</p>
      </div>
      <button class="ibtn" onclick="tDark()"><i class="ti ${S.dark?'ti-sun':'ti-moon'}" aria-hidden="true"></i></button>
    </div>`;

  if (!S.favs.length) {
    C.innerHTML = `
      <div class="empty">
        <i class="ti ti-heart" aria-hidden="true"></i>
        <p>Aucune recette sauvegardée.<br>Explorez et ajoutez vos favoris !</p>
      </div>
      <button class="cta" onclick="go('home')">
        <i class="ti ti-star" aria-hidden="true"></i> Trouver des recettes
      </button>`;
    return;
  }

  C.innerHTML = S.favs.map((r, i) => {
    const sc = (S.mode !== 'daily' && r.macros) ? scoreRecipe(r.macros, S.mode==='sport'?S.goal:S.recomp, S.mode) : null;
    return `
      <div class="rc-card" style="animation-delay:${i*0.08}s" onclick="openF(${i})">
        <div class="rct">
          <div class="rctit">${r.titre}</div>
          <div class="rcbdg">
            <span class="btim"><i class="ti ti-clock" aria-hidden="true"></i> ${r.temps_preparation}</span>
            ${sc ? `<span class="brec">✦ ${sc}/10</span>` : ''}
          </div>
        </div>
        <div style="padding:0 16px 10px">
          <div class="itags">${r.ingredients_base.slice(0,4).map(x=>`<span class="itag">${x}</span>`).join('')}${r.ingredients_base.length>4?`<span class="itag">+${r.ingredients_base.length-4}</span>`:''}</div>
        </div>
        <div style="padding:8px 16px 11px;display:flex;justify-content:space-between;align-items:center;border-top:0.5px solid var(--bdr)">
          <span style="font-size:13px;color:var(--txt2)">Voir la recette</span>
          <button class="fbtn on" onclick="event.stopPropagation();rmFav(${i})" aria-label="Retirer des favoris">
            <i class="ti ti-heart" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}

/* ── PROFILE ── */
function renderProf(H, C) {
  H.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="h1">Profil</div>
      <button class="ibtn" onclick="tDark()"><i class="ti ${S.dark?'ti-sun':'ti-moon'}" aria-hidden="true"></i></button>
    </div>`;

  /* Recomp phase cards */
  const recompPhasesHtml = S.mode === 'recomp' ? `
    <div class="trow" style="flex-direction:column;align-items:flex-start;gap:10px;border-bottom:none">
      <p class="ttit">Phase de recomposition</p>
      <div class="recomp-phases">
        ${[
          {id:'toning',   e:'🎯', t:'Tonification',  d:'Prot élevées, gras faible'},
          {id:'endurance',e:'🏃', t:'Endurance',      d:'Glucides + récupération'},
          {id:'optim',    e:'⚙️', t:'Optimisation',   d:'Partition maximale'},
        ].map(p => `
          <div class="phase-card${S.recomp===p.id?' active':''}" onclick="setRecomp('${p.id}');render()" style="cursor:pointer">
            <span class="phase-icon">${p.e}</span>
            <p class="phase-title">${p.t}</p>
            <p class="phase-desc">${p.d}</p>
          </div>`).join('')}
        <div style="grid-column:1/-1;font-size:12px;color:var(--txt2);line-height:1.4;padding:2px 0">
          La recomposition corporelle vise à perdre de la graisse et gagner du muscle simultanément grâce au déficit calorique modéré et à l'apport protéique élevé.
        </div>
      </div>
    </div>` : '';

  /* Sport goal block */
  const sportGoalHtml = S.mode === 'sport' ? `
    <div class="trow" style="flex-direction:column;align-items:flex-start;gap:10px;border-bottom:none">
      <p class="ttit">Objectif sportif</p>
      <div class="gtabs">
        ${['seche','maintien','masse'].map(g => {
          const info = GOAL_INFO.sport[g];
          return `<button class="gtab${S.goal===g?' on-s':''}" onclick="setGoal('${g}')">
            <span class="gti">${info.emoji}</span><span class="gtl">${info.short}</span>
          </button>`;
        }).join('')}
      </div>
    </div>` : '';

  /* Advice block */
  let adviceHtml = '';
  if (S.mode === 'sport' && ADVICE.sport[S.goal]) {
    adviceHtml = `
      <div class="vc" style="margin-bottom:10px">
        <div class="vcp">
          <p class="slbl">Conseils nutrition sportive</p>
          <div style="font-size:13.5px;color:var(--txt2);line-height:1.6">${ADVICE.sport[S.goal]}</div>
        </div>
      </div>`;
  } else if (S.mode === 'recomp' && ADVICE.recomp[S.recomp]) {
    adviceHtml = `
      <div class="vc" style="margin-bottom:10px">
        <div class="vcp">
          <p class="slbl">Protocole recomposition</p>
          <div style="font-size:13.5px;color:var(--txt2);line-height:1.6">${ADVICE.recomp[S.recomp]}</div>
        </div>
      </div>`;
  }

  /* Switch class for sport/recomp modes */
  const swClass = S.sport ? 'sw on on-sp' : '';

  C.innerHTML = `
    <!-- Avatar card -->
    <div class="vc" style="margin-bottom:10px">
      <div class="vcp" style="display:flex;align-items:center;gap:14px">
        <div class="pav">🧑‍🍳</div>
        <div>
          <p style="font-weight:600;font-size:16px;color:var(--txt)">Chef du Frigo</p>
          <p class="chint">${S.favs.length} favori${S.favs.length!==1?'s':''} · Mode ${S.mode==='daily'?'Quotidien':S.mode==='sport'?'Sport ⚡':'Recomp ✦'}</p>
        </div>
      </div>
    </div>

    <!-- Settings card -->
    <div class="vc" style="margin-bottom:10px">
      <div class="vcp">
        <p class="slbl">Préférences</p>

        <div class="trow">
          <div class="tleft">
            <i class="ti ${S.dark?'ti-moon':'ti-sun'}" aria-hidden="true"></i>
            <div><p class="ttit">Mode sombre</p><p class="tsub">${S.dark?'Actif':'Inactif'}</p></div>
          </div>
          <button class="sw${S.dark?' on':''}" onclick="tDark()" aria-label="Basculer mode sombre"></button>
        </div>

        <div class="trow">
          <div class="tleft">
            <i class="ti ti-home" style="color:${S.mode==='daily'?'var(--p)':'var(--txt2)'}" aria-hidden="true"></i>
            <div><p class="ttit">Mode Quotidien</p><p class="tsub">Recettes simples, pas de macros</p></div>
          </div>
          <button class="sw${S.mode==='daily'?' on':''}" onclick="setMode('daily')" aria-label="Mode quotidien"></button>
        </div>

        <div class="trow">
          <div class="tleft">
            <i class="ti ti-bolt" style="color:${S.mode==='sport'?'var(--sptxt)':'var(--txt2)'}" aria-hidden="true"></i>
            <div><p class="ttit">Mode Sport</p><p class="tsub">${S.mode==='sport'?'Activé — macros & conseils':'Sèche / Maintien / Masse'}</p></div>
          </div>
          <button class="sw${S.mode==='sport'?' on on-sp':''}" onclick="setMode(S.mode==='sport'?'daily':'sport')" aria-label="Mode sport"></button>
        </div>

        <div class="trow">
          <div class="tleft">
            <i class="ti ti-refresh" style="color:${S.mode==='recomp'?'var(--rctxt)':'var(--txt2)'}" aria-hidden="true"></i>
            <div><p class="ttit">Mode Recomposition</p><p class="tsub">${S.mode==='recomp'?'Activé — perte grasse + muscle':'Tonification / Endurance / Optim'}</p></div>
          </div>
          <button class="sw${S.mode==='recomp'?' on on-rc':''}" onclick="setMode(S.mode==='recomp'?'daily':'recomp')" aria-label="Mode recomposition"></button>
        </div>

        ${sportGoalHtml}
        ${recompPhasesHtml}
      </div>
    </div>

    ${adviceHtml}

    <!-- About -->
    <div class="vc">
      <div class="vcp">
        <p class="slbl">À propos</p>
        <p style="font-size:13px;color:var(--txt2);line-height:1.5">
          <strong style="color:var(--txt)">VideFrigo</strong> utilise l'IA Claude (Anthropic) pour générer des recettes personnalisées à partir de vos ingrédients.
          Zéro gaspillage alimentaire, zéro charge mentale. Modes Sport et Recomposition corporelle pour adapter chaque recette à vos objectifs.
        </p>
        <p style="font-size:12px;color:var(--txt3);margin-top:8px">v2.0 · Propulsé par Claude Sonnet</p>
      </div>
    </div>`;
}

/* ════════════════════════════════════════════
   RENDER ENGINE
   ════════════════════════════════════════════ */
function render() {
  /* Theme */
  const app = document.getElementById('app');
  app.className = S.dark ? 'dark' : '';

  /* Theme color meta */
  const tc = document.getElementById('themeColor');
  if (tc) tc.content = S.dark ? '#181D28' : '#0CC870';

  /* Clock */
  const tel = document.getElementById('stime');
  if (tel) {
    const n = new Date();
    tel.textContent = n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
  }

  /* Nav active state */
  const navMap = { home:'home', res:'home', det:'home', fav:'fav', prof:'prof' };
  ['home','fav','prof'].forEach(id => {
    const b = document.getElementById('nb-'+id);
    if (b) b.className = 'nb' + (navMap[S.sc] === id ? ' on' : '');
  });

  /* Screen routing */
  const H = document.getElementById('hdr');
  const C = document.getElementById('cnt');
  const screens = { home: renderHome, res: renderRes, det: renderDet, fav: renderFav, prof: renderProf };
  if (screens[S.sc]) screens[S.sc](H, C);

  /* Scroll top on screen change */
  if (C) C.scrollTop = 0;
}

/* ════════════════════════════════════════════
   ACTIONS
   ════════════════════════════════════════════ */
function go(sc)      { S.prevSc = S.sc; S.sc = sc; S.err = null; if (sc !== 'home') { S.voiceState = 'idle'; S.voiceTranscript = ''; } render(); }
function goBack()    { S.sc = S.prevSc || 'res'; render(); }
function tDark()     { S.dark = !S.dark; render(); }
function setMode(m)  { S.mode = m; render(); }
function setGoal(g)  { S.goal = g; render(); }
function setRecomp(g){ S.recomp = g; render(); }

function ting(i) {
  if (S.ings.has(i)) { S.ings.delete(i); } else { if (S.ings.size >= 5) return; S.ings.add(i); }
  render();
}
function ring(i)  { S.ings.delete(i); render(); }
function addIng() {
  const el = document.getElementById('ci');
  if (!el) return;
  const v = el.value.trim();
  if (!v || S.ings.size >= 5) return;
  S.ings.add(v); el.value = ''; render();
}

function openR(i)  { S.prevSc = 'res'; S.sel = S.recs[i]; S.sc = 'det'; render(); }
function openF(i)  { S.prevSc = 'fav'; S.sel = S.favs[i]; S.sc = 'det'; render(); }

function tfav(i, ctx) {
  const recipe = ctx === 'det' ? S.sel : S.recs[i];
  if (!recipe) return;
  const fi = S.favs.findIndex(f => f.titre === recipe.titre);
  fi >= 0 ? S.favs.splice(fi, 1) : S.favs.push(recipe);
  render();
}
function rmFav(i) { S.favs.splice(i, 1); render(); }

/* ════════════════════════════════════════════
   API CALL
   ════════════════════════════════════════════ */
async function gen() {
  const ings = [...S.ings];
  if (ings.length < 2) return;
  S.loading = true; S.err = null; render();

  /* Build system prompt */
  const modeInstructions = {
    sport: {
      seche:     'SÈCHE : recettes < 15g lipides, > 25g protéines. Substitutions sportives: yaourt grec 0%, blanc d\'œuf.',
      maintien:  'MAINTIEN : macros équilibrées, ratio protéines/lipides ≥ 2:1, cible 400–550 kcal.',
      masse:     'PRISE DE MASSE : > 35g protéines, > 400 kcal, glucides complexes bienvenus.',
    },
    recomp: {
      toning:    'TONIFICATION (recomp) : protéines > 30g, lipides < 15g, glucides 25–40g. Éviter pics glycémiques. Substitutions: yaourt grec, blanc d\'œuf, fromage cottage.',
      endurance: 'ENDURANCE (recomp) : glucides complexes > 40g, protéines 20–30g pour récupération. Favoriser riz complet, patate douce, légumineuses.',
      optim:     'OPTIMISATION (recomp) : ratio prot 35–40%, glucides 35–40%, lipides 20–25%. Glucides autour de l\'entraînement, lipides sains au repos.',
    },
  };

  const isSport  = S.mode === 'sport';
  const isRecomp = S.mode === 'recomp';
  const needMacros = isSport || isRecomp;

  let modeBlock = '';
  if (isSport)  modeBlock = `\nMODE SPORT — ${S.goal.toUpperCase()} : ${modeInstructions.sport[S.goal]}\n- Champ "macros" OBLIGATOIRE.\n- Dans substitution_maline, champ "astuce_sport" adapté (ex : yaourt grec 0% = moins de lipides).\n`;
  if (isRecomp) modeBlock = `\nMODE RECOMPOSITION CORPORELLE — ${S.recomp.toUpperCase()} : ${modeInstructions.recomp[S.recomp]}\n- Champ "macros" OBLIGATOIRE.\n- Dans substitution_maline, champ "astuce_recomp" : alternative optimale pour la recomposition (ex : fromage cottage à la place du fromage gras = même texture, 3x moins de lipides, 2x plus de protéines).\n`;

  const macroField = needMacros ? `"macros": { "calories": number, "proteines_g": number, "lipides_g": number, "glucides_g": number },` : '';
  const subFields  = needMacros
    ? (isRecomp
       ? `"ingredient_manquant": "string", "astuce": "string", "astuce_sport": null, "astuce_recomp": "string"`
       : `"ingredient_manquant": "string", "astuce": "string", "astuce_sport": "string", "astuce_recomp": null`)
    : `"ingredient_manquant": "string", "astuce": "string"`;

  const systemPrompt = `Tu es un chef anti-gaspi expert en nutrition sportive et recomposition corporelle.
Propose 2 ou 3 recettes ultra-simples (< 20 min) à partir des ingrédients fournis.

RÈGLES ABSOLUES :
1. Répondre UNIQUEMENT en JSON valide. Aucun texte avant/après. Aucune balise markdown.
2. Ingrédients de placard de base autorisés (huile, sel, poivre, farine, épices courantes).
3. COMPROMIS DE SAVEUR : si une recette est meilleure avec un ingrédient absent, NE PAS rejeter la recette. Renseigner substitution_maline avec un mélange de secours précis et basique.
4. substitution_maline = null si aucune substitution n'est nécessaire.
5. Maximum 5 étapes par recette. Chaque étape = 1 action claire.
${modeBlock}

FORMAT JSON STRICT (respecter exactement) :
{
  "recettes": [
    {
      "titre": "string",
      "temps_preparation": "string (ex: 15 min)",
      "ingredients_base": ["string"],
      "substitution_maline": { ${subFields} } ou null,
      ${macroField}
      "etapes": ["string", "string", "string", "string"]
    }
  ]
}`;

  const userMsg = `Ingrédients disponibles : ${ings.join(', ')}.${isSport?' Mode sport, objectif '+S.goal+'.':''}${isRecomp?' Mode recomposition corporelle, phase '+S.recomp+'.':''}`;

  try {
    // On passe par le proxy backend /api/recipes (Gemini — clé cachée côté serveur)
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients: ings,
        mode:        S.mode,
        goal:        S.goal,
        recomp:      S.recomp,
        systemPrompt,
        userMsg,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const parsed = await res.json();
    if (parsed.error) throw new Error(parsed.error);

    S.recs    = parsed.recettes;
    S.sc      = 'res';
    S.loading = false;
    render();
  } catch (e) {
    console.error('API error:', e);
    S.loading = false;
    S.err = 'Une erreur est survenue. Vérifiez votre connexion et réessayez.';
    render();
  }
}

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */
render();

/* Live clock */
setInterval(() => {
  const el = document.getElementById('stime');
  if (el) {
    const n = new Date();
    el.textContent = n.getHours().toString().padStart(2,'0') + ':' + n.getMinutes().toString().padStart(2,'0');
  }
}, 30000);
