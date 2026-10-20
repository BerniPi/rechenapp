// Einstellungen aus der Umgebung, die Server und Admin gemeinsam brauchen.
//   ANMELDUNG     codes (Einmal-Codes, Standard) | piazzi (Konto mit freigegebener Adresse + Passwort) | bgbb (Microsoft-Schulkonto)
//   MAIL_DOMAIN   erlaubte Adressen, Standard piazzi.at bzw. bgblumenstrasse.at
//   Nur bgbb:     MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, OEFFENTLICHE_ADRESSE (z. B. https://rechnen.bgblumenstrasse.at)
const ANMELDUNG = ['codes', 'piazzi', 'bgbb'].includes(process.env.ANMELDUNG) ? process.env.ANMELDUNG : 'codes';
const STANDARD_DOMAIN = { piazzi: 'piazzi.at', bgbb: 'bgblumenstrasse.at' };

module.exports = {
  ANMELDUNG,
  DOMAIN: (process.env.MAIL_DOMAIN || STANDARD_DOMAIN[ANMELDUNG] || '').toLowerCase(),
  MS: {
    tenant: process.env.MS_TENANT_ID || '',
    client: process.env.MS_CLIENT_ID || '',
    geheim: process.env.MS_CLIENT_SECRET || '',
    // Nur zum Testen mit einem nachgebauten Anmeldedienst überschreiben
    basis: (process.env.MS_LOGIN_BASIS || 'https://login.microsoftonline.com').replace(/\/+$/, ''),
  },
  ADRESSE: (process.env.OEFFENTLICHE_ADRESSE || '').replace(/\/+$/, ''),
};
