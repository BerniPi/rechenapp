// Online-Bestenliste: Code einlösen, Rekorde und Runden senden (mit Warteschlange für offline), Weltliste holen.
// Pro Spieler liegt in seinen Daten: online = { server, schluessel, spielerId, name, emoji, gruppe, status, warte: { rekorde, runden } }
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

  async einloesen(server, code, name, emoji) {
    let r;
    try {
      r = await this.anfrage(server, 'POST', 'einloesen', { body: { code, name, emoji } });
    } catch (e) {
      throw new Error('Server nicht erreichbar – Internet und Server-Adresse prüfen.');
    }
    if (r.status !== 200 || !r.j || !r.j.schluessel) throw new Error((r.j && r.j.fehler) || `Fehler ${r.status}`);
    return {
      server, schluessel: r.j.schluessel, spielerId: r.j.spielerId, name: r.j.name, emoji: r.j.emoji, gruppe: r.j.gruppe || null,
      status: 'ok', warte: { rekorde: {}, runden: [] },
    };
  },

  merkeRekord(d, key, wert, datum) {
    if (!d.online || !key) return;
    d.online.warte.rekorde[key] = { wert, datum };
  },

  merkeRunde(d, runde) {
    if (!d.online) return;
    const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    d.online.warte.runden.push({ clientId, ...runde });
    if (d.online.warte.runden.length > 500) d.online.warte.runden.splice(0, d.online.warte.runden.length - 500);
  },

  wartet(d) {
    if (!d.online) return 0;
    return Object.keys(d.online.warte.rekorde).length + d.online.warte.runden.length;
  },

  // Schickt alles, was wartet. Leise: ohne Netz bleibt es einfach liegen.
  async senden(id) {
    if (this.laeuft.has(id)) return;
    this.laeuft.add(id);
    try {
      for (let runde = 0; runde < 20; runde++) {
        const d = this.daten(id);
        const o = d && d.online;
        if (!o || o.status !== 'ok') return;
        const rekorde = Object.entries(o.warte.rekorde).slice(0, 50).map(([key, r]) => ({ key, ...r }));
        const runden = o.warte.runden.slice(0, 50);
        if (!rekorde.length && !runden.length && runde > 0) return;
        let r;
        try {
          r = await this.anfrage(o.server, 'POST', 'sync', { body: { rekorde, runden }, schluessel: o.schluessel });
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
        this.speichern(id, neu);
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
    let r;
    try {
      r = await this.anfrage(o.server, 'PATCH', 'ich', { body: { name, emoji }, schluessel: o.schluessel });
    } catch (e) {
      throw new Error('Server nicht erreichbar.');
    }
    if (r.status !== 200) throw new Error((r.j && r.j.fehler) || `Fehler ${r.status}`);
    o.name = r.j.name;
    o.emoji = r.j.emoji;
  },
};
