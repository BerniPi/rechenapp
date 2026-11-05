// HTTP-Routen und SSE-Verwaltung für den Turniermodus (/api/turnier/*).
const H = require('./hilfe.js');
const Turnier = require('./turnier.js');

// SSE-Verbindungen: Map<TurnierCode, Set<Verbindung>>
// Verbindung: { res, req, rolle, schluessel, teilnehmerId, pingIntervall }
const verbindungen = new Map();
let alleVerbindungenZaehler = 0;
const MAX_VERBINDUNGEN_GESAMT = 2000;
const MAX_VERBINDUNGEN_PRO_SCHLUESSEL = 3;

// SSE-Format: 'event: <name>\ndata: <json>\n\n'
function sseSenden(res, event, daten) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(daten)}\n\n`);
  } catch (e) {
    // Client ggf. getrennt
  }
}

// Nachricht an Verbindungen eines Turniers senden
// filterFn: optional (conn) => boolean
function senden(code, event, daten, filterFn) {
  const pool = verbindungen.get(code);
  if (!pool) return;
  for (const conn of pool) {
    if (!filterFn || filterFn(conn)) {
      sseSenden(conn.res, event, daten);
    }
  }
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

// Server-Timer für Runden und Countdowns: Map<TurnierCode, { countdownTimer, rundenTimer }>
const timerMap = new Map();

function timerLoeschen(code) {
  const tObj = timerMap.get(code);
  if (tObj) {
    if (tObj.countdownTimer) clearTimeout(tObj.countdownTimer);
    if (tObj.rundenTimer) clearTimeout(tObj.rundenTimer);
    timerMap.delete(code);
  }
}

// Rundenende an alle Verbindungen senden
function rundenendeSenden(t, leitungSchluessel) {
  timerLoeschen(t.code);
  let runde;
  try {
    runde = Turnier.rundeBeenden(t, leitungSchluessel);
  } catch (err) {
    return;
  }
  const pool = verbindungen.get(t.code);
  if (pool) {
    for (const c of pool) {
      const payload = {
        phase: t.phase,
        runde: rundeFuerAnzeige(t, c),
        ergebnisse: runde.spiele.map((sp) => ({ id: sp.id, ergebnis: sp.ergebnis })),
        teilnehmer: teilnehmerListe(t),
      };
      if (c.rolle === 'kind') {
        const tn = t.teilnehmer.get(c.teilnehmerId);
        if (tn) {
          const sp = runde.spiele.find((s) => s.teilnehmer.includes(c.teilnehmerId));
          const meinErg = sp && sp.ergebnis && sp.ergebnis.find((e) => e.id === c.teilnehmerId);
          payload.ich = {
            platz: meinErg ? meinErg.platz : null,
            weiter: tn.aktiv,
            richtig: meinErg ? meinErg.richtig : 0,
            falsch: meinErg ? meinErg.falsch : 0,
            zeit: meinErg ? meinErg.zeit : 0,
            turnierPlatz: tn.platz,
          };
        }
      }
      sseSenden(c.res, t.phase === 'ende' ? 'ende' : 'rundenende', payload);
    }
  }
}

// Regelmäßiges Aufräumen inaktiver Turniere und deren Verbindungen
function aufraeumenAlle() {
  const geloescht = Turnier.aufraeumen();
  if (Array.isArray(geloescht)) {
    for (const code of geloescht) {
      timerLoeschen(code);
      const pool = verbindungen.get(code);
      if (pool) {
        for (const conn of pool) {
          try { conn.res.end(); } catch (e) {}
        }
        verbindungen.delete(code);
      }
    }
  }
}
setInterval(aufraeumenAlle, 10 * 60 * 1000).unref();

// Teilnehmer-Liste für die Anzeige vorbereiten
function teilnehmerListe(t) {
  return Array.from(t.teilnehmer.values()).map((tn) => ({
    id: tn.id,
    name: tn.name,
    emoji: tn.emoji,
    verbunden: tn.verbunden,
    aktiv: tn.aktiv,
    punkte: tn.punkte,
    platz: tn.platz,
  }));
}

// Aktuelle Runde für die Anzeige filtern
function rundeFuerAnzeige(t, conn) {
  const runde = t.runden[t.aktuelleRundeNr - 1];
  if (!runde) return null;

  const spiele = runde.spiele.map((sp) => {
    const teilnehmer = sp.teilnehmer.map((id) => {
      const tn = t.teilnehmer.get(id);
      return tn ? { id: tn.id, name: tn.name, emoji: tn.emoji } : { id, name: 'Freilos', emoji: '✨' };
    });

    const basis = {
      id: sp.id,
      freilos: sp.freilos,
      teilnehmer,
      stand: sp.stand || {},
      ergebnis: sp.ergebnis || null,
      typ: sp.typ || null,
      gruppeNr: sp.gruppeNr || null,
    };

    // Kinder im selben Spiel bekommen ihre Aufgaben ohne Lösung
    if (conn && conn.rolle === 'kind' && sp.teilnehmer.includes(conn.teilnehmerId)) {
      basis.meineAufgaben = (sp.aufgaben || []).map(Turnier.aufgabenFuerKind);
    }

    return basis;
  });

  return {
    nr: runde.nr,
    stufe: runde.stufe,
    start: runde.start,
    dauerMs: runde.dauerMs,
    ende: runde.ende,
    spiele,
  };
}

// Zustand für hallo-Ereignis
function zustandFuer(t, conn) {
  const daten = {
    code: t.code,
    titel: t.titel,
    phase: t.phase,
    offen: t.offen,
    countdownBis: t.countdownBis || null,
    einstellungen: t.einstellungen,
    teilnehmer: teilnehmerListe(t),
    runde: rundeFuerAnzeige(t, conn),
    baum: t.baum,
  };

  if (conn.rolle === 'kind') {
    const tn = t.teilnehmer.get(conn.teilnehmerId);
    if (tn) {
      const runde = t.runden[t.aktuelleRundeNr - 1];
      const sp = runde && runde.spiele && runde.spiele.find((s) => s.teilnehmer.includes(conn.teilnehmerId));
      const st = sp && sp.stand && sp.stand[conn.teilnehmerId];
      daten.ich = {
        id: tn.id,
        name: tn.name,
        emoji: tn.emoji,
        aktiv: tn.aktiv,
        platz: tn.platz,
        index: st ? st.index : 0,
        richtig: st ? st.richtig : 0,
        falsch: st ? st.falsch : 0,
        fertig: Boolean(st && st.fertigUm),
      };
    }
  }

  return daten;
}

// SSE-Verbindung einrichten
function sseVerbinden(req, res, t, schluessel) {
  if (alleVerbindungenZaehler >= MAX_VERBINDUNGEN_GESAMT) {
    return H.fehler(res, 503, 'Server ausgelastet (zu viele Live-Verbindungen)');
  }

  // Rolle ermitteln
  let rolle = 'zuschauer';
  let teilnehmerId = null;

  if (schluessel) {
    if (Turnier.istLeitung(t, schluessel)) {
      rolle = 'leitung';
    } else {
      const tn = Turnier.teilnehmerNachSchluessel(t, schluessel);
      if (tn) {
        rolle = 'kind';
        teilnehmerId = tn.id;
        tn.verbunden = true;
      }
    }
  }

  // Begrenzung pro Schlüssel
  let pool = verbindungen.get(t.code);
  if (!pool) {
    pool = new Set();
    verbindungen.set(t.code, pool);
  }

  if (schluessel) {
    let zaehler = 0;
    for (const c of pool) {
      if (c.schluessel === schluessel) zaehler++;
    }
    if (zaehler >= MAX_VERBINDUNGEN_PRO_SCHLUESSEL) {
      return H.fehler(res, 429, 'Zu viele Verbindungen für diesen Schlüssel');
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...H.SICHER,
  });

  const conn = {
    res,
    req,
    rolle,
    schluessel,
    teilnehmerId,
  };

  pool.add(conn);
  alleVerbindungenZaehler++;

  // Erstes Ereignis: hallo
  sseSenden(res, 'hallo', {
    jetzt: Date.now(),
    rolle,
    zustand: zustandFuer(t, conn),
  });

  // Wenn ein Kind verbunden ist, Teilnehmerliste aktualisieren
  if (rolle === 'kind') {
    senden(t.code, 'teilnehmer', teilnehmerListe(t));
  }

  req.on('close', () => {
    pool.delete(conn);
    alleVerbindungenZaehler--;
    if (pool.size === 0) {
      verbindungen.delete(t.code);
    }
    if (rolle === 'kind' && teilnehmerId) {
      // Prüfen, ob noch eine Verbindung für dieses Kind offen ist
      let nochDa = false;
      for (const c of pool) {
        if (c.teilnehmerId === teilnehmerId) {
          nochDa = true;
          break;
        }
      }
      if (!nochDa) {
        const tn = t.teilnehmer.get(teilnehmerId);
        if (tn) {
          tn.verbunden = false;
          senden(t.code, 'teilnehmer', teilnehmerListe(t));
        }
      }
    }
  });
}

// Bearer-Schlüssel aus dem Authorization-Header holen
function schluesselAus(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

// CORS-Header
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

// Haupt-Router für /api/turnier/*
async function anfrage(req, res, url) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const clientIp = H.ip(req);
  const pfad = url.pathname.replace(/\/+$/, ''); // Trailing Slash entfernen
  const teile = pfad.split('/').filter(Boolean); // ['api', 'turnier', ...]

  // POST /api/turnier: Neues Turnier anlegen
  if (req.method === 'POST' && teile.length === 2) {
    if (!H.erlaubt(`turnier_neu:${clientIp}`, 10, 3600e3)) {
      return H.fehler(res, 429, 'Zu viele Turniere angelegt – bitte später wiederholen');
    }
    const b = await H.body(req, 4096);
    if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
    try {
      const ergebnis = Turnier.anlegen(b);
      return H.json(res, 200, {
        code: ergebnis.code,
        leitung: ergebnis.leitung,
      });
    } catch (err) {
      return H.fehler(res, 500, err.message);
    }
  }

  const code = teile[2] ? teile[2].toUpperCase() : null;
  const t = Turnier.finden(code);
  if (!t) {
    return H.fehler(res, 404, 'Turnier nicht gefunden');
  }

  // GET /api/turnier/:code: Kurzinfo
  if (req.method === 'GET' && teile.length === 3) {
    return H.json(res, 200, Turnier.kurzinfo(t));
  }

  // POST /api/turnier/:code/beitreten: Kind tritt bei
  if (req.method === 'POST' && teile.length === 4 && teile[3] === 'beitreten') {
    if (!H.erlaubt(`turnier_beitritt:${clientIp}`, 30, 60e3)) {
      return H.fehler(res, 429, 'Zu viele Beitrittsversuche – bitte kurz warten');
    }
    const b = await H.body(req, 1024);
    if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');

    try {
      const { id, schluessel } = Turnier.beitreten(code, b);
      senden(t.code, 'teilnehmer', teilnehmerListe(t));
      return H.json(res, 200, { id, schluessel });
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  // GET /api/turnier/:code/ereignisse: SSE-Strom
  if (req.method === 'GET' && teile.length === 4 && teile[3] === 'ereignisse') {
    const s = url.searchParams.get('s');
    return sseVerbinden(req, res, t, s);
  }

  // POST /api/turnier/:code/befehl: Leitung steuert
  if (req.method === 'POST' && teile.length === 4 && teile[3] === 'befehl') {
    const schluessel = schluesselAus(req);
    if (!schluessel || !Turnier.istLeitung(t, schluessel)) {
      return H.fehler(res, 403, 'Nicht berechtigt');
    }
    const b = await H.body(req, 2048);
    if (!b || !b.befehl) return H.fehler(res, 400, 'Befehl fehlt');

    try {
      switch (b.befehl) {
        case 'starten': {
          Turnier.starten(t, schluessel);
          // Vorschau an alle senden
          const pool = verbindungen.get(t.code);
          if (pool) {
            for (const c of pool) {
              sseSenden(c.res, 'vorschau', {
                runde: rundeFuerAnzeige(t, c),
                baum: t.baum,
              });
            }
          }
          return H.json(res, 200, { ok: true, phase: t.phase });
        }
        case 'neu_mischen': {
          Turnier.neuMischen(t, schluessel);
          const pool = verbindungen.get(t.code);
          if (pool) {
            for (const c of pool) {
              sseSenden(c.res, 'vorschau', {
                runde: rundeFuerAnzeige(t, c),
                baum: t.baum,
              });
            }
          }
          return H.json(res, 200, { ok: true });
        }
        case 'runde_starten': {
          const { startUm, dauerMs, rundeNr } = Turnier.rundeStarten(t, schluessel);
          // Countdown verschicken
          senden(t.code, 'countdown', { startUm, dauerMs, runde: rundeNr });
          // Aufgaben an die einzelnen Teilnehmer verschicken
          const pool = verbindungen.get(t.code);
          if (pool) {
            const runde = t.runden[t.aktuelleRundeNr - 1];
            for (const c of pool) {
              if (c.rolle === 'kind') {
                const sp = runde.spiele.find((s) => s.teilnehmer.includes(c.teilnehmerId));
                if (sp && !sp.freilos) {
                  sseSenden(c.res, 'aufgaben', {
                    spiel: sp.id,
                    aufgaben: sp.aufgaben.map(Turnier.aufgabenFuerKind),
                  });
                }
              }
            }
          }

          // Timer für Countdown und Rundenende
          timerLoeschen(t.code);
          const cTimer = setTimeout(() => {
            if (t.phase === 'countdown') {
              Turnier.rundeAktivieren(t, Date.now());
            }
          }, Math.max(0, startUm - Date.now()));
          cTimer.unref();

          const rTimer = setTimeout(() => {
            if (t.phase === 'laeuft' || t.phase === 'countdown') {
              rundenendeSenden(t);
            }
          }, Math.max(0, startUm + dauerMs + 2000 - Date.now()));
          rTimer.unref();

          timerMap.set(t.code, { countdownTimer: cTimer, rundenTimer: rTimer });
          return H.json(res, 200, { ok: true, startUm });
        }
        case 'beenden': {
          rundenendeSenden(t, schluessel);
          return H.json(res, 200, { ok: true, phase: t.phase });
        }
        case 'abbrechen': {
          timerLoeschen(t.code);
          Turnier.abbrechen(t, schluessel);
          const pool = verbindungen.get(t.code);
          if (pool) {
            for (const c of pool) {
              sseSenden(c.res, 'vorschau', {
                runde: rundeFuerAnzeige(t, c),
                baum: t.baum,
              });
            }
          }
          return H.json(res, 200, { ok: true, phase: t.phase });
        }
        case 'naechste': {
          Turnier.naechste(t, schluessel);
          const pool = verbindungen.get(t.code);
          if (pool) {
            for (const c of pool) {
              if (t.phase === 'ende') {
                sseSenden(c.res, 'ende', { teilnehmer: teilnehmerListe(t) });
              } else {
                sseSenden(c.res, 'vorschau', {
                  runde: rundeFuerAnzeige(t, c),
                  baum: t.baum,
                });
              }
            }
          }
          return H.json(res, 200, { ok: true, phase: t.phase });
        }
        case 'beitritt': {
          Turnier.beitrittSchliessen(t, schluessel, b.offen);
          senden(t.code, 'beitritt', { offen: t.offen });
          return H.json(res, 200, { ok: true, offen: t.offen });
        }
        case 'entfernen': {
          const tn = Turnier.entfernen(t, schluessel, b.id);
          if (tn) {
            senden(t.code, 'entfernt', { id: b.id }, (c) => c.teilnehmerId === b.id);
            senden(t.code, 'teilnehmer', teilnehmerListe(t));
          }
          return H.json(res, 200, { ok: true });
        }
        case 'neues_turnier': {
          timerLoeschen(t.code);
          Turnier.neuesTurnierGleicheKinder(t, schluessel);
          const pool = verbindungen.get(t.code);
          if (pool) {
            for (const c of pool) {
              sseSenden(c.res, 'hallo', {
                jetzt: Date.now(),
                rolle: c.rolle,
                zustand: zustandFuer(t, c),
              });
            }
          }
          return H.json(res, 200, { ok: true });
        }
        default:
          return H.fehler(res, 400, `Unbekannter Befehl '${b.befehl}'`);
      }
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  // POST /api/turnier/:code/antwort: Kind sendet Antwort
  if (req.method === 'POST' && teile.length === 4 && teile[3] === 'antwort') {
    const schluessel = schluesselAus(req);
    if (!schluessel) return H.fehler(res, 401, 'Schlüssel fehlt');
    const tn = Turnier.teilnehmerNachSchluessel(t, schluessel);
    if (!tn) return H.fehler(res, 401, 'Teilnehmer nicht gefunden');

    if (!H.erlaubt(`turnier_antw:${tn.id}`, 10, 1000)) {
      return H.fehler(res, 429, 'Zu viele Antworten – bitte nicht spammen');
    }

    const b = await H.body(req, 1024);
    if (!b || b.spiel === undefined || b.index === undefined || b.wert === undefined) {
      return H.fehler(res, 400, 'Ungültige Antwortdaten');
    }

    try {
      const ergebnis = Turnier.antworten(t, schluessel, b);

      // Fortschritt an Leitung, Zuschauer und Gegner im selben Spiel senden
      if (!ergebnis.ignoriert) {
        const runde = t.runden[t.aktuelleRundeNr - 1];
        const spiel = runde && runde.spiele.find((sp) => sp.id === b.spiel);
        if (spiel) {
          const st = spiel.stand[tn.id];
          const fortschrittPayload = {
            spiel: b.spiel,
            id: tn.id,
            index: st ? st.index : ergebnis.index,
            richtig: st ? st.richtig : 0,
            falsch: st ? st.falsch : 0,
            fertig: Boolean(st && st.fertigUm),
          };

          senden(t.code, 'fortschritt', fortschrittPayload, (c) => (
            c.rolle === 'leitung' || c.rolle === 'zuschauer' || spiel.teilnehmer.includes(c.teilnehmerId)
          ));
        }

        // Falls die Runde durch diese Antwort beendet wurde
        if (t.phase === 'auswertung' || t.phase === 'ende') {
          timerLoeschen(t.code);
          const pool = verbindungen.get(t.code);
          if (pool) {
            for (const c of pool) {
              const payload = {
                phase: t.phase,
                runde: rundeFuerAnzeige(t, c),
                ergebnisse: runde.spiele.map((sp) => ({ id: sp.id, ergebnis: sp.ergebnis })),
                teilnehmer: teilnehmerListe(t),
              };
              if (c.rolle === 'kind') {
                const kindTn = t.teilnehmer.get(c.teilnehmerId);
                if (kindTn) {
                  const sp = runde.spiele.find((s) => s.teilnehmer.includes(c.teilnehmerId));
                  const meinErg = sp && sp.ergebnis && sp.ergebnis.find((e) => e.id === c.teilnehmerId);
                  payload.ich = {
                    platz: meinErg ? meinErg.platz : null,
                    weiter: kindTn.aktiv,
                    richtig: meinErg ? meinErg.richtig : 0,
                    falsch: meinErg ? meinErg.falsch : 0,
                    zeit: meinErg ? meinErg.zeit : 0,
                    turnierPlatz: kindTn.platz,
                  };
                }
              }
              sseSenden(c.res, t.phase === 'ende' ? 'ende' : 'rundenende', payload);
            }
          }
        }
      }

      return H.json(res, 200, ergebnis);
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  // POST /api/turnier/:code/verlassen: Kind verlässt Turnier
  if (req.method === 'POST' && teile.length === 4 && teile[3] === 'verlassen') {
    const schluessel = schluesselAus(req);
    if (!schluessel) return H.fehler(res, 401, 'Schlüssel fehlt');
    try {
      const ergebnis = Turnier.verlassen(code, schluessel);
      senden(t.code, 'teilnehmer', teilnehmerListe(t));
      return H.json(res, 200, ergebnis);
    } catch (err) {
      return H.fehler(res, err.status || 400, err.message);
    }
  }

  return H.fehler(res, 404, 'Unbekannte Turnier-Route');
}

module.exports = {
  anfrage,
  senden,
  verbindungen,
};
