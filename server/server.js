// Rechenheld-Server: globale Bestenliste, Aktivität und Admin-Seite. Liefert auf Wunsch auch die App selbst aus.
//   PORT             (8080)
//   DATEN            Ordner für rechenheld.db
//   ADMIN_PASSWORT   Passwort für /admin (ohne → Admin-Seite aus)
//   ERLAUBTE_ORIGIN  z. B. https://name.github.io – falls die App woanders liegt (mehrere mit Komma)
//   APP              Ordner mit der App (index.html …); leer → nur API
//   HINTER_PROXY     „0", wenn kein Reverse-Proxy davor sitzt (dann kein X-Forwarded-For)
//   ANMELDUNG …      Art der Anmeldung, siehe einstellungen.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db, transaktion } = require('./db');
const H = require('./hilfe');
const admin = require('./admin');
const E = require('./einstellungen');
const SSO = require('./sso');

const PORT = Number(process.env.PORT) || 8080;
const ORIGINS = (process.env.ERLAUBTE_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const APP = process.env.APP === undefined ? path.join(__dirname, '..') : process.env.APP;

// ---------- Spieler-API ----------
const q = {
  codeHolen: db.prepare('SELECT id, used_at, widerrufen, gruppe_id FROM codes WHERE hash = ?'),
  codeVerbrauchen: db.prepare('UPDATE codes SET used_at = ?, spieler_id = ? WHERE id = ? AND used_at IS NULL AND widerrufen = 0'),
  spielerNeu: db.prepare(`INSERT INTO spieler (id, schluessel_hash, name, emoji, erstellt, gruppe_id, benutzername, pw_hash, email, ms_oid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  schluesselNeu: db.prepare('INSERT INTO schluessel (hash, spieler_id, erstellt, zuletzt) VALUES (?, ?, ?, ?)'),
  schluesselWeg: db.prepare('DELETE FROM schluessel WHERE hash = ?'),
  leer: db.prepare(`SELECT NOT EXISTS (SELECT 1 FROM sterne_buchungen WHERE spieler_id = ?1)
    AND NOT EXISTS (SELECT 1 FROM runden WHERE spieler_id = ?1) AS leer`),
  schluesselZuletzt: db.prepare('UPDATE schluessel SET zuletzt = ? WHERE hash = ?'),
  gruppe: db.prepare('SELECT name FROM gruppen WHERE id = ?'),
  spielerPerSchluessel: db.prepare(`SELECT s.*, g.name AS gruppe, k.hash AS geraet, k.zuletzt AS geraet_zuletzt FROM schluessel k
    JOIN spieler s ON s.id = k.spieler_id LEFT JOIN gruppen g ON g.id = s.gruppe_id WHERE k.hash = ?`),
  spielerPerId: db.prepare('SELECT s.*, g.name AS gruppe FROM spieler s LEFT JOIN gruppen g ON g.id = s.gruppe_id WHERE s.id = ?'),
  spielerPerName: db.prepare('SELECT * FROM spieler WHERE benutzername = ? COLLATE NOCASE'),
  konten: db.prepare('SELECT benutzername, emoji FROM spieler WHERE benutzername IS NOT NULL AND pw_hash IS NOT NULL AND gesperrt = 0 ORDER BY benutzername COLLATE NOCASE'),
  spielerPerOid: db.prepare('SELECT * FROM spieler WHERE ms_oid = ?'),
  spielerEmail: db.prepare('UPDATE spieler SET email = ? WHERE id = ?'),
  spielerAendern: db.prepare('UPDATE spieler SET name = ?, emoji = ? WHERE id = ?'),
  spielerPasswort: db.prepare('UPDATE spieler SET pw_hash = ? WHERE id = ?'),
  adresseErlaubt: db.prepare('SELECT 1 FROM erlaubte_adressen WHERE email = ? COLLATE NOCASE'),
  klasseVon: db.prepare('SELECT gruppe_id FROM klassen_zuordnung WHERE benutzername = ? COLLATE NOCASE'),
  rekordKleiner: db.prepare(`INSERT INTO rekorde (spieler_id, key, wert, datum) VALUES (?, ?, ?, ?)
    ON CONFLICT (spieler_id, key) DO UPDATE SET wert = excluded.wert, datum = excluded.datum WHERE excluded.wert < rekorde.wert`),
  rekordGroesser: db.prepare(`INSERT INTO rekorde (spieler_id, key, wert, datum) VALUES (?, ?, ?, ?)
    ON CONFLICT (spieler_id, key) DO UPDATE SET wert = excluded.wert, datum = excluded.datum WHERE excluded.wert > rekorde.wert`),
  rekordeVon: db.prepare('SELECT key, wert, datum FROM rekorde WHERE spieler_id = ?'),
  buchung: db.prepare('INSERT OR IGNORE INTO sterne_buchungen (spieler_id, client_id, delta, datum, grund) VALUES (?, ?, ?, ?, ?)'),
  sterne: db.prepare('SELECT COALESCE(SUM(delta), 0) AS n FROM sterne_buchungen WHERE spieler_id = ?'),
  runde: db.prepare(`INSERT OR IGNORE INTO runden
    (spieler_id, client_id, datum, typ, modus, art, laenge, ops, raum, einsetzen, richtig, falsch, zeit, sterne, spiel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  liste: db.prepare(`SELECT s.id, s.name, s.emoji, r.wert, r.datum FROM rekorde r JOIN spieler s ON s.id = r.spieler_id
    WHERE r.key = ? AND s.gesperrt = 0`),
  listeGruppe: db.prepare(`SELECT s.id, s.name, s.emoji, r.wert, r.datum FROM rekorde r JOIN spieler s ON s.id = r.spieler_id
    WHERE r.key = ? AND s.gesperrt = 0 AND s.gruppe_id = ?`),
};

// Bearer-Schlüssel (eines Geräts) → Spieler; sonst Antwort 401/403 und null
function spielerAus(req, res) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  const s = m && q.spielerPerSchluessel.get(H.sha(m[1]));
  if (!s) { H.fehler(res, 401, 'Schlüssel ungültig'); return null; }
  if (s.gesperrt) { H.fehler(res, 403, 'Spieler gesperrt'); return null; }
  // „zuletzt" höchstens einmal pro Stunde schreiben
  const jetzt = Date.now();
  if (!s.geraet_zuletzt || jetzt - s.geraet_zuletzt > 3600e3) q.schluesselZuletzt.run(jetzt, s.geraet);
  return s;
}

// Neuer Schlüssel für dieses Gerät (nur der Hash wird gespeichert)
function geraetAnmelden(spielerId) {
  const schluessel = H.neuerSchluessel();
  const jetzt = Date.now();
  q.schluesselNeu.run(H.sha(schluessel), spielerId, jetzt, jetzt);
  return schluessel;
}

const sterneVon = (id) => q.sterne.get(id).n;

// Alles, was ein Gerät nach dem Anmelden braucht
function kontoDaten(spielerId, schluessel) {
  const s = q.spielerPerId.get(spielerId);
  return {
    schluessel, spielerId: s.id, name: s.name, emoji: s.emoji, gruppe: s.gruppe || null, benutzername: s.benutzername || null,
    rekorde: q.rekordeVon.all(s.id), sterne: sterneVon(s.id),
  };
}

// Neuer Spieler; in spieler.schluessel_hash steht bei Konten nur ein Platzhalter (die Schlüssel liegen in „schluessel")
function spielerAnlegen({ name, emoji, gruppeId = null, benutzername = null, pwHash = null, email = null, oid = null }) {
  const id = H.neueId();
  q.spielerNeu.run(id, `konto:${H.neueId()}`, name, emoji, Date.now(), gruppeId, benutzername, pwHash, email, oid);
  return id;
}

async function einloesen(req, res) {
  // Großzügig: eine ganze Schule kann hinter einer IP sitzen; Codes sind ohnehin nicht zu erraten
  if (!H.erlaubt(`einloesen:${H.ip(req)}`, 100, 3600e3)) return H.fehler(res, 429, 'Zu viele Versuche – bitte später nochmal');
  const b = await H.body(req);
  if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
  const kern = H.codeKern(b.code);
  const name = H.name(b.name);
  const emoji = H.emoji(b.emoji);
  if (!kern) return H.fehler(res, 400, 'Code hat das falsche Format');
  if (!name) return H.fehler(res, 400, 'Spitzname: 1–16 Buchstaben oder Ziffern');
  if (!emoji) return H.fehler(res, 400, 'Bitte ein Bild auswählen');
  let schluessel = null;
  let id = null;
  const ergebnis = transaktion(() => {
    const c = q.codeHolen.get(H.sha(kern));
    if (!c || c.widerrufen) return 404;
    if (c.used_at) return 409;
    // Die Gruppe des Codes wird die Gruppe des Spielers
    id = spielerAnlegen({ name, emoji, gruppeId: c.gruppe_id ?? null });
    schluessel = geraetAnmelden(id);
    if (q.codeVerbrauchen.run(Date.now(), id, c.id).changes !== 1) throw new Error('Code schon verbraucht');
    return 200;
  });
  if (ergebnis === 404) return H.fehler(res, 404, 'Diesen Code gibt es nicht');
  if (ergebnis === 409) return H.fehler(res, 409, 'Dieser Code wurde schon benutzt');
  H.json(res, 200, kontoDaten(id, schluessel));
}

// ---------- Piazzi: Konto mit freigegebener Adresse ----------
async function kontoAnlegen(req, res) {
  if (!H.erlaubt(`konto:${H.ip(req)}`, 20, 3600e3)) return H.fehler(res, 429, 'Zu viele Versuche – bitte später nochmal');
  const b = await H.body(req);
  if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
  const email = H.email(b.email, E.DOMAIN);
  const benutzer = H.benutzername(b.benutzername);
  const pw = H.passwort(b.passwort);
  const emoji = H.emoji(b.emoji);
  if (!email) return H.fehler(res, 400, `Bitte eine Adresse @${E.DOMAIN} angeben`);
  if (!q.adresseErlaubt.get(email)) return H.fehler(res, 403, 'Diese Adresse ist nicht freigegeben');
  if (!benutzer || benutzer.length > 16) return H.fehler(res, 400, 'Benutzername: 2–16 Buchstaben oder Ziffern, ohne Leerzeichen');
  if (!pw) return H.fehler(res, 400, 'Passwort: mindestens 6 Zeichen');
  if (!emoji) return H.fehler(res, 400, 'Bitte ein Bild auswählen');
  const hash = await H.pwHash(pw);
  let ergebnis = null;
  transaktion(() => {
    if (q.spielerPerName.get(benutzer)) return;
    const id = spielerAnlegen({ name: benutzer, emoji, benutzername: benutzer, pwHash: hash, email });
    ergebnis = kontoDaten(id, geraetAnmelden(id));
  });
  if (!ergebnis) return H.fehler(res, 409, `Den Benutzernamen „${benutzer}" gibt es schon`);
  H.json(res, 200, ergebnis);
}

// Piazzi: alle Konten für „Wer rechnet?" – nur Benutzername und Bild, wie in der Bestenliste
function kontenListe(req, res) {
  if (!H.erlaubt(`konten:${H.ip(req)}`, 120, 3600e3)) return H.fehler(res, 429, 'Zu viele Anfragen');
  H.json(res, 200, { konten: q.konten.all() });
}

async function anmelden(req, res) {
  const b = await H.body(req);
  if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
  const benutzer = H.benutzername(b.benutzername) || '';
  if (!H.erlaubt(`anmelden:${H.ip(req)}`, 30, 15 * 60e3) || !H.erlaubt(`anmelden:${benutzer.toLowerCase()}`, 10, 15 * 60e3)) {
    return H.fehler(res, 429, 'Zu viele Versuche – in 15 Minuten nochmal');
  }
  const s = benutzer ? q.spielerPerName.get(benutzer) : null;
  const ok = await H.pwPruefen(typeof b.passwort === 'string' ? b.passwort : '', s && s.pw_hash);
  if (!s || !ok) return H.fehler(res, 401, 'Benutzername oder Passwort falsch');
  if (s.gesperrt) return H.fehler(res, 403, 'Dieses Konto ist gesperrt');
  H.json(res, 200, kontoDaten(s.id, geraetAnmelden(s.id)));
}

// ---------- BGBB: Microsoft-Schulkonto ----------
function ssoZurueck(res, hash) {
  res.writeHead(302, { Location: `${E.ADRESSE}/#${hash}`, 'Cache-Control': 'no-store', ...H.SICHER });
  res.end();
}

function ssoStart(req, res) {
  if (!SSO.bereit()) return H.fehler(res, 503, 'Microsoft-Anmeldung ist nicht eingerichtet');
  if (!H.erlaubt(`sso:${H.ip(req)}`, 200, 3600e3)) return H.fehler(res, 429, 'Zu viele Versuche – bitte später nochmal');
  res.writeHead(302, { Location: SSO.startAdresse(), 'Cache-Control': 'no-store', ...H.SICHER });
  res.end();
}

async function ssoRueckruf(req, res, url) {
  if (!SSO.bereit()) return H.fehler(res, 503, 'Microsoft-Anmeldung ist nicht eingerichtet');
  let a;
  try {
    a = await SSO.rueckruf(url);
  } catch (err) {
    return ssoZurueck(res, `sso-fehler=${encodeURIComponent(err.message)}`);
  }
  const email = H.email(a.email, E.DOMAIN);
  if (!email) return ssoZurueck(res, `sso-fehler=${encodeURIComponent(`Bitte mit dem Konto @${E.DOMAIN} anmelden`)}`);
  const benutzer = H.benutzername(email.split('@')[0]);
  if (!benutzer) return ssoZurueck(res, `sso-fehler=${encodeURIComponent('Benutzername ungültig')}`);
  let fehler = null;
  let id = null;
  transaktion(() => {
    const s = q.spielerPerOid.get(a.oid);
    if (s) {
      if (s.gesperrt) { fehler = 'Dieses Konto ist gesperrt'; return; }
      id = s.id;
      if (s.email !== email) q.spielerEmail.run(email, s.id);
      return;
    }
    if (q.spielerPerName.get(benutzer)) { fehler = `„${benutzer}" ist schon vergeben – bitte beim Admin melden`; return; }
    const k = q.klasseVon.get(benutzer);
    id = spielerAnlegen({ name: benutzer, emoji: H.EMOJIS[0], gruppeId: k ? k.gruppe_id : null, benutzername: benutzer, email, oid: a.oid });
  });
  if (fehler) return ssoZurueck(res, `sso-fehler=${encodeURIComponent(fehler)}`);
  ssoZurueck(res, `sso=${SSO.uebergabe(id)}`);
}

async function ssoEinloesen(req, res) {
  const b = await H.body(req);
  const id = b && SSO.einloesen(b.token);
  if (!id) return H.fehler(res, 401, 'Anmeldung abgelaufen – bitte nochmal');
  const s = q.spielerPerId.get(id);
  if (!s) return H.fehler(res, 404, 'Konto gibt es nicht mehr');
  if (s.gesperrt) return H.fehler(res, 403, 'Dieses Konto ist gesperrt');
  // Noch nie benutzt: dann bringt dieses Gerät seine Sterne als Startguthaben mit
  const neu = !!q.leer.get(id).leer;
  H.json(res, 200, { ...kontoDaten(id, geraetAnmelden(id)), neu });
}

// Eine Rechenrunde oder ein Minispiel prüfen → Werte für die Tabelle, sonst null
const zahl = (x, max) => (Number.isInteger(x) && x >= 0 && x <= max ? x : null);
const CLIENT_ID = /^[A-Za-z0-9_-]{4,40}$/;
function rundeWerte(s, r) {
  if (!r || typeof r.clientId !== 'string' || !CLIENT_ID.test(r.clientId)) return null;
  const t = H.datum(r.t);
  if (r.typ === 'spiel') {
    if (typeof r.spiel !== 'string' || !/^[a-z0-9_-]{1,20}$/.test(r.spiel)) return null;
    return [s.id, r.clientId, t, 'spiel', null, null, null, null, null, null, null, null, null, null, r.spiel];
  }
  if (r.typ !== 'rechnen') return null;
  if (!['schrift', 'sprache'].includes(r.modus) || !['aufgaben', 'zeit'].includes(r.art)) return null;
  if (typeof r.ops !== 'string' || !/^[*+\-/]{1,4}$/.test(r.ops) || ![10, 20, 50, 100].includes(r.raum)) return null;
  const werte = [zahl(r.laenge, 60), zahl(r.richtig, 1000), zahl(r.falsch, 1000), zahl(r.zeit, 36000), zahl(r.sterne, 100)];
  if (werte.includes(null)) return null;
  const [laenge, richtig, falsch, zeit, sterne] = werte;
  return [s.id, r.clientId, t, 'rechnen', r.modus, r.art, laenge, r.ops, r.raum, r.einsetzen ? 1 : 0, richtig, falsch, zeit, sterne, null];
}

// Sterne-Buchung prüfen → Werte für die Tabelle, sonst null
const GRUENDE = ['runde', 'spiel', 'eltern', 'start'];
function buchungWerte(s, b) {
  if (!b || typeof b.clientId !== 'string' || !CLIENT_ID.test(b.clientId)) return null;
  if (!Number.isInteger(b.delta) || Math.abs(b.delta) > 100000 || !GRUENDE.includes(b.grund)) return null;
  return [s.id, b.clientId, b.delta, H.datum(b.t), b.grund];
}

// Rekorde, Runden und Sterne (auch gesammelt nachgeliefert). Ungültiges wird übersprungen, damit nichts hängen bleibt.
async function sync(req, res) {
  const s = spielerAus(req, res);
  if (!s) return;
  if (!H.erlaubt(`sync:${s.id}`, 60, 60e3)) return H.fehler(res, 429, 'Zu viele Anfragen');
  const b = await H.body(req, 96 * 1024);
  if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
  const rekorde = Array.isArray(b.rekorde) ? b.rekorde.slice(0, 50) : [];
  const runden = Array.isArray(b.runden) ? b.runden.slice(0, 50) : [];
  const sterne = Array.isArray(b.sterne) ? b.sterne.slice(0, 100) : [];
  let neu = 0;
  let uebersprungen = 0;
  transaktion(() => {
    for (const r of rekorde) {
      const k = r && H.rekordKey(r.key);
      if (!k || !H.rekordWert(k.art, r.wert)) { uebersprungen++; continue; }
      const stmt = H.kleinerBesser(k.art) ? q.rekordKleiner : q.rekordGroesser;
      neu += stmt.run(s.id, k.key, r.wert, H.datum(r.datum)).changes;
    }
    for (const r of runden) {
      const w = rundeWerte(s, r);
      if (!w) { uebersprungen++; continue; }
      q.runde.run(...w);
    }
    for (const x of sterne) {
      const w = buchungWerte(s, x);
      if (!w) { uebersprungen++; continue; }
      q.buchung.run(...w);
    }
  });
  // Name/Gruppe mitschicken – der Admin kann sie inzwischen geändert haben. Rekorde und Sterne für die anderen Geräte.
  H.json(res, 200, {
    ok: true, neueRekorde: neu, uebersprungen, name: s.name, emoji: s.emoji, gruppe: s.gruppe || null,
    rekorde: q.rekordeVon.all(s.id), sterne: sterneVon(s.id),
  });
}

function liste(req, res, url) {
  const s = spielerAus(req, res);
  if (!s) return;
  if (!H.erlaubt(`liste:${s.id}`, 60, 60e3)) return H.fehler(res, 429, 'Zu viele Anfragen');
  const k = H.rekordKey(url.searchParams.get('key'));
  if (!k) return H.fehler(res, 400, 'Unbekannte Bestenliste');
  const inGruppe = url.searchParams.get('bereich') === 'gruppe';
  if (inGruppe && !s.gruppe_id) return H.fehler(res, 400, 'Keine Gruppe');
  const klein = H.kleinerBesser(k.art);
  const alle = (inGruppe ? q.listeGruppe.all(k.key, s.gruppe_id) : q.liste.all(k.key)).sort((a, b) => (klein ? a.wert - b.wert : b.wert - a.wert) || a.datum - b.datum);
  const zeile = (x, i) => ({ platz: i + 1, name: x.name, emoji: x.emoji, wert: x.wert, ich: x.id === s.id });
  const top = alle.slice(0, 20).map(zeile);
  const i = alle.findIndex((x) => x.id === s.id);
  H.json(res, 200, { top, ich: i >= 0 ? zeile(alle[i], i) : null, gesamt: alle.length, gruppe: inGruppe ? s.gruppe : null });
}

async function ich(req, res) {
  const s = spielerAus(req, res);
  if (!s) return;
  const antwort = (name, emoji) => ({ name, emoji, gruppe: s.gruppe || null, benutzername: s.benutzername || null });
  if (req.method === 'GET') return H.json(res, 200, antwort(s.name, s.emoji));
  // Dieses Gerät abmelden
  if (req.method === 'DELETE') { q.schluesselWeg.run(s.geraet); return H.json(res, 200, { ok: true }); }
  const b = await H.body(req);
  if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
  if (b.passwortNeu !== undefined) {
    if (!s.pw_hash) return H.fehler(res, 400, 'Dieses Konto hat kein Passwort');
    if (!H.erlaubt(`passwort:${s.id}`, 10, 15 * 60e3)) return H.fehler(res, 429, 'Zu viele Versuche – in 15 Minuten nochmal');
    const pw = H.passwort(b.passwortNeu);
    if (!pw) return H.fehler(res, 400, 'Neues Passwort: mindestens 6 Zeichen');
    if (!(await H.pwPruefen(String(b.passwortAlt || ''), s.pw_hash))) return H.fehler(res, 401, 'Bisheriges Passwort stimmt nicht');
    q.spielerPasswort.run(await H.pwHash(pw), s.id);
    return H.json(res, 200, antwort(s.name, s.emoji));
  }
  const name = b.name === undefined ? s.name : H.name(b.name);
  const emoji = b.emoji === undefined ? s.emoji : H.emoji(b.emoji);
  if (!name) return H.fehler(res, 400, 'Spitzname: 1–16 Buchstaben oder Ziffern');
  if (!emoji) return H.fehler(res, 400, 'Bitte ein Bild auswählen');
  q.spielerAendern.run(name, emoji, s.id);
  H.json(res, 200, antwort(name, emoji));
}

function cors(req, res) {
  const o = req.headers.origin;
  if (!o || !ORIGINS.includes(o)) return {};
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function api(req, res, url) {
  const c = cors(req, res);
  for (const [k, v] of Object.entries(c)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const r = `${req.method} ${url.pathname}`;
  // „anmeldung" sagt der App, welche Anmeldung sie zeigen soll
  if (r === 'GET /api/ping') return H.json(res, 200, { ok: true, anmeldung: E.ANMELDUNG, domain: E.DOMAIN || null });
  if (E.ANMELDUNG === 'codes' && r === 'POST /api/einloesen') return einloesen(req, res);
  if (E.ANMELDUNG === 'piazzi' && r === 'POST /api/konto') return kontoAnlegen(req, res);
  if (E.ANMELDUNG === 'piazzi' && r === 'POST /api/anmelden') return anmelden(req, res);
  if (E.ANMELDUNG === 'piazzi' && r === 'GET /api/konten') return kontenListe(req, res);
  if (E.ANMELDUNG === 'bgbb' && r === 'GET /api/sso/start') return ssoStart(req, res);
  if (E.ANMELDUNG === 'bgbb' && r === 'GET /api/sso/rueckruf') return ssoRueckruf(req, res, url);
  if (E.ANMELDUNG === 'bgbb' && r === 'POST /api/sso/einloesen') return ssoEinloesen(req, res);
  if (r === 'POST /api/sync') return sync(req, res);
  if (r === 'GET /api/liste') return liste(req, res, url);
  if (r === 'GET /api/ich' || r === 'PATCH /api/ich' || r === 'DELETE /api/ich') return ich(req, res);
  H.fehler(res, 404, 'Gibt es nicht');
}

// ---------- Dateien ----------
const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.gz': 'application/gzip', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
};
// Nur diese Teile der App werden ausgeliefert – nie server/, .git usw.
const APP_ERLAUBT = /^\/(index\.html|manifest\.json|sw\.js|(css|js|icons|vendor|models|audio)\/[\w./-]+)$/;

function datei(res, wurzel, rel, extra = {}) {
  const ziel = path.normalize(path.join(wurzel, rel));
  if (!ziel.startsWith(path.normalize(wurzel + path.sep))) return H.fehler(res, 404, 'Gibt es nicht');
  fs.stat(ziel, (err, st) => {
    if (err || !st.isFile()) return H.fehler(res, 404, 'Gibt es nicht');
    res.writeHead(200, {
      'Content-Type': TYPEN[path.extname(ziel)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      ...H.SICHER,
      ...extra,
    });
    fs.createReadStream(ziel).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p === '/admin' || p.startsWith('/admin/')) return await admin.anfrage(req, res, url, datei);
    if (req.method !== 'GET' && req.method !== 'HEAD') return H.fehler(res, 405, 'Nicht erlaubt');
    if (!APP) return H.fehler(res, 404, 'Gibt es nicht');
    const rel = p === '/' ? '/index.html' : p;
    if (!APP_ERLAUBT.test(rel) || rel.includes('..')) return H.fehler(res, 404, 'Gibt es nicht');
    datei(res, APP, rel);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) H.fehler(res, 500, 'Serverfehler');
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Rechenheld-Server auf Port ${PORT}, Anmeldung „${E.ANMELDUNG}"${APP ? ` (App aus ${APP})` : ''}${process.env.ADMIN_PASSWORT ? '' : ' – ADMIN_PASSWORT fehlt, /admin ist aus'}`);
  if (E.ANMELDUNG === 'bgbb' && !SSO.bereit()) console.log('MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET oder OEFFENTLICHE_ADRESSE fehlt – Microsoft-Anmeldung ist aus');
});
