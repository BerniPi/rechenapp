// Anmeldung mit dem Microsoft-Schulkonto (OpenID Connect, Authorization Code + PKCE) – ohne fremde Pakete.
// Ablauf: App → /api/sso/start → Microsoft → /api/sso/rueckruf → App /#sso=<Übergabe> → POST /api/sso/einloesen
const crypto = require('node:crypto');
const E = require('./einstellungen');

const DAUER = 10 * 60e3;
const offen = new Map(); // state → { verifier, bis }

const bereit = () => !!(E.MS.tenant && E.MS.client && E.MS.geheim && E.ADRESSE);
const rueckrufAdresse = () => `${E.ADRESSE}/api/sso/rueckruf`;
const b64 = (buf) => buf.toString('base64url');

// Weiterleitung zu Microsoft
function startAdresse() {
  const state = b64(crypto.randomBytes(24));
  const verifier = b64(crypto.randomBytes(32));
  offen.set(state, { verifier, bis: Date.now() + DAUER });
  const p = new URLSearchParams({
    client_id: E.MS.client,
    response_type: 'code',
    redirect_uri: rueckrufAdresse(),
    response_mode: 'query',
    scope: 'openid profile email',
    state,
    code_challenge: b64(crypto.createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${E.MS.basis}/${encodeURIComponent(E.MS.tenant)}/oauth2/v2.0/authorize?${p}`;
}

// Code gegen Token tauschen und die Angaben aus dem id_token prüfen → { oid, email } oder Fehler
async function rueckruf(url) {
  const fehler = url.searchParams.get('error');
  if (fehler) throw new Error(fehler === 'access_denied' ? 'Anmeldung abgebrochen' : 'Microsoft hat die Anmeldung abgelehnt');
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const o = offen.get(state);
  offen.delete(state);
  if (!o || o.bis < Date.now() || !code) throw new Error('Anmeldung abgelaufen – bitte nochmal');

  const r = await fetch(`${E.MS.basis}/${encodeURIComponent(E.MS.tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: E.MS.client,
      client_secret: E.MS.geheim,
      grant_type: 'authorization_code',
      code,
      redirect_uri: rueckrufAdresse(),
      code_verifier: o.verifier,
    }),
    signal: AbortSignal.timeout(10e3),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || typeof j.id_token !== 'string') throw new Error('Microsoft-Anmeldung fehlgeschlagen');

  // Das id_token kommt direkt per TLS vom Token-Endpunkt; laut OIDC Core 3.1.3.7 genügt dann die Prüfung der Angaben.
  let c;
  try { c = JSON.parse(Buffer.from(j.id_token.split('.')[1], 'base64url').toString('utf8')); } catch (e) { c = null; }
  const jetzt = Date.now() / 1000;
  if (!c || c.aud !== E.MS.client || c.tid !== E.MS.tenant || c.iss !== `${E.MS.basis}/${E.MS.tenant}/v2.0`
    || !(c.exp > jetzt) || typeof c.oid !== 'string') throw new Error('Microsoft-Anmeldung ungültig');
  return { oid: c.oid, email: String(c.preferred_username || c.email || c.upn || '') };
}

// Einmalige Übergabe an die App (60 s), damit der Geräteschlüssel nie in einer Adresse steht
const uebergaben = new Map(); // token → { spielerId, bis }
function uebergabe(spielerId) {
  const t = b64(crypto.randomBytes(24));
  uebergaben.set(t, { spielerId, bis: Date.now() + 60e3 });
  return t;
}
function einloesen(t) {
  const u = uebergaben.get(String(t || ''));
  uebergaben.delete(String(t || ''));
  return u && u.bis > Date.now() ? u.spielerId : null;
}

setInterval(() => {
  const jetzt = Date.now();
  for (const [k, v] of offen) if (v.bis < jetzt) offen.delete(k);
  for (const [k, v] of uebergaben) if (v.bis < jetzt) uebergaben.delete(k);
}, 60e3).unref();

module.exports = { bereit, startAdresse, rueckruf, uebergabe, einloesen };
