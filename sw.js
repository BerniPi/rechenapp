// Service Worker: hält die App offline verfügbar.
// Bei jeder Änderung an Dateien VERSION erhöhen, damit Geräte die neue Fassung laden.
const VERSION = 'rechenheld-16';
// Sprachmodell, Vosk-Bibliothek und Stimm-Schnipsel, bleibt über Updates erhalten.
// Werden Dateien darin ausgetauscht (z. B. audio/jonas neu erzeugt), Namen erhöhen.
const GROSS = 'rechenheld-gross-1';
const DATEIEN = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/speicher.js', 'js/online.js', 'js/aufgaben.js', 'js/ton.js', 'js/vosk-erkennung.js', 'js/sprache.js', 'js/app.js',
  'js/spiele/spiele.js', 'js/spiele/flappy.js', 'js/spiele/snake.js', 'js/spiele/bloecke.js',
  'js/spiele/tierturm.js', 'js/spiele/schrauben.js', 'js/spiele/unblock.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== GROSS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Erst Netz (damit Updates sofort ankommen), sonst Cache.
self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  // Bestenliste (API) und fremde Server nie aus dem Cache
  const url = new URL(ev.request.url);
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;
  // Große Dateien ändern sich nie: erst Cache, nur beim ersten Mal aus dem Netz.
  if (/\/(models|vendor|audio)\//.test(new URL(ev.request.url).pathname)) {
    ev.respondWith(
      caches.open(GROSS).then((c) => c.match(ev.request).then((treffer) => treffer || fetch(ev.request).then((antwort) => {
        if (antwort.ok) c.put(ev.request, antwort.clone());
        return antwort;
      }))),
    );
    return;
  }
  ev.respondWith(
    fetch(ev.request)
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(VERSION).then((c) => c.put(ev.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(ev.request)),
  );
});
