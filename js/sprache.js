// Vorlesen (speechSynthesis), Spracherkennung (webkitSpeechRecognition)
// und ein Parser, der deutsche Zahlwörter in Zahlen verwandelt.
const Zahlwort = (() => {
  const EINER = {
    null: 0, ein: 1, eins: 1, eine: 1, einen: 1, zwei: 2, zwo: 2, drei: 3, vier: 4,
    fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  };
  const ZEHNER = {
    zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15,
    fuenfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
    zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, fuenfzig: 50,
    sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90, hundert: 100, einhundert: 100,
  };
  // Häufige Verhörer der Spracherkennung
  // Die Antwort ist immer eine Zahl – darum dürfen ähnlich klingende Wörter als Zahl gelten.
  const AEHNLICH = {
    eis: 1, ains: 1, eines: 1,
    zwai: 2, zwo: 2,
    frei: 3, drai: 3, trei: 3,
    fier: 4, vir: 4, fia: 4,
    fünfe: 5, fünft: 5, fünfte: 5, fuenfe: 5,
    sex: 6, sechse: 6, sechst: 6, zechs: 6, sechsen: 6,
    siebn: 7, siebene: 7, sieb: 7,
    achte: 8, ach: 8, nacht: 8,
    nein: 9, neu: 9, neune: 9, noin: 9, nain: 9, neum: 9, nine: 9,
    zehen: 10, zehne: 10,
    elfe: 11, elfen: 11,
    zwölfe: 12, zwölf: 12,
    hundertt: 100, hunderd: 100,
  };

  function wort(w) {
    if (w in EINER) return EINER[w];
    if (w in ZEHNER) return ZEHNER[w];
    if (w in AEHNLICH) return AEHNLICH[w];
    const m = w.match(/^(.+?)und(zwanzig|dreißig|dreissig|vierzig|fünfzig|fuenfzig|sechzig|siebzig|achtzig|neunzig)$/);
    if (m && m[1] in EINER && EINER[m[1]] > 0) return EINER[m[1]] + ZEHNER[m[2]];
    return null;
  }

  // Liefert die letzte Zahl im Text (Kinder sagen oft "drei plus vier ist sieben").
  function parse(text) {
    if (!text) return null;
    let t = text.toLowerCase().replace(/[.,!?;:"]/g, ' ');
    // "drei und zwanzig" -> "dreiundzwanzig"
    t = t.replace(/(\S+)\s+und\s+(\S*zig|dreißig|dreissig)\b/g, '$1und$2');
    const woerter = t.split(/\s+/).filter(Boolean);
    let letzte = null;
    for (const w of woerter) {
      if (/^\d+$/.test(w)) { letzte = parseInt(w, 10); continue; }
      const n = wort(w);
      if (n !== null) letzte = n;
    }
    return letzte;
  }

  return { parse };
})();

const Sprache = (() => {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  let stimme = null;

  // Android meldet Sprachen teils als "de_DE" oder "deu-DEU" – vereinheitlichen.
  const sprachCode = (v) => (v.lang || '').replace('_', '-').toLowerCase();

  function stimmeWaehlen() {
    if (!synth) return null;
    const deutsch = synth.getVoices().filter((v) => sprachCode(v).startsWith('de'));
    stimme = deutsch.find((v) => sprachCode(v) === 'de-at')
      || deutsch.find((v) => /google/i.test(v.name))
      || deutsch.find((v) => v.localService)
      || deutsch[0]
      || null;
    return stimme;
  }
  if (synth) {
    stimmeWaehlen();
    synth.addEventListener('voiceschanged', stimmeWaehlen);
  }

  // Stimmen laden bei manchen Browsern verzögert – kurz darauf warten.
  function stimmenBereit() {
    if (!synth || synth.getVoices().length) return Promise.resolve(stimmeWaehlen());
    return new Promise((resolve) => {
      const fertig = () => resolve(stimmeWaehlen());
      synth.addEventListener('voiceschanged', fertig, { once: true });
      setTimeout(fertig, 1500);
    });
  }

  function vorlesen(text) {
    return new Promise((resolve) => {
      if (!synth) { resolve(); return; }
      if (!stimme) stimmeWaehlen();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = stimme ? stimme.lang : 'de-DE';
      if (stimme) u.voice = stimme;
      u.rate = 0.95;
      let fertig = false;
      const ende = () => { if (!fertig) { fertig = true; clearTimeout(notfall); resolve(); } };
      // Chrome feuert "end" manchmal nicht – Notfall-Timeout
      const notfall = setTimeout(ende, 1500 + text.length * 140);
      u.onend = ende;
      u.onerror = ende;
      synth.speak(u);
    });
  }

  const FEHLER_TEXT = {
    'not-allowed': 'Das Mikrofon ist nicht erlaubt. Bitte im Browser das Mikrofon für diese Seite erlauben.',
    'service-not-allowed': 'Dieser Browser erlaubt keine Spracherkennung. Bitte Chrome verwenden.',
    'audio-capture': 'Kein Mikrofon gefunden.',
    'network': 'Spracherkennung braucht Internet – keine Verbindung zum Sprachdienst.',
    'language-not-supported': 'Deutsch wird von der Spracherkennung hier nicht unterstützt.',
  };

  // Hört zu, bis eine Zahl erkannt wurde.
  //   loesung: richtige Zahl – wird schon bei Zwischenergebnissen akzeptiert,
  //   sofern sie nicht Anfang einer längeren Zahl sein kann (1–9: "drei" vs. "dreiundzwanzig").
  //   onZahl(zahl, richtig), onText(text) für die Anzeige.
  // Rückgabe: Objekt mit stop().
  function zuhoeren({ loesung, onZahl, onText, onStatus }) {
    let aktiv = true;
    let rec = null;
    const sofortOk = loesung === 0 || loesung >= 10;

    function pruefe(ergebnis, istFinal) {
      const alternativen = [];
      for (let i = 0; i < ergebnis.length; i++) alternativen.push(ergebnis[i].transcript);
      onText && onText(alternativen[0]);
      const zahlen = alternativen.map(Zahlwort.parse);
      if (zahlen.includes(loesung) && (istFinal || sofortOk)) return fertig(loesung, true);
      if (istFinal) {
        const z = zahlen.find((n) => n !== null);
        if (z !== undefined) return fertig(z, false);
      }
    }

    function fertig(zahl, richtig) {
      if (!aktiv) return;
      aktiv = false;
      try { rec.abort(); } catch (e) { /* egal */ }
      onZahl(zahl, richtig);
    }

    function starten() {
      if (!aktiv) return;
      rec = new Rec();
      rec.lang = 'de-DE';
      rec.interimResults = true;
      rec.maxAlternatives = 5;
      rec.continuous = false;
      rec.onstart = () => onStatus && onStatus('hoert');
      rec.onresult = (ev) => {
        fehlerInFolge = 0;
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          pruefe(ev.results[i], ev.results[i].isFinal);
          if (!aktiv) return;
        }
      };
      rec.onerror = (ev) => {
        if (ev.error === 'no-speech' || ev.error === 'aborted') return; // einfach weiter zuhören
        const sofortAus = FEHLER_TEXT[ev.error] && ev.error !== 'network';
        fehlerInFolge++;
        if (sofortAus || fehlerInFolge >= 3) {
          aktiv = false;
          onStatus && onStatus('aus', FEHLER_TEXT[ev.error] || `Spracherkennung funktioniert hier nicht (${ev.error}).`);
        }
      };
      // Nichts (Verwertbares) gehört -> weiter zuhören
      rec.onend = () => { if (aktiv) setTimeout(starten, 150); };
      try { rec.start(); } catch (e) {
        fehlerInFolge++;
        if (fehlerInFolge >= 3) { aktiv = false; onStatus && onStatus('aus', 'Spracherkennung startet nicht.'); } else setTimeout(starten, 300);
      }
    }
    let fehlerInFolge = 0;

    if (Rec) starten();
    return {
      stop() {
        aktiv = false;
        if (rec) { try { rec.abort(); } catch (e) { /* egal */ } }
      },
    };
  }

  return {
    vorlesen,
    zuhoeren,
    stimmenBereit,
    stimme: () => stimme,
    alleStimmen: () => (synth ? synth.getVoices() : []),
    kannSprechen: !!synth,
    kannHoeren: !!Rec,
    stopVorlesen() { if (synth) synth.cancel(); },
  };
})();

if (typeof module !== 'undefined') module.exports = { Zahlwort };
