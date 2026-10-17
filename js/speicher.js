// Speichert Einstellungen, Sternekonto, Rekorde und Verlauf im localStorage – je Benutzer getrennt.
const Speicher = {
  ALT: 'rechenheld-v1',            // Daten aus der Zeit vor den Benutzern
  BENUTZER: 'rechenheld-benutzer', // { liste: [{ id, name, bild: { art: 'emoji'|'foto', wert } }], aktiv }
  data: null,
  benutzer: null,

  standard() {
    return {
      // art: 'aufgaben' (anzahl Aufgaben auf Zeit) oder 'zeit' (minuten lang so viele wie möglich)
      settings: { modus: 'schrift', art: 'aufgaben', anzahl: 10, minuten: 1, ops: ['+'], raum: 20, einsetzen: false, ton: true },
      sterne: 0,
      rekorde: {},
      verlauf: [],
      spielstand: {},
      tempo: {},                 // persönlicher Schnitt je Aufgabenart: { wert, n }
      online: null,              // Online-Bestenliste, siehe js/online.js
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

  // ---------- Benutzer ----------
  key(id) { return `rechenheld-v1:${id}`; },

  benutzerLaden() {
    let b = null;
    try { b = JSON.parse(localStorage.getItem(this.BENUTZER)); } catch (e) { b = null; }
    this.benutzer = b && Array.isArray(b.liste) ? b : { liste: [], aktiv: null };
    return this.benutzer.liste;
  },

  benutzerSpeichern() {
    try { localStorage.setItem(this.BENUTZER, JSON.stringify(this.benutzer)); } catch (e) { /* privat/voll */ }
  },

  aktiverBenutzer() {
    return this.benutzer.liste.find((u) => u.id === this.benutzer.aktiv) || null;
  },

  // Gibt es noch Daten von vor den Benutzern? Die bekommt der erste neue Benutzer.
  hatAlteDaten() {
    try { return !this.benutzer.liste.length && localStorage.getItem(this.ALT) !== null; } catch (e) { return false; }
  },

  benutzerAnlegen(name, bild) {
    const u = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, bild };
    if (this.hatAlteDaten()) {
      try {
        localStorage.setItem(this.key(u.id), localStorage.getItem(this.ALT));
        localStorage.removeItem(this.ALT);
      } catch (e) { /* dann eben frisch */ }
    }
    this.benutzer.liste.push(u);
    this.benutzerSpeichern();
    return u;
  },

  benutzerLoeschen(id) {
    this.benutzer.liste = this.benutzer.liste.filter((u) => u.id !== id);
    if (this.benutzer.aktiv === id) { this.benutzer.aktiv = null; this.data = null; }
    try { localStorage.removeItem(this.key(id)); } catch (e) { /* egal */ }
    this.benutzerSpeichern();
  },

  // Wählt den Benutzer aus und lädt seine Daten.
  waehlen(id) {
    this.benutzer.aktiv = id;
    this.benutzerSpeichern();
    return this.laden();
  },

  // ---------- Daten des aktiven Benutzers ----------
  laden() {
    const std = this.standard();
    let d = {};
    try { d = JSON.parse(localStorage.getItem(this.key(this.benutzer.aktiv))) || {}; } catch (e) { d = {}; }
    this.data = {
      ...std,
      ...d,
      settings: { ...std.settings, ...(d.settings || {}) },
      eltern: { ...std.eltern, ...(d.eltern || {}) },
      spielstand: { ...(d.spielstand || {}) },
      tempo: { ...(d.tempo || {}) },
    };
    delete this.data.eltern.spielMinuten;
    // alte feste Spielarten
    const st = this.data.settings;
    if (st.art === 'zehn') { st.art = 'aufgaben'; st.anzahl = 10; }
    if (st.art === 'm1' || st.art === 'm5') { st.minuten = st.art === 'm5' ? 5 : 1; st.art = 'zeit'; }
    if (!(this.data.eltern.preis >= 1)) this.data.eltern.preis = 10;
    return this.data;
  },

  // Rekorde aller Spieler auf diesem Gerät für einen Rekord-Schlüssel.
  bestenliste(key) {
    return this.benutzer.liste.map((u) => {
      let r = null;
      try {
        const x = u.id === this.benutzer.aktiv ? this.data : JSON.parse(localStorage.getItem(this.key(u.id)));
        r = x && x.rekorde && x.rekorde[key];
      } catch (e) { r = null; }
      return r ? { benutzer: u, wert: r.wert, datum: r.datum } : null;
    }).filter(Boolean);
  },

  speichern() {
    if (!this.data || !this.benutzer.aktiv) return;
    this.speichernFuer(this.benutzer.aktiv, this.data);
  },

  // Daten eines beliebigen Spielers (der aktive aus dem Speicher, sonst frisch gelesen)
  datenVon(id) {
    if (id === this.benutzer.aktiv && this.data) return this.data;
    if (!this.benutzer.liste.some((u) => u.id === id)) return null;
    try { return JSON.parse(localStorage.getItem(this.key(id))); } catch (e) { return null; }
  },

  speichernFuer(id, data) {
    try { localStorage.setItem(this.key(id), JSON.stringify(data)); } catch (e) { /* privat/voll */ }
  },

  zuruecksetzen() {
    // Die Online-Verbindung bleibt – sonst wäre der Einladungs-Code verloren.
    const online = this.data && this.data.online;
    this.data = this.standard();
    if (online) this.data.online = { ...online, warte: { rekorde: {}, runden: [] } };
    this.speichern();
  },
};
