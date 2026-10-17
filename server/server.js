// Rechenheld-Server: globale Bestenliste, Aktivität und Admin-Seite. Liefert auf Wunsch auch die App selbst aus.
//   PORT             (8080)
//   DATEN            Ordner für rechenheld.db
//   ADMIN_PASSWORT   Passwort für /admin (ohne → Admin-Seite aus)
//   ERLAUBTE_ORIGIN  z. B. https://name.github.io – falls die App woanders liegt (mehrere mit Komma)
//   APP              Ordner mit der App (index.html …); leer → nur API
//   HINTER_PROXY     „0", wenn kein Reverse-Proxy davor sitzt (dann kein X-Forwarded-For)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db, transaktion } = require('./db');
const H = require('./hilfe');
const admin = require('./admin');

const PORT = Number(process.env.PORT) || 8080;
const ORIGINS = (process.env.ERLAUBTE_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const APP = process.env.APP === undefined ? path.join(__dirname, '..') : process.env.APP;

// ---------- Spieler-API ----------
const q = {
  codeHolen: db.prepare('SELECT id, used_at, widerrufen, gruppe_id FROM codes WHERE hash = ?'),
  codeVerbrauchen: db.prepare('UPDATE codes SET used_at = ?, spieler_id = ? WHERE id = ? AND used_at IS NULL AND widerrufen = 0'),
  spielerNeu: db.prepare('INSERT INTO spieler (id, schluessel_hash, name, emoji, erstellt, gruppe_id) VALUES (?, ?, ?, ?, ?, ?)'),
  gruppe: db.prepare('SELECT name FROM gruppen WHERE id = ?'),
  spielerPerSchluessel: db.prepare('SELECT s.*, g.name AS gruppe FROM spieler s LEFT JOIN gruppen g ON g.id = s.gruppe_id WHERE s.schluessel_hash = ?'),
  spielerAendern: db.prepare('UPDATE spieler SET name = ?, emoji = ? WHERE id = ?'),
  rekordKleiner: db.prepare(`INSERT INTO rekorde (spieler_id, key, wert, datum) VALUES (?, ?, ?, ?)
    ON CONFLICT (spieler_id, key) DO UPDATE SET wert = excluded.wert, datum = excluded.datum WHERE excluded.wert < rekorde.wert`),
  rekordGroesser: db.prepare(`INSERT INTO rekorde (spieler_id, key, wert, datum) VALUES (?, ?, ?, ?)
    ON CONFLICT (spieler_id, key) DO UPDATE SET wert = excluded.wert, datum = excluded.datum WHERE excluded.wert > rekorde.wert`),
  runde: db.prepare(`INSERT OR IGNORE INTO runden
    (spieler_id, client_id, datum, typ, modus, art, laenge, ops, raum, einsetzen, richtig, falsch, zeit, sterne, spiel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  liste: db.prepare(`SELECT s.id, s.name, s.emoji, r.wert, r.datum FROM rekorde r JOIN spieler s ON s.id = r.spieler_id
    WHERE r.key = ? AND s.gesperrt = 0`),
  listeGruppe: db.prepare(`SELECT s.id, s.name, s.emoji, r.wert, r.datum FROM rekorde r JOIN spieler s ON s.id = r.spieler_id
    WHERE r.key = ? AND s.gesperrt = 0 AND s.gruppe_id = ?`),
};

// Bearer-Schlüssel → Spieler; sonst Antwort 401/403 und null
function spielerAus(req, res) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  const s = m && q.spielerPerSchluessel.get(H.sha(m[1]));
  if (!s) { H.fehler(res, 401, 'Schlüssel ungültig'); return null; }
  if (s.gesperrt) { H.fehler(res, 403, 'Spieler gesperrt'); return null; }
  return s;
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
  const schluessel = H.neuerSchluessel();
  const id = H.neueId();
  let gruppe = null;
  const ergebnis = transaktion(() => {
    const c = q.codeHolen.get(H.sha(kern));
    if (!c || c.widerrufen) return 404;
    if (c.used_at) return 409;
    const jetzt = Date.now();
    // Die Gruppe des Codes wird die Gruppe des Spielers
    q.spielerNeu.run(id, H.sha(schluessel), name, emoji, jetzt, c.gruppe_id ?? null);
    if (q.codeVerbrauchen.run(jetzt, id, c.id).changes !== 1) throw new Error('Code schon verbraucht');
    gruppe = c.gruppe_id ? (q.gruppe.get(c.gruppe_id) || {}).name || null : null;
    return 200;
  });
  if (ergebnis === 404) return H.fehler(res, 404, 'Diesen Code gibt es nicht');
  if (ergebnis === 409) return H.fehler(res, 409, 'Dieser Code wurde schon benutzt');
  H.json(res, 200, { schluessel, spielerId: id, name, emoji, gruppe });
}

// Eine Rechenrunde oder ein Minispiel prüfen → Werte für die Tabelle, sonst null
const zahl = (x, max) => (Number.isInteger(x) && x >= 0 && x <= max ? x : null);
function rundeWerte(s, r) {
  if (!r || typeof r.clientId !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(r.clientId)) return null;
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

// Rekorde und Runden (auch gesammelt nachgeliefert). Ungültiges wird übersprungen, damit nichts hängen bleibt.
async function sync(req, res) {
  const s = spielerAus(req, res);
  if (!s) return;
  if (!H.erlaubt(`sync:${s.id}`, 30, 60e3)) return H.fehler(res, 429, 'Zu viele Anfragen');
  const b = await H.body(req, 64 * 1024);
  if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
  const rekorde = Array.isArray(b.rekorde) ? b.rekorde.slice(0, 50) : [];
  const runden = Array.isArray(b.runden) ? b.runden.slice(0, 50) : [];
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
  });
  // Name/Gruppe mitschicken – der Admin kann sie inzwischen geändert haben
  H.json(res, 200, { ok: true, neueRekorde: neu, uebersprungen, name: s.name, emoji: s.emoji, gruppe: s.gruppe || null });
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
  if (req.method === 'GET') return H.json(res, 200, { name: s.name, emoji: s.emoji, gruppe: s.gruppe || null });
  const b = await H.body(req);
  if (!b) return H.fehler(res, 400, 'Ungültige Anfrage');
  const name = b.name === undefined ? s.name : H.name(b.name);
  const emoji = b.emoji === undefined ? s.emoji : H.emoji(b.emoji);
  if (!name) return H.fehler(res, 400, 'Spitzname: 1–16 Buchstaben oder Ziffern');
  if (!emoji) return H.fehler(res, 400, 'Bitte ein Bild auswählen');
  q.spielerAendern.run(name, emoji, s.id);
  H.json(res, 200, { name, emoji, gruppe: s.gruppe || null });
}

function cors(req, res) {
  const o = req.headers.origin;
  if (!o || !ORIGINS.includes(o)) return {};
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
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
  if (r === 'GET /api/ping') return H.json(res, 200, { ok: true });
  if (r === 'POST /api/einloesen') return einloesen(req, res);
  if (r === 'POST /api/sync') return sync(req, res);
  if (r === 'GET /api/liste') return liste(req, res, url);
  if (r === 'GET /api/ich' || r === 'PATCH /api/ich') return ich(req, res);
  H.fehler(res, 404, 'Gibt es nicht');
}

// ---------- Dateien ----------
const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.gz': 'application/gzip', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
};
// Nur diese Teile der App werden ausgeliefert – nie server/, .git usw.
const APP_ERLAUBT = /^\/(index\.html|manifest\.json|sw\.js|(css|js|icons|vendor|models)\/[\w./-]+)$/;

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
  console.log(`Rechenheld-Server auf Port ${PORT}${APP ? ` (App aus ${APP})` : ''}${process.env.ADMIN_PASSWORT ? '' : ' – ADMIN_PASSWORT fehlt, /admin ist aus'}`);
});
