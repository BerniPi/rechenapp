// Selbsttest: node tools/test.js
const assert = require('assert');
const A = require('../js/aufgaben.js');
const { Zahlwort, Jonas } = require('../js/sprache.js');
const Schrauben = require('../js/spiele/schrauben.js');
const Unblock = require('../js/spiele/unblock.js');

let fehler = 0;
const pruefe = (name, f) => { try { f(); console.log('ok  ', name); } catch (e) { fehler++; console.log('FAIL', name, '-', e.message); } };

// ---- Aufgaben ----
for (const raum of [10, 20, 50, 100]) {
  for (const ops of [['+'], ['-'], ['*'], ['/'], ['+', '-', '*', '/']]) {
    for (const einsetzen of [false, true]) {
      pruefe(`Aufgaben ${ops.join('')} bis ${raum}${einsetzen ? ' E' : ''}`, () => {
        const gen = A.erzeuger({ ops, raum, einsetzen });
        for (let i = 0; i < 10000; i++) {
          const t = gen();
          const { a, b, c, op } = t;
          [a, b, c].forEach((n) => assert(Number.isInteger(n) && n >= 0, `negativ/keine Zahl: ${A.alsText(t, true)}`));
          if (op === '+') assert(a + b === c && c <= raum, A.alsText(t, true));
          if (op === '-') assert(a - b === c && a <= raum, A.alsText(t, true));
          if (op === '*') assert(a * b === c && c <= raum && a <= 10 && b <= 10, A.alsText(t, true));
          if (op === '/') assert(b > 0 && b * c === a && a <= raum, A.alsText(t, true));
          if (!einsetzen) assert(t.luecke === 'c');
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
  const gen = A.erzeuger({ ops: ['+'], raum: 20, einsetzen: false });
  const l = Array.from({ length: 10 }, gen).map((t) => t.key);
  assert(new Set(l).size === 10, l.join(' '));
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
  const gen = A.erzeuger({ ops: ['+', '-', '*', '/'], raum: 100, einsetzen: true });
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

(async () => {
  const h = await H.pwHash('geheim123');
  pruefe('Passwort-Hash', () => assert(/^scrypt\$[\w-]+\$[\w-]+$/.test(h) && !h.includes('geheim123')));
  const [ja, nein, leer] = await Promise.all([H.pwPruefen('geheim123', h), H.pwPruefen('geheim124', h), H.pwPruefen('x', null)]);
  pruefe('Passwort prüfen', () => { assert(ja); assert(!nein); assert(!leer); });

  console.log(fehler ? `\n${fehler} Fehler` : '\nAlles ok');
  process.exit(fehler ? 1 : 0);
})();
