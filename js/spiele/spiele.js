// Register der Minispiele.
// Jedes Spiel: { id, name, emoji, beschr, start(flaeche, hilfe) -> { stop(), zusammenfassung?() } }
//   flaeche: leeres <div>, das den ganzen Spielbereich füllt
//   hilfe:   { ton, stand(), speichern(), vorbei() } – stand() ist ein Objekt, das gespeichert bleibt;
//            vorbei() meldet das Ende der (einzigen) Runde: verloren oder Level geschafft
const Spiele = {
  liste: [],
  registrieren(def) { this.liste.push(def); },
};

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
