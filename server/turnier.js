// Turniermodus für RechenArena: reine Spiellogik ohne HTTP.
// Hält den Zustand aller aktiven Turniere im Arbeitsspeicher (Map).
const crypto = require('node:crypto');
const H = require('./hilfe.js');
const Aufgaben = require('../js/aufgaben.js');

// Alle laufenden Turniere: Map<Code, Turnier>
const turniere = new Map();

const MAX_TURNIERE = 200;
const MAX_TEILNEHMER = 60;
const INAKTIV_MS = 3 * 60 * 60 * 1000; // 3 Stunden inaktiv
const MAX_ALTER_MS = 8 * 60 * 60 * 1000; // 8 Stunden absolut

// 4-stelliger Turnier-Code aus H.ZEICHEN ohne verwechselbare Zeichen (0/O, 1/I)
function codeErzeugen() {
  for (let versuch = 0; versuch < 1000; versuch++) {
    const bytes = crypto.randomBytes(4);
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += H.ZEICHEN[bytes[i] % H.ZEICHEN.length];
    }
    if (!turniere.has(code)) return code;
  }
  throw new Error('Kein freier Turnier-Code verfügbar');
}

// Standard-Einstellungen bereinigen
function einstellungenNormalisieren(e = {}) {
  const uebungen = Array.isArray(e.uebungen)
    ? e.uebungen.filter((id) => Aufgaben.NACH_ID[id])
    : [];
  if (!uebungen.length) uebungen.push('plus10');

  const art = e.art === 'zeit' ? 'zeit' : 'aufgaben';
  const anzahl = [5, 10, 20].includes(Number(e.anzahl)) ? Number(e.anzahl) : 10;
  const sekunden = [30, 60, 120].includes(Number(e.sekunden)) ? Number(e.sekunden) : 60;
  const format = ['sprint', 'liga', 'gruppen_ko', 'ko'].includes(e.format) ? e.format : 'ko';
  const ligaRunden = Math.min(5, Math.max(3, Number(e.ligaRunden) || 3));
  const gruppenGroesse = Math.min(5, Math.max(3, Number(e.gruppenGroesse) || 4));
  const gruppenRunden = Math.min(3, Math.max(2, Number(e.gruppenRunden) || 2));
  const weiterProGruppe = Math.min(2, Math.max(1, Number(e.weiterProGruppe) || 2));
  const strafe = Number.isFinite(e.strafe) && e.strafe >= 0 ? Number(e.strafe) : 5;

  return {
    uebungen,
    einsetzen: Boolean(e.einsetzen),
    art,
    anzahl,
    sekunden,
    strafe,
    format,
    ligaRunden,
    gruppenGroesse,
    gruppenRunden,
    weiterProGruppe,
    platz3: e.platz3 !== false,
  };
}

// Aufgaben für Teilnehmer ohne Lösungen filtern
function aufgabenFuerKind(auf) {
  if (!auf) return null;
  return {
    a: auf.luecke === 'a' ? null : auf.a,
    op: auf.op,
    b: auf.luecke === 'b' ? null : auf.b,
    c: auf.luecke === 'c' ? null : auf.c,
    luecke: auf.luecke,
    stellen: String(auf.loesung).length,
    uebung: auf.uebung,
  };
}
const aufgabeFuerKind = aufgabenFuerKind;

// Fisher-Yates-Mischen
function mischen(liste) {
  const arr = liste.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Gruppen-Einteilung: Größen unterscheiden sich höchstens um 1, keine Gruppe < 2
function gruppenEinteilen(teilnehmerIds, gruppenGroesse = 4) {
  const n = teilnehmerIds.length;
  if (n < 2) return [teilnehmerIds.slice()];
  let g = Math.round(n / gruppenGroesse);
  if (g < 1) g = 1;
  while (g > 1 && Math.floor(n / g) < 2) {
    g--;
  }
  const gruppen = Array.from({ length: g }, () => []);
  teilnehmerIds.forEach((id, i) => {
    gruppen[i % g].push(id);
  });
  return gruppen;
}

// Standard-Setzliste für K.-o.-Bäume (1 vs 2^m, 2 vs 2^m-1 usw.)
function setzListe(groesse) {
  if (groesse <= 2) return [1, 2];
  const vorher = setzListe(groesse / 2);
  const res = [];
  for (const s of vorher) {
    res.push(s, groesse + 1 - s);
  }
  return res;
}

// K.-o.-Baum generieren
// teilnehmer: geordnete oder gemischte IDs (Index 0 = Setzplatz 1)
function koBaumErstellen(teilnehmerIds, optionen = {}) {
  const k = teilnehmerIds.length;
  if (k < 2) {
    return { groesse: k, rundenZahl: 0, duelle: [] };
  }
  let groesse = 2;
  while (groesse < k) groesse *= 2;

  const freiloseAnzahl = groesse - k;
  const reihenfolge = setzListe(groesse);

  // Plätze 1..k mit Teilnehmern belegen, k+1..groesse sind Freilose (null)
  const belegung = new Map();
  for (let i = 0; i < k; i++) {
    belegung.set(i + 1, teilnehmerIds[i]);
  }

  const duelleRunde1 = [];
  for (let i = 0; i < groesse; i += 2) {
    const s1 = reihenfolge[i];
    const s2 = reihenfolge[i + 1];
    const t1 = belegung.get(s1) || null;
    const t2 = belegung.get(s2) || null;
    duelleRunde1.push({
      seed1: s1,
      seed2: s2,
      t1,
      t2,
      freilos: !t1 || !t2,
      sieger: !t2 ? t1 : (!t1 ? t2 : null),
    });
  }

  const rundenZahl = Math.round(Math.log2(groesse));
  return {
    groesse,
    freiloseAnzahl,
    rundenZahl,
    duelleRunde1,
    platz3: Boolean(optionen.platz3),
  };
}

// Aufgaben für ein Spiel erzeugen
function aufgabenErzeugen(einstellungen, anzahlExtra = 0) {
  const gen = Aufgaben.erzeuger({
    uebungen: einstellungen.uebungen,
    einsetzen: einstellungen.einsetzen,
  });
  const anzahl = einstellungen.art === 'zeit'
    ? Math.max(30, Math.ceil(einstellungen.sekunden / 2) + 15)
    : einstellungen.anzahl + anzahlExtra;

  const liste = [];
  for (let i = 0; i < anzahl; i++) {
    liste.push(gen());
  }
  return liste;
}

// Wertung für ein Spiel ermitteln
function wertungSpiel(spiel, art, einstellungen = {}) {
  const strafeSek = einstellungen.strafe ?? 5;
  const teilnehmer = spiel.teilnehmer || [];

  // Freilos
  if (spiel.freilos) {
    const sieger = teilnehmer[0] || spiel.sieger || null;
    return [{
      id: sieger,
      platz: 1,
      richtig: 0,
      falsch: 0,
      zeit: 0,
      punkte: 1,
      wertung: 0,
      freilos: true,
      nichtAngetreten: false,
    }];
  }

  const ergebnisse = teilnehmer.map((id) => {
    const st = (spiel.stand && spiel.stand[id]) || {
      index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null,
    };
    const nichtAngetreten = st.index === 0;
    const dauerMs = st.fertigUm && spiel.start ? st.fertigUm - spiel.start : (spiel.dauerMs || 0);
    const dauerSek = Math.max(0, Math.round(dauerMs / 100) / 10);

    let wertung = 0;
    let punkte = 0;

    if (art === 'aufgaben') {
      // mehr richtig > weniger Zeit (inkl. Strafsekunden)
      const zeitMitStrafe = dauerSek + st.falsch * strafeSek;
      wertung = st.richtig * 10000 - zeitMitStrafe;
    } else {
      // Zeit-Modus: Punkte = richtig - Math.floor(falsch / 4)
      punkte = Math.max(0, st.richtig - Math.floor(st.falsch / 4));
      // mehr Punkte > weniger Fehler > früherer letzter Punkt
      const zeitBonus = st.letzterPunktUm && spiel.start ? Math.max(0, 100000 - (st.letzterPunktUm - spiel.start) / 100) : 0;
      wertung = punkte * 1000000 - st.falsch * 1000 + zeitBonus;
    }

    return {
      id,
      richtig: st.richtig,
      falsch: st.falsch,
      zeit: dauerSek,
      punkte,
      wertung,
      nichtAngetreten,
      fertig: Boolean(st.fertigUm),
      letzterPunktUm: st.letzterPunktUm,
    };
  });

  // Sortieren nach Wertung
  ergebnisse.sort((a, b) => {
    if (a.nichtAngetreten && !b.nichtAngetreten) return 1;
    if (!a.nichtAngetreten && b.nichtAngetreten) return -1;
    if (b.wertung !== a.wertung) return b.wertung - a.wertung;
    if (a.falsch !== b.falsch) return a.falsch - b.falsch;
    return 0;
  });

  // Plätze vergeben (bei gleicher Wertung gleicher Platz)
  ergebnisse.forEach((e, idx) => {
    if (idx > 0 && e.wertung === ergebnisse[idx - 1].wertung && e.nichtAngetreten === ergebnisse[idx - 1].nichtAngetreten) {
      e.platz = ergebnisse[idx - 1].platz;
    } else {
      e.platz = idx + 1;
    }
  });

  return ergebnisse;
}

// Inaktive oder zu alte Turniere aufräumen
function aufraeumen(jetzt = Date.now()) {
  for (const [code, t] of turniere.entries()) {
    if (jetzt - t.zuletzt > INAKTIV_MS || jetzt - t.erstellt > MAX_ALTER_MS) {
      turniere.delete(code);
    }
  }
}

// Neues Turnier anlegen
function anlegen({ titel = '', einstellungen = {} } = {}) {
  aufraeumen();
  if (turniere.size >= MAX_TURNIERE) {
    throw new Error('Zu viele Turniere aktiv');
  }

  const code = codeErzeugen();
  const leitung = H.neuerSchluessel();
  const leitungHash = H.sha(leitung);
  const jetzt = Date.now();

  const t = {
    code,
    leitungHash,
    titel: String(titel || '').trim().slice(0, 50),
    erstellt: jetzt,
    zuletzt: jetzt,
    einstellungen: einstellungenNormalisieren(einstellungen),
    phase: 'lobby',
    offen: true,
    teilnehmer: new Map(),
    runden: [],
    baum: null,
    aktuelleRundeNr: 0,
    entscheidung: null,
  };

  turniere.set(code, t);
  return { code, leitung, turnier: t };
}

// Turnier anhand des Codes suchen
function finden(code) {
  if (!code) return null;
  const c = String(code).toUpperCase().trim();
  return turniere.get(c) || null;
}

// Prüfung: ist der Schlüssel die Leitung?
function istLeitung(turnier, schluessel) {
  if (!turnier || !schluessel) return false;
  return H.gleich(H.sha(schluessel), turnier.leitungHash);
}

// Teilnehmer anhand des Schlüssels suchen
function teilnehmerNachSchluessel(turnier, schluessel) {
  if (!turnier || !schluessel) return null;
  const hash = H.sha(schluessel);
  for (const tn of turnier.teilnehmer.values()) {
    if (H.gleich(hash, tn.schluesselHash)) return tn;
  }
  return null;
}

// Kind tritt dem Turnier bei
function beitreten(code, { name, emoji }) {
  const t = finden(code);
  if (!t) throw new Error('Turnier nicht gefunden');
  t.zuletzt = Date.now();

  if (!t.offen || t.phase !== 'lobby') {
    const err = new Error('Beitritt geschlossen');
    err.status = 423;
    throw err;
  }

  if (t.teilnehmer.size >= MAX_TEILNEHMER) {
    const err = new Error('Turnier ist voll');
    err.status = 409;
    throw err;
  }

  const gepruefterName = H.name(name);
  if (!gepruefterName || gepruefterName.length < 2) {
    const err = new Error('Ungültiger Name (2 bis 16 Zeichen)');
    err.status = 400;
    throw err;
  }

  const geprueftesEmoji = H.emoji(emoji);
  if (!geprueftesEmoji) {
    const err = new Error('Ungültiges Bild');
    err.status = 400;
    throw err;
  }

  // Name vergeben? (case-insensitive)
  const nameKlein = gepruefterName.toLowerCase();
  for (const tn of t.teilnehmer.values()) {
    if (tn.name.toLowerCase() === nameKlein) {
      const err = new Error(`${gepruefterName} gibt es schon – bitte wähle einen anderen Namen`);
      err.status = 409;
      throw err;
    }
  }

  const id = H.neueId();
  const schluessel = H.neuerSchluessel();
  const schluesselHash = H.sha(schluessel);

  const teilnehmer = {
    id,
    schluesselHash,
    name: gepruefterName,
    emoji: geprueftesEmoji,
    verbunden: true,
    aktiv: true,
    punkte: 0,
    platz: null,
  };

  t.teilnehmer.set(id, teilnehmer);
  return { id, schluessel, teilnehmer };
}

// Kind verlässt das Turnier
function verlassen(code, teilnehmerSchluessel) {
  const t = finden(code);
  if (!t) throw new Error('Turnier nicht gefunden');
  t.zuletzt = Date.now();

  const tn = teilnehmerNachSchluessel(t, teilnehmerSchluessel);
  if (!tn) throw new Error('Teilnehmer nicht gefunden');

  if (t.phase === 'lobby') {
    t.teilnehmer.delete(tn.id);
  } else {
    tn.aktiv = false;
    tn.verbunden = false;
  }
  return { id: tn.id };
}

// Leitung entfernt ein Kind
function entfernen(t, leitungSchluessel, teilnehmerId) {
  if (!istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  t.zuletzt = Date.now();
  const tn = t.teilnehmer.get(teilnehmerId);
  if (!tn) return null;

  if (t.phase === 'lobby') {
    t.teilnehmer.delete(teilnehmerId);
  } else {
    tn.aktiv = false;
    tn.verbunden = false;
  }
  return tn;
}

// Beitritt öffnen oder schließen
function beitrittSchliessen(t, leitungSchluessel, offen) {
  if (!istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  t.zuletzt = Date.now();
  t.offen = Boolean(offen);
  return t.offen;
}

// Neue Runde planen (Vorschau aufbauen)
function rundePlanen(t) {
  const aktive = Array.from(t.teilnehmer.values()).filter((tn) => tn.aktiv);
  if (aktive.length < 2) {
    throw new Error('Mindestens 2 aktive Teilnehmer erforderlich');
  }

  const nr = t.aktuelleRundeNr + 1;
  const spiele = [];
  const format = t.einstellungen.format;

  if (format === 'sprint') {
    // Sprint: genau eine Runde, alle in einem Spiel
    const aufgaben = aufgabenErzeugen(t.einstellungen);
    const teilnehmerIds = aktive.map((tn) => tn.id);
    const stand = {};
    teilnehmerIds.forEach((id) => {
      stand[id] = { index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null };
    });

    spiele.push({
      id: `r${nr}s1`,
      teilnehmer: teilnehmerIds,
      freilos: false,
      aufgaben,
      stand,
      ergebnis: null,
    });

    t.runden.push({
      nr,
      stufe: 'sprint',
      start: 0,
      ende: 0,
      spiele,
    });
  } else if (format === 'ko') {
    // K.-o.-Runde planen
    if (nr === 1) {
      // Runde 1: K.-o.-Baum anlegen
      const gemischt = mischen(aktive.map((tn) => tn.id));
      const baum = koBaumErstellen(gemischt, { platz3: t.einstellungen.platz3 });
      t.baum = baum;

      baum.duelleRunde1.forEach((d, idx) => {
        const teilnehmerIds = [d.t1, d.t2].filter(Boolean);
        const aufgaben = d.freilos ? [] : aufgabenErzeugen(t.einstellungen);
        const stand = {};
        teilnehmerIds.forEach((id) => {
          stand[id] = { index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null };
        });

        spiele.push({
          id: `r${nr}s${idx + 1}`,
          teilnehmer: teilnehmerIds,
          freilos: d.freilos,
          sieger: d.sieger,
          aufgaben,
          stand,
          ergebnis: d.freilos
            ? wertungSpiel({ teilnehmer: teilnehmerIds, freilos: true, sieger: d.sieger }, t.einstellungen.art, t.einstellungen)
            : null,
        });
      });

      t.runden.push({
        nr,
        stufe: baum.rundenZahl === 1 ? 'finale' : (baum.rundenZahl === 2 ? 'halbfinale' : `ko_${nr}`),
        start: 0,
        ende: 0,
        spiele,
      });
    } else {
      // Folge-Runde K.-o.: Sieger der vorherigen Runde paaren
      const vorRunde = t.runden[nr - 2];
      const siegerIds = [];
      vorRunde.spiele.forEach((sp) => {
        if (sp.ergebnis && sp.ergebnis[0]) {
          siegerIds.push(sp.ergebnis[0].id);
        }
      });

      // Spiel um Platz 3 (wenn aktiviert und Finale ansteht)
      const istFinale = siegerIds.length === 2;
      const istPlatz3Noetig = istFinale && t.einstellungen.platz3 && vorRunde.spiele.length === 2;

      for (let i = 0; i < siegerIds.length; i += 2) {
        const p1 = siegerIds[i];
        const p2 = siegerIds[i + 1] || null;
        const teilnehmerIds = [p1, p2].filter(Boolean);
        const freilos = !p2;
        const aufgaben = freilos ? [] : aufgabenErzeugen(t.einstellungen);
        const stand = {};
        teilnehmerIds.forEach((id) => {
          stand[id] = { index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null };
        });

        spiele.push({
          id: `r${nr}s${spiele.length + 1}`,
          teilnehmer: teilnehmerIds,
          freilos,
          sieger: freilos ? p1 : null,
          aufgaben,
          stand,
          ergebnis: null,
          typ: istFinale ? 'finale' : 'ko',
        });
      }

      // Verlierer des Halbfinales für Spiel um Platz 3
      if (istPlatz3Noetig) {
        const verliererIds = [];
        vorRunde.spiele.forEach((sp) => {
          if (sp.ergebnis && sp.ergebnis[1]) {
            verliererIds.push(sp.ergebnis[1].id);
          }
        });
        if (verliererIds.length === 2) {
          const aufgaben = aufgabenErzeugen(t.einstellungen);
          const stand = {};
          verliererIds.forEach((id) => {
            stand[id] = { index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null };
          });
          spiele.push({
            id: `r${nr}s_platz3`,
            teilnehmer: verliererIds,
            freilos: false,
            aufgaben,
            stand,
            ergebnis: null,
            typ: 'platz3',
          });
        }
      }

      t.runden.push({
        nr,
        stufe: istFinale ? 'finale' : `ko_${nr}`,
        start: 0,
        ende: 0,
        spiele,
      });
    }
  } else if (format === 'gruppen_ko' || format === 'liga') {
    // Gruppenphase / Liga
    const gruppen = gruppenEinteilen(aktive.map((tn) => tn.id), t.einstellungen.gruppenGroesse);
    gruppen.forEach((gruppe, gIdx) => {
      const aufgaben = aufgabenErzeugen(t.einstellungen);
      const stand = {};
      gruppe.forEach((id) => {
        stand[id] = { index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null };
      });
      spiele.push({
        id: `r${nr}g${gIdx + 1}`,
        teilnehmer: gruppe,
        freilos: false,
        aufgaben,
        stand,
        ergebnis: null,
        gruppeNr: gIdx + 1,
      });
    });

    t.runden.push({
      nr,
      stufe: format === 'liga' ? 'liga' : 'gruppe',
      start: 0,
      ende: 0,
      spiele,
    });
  }

  t.aktuelleRundeNr = nr;
}

// Turnier starten: wechselt von lobby zu vorschau
function starten(t, leitungSchluessel) {
  if (!istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  if (t.phase !== 'lobby') {
    const err = new Error(`Befehl 'starten' in Phase '${t.phase}' nicht erlaubt`);
    err.status = 409;
    throw err;
  }
  t.zuletzt = Date.now();
  t.offen = false; // Beitritt schließen
  rundePlanen(t);
  t.phase = 'vorschau';
  return t;
}

// Paarungen neu auslosen (nur in vorschau)
function neuMischen(t, leitungSchluessel) {
  if (!istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  if (t.phase !== 'vorschau') {
    const err = new Error(`Befehl 'neu_mischen' in Phase '${t.phase}' nicht erlaubt`);
    err.status = 409;
    throw err;
  }
  t.zuletzt = Date.now();

  // Aktuelle Runde verwerfen und neu anlegen
  t.runden.pop();
  t.aktuelleRundeNr--;
  rundePlanen(t);
  return t;
}

// Runde starten: startet 3-Sekunden-Countdown
function rundeStarten(t, leitungSchluessel, jetzt = Date.now()) {
  if (!istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  if (t.phase !== 'vorschau') {
    const err = new Error(`Befehl 'runde_starten' in Phase '${t.phase}' nicht erlaubt`);
    err.status = 409;
    throw err;
  }
  t.zuletzt = jetzt;

  const runde = t.runden[t.aktuelleRundeNr - 1];
  const startUm = jetzt + 3000;
  runde.start = startUm;
  runde.dauerMs = t.einstellungen.art === 'zeit' ? t.einstellungen.sekunden * 1000 : 0;
  t.phase = 'countdown';
  t.countdownBis = startUm;

  return { startUm, rundeNr: runde.nr };
}

// Countdown abgelaufen -> Status laeuft
function rundeAktivieren(t, jetzt = Date.now()) {
  if (t.phase === 'countdown' && jetzt >= (t.countdownBis || 0)) {
    t.phase = 'laeuft';
    t.zuletzt = jetzt;
    return true;
  }
  return false;
}

// Prüfen, ob alle Spiele der aktuellen Runde fertig sind
function alleSpieleFertig(runde) {
  if (!runde || !runde.spiele) return false;
  return runde.spiele.every((sp) => {
    if (sp.freilos) return true;
    return sp.teilnehmer.every((id) => {
      const st = sp.stand && sp.stand[id];
      return st && Boolean(st.fertigUm);
    });
  });
}

// Runde auswerten und beenden
function rundeBeenden(t, leitungSchluessel, jetzt = Date.now()) {
  if (leitungSchluessel && !istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  if (t.phase !== 'laeuft' && t.phase !== 'countdown') {
    const err = new Error(`Befehl 'beenden' in Phase '${t.phase}' nicht erlaubt`);
    err.status = 409;
    throw err;
  }
  t.zuletzt = jetzt;

  const runde = t.runden[t.aktuelleRundeNr - 1];
  runde.ende = jetzt;
  runde.dauerMs = Math.max(100, jetzt - (runde.start || jetzt));

  // Spiele auswerten
  runde.spiele.forEach((sp) => {
    if (!sp.ergebnis) {
      sp.ergebnis = wertungSpiel(sp, t.einstellungen.art, t.einstellungen);
    }
  });

  // K.-o.-Verlierer markieren (außer im Spiel um Platz 3)
  if (t.einstellungen.format === 'ko') {
    runde.spiele.forEach((sp) => {
      if (sp.ergebnis && sp.ergebnis.length >= 2 && sp.typ !== 'platz3') {
        const verliererId = sp.ergebnis[1].id;
        const istHalbfinale = runde.stufe === 'halbfinale' || runde.spiele.length === 2;
        // Im Halbfinale scheidet das Kind noch nicht komplett aus, wenn Spiel um Platz 3 ansteht
        if (!(istHalbfinale && t.einstellungen.platz3)) {
          const tn = t.teilnehmer.get(verliererId);
          if (tn) tn.aktiv = false;
        }
      }
    });
  }

  t.phase = 'auswertung';

  // Prüfen, ob das gesamte Turnier zu Ende ist
  if (t.einstellungen.format === 'sprint') {
    turnierAbschliessen(t);
  } else if (t.einstellungen.format === 'ko') {
    const aktive = Array.from(t.teilnehmer.values()).filter((tn) => tn.aktiv);
    if (runde.stufe === 'finale' || runde.spiele.some((sp) => sp.typ === 'finale') || aktive.length <= 1) {
      turnierAbschliessen(t);
    }
  }

  return runde;
}

// Gesamtplatzierung am Ende berechnen
function turnierAbschliessen(t) {
  t.phase = 'ende';
  const format = t.einstellungen.format;

  if (format === 'sprint') {
    const runde1 = t.runden[0];
    if (runde1 && runde1.spiele[0] && runde1.spiele[0].ergebnis) {
      runde1.spiele[0].ergebnis.forEach((erg) => {
        const tn = t.teilnehmer.get(erg.id);
        if (tn) tn.platz = erg.platz;
      });
    }
  } else if (format === 'ko') {
    const letzteRunde = t.runden[t.runden.length - 1];
    const finaleSpiel = letzteRunde && letzteRunde.spiele.find((sp) => sp.typ === 'finale' || letzteRunde.stufe === 'finale');
    const platz3Spiel = letzteRunde && letzteRunde.spiele.find((sp) => sp.typ === 'platz3');

    if (finaleSpiel && finaleSpiel.ergebnis) {
      if (finaleSpiel.ergebnis[0]) {
        const tn1 = t.teilnehmer.get(finaleSpiel.ergebnis[0].id);
        if (tn1) tn1.platz = 1;
      }
      if (finaleSpiel.ergebnis[1]) {
        const tn2 = t.teilnehmer.get(finaleSpiel.ergebnis[1].id);
        if (tn2) tn2.platz = 2;
      }
    }

    if (platz3Spiel && platz3Spiel.ergebnis) {
      if (platz3Spiel.ergebnis[0]) {
        const tn3 = t.teilnehmer.get(platz3Spiel.ergebnis[0].id);
        if (tn3) tn3.platz = 3;
      }
      if (platz3Spiel.ergebnis[1]) {
        const tn4 = t.teilnehmer.get(platz3Spiel.ergebnis[1].id);
        if (tn4) tn4.platz = 4;
      }
    }

    // Platzierungen für früher ausgeschiedene Teilnehmer
    // Rückwärts durch die Runden gehen
    let naechsterPlatz = (platz3Spiel ? 5 : 3);
    for (let rIdx = t.runden.length - 1; rIdx >= 0; rIdx--) {
      const r = t.runden[rIdx];
      const verliererDerRunde = [];
      r.spiele.forEach((sp) => {
        if (sp.ergebnis && sp.ergebnis.length >= 2 && sp.typ !== 'platz3') {
          const vid = sp.ergebnis[1].id;
          const tn = t.teilnehmer.get(vid);
          if (tn && tn.platz === null) {
            verliererDerRunde.push(tn);
          }
        }
      });
      if (verliererDerRunde.length > 0) {
        const platzStr = verliererDerRunde.length === 1 ? naechsterPlatz : `${naechsterPlatz}–${naechsterPlatz + verliererDerRunde.length - 1}`;
        verliererDerRunde.forEach((tn) => {
          tn.platz = platzStr;
        });
        naechsterPlatz += verliererDerRunde.length;
      }
    }
  }
}

// Nächste Runde aufrufen
function naechste(t, leitungSchluessel) {
  if (!istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  if (t.phase !== 'auswertung') {
    const err = new Error(`Befehl 'naechste' in Phase '${t.phase}' nicht erlaubt`);
    err.status = 409;
    throw err;
  }
  t.zuletzt = Date.now();

  const format = t.einstellungen.format;
  if (format === 'sprint' || t.phase === 'ende') {
    turnierAbschliessen(t);
    return t;
  }

  // Für K.-o. prüfen, ob bereits Finale war
  const runde = t.runden[t.aktuelleRundeNr - 1];
  if (runde.stufe === 'finale' || runde.spiele.some((sp) => sp.typ === 'finale')) {
    turnierAbschliessen(t);
    return t;
  }

  rundePlanen(t);
  t.phase = 'vorschau';
  return t;
}

// Laufende Runde abbrechen -> zurück zu vorschau
function abbrechen(t, leitungSchluessel) {
  if (!istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  if (t.phase !== 'laeuft' && t.phase !== 'countdown') {
    const err = new Error(`Befehl 'abbrechen' in Phase '${t.phase}' nicht erlaubt`);
    err.status = 409;
    throw err;
  }
  t.zuletzt = Date.now();
  t.phase = 'vorschau';
  const runde = t.runden[t.aktuelleRundeNr - 1];
  if (runde) {
    runde.start = 0;
    runde.spiele.forEach((sp) => {
      sp.ergebnis = null;
      if (sp.stand) {
        Object.keys(sp.stand).forEach((id) => {
          sp.stand[id] = { index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null };
        });
      }
    });
  }
  return t;
}

// Antwort eines Kindes entgegennehmen und prüfen
function antworten(t, teilnehmerSchluessel, { spiel: spielId, index, wert }, jetzt = Date.now()) {
  t.zuletzt = jetzt;

  // Countdown prüfen
  if (t.phase === 'countdown') {
    rundeAktivieren(t, jetzt);
  }

  if (t.phase !== 'laeuft') {
    return { ignoriert: true, grund: 'Runde läuft nicht' };
  }

  const tn = teilnehmerNachSchluessel(t, teilnehmerSchluessel);
  if (!tn) {
    const err = new Error('Teilnehmer nicht gefunden');
    err.status = 401;
    throw err;
  }

  const runde = t.runden[t.aktuelleRundeNr - 1];
  if (!runde) return { ignoriert: true };

  const spiel = runde.spiele.find((sp) => sp.id === spielId);
  if (!spiel || !spiel.teilnehmer.includes(tn.id)) {
    const err = new Error('Spiel nicht gefunden');
    err.status = 404;
    throw err;
  }

  const st = spiel.stand[tn.id];
  if (!st) return { ignoriert: true };

  // Bereits fertig?
  if (st.fertigUm) {
    return { fertig: true, richtig: null, naechste: null };
  }

  // Index-Prüfung: doppelte oder veraltete Antworten ignorieren
  const antwIndex = Number(index);
  if (antwIndex !== st.index) {
    const naechsteAufg = spiel.aufgaben[st.index] || null;
    return {
      ignoriert: true,
      aktuellerIndex: st.index,
      naechste: aufgabeFuerKind(naechsteAufg),
    };
  }

  const aufgabe = spiel.aufgaben[st.index];
  if (!aufgabe) {
    st.fertigUm = jetzt;
    return { fertig: true, richtig: null, naechste: null };
  }

  const istRichtig = Number(wert) === aufgabe.loesung;
  if (istRichtig) {
    st.richtig++;
    st.letzterPunktUm = jetzt;
  } else {
    st.falsch++;
  }
  st.index++;

  // Aufgaben-Modus: fertig bei Erreichen der Zielanzahl
  let istFertig = false;
  if (t.einstellungen.art === 'aufgaben') {
    if (st.index >= t.einstellungen.anzahl) {
      st.fertigUm = jetzt;
      istFertig = true;
    }
  }

  const naechsteAufg = !istFertig ? spiel.aufgaben[st.index] : null;

  // Prüfen, ob alle Spiele fertig sind
  if (alleSpieleFertig(runde)) {
    rundeBeenden(t, null, jetzt);
  }

  return {
    richtig: istRichtig,
    index: st.index,
    fertig: istFertig,
    naechste: aufgabeFuerKind(naechsteAufg),
  };
}

// Neues Turnier mit denselben Kindern anlegen (nach Ende)
function neuesTurnierGleicheKinder(t, leitungSchluessel) {
  if (!istLeitung(t, leitungSchluessel)) {
    const err = new Error('Nicht berechtigt');
    err.status = 403;
    throw err;
  }
  t.zuletzt = Date.now();
  t.phase = 'lobby';
  t.offen = true;
  t.runden = [];
  t.baum = null;
  t.aktuelleRundeNr = 0;
  for (const tn of t.teilnehmer.values()) {
    tn.aktiv = true;
    tn.punkte = 0;
    tn.platz = null;
  }
  return t;
}

// Öffentliche Kurzinfo für Beitrittsseite
function kurzinfo(t) {
  if (!t) return null;
  return {
    code: t.code,
    titel: t.titel,
    phase: t.phase,
    offen: t.offen,
    anzahl: t.teilnehmer.size,
  };
}

module.exports = {
  turniere,
  anlegen,
  finden,
  kurzinfo,
  beitreten,
  verlassen,
  entfernen,
  beitrittSchliessen,
  starten,
  neuMischen,
  rundeStarten,
  rundeAktivieren,
  rundeBeenden,
  naechste,
  abbrechen,
  antworten,
  neuesTurnierGleicheKinder,
  // Pure Algorithmen und Helfer für Tests
  gruppenEinteilen,
  koBaumErstellen,
  wertungSpiel,
  aufgabenFuerKind,
  aufgabenErzeugen,
  aufraeumen,
  istLeitung,
  teilnehmerNachSchluessel,
};
