// HTTP-Routen und SSE-Verwaltung für den Tag der offenen Tür (/api/tdot/*).
const H = require('./hilfe.js');
const { db, transaktion } = require('./db');
const Tdot = require('./tdot.js');

const tdot = Tdot.erstelleDienst(db, transaktion);

// SSE-Verbindungen: Map<StationCode, Set<{ res, req, rolle }>>
const verbindungen = new Map();
let alleVerbindungenZaehler = 0;
const MAX_VERBINDUNGEN_GESAMT = 1000;

function sseSenden(res, event, daten) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(daten)}\n\n`);
  } catch (e) {
    // Client ggf. getrennt
  }
}

function senden(code, event, daten) {
  const pool = verbindungen.get(code);
  if (!pool) return;
  for (const conn of pool) {
    sseSenden(conn.res, event, daten);
  }
}

function alleSchliessen(code) {
  const pool = verbindungen.get(code);
  if (!pool) return;
  for (const conn of pool) {
    try { conn.res.end(); } catch (e) {}
  }
  alleVerbindungenZaehler = Math.max(0, alleVerbindungenZaehler - pool.size);
  verbindungen.delete(code);
}

// Keep-Alive Ping alle 20 Sekunden an alle offenen SSE-Streams
setInterval(() => {
  for (const pool of verbindungen.values()) {
    for (const conn of pool) {
      try {
        conn.res.write(': keepalive\n\n');
      } catch (e) {
        // Ignorieren
      }
    }
  }
}, 20000).unref();

function schluesselAus(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function sseVerbinden(req, res, station, schluessel) {
  if (alleVerbindungenZaehler >= MAX_VERBINDUNGEN_GESAMT) {
    return H.fehler(res, 503, 'Server ausgelastet (zu viele Live-Verbindungen)');
  }
  const rolle = schluessel && tdot.istLeitung(station.code, schluessel) ? 'leitung' : 'zuschauer';

  let pool = verbindungen.get(station.code);
  if (!pool) {
    pool = new Set();
    verbindungen.set(station.code, pool);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...H.SICHER,
  });

  const conn = { res, req, rolle };
  pool.add(conn);
  alleVerbindungenZaehler++;

  const bl = tdot.bestenliste(station.code);
  sseSenden(res, 'hallo', {
    rolle,
    station,
    liste: bl ? bl.liste : [],
    gesamt: bl ? bl.gesamt : 0,
    rundenGesamt: bl ? bl.rundenGesamt : 0,
  });

  req.on('close', () => {
    if (pool.delete(conn)) {
      alleVerbindungenZaehler = Math.max(0, alleVerbindungenZaehler - 1);
    }
    if (pool.size === 0) {
      verbindungen.delete(station.code);
    }
  });
}

async function anfrage(req, res, url) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const clientIp = H.ip(req);
  const pfad = url.pathname.replace(/\/+$/, '');
  const teile = pfad.split('/').filter(Boolean); // ['api', 'tdot', ...]

  // POST /api/tdot: Neue Station anlegen
  if (req.method === 'POST' && teile.length === 2) {
    if (!H.erlaubt(`tdot_neu:${clientIp}`, 20, 3600e3)) {
      return H.fehler(res, 429, 'Zu viele Stationen angelegt – bitte später wiederholen');
    }
    const b = await H.body(req, 4096);
    if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
    try {
      const ergebnis = tdot.anlegen(b);
      return H.json(res, 200, ergebnis);
    } catch (err) {
      return H.fehler(res, err.status || 500, err.message);
    }
  }

  const code = teile[2] ? teile[2].toUpperCase() : null;
  const station = code ? tdot.finden(code) : null;
  if (!station) {
    return H.fehler(res, 404, 'Station nicht gefunden');
  }

  // GET /api/tdot/:code: Station + Highscoreliste
  if (req.method === 'GET' && teile.length === 3) {
    const bl = tdot.bestenliste(code);
    return H.json(res, 200, { station, ...bl });
  }

  // GET /api/tdot/:code/ereignisse: SSE-Strom für Beamer
  if (req.method === 'GET' && teile.length === 4 && teile[3] === 'ereignisse') {
    const s = url.searchParams.get('s');
    return sseVerbinden(req, res, station, s);
  }

  // POST /api/tdot/:code/ergebnis: Schülerin/Schüler meldet abgeschlossene Runde
  if (req.method === 'POST' && teile.length === 4 && teile[3] === 'ergebnis') {
    // Schul-WLANs teilen sich oft eine IP – deshalb pro IP großzügig und zusätzlich pro Name begrenzen
    if (!H.erlaubt(`tdot_erg_ip:${clientIp}`, 300, 60e3)) {
      return H.fehler(res, 429, 'Zu viele Anfragen – bitte kurz warten');
    }
    const b = await H.body(req, 2048);
    if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
    const name = H.name(b.name);
    if (!name) return H.fehler(res, 400, 'Spitzname: 1–16 Buchstaben oder Ziffern');
    if (!H.erlaubt(`tdot_erg_name:${code}:${name.toLowerCase()}`, 10, 60e3)) {
      return H.fehler(res, 429, 'Bitte kurz warten vor der nächsten Runde');
    }

    try {
      const erg = tdot.ergebnisEintragen(code, b);
      if (erg.gewertet) {
        senden(code, 'update', {
          liste: erg.liste,
          gesamt: erg.gesamt,
          rundenGesamt: erg.rundenGesamt,
          neu: {
            id: erg.eintrag.id,
            name: erg.eintrag.name,
            emoji: erg.eintrag.emoji,
            platz: erg.platz,
            wert: erg.besterWert,
            verbessert: erg.verbessert,
            neu: erg.neu,
          },
        });
      }
      return H.json(res, 200, {
        gewertet: erg.gewertet,
        grund: erg.grund || null,
        neu: Boolean(erg.neu),
        verbessert: Boolean(erg.verbessert),
        meinErgebnis: erg.meinErgebnis,
        besterWert: erg.besterWert ?? null,
        platz: erg.platz ?? null,
        gesamt: erg.gesamt,
        top: erg.top,
        ich: erg.eintrag || null,
      });
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  // PATCH /api/tdot/:code: Einstellungen, Pause/Aktiv, optional Liste leeren
  if (req.method === 'PATCH' && teile.length === 3) {
    const schluessel = schluesselAus(req);
    const b = await H.body(req, 4096);
    if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
    try {
      const erg = tdot.aktualisieren(code, schluessel, b);
      senden(code, 'station', erg);
      return H.json(res, 200, erg);
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  // DELETE /api/tdot/:code/eintraege/:id: einzelnen Eintrag entfernen
  if (req.method === 'DELETE' && teile.length === 5 && teile[3] === 'eintraege') {
    const schluessel = schluesselAus(req);
    try {
      const erg = tdot.eintragLoeschen(code, schluessel, teile[4]);
      senden(code, 'update', {
        liste: erg.liste,
        gesamt: erg.gesamt,
        rundenGesamt: erg.rundenGesamt,
      });
      return H.json(res, 200, { ok: true, ...erg });
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  // DELETE /api/tdot/:code/eintraege: komplette Highscoreliste leeren
  if (req.method === 'DELETE' && teile.length === 4 && teile[3] === 'eintraege') {
    const schluessel = schluesselAus(req);
    try {
      const erg = tdot.listeLeeren(code, schluessel);
      senden(code, 'update', {
        liste: erg.liste,
        gesamt: erg.gesamt,
        rundenGesamt: erg.rundenGesamt,
      });
      return H.json(res, 200, { ok: true, ...erg });
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  // DELETE /api/tdot/:code: Station beenden & löschen
  if (req.method === 'DELETE' && teile.length === 3) {
    const schluessel = schluesselAus(req);
    try {
      const erg = tdot.stationLoeschen(code, schluessel);
      senden(code, 'beendet', { code });
      alleSchliessen(code);
      return H.json(res, 200, erg);
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  return H.fehler(res, 404, 'Unbekannte Route');
}

module.exports = { anfrage };
