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
// Konten (Anmeldung „piazzi" und „bgbb")
spalte('spieler', 'benutzername', 'TEXT');
spalte('spieler', 'pw_hash', 'TEXT');
spalte('spieler', 'email', 'TEXT');
spalte('spieler', 'ms_oid', 'TEXT');

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS spieler_benutzername ON spieler(benutzername COLLATE NOCASE) WHERE benutzername IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS spieler_ms_oid ON spieler(ms_oid) WHERE ms_oid IS NOT NULL;

  -- Ein Schlüssel pro Gerät (ein Konto kann auf mehreren Geräten angemeldet sein)
  CREATE TABLE IF NOT EXISTS schluessel (
    hash TEXT PRIMARY KEY,
    spieler_id TEXT NOT NULL REFERENCES spieler(id) ON DELETE CASCADE,
    erstellt INTEGER NOT NULL,
    zuletzt INTEGER
  );
  CREATE INDEX IF NOT EXISTS schluessel_spieler ON schluessel(spieler_id);

  -- Piazzi: Adressen, mit denen ein Konto angelegt werden darf
  CREATE TABLE IF NOT EXISTS erlaubte_adressen (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    notiz TEXT NOT NULL DEFAULT '',
    erstellt INTEGER NOT NULL
  );

  -- BGBB: Klasse je Benutzername aus der CSV – gilt auch für Schüler:innen, die sich noch nie angemeldet haben
  CREATE TABLE IF NOT EXISTS klassen_zuordnung (
    benutzername TEXT PRIMARY KEY COLLATE NOCASE,
    gruppe_id INTEGER NOT NULL REFERENCES gruppen(id) ON DELETE CASCADE
  );

  -- Sterne als Buchungen (+ verdient, − ausgegeben); Kontostand = Summe. So gibt es zwischen Geräten keine Konflikte.
  CREATE TABLE IF NOT EXISTS sterne_buchungen (
    id INTEGER PRIMARY KEY,
    spieler_id TEXT NOT NULL REFERENCES spieler(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    delta INTEGER NOT NULL,
    datum INTEGER NOT NULL,
    grund TEXT NOT NULL DEFAULT '',
    UNIQUE (spieler_id, client_id)
  );
`);

// Schlüssel aus der Zeit vor den Geräte-Schlüsseln übernehmen (einmalig, danach ändert sich nichts mehr)
db.exec(`INSERT OR IGNORE INTO schluessel (hash, spieler_id, erstellt)
  SELECT schluessel_hash, id, erstellt FROM spieler WHERE schluessel_hash NOT LIKE 'konto:%'`);

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
