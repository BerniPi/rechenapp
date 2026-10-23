// Kleine Helfer für den Server: Antworten, Anfrage-Body, Hashes, Prüfungen, Rate-Limit.
const crypto = require('node:crypto');

const SICHER = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(res, status, daten, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SICHER, ...extra });
  res.end(JSON.stringify(daten));
}
function fehler(res, status, meldung, extra) { json(res, status, { fehler: meldung }, extra); }

// Liest den JSON-Body; zu groß oder kaputt → null
function body(req, max = 2048) {
  return new Promise((ok) => {
    let teile = [];
    let groesse = 0;
    let zuGross = false;
    req.on('data', (c) => {
      groesse += c.length;
      if (groesse > max) { zuGross = true; teile = []; return; }
      teile.push(c);
    });
    req.on('end', () => {
      if (zuGross) return ok(null);
      if (!groesse) return ok({});
      try { ok(JSON.parse(Buffer.concat(teile).toString('utf8'))); } catch (e) { ok(null); }
    });
    req.on('error', () => ok(null));
  });
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function gleich(a, b) {
  const x = Buffer.from(sha(String(a)));
  const y = Buffer.from(sha(String(b)));
  return crypto.timingSafeEqual(x, y);
}

// Codes: RH-XXXX-XXXX ohne verwechselbare Zeichen (0/O, 1/I)
const ZEICHEN = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function neuerCode() {
  const b = crypto.randomBytes(8);
  const z = [...b].map((x) => ZEICHEN[x % ZEICHEN.length]).join('');
  return { klartext: `RH-${z.slice(0, 4)}-${z.slice(4)}`, kern: z };
}
// „rh 7k3p q9wx" → „7K3PQ9WX"
function codeKern(eingabe) {
  const s = String(eingabe || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^RH/, '');
  return /^[2-9A-HJ-NP-Z]{8}$/.test(s) ? s : null;
}

const neuerSchluessel = () => crypto.randomBytes(32).toString('base64url');
const neueId = () => crypto.randomBytes(9).toString('base64url');

// Dieselbe Bilder-Liste wie in der App (js/app.js BILDER) – keine Fotos, keine beliebigen Zeichen.
const EMOJIS = ['🚗', '✈️', '🐴', '🦄', '🚀', '🚒', '🚜', '🐶', '🐱', '🦁', '🐼', '🦊', '🐸', '🦖', '🐬', '🦋', '⚽', '🌈', '🙂',
  '🐰', '🐻', '🐨', '🐯', '🐮', '🐷', '🐵', '🐧', '🐢', '🐙', '🦈', '🐳', '🦒', '🐘', '🦓', '🦔', '🐝', '🐞', '🦜', '🦉', '🐲', '🦕', '🌻', '🍓', '🍕', '🍦', '🎈', '🌙', '🏀', '🎸', '🚂', '🚁', '⛵', '👑', '🧸', '🎨', '🤖', '👻'];

function name(n) {
  const s = String(n || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return /^[\p{L}\p{N} ._-]{1,16}$/u.test(s) ? s : null;
}
const emoji = (e) => (EMOJIS.includes(e) ? e : null);
function gruppenName(n) {
  const s = String(n || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return /^[\p{L}\p{N} ._-]{1,20}$/u.test(s) ? s : null;
}

// ---------- Konten ----------
// Benutzername: 2–40 Buchstaben/Ziffern (bei der Schule = Teil der Adresse vor dem @), . _ - erlaubt, keine Leerzeichen
function benutzername(n) {
  const s = String(n || '').normalize('NFC').trim();
  return /^[\p{L}\p{N}._-]{2,40}$/u.test(s) ? s : null;
}
const passwort = (p) => (typeof p === 'string' && p.length >= 6 && p.length <= 200 ? p : null);
// Adresse klein geschrieben, wenn sie auf @domain endet
function email(e, domain) {
  const s = String(e || '').trim().toLowerCase();
  if (s.length > 120 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(s)) return null;
  return s.endsWith(`@${String(domain).toLowerCase()}`) ? s : null;
}

// Passwörter mit scrypt (eingebaut, langsam genug gegen Durchprobieren)
function pwHash(pw) {
  const salz = crypto.randomBytes(16);
  return new Promise((ok, nein) => crypto.scrypt(pw, salz, 32, (err, h) => (err ? nein(err) : ok(`scrypt$${salz.toString('base64url')}$${h.toString('base64url')}`))));
}
function pwPruefen(pw, gespeichert) {
  const [art, salz, hash] = String(gespeichert || '').split('$');
  // Ohne Hash trotzdem rechnen, damit die Antwortzeit nichts verrät
  const s = art === 'scrypt' && salz ? Buffer.from(salz, 'base64url') : crypto.randomBytes(16);
  return new Promise((ok) => crypto.scrypt(String(pw), s, 32, (err, h) => {
    if (err || art !== 'scrypt' || !hash) return ok(false);
    const soll = Buffer.from(hash, 'base64url');
    ok(soll.length === h.length && crypto.timingSafeEqual(soll, h));
  }));
}
// Einmal-Passwort für „Passwort zurücksetzen" im Admin
const neuesPasswort = () => Array.from(crypto.randomBytes(10), (x) => ZEICHEN[x % ZEICHEN.length]).join('').toLowerCase();

// CSV „benutzername;klasse" oder „email;klasse" (Trenner ; , oder Tab, Kopfzeile optional)
// → { zeilen: [{ benutzername, klasse }], fehler: [{ zeile, text }] }
function klassenCsv(text, domain) {
  const zeilen = [];
  const fehler = [];
  const roh = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  roh.forEach((z, i) => {
    if (!z.trim()) return;
    const teile = z.split(/[;,\t]/).map((t) => t.trim().replace(/^"(.*)"$/, '$1').trim());
    if (i === 0 && /^(benutzer(name)?|e-?mail|name|user(name)?)$/i.test(teile[0]) && /^(klasse|gruppe|class)$/i.test(teile[1] || '')) return;
    let n = teile[0] || '';
    if (n.includes('@')) {
      const e = email(n, domain);
      if (!e) { fehler.push({ zeile: i + 1, text: `Adresse ist nicht @${domain}` }); return; }
      n = e.split('@')[0];
    }
    const b = benutzername(n);
    const k = gruppenName(teile[1]);
    if (!b) { fehler.push({ zeile: i + 1, text: `Benutzername „${n.slice(0, 30)}" ungültig` }); return; }
    if (!k) { fehler.push({ zeile: i + 1, text: 'Klasse fehlt oder ungültig' }); return; }
    zeilen.push({ benutzername: b.toLowerCase(), klasse: k });
  });
  return { zeilen, fehler };
}

// Rekord-Schlüssel wie rekordSchluessel() in js/app.js: modus|art|ops|raum|E
const KEY = /^(schrift|sprache)\|(zehn|a20|m1|m5)\|([*+\-/]{1,4})\|(10|20|50|100)\|(E?)$/;
function rekordKey(k) {
  const m = KEY.exec(String(k || ''));
  if (!m) return null;
  const ops = m[3];
  if (new Set(ops).size !== ops.length || [...ops].sort().join('') !== ops) return null;
  return { key: m[0], art: m[2] };
}
// Bei Aufgaben zählt die kleinste Zeit, bei Zeit die meisten Punkte.
const kleinerBesser = (art) => art === 'zehn' || art === 'a20';

// Realistische Grenzen, damit Tippfehler/Unsinn nicht in die Liste kommt.
function rekordWert(art, w) {
  if (!Number.isInteger(w)) return false;
  if (art === 'zehn') return w >= 5 && w <= 3600;
  if (art === 'a20') return w >= 10 && w <= 3600;
  if (art === 'm1') return w >= 1 && w <= 60;
  if (art === 'm5') return w >= 1 && w <= 300;
  return false;
}

// Zeitstempel vom Gerät: nicht in der Zukunft, nicht älter als ein Jahr
function datum(t) {
  const jetzt = Date.now();
  if (!Number.isFinite(t)) return jetzt;
  return Math.round(Math.min(jetzt, Math.max(jetzt - 365 * 864e5, t)));
}

// Einfaches Rate-Limit im Speicher: höchstens n Treffer pro Fenster
const toepfe = new Map();
function erlaubt(schluessel, n, fensterMs) {
  const jetzt = Date.now();
  let t = toepfe.get(schluessel);
  if (!t || t.bis < jetzt) { t = { n: 0, bis: jetzt + fensterMs }; toepfe.set(schluessel, t); }
  t.n += 1;
  return t.n <= n;
}
setInterval(() => {
  const jetzt = Date.now();
  for (const [k, t] of toepfe) if (t.bis < jetzt) toepfe.delete(k);
}, 60e3).unref();

function ip(req) {
  if (process.env.HINTER_PROXY !== '0') {
    // Der letzte Eintrag stammt vom eigenen Proxy – die davor kann jeder Aufrufer selbst setzen.
    const f = req.headers['x-forwarded-for'];
    if (f) return String(f).split(',').pop().trim() || req.socket.remoteAddress || '?';
  }
  return req.socket.remoteAddress || '?';
}

module.exports = {
  SICHER, json, fehler, body, sha, gleich, neuerCode, codeKern, neuerSchluessel, neueId,
  EMOJIS, name, emoji, gruppenName, rekordKey, kleinerBesser, rekordWert, datum, erlaubt, ip,
  benutzername, passwort, email, pwHash, pwPruefen, neuesPasswort, klassenCsv,
};
