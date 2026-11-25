// Aufgaben-Generator für die Volksschule (und negative Zahlen).
// Eine Aufgabe: { a, op, b, c, luecke: 'a'|'b'|'c', loesung, key }
//   a op b = c, wobei an der Stelle "luecke" die gesuchte Zahl steht.
const Aufgaben = (() => {
  const OPS = ['+', '-', '*', '/'];
  const RAEUME = [10, 20, 50, 100, 200, 500, 1000];
  const ZEICHEN = { '+': '+', '-': '−', '*': '·', '/': ':' };
  const WORT = { '+': 'plus', '-': 'minus', '*': 'mal', '/': 'durch' };

  const zufall = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const selten = (p) => Math.random() < p;

  // Kanonische Reihenfolge '+-*/' für Rekord-Schlüssel und Vergleiche.
  function opsTeil(ops) {
    const menge = new Set(Array.isArray(ops) ? ops : [...String(ops || '')]);
    const teil = OPS.filter((o) => menge.has(o)).join('');
    return teil || '+';
  }
  function opsGueltig(teil) {
    return typeof teil === 'string' && teil.length > 0 && opsTeil([...teil]) === teil;
  }
  function raumGueltig(r) {
    return RAEUME.includes(Number(r));
  }
  function opsText(ops, raum, negativ) {
    const liste = [...opsTeil(ops)].map((o) => ZEICHEN[o]).join(' ');
    const r = raumGueltig(raum) ? Number(raum) : 10;
    return negativ ? `${liste} (−${r} bis ${r})` : `${liste} bis ${r}`;
  }

  // Abwärtskompatibilität für gespeicherte Übungs-IDs aus früheren Versionen.
  function ausUebungen(uebungen) {
    const ids = Array.isArray(uebungen) ? uebungen : String(uebungen || '').split(',');
    const ops = new Set();
    let raum = 0;
    for (const id of ids) {
      if (id.startsWith('plus')) ops.add('+');
      else if (id.startsWith('minus')) ops.add('-');
      else if (id === 'zehner') { ops.add('+'); ops.add('-'); }
      else if (id.startsWith('mal')) ops.add('*');
      else if (id === 'geteilt') ops.add('/');
      else continue;
      if (id.endsWith('10') && id !== 'mal2510') raum = Math.max(raum, 10);
      else if (id.endsWith('20') || id.endsWith('20u')) raum = Math.max(raum, 20);
      else raum = Math.max(raum, 100);
    }
    if (!ops.size) ops.add('+');
    return { ops: OPS.filter((o) => ops.has(o)), raum: raum || 10 };
  }

  function zahlText(n, mitKlammer = false) {
    if (n === null || n === undefined) return '';
    return n < 0 ? (mitKlammer ? `(−${Math.abs(n)})` : `−${Math.abs(n)}`) : String(n);
  }

  // Paare (x, y) mit Produkt <= raum; bis 100 kleines Einmaleins, darüber kopfrechen-tauglich.
  function malPaar(raum) {
    if (raum <= 100) {
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

    if (selten(0.05)) {
      const x = zufall(2, Math.min(100, raum));
      return selten(0.5) ? [1, x] : [x, 1];
    }

    const r = Math.random();
    let x;
    let y;
    if (r < 0.4) {
      // Zehner-Paare: z. B. 4 · 70, 6 · 80
      x = zufall(2, 10);
      const maxZ = Math.max(2, Math.floor(raum / (10 * x)));
      y = zufall(2, maxZ) * 10;
    } else if (r < 0.7) {
      // Zweistellige Faktoren bis 20: z. B. 12 · 15
      x = zufall(11, 20);
      const maxY = Math.max(2, Math.min(20, Math.floor(raum / x)));
      y = zufall(2, maxY);
    } else {
      // Einstellig × größerem Faktor: z. B. 7 · 34
      x = zufall(2, 10);
      const maxY = Math.max(2, Math.min(50, Math.floor(raum / x)));
      y = zufall(2, maxY);
    }
    return selten(0.5) ? [x, y] : [y, x];
  }

  function vorzeichenPaar() {
    const r = Math.random();
    if (r < 0.28) return [-1, 1];
    if (r < 0.56) return [1, -1];
    if (r < 0.82) return [-1, -1];
    return [1, 1];
  }

  function rechnung(op, raum, negativ = false) {
    if (!negativ) {
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
          return [x * y, x, y];
        }
      }
      throw new Error('Unbekannte Rechenart ' + op);
    }

    switch (op) {
      case '+': {
        const willNeg = !selten(0.2);
        for (let i = 0; i < 120; i++) {
          const a = selten(0.03) ? 0 : zufall(-raum, raum);
          if (a === 0 && !selten(0.05)) continue;
          const b = zufall(Math.max(-raum, -raum - a), Math.min(raum, raum - a));
          const c = a + b;
          if ((a === 0 || b === 0 || c === 0) && !selten(0.05)) continue;
          if (willNeg && a >= 0 && b >= 0 && c >= 0) continue;
          return [a, b, c];
        }
        return [-zufall(1, Math.max(1, Math.floor(raum / 2))), zufall(1, Math.max(1, Math.floor(raum / 2))), 0];
      }
      case '-': {
        const willNeg = !selten(0.2);
        for (let i = 0; i < 120; i++) {
          const a = zufall(-raum, raum);
          if (a === 0 && !selten(0.05)) continue;
          const b = zufall(Math.max(-raum, a - raum), Math.min(raum, a + raum));
          const c = a - b;
          if ((a === 0 || b === 0 || c === 0) && !selten(0.05)) continue;
          if (willNeg && a >= 0 && b >= 0 && c >= 0) continue;
          return [a, b, c];
        }
        const x = zufall(1, Math.max(2, Math.floor(raum / 2)));
        const y = zufall(x + 1, raum);
        return [x, y, x - y];
      }
      case '*': {
        const [x, y] = malPaar(raum);
        const [sx, sy] = vorzeichenPaar();
        const a = sx * x;
        const b = sy * y;
        return [a, b, a * b];
      }
      case '/': {
        const [x, y] = malPaar(raum);
        const [sx, sy] = vorzeichenPaar();
        const b = sx * x;
        const c = sy * y;
        return [b * c, b, c];
      }
    }
    throw new Error('Unbekannte Rechenart ' + op);
  }

  function neu(op, raum, einsetzen = false, negativ = false) {
    const [a, b, c] = rechnung(op, raum, negativ);
    let luecke = 'c';
    if (einsetzen && selten(0.5)) luecke = selten(0.5) ? 'a' : 'b';
    // "0 · __ = 0" oder "0 : __" wäre mehrdeutig – dann immer das Ergebnis fragen
    if (luecke !== 'c' && (a === 0 || b === 0)) luecke = 'c';
    const loesung = { a, b, c }[luecke];
    return { a, op, b, c, luecke, loesung, key: `${a}${op}${b}${luecke}` };
  }

  // Liefert eine Funktion, die bei jedem Aufruf die nächste Aufgabe erzeugt,
  // ohne kurz hintereinander dieselbe Aufgabe zu wiederholen.
  function erzeuger({ ops, raum, negativ = false, einsetzen = false, uebungen } = {}) {
    let liste = [...opsTeil(ops)];
    let r = raumGueltig(raum) ? Number(raum) : 10;
    if (!ops && uebungen) {
      const alt = ausUebungen(uebungen);
      liste = alt.ops;
      r = alt.raum;
    }
    const zuletzt = [];
    const merken = 10;
    return () => {
      let auf;
      for (let i = 0; i < 60; i++) {
        const op = liste[zufall(0, liste.length - 1)];
        auf = neu(op, r, einsetzen, Boolean(negativ));
        if (!zuletzt.includes(auf.key)) break;
      }
      zuletzt.push(auf.key);
      if (zuletzt.length > merken) zuletzt.shift();
      return auf;
    };
  }

  // Zielzeit in Sekunden für eine Aufgabe (inkl. Antworten). Hängt nur von der Aufgabe ab, nicht vom Kind.
  // gesprochen = Antwort kam übers Mikrofon. Das Vorlesen zählt in keinem Modus zur Zeit.
  function zielzeit(auf, gesprochen) {
    const { a, op, b, c } = auf;
    let t;
    if (op === '*') {
      t = Math.abs(c) > 100 ? 6 : 4;
    } else if (op === '/') {
      t = Math.abs(a) > 100 ? 7 : 5;
    } else {
      const aa = Math.abs(a);
      const bb = Math.abs(b);
      const gross = Math.max(aa, bb, Math.abs(c));
      const ueber = op === '+' ? (aa % 10) + (bb % 10) >= 10 : (aa % 10) < (bb % 10);
      t = gross <= 10 ? 3 : gross <= 20 ? (ueber ? 4 : 3) : gross <= 100 ? (ueber ? 7 : 5) : (ueber ? 9 : 7);
    }
    if (a < 0 || b < 0 || c < 0) t += 1.5;
    if (auf.luecke !== 'c') t += 2;
    if (gesprochen) t += 1.5;
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
    const z = (k) => (auf.luecke === k && !mitLoesung ? '__' : zahlText(auf[k], k === 'b'));
    return `${z('a')} ${ZEICHEN[auf.op]} ${z('b')} = ${z('c')}`;
  }

  function zahlSatz(n) {
    return n < 0 ? `minus ${Math.abs(n)}` : String(n);
  }

  // Satz zum Vorlesen (nur Ergebnis-gesucht-Aufgaben im Sprechmodus).
  // Vorlese-Satz: "7 minus 5" bzw. bei Einsetzaufgaben "Wie viel plus 4 ergibt 5?"
  function alsSatz(auf) {
    if (auf.luecke === 'c') return `${zahlSatz(auf.a)} ${WORT[auf.op]} ${zahlSatz(auf.b)}`;
    const a = auf.luecke === 'a' ? 'Wie viel' : zahlSatz(auf.a);
    const b = auf.luecke === 'b' ? 'wie viel' : zahlSatz(auf.b);
    return `${a} ${WORT[auf.op]} ${b} ergibt ${zahlSatz(auf.c)}?`;
  }

  return {
    OPS, RAEUME, ZEICHEN, WORT,
    opsTeil, opsGueltig, raumGueltig, opsText, ausUebungen, zahlText,
    erzeuger, neu, teile, alsText, alsSatz, zielzeit, sterne,
  };
})();

if (typeof module !== 'undefined') module.exports = Aufgaben;
