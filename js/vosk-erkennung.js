// Spracherkennung mit Vosk (läuft offline im Browser, WebAssembly).
// Die Erkennung ist auf eine Wortliste mit den Zahlen 0–100 beschränkt,
// dadurch kann nur eine Zahl herauskommen ("neun" wird nicht zu "nein").
const VoskErkennung = (() => {
  const MODELL = 'models/vosk-model-small-de-0.15.tar.gz';
  const BIBLIOTHEK = 'vendor/vosk.js';

  // Wortliste: alle Zahlwörter 0–100 + [unk] für alles andere.
  // Nur zusammengeschrieben ("dreiundzwanzig") – getrennte Formen machen "und" zu einem eigenen Treffer.
  const WOERTER = (() => {
    const E = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
    const Z = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
    const w = [...E, 'zwo', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn',
      'siebzehn', 'achtzehn', 'neunzehn', 'hundert', 'einhundert'];
    for (let t = 2; t <= 9; t++) {
      w.push(Z[t]);
      for (let e = 1; e <= 9; e++) {
        const einer = e === 1 ? 'ein' : E[e];
        w.push(`${einer}und${Z[t]}`);
      }
    }
    w.push('[unk]');
    return w;
  })();

  let modellPromise = null;
  let model = null;
  let audio = null;
  let aktuell = null; // Erkenner, der gerade Audio bekommt

  function skriptLaden(src) {
    if (window.Vosk) return Promise.resolve();
    return new Promise((ok, fehler) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => fehler(new Error('Vosk-Bibliothek konnte nicht geladen werden.'));
      document.head.appendChild(s);
    });
  }

  // Lädt das Modell vorab mit Fortschrittsanzeige (danach liegt es im Cache).
  async function vorladen(url, onFortschritt) {
    const antwort = await fetch(url);
    if (!antwort.ok || !antwort.body) throw new Error('Sprachmodell nicht gefunden.');
    const gesamt = Number(antwort.headers.get('Content-Length')) || 46376391;
    const leser = antwort.body.getReader();
    let geladen = 0;
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      geladen += value.length;
      onFortschritt && onFortschritt(Math.min(99, Math.round((geladen / gesamt) * 100)));
    }
  }

  function laden(onFortschritt) {
    if (modellPromise) return modellPromise;
    modellPromise = (async () => {
      await skriptLaden(BIBLIOTHEK);
      const url = new URL(MODELL, location.href).href; // Worker braucht absolute Adresse
      let schonGespeichert = false;
      try { schonGespeichert = localStorage.getItem('rechenheld-vosk') === url; } catch (e) { /* egal */ }
      if (!schonGespeichert) await vorladen(url, onFortschritt);
      onFortschritt && onFortschritt('entpacken');
      model = await window.Vosk.createModel(url);
      try { localStorage.setItem('rechenheld-vosk', url); } catch (e) { /* egal */ }
      return model;
    })();
    modellPromise.catch(() => { modellPromise = null; });
    return modellPromise;
  }

  async function audioStarten() {
    if (audio) {
      if (audio.ctx.state === 'suspended') await audio.ctx.resume();
      return audio;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const quelle = ctx.createMediaStreamSource(stream);
    const proz = ctx.createScriptProcessor(4096, 1, 1);
    proz.onaudioprocess = (ev) => {
      if (!aktuell) return;
      try { aktuell.acceptWaveform(ev.inputBuffer); } catch (e) { /* Erkenner schon entfernt */ }
    };
    quelle.connect(proz);
    proz.connect(ctx.destination); // gibt nur Stille aus, ist aber nötig, damit verarbeitet wird
    audio = { stream, ctx, quelle, proz };
    return audio;
  }

  function audioStoppen() {
    if (!audio) return;
    try {
      audio.proz.disconnect();
      audio.quelle.disconnect();
      audio.stream.getTracks().forEach((t) => t.stop());
      audio.ctx.close();
    } catch (e) { /* egal */ }
    audio = null;
  }

  function fehlerText(e) {
    if (e && e.name === 'NotAllowedError') return 'Das Mikrofon ist nicht erlaubt. Bitte im Browser das Mikrofon für diese Seite erlauben.';
    if (e && e.name === 'NotFoundError') return 'Kein Mikrofon gefunden.';
    if (e && e.message) return e.message;
    return 'Das Sprachmodell konnte nicht geladen werden.';
  }

  // Modell laden und Mikrofon öffnen (vor der Runde, damit die Uhr nicht läuft).
  async function vorbereiten(onFortschritt) {
    await laden(onFortschritt);
    await audioStarten();
  }

  // Gleiche Schnittstelle wie die Google-Erkennung in sprache.js
  function zuhoeren({ loesung, onZahl, onText, onStatus }) {
    let aktiv = true;
    let rec = null;
    const sofortOk = loesung === 0 || loesung >= 10;

    function aufraeumen() {
      aktiv = false;
      if (rec) {
        if (aktuell === rec) aktuell = null;
        try { rec.remove(); } catch (e) { /* egal */ }
        rec = null;
      }
    }
    function fertig(zahl, richtig) {
      if (!aktiv) return;
      aufraeumen();
      onZahl(zahl, richtig);
    }

    (async () => {
      try {
        if (!model) await laden((p) => onStatus && onStatus('laedt', p));
        await audioStarten();
      } catch (e) {
        aktiv = false;
        onStatus && onStatus('aus', fehlerText(e));
        return;
      }
      if (!aktiv) return;
      rec = new model.KaldiRecognizer(audio.ctx.sampleRate, JSON.stringify(WOERTER));
      rec.on('partialresult', (m) => {
        const t = m && m.result && m.result.partial;
        if (!t || !aktiv) return;
        onText && onText(t);
        if (sofortOk && Zahlwort.parse(t) === loesung) fertig(loesung, true);
      });
      rec.on('result', (m) => {
        const t = m && m.result && m.result.text;
        if (!t || !aktiv) return;
        onText && onText(t);
        const z = Zahlwort.parse(t);
        if (z !== null) fertig(z, z === loesung);
      });
      aktuell = rec;
      onStatus && onStatus('hoert');
    })();

    return { stop: aufraeumen };
  }

  return {
    vorbereiten,
    zuhoeren,
    ruhe: audioStoppen,
    geladen: () => !!model,
    moeglich: typeof WebAssembly === 'object' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    WOERTER,
  };
})();
