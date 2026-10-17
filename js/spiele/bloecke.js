// Farbblöcke: Reihen füllen, damit sie verschwinden.
Spiele.registrieren({
  id: 'bloecke',
  name: 'Farbblöcke',
  emoji: '🧱',
  beschr: 'Fülle ganze Reihen mit Blöcken',
  zeitlimit: 60,

  start(flaeche, hilfe) {
    const B = 10;
    const H = 20;
    const FORMEN = {
      I: { f: '#2ec4d6', z: [[0, 1], [1, 1], [2, 1], [3, 1]] },
      O: { f: '#ffc531', z: [[1, 0], [2, 0], [1, 1], [2, 1]] },
      T: { f: '#9b5cff', z: [[1, 0], [0, 1], [1, 1], [2, 1]] },
      S: { f: '#22b867', z: [[1, 0], [2, 0], [0, 1], [1, 1]] },
      Z: { f: '#ef4b4b', z: [[0, 0], [1, 0], [1, 1], [2, 1]] },
      J: { f: '#4f7cff', z: [[0, 0], [0, 1], [1, 1], [2, 1]] },
      L: { f: '#ff8a1f', z: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    };
    const stand = hilfe.stand();
    stand.best = stand.best || 0;

    flaeche.innerHTML = `
      <div class="sp-spalte">
        <div class="sp-canvas"></div>
        <div class="sp-steuer reihe5">
          <button data-a="links">⬅️</button>
          <button data-a="drehen">🔄</button>
          <button data-a="rechts">➡️</button>
          <button data-a="runter">⬇️</button>
          <button data-a="fallen">⏬</button>
        </div>
      </div>`;
    const bereich = flaeche.querySelector('.sp-canvas');
    const lw = spielCanvas(bereich);
    const { ctx } = lw;

    let feld, teil, naechstes, beutel, punkte, reihen, zustand, akku, letzte, lauf = true;

    function ausBeutel() {
      if (!beutel || !beutel.length) {
        beutel = Object.keys(FORMEN);
        for (let i = beutel.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [beutel[i], beutel[j]] = [beutel[j], beutel[i]];
        }
      }
      return beutel.pop();
    }

    function neuesTeil() {
      const typ = naechstes || ausBeutel();
      naechstes = ausBeutel();
      teil = { typ, zellen: FORMEN[typ].z.map((p) => p.slice()), x: 3, y: 0 };
      if (kollision(teil.zellen, teil.x, teil.y)) {
        zustand = 'aus';
        hilfe.ton.crash();
        if (punkte > stand.best) { stand.best = punkte; hilfe.speichern(); }
        hilfe.vorbei();
      }
    }

    function reset() {
      feld = Array.from({ length: H }, () => new Array(B).fill(null));
      punkte = 0;
      reihen = 0;
      akku = 0;
      naechstes = null;
      zustand = 'laeuft';
      neuesTeil();
    }

    function kollision(zellen, x, y) {
      return zellen.some(([cx, cy]) => {
        const fx = x + cx;
        const fy = y + cy;
        return fx < 0 || fx >= B || fy >= H || (fy >= 0 && feld[fy][fx]);
      });
    }

    const tempo = () => Math.max(0.12, 0.75 - Math.floor(reihen / 8) * 0.07);

    function bewegen(dx) {
      if (zustand !== 'laeuft') return;
      if (!kollision(teil.zellen, teil.x + dx, teil.y)) { teil.x += dx; hilfe.ton.klick(); }
    }

    function drehen() {
      if (zustand !== 'laeuft' || teil.typ === 'O') return;
      const n = teil.typ === 'I' ? 4 : 3;
      const neu = teil.zellen.map(([x, y]) => [n - 1 - y, x]);
      for (const dx of [0, -1, 1, -2, 2]) {
        if (!kollision(neu, teil.x + dx, teil.y)) {
          teil.zellen = neu;
          teil.x += dx;
          hilfe.ton.klick();
          return;
        }
      }
    }

    function runter() {
      if (zustand !== 'laeuft') return false;
      if (!kollision(teil.zellen, teil.x, teil.y + 1)) { teil.y++; return true; }
      festsetzen();
      return false;
    }

    function fallen() {
      if (zustand !== 'laeuft') return;
      while (runter()) { /* bis unten */ }
    }

    function festsetzen() {
      const f = FORMEN[teil.typ].f;
      teil.zellen.forEach(([cx, cy]) => {
        const y = teil.y + cy;
        if (y >= 0) feld[y][teil.x + cx] = f;
      });
      let weg = 0;
      for (let y = H - 1; y >= 0; y--) {
        if (feld[y].every(Boolean)) {
          feld.splice(y, 1);
          feld.unshift(new Array(B).fill(null));
          weg++;
          y++;
        }
      }
      if (weg) {
        reihen += weg;
        punkte += [0, 1, 3, 5, 8][weg];
        hilfe.ton.richtig();
      } else {
        hilfe.ton.note(200, 0, 0.05, 'triangle', 0.15);
      }
      akku = 0;
      neuesTeil();
    }

    function geisterY() {
      let y = teil.y;
      while (!kollision(teil.zellen, teil.x, y + 1)) y++;
      return y;
    }

    function zeichnen() {
      ctx.fillStyle = '#1f2a44';
      ctx.fillRect(0, 0, lw.b, lw.h);
      const z = Math.floor(Math.min((lw.h - 16) / H, (lw.b - 120) / B));
      const ox = Math.floor((lw.b - z * B - 100) / 2);
      const oy = Math.floor((lw.h - z * H) / 2);
      ctx.fillStyle = '#2b3a5e';
      ctx.fillRect(ox, oy, z * B, z * H);
      const block = (x, y, farbe, alpha = 1) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = farbe;
        ctx.beginPath();
        ctx.roundRect(ox + x * z + 1, oy + y * z + 1, z - 2, z - 2, z * 0.2);
        ctx.fill();
        if (alpha === 1) {
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          ctx.fillRect(ox + x * z + 3, oy + y * z + 3, z - 6, z * 0.22);
        }
        ctx.globalAlpha = 1;
      };
      feld.forEach((reihe, y) => reihe.forEach((f, x) => { if (f) block(x, y, f); }));
      if (zustand === 'laeuft') {
        const gy = geisterY();
        teil.zellen.forEach(([cx, cy]) => block(teil.x + cx, gy + cy, FORMEN[teil.typ].f, 0.25));
        teil.zellen.forEach(([cx, cy]) => { if (teil.y + cy >= 0) block(teil.x + cx, teil.y + cy, FORMEN[teil.typ].f); });
      }
      // Seitenleiste
      const sx = ox + z * B + 14;
      ctx.fillStyle = '#fff';
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Nächstes', sx, oy);
      const kz = Math.min(20, z);
      FORMEN[naechstes].z.forEach(([cx, cy]) => {
        ctx.fillStyle = FORMEN[naechstes].f;
        ctx.fillRect(sx + cx * kz, oy + 28 + cy * kz, kz - 2, kz - 2);
      });
      ctx.fillStyle = '#fff';
      ctx.fillText('Punkte', sx, oy + 110);
      ctx.font = '900 28px system-ui, sans-serif';
      ctx.fillText(punkte, sx, oy + 132);
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.fillText('Rekord', sx, oy + 180);
      ctx.font = '900 28px system-ui, sans-serif';
      ctx.fillText(stand.best, sx, oy + 202);
      if (zustand === 'aus') {
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(ox, oy + z * H * 0.35, z * B, z * 4);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = `900 ${Math.round(z * 1.1)}px system-ui, sans-serif`;
        ctx.fillText('Voll!', ox + z * B / 2, oy + z * H * 0.35 + z * 0.6);
      }
    }

    function schleife(t) {
      if (!lauf) return;
      const dt = Math.min(0.1, (t - (letzte || t)) / 1000);
      letzte = t;
      if (zustand === 'laeuft') {
        akku += dt;
        if (akku >= tempo()) { akku = 0; runter(); }
      }
      zeichnen();
      requestAnimationFrame(schleife);
    }

    // Steuerung: Knöpfe (halten = wiederholen), Wischen/Tippen, Tastatur
    const AKTION = { links: () => bewegen(-1), rechts: () => bewegen(1), drehen, runter: () => { runter(); akku = 0; }, fallen };
    flaeche.querySelectorAll('[data-a]').forEach((b) => {
      let wdh = null;
      const stopp = () => { clearTimeout(wdh); clearInterval(wdh); wdh = null; };
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        if (zustand === 'aus') return;
        const a = b.dataset.a;
        AKTION[a]();
        if (a === 'links' || a === 'rechts' || a === 'runter') {
          wdh = setTimeout(() => { wdh = setInterval(AKTION[a], 70); }, 220);
        }
      });
      b.addEventListener('pointerup', stopp);
      b.addEventListener('pointerleave', stopp);
      b.addEventListener('pointercancel', stopp);
    });

    let wisch = null;
    bereich.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (zustand === 'aus') return;
      wisch = { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, bewegt: false };
    });
    bereich.addEventListener('pointermove', (ev) => {
      if (!wisch) return;
      const z = Math.max(24, lw.b / 14);
      while (ev.clientX - wisch.x > z) { bewegen(1); wisch.x += z; wisch.bewegt = true; }
      while (wisch.x - ev.clientX > z) { bewegen(-1); wisch.x -= z; wisch.bewegt = true; }
    });
    bereich.addEventListener('pointerup', (ev) => {
      if (!wisch) return;
      const dy = ev.clientY - wisch.sy;
      if (dy > 80 && Math.abs(ev.clientX - wisch.sx) < 60) fallen();
      else if (!wisch.bewegt && Math.abs(dy) < 15) drehen();
      wisch = null;
    });

    const taste = (ev) => {
      const k = { ArrowLeft: 'links', ArrowRight: 'rechts', ArrowUp: 'drehen', ArrowDown: 'runter', ' ': 'fallen' }[ev.key];
      if (!k) return;
      ev.preventDefault();
      if (zustand === 'aus') return;
      AKTION[k]();
    };
    document.addEventListener('keydown', taste);

    reset();
    requestAnimationFrame(schleife);

    return {
      stop() { lauf = false; lw.weg(); document.removeEventListener('keydown', taste); },
      zusammenfassung() {
        // Bei Zeit-um wurde der Rekord noch nicht gespeichert
        if (punkte > stand.best) { stand.best = punkte; hilfe.speichern(); }
        return `${punkte} Punkte. Rekord: ${stand.best}`;
      },
    };
  },
});
