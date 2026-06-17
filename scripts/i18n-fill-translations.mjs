#!/usr/bin/env node
/**
 * Fills FR/DE/IT overlay files with translations.
 * Uses MyMemory free API for combo notes and drug content in batches.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const TARGET_LOCALES = ["fr", "de", "it"];
const LANG_CODES = { fr: "fr-FR", de: "de-DE", it: "it-IT" };
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 800;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, data) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

async function translateText(text, targetLang, retries = 8) {
  const langpair = `en|${LANG_CODES[targetLang]}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = BATCH_DELAY_MS * (attempt + 2) ** 2;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Translate failed: ${res.status}`);
      const data = await res.json();
      const translated = data.responseData?.translatedText;
      if (!translated || translated === text) return text;
      return translated;
    } catch (error) {
      const retryable =
        error instanceof TypeError ||
        (error && typeof error === "object" && "code" in error &&
          ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code));
      if (!retryable || attempt === retries) throw error;
      const wait = BATCH_DELAY_MS * (attempt + 2) ** 2;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return text;
}

function isTranslatedEntry(entry) {
  return Boolean(entry?.text && entry._source && entry.text !== entry._source);
}

function drugFileIsTranslated(localePath) {
  const data = readJson(localePath);
  if (!data) return false;
  const walk = (value) => {
    if (Array.isArray(value)) return value.some(walk);
    if (value && typeof value === "object") {
      if ("text" in value && "_source" in value) return isTranslatedEntry(value);
      return Object.values(value).some(walk);
    }
    return false;
  };
  return walk(data);
}

async function translateBatch(entries, targetLang, onProgress, existing = {}, savePath) {
  const result = { ...existing };
  const pending = entries.filter(([key]) => !isTranslatedEntry(result[key]));
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ([key, value]) => {
        try {
          const text = await translateText(value._source ?? value.text ?? value, targetLang);
          result[key] = { _source: value._source ?? value.text ?? value, text };
        } catch {
          result[key] = value;
        }
      })
    );
    if (savePath) writeJson(savePath, result);
    onProgress?.(
      entries.length - pending.length + Math.min(i + BATCH_SIZE, pending.length),
      entries.length
    );
    if (i + BATCH_SIZE < pending.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return result;
}

const STATIC_TRANSLATIONS = {
  fr: {
    drugLabels: {
      amt: "AMT",
      diphenhydramine: "Diphénhydramine",
      lithium: "Lithium",
      mephedrone: "Méphédrone",
      pcp: "PCP",
      pregabalin: "Prégabaline",
    },
    statusDefinitions: {
      dangerous: {
        text: "Ces combinaisons sont considérées comme extrêmement nocives et doivent toujours être évitées. Les réactions à ces drogues prises en combinaison sont très imprévisibles et peuvent entraîner la mort.",
      },
      unsafe: {
        text: "Il existe un risque considérable de préjudice physique lors de la prise de ces combinaisons ; elles doivent être évitées dans la mesure du possible.",
      },
      caution: {
        text: "Ces combinaisons ne sont généralement pas physiquement nocives, mais peuvent produire des effets indésirables, tels qu'un inconfort physique ou une surstimulation. Une utilisation extrême peut causer des problèmes de santé physique. Les effets synergiques peuvent être imprévisibles. Il convient de faire preuve de prudence.",
      },
      "low risk & decrease": {
        text: "Les effets sont soustractifs. La combinaison est peu susceptible de provoquer une réaction indésirable au-delà de ce qui pourrait normalement être attendu de ces drogues.",
      },
      "low risk & no synergy": {
        text: "Les effets sont additifs. La combinaison est peu susceptible de provoquer une réaction indésirable au-delà de ce qui pourrait normalement être attendu de ces drogues.",
      },
      "low risk & synergy": {
        text: "Ces drogues agissent ensemble pour produire un effet supérieur à la somme de leurs parties, et elles ne sont pas susceptibles de provoquer une réaction indésirable lorsqu'elles sont utilisées avec précaution. Des recherches supplémentaires doivent toujours être effectuées avant de combiner des drogues.",
      },
      unknown: { text: "Les effets sont inconnus." },
      fallback: {
        text: "Les données d'interaction ne sont pas disponibles pour cette paire. Faites des recherches supplémentaires avant de combiner.",
      },
    },
    classDescriptions: {
      dox: "Les DOx sont une famille de psychédéliques amphétaminiques substitués (p. ex. DOM, DOI, DOB, DOC) avec de longues durées et une forte stimulation.",
      nbomes:
        "Les NBOMes (N-Bomb) sont des psychédéliques extrêmement puissants actifs à des doses de microgrammes (25I-, 25C-, 25B-NBOMe). Marge de sécurité étroite ; des décès ont été signalés.",
      "2c-x":
        "Les 2C-x sont la famille des phényléthylamines psychédéliques 2C (p. ex. 2C-B, 2C-E, 2C-I). Profils variés ; la plupart sont actifs entre 10 et 25 mg.",
      "2c-t-x":
        "Les 2C-T-x sont la sous-famille 2C substituée au soufre (p. ex. 2C-T-2, 2C-T-7, 2C-T-21). Imprévisibles et sensibles aux IMAO.",
      "5-meo-xxt":
        "Les 5-MeO-xxT couvrent les tryptamines 5-MeO (5-MeO-DMT, 5-MeO-MiPT, 5-MeO-DiPT). Extrêmement puissants, brefs et intenses.",
      amphetamines:
        "Les amphétamines sont une classe de stimulants incluant l'amphétamine, la dextroamphétamine, la méthamphétamine et des analogues apparentés.",
      opioids:
        "Les opioïdes agissent sur les récepteurs mu-opioïdes, produisant analgésie, sédation et dépression respiratoire. Inclut héroïne, morphine, oxycodone, fentanyl et autres.",
      benzodiazepines:
        "Les benzodiazépines sont des modulateurs allostériques positifs du GABA-A utilisés comme anxiolytiques, sédatifs et anticonvulsivants (p. ex. diazépam, alprazolam, clonazépam).",
      maois:
        "Les inhibiteurs de la monoamine oxydase empêchent la dégradation de la sérotonine, de la dopamine et de la noradrénaline. Inclut alcaloïdes harmala, phénézine, sélégiline.",
      ssris:
        "Les inhibiteurs sélectifs de la recapture de la sérotonine sont des antidépresseurs qui augmentent la sérotonine synaptique (p. ex. fluoxétine, sertraline, citalopram).",
      "ghb/gbl":
        "Le GHB et son prodrogue GBL sont des agonistes GABA-B avec une courbe dose-réponse très étroite. Le GBL se convertit rapidement en GHB dans l'organisme.",
    },
  },
  de: {
    drugLabels: {
      amt: "AMT",
      diphenhydramine: "Diphenhydramin",
      lithium: "Lithium",
      mephedrone: "Mephedron",
      pcp: "PCP",
      pregabalin: "Pregabalin",
    },
    statusDefinitions: {
      dangerous: {
        text: "Diese Kombinationen gelten als extrem schädlich und sollten immer vermieden werden. Reaktionen auf diese Drogen in Kombination sind höchst unvorhersehbar und können zum Tod führen.",
      },
      unsafe: {
        text: "Bei diesen Kombinationen besteht ein erhebliches Risiko körperlicher Schäden; sie sollten nach Möglichkeit vermieden werden.",
      },
      caution: {
        text: "Diese Kombinationen sind in der Regel nicht körperlich schädlich, können aber unerwünschte Effekte wie körperliches Unbehagen oder Überstimulation hervorrufen. Extremgebrauch kann gesundheitliche Probleme verursachen. Synergistische Effekte können unvorhersehbar sein. Vorsicht ist geboten.",
      },
      "low risk & decrease": {
        text: "Die Effekte sind subtraktiv. Die Kombination wird voraussichtlich keine unerwünschten Reaktionen über das hinaus verursachen, was von diesen Drogen normalerweise zu erwarten wäre.",
      },
      "low risk & no synergy": {
        text: "Die Effekte sind additiv. Die Kombination wird voraussichtlich keine unerwünschten Reaktionen über das hinaus verursachen, was von diesen Drogen normalerweise zu erwarten wäre.",
      },
      "low risk & synergy": {
        text: "Diese Drogen wirken zusammen und erzeugen einen Effekt, der größer ist als die Summe ihrer Teile, und sie verursachen bei sorgfältigem Gebrauch wahrscheinlich keine unerwünschte Reaktion. Vor dem Kombinieren von Drogen sollten immer weitere Recherchen angestellt werden.",
      },
      unknown: { text: "Die Effekte sind unbekannt." },
      fallback: {
        text: "Für dieses Paar liegen keine Interaktionsdaten vor. Recherchiere weiter, bevor du kombinierst.",
      },
    },
    classDescriptions: {
      dox: "DOx ist eine Familie substituierter Amphetamin-Psychedelika (z. B. DOM, DOI, DOB, DOC) mit langen Wirkdauern und starker Stimulation.",
      nbomes:
        "NBOMes (N-Bomb) sind extrem potente Psychedelika, die in Mikrogramm-Dosen wirksam sind (25I-, 25C-, 25B-NBOMe). Enger Sicherheitsspielraum; Todesfälle wurden berichtet.",
      "2c-x":
        "2C-x ist die 2C-Familie phenethylaminer Psychedelika (z. B. 2C-B, 2C-E, 2C-I). Unterschiedliche Profile; die meisten sind bei 10–25 mg aktiv.",
      "2c-t-x":
        "2C-T-x ist die schwefelsubstituierte 2C-Unterfamilie (z. B. 2C-T-2, 2C-T-7, 2C-T-21). Unvorhersehbar und MAOI-empfindlich.",
      "5-meo-xxt":
        "5-MeO-xxT umfasst 5-MeO-Tryptamine (5-MeO-DMT, 5-MeO-MiPT, 5-MeO-DiPT). Extrem potent, kurz und intensiv.",
      amphetamines:
        "Amphetamine sind eine Klasse von Stimulanzien einschließlich Amphetamin, Dextroamphetamin, Methamphetamin und verwandter Analoga.",
      opioids:
        "Opioide wirken auf Mu-Opioid-Rezeptoren und erzeugen Analgesie, Sedierung und Atemdepression. Umfasst Heroin, Morphin, Oxycodon, Fentanyl und andere.",
      benzodiazepines:
        "Benzodiazepine sind positive allosterische Modulatoren des GABA-A, die als Anxiolytika, Sedativa und Antikonvulsiva eingesetzt werden (z. B. Diazepam, Alprazolam, Clonazepam).",
      maois:
        "Monoaminooxidase-Hemmer verhindern den Abbau von Serotonin, Dopamin und Noradrenalin. Umfasst Harmala-Alkaloide, Phenelzin, Selegilin.",
      ssris:
        "Selektive Serotonin-Wiederaufnahmehemmer sind Antidepressiva, die den synaptischen Serotoninspiegel erhöhen (z. B. Fluoxetin, Sertralin, Citalopram).",
      "ghb/gbl":
        "GHB und sein Prodrug GBL sind GABA-B-Agonisten mit einer sehr engen Dosis-Wirkungs-Kurve. GBL wird im Körper schnell in GHB umgewandelt.",
    },
  },
  it: {
    drugLabels: {
      amt: "AMT",
      diphenhydramine: "Difenidramina",
      lithium: "Litio",
      mephedrone: "Mefedrone",
      pcp: "PCP",
      pregabalin: "Pregabalin",
    },
    statusDefinitions: {
      dangerous: {
        text: "Queste combinazioni sono considerate estremamente dannose e vanno sempre evitate. Le reazioni a queste sostanze assunte in combinazione sono altamente imprevedibili e possono causare la morte.",
      },
      unsafe: {
        text: "Esiste un rischio considerevole di danno fisico quando si assumono queste combinazioni; vanno evitate quando possibile.",
      },
      caution: {
        text: "Queste combinazioni di solito non sono fisicamente dannose, ma possono produrre effetti indesiderati come disagio fisico o sovrastimolazione. Un uso estremo può causare problemi di salute fisica. Gli effetti sinergici possono essere imprevedibili. Prestare attenzione.",
      },
      "low risk & decrease": {
        text: "Gli effetti sono sottrattivi. La combinazione difficilmente causerà reazioni avverse oltre a quelle normalmente attese da queste sostanze.",
      },
      "low risk & no synergy": {
        text: "Gli effetti sono additivi. La combinazione difficilmente causerà reazioni avverse oltre a quelle normalmente attesi da queste sostanze.",
      },
      "low risk & synergy": {
        text: "Queste sostanze agiscono insieme per produrre un effetto superiore alla somma delle parti e, se usate con cautela, difficilmente causeranno reazioni indesiderabili. Fare sempre ulteriori ricerche prima di combinare sostanze.",
      },
      unknown: { text: "Gli effetti sono sconosciuti." },
      fallback: {
        text: "I dati di interazione non sono disponibili per questa coppia. Approfondisci prima di combinare.",
      },
    },
    classDescriptions: {
      dox: "I DOx sono una famiglia di psichedelici anfetaminici sostituiti (es. DOM, DOI, DOB, DOC) con lunghe durate e forte stimolazione.",
      nbomes:
        "Gli NBOMes (N-Bomb) sono psichedelici estremamente potenti attivi a dosi di microgrammi (25I-, 25C-, 25B-NBOMe). Margine di sicurezza ristretto; sono stati segnalati decessi.",
      "2c-x":
        "2C-x è la famiglia 2C di feniltilamine psichedeliche (es. 2C-B, 2C-E, 2C-I). Profili variabili; la maggior parte è attiva tra 10 e 25 mg.",
      "2c-t-x":
        "2C-T-x è la sottofamiglia 2C con sostituzione di zolfo (es. 2C-T-2, 2C-T-7, 2C-T-21). Imprevedibile e sensibile agli IMAO.",
      "5-meo-xxt":
        "5-MeO-xxT comprende triptamine 5-MeO (5-MeO-DMT, 5-MeO-MiPT, 5-MeO-DiPT). Estremamente potenti, brevi e intensi.",
      amphetamines:
        "Le anfetamine sono una classe di stimolanti che include anfetamina, dextroanfetamina, metanfetamina e analoghi correlati.",
      opioids:
        "Gli oppioidi agiscono sui recettori mu-opioidi, producendo analgesia, sedazione e depressione respiratoria. Include eroina, morfina, ossicodone, fentanyl e altri.",
      benzodiazepines:
        "Le benzodiazepine sono modulatori allosterici positivi del GABA-A usati come ansiolitici, sedativi e anticonvulsivanti (es. diazepam, alprazolam, clonazepam).",
      maois:
        "Gli inibitori delle monoamino ossidasi impediscono la degradazione di serotonina, dopamina e noradrenalina. Include alcaloidi harmala, fenelzina, selegilina.",
      ssris:
        "Gli inibitori selettivi della ricaptazione della serotonina sono antidepressivi che aumentano la serotonina sinaptica (es. fluoxetina, sertralina, citalopram).",
      "ghb/gbl":
        "GHB e il suo profarmaco GBL sono agonisti GABA-B con una curva dose-risposta molto stretta. GBL si converte rapidamente in GHB nel corpo.",
    },
  },
};

function applyStaticTranslations(locale) {
  const staticData = STATIC_TRANSLATIONS[locale];
  const enNotes = readJson("i18n/content/en/combo-notes.json");
  const enStatus = readJson("i18n/content/en/status-definitions.json");
  const enClass = readJson("i18n/content/en/class-descriptions.json");

  writeJson(`i18n/content/${locale}/drug-labels.json`, staticData.drugLabels);

  const statusDefs = {};
  for (const [key, enVal] of Object.entries(enStatus)) {
    statusDefs[key] = {
      _source: enVal._source,
      text: staticData.statusDefinitions[key]?.text ?? enVal.text,
    };
  }
  writeJson(`i18n/content/${locale}/status-definitions.json`, statusDefs);

  const classDesc = {};
  for (const [key, enVal] of Object.entries(enClass)) {
    classDesc[key] = {
      _source: enVal._source,
      text: staticData.classDescriptions[key]?.text ?? enVal.text,
    };
  }
  writeJson(`i18n/content/${locale}/class-descriptions.json`, classDesc);

  return { enNotes, localeDir: `i18n/content/${locale}` };
}

async function translateOverlayValue(value, targetLang) {
  if (typeof value === "string") {
    const text = await translateText(value, targetLang);
    return { _source: value, text };
  }
  if (value && typeof value === "object" && "text" in value) {
    const source = value._source ?? value.text;
    const text = await translateText(source, targetLang);
    return { _source: source, text };
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      out.push(await translateOverlayValue(item, targetLang));
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = await translateOverlayValue(v, targetLang);
    }
    return out;
  }
  return value;
}

async function translateDrugFile(enPath, localePath, targetLang) {
  const enData = readJson(enPath);
  const translated = await translateOverlayValue(enData, targetLang);
  writeJson(localePath, translated);
}

async function main() {
  const translateNotes = process.argv.includes("--notes");
  const translateDrugs = process.argv.includes("--drugs");
  const localeArg = process.argv.find((a) => a.startsWith("--locale="));
  const locales = localeArg
    ? [localeArg.split("=")[1]]
    : TARGET_LOCALES;

  for (const locale of locales) {
    console.log(`\n=== ${locale.toUpperCase()} ===`);
    const { enNotes, localeDir } = applyStaticTranslations(locale);

    if (translateNotes) {
      const notesPath = `${localeDir}/combo-notes.json`;
      const existing = readJson(notesPath) ?? {};
      console.log(`Translating ${Object.keys(enNotes).length} combo notes…`);
      const entries = Object.entries(enNotes);
      const translated = await translateBatch(
        entries,
        locale,
        (done, total) => {
          process.stdout.write(`\r  Notes: ${done}/${total}`);
        },
        existing,
        notesPath
      );
      console.log();
      writeJson(notesPath, translated);
    } else {
      console.log("Skipping combo notes (use --notes to translate)");
    }

    if (translateDrugs) {
      const enDrugsDir = path.join(root, "i18n/content/en/drugs");
      const localeDrugsDir = `${localeDir}/drugs`;
      const files = fs.readdirSync(enDrugsDir).filter((f) => f.endsWith(".json"));
      console.log(`Translating ${files.length} drug overlays…`);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const outPath = `${localeDrugsDir}/${file}`;
        if (drugFileIsTranslated(outPath)) {
          process.stdout.write(`\r  Drugs: ${i + 1}/${files.length} (skip ${file})`);
          continue;
        }
        process.stdout.write(`\r  Drugs: ${i + 1}/${files.length}`);
        await translateDrugFile(`i18n/content/en/drugs/${file}`, outPath, locale);
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
      console.log();
    } else {
      console.log("Skipping drug overlays (use --drugs to translate)");
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
