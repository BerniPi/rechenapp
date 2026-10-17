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

// Mitgelieferte Stimme "Jonas" (de-AT) aus Wortschnipseln in audio/jonas/
// (erzeugt mit tools/stimme.py). Kennt nur die Sätze aus Aufgaben.alsSatz.
const Jonas = (() => {
  const ORDNER = 'audio/jonas/';
  const LUECKE = 0.03; // Sekunden zwischen zwei Wörtern
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  const roh = new Map(); // Name -> Promise<ArrayBuffer>
  let laufend = [];

  // "Wie viel plus 4 ergibt 9?" -> ['wieviel-anfang', 'plus', 'z4', 'ergibt', 'f9'], unbekannt -> null
  function zerlegen(text) {
    const frage = /\?\s*$/.test(text);
    const woerter = text.replace(/[?.!]/g, ' ').replace(/wie viel/gi, (w) => (w[0] === 'W' ? 'Wieviel' : 'wieviel'))
      .trim().split(/\s+/);
    const namen = [];
    for (let i = 0; i < woerter.length; i++) {
      const w = woerter[i];
      const letztes = i === woerter.length - 1;
      if (/^\d+$/.test(w) && +w <= 100) namen.push((letztes ? (frage ? 'f' : 'e') : 'z') + +w);
      else if (w === 'Wieviel') namen.push('wieviel-anfang');
      else if (['wieviel', 'plus', 'minus', 'mal', 'durch', 'ergibt'].includes(w.toLowerCase())) namen.push(w.toLowerCase());
      else return null;
    }
    return namen.length ? namen : null;
  }

  function holen(name) {
    if (!roh.has(name)) {
      const p = fetch(ORDNER + name + '.mp3').then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.arrayBuffer();
      });
      p.catch(() => roh.delete(name)); // später nochmal versuchen
      roh.set(name, p);
    }
    return roh.get(name);
  }

  // Stille am Anfang und Ende überspringen: [start, dauer] in Sekunden
  function hoerbar(buf) {
    const d = buf.getChannelData(0);
    const schwelle = 0.003; // höher schneidet leise Anlaute wie f/s ab
    let a = 0;
    let b = d.length - 1;
    while (a < b && Math.abs(d[a]) < schwelle) a++;
    while (b > a && Math.abs(d[b]) < schwelle) b--;
    const rand = 0.01 * buf.sampleRate;
    a = Math.max(0, a - rand);
    b = Math.min(d.length - 1, b + rand);
    return [a / buf.sampleRate, (b - a) / buf.sampleRate];
  }

  const dekodieren = (ctx, ab) => new Promise((ok, fehler) => ctx.decodeAudioData(ab.slice(0), ok, fehler));

  // Spielt den Satz; true, wenn es geklappt hat.
  async function sagen(text) {
    const namen = zerlegen(text);
    if (!namen || typeof Ton === 'undefined' || !Ton.init()) return false;
    const ctx = Ton.ctx;
    try {
      if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 300))]);
      if (ctx.state !== 'running') return false;
      const puffer = await Promise.all(namen.map((n) => holen(n).then((ab) => dekodieren(ctx, ab))));
      stop();
      let t = ctx.currentTime + 0.05;
      const quellen = puffer.map((buf) => {
        const [start, dauer] = hoerbar(buf);
        const q = ctx.createBufferSource();
        q.buffer = buf;
        q.connect(ctx.destination);
        q.start(t, start, dauer);
        t += dauer + LUECKE;
        return q;
      });
      laufend = quellen;
      const gesamt = t - ctx.currentTime;
      await new Promise((resolve) => {
        const notfall = setTimeout(resolve, gesamt * 1000 + 500);
        quellen[quellen.length - 1].onended = () => { clearTimeout(notfall); resolve(); };
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  function stop() {
    laufend.forEach((q) => { try { q.stop(); } catch (e) { /* schon fertig */ } });
    laufend = [];
  }

  // Alle Schnipsel einmal laden, damit sie offline im Cache liegen.
  function vorladen() {
    const namen = ['plus', 'minus', 'mal', 'durch', 'ergibt', 'wieviel', 'wieviel-anfang'];
    for (let n = 0; n <= 100; n++) namen.push('z' + n, 'e' + n, 'f' + n);
    let i = 0;
    const weiter = () => { if (i < namen.length) holen(namen[i++]).catch(() => {}).then(weiter); };
    for (let k = 0; k < 4; k++) weiter();
  }

  return { moeglich: !!AC && typeof fetch !== 'undefined', sagen, stop, vorladen, zerlegen };
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

  // Ohne deutsche System-Stimme (z. B. Brave): mitgelieferte Schnipsel, sonst Systemstimme.
  async function vorlesen(text) {
    if (!stimme) stimmeWaehlen();
    if (!stimme && Jonas.moeglich && await Jonas.sagen(text)) return;
    return systemVorlesen(text);
  }

  function systemVorlesen(text) {
    return new Promise((resolve) => {
      if (!synth) { resolve(); return; }
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
  function googleZuhoeren({ loesung, onZahl, onText, onStatus }) {
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

  // Welche Erkennung? 'vosk' (offline, nur Zahlen) oder 'google' (Chrome)
  let motor = 'vosk';
  const mitVosk = () => motor === 'vosk' && typeof VoskErkennung !== 'undefined' && VoskErkennung.moeglich;

  function zuhoeren(opts) {
    return mitVosk() ? VoskErkennung.zuhoeren(opts) : googleZuhoeren(opts);
  }

  return {
    vorlesen,
    zuhoeren,
    setzeMotor(m) { motor = m; },
    motor: () => (mitVosk() ? 'vosk' : 'google'),
    // Vor der Runde: Modell laden + Mikrofon öffnen (nur Vosk)
    vorbereiten: (onFortschritt) => (mitVosk() ? VoskErkennung.vorbereiten(onFortschritt) : Promise.resolve()),
    // Nach der Runde: Mikrofon schließen
    ruhe() { if (typeof VoskErkennung !== 'undefined') VoskErkennung.ruhe(); },
    get kannHoeren() { return mitVosk() || !!Rec; },
    // Ohne deutsche System-Stimme gleich die Jonas-Schnipsel holen (dann auch offline da).
    stimmenBereit: () => stimmenBereit().then((st) => { if (!st && Jonas.moeglich) Jonas.vorladen(); return st; }),
    stimme: () => stimme,
    jonasMoeglich: Jonas.moeglich,
    alleStimmen: () => (synth ? synth.getVoices() : []),
    kannSprechen: !!synth || Jonas.moeglich,
    stopVorlesen() { if (synth) synth.cancel(); Jonas.stop(); },
  };
})();

if (typeof module !== 'undefined') module.exports = { Zahlwort, Jonas };
