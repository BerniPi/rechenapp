// Flappy Vogel: Tippen zum Fliegen, durch die Röhren steuern.
Spiele.registrieren({
  id: 'flappy',
  name: 'Flappy Vogel',
  emoji: '🐤',
  beschr: 'Tippen und durch die Röhren fliegen',

  start(flaeche, hilfe) {
    const leinwand = spielCanvas(flaeche);
    const { ctx, weg } = leinwand;
    const g = () => leinwand;
    const stand = hilfe.stand();
    stand.best = stand.best || 0;

    let zustand = 'warten'; // warten | fliegt | tot
    let vogel, roehren, punkte, letzte;
    let lauf = true;

    function reset() {
      const { h } = g();
      vogel = { y: h * 0.45, v: 0 };
      roehren = [];
      punkte = 0;
      zustand = 'warten';
    }

    function masse() {
      const { b, h } = g();
      const s = Math.min(b, h);
      return {
        b, h,
        x: b * 0.28,
        r: s * 0.045,
        luecke: h * 0.3,
        breite: Math.max(56, s * 0.13),
        tempo: b * 0.32,          // px pro Sekunde
        abstand: Math.max(b * 0.55, 230),
        schwer: h * 2.2,
        sprung: -h * 0.72,
      };
    }

    function tippen(ev) {
      if (ev) ev.preventDefault();
      if (zustand === 'tot') return;
      if (zustand === 'warten') zustand = 'fliegt';
      vogel.v = masse().sprung;
      hilfe.ton.flap();
    }
    const taste = (ev) => { if (ev.code === 'Space' || ev.code === 'ArrowUp') tippen(ev); };
    flaeche.addEventListener('pointerdown', tippen);
    document.addEventListener('keydown', taste);

    function sterben() {
      zustand = 'tot';
      hilfe.ton.crash();
      if (punkte > stand.best) { stand.best = punkte; hilfe.speichern(); }
      hilfe.vorbei();
    }

    function schritt(dt) {
      const m = masse();
      if (zustand === 'warten') {
        vogel.y = m.h * 0.45 + Math.sin(performance.now() / 300) * 8;
        return;
      }
      if (zustand === 'tot') {
        if (vogel.y < m.h - m.r) { vogel.v += m.schwer * dt; vogel.y = Math.min(m.h - m.r, vogel.y + vogel.v * dt); }
        return;
      }
      vogel.v += m.schwer * dt;
      vogel.y += vogel.v * dt;
      if (!roehren.length || roehren[roehren.length - 1].x < m.b - m.abstand) {
        const rand = m.h * 0.12;
        roehren.push({ x: m.b + m.breite, mitte: rand + m.luecke / 2 + Math.random() * (m.h - 2 * rand - m.luecke), gezaehlt: false });
      }
      for (const r of roehren) {
        r.x -= m.tempo * dt;
        if (!r.gezaehlt && r.x + m.breite < m.x) { r.gezaehlt = true; punkte++; hilfe.ton.punkt(); }
        const imX = m.x + m.r > r.x && m.x - m.r < r.x + m.breite;
        const imSpalt = vogel.y - m.r > r.mitte - m.luecke / 2 && vogel.y + m.r < r.mitte + m.luecke / 2;
        if (imX && !imSpalt) sterben();
      }
      roehren = roehren.filter((r) => r.x > -m.breite - 10);
      if (vogel.y + m.r >= m.h || vogel.y - m.r <= 0) sterben();
    }

    function zeichnen() {
      const m = masse();
      // Himmel
      const verlauf = ctx.createLinearGradient(0, 0, 0, m.h);
      verlauf.addColorStop(0, '#7fd3ff');
      verlauf.addColorStop(1, '#d9f3ff');
      ctx.fillStyle = verlauf;
      ctx.fillRect(0, 0, m.b, m.h);
      // Röhren
      for (const r of roehren) {
        ctx.fillStyle = '#3fbf4a';
        ctx.strokeStyle = '#1f7a2a';
        ctx.lineWidth = 3;
        const oben = r.mitte - m.luecke / 2;
        const unten = r.mitte + m.luecke / 2;
        ctx.fillRect(r.x, 0, m.breite, oben);
        ctx.strokeRect(r.x, -5, m.breite, oben + 5);
        ctx.fillRect(r.x, unten, m.breite, m.h - unten);
        ctx.strokeRect(r.x, unten, m.breite, m.h - unten + 5);
        ctx.fillRect(r.x - 6, oben - 22, m.breite + 12, 22);
        ctx.strokeRect(r.x - 6, oben - 22, m.breite + 12, 22);
        ctx.fillRect(r.x - 6, unten, m.breite + 12, 22);
        ctx.strokeRect(r.x - 6, unten, m.breite + 12, 22);
      }
      // Vogel
      ctx.save();
      ctx.translate(m.x, vogel.y);
      ctx.rotate(Math.max(-0.5, Math.min(1.2, vogel.v / (m.h * 1.2))));
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#a77a00';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, m.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(m.r * 0.35, -m.r * 0.3, m.r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(m.r * 0.45, -m.r * 0.3, m.r * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8a1f';
      ctx.beginPath(); ctx.moveTo(m.r * 0.7, 0); ctx.lineTo(m.r * 1.35, m.r * 0.15); ctx.lineTo(m.r * 0.7, m.r * 0.35); ctx.fill();
      ctx.fillStyle = '#ffb703';
      ctx.beginPath(); ctx.ellipse(-m.r * 0.3, m.r * 0.15, m.r * 0.45, m.r * 0.25, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Texte
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1f2a44';
      ctx.lineWidth = 6;
      ctx.font = `900 ${Math.round(m.h * 0.09)}px system-ui, sans-serif`;
      ctx.strokeText(punkte, m.b / 2, m.h * 0.14);
      ctx.fillText(punkte, m.b / 2, m.h * 0.14);
      ctx.font = `800 ${Math.round(Math.min(m.b, m.h) * 0.055)}px system-ui, sans-serif`;
      let text = '';
      if (zustand === 'warten') text = 'Tippen zum Starten!';
      if (zustand === 'tot') text = 'Autsch!';
      if (text) { ctx.strokeText(text, m.b / 2, m.h * 0.66); ctx.fillText(text, m.b / 2, m.h * 0.66); }
      ctx.font = `700 ${Math.round(Math.min(m.b, m.h) * 0.04)}px system-ui, sans-serif`;
      const best = `Rekord: ${stand.best}`;
      ctx.strokeText(best, m.b / 2, m.h * 0.21);
      ctx.fillText(best, m.b / 2, m.h * 0.21);
    }

    function schleife(t) {
      if (!lauf) return;
      const dt = Math.min(0.035, (t - (letzte || t)) / 1000);
      letzte = t;
      schritt(dt);
      zeichnen();
      requestAnimationFrame(schleife);
    }

    reset();
    requestAnimationFrame(schleife);

    return {
      stop() {
        lauf = false;
        weg();
        flaeche.removeEventListener('pointerdown', tippen);
        document.removeEventListener('keydown', taste);
      },
      zusammenfassung() {
        return `${punkte} Punkte. Rekord: ${stand.best}`;
      },
    };
  },
});
