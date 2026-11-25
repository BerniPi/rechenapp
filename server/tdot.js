// Tag der offenen Tür: Stationen und Highscorelisten in SQLite (ohne HTTP).
const crypto = require('node:crypto');
const H = require('./hilfe.js');
const Aufgaben = require('../js/aufgaben.js');

const ZEICHEN_CODE = H.ZEICHEN || '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// Legt die Tabellen für den Tag der offenen Tür an (idempotent).
function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tdot_stationen (
      code TEXT PRIMARY KEY,
      leitung_hash TEXT NOT NULL,
      titel TEXT NOT NULL,
      aktiv INTEGER NOT NULL DEFAULT 1,
      modus TEXT NOT NULL,
      art TEXT NOT NULL,
      anzahl INTEGER NOT NULL,
      minuten INTEGER NOT NULL,
      uebungen TEXT NOT NULL,
      einsetzen INTEGER NOT NULL DEFAULT 0,
      strafe INTEGER NOT NULL DEFAULT 3,
      erstellt INTEGER NOT NULL,
      aktualisiert INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tdot_ergebnisse (
      id INTEGER PRIMARY KEY,
      station_code TEXT NOT NULL REFERENCES tdot_stationen(code) ON DELETE CASCADE,
      teilnehmer_key TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      wert INTEGER NOT NULL,
      zeit_ms INTEGER NOT NULL,
      richtig INTEGER NOT NULL,
      falsch INTEGER NOT NULL,
      versuche INTEGER NOT NULL DEFAULT 1,
      datum INTEGER NOT NULL,
      UNIQUE (station_code, teilnehmer_key)
    );

    CREATE INDEX IF NOT EXISTS tdot_ergebnisse_station ON tdot_ergebnisse(station_code);
  `);
}

function einstellungenNormalisieren(e = {}) {
  const modus = e.modus === 'sprache' ? 'sprache' : 'schrift';
  const art = e.art === 'zeit' ? 'zeit' : 'aufgaben';
  const rohAnzahl = Number(e.anzahl);
  const anzahl = Number.isFinite(rohAnzahl)
    ? Math.min(50, Math.max(5, Math.round(rohAnzahl / 5) * 5))
    : 10;
  const rohMinuten = Number(e.minuten);
  const minuten = Number.isFinite(rohMinuten)
    ? Math.min(10, Math.max(1, Math.round(rohMinuten)))
    : 1;
  const gewaehlt = Array.isArray(e.uebungen)
    ? e.uebungen.filter((id) => Aufgaben.NACH_ID[id])
    : [];
  const uebungen = Aufgaben.uebungenTeil(gewaehlt.length ? gewaehlt : ['plus10']).split(',');
  const einsetzen = Boolean(e.einsetzen);
  const rohStrafe = Number(e.strafe);
  const strafe = Number.isFinite(rohStrafe)
    ? Math.min(30, Math.max(0, Math.round(rohStrafe)))
    : 3;

  return { modus, art, anzahl, minuten, uebungen, einsetzen, strafe };
}

function titelBereinigen(t) {
  const s = String(t || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
  return s || 'Tag der offenen Tür';
}

function istBesser(art, neuWert, neuFalsch, altWert, altFalsch) {
  if (art === 'zeit') {
    return neuWert > altWert || (neuWert === altWert && neuFalsch < altFalsch);
  }
  return neuWert < altWert || (neuWert === altWert && neuFalsch < altFalsch);
}

function fehlerMitStatus(status, meldung) {
  const err = new Error(meldung);
  err.status = status;
  return err;
}

function oeffentlich(row) {
  if (!row) return null;
  return {
    code: row.code,
    titel: row.titel,
    aktiv: Boolean(row.aktiv),
    einstellungen: {
      modus: row.modus,
      art: row.art,
      anzahl: row.anzahl,
      minuten: row.minuten,
      uebungen: String(row.uebungen || 'plus10').split(',').filter((id) => Aufgaben.NACH_ID[id]),
      einsetzen: Boolean(row.einsetzen),
      strafe: row.strafe,
    },
    erstellt: row.erstellt,
    aktualisiert: row.aktualisiert,
  };
}

function erstelleDienst(database, tx) {
  initSchema(database);

  const q = {
    codeExistiert: database.prepare('SELECT 1 FROM tdot_stationen WHERE code = ?'),
    stationNeu: database.prepare(`INSERT INTO tdot_stationen
      (code, leitung_hash, titel, aktiv, modus, art, anzahl, minuten, uebungen, einsetzen, strafe, erstellt, aktualisiert)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    stationHolen: database.prepare('SELECT * FROM tdot_stationen WHERE code = ?'),
    leitungHolen: database.prepare('SELECT leitung_hash FROM tdot_stationen WHERE code = ?'),
    stationUpdate: database.prepare(`UPDATE tdot_stationen
      SET titel = ?, aktiv = ?, modus = ?, art = ?, anzahl = ?, minuten = ?, uebungen = ?, einsetzen = ?, strafe = ?, aktualisiert = ?
      WHERE code = ?`),
    stationLoeschen: database.prepare('DELETE FROM tdot_stationen WHERE code = ?'),
    listeAufgaben: database.prepare(`SELECT id, teilnehmer_key, name, emoji, wert, zeit_ms, richtig, falsch, versuche, datum
      FROM tdot_ergebnisse WHERE station_code = ? ORDER BY wert ASC, falsch ASC, datum ASC, id ASC`),
    listeZeit: database.prepare(`SELECT id, teilnehmer_key, name, emoji, wert, zeit_ms, richtig, falsch, versuche, datum
      FROM tdot_ergebnisse WHERE station_code = ? ORDER BY wert DESC, falsch ASC, datum ASC, id ASC`),
    eintragHolen: database.prepare('SELECT * FROM tdot_ergebnisse WHERE station_code = ? AND teilnehmer_key = ?'),
    eintragNeu: database.prepare(`INSERT INTO tdot_ergebnisse
      (station_code, teilnehmer_key, name, emoji, wert, zeit_ms, richtig, falsch, versuche, datum)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`),
    eintragBesser: database.prepare(`UPDATE tdot_ergebnisse
      SET name = ?, emoji = ?, wert = ?, zeit_ms = ?, richtig = ?, falsch = ?, versuche = versuche + 1, datum = ?
      WHERE id = ?`),
    eintragVersuch: database.prepare('UPDATE tdot_ergebnisse SET versuche = versuche + 1 WHERE id = ?'),
    eintragLoeschen: database.prepare('DELETE FROM tdot_ergebnisse WHERE id = ? AND station_code = ?'),
    listeLeeren: database.prepare('DELETE FROM tdot_ergebnisse WHERE station_code = ?'),
  };

  function codeErzeugen() {
    for (let i = 0; i < 1000; i++) {
      const bytes = crypto.randomBytes(4);
      let code = '';
      for (let j = 0; j < 4; j++) {
        code += ZEICHEN_CODE[bytes[j] % ZEICHEN_CODE.length];
      }
      if (!q.codeExistiert.get(code)) return code;
    }
    throw new Error('Kein freier Code verfügbar');
  }

  function finden(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return null;
    return oeffentlich(q.stationHolen.get(c));
  }

  function istLeitung(code, schluessel) {
    if (!schluessel || typeof schluessel !== 'string') return false;
    const c = String(code || '').trim().toUpperCase();
    const row = q.leitungHolen.get(c);
    if (!row) return false;
    return H.gleich(H.sha(schluessel), row.leitung_hash);
  }

  function leitungPruefen(code, schluessel) {
    const c = String(code || '').trim().toUpperCase();
    const row = q.stationHolen.get(c);
    if (!row) throw fehlerMitStatus(404, 'Station nicht gefunden');
    if (!schluessel || typeof schluessel !== 'string' || !H.gleich(H.sha(schluessel), row.leitung_hash)) {
      throw fehlerMitStatus(403, 'Nicht berechtigt');
    }
    return row;
  }

  function alleSortiert(code, art) {
    const rows = (art === 'zeit' ? q.listeZeit : q.listeAufgaben).all(code);
    let rundenGesamt = 0;
    const liste = rows.map((r, i) => {
      rundenGesamt += r.versuche;
      return {
        id: r.id,
        platz: i + 1,
        teilnehmerKey: r.teilnehmer_key,
        name: r.name,
        emoji: r.emoji,
        wert: r.wert,
        zeitMs: r.zeit_ms,
        richtig: r.richtig,
        falsch: r.falsch,
        versuche: r.versuche,
        datum: r.datum,
      };
    });
    return { liste, rundenGesamt };
  }

  function oeffentlicheZeile(x) {
    return {
      id: x.id,
      platz: x.platz,
      name: x.name,
      emoji: x.emoji,
      wert: x.wert,
      zeitMs: x.zeitMs,
      richtig: x.richtig,
      falsch: x.falsch,
      versuche: x.versuche,
      datum: x.datum,
    };
  }

  function bestenliste(code, limit = 100) {
    const c = String(code || '').trim().toUpperCase();
    const st = finden(c);
    if (!st) return null;
    const { liste, rundenGesamt } = alleSortiert(c, st.einstellungen.art);
    return {
      liste: liste.slice(0, limit).map(oeffentlicheZeile),
      gesamt: liste.length,
      rundenGesamt,
    };
  }

  function anlegen({ titel, einstellungen } = {}) {
    const code = codeErzeugen();
    const leitung = H.neuerSchluessel();
    const e = einstellungenNormalisieren(einstellungen);
    const jetzt = Date.now();
    const sauberTitel = titelBereinigen(titel);
    q.stationNeu.run(
      code,
      H.sha(leitung),
      sauberTitel,
      e.modus,
      e.art,
      e.anzahl,
      e.minuten,
      Aufgaben.uebungenTeil(e.uebungen),
      e.einsetzen ? 1 : 0,
      e.strafe,
      jetzt,
      jetzt,
    );
    return { code, leitung, station: finden(code) };
  }

  function ergebnisEintragen(code, daten = {}) {
    const c = String(code || '').trim().toUpperCase();
    const st = finden(c);
    if (!st) throw fehlerMitStatus(404, 'Station nicht gefunden');
    if (!st.aktiv) throw fehlerMitStatus(403, 'Diese Station ist gerade pausiert');

    const name = H.name(daten.name);
    if (!name) throw fehlerMitStatus(400, 'Spitzname: 1–16 Buchstaben oder Ziffern');
    const emoji = H.emoji(daten.emoji) || H.EMOJIS[0];

    const richtig = Number(daten.richtig);
    const falsch = Number(daten.falsch);
    const rohZeitMs = Number(daten.zeitMs);
    if (!Number.isInteger(richtig) || !Number.isInteger(falsch) || richtig < 0 || falsch < 0) {
      throw fehlerMitStatus(400, 'Ungültige Aufgabenwerte');
    }

    const e = st.einstellungen;
    let zeitMs = 0;
    let wert = 0;

    if (e.art === 'aufgaben') {
      if (richtig + falsch !== e.anzahl) {
        throw fehlerMitStatus(400, 'Aufgabenanzahl stimmt nicht');
      }
      const minZeit = Math.max(1000, e.anzahl * 200);
      if (!Number.isInteger(rohZeitMs) || rohZeitMs < minZeit || rohZeitMs > 3600000) {
        throw fehlerMitStatus(400, 'Ungültige Zeit');
      }
      zeitMs = rohZeitMs;
      if (richtig < Math.ceil(e.anzahl / 2)) {
        const bl = bestenliste(c, 20);
        return {
          gewertet: false,
          grund: 'Mindestens die Hälfte muss richtig sein, damit dein Ergebnis zählt.',
          meinErgebnis: { wert: zeitMs + falsch * e.strafe * 1000, zeitMs, richtig, falsch },
          top: bl.liste.slice(0, 5),
          liste: bl.liste,
          gesamt: bl.gesamt,
          rundenGesamt: bl.rundenGesamt,
        };
      }
      wert = zeitMs + falsch * e.strafe * 1000;
    } else {
      const maxAufgaben = e.minuten * 120;
      if (richtig > maxAufgaben || falsch > maxAufgaben) {
        throw fehlerMitStatus(400, 'Ungültige Punktezahl');
      }
      wert = richtig - Math.floor(falsch / 4);
      zeitMs = e.minuten * 60 * 1000;
      if (wert <= 0) {
        const bl = bestenliste(c, 20);
        return {
          gewertet: false,
          grund: 'Noch kein Punkt erreicht – probier es nochmal!',
          meinErgebnis: { wert, zeitMs, richtig, falsch },
          top: bl.liste.slice(0, 5),
          liste: bl.liste,
          gesamt: bl.gesamt,
          rundenGesamt: bl.rundenGesamt,
        };
      }
    }

    const key = name.toLowerCase();
    const jetzt = Date.now();
    let neu = false;
    let verbessert = false;

    tx(() => {
      const alt = q.eintragHolen.get(c, key);
      if (!alt) {
        q.eintragNeu.run(c, key, name, emoji, wert, zeitMs, richtig, falsch, jetzt);
        neu = true;
        verbessert = true;
      } else if (istBesser(e.art, wert, falsch, alt.wert, alt.falsch)) {
        q.eintragBesser.run(name, emoji, wert, zeitMs, richtig, falsch, jetzt, alt.id);
        verbessert = true;
      } else {
        q.eintragVersuch.run(alt.id);
      }
    });

    const { liste: voll, rundenGesamt } = alleSortiert(c, e.art);
    const mein = voll.find((x) => x.teilnehmerKey === key);
    const liste = voll.slice(0, 100).map(oeffentlicheZeile);
    const ich = mein ? oeffentlicheZeile(mein) : null;

    return {
      gewertet: true,
      neu,
      verbessert,
      eintrag: ich,
      meinErgebnis: { wert, zeitMs, richtig, falsch },
      besterWert: ich ? ich.wert : wert,
      platz: ich ? ich.platz : null,
      gesamt: voll.length,
      rundenGesamt,
      top: liste.slice(0, 5),
      liste,
    };
  }

  function aktualisieren(code, schluessel, daten = {}) {
    const c = String(code || '').trim().toUpperCase();
    const row = leitungPruefen(c, schluessel);
    const bisher = oeffentlich(row);
    const titel = daten.titel !== undefined ? titelBereinigen(daten.titel) : bisher.titel;
    const aktiv = daten.aktiv !== undefined ? (daten.aktiv ? 1 : 0) : row.aktiv;
    const e = daten.einstellungen !== undefined
      ? einstellungenNormalisieren(daten.einstellungen)
      : bisher.einstellungen;

    tx(() => {
      q.stationUpdate.run(
        titel,
        aktiv,
        e.modus,
        e.art,
        e.anzahl,
        e.minuten,
        Aufgaben.uebungenTeil(e.uebungen),
        e.einsetzen ? 1 : 0,
        e.strafe,
        Date.now(),
        c,
      );
      if (daten.listeLeeren === true) {
        q.listeLeeren.run(c);
      }
    });

    const bl = bestenliste(c);
    return { station: finden(c), ...bl };
  }

  function eintragLoeschen(code, schluessel, eintragId) {
    const c = String(code || '').trim().toUpperCase();
    leitungPruefen(c, schluessel);
    const id = Number(eintragId);
    if (!Number.isInteger(id) || id <= 0) throw fehlerMitStatus(400, 'Ungültige Eintrags-ID');
    const info = q.eintragLoeschen.run(id, c);
    return { geloescht: info.changes === 1, ...bestenliste(c) };
  }

  function listeLeeren(code, schluessel) {
    const c = String(code || '').trim().toUpperCase();
    leitungPruefen(c, schluessel);
    const info = q.listeLeeren.run(c);
    return { geloescht: info.changes, ...bestenliste(c) };
  }

  function stationLoeschen(code, schluessel) {
    const c = String(code || '').trim().toUpperCase();
    leitungPruefen(c, schluessel);
    const info = q.stationLoeschen.run(c);
    return { ok: info.changes === 1 };
  }

  return {
    anlegen,
    finden,
    istLeitung,
    bestenliste,
    ergebnisEintragen,
    aktualisieren,
    eintragLoeschen,
    listeLeeren,
    stationLoeschen,
  };
}

module.exports = {
  initSchema,
  erstelleDienst,
  einstellungenNormalisieren,
  istBesser,
};
