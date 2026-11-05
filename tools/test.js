// Selbsttest: node tools/test.js
const assert = require('assert');
const A = require('../js/aufgaben.js');
const { Zahlwort, Jonas } = require('../js/sprache.js');
const Schrauben = require('../js/spiele/schrauben.js');
const Unblock = require('../js/spiele/unblock.js');

let fehler = 0;
const pruefe = (name, f) => { try { f(); console.log('ok  ', name); } catch (e) { fehler++; console.log('FAIL', name, '-', e.message); } };

// ---- Aufgaben ----
// Grenzen je Übung: höchste Zahl, Zehnerübergang (true/false/undefined)
const GRENZE = {
  plus10: [10], minus10: [10], plus20: [20, false], plus20u: [20, true], minus20: [20, false], minus20u: [20, true],
  zehner: [100], plus100: [100, false], plus100u: [100, true], minus100: [100, false], minus100u: [100, true],
  mal2510: [100], mal: [100], geteilt: [100],
};
const ueber = (op, a, b) => (op === '+' ? (a % 10) + (b % 10) >= 10 : (a % 10) < (b % 10));
pruefe('Jede Übung hat Grenzen im Test', () => {
  A.UEBUNGEN.forEach((u) => assert(GRENZE[u.id], `Test fehlt für ${u.id}`));
});
for (const u of A.UEBUNGEN) {
  for (const uebungen of [[u.id]]) {
    const [raum, ueb] = GRENZE[u.id] || [100];
    for (const einsetzen of [false, true]) {
      pruefe(`Aufgaben ${u.id}${einsetzen ? ' E' : ''}`, () => {
        const gen = A.erzeuger({ uebungen, einsetzen });
        for (let i = 0; i < 10000; i++) {
          const t = gen();
          const { a, b, c, op } = t;
          [a, b, c].forEach((n) => assert(Number.isInteger(n) && n >= 0, `negativ/keine Zahl: ${A.alsText(t, true)}`));
          if (op === '+') assert(a + b === c && c <= raum, A.alsText(t, true));
          if (op === '-') assert(a - b === c && a <= raum, A.alsText(t, true));
          if (op === '*') assert(a * b === c && c <= raum && a <= 10 && b <= 10, A.alsText(t, true));
          if (op === '/') assert(b > 0 && b * c === a && a <= raum, A.alsText(t, true));
          if (!einsetzen) assert(t.luecke === 'c');
          assert.strictEqual(t.uebung, u.id);
          if (ueb !== undefined) assert.strictEqual(ueber(op, a, b), ueb, `Übergang: ${A.alsText(t, true)}`);
          if (u.id === 'zehner') assert(a % 10 === 0 && b % 10 === 0, A.alsText(t, true));
          if (u.id === 'mal2510') assert([2, 5, 10].includes(a) || [2, 5, 10].includes(b), A.alsText(t, true));
          assert(t.loesung === t[t.luecke]);
          // Eindeutigkeit der Lücke: keine andere Zahl 0..raum erfüllt die Gleichung
          if (t.luecke !== 'c') {
            const passt = [];
            for (let x = 0; x <= Math.max(raum, 100); x++) {
              const aa = t.luecke === 'a' ? x : a;
              const bb = t.luecke === 'b' ? x : b;
              const r = op === '+' ? aa + bb : op === '-' ? aa - bb : op === '*' ? aa * bb : bb ? aa / bb : NaN;
              if (r === c) passt.push(x);
            }
            assert(passt.length === 1, `mehrdeutig: ${A.alsText(t)} -> ${passt}`);
          }
        }
      });
    }
  }
}
pruefe('keine direkte Wiederholung', () => {
  const gen = A.erzeuger({ uebungen: ['plus20', 'plus20u'], einsetzen: false });
  const l = Array.from({ length: 10 }, gen).map((t) => t.key);
  assert(new Set(l).size === 10, l.join(' '));
});

// ---- Zielzeit und Sterne ----
pruefe('Zielzeit je Aufgabe', () => {
  const z = (uebung, luecke = 'c', sp = false) => A.zielzeit({ uebung, luecke }, sp);
  assert.strictEqual(z('plus10'), 3);
  assert.strictEqual(z('plus20'), 3);
  assert.strictEqual(z('plus20u'), 4);
  assert.strictEqual(z('minus100'), 5);
  assert.strictEqual(z('plus100u'), 7);
  assert.strictEqual(z('mal'), 4);
  assert.strictEqual(z('geteilt'), 5);
  assert.strictEqual(z('plus10', 'a'), 5);       // Einsetzen
  assert.strictEqual(z('plus10', 'c', true), 4.5); // gesprochene Antwort
});
pruefe('Übungen im Rekord-Schlüssel und alte Schlüssel', () => {
  assert.strictEqual(A.uebungenTeil(['plus20u', 'plus20', 'plus20']), 'plus20,plus20u');
  assert(A.uebungenGueltig('plus20,plus20u'));
  assert(!A.uebungenGueltig('plus20u,plus20'));   // unsortiert
  assert(!A.uebungenGueltig('plus20,plus20'));    // doppelt
  assert(!A.uebungenGueltig('quatsch'));
  assert(!A.uebungenGueltig(''));
  assert.strictEqual(A.alterSchluessel('schrift|zehn|+|10|'), 'schrift|zehn|plus10|');
  assert.strictEqual(A.alterSchluessel('sprache|m1|*+-|100|E'), 'sprache|m1|mal,minus100,minus100u,plus100,plus100u|E');
  assert.strictEqual(A.alterSchluessel('schrift|a20|-|20|'), 'schrift|a20|minus20,minus20u|');
  // nicht vergleichbar: bis 50 und Mal/Geteilt unter 100 waren leichter → Rekord verfällt
  assert.strictEqual(A.alterSchluessel('schrift|zehn|+|50|'), null);
  assert.strictEqual(A.alterSchluessel('schrift|zehn|*|10|'), null);
  assert.strictEqual(A.alterSchluessel('schrift|zehn|+/|20|'), null);
  assert(A.istAlterSchluessel('schrift|zehn|*|10|'));
  assert.strictEqual(A.alterSchluessel('schrift|zehn|plus10|'), null);
  assert(!A.istAlterSchluessel('schrift|zehn|plus10|'));
  // Gerät: alte Schlüssel umstellen, nicht vergleichbare löschen, besserer Wert gewinnt
  global.Aufgaben = A;
  const S = require('../js/speicher.js');
  const geraet = { settings: { ops: ['*'], raum: 10 }, rekorde: {
    'schrift|zehn|*|10|': { wert: 9 }, 'schrift|zehn|*|100|': { wert: 30 }, 'schrift|zehn|mal|': { wert: 25 },
    'schrift|m1|+|20|': { wert: 12 },
  } };
  S.uebungenUmstellen(geraet);
  assert.deepStrictEqual(geraet.settings.uebungen, ['mal']);
  assert.deepStrictEqual(Object.keys(geraet.rekorde).sort(), ['schrift|m1|plus20,plus20u|', 'schrift|zehn|mal|']);
  assert.strictEqual(geraet.rekorde['schrift|zehn|mal|'].wert, 25);
  const ids = A.UEBUNGEN.map((u) => u.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'ids doppelt');
  ids.forEach((id) => assert(/^[a-z0-9]{2,12}$/.test(id), `id ${id}`));
});
pruefe('Sterne nach Genauigkeit und Tempo', () => {
  const st = (gestellt, falsch, zeit, ziel = 30) => A.sterne({ gestellt, falsch, zeit, ziel });
  assert.strictEqual(st(10, 0, 30), 5);
  assert.strictEqual(st(10, 0, 31), 4);
  assert.strictEqual(st(10, 1, 20), 4);
  assert.strictEqual(st(10, 1, 50), 3);
  assert.strictEqual(st(10, 0, 70), 2);        // fehlerfrei, aber sehr langsam
  assert.strictEqual(st(10, 2, 20), 2);
  assert.strictEqual(st(10, 4, 20), 1);
  assert.strictEqual(st(10, 6, 20), 0);        // weniger als die Hälfte richtig
  assert.strictEqual(st(40, 2, 30), 4);        // 2 Fehler bei 40 Aufgaben erlaubt
  assert.strictEqual(st(0, 0, 60), 0);
});

// ---- Zahlwörter ----
const FAELLE = {
  'sieben': 7, 'siebzehn': 17, 'dreiundvierzig': 43, 'drei und vierzig': 43, 'hundert': 100,
  'zwo': 2, 'null': 0, 'elf': 11, 'zwölf': 12, 'einundzwanzig': 21, 'neunundneunzig': 99,
  'dreißig': 30, '42': 42, 'das ist 8': 8, 'drei plus vier ist sieben': 7, 'Fünfzehn.': 15,
  'achtundfünfzig': 58, 'eins': 1, 'sechzig': 60, 'hallo': null, '': null,
  'nein': 9, 'Neu': 9, 'nine': 9, 'Nein.': 9, 'neun': 9, 'sex': 6, 'frei': 3,
};
for (const [t, z] of Object.entries(FAELLE)) {
  pruefe(`Zahlwort "${t}"`, () => assert.strictEqual(Zahlwort.parse(t), z));
}
pruefe('alle Zahlen 0-100 als Wort', () => {
  const E = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
  const T = { 10: 'zehn', 11: 'elf', 12: 'zwölf', 13: 'dreizehn', 14: 'vierzehn', 15: 'fünfzehn', 16: 'sechzehn', 17: 'siebzehn', 18: 'achtzehn', 19: 'neunzehn' };
  const Z = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
  for (let n = 0; n <= 100; n++) {
    let w;
    if (n < 10) w = E[n];
    else if (n < 20) w = T[n];
    else if (n === 100) w = 'hundert';
    else if (n % 10 === 0) w = Z[n / 10];
    else w = (n % 10 === 1 ? 'ein' : E[n % 10]) + 'und' + Z[Math.floor(n / 10)];
    assert.strictEqual(Zahlwort.parse(w), n, w);
  }
});

// ---- Jonas-Schnipsel ----
const fs = require('fs');
const path = require('path');
pruefe('Jonas zerlegt Vorlese-Sätze', () => {
  assert.deepStrictEqual(Jonas.zerlegen('7 minus 5'), ['z7', 'minus', 'e5']);
  assert.deepStrictEqual(Jonas.zerlegen('Wie viel plus 4 ergibt 9?'), ['wieviel-anfang', 'plus', 'z4', 'ergibt', 'f9']);
  assert.deepStrictEqual(Jonas.zerlegen('23 durch wie viel ergibt 1?'), ['z23', 'durch', 'wieviel', 'ergibt', 'f1']);
  assert.strictEqual(Jonas.zerlegen('Hallo Welt'), null);
});
pruefe('Jonas hat Schnipsel für alle Aufgaben', () => {
  const gen = A.erzeuger({ uebungen: A.UEBUNGEN.map((u) => u.id), einsetzen: true });
  for (let i = 0; i < 20000; i++) {
    const namen = Jonas.zerlegen(A.alsSatz(gen()));
    assert.ok(namen);
    for (const n of namen) assert.ok(fs.existsSync(path.join(__dirname, '..', 'audio', 'jonas', n + '.mp3')), n);
  }
});

// ---- Schrauben ----
pruefe('Schrauben-Levels 1-20 lösbar', () => {
  for (let nr = 1; nr <= 20; nr++) {
    const t0 = Date.now();
    const s = Schrauben.level(nr);
    assert(Schrauben.loesbar(s), `Level ${nr}`);
    assert(!Schrauben.geloest(s), `Level ${nr} schon gelöst`);
    assert(Date.now() - t0 < 3000, `Level ${nr} zu langsam`);
  }
});
pruefe('Schrauben gleiche Nummer = gleiches Level', () => {
  assert.deepStrictEqual(Schrauben.level(5), Schrauben.level(5));
});

// ---- Unblock ----
pruefe('Unblock-Levels 1-30', () => {
  const d = [];
  for (let nr = 1; nr <= 30; nr++) {
    const t0 = Date.now();
    const lv = Unblock.level(nr);
    assert(lv && lv.d >= 1, `Level ${nr} leer`);
    assert(!Unblock.geloest(lv.pos), `Level ${nr} schon gelöst`);
    const ms = Date.now() - t0;
    assert(ms < 4000, `Level ${nr} braucht ${ms} ms`);
    d.push(`${nr}:${lv.d}(${ms}ms)`);
  }
  console.log('      Mindestzüge:', d.join(' '));
});

// ---- Server: Konten und Klassen-Import ----
const H = require('../server/hilfe.js');
pruefe('Benutzername und Adresse', () => {
  assert.strictEqual(H.benutzername(' lena.m '), 'lena.m');
  assert.strictEqual(H.benutzername('max mustermann'), null);
  assert.strictEqual(H.benutzername('a'), null);
  assert.strictEqual(H.email('Lena@Piazzi.at', 'piazzi.at'), 'lena@piazzi.at');
  assert.strictEqual(H.email('lena@piazzi.at.evil.com', 'piazzi.at'), null);
  assert.strictEqual(H.email('lena@xpiazzi.at', 'piazzi.at'), null);
  assert.strictEqual(H.passwort('12345'), null);
});
pruefe('Klassen-CSV', () => {
  const csv = '﻿Benutzername;Klasse\r\nmax.muster;1a\r\n\r\n"Lena.Berg@bgblumenstrasse.at","2b"\nfremd@gmail.com;1a\nnurname\nzu viel leer;1a\nanna\t3c\n';
  const r = H.klassenCsv(csv, 'bgblumenstrasse.at');
  assert.deepStrictEqual(r.zeilen, [
    { benutzername: 'max.muster', klasse: '1a' }, { benutzername: 'lena.berg', klasse: '2b' }, { benutzername: 'anna', klasse: '3c' },
  ]);
  assert.deepStrictEqual(r.fehler.map((f) => f.zeile), [5, 6, 7]);
});

// ---- Turniermodus (server/turnier.js) ----
const Turnier = require('../server/turnier.js');
const TurnierRouten = require('../server/turnier-routen.js');

const antwortenUndSenden = (turnier, schluessel, daten, jetzt) => {
  const res = Turnier.antworten(turnier, schluessel, daten, jetzt);
  if (res.rundeFertig || res.zeitUm) {
    TurnierRouten.rundenendeSenden(turnier);
  }
  return res;
};

pruefe('Turnier-Gruppen für n = 2..60', () => {
  for (let n = 2; n <= 60; n++) {
    const kinder = Array.from({ length: n }, (_, i) => `k_${i + 1}`);
    for (const gg of [3, 4, 5]) {
      const gruppen = Turnier.gruppenEinteilen(kinder, gg);
      assert(gruppen.length >= 1, `n=${n}, gg=${gg}: keine Gruppen`);
      const enthalten = new Set();
      let minGr = Infinity;
      let maxGr = 0;
      for (const g of gruppen) {
        assert(g.length >= 2, `n=${n}, gg=${gg}: Gruppe kleiner als 2: ${g.length}`);
        if (g.length < minGr) minGr = g.length;
        if (g.length > maxGr) maxGr = g.length;
        for (const k of g) {
          assert(!enthalten.has(k), `n=${n}, gg=${gg}: doppelt ${k}`);
          enthalten.add(k);
        }
      }
      assert.strictEqual(enthalten.size, n, `n=${n}, gg=${gg}: nicht alle Kinder`);
      assert(maxGr - minGr <= 1, `n=${n}, gg=${gg}: ungleichmäßig ${minGr}..${maxGr}`);
    }
  }
});

pruefe('Turnier-KO-Baum für k = 2..60', () => {
  for (let k = 2; k <= 60; k++) {
    const kinder = Array.from({ length: k }, (_, i) => `k_${i + 1}`);
    const baum = Turnier.koBaumErstellen(kinder);
    const zweierpotenz = 2 ** Math.ceil(Math.log2(k));
    assert.strictEqual(baum.groesse, zweierpotenz);
    assert.strictEqual(baum.freiloseAnzahl, zweierpotenz - k);

    const gefunden = new Set();
    baum.duelleRunde1.forEach((d) => {
      [d.t1, d.t2].filter(Boolean).forEach((id) => {
        assert(!gefunden.has(id), `k=${k}: doppeltes Kind ${id}`);
        gefunden.add(id);
      });
      if (d.freilos) {
        assert(d.t1 && !d.t2, `k=${k}: Freilos-Slot ungültig`);
        assert.strictEqual(d.sieger, d.t1);
      }
    });
    assert.strictEqual(gefunden.size, k, `k=${k}: nicht alle Kinder im Baum`);
  }
});

pruefe('Turnier-Wertung Aufgaben- und Zeitmodus', () => {
  // Aufgaben-Modus: mehr richtig > weniger Zeit (inkl. Strafe)
  const spAufgaben = {
    teilnehmer: ['k1', 'k2', 'k3'],
    freilos: false,
    dauerMs: 20000,
    start: 1000,
    stand: {
      k1: { index: 10, richtig: 9, falsch: 1, fertigUm: 15000, letzterPunktUm: 14000 }, // 9 richtig, 14s + 5s = 19s
      k2: { index: 10, richtig: 9, falsch: 0, fertigUm: 18000, letzterPunktUm: 18000 }, // 9 richtig, 17s + 0s = 17s -> gewinnt vor k1!
      k3: { index: 10, richtig: 10, falsch: 0, fertigUm: 19000, letzterPunktUm: 19000 }, // 10 richtig -> Platz 1!
    },
  };
  const ergA = Turnier.wertungSpiel(spAufgaben, 'aufgaben', { strafe: 5 });
  assert.strictEqual(ergA[0].id, 'k3');
  assert.strictEqual(ergA[0].platz, 1);
  assert.strictEqual(ergA[1].id, 'k2');
  assert.strictEqual(ergA[1].platz, 2);
  assert.strictEqual(ergA[2].id, 'k1');
  assert.strictEqual(ergA[2].platz, 3);

  // Zeit-Modus: Punkte = richtig - floor(falsch/4)
  const spZeit = {
    teilnehmer: ['z1', 'z2', 'z3'],
    freilos: false,
    start: 1000,
    stand: {
      z1: { index: 15, richtig: 12, falsch: 3, fertigUm: null, letzterPunktUm: 20000 }, // 12 - 0 = 12 Pkt, 3 Falsch
      z2: { index: 16, richtig: 13, falsch: 3, fertigUm: null, letzterPunktUm: 22000 }, // 13 - 0 = 13 Pkt -> Platz 1
      z3: { index: 16, richtig: 12, falsch: 1, fertigUm: null, letzterPunktUm: 21000 }, // 12 - 0 = 12 Pkt, 1 Falsch -> vor z1
    },
  };
  const ergZ = Turnier.wertungSpiel(spZeit, 'zeit');
  assert.strictEqual(ergZ[0].id, 'z2');
  assert.strictEqual(ergZ[0].platz, 1);
  assert.strictEqual(ergZ[1].id, 'z3');
  assert.strictEqual(ergZ[1].platz, 2);
  assert.strictEqual(ergZ[2].id, 'z1');
  assert.strictEqual(ergZ[2].platz, 3);

  // Nicht angetreten verliert
  const spNicht = {
    teilnehmer: ['a1', 'a2'],
    freilos: false,
    start: 1000,
    stand: {
      a1: { index: 1, richtig: 0, falsch: 1, fertigUm: null, letzterPunktUm: null },
      a2: { index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null }, // nicht angetreten
    },
  };
  const ergNicht = Turnier.wertungSpiel(spNicht, 'aufgaben');
  assert.strictEqual(ergNicht[0].id, 'a1');
  assert.strictEqual(ergNicht[1].id, 'a2');
  assert.strictEqual(ergNicht[1].nichtAngetreten, true);

  // Freilos
  const spFrei = { freilos: true, sieger: 'f1', teilnehmer: ['f1'] };
  const ergFrei = Turnier.wertungSpiel(spFrei, 'aufgaben');
  assert.strictEqual(ergFrei[0].id, 'f1');
  assert.strictEqual(ergFrei[0].freilos, true);
});

pruefe('Turnier-Aufgaben für Kinder ohne Lösung', () => {
  const aufg = { a: 7, op: '+', b: 5, c: 12, luecke: 'c', loesung: 12, uebung: 'plus20' };
  const gefiltert = Turnier.aufgabenFuerKind(aufg);
  assert.strictEqual(gefiltert.loesung, undefined);
  assert.strictEqual(gefiltert.c, null);
  assert.strictEqual(gefiltert.a, 7);
  assert.strictEqual(gefiltert.b, 5);
  assert.strictEqual(gefiltert.stellen, 2);

  const lueckeA = { a: 4, op: '+', b: 6, c: 10, luecke: 'a', loesung: 4, uebung: 'plus10' };
  const gefiltertA = Turnier.aufgabenFuerKind(lueckeA);
  assert.strictEqual(gefiltertA.a, null);
  assert.strictEqual(gefiltertA.c, 10);
  assert.strictEqual(gefiltertA.stellen, 1);
});

pruefe('Turnier-Zustandsautomat und doppelte Antwort', () => {
  const { code, leitung, turnier: t } = Turnier.anlegen({
    titel: 'Test-Cup',
    einstellungen: { format: 'sprint', anzahl: 5 },
  });

  // Befehl naechste in lobby muss abgelehnt werden
  assert.throws(() => Turnier.naechste(t, leitung), /nicht erlaubt/);

  // Kinder beitreten
  const k1 = Turnier.beitreten(code, { name: 'Anna', emoji: '🦊' });
  const k2 = Turnier.beitreten(code, { name: 'Ben', emoji: '🐻' });
  assert.strictEqual(t.teilnehmer.size, 2);

  // Name doppelt ablehnen
  assert.throws(() => Turnier.beitreten(code, { name: 'anna', emoji: '🐼' }), /gibt es schon/);

  // Starten -> vorschau
  Turnier.starten(t, leitung);
  assert.strictEqual(t.phase, 'vorschau');

  // Runde starten -> countdown -> laeuft
  const { startUm } = Turnier.rundeStarten(t, leitung, 1000);
  assert.strictEqual(t.phase, 'countdown');
  Turnier.rundeAktivieren(t, startUm);
  assert.strictEqual(t.phase, 'laeuft');

  // Antworten
  const spielId = t.runden[0].spiele[0].id;
  const aufg0 = t.runden[0].spiele[0].aufgaben[0];

  // Richtig antworten mit Index 0
  const r1 = Turnier.antworten(t, k1.schluessel, { spiel: spielId, index: 0, wert: aufg0.loesung }, 2000);
  assert.strictEqual(r1.richtig, true);
  assert.strictEqual(r1.index, 1);

  // Selbe Antwort mit Index 0 nochmal senden -> muss ignoriert werden!
  const rDoppelt = Turnier.antworten(t, k1.schluessel, { spiel: spielId, index: 0, wert: aufg0.loesung }, 2100);
  assert.strictEqual(rDoppelt.ignoriert, true);
  assert.strictEqual(t.runden[0].spiele[0].stand[k1.id].richtig, 1);

  // Vorzeitiges Beenden durch Leitung
  Turnier.rundeBeenden(t, leitung, 3000);
  assert.strictEqual(t.phase, 'auswertung');
  Turnier.naechste(t, leitung);
  assert.strictEqual(t.phase, 'ende'); // Sprint endet nach naechste!

  // Antwort nach Rundenende wird ignoriert
  const rSpät = Turnier.antworten(t, k2.schluessel, { spiel: spielId, index: 0, wert: 5 }, 4000);
  assert.strictEqual(rSpät.ignoriert, true);
});

pruefe('A1: Schnelleres Kind gewinnt bei gleicher Anzahl Richtiger', () => {
  // k_langsam ist zuerst gelistet (Index 0), hat aber 100 s gebraucht.
  // k_schnell ist an Index 1, hat 5 s gebraucht.
  const sp = {
    teilnehmer: ['k_langsam', 'k_schnell'],
    freilos: false,
    stand: {
      k_langsam: { index: 10, richtig: 10, falsch: 0, fertigUm: 101000, letzterPunktUm: 101000 },
      k_schnell: { index: 10, richtig: 10, falsch: 0, fertigUm: 6000, letzterPunktUm: 6000 },
    },
  };
  // Rundenstart t=1000
  const erg = Turnier.wertungSpiel(sp, 'aufgaben', { strafe: 5 }, 1000, 120000);
  assert.strictEqual(erg[0].id, 'k_schnell', 'k_schnell muss gewinnen');
  assert.strictEqual(erg[0].platz, 1);
  assert.strictEqual(erg[1].id, 'k_langsam');
  assert.strictEqual(erg[1].platz, 2);
});

pruefe('A3: Duell mit Gleichstand wechselt in Phase entscheidung und Sieger kommt weiter', () => {
  const { code, leitung, turnier: t } = Turnier.anlegen({
    titel: 'Entscheidung-Test',
    einstellungen: { format: 'ko', anzahl: 5 },
  });
  const k1 = Turnier.beitreten(code, { name: 'KindA', emoji: '🦊' });
  const k2 = Turnier.beitreten(code, { name: 'KindB', emoji: '🐻' });

  Turnier.starten(t, leitung);
  Turnier.rundeStarten(t, leitung, 1000);
  Turnier.rundeAktivieren(t, 4000);

  const spiel = t.runden[0].spiele[0];
  assert.strictEqual(spiel.teilnehmer.length, 2);

  // Beide Kinder antworten identisch zu identischen Zeitpunkten (5 Richtige, 0 Fehler)
  spiel.aufgaben.forEach((aufg, i) => {
    const tMs = 5000 + i * 1000;
    antwortenUndSenden(t, k1.schluessel, { spiel: spiel.id, index: i, wert: aufg.loesung }, tMs);
    antwortenUndSenden(t, k2.schluessel, { spiel: spiel.id, index: i, wert: aufg.loesung }, tMs);
  });

  // Durch den Gleichstand muss die Phase 'entscheidung' sein!
  assert.strictEqual(t.phase, 'entscheidung', 'Phase muss nach Gleichstand entscheidung sein');
  assert(spiel.entscheidung, 'Spiel muss Entscheidungsaufgabe haben');
  assert(spiel.entscheidung.aufgabe, 'Entscheidungsaufgabe muss vorhanden sein');
  assert.strictEqual(spiel.entscheidung.geloestVon, null);

  // Kind A antwortet falsch
  const rFalsch = Turnier.antworten(t, k1.schluessel, { spiel: spiel.id, wert: 9999 }, 11000);
  assert.strictEqual(rFalsch.richtig, false);
  assert.strictEqual(rFalsch.gesperrt, true);

  // Kind A versucht sofort noch einmal während der 3s-Sperre
  const rGesperrt = Turnier.antworten(t, k1.schluessel, { spiel: spiel.id, wert: spiel.entscheidung.aufgabe.loesung }, 12000);
  assert.strictEqual(rGesperrt.ignoriert, true);
  assert.strictEqual(rGesperrt.gesperrt, true);

  // Kind B antwortet richtig auf die (neue) Aufgabe
  const aufgNeu = spiel.entscheidung.aufgabe;
  const rRichtig = Turnier.antworten(t, k2.schluessel, { spiel: spiel.id, wert: aufgNeu.loesung }, 15000);
  assert.strictEqual(rRichtig.richtig, true);
  assert.strictEqual(rRichtig.entscheidungGewonnen, true);

  // Nun muss die Runde beendet sein und Kind B als Sieger feststehen
  assert.strictEqual(t.phase, 'auswertung');
  assert.strictEqual(spiel.ergebnis[0].id, k2.id, 'Kind B muss Duell gewonnen haben');
  assert.strictEqual(spiel.ergebnis[1].id, k1.id, 'Kind A muss verloren haben');

  // Nächste Runde beendet das Turnier (da Finale)
  Turnier.naechste(t, leitung);
  assert.strictEqual(t.phase, 'ende');
  assert.strictEqual(t.teilnehmer.get(k2.id).platz, 1);
  assert.strictEqual(t.teilnehmer.get(k1.id).platz, 2);
});

pruefe('A2: Zeit-Runde beendet sich zur Zeitgrenze und blockiert späte Antworten', () => {
  const { code, leitung, turnier: t } = Turnier.anlegen({
    titel: 'Zeit-Test',
    einstellungen: { format: 'sprint', art: 'zeit', sekunden: 30 },
  });
  const k1 = Turnier.beitreten(code, { name: 'Kati', emoji: '🐱' });
  const k2 = Turnier.beitreten(code, { name: 'Lars', emoji: '🦁' });

  // Verbindung simulieren
  const gesendet = [];
  const fakeRes = { write: (msg) => gesendet.push(msg) };
  TurnierRouten.verbindungen.set(code, new Set([{
    res: fakeRes,
    rolle: 'leitung',
    schluessel: leitung,
    teilnehmerId: null,
  }]));

  Turnier.starten(t, leitung);
  Turnier.rundeStarten(t, leitung, 1000); // startUm = 4000, dauer = 30000, endeUm = 34000
  Turnier.rundeAktivieren(t, 4000);
  assert.strictEqual(t.phase, 'laeuft');

  const spielId = t.runden[0].spiele[0].id;
  const aufg0 = t.runden[0].spiele[0].aufgaben[0];

  // Antwort während der Runde (t=10000) -> gezählt
  const r1 = Turnier.antworten(t, k1.schluessel, { spiel: spielId, index: 0, wert: aufg0.loesung }, 10000);
  assert.strictEqual(r1.richtig, true);

  // Antwort 1,5s nach dem EndeUm (t=35500) -> ignoriert und meldet zeitUm
  const rSpät = Turnier.antworten(t, k2.schluessel, { spiel: spielId, index: 0, wert: aufg0.loesung }, 35500);
  assert.strictEqual(rSpät.ignoriert, true);
  assert.strictEqual(rSpät.zeitUm, true);
  assert.strictEqual(rSpät.grund, 'Zeit um');

  // turnier.js beendet die Runde nicht mehr still im Hintergrund
  assert.strictEqual(t.phase, 'laeuft');

  // Die Route ruft daraufhin rundenendeSenden(t) auf
  TurnierRouten.rundenendeSenden(t);
  assert.strictEqual(t.phase, 'auswertung');
  assert(gesendet.some((m) => m.includes('event: rundenende')), 'rundenende-Event muss gesendet werden');

  // Spätere Antwort nach Beendigung wird wegen phase !== laeuft abgelehnt
  const rDanach = Turnier.antworten(t, k2.schluessel, { spiel: spielId, index: 0, wert: aufg0.loesung }, 36000);
  assert.strictEqual(rDanach.ignoriert, true);
  assert.strictEqual(rDanach.grund, 'Runde läuft nicht');
});

pruefe('A3: Liga mit 13 Kindern spielt 3 Runden und endet mit Rangliste', () => {
  const { code, leitung, turnier: t } = Turnier.anlegen({
    titel: 'Liga-Test',
    einstellungen: { format: 'liga', ligaRunden: 3, anzahl: 5 },
  });

  const kinder = Array.from({ length: 13 }, (_, i) =>
    Turnier.beitreten(code, { name: `Kind_${i + 1}`, emoji: H.EMOJIS[i] })
  );

  Turnier.starten(t, leitung);
  assert.strictEqual(t.phase, 'vorschau');

  // 3 Liga-Runden durchspielen
  for (let r = 1; r <= 3; r++) {
    Turnier.rundeStarten(t, leitung, 1000);
    Turnier.rundeAktivieren(t, 4000);
    assert.strictEqual(t.phase, 'laeuft');

    const runde = t.runden[t.aktuelleRundeNr - 1];
    const spiel = runde.spiele[0];
    assert.strictEqual(spiel.teilnehmer.length, 13, 'Alle 13 müssen im selben Sprint sein');

    // Jedes Kind antwortet
    spiel.teilnehmer.forEach((tnId, tIdx) => {
      const tn = kinder.find((k) => k.id === tnId);
      spiel.aufgaben.forEach((aufg, aIdx) => {
        // Erste Kinder antworten schneller und richtig
        const wert = aIdx === 0 && tIdx > 8 ? 9999 : aufg.loesung;
        antwortenUndSenden(t, tn.schluessel, { spiel: spiel.id, index: aIdx, wert }, 4100 + tIdx * 100 + aIdx * 10);
      });
    });

    assert.strictEqual(t.phase, 'auswertung');
    Turnier.naechste(t, leitung);
  }

  // Nach Runde 3 muss die Liga beendet sein
  assert.strictEqual(t.phase, 'ende');
  kinder.forEach((k) => {
    const tn = t.teilnehmer.get(k.id);
    assert(tn.platz !== null, `Kind ${tn.name} hat keinen Platz`);
    assert(tn.punkte >= 0, `Kind ${tn.name} hat keine Punkte`);
  });
  const sieger = Array.from(t.teilnehmer.values()).find((tn) => tn.platz === 1);
  assert(sieger, 'Sieger muss Platz 1 haben');
});

pruefe('A3: Gruppenphase mit 13 Kindern wechselt in KO-Baum bis zum Ende', () => {
  const { code, leitung, turnier: t } = Turnier.anlegen({
    titel: 'Gruppen-KO-Test',
    einstellungen: { format: 'gruppen_ko', gruppenGroesse: 4, gruppenRunden: 2, weiterProGruppe: 2, anzahl: 5 },
  });

  const kinder = Array.from({ length: 13 }, (_, i) =>
    Turnier.beitreten(code, { name: `Schueler_${i + 1}`, emoji: H.EMOJIS[i] })
  );

  Turnier.starten(t, leitung);
  assert.strictEqual(t.phase, 'vorschau');

  // Gruppenrunde 1 und 2 spielen
  for (let r = 1; r <= 2; r++) {
    Turnier.rundeStarten(t, leitung, 1000);
    Turnier.rundeAktivieren(t, 4000);
    assert.strictEqual(t.phase, 'laeuft');

    const runde = t.runden[t.aktuelleRundeNr - 1];
    assert.strictEqual(runde.stufe, 'gruppe');

    runde.spiele.forEach((sp) => {
      sp.teilnehmer.forEach((tnId, tIdx) => {
        const tn = kinder.find((k) => k.id === tnId);
        sp.aufgaben.forEach((aufg, aIdx) => {
          antwortenUndSenden(t, tn.schluessel, { spiel: sp.id, index: aIdx, wert: aufg.loesung }, 4100 + tIdx * 100 + aIdx * 10);
        });
      });
    });

    assert.strictEqual(t.phase, 'auswertung');
    Turnier.naechste(t, leitung);
  }

  // Nach 2 Gruppenrunden muss Runde 3 in der KO-Phase sein!
  const runde3 = t.runden[t.aktuelleRundeNr - 1];
  assert(t.inKoPhase, 'Muss in KO-Phase sein');
  assert(runde3.stufe !== 'gruppe', 'Runde 3 darf keine Gruppenrunde mehr sein');

  // KO-Phase bis zum Ende durchspielen
  let limit = 0;
  while (t.phase !== 'ende' && limit < 10) {
    limit++;
    Turnier.rundeStarten(t, leitung, 1000);
    Turnier.rundeAktivieren(t, 4000);

    const runde = t.runden[t.aktuelleRundeNr - 1];
    runde.spiele.forEach((sp) => {
      if (sp.freilos) return;
      sp.teilnehmer.forEach((tnId, tIdx) => {
        const tn = kinder.find((k) => k.id === tnId);
        sp.aufgaben.forEach((aufg, aIdx) => {
          antwortenUndSenden(t, tn.schluessel, { spiel: sp.id, index: aIdx, wert: aufg.loesung }, 4100 + tIdx * 200 + aIdx * 10);
        });
      });
    });

    if (t.phase === 'auswertung') {
      Turnier.naechste(t, leitung);
    }
  }

  assert.strictEqual(t.phase, 'ende');
  kinder.forEach((k) => {
    const tn = t.teilnehmer.get(k.id);
    assert(tn.platz !== null, `Kind ${tn.name} muss am Ende einen Platz haben`);
  });
});

pruefe('B5: Neues Turnier nur in Phase ende erlaubt', () => {
  const { leitung, turnier: t } = Turnier.anlegen({ titel: 'Test' });
  assert.strictEqual(t.phase, 'lobby');
  assert.throws(() => Turnier.neuesTurnierGleicheKinder(t, leitung), /nur in Phase 'ende'/);
});

pruefe('B6: Kampflos-Sieg bei verlassenen/ausgeschiedenen Teilnehmern in KO', () => {
  const { code, leitung, turnier: t } = Turnier.anlegen({
    titel: 'Kampflos-Test',
    einstellungen: { format: 'ko', anzahl: 5 },
  });
  const k1 = Turnier.beitreten(code, { name: 'Aktiv1', emoji: '🦊' });
  const k2 = Turnier.beitreten(code, { name: 'Aktiv2', emoji: '🐻' });
  const k3 = Turnier.beitreten(code, { name: 'Verlaesst', emoji: '🐼' });
  const k4 = Turnier.beitreten(code, { name: 'Aktiv3', emoji: '🦁' });

  Turnier.starten(t, leitung);
  // k3 verlässt vor Rundenstart
  Turnier.verlassen(code, k3.schluessel);
  assert.strictEqual(t.teilnehmer.get(k3.id).aktiv, false);

  Turnier.rundeStarten(t, leitung, 1000);
  Turnier.rundeAktivieren(t, 4000);

  const runde = t.runden[0];
  const spielMitK3 = runde.spiele.find((sp) => sp.teilnehmer.includes(k3.id));
  assert(spielMitK3, 'Spiel mit k3 muss existieren');
  // Spiel muss kampflos für den Gegner gewertet werden
  const gegnerId = spielMitK3.teilnehmer.find((id) => id !== k3.id);
  const erg = Turnier.wertungSpiel(spielMitK3, 'aufgaben', t.einstellungen, runde.start, runde.dauerMs);
  assert.strictEqual(erg[0].id, gegnerId, 'Gegner gewinnt kampflos');
  assert.strictEqual(erg[1].nichtAngetreten, true);
});

(async () => {
  const h = await H.pwHash('geheim123');
  pruefe('Passwort-Hash', () => assert(/^scrypt\$[\w-]+\$[\w-]+$/.test(h) && !h.includes('geheim123')));
  const [ja, nein, leer] = await Promise.all([H.pwPruefen('geheim123', h), H.pwPruefen('geheim124', h), H.pwPruefen('x', null)]);
  pruefe('Passwort prüfen', () => { assert(ja); assert(!nein); assert(!leer); });

  console.log(fehler ? `\n${fehler} Fehler` : '\nAlles ok');
  process.exit(fehler ? 1 : 0);
})();
