// Snake: Äpfel fressen, nicht gegen Wand oder sich selbst fahren.
// Steuerung: Wischen, Pfeil-Knöpfe oder Pfeiltasten.
Spiele.registrieren({
  id: 'snake',
  name: 'Snake',
  emoji: '🐍',
  beschr: 'Friss Äpfel und werde lang',

  start(flaeche, hilfe) {
    const stand = hilfe.stand();
    stand.best = stand.best || 0;

    flaeche.innerHTML = `
      <div class="sp-spalte">
        <div class="sp-canvas"></div>
        <div class="sp-steuer kreuz">
          <span></span><button data-r="0,-1">⬆️</button><span></span>
          <button data-r="-1,0">⬅️</button><span></span><button data-r="1,0">➡️</button>
          <span></span><button data-r="0,1">⬇️</button><span></span>
        </div>
      </div>`;
    const bereich = flaeche.querySelector('.sp-canvas');
    const lw = spielCanvas(bereich);
    const { ctx } = lw;

    let spalten, zeilen, zelle, ox, oy;
    let schlange, richtung, naechsteRichtung, apfel, punkte, zustand, takt, akku, letzte, versuche = 0, bestRunde = 0;
    let lauf = true;

    function raster() {
      const s = Math.min(lw.b, lw.h);
      zelle = Math.floor(s / 14);
      spalten = Math.max(10, Math.floor(lw.b / zelle));
      const kopfzeile = zelle * 1.6; // Platz für die Punkteanzeige
      zeilen = Math.max(10, Math.floor((lw.h - kopfzeile) / zelle));
      ox = Math.floor((lw.b - spalten * zelle) / 2);
      oy = Math.floor(kopfzeile + (lw.h - kopfzeile - zeilen * zelle) / 2);
    }

    function reset() {
      raster();
      const mx = Math.floor(spalten / 2);
      const my = Math.floor(zeilen / 2);
      schlange = [{ x: mx, y: my }, { x: mx - 1, y: my }, { x: mx - 2, y: my }];
      richtung = { x: 1, y: 0 };
      naechsteRichtung = richtung;
      punkte = 0;
      takt = 0.2;
      akku = 0;
      neuerApfel();
      zustand = 'warten';
    }

    function neuerApfel() {
      do {
        apfel = { x: Math.floor(Math.random() * spalten), y: Math.floor(Math.random() * zeilen) };
      } while (schlange.some((s) => s.x === apfel.x && s.y === apfel.y));
    }

    function lenken(x, y) {
      if (zustand === 'tot') return;
      if (zustand === 'warten') { zustand = 'laeuft'; versuche++; }
      if (x === -richtung.x && y === -richtung.y) return; // nicht umdrehen
      naechsteRichtung = { x, y };
    }

    function schritt() {
      richtung = naechsteRichtung;
      const kopf = { x: schlange[0].x + richtung.x, y: schlange[0].y + richtung.y };
      const wand = kopf.x < 0 || kopf.y < 0 || kopf.x >= spalten || kopf.y >= zeilen;
      const selbst = schlange.slice(0, -1).some((s) => s.x === kopf.x && s.y === kopf.y);
      if (wand || selbst) {
        zustand = 'tot';
        hilfe.ton.crash();
        bestRunde = Math.max(bestRunde, punkte);
        if (punkte > stand.best) { stand.best = punkte; hilfe.speichern(); }
        return;
      }
      schlange.unshift(kopf);
      if (kopf.x === apfel.x && kopf.y === apfel.y) {
        punkte++;
        hilfe.ton.punkt();
        takt = Math.max(0.085, takt * 0.97);
        neuerApfel();
      } else {
        schlange.pop();
      }
    }

    function zeichnen() {
      ctx.fillStyle = '#5e9a3a';
      ctx.fillRect(0, 0, lw.b, lw.h);
      for (let y = 0; y < zeilen; y++) {
        for (let x = 0; x < spalten; x++) {
          ctx.fillStyle = (x + y) % 2 ? '#aedd77' : '#b9e384';
          ctx.fillRect(ox + x * zelle, oy + y * zelle, zelle, zelle);
        }
      }
      ctx.font = `${Math.round(zelle * 0.9)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🍎', ox + apfel.x * zelle + zelle / 2, oy + apfel.y * zelle + zelle / 2 + 1);
      schlange.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#2f6fdb' : i % 2 ? '#4f7cff' : '#6a92ff';
        const r = zelle * 0.12;
        const x = ox + s.x * zelle + r;
        const y = oy + s.y * zelle + r;
        ctx.beginPath();
        ctx.roundRect(x, y, zelle - 2 * r, zelle - 2 * r, zelle * 0.3);
        ctx.fill();
      });
      // Augen
      const k = schlange[0];
      ctx.fillStyle = '#fff';
      const cx = ox + k.x * zelle + zelle / 2;
      const cy = oy + k.y * zelle + zelle / 2;
      [-1, 1].forEach((s) => {
        const ax = cx + richtung.x * zelle * 0.15 + richtung.y * s * zelle * 0.18;
        const ay = cy + richtung.y * zelle * 0.15 + richtung.x * s * zelle * 0.18;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ax, ay, zelle * 0.13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(ax + richtung.x * 2, ay + richtung.y * 2, zelle * 0.06, 0, Math.PI * 2); ctx.fill();
      });
      // Text
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1f2a44';
      ctx.lineWidth = 5;
      ctx.font = `900 ${Math.round(zelle * 1.1)}px system-ui, sans-serif`;
      ctx.strokeText(`🍎 ${punkte}   🏆 ${stand.best}`, lw.b / 2, zelle * 0.8);
      ctx.fillText(`🍎 ${punkte}   🏆 ${stand.best}`, lw.b / 2, zelle * 0.8);
      let text = '';
      if (zustand === 'warten') text = 'Wisch oder drück einen Pfeil!';
      if (zustand === 'tot') text = 'Autsch! Tippen für neuen Versuch';
      if (text) {
        ctx.font = `800 ${Math.round(zelle * 0.8)}px system-ui, sans-serif`;
        ctx.strokeText(text, lw.b / 2, lw.h * 0.7);
        ctx.fillText(text, lw.b / 2, lw.h * 0.7);
      }
    }

    function schleife(t) {
      if (!lauf) return;
      const dt = Math.min(0.1, (t - (letzte || t)) / 1000);
      letzte = t;
      if (zustand === 'laeuft') {
        akku += dt;
        while (akku >= takt && zustand === 'laeuft') { akku -= takt; schritt(); }
      }
      zeichnen();
      requestAnimationFrame(schleife);
    }

    // Wischen
    let wischStart = null;
    bereich.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (zustand === 'tot') { reset(); return; }
      wischStart = { x: ev.clientX, y: ev.clientY };
    });
    bereich.addEventListener('pointermove', (ev) => {
      if (!wischStart) return;
      const dx = ev.clientX - wischStart.x;
      const dy = ev.clientY - wischStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) lenken(Math.sign(dx), 0); else lenken(0, Math.sign(dy));
      wischStart = { x: ev.clientX, y: ev.clientY };
    });
    bereich.addEventListener('pointerup', () => { wischStart = null; });

    flaeche.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (zustand === 'tot') { reset(); return; }
      const [x, y] = b.dataset.r.split(',').map(Number);
      lenken(x, y);
    }));
    const TASTEN = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const taste = (ev) => {
      if (!TASTEN[ev.key]) return;
      ev.preventDefault();
      if (zustand === 'tot') { reset(); return; }
      lenken(...TASTEN[ev.key]);
    };
    document.addEventListener('keydown', taste);

    reset();
    requestAnimationFrame(schleife);

    return {
      stop() { lauf = false; lw.weg(); document.removeEventListener('keydown', taste); },
      zusammenfassung() {
        bestRunde = Math.max(bestRunde, punkte);
        return `Längste Schlange: ${bestRunde} Äpfel (${versuche} Versuche). Rekord: ${stand.best}`;
      },
    };
  },
});
