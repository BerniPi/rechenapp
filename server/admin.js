// Admin-Bereich: Login, Codes erzeugen/widerrufen, Spieler verwalten, Aktivität ansehen,
// freigegebene Adressen (piazzi) und Klassen-Import per CSV (bgbb).
const path = require('node:path');
const crypto = require('node:crypto');
const { db, transaktion } = require('./db');
const H = require('./hilfe');
const E = require('./einstellungen');

const PASSWORT = process.env.ADMIN_PASSWORT || '';
const DAUER = 12 * 3600e3; // Anmeldung gilt 12 Stunden
const SEITE = path.join(__dirname, 'admin');
const sitzungen = new Map(); // token → gültig bis

const q = {
  codeNeu: db.prepare('INSERT INTO codes (hash, ende, notiz, erstellt, gruppe_id) VALUES (?, ?, ?, ?, ?)'),
  gruppen: db.prepare(`SELECT g.id, g.name, g.erstellt, (SELECT COUNT(*) FROM spieler WHERE gruppe_id = g.id) AS spieler
    FROM gruppen g ORDER BY g.name COLLATE NOCASE`),
  gruppeHolen: db.prepare('SELECT id FROM gruppen WHERE id = ?'),
  gruppeNeu: db.prepare('INSERT INTO gruppen (name, erstellt) VALUES (?, ?)'),
  gruppeName: db.prepare('UPDATE gruppen SET name = ? WHERE id = ?'),
  gruppeLoeschen: db.prepare('DELETE FROM gruppen WHERE id = ?'),
  gruppeGibts: db.prepare('SELECT id FROM gruppen WHERE name = ? COLLATE NOCASE AND id != ?'),
  codes: db.prepare(`SELECT c.id, c.ende, c.notiz, c.erstellt, c.used_at, c.widerrufen, s.name, s.emoji, g.name AS gruppe
    FROM codes c LEFT JOIN spieler s ON s.id = c.spieler_id LEFT JOIN gruppen g ON g.id = c.gruppe_id
    ORDER BY c.erstellt DESC, c.id DESC`),
  widerrufen: db.prepare('UPDATE codes SET widerrufen = 1 WHERE id = ? AND used_at IS NULL'),
  spieler: db.prepare(`SELECT s.id, s.name, s.emoji, s.gesperrt, s.erstellt, s.gruppe_id, s.benutzername, s.email,
      (s.pw_hash IS NOT NULL) AS hatPasswort,
      (SELECT COUNT(*) FROM schluessel WHERE spieler_id = s.id) AS geraete,
      (SELECT COALESCE(SUM(delta), 0) FROM sterne_buchungen WHERE spieler_id = s.id) AS sterne,
      (SELECT name FROM gruppen WHERE id = s.gruppe_id) AS gruppe,
      (SELECT notiz FROM codes WHERE spieler_id = s.id LIMIT 1) AS notiz,
      (SELECT COUNT(*) FROM rekorde WHERE spieler_id = s.id) AS rekorde,
      COUNT(r.id) FILTER (WHERE r.typ = 'rechnen') AS rechnen,
      COUNT(r.id) FILTER (WHERE r.typ = 'rechnen' AND r.datum >= ?) AS rechnen7,
      COUNT(r.id) FILTER (WHERE r.typ = 'rechnen' AND r.datum >= ?) AS rechnenHeute,
      COUNT(r.id) FILTER (WHERE r.typ = 'spiel') AS spiele,
      COALESCE(SUM(r.richtig), 0) AS richtig,
      COALESCE(SUM(r.falsch), 0) AS falsch,
      MAX(r.datum) AS zuletzt
    FROM spieler s LEFT JOIN runden r ON r.spieler_id = s.id
    GROUP BY s.id ORDER BY zuletzt DESC NULLS LAST, s.erstellt DESC`),
  einSpieler: db.prepare('SELECT id FROM spieler WHERE id = ?'),
  runden: db.prepare('SELECT * FROM runden WHERE spieler_id = ? ORDER BY datum DESC LIMIT 50'),
  rundenSeit: db.prepare('SELECT datum, typ FROM runden WHERE spieler_id = ? AND datum >= ?'),
  aendern: db.prepare('UPDATE spieler SET name = ?, emoji = ?, gesperrt = ?, gruppe_id = ? WHERE id = ?'),
  spielerVoll: db.prepare('SELECT * FROM spieler WHERE id = ?'),
  rekordeLoeschen: db.prepare('DELETE FROM rekorde WHERE spieler_id = ?'),
  spielerLoeschen: db.prepare('DELETE FROM spieler WHERE id = ?'),
  geraeteAbmelden: db.prepare('DELETE FROM schluessel WHERE spieler_id = ?'),
  // Alten Schlüssel unbrauchbar machen, sonst übernimmt db.js ihn beim nächsten Start wieder
  altSchluesselWeg: db.prepare("UPDATE spieler SET schluessel_hash = 'konto:' || ? WHERE id = ?"),
  passwort: db.prepare('UPDATE spieler SET pw_hash = ? WHERE id = ? AND pw_hash IS NOT NULL'),
  adressen: db.prepare(`SELECT a.email, a.notiz, a.erstellt, (SELECT COUNT(*) FROM spieler WHERE email = a.email COLLATE NOCASE) AS konten
    FROM erlaubte_adressen a ORDER BY a.email`),
  adresseNeu: db.prepare('INSERT OR IGNORE INTO erlaubte_adressen (email, notiz, erstellt) VALUES (?, ?, ?)'),
  adresseWeg: db.prepare('DELETE FROM erlaubte_adressen WHERE email = ? COLLATE NOCASE'),
  zuordnungen: db.prepare(`SELECT k.benutzername, g.name AS klasse, (SELECT id FROM spieler WHERE benutzername = k.benutzername COLLATE NOCASE) AS spieler_id
    FROM klassen_zuordnung k JOIN gruppen g ON g.id = k.gruppe_id ORDER BY g.name COLLATE NOCASE, k.benutzername`),
  zuordnungenWeg: db.prepare('DELETE FROM klassen_zuordnung'),
  zuordnung: db.prepare(`INSERT INTO klassen_zuordnung (benutzername, gruppe_id) VALUES (?, ?)
    ON CONFLICT (benutzername) DO UPDATE SET gruppe_id = excluded.gruppe_id`),
  gruppePerName: db.prepare('SELECT id FROM gruppen WHERE name = ? COLLATE NOCASE'),
  spielerKlasse: db.prepare('UPDATE spieler SET gruppe_id = ? WHERE benutzername = ? COLLATE NOCASE'),
  rekorde: db.prepare(`SELECT r.key, r.wert, r.datum, s.name, s.emoji, s.gesperrt, s.gruppe_id FROM rekorde r
    JOIN spieler s ON s.id = r.spieler_id ORDER BY r.key`),
};

function cookie(req) {
  const m = /(?:^|;\s*)rh_admin=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}
function angemeldet(req) {
  const t = cookie(req);
  const bis = t && sitzungen.get(t);
  if (!bis) return false;
  if (bis < Date.now()) { sitzungen.delete(t); return false; }
  return true;
}
const setzeCookie = (wert, sek) => `rh_admin=${wert}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${sek}`;

function heuteBeginn() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function tagSchluessel(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function login(req, res) {
  if (!H.erlaubt(`login:${H.ip(req)}`, 5, 15 * 60e3)) return H.fehler(res, 429, 'Zu viele Versuche – in 15 Minuten nochmal');
  const b = await H.body(req);
  if (!b || typeof b.passwort !== 'string' || !H.gleich(b.passwort, PASSWORT)) return H.fehler(res, 401, 'Falsches Passwort');
  const t = crypto.randomBytes(32).toString('base64url');
  sitzungen.set(t, Date.now() + DAUER);
  H.json(res, 200, { ok: true }, { 'Set-Cookie': setzeCookie(t, DAUER / 1000) });
}

function uebersicht(res) {
  const heute = heuteBeginn();
  const spieler = q.spieler.all(heute - 6 * 864e5, heute);
  const codes = q.codes.all();
  H.json(res, 200, { spieler, codes, gruppen: q.gruppen.all(), anmeldung: E.ANMELDUNG });
}

async function codesErzeugen(req, res) {
  const b = await H.body(req);
  const anzahl = b && Number.isInteger(b.anzahl) && b.anzahl >= 1 && b.anzahl <= 20 ? b.anzahl : null;
  if (!anzahl) return H.fehler(res, 400, 'Anzahl 1–20');
  const notiz = String((b && b.notiz) || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
  const gruppe = b.gruppeId ? Number(b.gruppeId) : null;
  if (gruppe !== null && !q.gruppeHolen.get(gruppe)) return H.fehler(res, 400, 'Gruppe gibt es nicht');
  const neu = transaktion(() => Array.from({ length: anzahl }, () => {
    const c = H.neuerCode();
    q.codeNeu.run(H.sha(c.kern), c.kern.slice(-4), notiz, Date.now(), gruppe);
    return c.klartext;
  }));
  H.json(res, 200, { codes: neu });
}

function spielerRunden(res, id) {
  if (!q.einSpieler.get(id)) return H.fehler(res, 404, 'Spieler gibt es nicht');
  const runden = q.runden.all(id);
  // Runden pro Tag der letzten 30 Tage
  const start = heuteBeginn() - 29 * 864e5;
  const tage = {};
  for (let i = 0; i < 30; i++) tage[tagSchluessel(start + i * 864e5 + 12 * 3600e3)] = { rechnen: 0, spiel: 0 };
  for (const r of q.rundenSeit.all(id, start)) {
    const t = tage[tagSchluessel(r.datum)];
    if (t) t[r.typ === 'spiel' ? 'spiel' : 'rechnen'] += 1;
  }
  H.json(res, 200, { runden, tage: Object.entries(tage).map(([tag, n]) => ({ tag, ...n })) });
}

async function spielerAendern(req, res, id) {
  const s = q.spielerVoll.get(id);
  if (!s) return H.fehler(res, 404, 'Spieler gibt es nicht');
  const b = await H.body(req);
  if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
  const name = b.name === undefined ? s.name : H.name(b.name);
  const emoji = b.emoji === undefined ? s.emoji : H.emoji(b.emoji);
  if (!name) return H.fehler(res, 400, 'Spitzname: 1–16 Buchstaben oder Ziffern');
  if (!emoji) return H.fehler(res, 400, 'Unbekanntes Bild');
  const gesperrt = b.gesperrt === undefined ? s.gesperrt : (b.gesperrt ? 1 : 0);
  const gruppe = b.gruppeId === undefined ? s.gruppe_id : (Number(b.gruppeId) || null);
  if (gruppe !== null && !q.gruppeHolen.get(gruppe)) return H.fehler(res, 400, 'Gruppe gibt es nicht');
  q.aendern.run(name, emoji, gesperrt, gruppe, id);
  H.json(res, 200, { ok: true });
}

function geraeteAbmelden(res, id) {
  if (!q.einSpieler.get(id)) return H.fehler(res, 404, 'Spieler gibt es nicht');
  const n = transaktion(() => {
    q.altSchluesselWeg.run(H.neueId(), id);
    return q.geraeteAbmelden.run(id).changes;
  });
  H.json(res, 200, { abgemeldet: n });
}

// Neues Einmal-Passwort; es wird nur in dieser Antwort gezeigt
async function passwortZuruecksetzen(res, id) {
  const pw = H.neuesPasswort();
  if (!q.passwort.run(await H.pwHash(pw), id).changes) return H.fehler(res, 400, 'Dieser Spieler hat kein Passwort');
  H.json(res, 200, { passwort: pw });
}

// Piazzi: Adressen freigeben – mehrere auf einmal (Zeilen, Komma, Strichpunkt oder Leerzeichen)
async function adressenNeu(req, res) {
  const b = await H.body(req, 32 * 1024);
  if (!b || typeof b.text !== 'string') return H.fehler(res, 400, 'Ungültige Anfrage');
  const notiz = String(b.notiz || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
  const teile = b.text.split(/[\s,;]+/).filter(Boolean);
  const falsch = [];
  let neu = 0;
  transaktion(() => {
    for (const t of teile) {
      const e = H.email(t, E.DOMAIN);
      if (!e) { falsch.push(t.slice(0, 60)); continue; }
      neu += q.adresseNeu.run(e, notiz, Date.now()).changes;
    }
  });
  H.json(res, 200, { neu, falsch });
}

// BGBB: CSV „benutzername;klasse" – fehlende Klassen anlegen, angemeldete Schüler:innen sofort verschieben
async function klassenImport(req, res) {
  const b = await H.body(req, 512 * 1024);
  if (!b || typeof b.csv !== 'string') return H.fehler(res, 400, 'Ungültige Anfrage');
  const { zeilen, fehler } = H.klassenCsv(b.csv, E.DOMAIN);
  if (!zeilen.length) return H.json(res, 200, { zugeordnet: 0, verschoben: 0, neueKlassen: [], fehler });
  const neueKlassen = [];
  let verschoben = 0;
  transaktion(() => {
    if (b.ersetzen) q.zuordnungenWeg.run();
    for (const z of zeilen) {
      let g = q.gruppePerName.get(z.klasse);
      if (!g) {
        g = { id: Number(q.gruppeNeu.run(z.klasse, Date.now()).lastInsertRowid) };
        neueKlassen.push(z.klasse);
      }
      q.zuordnung.run(z.benutzername, g.id);
      verschoben += q.spielerKlasse.run(g.id, z.benutzername).changes;
    }
  });
  H.json(res, 200, { zugeordnet: zeilen.length, verschoben, neueKlassen, fehler: fehler.slice(0, 100), fehlerGesamt: fehler.length });
}

async function gruppeSpeichern(req, res, id) {
  const b = await H.body(req);
  const name = b && H.gruppenName(b.name);
  if (!name) return H.fehler(res, 400, 'Gruppenname: 1–20 Buchstaben oder Ziffern');
  if (q.gruppeGibts.get(name, id || 0)) return H.fehler(res, 409, `Gruppe „${name}" gibt es schon`);
  if (id) {
    if (!q.gruppeName.run(name, id).changes) return H.fehler(res, 404, 'Gruppe gibt es nicht');
    return H.json(res, 200, { id, name });
  }
  const r = q.gruppeNeu.run(name, Date.now());
  H.json(res, 200, { id: Number(r.lastInsertRowid), name });
}

async function adminApi(req, res, url) {
  const p = url.pathname.slice('/admin/api'.length);
  const r = `${req.method} ${p}`;
  if (r === 'POST /login') return login(req, res);
  if (!angemeldet(req)) return H.fehler(res, 401, 'Bitte anmelden');
  // Schreibende Aufrufe nur von der eigenen Seite (zusätzlich zu SameSite=Strict)
  if (req.method !== 'GET' && req.headers['x-admin'] !== '1') return H.fehler(res, 403, 'Nicht erlaubt');
  if (r === 'POST /logout') {
    sitzungen.delete(cookie(req));
    return H.json(res, 200, { ok: true }, { 'Set-Cookie': setzeCookie('', 0) });
  }
  if (r === 'GET /ich') return H.json(res, 200, { ok: true, anmeldung: E.ANMELDUNG, domain: E.DOMAIN || null });
  if (r === 'GET /uebersicht') return uebersicht(res);
  if (r === 'POST /codes') return codesErzeugen(req, res);
  if (r === 'GET /adressen') return H.json(res, 200, { adressen: q.adressen.all() });
  if (r === 'POST /adressen') return adressenNeu(req, res);
  if (r === 'GET /klassen') return H.json(res, 200, { zuordnungen: q.zuordnungen.all() });
  if (r === 'POST /klassen') return klassenImport(req, res);
  if (r === 'DELETE /klassen') return H.json(res, 200, { geloescht: q.zuordnungenWeg.run().changes });
  if (r === 'GET /rekorde') return H.json(res, 200, { rekorde: q.rekorde.all() });
  if (r === 'POST /gruppen') return gruppeSpeichern(req, res, null);
  let m = /^(PATCH|DELETE) \/gruppen\/(\d+)$/.exec(r);
  if (m && m[1] === 'PATCH') return gruppeSpeichern(req, res, Number(m[2]));
  if (m) return H.json(res, 200, { ok: q.gruppeLoeschen.run(Number(m[2])).changes === 1 });
  m = /^DELETE \/adressen\/([^/]{3,200})$/.exec(r);
  if (m) return H.json(res, 200, { ok: q.adresseWeg.run(decodeURIComponent(m[1])).changes === 1 });
  m = /^DELETE \/codes\/(\d+)$/.exec(r);
  if (m) return H.json(res, 200, { ok: q.widerrufen.run(Number(m[1])).changes === 1 });
  m = /^(GET|PATCH|DELETE|POST) \/spieler\/([A-Za-z0-9_-]{1,20})(\/runden|\/rekorde|\/geraete|\/passwort)?$/.exec(r);
  if (m) {
    const [, methode, id, teil] = m;
    if (methode === 'GET' && teil === '/runden') return spielerRunden(res, id);
    if (methode === 'PATCH' && !teil) return spielerAendern(req, res, id);
    if (methode === 'DELETE' && teil === '/rekorde') return H.json(res, 200, { geloescht: q.rekordeLoeschen.run(id).changes });
    if (methode === 'DELETE' && teil === '/geraete') return geraeteAbmelden(res, id);
    if (methode === 'POST' && teil === '/passwort') return passwortZuruecksetzen(res, id);
    if (methode === 'DELETE' && !teil) return H.json(res, 200, { ok: q.spielerLoeschen.run(id).changes === 1 });
  }
  H.fehler(res, 404, 'Gibt es nicht');
}

// Seite + API unter /admin
async function anfrage(req, res, url, datei) {
  if (!PASSWORT) return H.fehler(res, 404, 'Admin-Bereich ist aus (ADMIN_PASSWORT fehlt)');
  if (url.pathname.startsWith('/admin/api/')) return adminApi(req, res, url);
  if (req.method !== 'GET') return H.fehler(res, 405, 'Nicht erlaubt');
  if (url.pathname === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  const rel = url.pathname === '/admin/' ? 'index.html' : url.pathname.slice('/admin/'.length);
  if (!/^[\w-]+\.(html|js|css)$/.test(rel)) return H.fehler(res, 404, 'Gibt es nicht');
  datei(res, SEITE, rel, {
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
  });
}

setInterval(() => {
  const jetzt = Date.now();
  for (const [t, bis] of sitzungen) if (bis < jetzt) sitzungen.delete(t);
}, 3600e3).unref();

module.exports = { anfrage };
