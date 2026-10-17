// Speichert Einstellungen, Sternekonto, Rekorde und Verlauf im localStorage.
const Speicher = {
  KEY: 'rechenheld-v1',
  data: null,

  standard() {
    return {
      settings: { modus: 'schrift', art: 'zehn', ops: ['+'], raum: 20, einsetzen: false },
      sterne: 0,
      rekorde: {},
      verlauf: [],
      spielstand: {},
      tempo: {},                 // persönlicher Schnitt je Aufgabenart: { wert, n }
      eltern: {
        anpassen: true,          // Sterne am eigenen Tempo messen
        zehn: [4, 6, 9, 14],     // Sekunden pro Aufgabe für 5/4/3/2 Sterne
        minute: [20, 14, 9, 5],  // richtige pro Minute für 5/4/3/2 Sterne
        strafe: 3,               // Strafsekunden pro falscher Antwort
        preis: 10,               // Sterne pro Spielrunde (Eltern können 1–50 einstellen)
        erkennung: 'vosk',       // 'vosk' oder 'google'
      },
    };
  },

  laden() {
    const std = this.standard();
    let d = {};
    try { d = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { d = {}; }
    this.data = {
      ...std,
      ...d,
      settings: { ...std.settings, ...(d.settings || {}) },
      eltern: { ...std.eltern, ...(d.eltern || {}) },
      spielstand: { ...(d.spielstand || {}) },
      tempo: { ...(d.tempo || {}) },
    };
    delete this.data.eltern.spielMinuten;
    if (!(this.data.eltern.preis >= 1)) this.data.eltern.preis = 10;
    return this.data;
  },

  speichern() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* privat/voll */ }
  },

  zuruecksetzen() {
    this.data = this.standard();
    this.speichern();
  },
};
