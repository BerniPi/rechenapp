// SQLite-Datenbank (eingebautes node:sqlite). Liegt im Ordner DATEN (Docker-Volume).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ordner = process.env.DATEN || path.join(__dirname, 'daten');
fs.mkdirSync(ordner, { recursive: true });
const db = new DatabaseSync(path.join(ordner, 'rechenheld.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- Gruppen, z. B. Klassen 1a, 1b – haben eine eigene Bestenliste
  CREATE TABLE IF NOT EXISTS gruppen (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    erstellt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS spieler (
    id TEXT PRIMARY KEY,
    schluessel_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    gesperrt INTEGER NOT NULL DEFAULT 0,
    erstellt INTEGER NOT NULL
  );

  -- Einmal-Codes: nur der Hash wird gespeichert, „ende" = letzte 4 Zeichen zum Wiedererkennen
  CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    ende TEXT NOT NULL,
    notiz TEXT NOT NULL DEFAULT '',
    erstellt INTEGER NOT NULL,
    used_at INTEGER,
    widerrufen INTEGER NOT NULL DEFAULT 0,
    spieler_id TEXT REFERENCES spieler(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS rekorde (
    spieler_id TEXT NOT NULL REFERENCES spieler(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    wert INTEGER NOT NULL,
    datum INTEGER NOT NULL,
    PRIMARY KEY (spieler_id, key)
  );
  CREATE INDEX IF NOT EXISTS rekorde_key ON rekorde(key, wert);

  -- Zusammenfassung jeder Rechenrunde bzw. jedes Minispiels (für die Aktivität im Admin-Bereich)
  CREATE TABLE IF NOT EXISTS runden (
    id INTEGER PRIMARY KEY,
    spieler_id TEXT NOT NULL REFERENCES spieler(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    datum INTEGER NOT NULL,
    typ TEXT NOT NULL,
    modus TEXT, art TEXT, laenge INTEGER, ops TEXT, raum INTEGER, einsetzen INTEGER,
    richtig INTEGER, falsch INTEGER, zeit INTEGER, sterne INTEGER,
    spiel TEXT,
    UNIQUE (spieler_id, client_id)
  );
  CREATE INDEX IF NOT EXISTS runden_spieler ON runden(spieler_id, datum);
`);

// Spalten, die später dazugekommen sind
function spalte(tabelle, name, def) {
  if (!db.prepare(`PRAGMA table_info(${tabelle})`).all().some((s) => s.name === name)) db.exec(`ALTER TABLE ${tabelle} ADD COLUMN ${name} ${def}`);
}
spalte('spieler', 'gruppe_id', 'INTEGER REFERENCES gruppen(id) ON DELETE SET NULL');
spalte('codes', 'gruppe_id', 'INTEGER REFERENCES gruppen(id) ON DELETE SET NULL');

// Mehrere Schritte als eine Einheit
function transaktion(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, transaktion };
