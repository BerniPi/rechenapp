// Online-Bestenliste: verbinden (Code, Konto oder Microsoft-Schulkonto), Rekorde, Runden und Sterne senden
// (mit Warteschlange für offline), Rekorde und Sterne anderer Geräte übernehmen, Weltliste holen.
// Pro Spieler liegt in seinen Daten:
//   online = { server, schluessel, spielerId, name, emoji, gruppe, benutzername, status, sterneSync, warte: { rekorde, runden, sterne } }
// Sterne werden als Buchungen (+/−) geschickt; der Kontostand kommt vom Server, damit mehrere Geräte zusammenpassen.
const Online = {
  // Zugriff auf die Daten eines Spielers – auch wenn inzwischen ein anderer gewählt ist.
  daten: (id) => Speicher.datenVon(id),
  speichern: (id, d) => Speicher.speichernFuer(id, d),
  laeuft: new Set(),

  basis(server) {
    // leer = dieselbe Adresse wie die App (Server liefert App + API aus)
    return server ? `${server.replace(/\/+$/, '')}/api/` : new URL('api/', location.href).href;
  },

  async anfrage(server, methode, pfad, { body, schluessel } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const h = {};
      if (body) h['Content-Type'] = 'application/json';
      if (schluessel) h.Authorization = `Bearer ${schluessel}`;
      const r = await fetch(this.basis(server) + pfad, {
        method: methode, headers: h, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal, cache: 'no-store',
      });
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, j };
    } finally {
      clearTimeout(t);
    }
  },

  // Anfrage, deren Fehler dem Kind/den Eltern gezeigt wird
  async muss(server, methode, pfad, opt) {
    let r;
    try {
      r = await this.anfrage(server, methode, pfad, opt);
    } catch (e) {
      throw new Error('Server nicht erreichbar – Internet und Server-Adresse prüfen.');
    }
    if (r.status !== 200 || !r.j) throw new Error((r.j && r.j.fehler) || `Fehler ${r.status}`);
    return r.j;
  },

  // Welche Anmeldung bietet der Server an? → { anmeldung: 'codes'|'piazzi'|'bgbb', domain }
  async info(server) {
    const j = await this.muss(server, 'GET', 'ping');
    return { anmeldung: j.anmeldung || 'codes', domain: j.domain || null };
  },

  // Antwort des Servers → Verbindung. neu = frisches Konto: die Sterne dieses Geräts werden zum Startguthaben.
  verbindung(server, j, neu) {
    return {
      server, schluessel: j.schluessel, spielerId: j.spielerId, name: j.name, emoji: j.emoji, gruppe: j.gruppe || null,
      benutzername: j.benutzername || null, status: 'ok', sterneSync: !neu, warte: { rekorde: {}, runden: [], sterne: [] },
    };
  },

  // Piazzi: alle Konten (Benutzername, Bild) für „Wer rechnet?"
  async konten(server) {
    return (await this.muss(server, 'GET', 'konten')).konten || [];
  },
  async einloesen(server, code, name, emoji) {
    return this.verbindung(server, await this.muss(server, 'POST', 'einloesen', { body: { code, name, emoji } }), true);
  },
  async kontoAnlegen(server, email, benutzername, passwort, emoji) {
    return this.verbindung(server, await this.muss(server, 'POST', 'konto', { body: { email, benutzername, passwort, emoji } }), true);
  },
  // Anmelden auf einem weiteren Gerät: gibt auch Rekorde und Sterne des Kontos zurück
  async anmelden(server, benutzername, passwort) {
    const j = await this.muss(server, 'POST', 'anmelden', { body: { benutzername, passwort } });
    return { verbindung: this.verbindung(server, j, false), j };
  },
  ssoStarten(server) {
    location.href = `${this.basis(server)}sso/start`;
  },
  async ssoEinloesen(server, token) {
    const j = await this.muss(server, 'POST', 'sso/einloesen', { body: { token } });
    return { verbindung: this.verbindung(server, j, j.neu), j };
  },

  // Verbindung an einen Spieler hängen: eigene Rekorde mitschicken, bei einem bestehenden Konto dessen Stand übernehmen
  verbinden(d, verbindung, kontoStand) {
    d.online = verbindung;
    Object.entries(d.rekorde).forEach(([key, r]) => this.merkeRekord(d, key, r.wert, r.datum));
    if (kontoStand) this.uebernehmen(d, kontoStand);
  },

  // Dieses Gerät abmelden (Server leise mitnehmen, lokal immer)
  async abmelden(d) {
    const o = d.online;
    if (o && o.status === 'ok') {
      try { await this.anfrage(o.server, 'DELETE', 'ich', { schluessel: o.schluessel }); } catch (e) { /* egal */ }
    }
    d.online = null;
  },

  async passwortAendern(d, passwortAlt, passwortNeu) {
    const o = d.online;
    await this.muss(o.server, 'PATCH', 'ich', { body: { passwortAlt, passwortNeu }, schluessel: o.schluessel });
  },

  merkeRekord(d, key, wert, datum) {
    if (!d.online || !key) return;
    d.online.warte.rekorde[key] = { wert, datum };
  },

  neueClientId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),

  merkeRunde(d, runde) {
    if (!d.online) return;
    d.online.warte.runden.push({ clientId: this.neueClientId(), ...runde });
    if (d.online.warte.runden.length > 500) d.online.warte.runden.splice(0, d.online.warte.runden.length - 500);
  },

  // Sterne-Buchung: grund 'runde' | 'spiel' | 'eltern' | 'start'
  merkeSterne(d, delta, grund) {
    // Ohne Sterne-Abgleich (alte Verbindung) nimmt die Start-Buchung in senden() den ganzen Stand mit
    if (!d.online || !d.online.sterneSync || !delta) return;
    const w = d.online.warte;
    if (!w.sterne) w.sterne = [];
    w.sterne.push({ clientId: this.neueClientId(), delta, t: Date.now(), grund });
  },

  wartet(d) {
    if (!d.online) return 0;
    const w = d.online.warte;
    return Object.keys(w.rekorde).length + w.runden.length + (w.sterne || []).length;
  },

  // Stand vom Server übernehmen: bessere Rekorde, Sterne = Kontostand + was hier noch nicht gesendet ist
  uebernehmen(d, j) {
    if (!j) return;
    (j.rekorde || []).forEach((r) => {
      const art = r.key.split('|')[1];
      const klein = art === 'zehn' || art === 'a20';
      const alt = d.rekorde[r.key];
      if (!alt || (klein ? r.wert < alt.wert : r.wert > alt.wert)) d.rekorde[r.key] = { wert: r.wert, datum: r.datum };
    });
    if (Number.isInteger(j.sterne) && d.online && d.online.sterneSync) {
      const offen = (d.online.warte.sterne || []).reduce((s, b) => s + b.delta, 0);
      d.sterne = Math.max(0, j.sterne + offen);
    }
  },

  // Schickt alles, was wartet. Leise: ohne Netz bleibt es einfach liegen.
  // Danach wird beiAenderung(id) aufgerufen – Sterne/Rekorde können sich durch andere Geräte geändert haben.
  beiAenderung: null,
  async senden(id) {
    if (this.laeuft.has(id)) return;
    this.laeuft.add(id);
    try {
      for (let runde = 0; runde < 20; runde++) {
        const d = this.daten(id);
        const o = d && d.online;
        if (!o || o.status !== 'ok') return;
        if (!o.warte.sterne) o.warte.sterne = [];
        // Verbindung aus der Zeit vor dem Sterne-Abgleich: der jetzige Stand wird zum Startguthaben
        if (!o.sterneSync) {
          o.sterneSync = true;
          this.merkeSterne(d, d.sterne, 'start');
          this.speichern(id, d);
        }
        const rekorde = Object.entries(o.warte.rekorde).slice(0, 50).map(([key, r]) => ({ key, ...r }));
        const runden = o.warte.runden.slice(0, 50);
        const sterne = o.warte.sterne.slice(0, 100);
        if (!rekorde.length && !runden.length && !sterne.length && runde > 0) return;
        let r;
        try {
          r = await this.anfrage(o.server, 'POST', 'sync', { body: { rekorde, runden, sterne }, schluessel: o.schluessel });
        } catch (e) { return; }
        // frisch holen: währenddessen kann gespielt oder gewechselt worden sein
        const neu = this.daten(id);
        if (!neu || !neu.online || neu.online.schluessel !== o.schluessel) return;
        if (r.status === 401 || r.status === 403) {
          neu.online.status = r.status === 403 ? 'gesperrt' : 'ungueltig';
          this.speichern(id, neu);
          return;
        }
        if (r.status !== 200) return;
        // Name und Gruppe kann der Admin geändert haben
        if (r.j) Object.assign(neu.online, { name: r.j.name || neu.online.name, emoji: r.j.emoji || neu.online.emoji, gruppe: r.j.gruppe || null });
        const w = neu.online.warte;
        rekorde.forEach((x) => { if (w.rekorde[x.key] && w.rekorde[x.key].datum === x.datum) delete w.rekorde[x.key]; });
        const weg = new Set(runden.map((x) => x.clientId));
        w.runden = w.runden.filter((x) => !weg.has(x.clientId));
        const wegS = new Set(sterne.map((x) => x.clientId));
        w.sterne = (w.sterne || []).filter((x) => !wegS.has(x.clientId));
        this.uebernehmen(neu, r.j);
        this.speichern(id, neu);
        if (this.beiAenderung) this.beiAenderung(id);
      }
    } finally {
      this.laeuft.delete(id);
    }
  },

  // Bestenliste für einen Rekord-Schlüssel – bereich 'welt' oder 'gruppe'; null = gerade nicht erreichbar
  async liste(d, key, bereich = 'welt') {
    const o = d.online;
    if (!o || o.status !== 'ok') return null;
    try {
      const r = await this.anfrage(o.server, 'GET', `liste?key=${encodeURIComponent(key)}&bereich=${bereich}`, { schluessel: o.schluessel });
      return r.status === 200 ? r.j : null;
    } catch (e) { return null; }
  },

  async aendern(d, name, emoji) {
    const o = d.online;
    const j = await this.muss(o.server, 'PATCH', 'ich', { body: { name, emoji }, schluessel: o.schluessel });
    o.name = j.name;
    o.emoji = j.emoji;
  },
};
