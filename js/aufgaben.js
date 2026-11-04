// Aufgaben für die Volksschule, geordnet als Katalog von Übungen.
// Eine Aufgabe: { a, op, b, c, luecke: 'a'|'b'|'c', loesung, uebung, key }
//   a op b = c, wobei an der Stelle "luecke" die gesuchte Zahl steht.
// Neue Übungen (negative Zahlen, Brüche, Klapustri) kommen als weitere Einträge in UEBUNGEN dazu.
// Die id einer Übung nie ändern – Rekorde und Bestenlisten hängen daran.
const Aufgaben = (() => {
  const ZEICHEN = { '+': '+', '-': '−', '*': '·', '/': ':' };
  const WORT = { '+': 'plus', '-': 'minus', '*': 'mal', '/': 'durch' };

  const zufall = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const selten = (p) => Math.random() < p;

  // Zehnerübergang: Einer zusammen über 10 bzw. Einer reichen beim Abziehen nicht.
  const uebergang = (op, a, b) => (op === '+' ? (a % 10) + (b % 10) >= 10 : (a % 10) < (b % 10));

  // Plus: Ergebnis in [lo, hi]; Minus: erste Zahl in [lo, hi]. ueber: true/false/undefined (egal).
  // Rechnungen mit 0 nur selten und nur, wenn mitNull.
  function plusMinus(op, lo, hi, ueber, mitNull) {
    for (let i = 0; i < 500; i++) {
      let a; let b; let c;
      if (op === '+') { c = zufall(lo, hi); a = zufall(0, c); b = c - a; } else { a = zufall(lo, hi); b = zufall(0, a); c = a - b; }
      if ((a === 0 || b === 0 || c === 0) && !(mitNull && selten(0.15))) continue;
      if (ueber !== undefined && uebergang(op, a, b) !== ueber) continue;
      return [a, op, b, c];
    }
    throw new Error(`Keine Aufgabe ${op} ${lo}-${hi}`);
  }

  // Einmaleins: Faktoren 2..10 (1 nur selten), reihen = erlaubte Reihen für einen der Faktoren.
  function malPaar(reihen) {
    const min = selten(0.08) ? 1 : 2;
    const x = reihen ? reihen[zufall(0, reihen.length - 1)] : zufall(min, 10);
    const y = zufall(min, 10);
    return selten(0.5) ? [x, y] : [y, x];
  }

  function zehner() {
    if (selten(0.5)) { const c = zufall(2, 10) * 10; const a = zufall(1, c / 10 - 1) * 10; return [a, '+', c - a, c]; }
    const a = zufall(2, 10) * 10; const b = zufall(1, a / 10 - 1) * 10;
    return [a, '-', b, a - b];
  }

  // ziel = Zielzeit in Sekunden für eine Aufgabe, in der man sie "im Kopf hat" (für die Sterne).
  const UEBUNGEN = [
    { id: 'plus10', gruppe: '1. Klasse', name: 'Plus bis 10', beispiel: '3 + 4', ziel: 3, erzeuge: () => plusMinus('+', 2, 10, undefined, true) },
    { id: 'minus10', gruppe: '1. Klasse', name: 'Minus bis 10', beispiel: '7 − 3', ziel: 3, erzeuge: () => plusMinus('-', 2, 10, undefined, true) },
    { id: 'plus20', gruppe: '1. Klasse', name: 'Plus bis 20', beispiel: '12 + 5', ziel: 3, erzeuge: () => plusMinus('+', 11, 20, false) },
    { id: 'plus20u', gruppe: '1. Klasse', name: 'Plus bis 20 mit Übergang', beispiel: '7 + 8', ziel: 4, erzeuge: () => plusMinus('+', 11, 20, true) },
    { id: 'minus20', gruppe: '1. Klasse', name: 'Minus bis 20', beispiel: '17 − 4', ziel: 3, erzeuge: () => plusMinus('-', 11, 20, false) },
    { id: 'minus20u', gruppe: '1. Klasse', name: 'Minus bis 20 mit Übergang', beispiel: '15 − 7', ziel: 4, erzeuge: () => plusMinus('-', 11, 20, true) },
    { id: 'zehner', gruppe: '2. Klasse', name: 'Zehner plus und minus', beispiel: '30 + 40', ziel: 3, erzeuge: zehner },
    { id: 'plus100', gruppe: '2. Klasse', name: 'Plus bis 100', beispiel: '34 + 25', ziel: 5, erzeuge: () => plusMinus('+', 21, 100, false) },
    { id: 'plus100u', gruppe: '2. Klasse', name: 'Plus bis 100 mit Übergang', beispiel: '47 + 38', ziel: 7, erzeuge: () => plusMinus('+', 21, 100, true) },
    { id: 'minus100', gruppe: '2. Klasse', name: 'Minus bis 100', beispiel: '68 − 23', ziel: 5, erzeuge: () => plusMinus('-', 21, 100, false) },
    { id: 'minus100u', gruppe: '2. Klasse', name: 'Minus bis 100 mit Übergang', beispiel: '62 − 27', ziel: 7, erzeuge: () => plusMinus('-', 21, 100, true) },
    { id: 'mal2510', gruppe: '2. Klasse', name: 'Einmaleins 2, 5, 10', beispiel: '5 · 7', ziel: 3, erzeuge: () => { const [x, y] = malPaar([2, 5, 10]); return [x, '*', y, x * y]; } },
    { id: 'mal', gruppe: '2. Klasse', name: 'Einmaleins', beispiel: '6 · 7', ziel: 4, erzeuge: () => { const [x, y] = malPaar(); return [x, '*', y, x * y]; } },
    { id: 'geteilt', gruppe: '2. Klasse', name: 'Geteilt im Einmaleins', beispiel: '42 : 6', ziel: 5, erzeuge: () => { const [x, y] = malPaar(); return [x * y, '/', x, y]; } },
  ];
  const NACH_ID = Object.fromEntries(UEBUNGEN.map((u) => [u.id, u]));

  // Übungen als Teil des Rekord-Schlüssels: sortiert, ohne Doppelte, mit Komma.
  const uebungenTeil = (ids) => [...new Set(ids)].sort().join(',');
  function uebungenGueltig(teil) {
    const ids = String(teil || '').split(',');
    return ids.length > 0 && ids.every((id) => NACH_ID[id]) && uebungenTeil(ids) === teil;
  }
  const uebungenText = (teil) => String(teil).split(',').map((id) => (NACH_ID[id] ? NACH_ID[id].name : id)).join(', ');

  // Früher: Rechenarten (+-*/) × Zahlenraum (10/20/50/100) → passende Übungen
  function alteUebungen(ops, raum) {
    const ids = [];
    for (const op of ops) {
      if (op === '*') ids.push('mal');
      else if (op === '/') ids.push('geteilt');
      else {
        const w = op === '+' ? 'plus' : 'minus';
        if (Number(raum) <= 10) ids.push(`${w}10`);
        else if (Number(raum) <= 20) ids.push(`${w}20`, `${w}20u`);
        else ids.push(`${w}100`, `${w}100u`);
      }
    }
    return [...new Set(ids)];
  }
  const ALT_KEY = /^(schrift|sprache)\|(zehn|a20|m1|m5)\|([*+\-/]{1,4})\|(10|20|50|100)\|(E?)$/;
  const istAlterSchluessel = (key) => ALT_KEY.test(String(key || ''));
  // Passen die alten Aufgaben zu den neuen Übungen? Plus/Minus bis 50 und Mal/Geteilt
  // unter 100 (nur Produkte ≤ Zahlenraum) waren deutlich leichter – solche Rekorde verfallen.
  const vergleichbar = (ops, raum) => [...ops].every((op) => ('*/'.includes(op) ? raum === 100 : raum !== 50));
  // Alter Rekord-Schlüssel "modus|art|ops|raum|E" → neuer "modus|art|uebungen|E".
  // null = kein alter Schlüssel oder nicht vergleichbar (dann den Rekord verwerfen, siehe istAlterSchluessel).
  function alterSchluessel(key) {
    const m = ALT_KEY.exec(String(key || ''));
    if (!m || !vergleichbar(m[3], Number(m[4]))) return null;
    return `${m[1]}|${m[2]}|${uebungenTeil(alteUebungen([...m[3]], m[4]))}|${m[5]}`;
  }

  function neu(uebung, einsetzen) {
    const [a, op, b, c] = NACH_ID[uebung].erzeuge();
    let luecke = 'c';
    if (einsetzen && selten(0.5)) luecke = selten(0.5) ? 'a' : 'b';
    // "0 · __" oder "__ + 0 = …" mit 0 wäre mehrdeutig bzw. trivial – dann lieber das Ergebnis fragen
    if (luecke !== 'c' && (a === 0 || b === 0)) luecke = 'c';
    const loesung = { a, b, c }[luecke];
    return { a, op, b, c, luecke, loesung, uebung, key: `${a}${op}${b}${luecke}` };
  }

  // Liefert eine Funktion, die bei jedem Aufruf die nächste Aufgabe erzeugt,
  // ohne kurz hintereinander dieselbe Aufgabe zu wiederholen.
  function erzeuger({ uebungen, einsetzen }) {
    const ids = uebungen.filter((id) => NACH_ID[id]);
    if (!ids.length) ids.push('plus10');
    const zuletzt = [];
    const merken = 8;
    return () => {
      let auf;
      for (let i = 0; i < 60; i++) {
        auf = neu(ids[zufall(0, ids.length - 1)], einsetzen);
        if (!zuletzt.includes(auf.key)) break;
      }
      zuletzt.push(auf.key);
      if (zuletzt.length > merken) zuletzt.shift();
      return auf;
    };
  }

  // Zielzeit in Sekunden für eine Aufgabe (inkl. Antworten). Hängt nur von der Übung ab, nicht vom Kind.
  // gesprochen = Antwort kam übers Mikrofon. Das Vorlesen zählt in keinem Modus zur Zeit.
  function zielzeit(auf, gesprochen) {
    let t = NACH_ID[auf.uebung] ? NACH_ID[auf.uebung].ziel : 5;
    if (auf.luecke !== 'c') t += 2;
    if (gesprochen) t += 1.5; // Aussprechen und Erkennen dauern länger als Tippen
    return t;
  }


  // Sterne einer Runde: Genauigkeit zuerst, dann Tempo im Verhältnis zur Zielzeit.
  // gestellt = beantwortete Aufgaben, zeit/ziel in Sekunden. 0 = Runde zählt nicht.
  function sterne({ gestellt, falsch, zeit, ziel }) {
    if (!gestellt || !ziel) return 0;
    const quote = (gestellt - falsch) / gestellt;
    const v = zeit / ziel;
    if (quote < 0.5) return 0;
    if (falsch === 0 && v <= 1) return 5;
    if (falsch <= Math.max(1, Math.floor(gestellt / 20)) && v <= 1.4) return 4;
    if (quote >= 0.9 && v <= 2) return 3;
    if (quote >= 0.8) return 2;
    return 1;
  }

  // Für die Anzeige: Liste der drei Zahlen, die Lücke als null.
  function teile(auf) {
    return {
      a: auf.luecke === 'a' ? null : auf.a,
      zeichen: ZEICHEN[auf.op],
      b: auf.luecke === 'b' ? null : auf.b,
      c: auf.luecke === 'c' ? null : auf.c,
    };
  }

  function alsText(auf, mitLoesung) {
    const z = (k) => (auf.luecke === k && !mitLoesung ? '__' : auf[k]);
    return `${z('a')} ${ZEICHEN[auf.op]} ${z('b')} = ${z('c')}`;
  }

  // Satz zum Vorlesen (nur Ergebnis-gesucht-Aufgaben im Sprechmodus).
  // Vorlese-Satz: "7 minus 5" bzw. bei Einsetzaufgaben "Wie viel plus 4 ergibt 5?"
  function alsSatz(auf) {
    if (auf.luecke === 'c') return `${auf.a} ${WORT[auf.op]} ${auf.b}`;
    const a = auf.luecke === 'a' ? 'Wie viel' : auf.a;
    const b = auf.luecke === 'b' ? 'wie viel' : auf.b;
    return `${a} ${WORT[auf.op]} ${b} ergibt ${auf.c}?`;
  }

  return {
    UEBUNGEN, NACH_ID, erzeuger, neu, teile, alsText, alsSatz, zielzeit, sterne, ZEICHEN,
    uebungenTeil, uebungenGueltig, uebungenText, alteUebungen, alterSchluessel, istAlterSchluessel,
  };
})();

if (typeof module !== 'undefined') module.exports = Aufgaben;
