// Register der Minispiele.
// Jedes Spiel: { id, name, emoji, beschr, zeitlimit?, start(flaeche, hilfe) -> { stop(), zusammenfassung?() } }
//   zeitlimit: Sekunden – die Runde endet nach dieser Zeit oder vorher durch vorbei()
//   flaeche: leeres <div>, das den ganzen Spielbereich füllt
//   hilfe:   { ton, stand(), speichern(), vorbei(), pause(an) } – stand() ist ein Objekt, das gespeichert bleibt;
//            vorbei() meldet das Ende der (einzigen) Runde: verloren oder Level geschafft
//            (Level-Spiele rufen es nicht – dort geht es bis zum Zeitlimit Level für Level weiter)
//            pause(true/false) hält die Uhr des Zeitlimits an bzw. lässt sie weiterlaufen
const Spiele = {
  liste: [],
  registrieren(def) { this.liste.push(def); },
};

// Abschluss-Text für Level-Spiele: geschafft = Level in dieser Runde, level = nächstes Level
function levelBilanz(geschafft, level) {
  if (!geschafft) return `Nicht ganz geschafft – nächstes Mal geht's bei Level ${level} weiter, wo du aufgehört hast.`;
  return `${geschafft === 1 ? `Level ${level - 1}` : `${geschafft} Level`} geschafft! Nächstes Mal geht's bei Level ${level} weiter.`;
}

// Kleines Hilfsmittel für Canvas-Spiele: Canvas in Gerätepixeln, passt sich der Größe an.
function spielCanvas(flaeche) {
  const canvas = document.createElement('canvas');
  flaeche.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const info = { canvas, ctx, b: 0, h: 0 };
  function anpassen() {
    const r = flaeche.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    info.b = r.width;
    info.h = r.height;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  anpassen();
  window.addEventListener('resize', anpassen);
  info.weg = () => window.removeEventListener('resize', anpassen);
  return info;
}
