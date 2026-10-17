// Unblock: das rote Auto durch Verschieben der anderen Blöcke zum Ausgang bringen.
// Levels werden zufällig (aber pro Levelnummer immer gleich) erzeugt und mit einer
// Breitensuche so gewählt, dass die kürzeste Lösung mit dem Level wächst.
const Unblock = (() => {
  const N = 6;
  const ROT_REIHE = 2;

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Teil: { h: waagrecht?, len, fix: Reihe (h) bzw. Spalte (v) }, Position separat im Zustand.
  function belegung(teile, pos, ohne = -1) {
    const g = new Array(N * N).fill(-1);
    teile.forEach((t, i) => {
      if (i === ohne) return;
      for (let k = 0; k < t.len; k++) {
        const r = t.h ? t.fix : pos[i] + k;
        const c = t.h ? pos[i] + k : t.fix;
        g[r * N + c] = i;
      }
    });
    return g;
  }

  // Wie weit kann Teil i nach vorne/hinten? -> [minPos, maxPos]
  function spielraum(teile, pos, i, g = belegung(teile, pos)) {
    const t = teile[i];
    const frei = (p) => {
      const r = t.h ? t.fix : p;
      const c = t.h ? p : t.fix;
      const v = g[r * N + c];
      return v === -1 || v === i;
    };
    let min = pos[i];
    while (min - 1 >= 0 && frei(min - 1)) min--;
    let max = pos[i];
    while (max + t.len < N && frei(max + t.len)) max++;
    return [min, max];
  }

  function nachbarn(teile, pos) {
    const g = belegung(teile, pos);
    const res = [];
    for (let i = 0; i < teile.length; i++) {
      const [min, max] = spielraum(teile, pos, i, g);
      for (let p = min; p <= max; p++) {
        if (p === pos[i]) continue;
        const neu = pos.slice();
        neu[i] = p;
        res.push(neu);
      }
    }
    return res;
  }

  const key = (pos) => pos.join('');
  const geloest = (pos) => pos[0] === N - 2;

  // Alle erreichbaren Zustände + Abstand zur Lösung
  function analysieren(teile, start, limit = 12000) {
    const alle = new Map([[key(start), start]]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      for (const nb of nachbarn(teile, queue[q])) {
        const k = key(nb);
        if (!alle.has(k)) {
          alle.set(k, nb);
          queue.push(nb);
          if (alle.size > limit) return null;
        }
      }
    }
    const dist = new Map();
    const q2 = [];
    for (const [k, p] of alle) if (geloest(p)) { dist.set(k, 0); q2.push(p); }
    if (!q2.length) return null;
    for (let q = 0; q < q2.length; q++) {
      const d = dist.get(key(q2[q]));
      for (const nb of nachbarn(teile, q2[q])) {
        const k = key(nb);
        if (!dist.has(k)) { dist.set(k, d + 1); q2.push(nb); }
      }
    }
    return { alle, dist };
  }

  function level(nr) {
    const zufall = rng(nr * 104729 + 7);
    const ri = (a, b) => a + Math.floor(zufall() * (b - a + 1));
    const ziel = Math.min(2 + Math.round(nr * 1.3), 40);
    let bestes = null;
    const t0 = Date.now();

    for (let versuch = 0; versuch < 80; versuch++) {
      if (bestes && Date.now() - t0 > 1200) break;
      const teile = [{ h: true, len: 2, fix: ROT_REIHE }];
      const pos = [ri(0, 2)];
      const anzahl = ri(6, Math.min(8 + Math.floor(nr / 3), 13));
      // zuerst einige senkrechte Blöcke, die die Ausfahrt des roten Autos versperren
      const sperren = Math.min(1 + Math.floor(nr / 4), 3);
      for (let a = 0; a < 200 && teile.length < anzahl; a++) {
        const sperre = teile.length <= sperren;
        const h = sperre ? false : zufall() < 0.45;
        const len = zufall() < (sperre ? 0.5 : 0.72) ? 2 : 3;
        const fix = sperre ? ri(pos[0] + 2, N - 1) : ri(0, N - 1);
        if (h && fix === ROT_REIHE) continue;
        const p = sperre ? ri(Math.max(0, ROT_REIHE - len + 1), Math.min(ROT_REIHE, N - len)) : ri(0, N - len);
        const g = belegung(teile, pos);
        let ok = true;
        for (let k = 0; k < len; k++) {
          const r = h ? fix : p + k;
          const c = h ? p + k : fix;
          if (g[r * N + c] !== -1) { ok = false; break; }
        }
        if (!ok) continue;
        teile.push({ h, len, fix });
        pos.push(p);
      }
      const an = analysieren(teile, pos);
      if (!an) continue;
      // Zustand mit Abstand möglichst nahe am Ziel (aber nicht drüber)
      let wahl = null;
      let wahlD = -1;
      for (const [k, d] of an.dist) {
        if (d <= ziel && d > wahlD) { wahlD = d; wahl = k; }
      }
      if (!wahl || wahlD < 1) continue;
      if (!bestes || wahlD > bestes.d) bestes = { teile, pos: an.alle.get(wahl), d: wahlD };
      if (wahlD >= ziel) break;
    }
    return bestes;
  }

  return { level, spielraum, geloest, N, ROT_REIHE };
})();

if (typeof module !== 'undefined') module.exports = Unblock;
else Spiele.registrieren({
  id: 'unblock',
  name: 'Unblock',
  emoji: '🚗',
  beschr: 'Schieb die Blöcke, hol das rote Auto raus',

  start(flaeche, hilfe) {
    const N = Unblock.N;
    const FARBEN = ['#4f7cff', '#22b867', '#ffc531', '#9b5cff', '#ff8a1f', '#2ec4d6', '#ff6fb5', '#8bc34a', '#a1887f'];
    const stand = hilfe.stand();
    stand.level = stand.level || 1;
    let geschafft = 0;
    let lv, pos, zuege, startPos, fertig;

    flaeche.innerHTML = `
      <div class="ub-wrap">
        <div class="ub-titel"></div>
        <div class="ub-brett"><div class="ub-ausgang"></div></div>
        <div class="ub-info"></div>
      </div>
      <div class="spiel-knoepfe">
        <button class="knopf grau" data-a="neu">🔄 Nochmal</button>
      </div>`;
    const brett = flaeche.querySelector('.ub-brett');
    const titel = flaeche.querySelector('.ub-titel');
    const info = flaeche.querySelector('.ub-info');

    function laden() {
      titel.textContent = `Level ${stand.level}`;
      info.textContent = 'Level wird gebaut …';
      setTimeout(() => {
        lv = Unblock.level(stand.level);
        startPos = lv.pos.slice();
        neuStart();
      }, 30);
    }

    function neuStart() {
      pos = startPos.slice();
      zuege = 0;
      fertig = false;
      zeichnen();
    }

    function infoText() {
      info.textContent = `Züge: ${zuege}  ·  schaffst du es in ${lv.d}?`;
    }

    function zeichnen() {
      brett.querySelectorAll('.ub-teil').forEach((el) => el.remove());
      lv.teile.forEach((t, i) => {
        const el = document.createElement('div');
        el.className = 'ub-teil' + (i === 0 ? ' rot' : '') + (t.h ? ' h' : ' v');
        el.style.setProperty('--f', i === 0 ? '#ef4b4b' : FARBEN[i % FARBEN.length]);
        el.style.width = `calc(${(t.h ? t.len : 1) * 100 / N}% - 8px)`;
        el.style.height = `calc(${(t.h ? 1 : t.len) * 100 / N}% - 8px)`;
        if (i === 0) el.textContent = '🚗';
        setzen(el, i, pos[i]);
        ziehbar(el, i);
        brett.appendChild(el);
      });
      infoText();
    }

    function setzen(el, i, p) {
      const t = lv.teile[i];
      const r = t.h ? t.fix : p;
      const c = t.h ? p : t.fix;
      el.style.left = `calc(${c * 100 / N}% + 4px)`;
      el.style.top = `calc(${r * 100 / N}% + 4px)`;
    }

    function ziehbar(el, i) {
      el.addEventListener('pointerdown', (ev) => {
        if (fertig) return;
        ev.preventDefault();
        el.setPointerCapture(ev.pointerId);
        const t = lv.teile[i];
        const zelle = brett.getBoundingClientRect().width / N;
        const [min, max] = Unblock.spielraum(lv.teile, pos, i);
        const start = t.h ? ev.clientX : ev.clientY;
        const p0 = pos[i];
        el.classList.add('zieht');
        const bewegen = (e2) => {
          const d = ((t.h ? e2.clientX : e2.clientY) - start) / zelle;
          const p = Math.max(min, Math.min(max, p0 + d));
          setzen(el, i, p);
        };
        const los = (e2) => {
          el.removeEventListener('pointermove', bewegen);
          el.removeEventListener('pointerup', los);
          el.removeEventListener('pointercancel', los);
          el.classList.remove('zieht');
          const d = ((t.h ? e2.clientX : e2.clientY) - start) / zelle;
          const p = Math.max(min, Math.min(max, Math.round(p0 + d)));
          pos[i] = p;
          setzen(el, i, p);
          if (p !== p0) {
            zuege++;
            hilfe.ton.note(440, 0, 0.05, 'triangle', 0.12);
            infoText();
            if (Unblock.geloest(pos)) gewonnen(el);
          }
        };
        el.addEventListener('pointermove', bewegen);
        el.addEventListener('pointerup', los);
        el.addEventListener('pointercancel', los);
      });
    }

    function gewonnen(el) {
      fertig = true;
      geschafft++;
      el.classList.add('raus');
      setzen(el, 0, N + 1);
      hilfe.ton.jubel();
      const perfekt = zuege <= lv.d;
      stand.level++;
      hilfe.speichern();
      setTimeout(() => {
        const box = document.createElement('div');
        box.className = 'r-sieg';
        box.innerHTML = `<div class="overlay-box"><h2>${perfekt ? 'Perfekt! 🌟' : 'Geschafft! 🎉'}</h2>
          <p>Level ${stand.level - 1} in ${zuege} Zügen${perfekt ? ' – besser geht\'s nicht!' : ` (am besten ${lv.d})`}</p></div>`;
        flaeche.appendChild(box);
        hilfe.vorbei();
      }, 500);
    }

    flaeche.querySelector('[data-a="neu"]').addEventListener('click', () => { if (lv && !fertig) neuStart(); });

    laden();
    return {
      stop() {},
      zusammenfassung: () => (geschafft ? `Level ${stand.level - 1} geschafft! Nächstes Mal geht's bei Level ${stand.level} weiter.`
        : `Nicht ganz geschafft – nächstes Mal wieder Level ${stand.level}.`),
    };
  },
});
