// Aufgaben-Generator für die Volksschule.
// Eine Aufgabe: { a, op, b, c, luecke: 'a'|'b'|'c', loesung, key }
//   a op b = c, wobei an der Stelle "luecke" die gesuchte Zahl steht.
const Aufgaben = (() => {
  const ZEICHEN = { '+': '+', '-': '−', '*': '·', '/': ':' };
  const WORT = { '+': 'plus', '-': 'minus', '*': 'mal', '/': 'durch' };

  const zufall = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const selten = (p) => Math.random() < p;

  // Paare (x, y) mit Faktoren 2..10 und Produkt <= raum; Faktor 1 nur selten.
  function malPaar(raum) {
    const mitEins = selten(0.08);
    const paare = [];
    const min = mitEins ? 1 : 2;
    for (let x = min; x <= 10; x++) {
      for (let y = min; y <= 10; y++) {
        if (x * y <= raum && (!mitEins || x === 1 || y === 1)) paare.push([x, y]);
      }
    }
    return paare[zufall(0, paare.length - 1)];
  }

  function rechnung(op, raum) {
    switch (op) {
      case '+': {
        if (selten(0.04)) { const a = zufall(1, raum); return selten(0.5) ? [a, 0, a] : [0, a, a]; }
        const a = zufall(1, raum - 1);
        const b = zufall(1, raum - a);
        return [a, b, a + b];
      }
      case '-': {
        const a = zufall(2, raum);
        if (selten(0.05)) return [a, a, 0];
        if (selten(0.03)) return [a, 0, a];
        const b = zufall(1, a - 1);
        return [a, b, a - b];
      }
      case '*': {
        const [x, y] = malPaar(raum);
        return [x, y, x * y];
      }
      case '/': {
        const [x, y] = malPaar(raum);
        return [x * y, x, y]; // (x*y) : x = y
      }
    }
    throw new Error('Unbekannte Rechenart ' + op);
  }

  function neu(op, raum, einsetzen) {
    const [a, b, c] = rechnung(op, raum);
    let luecke = 'c';
    if (einsetzen && selten(0.5)) luecke = selten(0.5) ? 'a' : 'b';
    // "0 · __" wäre mehrdeutig; kommt mit den Paaren oben nicht vor, sicherheitshalber:
    if (op === '*' && luecke !== 'c' && (a === 0 || b === 0)) luecke = 'c';
    const loesung = { a, b, c }[luecke];
    return { a, op, b, c, luecke, loesung, key: `${a}${op}${b}${luecke}` };
  }

  // Liefert eine Funktion, die bei jedem Aufruf die nächste Aufgabe erzeugt,
  // ohne kurz hintereinander dieselbe Aufgabe zu wiederholen.
  function erzeuger({ ops, raum, einsetzen }) {
    const zuletzt = [];
    const merken = 8;
    return () => {
      let auf;
      for (let i = 0; i < 60; i++) {
        const op = ops[zufall(0, ops.length - 1)];
        auf = neu(op, raum, einsetzen);
        if (!zuletzt.includes(auf.key)) break;
      }
      zuletzt.push(auf.key);
      if (zuletzt.length > merken) zuletzt.shift();
      return auf;
    };
  }

  // Zielzeit in Sekunden, in der ein Kind die Aufgabe "automatisiert" löst (inkl. Antworten).
  // Hängt nur von der Aufgabe ab, nicht vom Kind: Zehnerübergang und großer Zahlenraum dauern länger.
  function zielzeit(auf, sprechen) {
    const { a, op, b, c } = auf;
    let t;
    if (op === '*') t = 4;
    else if (op === '/') t = 5;
    else {
      const gross = Math.max(a, b, c);
      const ueber = op === '+' ? (a % 10) + (b % 10) >= 10 : (a % 10) < (b % 10);
      t = gross <= 10 ? 3 : gross <= 20 ? (ueber ? 4 : 3) : (ueber ? 7 : 5);
    }
    if (auf.luecke !== 'c') t += 2;
    if (sprechen) t += 1.5; // Vorlesen/Erkennen braucht pro Aufgabe etwa gleich lang
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

  return { erzeuger, neu, teile, alsText, alsSatz, zielzeit, sterne, ZEICHEN };
})();

if (typeof module !== 'undefined') module.exports = Aufgaben;
