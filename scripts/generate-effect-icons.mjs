/**
 * Generates src/data/effect-icons.json from drugs/drugs.json effect strings.
 * Run: node scripts/generate-effect-icons.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const drugs = JSON.parse(
  fs.readFileSync(path.join(root, "drugs/drugs.json"), "utf8")
);

const effects = new Set();
for (const drug of Object.values(drugs)) {
  if (drug.formatted_effects) {
    for (const e of drug.formatted_effects) effects.add(e);
  }
}

/** Ordered rules: first match wins. Pattern is tested case-insensitively. */
const rules = [
  // Visual
  { pattern: /closed.*eye|cev|oev|open eye visual/i, icon: "eye" },
  { pattern: /visual distortion|visual and audio distortion/i, icon: "eye" },
  { pattern: /visual movement|hue shift|color shift/i, icon: "palette" },
  { pattern: /brightened colou?r|enhanced colou?r|color enhancement/i, icon: "palette" },
  { pattern: /photophobia/i, icon: "sun-off" },
  { pattern: /blurred vision/i, icon: "eye-off" },
  { pattern: /visual and auditory hallucination/i, icon: "ghost" },
  { pattern: /auditory hallucination/i, icon: "ear" },
  { pattern: /hallucination/i, icon: "ghost" },
  { pattern: /visual/i, icon: "eye" },
  { pattern: /auditory|sound distortion|enhanced sound/i, icon: "ear" },

  // Ego / perception / consciousness
  { pattern: /ego death/i, icon: "user-off" },
  { pattern: /ego softening/i, icon: "user-heart" },
  { pattern: /the void/i, icon: "circle-dashed" },
  { pattern: /dream-like|dreamlike|dream like|vivid waking dream/i, icon: "cloud" },
  { pattern: /dream potentiation/i, icon: "cloud-up" },
  { pattern: /dream suppression/i, icon: "cloud-off" },
  { pattern: /change in consciousness|shift in consciousness/i, icon: "sparkles" },
  { pattern: /change in perception|altered perception|perception of time|time distortion|loss of time/i, icon: "clock" },
  { pattern: /radical (perspective|shift)/i, icon: "arrows-exchange" },
  { pattern: /immersive experience/i, icon: "sphere" },
  { pattern: /surreal/i, icon: "wand" },
  { pattern: /psychedelic/i, icon: "sparkles" },
  { pattern: /dissociation|de-realization|disconnection from/i, icon: "route-off" },
  { pattern: /khole/i, icon: "circle-dashed" },

  // Mood / emotion
  { pattern: /euphori/i, icon: "mood-smile" },
  { pattern: /dysphoria/i, icon: "mood-sad" },
  { pattern: /depression/i, icon: "mood-empty" },
  { pattern: /anxiety|panic|fear|paranoia|overwhelming fear/i, icon: "mood-nervous" },
  { pattern: /anxiolytic/i, icon: "mood-check" },
  { pattern: /mood lift|mood enhancement|elevated mood|happiness/i, icon: "mood-happy" },
  { pattern: /mood stabil/i, icon: "mood-neutral" },
  { pattern: /moodiness/i, icon: "mood-confuzed" },
  { pattern: /rage|aggress/i, icon: "mood-angry" },
  { pattern: /empathy|feelings of empathy/i, icon: "heart-handshake" },
  { pattern: /emotion enhancement|heightened emotion|enhanced emotion/i, icon: "heart" },
  { pattern: /sense of wonder|childlike wonder/i, icon: "stars" },
  { pattern: /connectedness|conection with nature/i, icon: "world" },
  { pattern: /contentedness|well-being|well being/i, icon: "mood-smile-beam" },
  { pattern: /giggling/i, icon: "mood-smile" },

  // Cognitive
  { pattern: /insight|introspect/i, icon: "bulb" },
  { pattern: /creativity/i, icon: "palette" },
  { pattern: /focus enhancement|increased focus|mental clarity|focus\/mental/i, icon: "focus-2" },
  { pattern: /thought acceleration|racing thought/i, icon: "brain" },
  { pattern: /cognitive enhancement|increase in cognitive/i, icon: "brain" },
  { pattern: /memory loss|short-term memory|amnesi/i, icon: "history-off" },
  { pattern: /cognitive impairment|psychomotor impairment/i, icon: "brain" },
  { pattern: /confusion|delirium|delusion/i, icon: "confetti" },
  { pattern: /mindfulness/i, icon: "yoga" },
  { pattern: /intrusive thought/i, icon: "message-2" },
  { pattern: /abstract thinking/i, icon: "topology-star-3" },
  { pattern: /attention/i, icon: "eye" },
  { pattern: /distractab/i, icon: "arrows-random" },

  // Stimulation / energy
  { pattern: /uncomfortable stimulation/i, icon: "bolt-off" },
  { pattern: /stimulat/i, icon: "bolt" },
  { pattern: /increased energy|abundance of energy|wakefulness|alertness/i, icon: "bolt" },
  { pattern: /motivation/i, icon: "rocket" },
  { pattern: /confidence/i, icon: "shield-check" },
  { pattern: /sociab/i, icon: "users" },
  { pattern: /talking|desire to talk/i, icon: "message-circle" },
  { pattern: /irritab/i, icon: "mood-angry" },
  { pattern: /restlessness/i, icon: "run" },
  { pattern: /lethargy|fatigue|tiredness|weakness/i, icon: "battery-off" },
  { pattern: /simultaneous stimulation/i, icon: "arrows-split" },

  // Sedation / sleep
  { pattern: /insomnia/i, icon: "moon-off" },
  { pattern: /sleep aid|helps with insomnia|heavy sleep/i, icon: "bed" },
  { pattern: /sleepiness|somnolence|drowsiness|sedati|hypnotic/i, icon: "moon" },
  { pattern: /disturbed sleep/i, icon: "moon-stars" },

  // Physical — mouth / GI
  { pattern: /dry mouth/i, icon: "droplet-off" },
  { pattern: /nausea|vomiting|stomach/i, icon: "mood-sick" },
  { pattern: /constipation/i, icon: "toilet-paper-off" },
  { pattern: /appetite suppression|decreased appetite|reduced appetite|loss of ap/i, icon: "meat-off" },
  { pattern: /appetite enhancement|increases creativity and appetite/i, icon: "bowl" },
  { pattern: /appetite/i, icon: "bowl" },
  { pattern: /hiccup/i, icon: "wind" },
  { pattern: /cough suppression/i, icon: "wind-off" },
  { pattern: /difficulty breathing/i, icon: "lungs-off" },
  { pattern: /gastrointestinal/i, icon: "mood-sick" },

  // Physical — cardiovascular
  { pattern: /tachycardia|tachychardia|increased heart rate|elevated hear/i, icon: "heartbeat" },
  { pattern: /hypertension|high blood pressure|increased blood pressure/i, icon: "activity-heartbeat" },
  { pattern: /vasoconstriction/i, icon: "arrow-narrow-down" },
  { pattern: /vasodilation/i, icon: "arrow-narrow-up" },
  { pattern: /chest/i, icon: "heart-broken" },
  { pattern: /flushing|flushed skin/i, icon: "temperature-sun" },

  // Physical — neuromuscular
  { pattern: /bruxia|bruxism|jaw tension/i, icon: "dental" },
  { pattern: /muscle relax/i, icon: "armchair" },
  { pattern: /muscle tension|muscle-tension|muscle cramp|muscle spasm/i, icon: "barbell" },
  { pattern: /tremor|trembling|body tremor/i, icon: "activity" },
  { pattern: /coordination|motor skill|dystaxia|clumsiness|inability to control muscle/i, icon: "shoe-off" },
  { pattern: /numb|analgesia|pain relief|local numbness/i, icon: "bandage" },
  { pattern: /itch/i, icon: "wave-sine" },
  { pattern: /sweating|perspiration|chills/i, icon: "droplet" },
  { pattern: /dehydration/i, icon: "droplet-half" },
  { pattern: /body odor/i, icon: "perfume" },
  { pattern: /increased body temperature/i, icon: "temperature" },
  { pattern: /tactile enhancement|enhanced tactile/i, icon: "hand-click" },
  { pattern: /buzzing sensation/i, icon: "wave-sine" },
  { pattern: /warm fuzzy/i, icon: "sun" },
  { pattern: /bodyload/i, icon: "weight" },
  { pattern: /physical relaxation|relaxation|relaxant/i, icon: "armchair" },
  { pattern: /physical agitation/i, icon: "run" },

  // Eyes
  { pattern: /pupil dilation/i, icon: "eye" },
  { pattern: /pupil constriction/i, icon: "eye-off" },

  // Urinary / sexual
  { pattern: /difficulty urinating|urinary retention/i, icon: "droplet-off" },
  { pattern: /libido|sexual|aphrodisiac|sex drive/i, icon: "heart" },
  { pattern: /decreased libido/i, icon: "heart-off" },

  // Respiratory / medical
  { pattern: /respiratory depression/i, icon: "lungs-off" },
  { pattern: /anticonvulsant|seizure/i, icon: "medical-cross" },
  { pattern: /antidepressant/i, icon: "mood-smile" },
  { pattern: /anti-inflammation/i, icon: "pill" },
  { pattern: /antipyresis/i, icon: "temperature-off" },
  { pattern: /blackout/i, icon: "eye-off" },
  { pattern: /dermatitis/i, icon: "bandage" },
  { pattern: /kidney disorder|brain damage|liver damage/i, icon: "alert-triangle" },
  { pattern: /weight loss/i, icon: "scale" },
  { pattern: /tolerance/i, icon: "repeat" },
  { pattern: /addiction help/i, icon: "lifebuoy" },
  { pattern: /compulsion to redose/i, icon: "refresh" },

  // Meta / comparative descriptions
  { pattern: /similar to (lsd|mushroom|psilocybin|cannabis|alcohol|mda|mdma|2c-b)/i, icon: "sparkles" },
  { pattern: /comparable to/i, icon: "sparkles" },
  { pattern: /trip similar/i, icon: "sparkles" },
  { pattern: /psilocin analog/i, icon: "mushroom" },
  { pattern: /like mushrooms/i, icon: "mushroom" },
  { pattern: /like alcohol/i, icon: "glass" },
  { pattern: /benzodiazepine/i, icon: "pill" },
  { pattern: /smoked: short duration/i, icon: "alarm-smoke" },
  { pattern: /hard on lungs/i, icon: "lungs-off" },
  { pattern: /slurred speech|unusla thought/i, icon: "message-off" },
  { pattern: /stoned/i, icon: "cannabis" },
  { pattern: /drunkenness/i, icon: "glass" },
  { pattern: /spiritual experience/i, icon: "sparkles" },
  { pattern: /music appreciation/i, icon: "music" },
  { pattern: /sensory enhancement|reduction of external/i, icon: "ear" },
  { pattern: /loss of inhibition|lowered inhibition/i, icon: "lock-open" },
  { pattern: /personality change/i, icon: "user-cog" },
  { pattern: /inhibition/i, icon: "lock" },
  { pattern: /headache/i, icon: "bandage" },
  { pattern: /dizziness/i, icon: "rotate-2" },
  { pattern: /side-effect/i, icon: "alert-circle" },
  { pattern: /negative experience/i, icon: "mood-sad" },
  { pattern: /useful with physical labor/i, icon: "hammer" },
  { pattern: /largely/i, icon: "circle-dot" },
  { pattern: /but reported/i, icon: "info-circle" },
  { pattern: /so effects are very similar/i, icon: "info-circle" },
  { pattern: /with euphoria/i, icon: "mood-smile" },
  { pattern: /depending on the individual/i, icon: "user" },
  { pattern: /depending on roa/i, icon: "pill" },
  { pattern: /users describe|users report|reported were|drug is reported/i, icon: "quote" },
  { pattern: /difficulty integrating/i, icon: "puzzle-off" },
  { pattern: /sleep$/i, icon: "bed" },
  { pattern: /decreased need for sleep/i, icon: "moon-off" },
];

function matchIcon(effect) {
  for (const { pattern, icon } of rules) {
    if (pattern.test(effect)) return icon;
  }
  return "circle-dot";
}

const mapping = { _default: "circle-dot" };
for (const effect of [...effects].sort()) {
  mapping[effect] = matchIcon(effect);
}

const outPath = path.join(root, "src/data/effect-icons.json");
fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2) + "\n");

const tabler = JSON.parse(
  fs.readFileSync(
    path.join(root, "node_modules/@iconify-json/tabler/icons.json"),
    "utf8"
  )
);
const valid = new Set(Object.keys(tabler.icons));
const invalid = Object.entries(mapping)
  .filter(([k, v]) => k !== "_default" && !valid.has(v))
  .map(([k, v]) => `${k}: ${v}`);
if (invalid.length) {
  console.error("Invalid icons:", invalid.join("\n"));
  process.exit(1);
}
console.log(`Wrote ${Object.keys(mapping).length - 1} effect icons to ${outPath}`);
