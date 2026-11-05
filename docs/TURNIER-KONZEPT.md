# Konzept: Turniermodus für RechenArena

> **Auftrag an Gemini:** Setze den hier beschriebenen Turniermodus im Projekt RechenArena um. Lies zuerst `PROJEKTWISSEN.md` (Zweig `server`) und halte dich an die dortigen Regeln: kein Build-Schritt, keine npm-Abhängigkeiten, alles auf Deutsch (Code, Bezeichner, Kommentare, Texte), 2 Leerzeichen, einfache Anführungszeichen, Semikolons, Conventional Commits auf Deutsch (`feat(turnier): …`). Arbeite auf einem eigenen Zweig, der von `server` abzweigt. Setze die Arbeit in den Etappen aus Abschnitt 11 um und lass nach jeder Etappe `node tools/test.js` laufen. Ist etwas unklar, entscheide nach Abschnitt 12 oder frag nach.

## 1. Ziel

Eine Lehrkraft veranstaltet in der Klasse ein Rechen-Turnier. Die Schülerinnen und Schüler machen mit dem eigenen Handy mit, ohne Konto, ohne Installation und ohne Anmeldung.

Ablauf in einem Satz: Die Lehrkraft erstellt ein Turnier, wählt Übungen und Format und zeigt einen QR-Code am Beamer. Die Kinder scannen ihn, wählen Spitzname und Bild und landen im Wartebereich. Die Lehrkraft startet Runde für Runde (Gruppenphase, K.-o.-Duelle …) und zeigt nach jeder Runde die Ergebnisse.

Adresse: `https://rechenarena.bgblumenstrasse.at/turnier` (gilt für jede Instanz unter `/turnier`, unabhängig von `ANMELDUNG`).

## 2. Rollen und Zugriff

| Rolle | Gerät | Zugriff |
|---|---|---|
| **Lehrkraft (Leitung)** | Laptop am Beamer | öffnet `/turnier` und erstellt ein Turnier. Kein Login. Bekommt einen geheimen **Leitungs-Schlüssel**, der nur in `localStorage` ihres Browsers liegt. |
| **Kind (Teilnehmer)** | Handy | scannt den QR-Code → `/turnier/#ABCD` → wählt Name und Bild → bekommt einen **Teilnehmer-Schlüssel** (in `sessionStorage` und `localStorage`, damit ein Neuladen oder ein kurzer Netzausfall nichts kaputt macht) |
| **Zuschauer** (optional) | beliebig | `/turnier/#ABCD?zuschauen` zeigt nur die Anzeige ohne Steuerung |

- Bewusst **öffentlich ohne Zugriffsbeschränkung**. Geschützt wird nur, *wer steuern darf*: Der Leitungs-Schlüssel sind 32 Zufallsbytes (`H.neuerSchluessel()`), der Server speichert nur seinen `sha256`.
- **Turnier-Code**: 4 Zeichen aus `H.ZEICHEN` (ohne 0/O/1/I). Er ist kurz, damit man ihn auch abtippen kann. Kollisionen prüft der Server mit allen laufenden Turnieren.
- Nur Spitzname und Emoji, **nie Fotos** (Regel aus PROJEKTWISSEN: „Online sichtbar sind nur Spitzname + Emoji“). Die Emoji-Liste kommt aus `H.EMOJIS`, die Prüfung des Namens aus `H.name()`.
- Ein Turnier verändert **keine Sterne, Rekorde oder Bestenlisten**. Es hat mit Konten nichts zu tun.

## 3. Ablauf im Detail

### 3.1 Lehrkraft

1. **Erstellen** (`/turnier`, Knopf „Neues Turnier“)
   - Titel (optional, z. B. „3b Einmaleins-Cup“)
   - **Übungen**: Chips aus `Aufgaben.UEBUNGEN`, gruppiert nach Klasse, genauso wie am Startbildschirm der App (mehrere wählbar), dazu „Einsetzaufgaben“ ein oder aus
   - **Rundenlänge**: entweder *Aufgaben* (5/10/20, wer zuerst fertig ist) oder *Zeit* (30 s / 1 min / 2 min, wer mehr schafft)
   - **Format** (siehe Abschnitt 4): *Sprint* (alle gleichzeitig), *Gruppenphase → K.-o.*, *nur K.-o.*, *Liga* (mehrere Sprints mit Punkten)
   - Eingabe: nur **Tippen**. Sprechen ist im Klassenzimmer zu laut und auf fremden Handys unzuverlässig.
2. **Lobby**: großer QR-Code, darunter Code und Adresse in Großschrift („rechenarena.bgblumenstrasse.at/turnier · Code **K7MQ**“). Daneben ein Raster der beigetretenen Kinder (Emoji + Name) mit Zähler „17 da“. Pro Kind gibt es ein ✕ zum Entfernen, falls jemand Unsinn als Namen eingibt. Knopf **„Beitritt schließen“** (optional) und **„Turnier starten“**.
3. **Runde vorbereiten**: Der Server bildet die Paarungen bzw. Gruppen, die Lehrkraft sieht sie als Vorschau. Sie kann mit „Neu mischen“ neu losen oder auf „Runde starten“ drücken.
4. **Runde läuft**: Ein Countdown von 3-2-1 läuft auf allen Geräten gleichzeitig. Am Beamer steht eine **Live-Anzeige**: pro Duell bzw. Gruppe die Fortschrittsbalken (richtig/falsch), ohne die Aufgaben selbst. Knöpfe: „Runde abbrechen“ und „Runde beenden“ (für Nachzügler, nach einer Mindestzeit).
5. **Ergebnis der Runde**: Gewinner hervorgehoben, Tabelle bzw. Turnierbaum aktualisiert, Knopf **„Nächste Runde“**.
6. **Siegerehrung**: Podest mit den Plätzen 1 bis 3 und Konfetti, darunter der ganze Turnierbaum bzw. die Endtabelle. Knöpfe „Neues Turnier mit denselben Kindern“ und „Beenden“.

### 3.2 Kind

1. **Beitreten** (`/turnier/#K7MQ`, der Code kommt aus dem QR-Code; ohne Code gibt es ein Eingabefeld): Spitzname (2 bis 20 Zeichen) und ein Bild aus dem Emoji-Raster → „Mitmachen“. Ist der Name schon vergeben, sagt der Server das. Mögliche Antwort: „Lena gibt es schon – nimm z. B. Lena B.“
2. **Wartebereich**: das eigene Emoji groß, dazu „Warte auf den Start …“ und die Anzahl der anderen. Mit kleiner Animation, damit man sieht, dass die Seite noch lebt.
3. **Vor der Runde**: „Du spielst gegen 🦊 Max“ bzw. „Gruppe B: 🐼 Ana, 🦁 Tim, 🚀 Ela“, danach der Countdown.
4. **Rechnen**: dieselbe Rechenansicht und Bildschirmtastatur wie in der App, mit der Bewertung nach Stellenanzahl wie beim Tippen. Oben eine kleine Leiste mit dem Gegner („Max: 6/10“).
5. **Nach der Runde**: „Gewonnen! 🎉 Du bist weiter“ oder „Knapp verloren – Platz 5 von 24“, dann wieder der Wartebereich. Wer **ausgeschieden** ist, bleibt verbunden, sieht weiter Turnierbaum und Live-Anzeige und bekommt am Ende die eigene Platzierung.
6. **Verbindung weg**: Bei einem Neuladen wird automatisch mit dem gespeicherten Teilnehmer-Schlüssel neu verbunden, das Kind landet im aktuellen Zustand. Was es während einer Runde schon beantwortet hat, ist auf dem Server gespeichert.

## 4. Formate

Alle Formate bestehen aus **Runden**. In einer Runde rechnen alle aktiven Kinder gleichzeitig, jedes in einem **Spiel** (Duell, Gruppe oder alle zusammen). Gewertet wird pro Spiel.

| Format | Ablauf |
|---|---|
| **Sprint** | eine Runde, alle in einem Spiel, eine Rangliste. Gut zum Aufwärmen. |
| **Liga** | n Sprint-Runden (die Lehrkraft wählt 3 bis 5). Pro Runde Punkte nach Platz (z. B. 10, 8, 6, 5, 4, 3, 2, 1, danach 0), Gesamttabelle. Niemand scheidet aus. |
| **Gruppenphase → K.-o.** | Gruppen zu 3 bis 5 Kindern, ausgelost und möglichst gleich groß. Je Gruppe 2 bis 3 Runden; jede Runde ist ein Sprint innerhalb der Gruppe, nach Platz gibt es Punkte. Die besten 1 oder 2 je Gruppe kommen in die K.-o.-Phase (die Lehrkraft wählt). Die K.-o.-Phase wird auf die nächste Zweierpotenz aufgefüllt, Freilose bekommen die Gruppenbesten. |
| **Nur K.-o.** | 1-gegen-1-Duelle. Bei einer Anzahl, die keine Zweierpotenz ist, gibt es Freilose in Runde 1, ausgelost. Verlierer scheiden aus. Optional ein Spiel um Platz 3. |

Bei einem **Duell** bekommen beide **exakt dieselben Aufgaben in derselben Reihenfolge**, damit es fair ist. Bei Gruppen und Sprints bekommen ebenfalls alle im selben Spiel dieselbe Aufgabenliste.

**Wertung eines Spiels** (nutzt die bestehenden Regeln):
- *Aufgaben-Modus*: mehr Richtige gewinnt. Bei Gleichstand gewinnt die kürzere Zeit, wobei jeder Fehler wie in der App `strafe` Sekunden (Standard 5 s) zur Zeit dazuzählt. Wer am Ende der Zeitgrenze (Anzahl × Zielzeit × 3) nicht fertig ist, wird mit dem Stand zu diesem Zeitpunkt gewertet.
- *Zeit-Modus*: Punkte = richtig − ⌊falsch / 4⌋ (`FEHLER_PRO_PUNKT`). Bei Gleichstand gewinnt, wer weniger Fehler hat, danach wer den letzten Punkt früher erreicht hat.
- Bleibt ein Duell danach noch völlig gleich: eine **Entscheidungsaufgabe**. Beide bekommen eine einzige Aufgabe, die erste richtige Antwort gewinnt.
- **Nicht angetreten** (Kind war während der ganzen Runde getrennt oder hat nichts beantwortet): Das Spiel verliert es kampflos.

## 5. Technische Architektur

### 5.1 Überblick

```
Beamer (Lehrkraft) ──POST Befehle──▶ ┐
       ▲                             │  server/turnier.js
       └──── SSE-Ereignisse ◀────────┤  (Zustand im Speicher,
Handys (Kinder) ──POST Antworten──▶  │   Zustandsautomat,
       ▲                             │   Wertung)
       └──── SSE-Ereignisse ◀────────┘
```

- **Echtzeit über Server-Sent Events (SSE)**, nicht über WebSockets: SSE geht mit `node:http` ohne Bibliothek, läuft über normales HTTPS durch den Reverse-Proxy und verbindet sich im Browser (`EventSource`) von selbst neu. Befehle und Antworten laufen als normale `POST`-Anfragen.
- **Zustand nur im Arbeitsspeicher** (`Map` Code → Turnier). Ein Turnier dauert eine Schulstunde, eine Datenbank braucht es nicht. Laufende Turniere sind nach einem Neustart des Servers weg, das ist in Ordnung. *Optional später*: Endergebnis in SQLite ablegen.
- **Der Server ist die Wahrheit**: Er erzeugt die Aufgaben (`require('../js/aufgaben.js')`, das geht schon), prüft jede Antwort und rechnet die Wertung. Das Handy zeigt nur an. Dadurch kann man nicht schummeln, indem man im Browser die Lösung abliest, und die Lehrkraft sieht den Fortschritt live.
- Die **Lösungen gehen nie an die Handys**. Gesendet wird nur die Aufgabe ohne `loesung` und `c`, falls `c` die Lücke ist. Die Anzahl der Stellen für die Tastatur geht als eigenes Feld `stellen` mit.

### 5.2 Neue und geänderte Dateien

| Datei | Inhalt |
|---|---|
| `server/turnier.js` **neu** | reine Logik ohne HTTP: Turnier anlegen, beitreten, Paarungen/Gruppen bilden, Runde starten, Antwort werten, Spiel auswerten, nächste Phase. Exportiert die Funktionen für `tools/test.js`. Hält die `Map` und räumt auf. |
| `server/turnier-routen.js` **neu** | HTTP-Routen `/api/turnier/*` und SSE-Verwaltung (Liste offener Verbindungen pro Turnier, `senden(turnier, ereignis, an)`), Keep-Alive-Kommentar alle 20 s |
| `server/server.js` | `/api/turnier/` an `turnier-routen.js` weitergeben, bevor `api()` greift. `/turnier` und `/turnier/` liefern `turnier.html`. `APP_ERLAUBT` um `turnier.html` erweitern. |
| `turnier.html` **neu** | eigene Seite mit allen Bildschirmen beider Rollen als `<section class="screen">`, nutzt `css/style.css` |
| `css/turnier.css` **neu** | Beamer-Ansicht (große Schrift, QR-Code, Turnierbaum, Fortschrittsbalken), Handy-Ansicht |
| `js/turnier.js` **neu** | Oberfläche beider Rollen. Rolle aus der URL bzw. dem gespeicherten Schlüssel. Nutzt `Aufgaben.alsText`, `Ton`. |
| `js/tastatur.js` **neu** (Umbau) | die Bildschirmtastatur samt Stellenlogik aus `app.js` herausziehen, damit App und Turnier dieselbe nutzen. Gelingt das nicht sauber, im Turnier eine schlanke Kopie verwenden und das hier notieren. |
| `vendor/qrcode.js` **neu** | QR-Code-Erzeugung ohne Abhängigkeiten, z. B. *qrcode-generator* von Kazuhiko Arase (MIT), unverändert übernommen, Version und Lizenz im README unter „Fremde Bestandteile“ |
| `server/Dockerfile` | `turnier.html` und die neuen Dateien mitkopieren |
| `sw.js` | `VERSION` hochzählen. `turnier.html` und `js/turnier.js` **nicht** cache-first behandeln: Das Turnier braucht ohnehin Netz, und alte Fassungen würden mit dem Server streiten. `/api/turnier/` nie cachen. |
| `tools/test.js` | Tests für `server/turnier.js` (siehe Abschnitt 10) |
| `README.md`, `PROJEKTWISSEN.md` | Nutzersicht bzw. Routen, Zustände, Regeln (Pflege-Regel beachten) |
| App `index.html`/`app.js` | kleiner Link „🏆 Turnier“ im Eltern- bzw. Lehrkraft-Bereich, der auf `/turnier` führt |

### 5.3 Datenmodell im Speicher

```js
turnier = {
  code: 'K7MQ',
  leitungHash: 'sha256…',
  titel: '3b Einmaleins-Cup',
  erstellt: 1730800000000, zuletzt: 1730800000000,
  einstellungen: {
    uebungen: ['mal', 'geteilt'], einsetzen: false,
    art: 'aufgaben' | 'zeit', anzahl: 10, sekunden: 60,
    format: 'sprint' | 'liga' | 'gruppen_ko' | 'ko',
    ligaRunden: 3, gruppenGroesse: 4, gruppenRunden: 2, weiterProGruppe: 2, platz3: true,
  },
  phase: 'lobby' | 'vorschau' | 'countdown' | 'laeuft' | 'auswertung' | 'ende',
  offen: true,                       // Beitritt möglich
  teilnehmer: Map<id, { id, schluesselHash, name, emoji, verbunden, aktiv /* nicht ausgeschieden */, punkte, platz }>,
  runden: [{
    nr: 1, stufe: 'gruppe' | 'ko' | 'sprint' | 'platz3' | 'finale' | 'entscheidung',
    start: 0, ende: 0,
    spiele: [{
      id: 'r1s3', teilnehmer: ['id1', 'id2'], freilos: false,
      aufgaben: [{ a, op, b, c, luecke, loesung, uebung }],   // nur am Server
      stand: { id1: { index: 0, richtig: 0, falsch: 0, fertigUm: null, letzterPunktUm: null } },
      ergebnis: [{ id, platz, richtig, falsch, zeit, wertung }] | null,
    }],
  }],
  baum: [...],                       // K.-o.-Plan für die Anzeige
}
```

**Aufräumen**: Turniere, die 3 Stunden nicht mehr benutzt wurden, und alle, die älter als 8 Stunden sind, werden gelöscht, dazu ihre SSE-Verbindungen. Grenzen: höchstens 200 laufende Turniere am Server und höchstens 60 Teilnehmer pro Turnier.

### 5.4 Zustandsautomat

```
lobby ──starten──▶ vorschau ──runde_starten──▶ countdown (3 s) ──▶ laeuft
  ▲                   │ neu_mischen ↺                               │
  │                   │                     alle fertig / Zeit um / beenden
  │                   ▼                                             ▼
  │               (abbrechen) ◀──────────────────────────────  auswertung
  │                                                              │
  └──────── neues_turnier (gleiche Kinder) ◀── ende ◀── letzte Runde fertig
                                                    naechste ──▶ vorschau
```

- Nur die Leitung darf den Zustand ändern. Jeder Befehl wird gegen den aktuellen Zustand geprüft, unpassende bekommen `409`.
- Einen Countdown gibt es nur einmal am Server: Der Server verschickt `startUm` (Serverzeit). Die Geräte rechnen ihre Uhrabweichung beim Verbinden aus (der Server schickt bei `hallo` seine `jetzt`-Zeit mit). So zählen alle Handys gleichzeitig herunter.
- **Ende einer Runde** am Server: Sind alle Spiele fertig, ist die Zeit um (`sekunden` + 2 s Kulanz) oder drückt die Leitung „beenden“, wertet der Server automatisch aus und wechselt in `auswertung`.

## 6. API

Alle Routen unter `/api/turnier`. Antworten im JSON-Format über `H.json`/`H.fehler`. Der Leitungs- bzw. Teilnehmer-Schlüssel kommt als `Authorization: Bearer …` mit.

| Route | Wer | Zweck |
|---|---|---|
| `POST /api/turnier` | jeder | Turnier anlegen. Body: `{ titel, einstellungen }`. Antwort: `{ code, leitung }` (der Schlüssel nur dieses eine Mal) |
| `GET /api/turnier/:code` | jeder | öffentliche Kurzinfo `{ code, titel, phase, offen, anzahl }`, damit die Beitrittsseite prüfen kann, ob es das Turnier gibt |
| `POST /api/turnier/:code/beitreten` | jeder | `{ name, emoji }` → `{ id, schluessel }`. `409`, wenn der Name vergeben ist, `423`, wenn der Beitritt geschlossen ist |
| `GET /api/turnier/:code/ereignisse?s=<schluessel>` | Leitung/Kind/Zuschauer | SSE-Strom. Der Schlüssel steht in der Query, weil `EventSource` keine Header setzen kann; er wird nicht geloggt. Ohne `s` gibt es nur die Zuschauer-Ansicht. |
| `POST /api/turnier/:code/befehl` | Leitung | `{ befehl: 'starten' \| 'runde_starten' \| 'neu_mischen' \| 'beenden' \| 'abbrechen' \| 'naechste' \| 'beitritt' (offen: bool) \| 'entfernen' (id) \| 'neues_turnier' \| 'schliessen' }` |
| `POST /api/turnier/:code/antwort` | Kind | `{ spiel, index, wert }` → `{ richtig, naechste }`. `index` verhindert, dass doppelt gesendete Antworten doppelt zählen. Eine Antwort auf einen alten Index wird ignoriert. |
| `POST /api/turnier/:code/verlassen` | Kind | austreten (in der Lobby: weg; später: zählt als nicht angetreten) |

**SSE-Ereignisse** (`event: <name>`, `data: <json>`):

| Ereignis | An | Inhalt |
|---|---|---|
| `hallo` | alle beim Verbinden | `{ jetzt, rolle, zustand }`, der volle aktuelle Zustand aus Sicht des Empfängers (damit klappt das Neuverbinden immer) |
| `teilnehmer` | alle | Liste `{ id, name, emoji, verbunden, aktiv }` |
| `vorschau` | alle | Paarungen bzw. Gruppen der nächsten Runde |
| `countdown` | alle | `{ startUm, runde }` |
| `aufgaben` | nur die Kinder eines Spiels | `{ spiel, aufgaben: [{ a, op, b, luecke, stellen }] }` ohne Lösungen, verschickt zusammen mit dem `countdown` |
| `fortschritt` | Leitung, Zuschauer, Gegner im selben Spiel | `{ spiel, id, index, richtig, falsch }`, höchstens alle 250 ms gebündelt |
| `rundenende` | alle | Ergebnisse aller Spiele, neue Tabelle bzw. neuer Baum. Jedes Kind bekommt zusätzlich `ich: { platz, weiter }`. |
| `ende` | alle | Endplatzierung |
| `entfernt` | betroffenes Kind | Danach wird die Verbindung geschlossen. |

## 7. Paarungen und Gruppen (Algorithmen)

- **Mischen**: Fisher-Yates mit `crypto.randomInt`.
- **Gruppen**: `g = round(n / gruppenGroesse)`, mindestens 1. Die Kinder reihum auf die Gruppen verteilen, damit sich die Größen höchstens um 1 unterscheiden. Mindestgröße 2: Bei n < 4 gibt es statt Gruppenphase einen Sprint.
- **K.-o.-Plan**: Teilnehmerzahl k → Baumgröße `2^ceil(log2 k)`, Freilose = Baumgröße − k. Die Freilose gehen an die Setzplätze, also an die Gruppenbesten nach Gruppenpunkten. Gibt es keine Gruppenphase, wird ausgelost. Gruppensieger und Gruppenzweite derselben Gruppe treffen frühestens im Finale aufeinander (Standard-Setzliste 1–16, 8–9 …).
- **Platzierung am Ende**: Finale → Platz 1 und 2, Spiel um Platz 3 → Platz 3 und 4 (sonst teilen sich beide Platz 3). Wer davor ausgeschieden ist, teilt sich den Platz der Runde (z. B. „Platz 5–8“). Bei Gleichstand entscheidet die Leistung in der letzten Runde.
- Gibt es **nach dem Entfernen** in einem Duell keinen Gegner mehr, gewinnt das übrige Kind kampflos.

## 8. Oberfläche

**Beamer (Lehrkraft):**
- große Schrift, gut lesbar aus 8 m Entfernung, hoher Kontrast, dunkler Hintergrund optional
- Lobby: QR-Code etwa 40 % der Höhe, Code darunter, das Raster der Kinder wächst mit einer kleinen Einblende-Animation und einem Plopp-Ton (`Ton`)
- Live-Runde: pro Duell eine Zeile `🦊 Max ▓▓▓▓▓░░░ 6 | 4 ░░░▓▓▓▓ Ana 🐼`, bei Gruppen kleine Ranglisten, bei Sprints eine Rennbahn mit Emojis
- Turnierbaum als einfaches HTML-Gitter (kein Canvas), Gewinner fett, ausgeschiedene grau
- Vollbild-Knopf (`requestFullscreen`)

**Handy (Kind):**
- kein Scrollen beim Rechnen, Tastatur unten, daumengroß
- Bildschirm wach halten mit `navigator.wakeLock` (falls vorhanden), damit das Handy im Wartebereich nicht einschläft
- klare Rückmeldung bei Verbindungsverlust: ein gelber Balken „Verbindung weg – versuche es wieder …“

Texte kindgerecht und kurz, ohne Anglizismen („Runde“, „Duell“, „weiter“, „ausgeschieden“).

## 9. Sicherheit und Missbrauch

- Rate-Limit mit `H.erlaubt()` pro IP: Turniere anlegen höchstens 10 pro Stunde, Beitreten 30 pro Minute, Antworten 10 pro Sekunde pro Teilnehmer.
- Bodys klein halten (`H.body(req, 2048)`), Namen mit `H.name()` prüfen, Emoji nur aus `H.EMOJIS`. Wie in der übrigen App nur über `textContent` ausgeben, nie über `innerHTML` mit Namen.
- Schlüssel vergleichen per `H.gleich` (zeitkonstant), nur die Hashes speichern.
- SSE: höchstens 3 gleichzeitige Verbindungen pro Teilnehmer-Schlüssel und höchstens 2000 insgesamt. Getrennte Verbindungen sofort aus der Liste nehmen (`req.on('close')`).
- Reverse-Proxy: SSE braucht `X-Accel-Buffering: no` und `Cache-Control: no-cache` als Header. Im README steht, dass der Proxy (nginx/Caddy) für `/api/turnier/*/ereignisse` nicht puffern und keinen kurzen Timeout haben darf.
- Kein Fremdinhalt, keine Tracker. Der QR-Code wird im Browser erzeugt, nicht über einen Online-Dienst.

## 10. Tests (`tools/test.js`)

Nur gegen `server/turnier.js`, ohne HTTP:
- Gruppen: für n = 2 … 60 unterscheiden sich die Größen höchstens um 1, alle Kinder genau einmal, keine Gruppe < 2
- K.-o.: für k = 2 … 60 stimmt die Zahl der Freilose, jedes Kind kommt genau einmal vor, der Baum geht auf einen Sieger auf
- Wertung: Aufgaben-Modus (mehr richtig > schneller > Strafsekunden), Zeit-Modus (Fehlerabzug, Gleichstand), nicht angetreten, Freilos
- Doppelte Antwort mit gleichem `index` zählt nur einmal; eine Antwort nach dem Rundenende wird ignoriert
- Zustandsautomat: unpassende Befehle werden abgelehnt (z. B. `naechste` in der `lobby`)
- Aufgaben an die Kinder enthalten keine `loesung` und bei der Lücke `c` kein `c`
- Durchspielen: 13 Kinder, Gruppenphase → K.-o. mit zufälligen Antworten bis zum `ende`, am Ende hat jedes Kind einen Platz

## 11. Etappen

1. **Logik** `server/turnier.js` + Tests (nur Sprint und K.-o.)
2. **Routen + SSE**, `/turnier` ausliefern, Dockerfile, APP_ERLAUBT
3. **Lehrkraft-Oberfläche**: Erstellen, Lobby mit QR-Code, Vorschau, Live-Anzeige, Ergebnis, Siegerehrung
4. **Kind-Oberfläche**: Beitreten, Wartebereich, Rechnen (Tastatur wiederverwenden), Ergebnis, Neuverbinden
5. **Gruppenphase und Liga**, Spiel um Platz 3, Entscheidungsaufgabe
6. **Feinschliff**: Töne, Animationen, Wake-Lock, Vollbild, Zuschauer-Ansicht, README/PROJEKTWISSEN, `sw.js`
7. **Probelauf**: lokal mit `server-piazzi` und 3 Browserfenstern (1 × Leitung, 2 × Kind), danach auf echten Handys im WLAN

Nach jeder Etappe einen eigenen Commit (`feat(turnier): …`).

## 12. Entscheidungen bei Unklarheit

- Lieber einfach und robust als vollständig: Wird ein Format zu komplex, zuerst *Sprint* und *Nur K.-o.* fertig machen.
- Netz ist im Klassenzimmer oft schlecht: Jede Ansicht muss sich allein aus `hallo` wieder aufbauen lassen.
- Kein Konto, kein Foto, keine Daten über das Turnier hinaus speichern.
- Offene Fragen an den Auftraggeber (Bernhard) bitte sammeln statt raten, z. B.:
  - Soll ein Turnier an ein Lehrkraft-Konto (bgbb-Microsoft-Login) gebunden werden, damit nur Lehrkräfte Turniere anlegen? Derzeit: nein, komplett öffentlich.
  - Soll das Endergebnis gespeichert werden (Turnier-Archiv für die Lehrkraft)?
  - Gibt es für Turnier-Siege Sterne in der App? Derzeit: nein.
