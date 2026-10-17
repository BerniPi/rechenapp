// Schrauben sortieren: Schrauben einer Farbe auf eine Stange bringen.
// Man darf nur auf eine leere Stange oder auf dieselbe Farbe legen.
const Schrauben = (() => {
  const PLATZ = 4;

  function rng(seed) { // mulberry32 – gleiche Levelnummer = gleiches Level
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const oben = (st) => st[st.length - 1];
  const komplett = (st) => st.length === PLATZ && st.every((x) => x === st[0]);
  const geloest = (stangen) => stangen.every((s) => s.length === 0 || komplett(s));

  // Wie viele Schrauben gleicher Farbe liegen oben?
  function gruppe(st) {
    let n = 0;
    for (let i = st.length - 1; i >= 0 && st[i] === oben(st); i--) n++;
    return n;
  }

  function zugMoeglich(stangen, von, nach) {
    const a = stangen[von];
    const b = stangen[nach];
    if (von === nach || !a.length || b.length >= PLATZ) return 0;
    if (b.length && oben(b) !== oben(a)) return 0;
    return Math.min(gruppe(a), PLATZ - b.length);
  }

  function ziehen(stangen, von, nach) {
    const n = zugMoeglich(stangen, von, nach);
    const neu = stangen.map((s) => s.slice());
    for (let i = 0; i < n; i++) neu[nach].push(neu[von].pop());
    return neu;
  }

  function loesbar(start, limit = 200000) {
    const gesehen = new Set();
    const schluessel = (s) => s.map((x) => x.join(',')).sort().join('|');
    const stapel = [start];
    while (stapel.length) {
      const s = stapel.pop();
      if (geloest(s)) return true;
      const k = schluessel(s);
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      if (gesehen.size > limit) return false;
      for (let v = 0; v < s.length; v++) {
        if (!s[v].length || komplett(s[v])) continue;
        const ganzEinfarbig = gruppe(s[v]) === s[v].length;
        for (let z = 0; z < s.length; z++) {
          if (!zugMoeglich(s, v, z)) continue;
          if (ganzEinfarbig && !s[z].length) continue; // sinnlos
          stapel.push(ziehen(s, v, z));
        }
      }
    }
    return false;
  }

  function level(nr) {
    const farben = Math.min(3 + Math.floor((nr - 1) / 2), 8);
    const zufall = rng(nr * 7919 + 13);
    for (let versuch = 0; versuch < 200; versuch++) {
      const alle = [];
      for (let f = 0; f < farben; f++) for (let i = 0; i < PLATZ; i++) alle.push(f);
      for (let i = alle.length - 1; i > 0; i--) {
        const j = Math.floor(zufall() * (i + 1));
        [alle[i], alle[j]] = [alle[j], alle[i]];
      }
      const stangen = [];
      for (let f = 0; f < farben; f++) stangen.push(alle.slice(f * PLATZ, f * PLATZ + PLATZ));
      stangen.push([], []);
      if (stangen.some(komplett)) continue;
      if (loesbar(stangen)) return stangen;
    }
    // Notfall: fast gelöst
    const s = [];
    for (let f = 0; f < farben; f++) s.push([f, f, f, f]);
    s.push([], []);
    return ziehen(s, 0, farben);
  }

  return { level, zugMoeglich, ziehen, komplett, geloest, gruppe, loesbar, PLATZ };
})();

if (typeof module !== 'undefined') module.exports = Schrauben;
else Spiele.registrieren({
  id: 'schrauben',
  name: 'Schrauben',
  emoji: '🔩',
  beschr: 'Sortiere die Schrauben nach Farben',
  zeitlimit: 60, // so viele Level wie in der Zeit gehen

  start(flaeche, hilfe) {
    const FARBEN = ['#ef4b4b', '#4f7cff', '#22b867', '#ffc531', '#9b5cff', '#ff8a1f', '#ff6fb5', '#2ec4d6'];
    const stand = hilfe.stand();
    stand.level = stand.level || 1;
    let geschafft = 0;
    let aus = false;
    let sieg = false; // Sieg-Hinweis ist zu sehen
    let stangen, verlauf, gewaehlt;

    flaeche.innerHTML = `
      <div class="sch-wrap">
        <div class="sch-titel"></div>
        <div class="sch-stangen"></div>
      </div>
      <div class="spiel-knoepfe">
        <button class="knopf grau" data-a="zurueck">↩️ Zurück</button>
        <button class="knopf grau" data-a="neu">🔄 Neu</button>
      </div>`;
    const titel = flaeche.querySelector('.sch-titel');
    const feld = flaeche.querySelector('.sch-stangen');

    // Angefangenes Level weiterspielen – sonst wären schwere Level im Zeitlimit nie zu schaffen
    function laden() {
      const offen = stand.offen;
      stangen = offen && offen.level === stand.level ? offen.stangen : Schrauben.level(stand.level);
      verlauf = [];
      gewaehlt = null;
      zeichnen();
    }

    function zeichnen() {
      titel.textContent = `Level ${stand.level}`;
      feld.innerHTML = '';
      stangen.forEach((st, i) => {
        const el = document.createElement('div');
        el.className = 'sch-stange' + (Schrauben.komplett(st) ? ' fertig' : '');
        const anzahlHoch = gewaehlt === i ? Schrauben.gruppe(st) : 0;
        let html = '<div class="sch-stab"></div>';
        st.forEach((f, k) => {
          const hoch = k >= st.length - anzahlHoch;
          html += `<div class="sch-schraube${hoch ? ' hoch' : ''}" style="--f:${FARBEN[f]};--k:${k}"></div>`;
        });
        html += '<div class="sch-fuss"></div>';
        el.innerHTML = html;
        el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); tippen(i); });
        feld.appendChild(el);
      });
    }

    function merken() {
      stand.offen = { level: stand.level, stangen };
      hilfe.speichern();
    }

    function tippen(i) {
      if (sieg) return;
      if (gewaehlt === null) {
        if (stangen[i].length && !Schrauben.komplett(stangen[i])) { gewaehlt = i; hilfe.ton.klick(); }
      } else if (gewaehlt === i) {
        gewaehlt = null;
      } else if (Schrauben.zugMoeglich(stangen, gewaehlt, i)) {
        verlauf.push(stangen);
        stangen = Schrauben.ziehen(stangen, gewaehlt, i);
        gewaehlt = null;
        if (Schrauben.komplett(stangen[i])) hilfe.ton.richtig(); else hilfe.ton.note(520, 0, 0.06, 'triangle', 0.15);
        if (Schrauben.geloest(stangen)) { zeichnen(); return gewonnen(); }
        merken();
      } else if (stangen[i].length && !Schrauben.komplett(stangen[i])) {
        gewaehlt = i; // andere Stange auswählen
        hilfe.ton.klick();
      } else {
        hilfe.ton.falsch();
        gewaehlt = null;
      }
      zeichnen();
    }

    function gewonnen() {
      geschafft++;
      sieg = true;
      hilfe.pause(true);
      hilfe.ton.jubel();
      stand.level++;
      delete stand.offen;
      hilfe.speichern();
      const box = document.createElement('div');
      box.className = 'r-sieg';
      box.innerHTML = `<div class="overlay-box"><h2>Super! 🎉</h2><p>Level ${stand.level - 1} geschafft!</p></div>`;
      flaeche.appendChild(box);
      // Bis die Zeit um ist, gleich das nächste Level
      setTimeout(() => {
        if (aus) return;
        box.remove();
        sieg = false;
        laden();
        hilfe.pause(false);
      }, 1300);
    }

    flaeche.querySelector('[data-a="zurueck"]').addEventListener('click', () => {
      if (sieg || !verlauf.length) return;
      stangen = verlauf.pop();
      gewaehlt = null;
      merken();
      zeichnen();
    });
    flaeche.querySelector('[data-a="neu"]').addEventListener('click', () => {
      if (sieg) return;
      delete stand.offen;
      hilfe.speichern();
      laden();
    });

    laden();
    return {
      stop() { aus = true; },
      zusammenfassung: () => levelBilanz(geschafft, stand.level),
    };
  },
});
