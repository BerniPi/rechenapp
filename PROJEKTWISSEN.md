# Projektwissen Rechenheld

> **Pflege-Regel:** Betrifft eine Änderung etwas, das hier beschrieben ist (Datei, Tabelle, Route, Regel, Befehl), wird diese Datei **im selben Commit** angepasst. Nur Dauerhaftes, nichts für eine einzelne Aufgabe.

## Überblick

Rechentrainer für die Volksschule als PWA. Kinder rechnen (tippen oder sprechen), verdienen Sterne und geben sie für Minispiele aus. Optionaler Node-Server für Online-Bestenliste, Konten und Admin-Seite.

- Frontend: reines HTML/CSS/JS, **kein Build-Schritt**, keine Abhängigkeiten, keine Module (globale Objekte, Reihenfolge der `<script>`-Tags in `index.html` zählt)
- Server: Node 24, **keine npm-Abhängigkeiten**, `node:http` + `node:sqlite` (experimentell → `--disable-warning=ExperimentalWarning`)
- Code, Bezeichner, Kommentare und Texte durchgehend **Deutsch**

| Ordner/Datei | Inhalt |
|---|---|
| `index.html` | alle Bildschirme als `<section class="screen">`: `benutzer`, `neu`, `anmeldung`, `start`, `runde`, `ergebnis`, `spiele`, `spiel`, `highscores`, `pin`, `eltern` |
| `css/style.css` | gesamtes Styling |
| `js/` | App-Logik (siehe Frontend) |
| `js/spiele/` | Minispiele + Register `spiele.js` |
| `sw.js` | Service Worker (Offline-Cache) |
| `server/` | Server, Admin-Seite (`server/admin/`), Docker |
| `audio/jonas/` | ~310 MP3-Wortschnipsel der Ersatz-Stimme |
| `models/` | Vosk-Sprachmodell Deutsch (tar.gz) |
| `vendor/vosk.js` | vosk-browser 0.0.8 |
| `tools/` | `test.js` (Selbsttest), `icon.js` (Icons), `stimme.py` (Schnipsel erzeugen) |

## Befehle

| Zweck | Befehl |
|---|---|
| App lokal (ohne Server) | `python -m http.server 8765` → http://localhost:8765 (launch.json: `rechenheld`) |
| Server lokal | `ADMIN_PASSWORT=test HINTER_PROXY=0 node --disable-warning=ExperimentalWarning server/server.js` → :8080 |
| Server lokal als piazzi | launch.json `server-piazzi` (Port 8081, Daten in `server/daten/piazzi`, Admin-PW `test`) |
| Tests | `node tools/test.js` |
| Typprüfung / Build | gibt es nicht |
| Docker | `docker compose -f server/docker-compose.yml up -d --build` (Env aus `server/.env`, Vorlage `.env.example`) |
| Zweite Instanz | `docker compose -p piazzi --env-file server/piazzi.env -f server/docker-compose.yml up -d --build` |
| Icons | `node tools/icon.js` |
| Stimme neu | `python tools/stimme.py` (Azure mit `AZURE_SPEECH_KEY`/`_REGION`, sonst edge-tts) |

`tools/test.js` prüft: Aufgaben-Generator je Übung (keine negativen Ergebnisse, keine Reste, eindeutige Lücken, Zehnerübergang wie angegeben), Rekord-Schlüssel und Umstellung alter Schlüssel, Zahlwort-Parser, Jonas-Schnipsel vollständig, Level-Generatoren Schrauben/Unblock, Server-Helfer (`hilfe.js`: Benutzername, Mail, Klassen-CSV, Passwort-Hash). Kein Test für HTTP-Routen oder UI.

## Frontend

Einstieg: `index.html` lädt der Reihe nach `speicher → online → aufgaben → ton → vosk-erkennung → sprache → spiele/* → app.js`.

| Datei | Zuständig für |
|---|---|
| `js/app.js` | gesamte UI in einer IIFE: Bildschirme, Rechenrunde, Auswertung/Sterne, Rekorde, Spiele-Auswahl, Eltern-Bereich + PIN, Online-UI, Anmelde-Bildschirm, Spielerwahl. Abschnitte mit `// ---------- … ----------` |
| `js/speicher.js` | `Speicher`: localStorage je Spieler, Standardwerte (`standard()`), Migrationen alter Daten in `laden()` |
| `js/online.js` | `Online`: Server-Anfragen, Verbinden (Code/Konto/SSO), Warteschlange für offline, `senden()` = `POST /api/sync` |
| `js/aufgaben.js` | `Aufgaben`: Übungs-Katalog `UEBUNGEN`, Generator `erzeuger({uebungen, einsetzen})`, `alsText`, `alsSatz`, `zielzeit(auf, sprechen)`, `sterne({gestellt, falsch, zeit, ziel})`, Umstellung alter Schlüssel `alterSchluessel`/`alteUebungen`. Wird auch vom Server per `require('../js/aufgaben.js')` genutzt |
| `js/sprache.js` | `Zahlwort` (Parser Wörter→Zahl, inkl. Verhörer „nein“→9), `Jonas` (Ersatz-Stimme aus Schnipseln), `Sprache` (Vorlesen/Erkennen) |
| `js/vosk-erkennung.js` | Offline-Erkennung, Grammatik nur Zahlwörter 0–100 |
| `js/ton.js` | Töne per WebAudio |
| `js/spiele/spiele.js` | `Spiele.registrieren(def)`, Schnittstelle der Spiele (siehe Kommentar dort), `spielCanvas`, `levelBilanz` |

**Minispiele:** `flappy`, `snake`, `bloecke`, `tierturm`, `schrauben`, `unblock` (Anzeigenamen markenrechtlich neutral halten: Flattervogel, Apfelschlange, Farbblöcke, Tierturm, Schrauben, Ausparken). Alle `zeitlimit: 60`. Level-Spiele (Schrauben, Unblock) laufen bis zum Zeitlimit Level für Level, Stand bleibt in `spielstand`. Level-Generatoren sind deterministisch (gleiche Nummer = gleiches Level) und exportieren für Node (`module.exports`).

### Lokale Daten (localStorage)

| Schlüssel | Inhalt |
|---|---|
| `rechenheld-benutzer` | `{ liste: [{ id, name, bild: {art:'emoji'\|'foto', wert} }], aktiv }` |
| `rechenheld-v1:<id>` | Daten eines Spielers: `settings`, `sterne`, `rekorde`, `verlauf`, `spielstand`, `online`, `eltern` |
| `rechenheld-v1` | Altdaten vor Mehrspieler → gehen an den ersten neu angelegten Spieler |
| `rechenheld-pin` | Eltern-PIN (4 Ziffern, für das ganze Gerät) |

Neue Felder: Standardwert in `Speicher.standard()` setzen; `laden()` mischt gespeicherte Daten darüber. Umbenennungen/Umbauten als Migration in `laden()`.

## Server

Einstieg `server/server.js` (ein `http.createServer`, Routing per `"${METHODE} ${pfad}"`-Vergleich in `api()`).

| Datei | Inhalt |
|---|---|
| `server.js` | Spieler-API, Auslieferung der App (nur Pfade aus `APP_ERLAUBT`) |
| `admin.js` | `/admin` + `/admin/api/*` (Login per Cookie, 12 h; schreibende Aufrufe brauchen Header `X-Admin: 1`) |
| `admin/` | Admin-Oberfläche (HTML/CSS/JS) |
| `db.js` | SQLite-Schema + Migrationen, `transaktion(fn)` |
| `hilfe.js` | Validierung (Name, Emoji, Benutzername, Mail, Rekord-Key/-Wert), JSON-Antworten, Hashing, scrypt-Passwörter, Rate-Limit `erlaubt()`, `ip()` |
| `einstellungen.js` | `ANMELDUNG`, `DOMAIN`, MS-Daten, `ADRESSE` aus Env |
| `sso.js` | Microsoft-Login (bgbb): start → rückruf → `/#sso=<Übergabe>` → einlösen |

**Env:** `PORT` (8080), `DATEN` (Ordner der DB), `ADMIN_PASSWORT` (fehlt → /admin aus), `ERLAUBTE_ORIGIN` (CORS, Komma-Liste), `APP` (App-Ordner, leer = nur API), `HINTER_PROXY` (`0` = X-Forwarded-For ignorieren), `ANMELDUNG` (`codes`|`piazzi`|`bgbb`), `MAIL_DOMAIN`, `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `OEFFENTLICHE_ADRESSE`, `MS_LOGIN_BASIS` (nur Tests).

### Routen `/api`

| Route | Wann | Zweck |
|---|---|---|
| `GET /ping` | immer | `{anmeldung, domain}` – App entscheidet daran, welche Anmeldung sie zeigt |
| `POST /einloesen` | codes | Einmal-Code → Spieler + Geräte-Schlüssel |
| `POST /konto`, `POST /anmelden`, `GET /konten` | piazzi | Konto anlegen, anmelden, öffentliche Kontenliste (Name + Emoji) |
| `GET /sso/start`, `GET /sso/rueckruf`, `POST /sso/einloesen` | bgbb | Microsoft-Login |
| `POST /sync` | Bearer | Rekorde, Runden, Sterne-Buchungen hochladen; Antwort mit Name, Gruppe, Rekorden, Kontostand |
| `GET /liste?key=&bereich=gruppe` | Bearer | eine Bestenliste (Top 20 + eigener Platz) |
| `GET /bestenlisten?bereich=` | Bearer | alle Kategorien, je Top 5 + eigener Platz |
| `GET/PATCH/DELETE /ich` | Bearer | eigene Daten, Name/Emoji/Passwort ändern, Gerät abmelden |

Auth: `Authorization: Bearer <schluessel>`; gespeichert wird nur `sha256` in Tabelle `schluessel` (ein Schlüssel pro Gerät).

## Datenmodell (SQLite `rechenheld.db`)

| Tabelle | Schlüssel | Inhalt |
|---|---|---|
| `gruppen` | `id` | Klassen, `name` UNIQUE NOCASE |
| `spieler` | `id` (Text, zufällig) | `name`, `emoji`, `gesperrt`, `gruppe_id`, `benutzername` (UNIQUE NOCASE wenn gesetzt), `pw_hash`, `email`, `ms_oid`; `schluessel_hash` ist Altlast (bei Konten Platzhalter `konto:…`) |
| `schluessel` | `hash` | Geräte-Schlüssel → `spieler_id`, `zuletzt` (max. stündlich aktualisiert) |
| `codes` | `id` | Einmal-Codes, nur `hash` + `ende` (letzte 4 Zeichen), `used_at`, `widerrufen`, `gruppe_id` |
| `rekorde` | (`spieler_id`, `key`) | bester Wert je Kategorie |
| `runden` | `id`, UNIQUE (`spieler_id`, `client_id`) | jede Rechenrunde (`typ='rechnen'`, Übungen in `uebungen`; `ops`/`raum` nur bei alten Runden) bzw. jedes Minispiel (`typ='spiel'`) |
| `sterne_buchungen` | `id`, UNIQUE (`spieler_id`, `client_id`) | `delta` ±, `grund` ∈ `runde`/`spiel`/`eltern`/`start`; Kontostand = Summe |
| `erlaubte_adressen` | `email` | piazzi: freigegebene Adressen (mehrere Konten pro Adresse erlaubt) |
| `klassen_zuordnung` | `benutzername` | bgbb: Klasse aus CSV-Import, gilt auch vor dem ersten Login |

**Migrationen:** keine Versionsnummern. Neue Tabellen mit `CREATE TABLE IF NOT EXISTS`, neue Spalten über `spalte(tabelle, name, def)` in `db.js` (prüft `PRAGMA table_info`). Läuft bei jedem Start. Nur additiv ändern.

## Fachliche Regeln und Fallstricke

- **Übungen** statt Rechenart × Zahlenraum: Einträge in `Aufgaben.UEBUNGEN` mit `id`, `gruppe` (Klasse), `name`, `beispiel`, `ziel` (Zielzeit s), `erzeuge()` → `[a, op, b, c]`. Startbildschirm baut die Chips daraus. Neue Übung = neuer Eintrag + Grenzen in `tools/test.js` (`GRENZE`). Die **`id` nie ändern**, Rekorde hängen daran. Geplant: negative Zahlen, Brüche, Klapustri (Klammer vor Punkt vor Strich); dafür Aufgaben-Format und Tastatur erweitern.
- **Rekord-Key** `modus|art|uebungen|E` (z. B. `schrift|zehn|plus20,plus20u|`), Übungen sortiert, ohne Doppelte, mit Komma (`Aufgaben.uebungenTeil`). Aufbau in `app.js` `schluessel()`, Prüfung in `hilfe.js` `rekordKey()` (nutzt denselben Katalog).
- Alte Schlüssel `modus|art|ops|raum|E` stellt `Aufgaben.alterSchluessel` um: im Gerät (`Speicher.uebungenUmstellen`), beim Serverstart (`db.js`, auch `runden.uebungen`) und bei jedem `/sync` älterer App-Versionen. Fallen Schlüssel zusammen (bis 50 und bis 100 → `plus100,plus100u`), bleibt der bessere Wert.
- Dockerfile kopiert `js/aufgaben.js` nach `/app/js`, damit der Server ihn findet.
- Rekorde nur für feste Längen: `zehn` (10 Aufgaben), `a20` (20 Aufgaben) → kleinere Zeit besser; `m1`, `m5` (1/5 Minuten) → mehr Punkte besser. Server-Grenzen in `rekordWert()`.
- **Emoji-Liste** existiert doppelt: `server/hilfe.js` `EMOJIS` und `js/app.js` `BILDER`. Neue Bilder in beiden eintragen, sonst lehnt der Server sie ab.
- Zeit-Modus: Punkte = richtig − ⌊falsch / 4⌋ (`FEHLER_PRO_PUNKT`).
- Aufgaben-Modus Rekord: Zeit + falsch × `eltern.strafe` Sekunden.
- **Sterne 1–5** (`Aufgaben.sterne`): Genauigkeit zuerst, dann Zeit ÷ Zielzeit. Zielzeit der Runde = Summe `Aufgaben.zielzeit` der beantworteten Aufgaben × Tempo-Faktor (`eltern.tempo`: gemuetlich 1,5 / normal 1 / flott 0,8). Zeit-Modus rechnet mit der ganzen Rundendauer. 5 ⭐ fehlerfrei ≤ 1×, 4 ⭐ ≤ max(1, n/20) Fehler ≤ 1,4×, 3 ⭐ ≥ 90 % ≤ 2×, 2 ⭐ ≥ 80 %, 1 ⭐ ≥ 50 %, sonst 0. Kein Anpassen ans eigene Tempo (gab es früher, wurde verworfen: Fortschritt war unsichtbar). Alte Felder `tempo`, `eltern.anpassen/zehn/minute` entfernt `Speicher.laden()`.
- Spielpreis `eltern.preis` (Standard 10, mind. 1); genau eine Runde à 60 s pro Kauf.
- **Sterne-Abgleich:** Änderungen nur als Buchung über `Online.merkeSterne(d, delta, grund)`, nie `d.sterne` allein ändern, wenn verbunden. Kontostand kommt vom Server. Neues Konto: Gerätesterne werden Startguthaben (`grund: 'start'`); Anmelden an bestehendem Konto ersetzt die Gerätesterne.
- `client_id` macht Runden und Buchungen idempotent (`INSERT OR IGNORE`) → Wiederholtes Senden aus der Warteschlange ist unschädlich. `/sync` überspringt Ungültiges, statt abzubrechen.
- Zeitstempel vom Gerät werden auf [jetzt − 1 Jahr, jetzt] begrenzt.
- Online sichtbar sind nur Spitzname + Emoji, nie Fotos.
- `ip()` nimmt den **letzten** X-Forwarded-For-Eintrag (vom eigenen Proxy). Lokal ohne Proxy `HINTER_PROXY=0`.
- Routen für eine `ANMELDUNG`-Art gibt es nur, wenn sie aktiv ist (sonst 404).
- Admin „Geräte abmelden“ setzt zusätzlich `schluessel_hash` auf `konto:…`, sonst übernimmt `db.js` den Altschlüssel beim nächsten Start wieder.
- **Service Worker:** nach jeder Änderung an App-Dateien `VERSION` in `sw.js` hochzählen. Neue JS-Datei → auch in `DATEIEN` eintragen. Werden Dateien in `audio/`, `models/`, `vendor/` ausgetauscht → `GROSS` hochzählen (Cache-first, sonst behalten Geräte die alten).
- Neue App-Ordner/Dateitypen: im Server `APP_ERLAUBT` und `TYPEN` ergänzen, im `Dockerfile` mitkopieren.
- Mikrofon und Installation brauchen HTTPS (oder localhost).
- Nicht im Repo: `server/.env`, `server/*.env`, `server/daten/`, `.claude/`.

## Arbeitsweise

- Commits: Conventional Commits auf Deutsch, z. B. `feat(sterne): …`, `fix(server): …`, `refactor(spiele): …`. Bereiche bisher: `sprache`, `tippen`, `sterne`, `spiele`, `ton`, `server`, `zeit`, `ergebnis`, `anmeldung`.
- Hauptzweig `main`; Server-Arbeit läuft auf Zweig `server`.
- Vor dem Commit `node tools/test.js`. Neue Generatoren/Parser/Server-Helfer dort mit Tests abdecken.
- Neue Funktionen auch im `README.md` beschreiben (Nutzersicht); hier nur Entwicklerwissen.
- Stil: 2 Leerzeichen, einfache Anführungszeichen, Semikolons, kurze deutsche Kommentare über dem „Warum“.
- Keine Datei mit „CLAUDE“ im Namen im Projekt.
