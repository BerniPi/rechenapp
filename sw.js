// Service Worker: hält die App offline verfügbar.
// Bei jeder Änderung an Dateien VERSION erhöhen, damit Geräte die neue Fassung laden.
const VERSION = 'rechenheld-6';
const GROSS = 'rechenheld-gross-1'; // Sprachmodell + Vosk-Bibliothek, bleibt über Updates erhalten
const DATEIEN = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/speicher.js', 'js/aufgaben.js', 'js/ton.js', 'js/vosk-erkennung.js', 'js/sprache.js', 'js/app.js',
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
  // Große Dateien ändern sich nie: erst Cache, nur beim ersten Mal aus dem Netz.
  if (/\/(models|vendor)\//.test(new URL(ev.request.url).pathname)) {
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
