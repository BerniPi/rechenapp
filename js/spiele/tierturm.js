// Tierturm: Ein Tier schwebt hin und her – im richtigen Moment tippen, damit es
// auf dem Turm landet. Steht es zu weit über dem Rand, fällt es herunter.
Spiele.registrieren({
  id: 'tierturm',
  name: 'Tierturm',
  emoji: '🦒',
  beschr: 'Staple die Tiere so hoch du kannst',
  zeitlimit: 180,

  start(flaeche, hilfe) {
    const TIERE = [
      ['🐘', 1.35], ['🐻', 1.05], ['🐷', 1.0], ['🐸', 0.85], ['🐱', 0.9], ['🐶', 1.0],
      ['🦁', 1.15], ['🐮', 1.25], ['🐭', 0.75], ['🐼', 1.05], ['🐰', 0.85], ['🐵', 0.95],
    ];
    const FARBEN = ['#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff', '#fdffb6', '#ffadad'];
    const stand = hilfe.stand();
    stand.best = stand.best || 0;

    const bereich = document.createElement('div');
    bereich.className = 'sp-voll';
    flaeche.appendChild(bereich);
    const lw = spielCanvas(bereich);
    const { ctx } = lw;

    let turm, schwebt, faellt, kippt, kamera, zustand, letzte, lauf = true, perfektText = 0;

    const U = () => Math.min(lw.b * 0.2, lw.h * 0.13);
    const hoehe = () => U() * 0.8;
    const boden = () => lw.h - U() * 0.6;

    function neuesTier() {
      const [emoji, breite] = TIERE[Math.floor(Math.random() * TIERE.length)];
      const u = U();
      const w = breite * u;
      const tempo = Math.min(lw.b * 0.55 + turm.length * 10, lw.b * 1.3);
      schwebt = {
        emoji, w, x: Math.random() < 0.5 ? w / 2 : lw.b - w / 2,
        richtung: Math.random() < 0.5 ? 1 : -1, tempo,
        farbe: FARBEN[turm.length % FARBEN.length],
      };
    }

    function reset() {
      const u = U();
      turm = [{ emoji: '', w: u * 1.6, x: lw.b / 2, y: boden(), farbe: '#7a5a2b', sockel: true }];
      kamera = 0;
      faellt = null;
      kippt = null;
      zustand = 'laeuft';
      neuesTier();
    }

    const oben = () => turm[turm.length - 1];
    const punkte = () => turm.length - 1;
    const schwebY = () => oben().y - hoehe() * 3.2;

    function tippen(ev) {
      if (ev) ev.preventDefault();
      if (zustand === 'aus') return;
      if (faellt || kippt) return;
      faellt = { ...schwebt, y: schwebY(), v: 0 };
      schwebt = null;
      hilfe.ton.klick();
    }
    bereich.addEventListener('pointerdown', tippen);
    const taste = (ev) => { if (ev.code === 'Space') tippen(ev); };
    document.addEventListener('keydown', taste);

    function landen() {
      const ziel = oben();
      const dx = faellt.x - ziel.x;
      if (Math.abs(dx) > ziel.w / 2) {
        // fällt herunter
        kippt = { ...faellt, y: ziel.y - hoehe(), v: -100, vx: Math.sign(dx) * 160, winkel: 0 };
        faellt = null;
        zustand = 'aus';
        hilfe.ton.crash();
        if (punkte() > stand.best) { stand.best = punkte(); hilfe.speichern(); }
        hilfe.vorbei();
        return;
      }
      let x = faellt.x;
      if (Math.abs(dx) < ziel.w * 0.07) { x = ziel.x; perfektText = 1; hilfe.ton.jubel(); } else hilfe.ton.richtig();
      turm.push({ emoji: faellt.emoji, w: faellt.w, x, y: ziel.y - hoehe(), farbe: faellt.farbe });
      faellt = null;
      neuesTier();
    }

    function schritt(dt) {
      if (schwebt) {
        schwebt.x += schwebt.richtung * schwebt.tempo * dt;
        if (schwebt.x > lw.b - schwebt.w / 2) { schwebt.x = lw.b - schwebt.w / 2; schwebt.richtung = -1; }
        if (schwebt.x < schwebt.w / 2) { schwebt.x = schwebt.w / 2; schwebt.richtung = 1; }
      }
      if (faellt) {
        faellt.v += lw.h * 3 * dt;
        faellt.y += faellt.v * dt;
        if (faellt.y >= oben().y - hoehe()) landen();
      }
      if (kippt) {
        kippt.v += lw.h * 2.5 * dt;
        kippt.y += kippt.v * dt;
        kippt.x += kippt.vx * dt;
        kippt.winkel += Math.sign(kippt.vx) * 4 * dt;
      }
      // Kamera folgt dem Turm
      const zielKamera = Math.max(0, lw.h * 0.3 - schwebY());
      kamera += (zielKamera - kamera) * Math.min(1, dt * 4);
      if (perfektText > 0) perfektText -= dt;
    }

    function tierZeichnen(t, y, winkel = 0) {
      const h = hoehe();
      ctx.save();
      ctx.translate(t.x, y + kamera + h / 2);
      ctx.rotate(winkel);
      ctx.fillStyle = t.farbe;
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-t.w / 2, -h / 2, t.w, h, h * 0.3);
      ctx.fill();
      ctx.stroke();
      if (t.emoji) {
        ctx.font = `${Math.round(h * 0.75)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.emoji, 0, 2);
      }
      ctx.restore();
    }

    function zeichnen() {
      const himmel = ctx.createLinearGradient(0, 0, 0, lw.h);
      const tiefe = Math.min(1, kamera / (lw.h * 6));
      himmel.addColorStop(0, `hsl(${205 + tiefe * 40}, 80%, ${78 - tiefe * 45}%)`);
      himmel.addColorStop(1, `hsl(${200 + tiefe * 40}, 70%, ${92 - tiefe * 40}%)`);
      ctx.fillStyle = himmel;
      ctx.fillRect(0, 0, lw.b, lw.h);
      // Wiese
      ctx.fillStyle = '#7cc95a';
      ctx.fillRect(0, boden() + hoehe() + kamera, lw.b, lw.h);
      turm.forEach((t) => tierZeichnen(t, t.y));
      if (schwebt) {
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(schwebt.x, 0);
        ctx.lineTo(schwebt.x, schwebY() + kamera);
        ctx.stroke();
        ctx.setLineDash([]);
        tierZeichnen(schwebt, schwebY());
      }
      if (faellt) tierZeichnen(faellt, faellt.y);
      if (kippt) tierZeichnen(kippt, kippt.y, kippt.winkel);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1f2a44';
      ctx.lineWidth = 6;
      ctx.font = `900 ${Math.round(lw.h * 0.07)}px system-ui, sans-serif`;
      ctx.strokeText(punkte(), lw.b / 2, lw.h * 0.1);
      ctx.fillText(punkte(), lw.b / 2, lw.h * 0.1);
      ctx.font = `700 ${Math.round(lw.h * 0.032)}px system-ui, sans-serif`;
      ctx.strokeText(`Rekord: ${stand.best}`, lw.b / 2, lw.h * 0.15);
      ctx.fillText(`Rekord: ${stand.best}`, lw.b / 2, lw.h * 0.15);
      if (perfektText > 0) {
        ctx.font = `900 ${Math.round(lw.h * 0.05)}px system-ui, sans-serif`;
        ctx.strokeText('Perfekt! ✨', lw.b / 2, lw.h * 0.22);
        ctx.fillText('Perfekt! ✨', lw.b / 2, lw.h * 0.22);
      }
      if (zustand === 'aus' && (!kippt || kippt.y + kamera > lw.h)) {
        ctx.font = `800 ${Math.round(Math.min(lw.h * 0.04, lw.b * 0.045))}px system-ui, sans-serif`;
        ctx.strokeText('Runtergefallen!', lw.b / 2, lw.h * 0.3);
        ctx.fillText('Runtergefallen!', lw.b / 2, lw.h * 0.3);
      } else if (punkte() === 0 && schwebt) {
        ctx.font = `800 ${Math.round(Math.min(lw.h * 0.035, lw.b * 0.045))}px system-ui, sans-serif`;
        ctx.strokeText('Tippe, um das Tier fallen zu lassen', lw.b / 2, lw.h * 0.3);
        ctx.fillText('Tippe, um das Tier fallen zu lassen', lw.b / 2, lw.h * 0.3);
      }
    }

    function schleife(t) {
      if (!lauf) return;
      const dt = Math.min(0.04, (t - (letzte || t)) / 1000);
      letzte = t;
      schritt(dt);
      zeichnen();
      requestAnimationFrame(schleife);
    }

    reset();
    requestAnimationFrame(schleife);

    return {
      stop() { lauf = false; lw.weg(); document.removeEventListener('keydown', taste); },
      zusammenfassung() {
        // Bei Zeit-um wurde der Rekord noch nicht gespeichert
        if (punkte() > stand.best) { stand.best = punkte(); hilfe.speichern(); }
        return `Dein Turm: ${punkte()} Tiere. Rekord: ${stand.best}`;
      },
    };
  },
});
