# Rechenheld

Rechen-Trainer für die Volksschule als Web-App (PWA) – ohne Build-Schritt, reines HTML/CSS/JS.

- **Tippen**: Aufgabe sehen, Ergebnis auf der Bildschirmtastatur tippen. Bewertet wird, sobald so viele Ziffern getippt sind, wie das Ergebnis Stellen hat; „⌫ Zurück" löscht die letzte Ziffer, „Überspringen" zählt als falsch.
- **Sprechen**: Aufgabe wird vorgelesen, das Kind sagt das Ergebnis. Erkennung wahlweise mit **Vosk** (offline im Browser, nur Zahlwörter 0–100 erlaubt – Standard) oder der Google-Erkennung von Chrome (braucht Internet). Umschalten im Eltern-Bereich. Mikrofon braucht HTTPS.
- **Spielarten**: Aufgaben auf Zeit (5–50 Aufgaben) oder Zeit-Challenge (1–10 Minuten). Rekorde gibt es bei 10/20 Aufgaben und 1/5 Minuten.
- **Spieler**: Beim Start Spieler wählen, anlegen (Name + Foto oder Bild) oder löschen. Alles wird pro Spieler gespeichert; die Bestenliste vergleicht alle Spieler auf dem Gerät.
- Rechenarten + − · : (mischbar), Zahlenraum 10/20/50/100, Einsetzaufgaben.
- 1–5 Sterne pro Runde → Sterne sind Währung für Minispiele: Flattervogel, Apfelschlange, Farbblöcke, Tierturm, Schrauben, Ausparken.
- **Eltern-Bereich**: Zahnrad oben links **lange drücken** – Sterne-Schwellen, Spielpreis (mind. 10 ⭐ für genau eine Runde), Verlauf.

## Lokal starten

```bash
python -m http.server 8765
```

Dann http://localhost:8765 öffnen.

## Tests

```bash
node tools/test.js
```

Prüft Aufgaben-Generator (keine negativen Ergebnisse, keine Reste, eindeutige Lücken), Zahlwort-Erkennung und die Level-Generatoren von Schrauben und Ausparken.

## Aufs Tablet bringen

Mikrofon und Installation brauchen HTTPS – z.B. über GitHub Pages. Danach in Chrome am Tablet öffnen → Menü → „Zum Startbildschirm hinzufügen".

Nach Änderungen an Dateien `VERSION` in `sw.js` hochzählen, damit Geräte die neue Fassung laden.

Icons neu erzeugen: `node tools/icon.js`

### Mitgelieferte Stimme

Hat der Browser keine deutsche Vorlese-Stimme (z. B. Brave), liest die App mit der mitgelieferten Stimme **Jonas** (Microsoft, de-AT) aus Wortschnipseln in `audio/jonas/` vor. Gibt es eine deutsche System-Stimme, wird weiter diese verwendet.

Schnipsel neu erzeugen: `python tools/stimme.py`. Mit `AZURE_SPEECH_KEY` und `AZURE_SPEECH_REGION` in der Umgebung über den offiziellen Azure-Dienst (Gratisstufe reicht, ca. 3.000 Zeichen), sonst über `edge-tts` (`pip install edge-tts`), das nur zum Ausprobieren gedacht ist. Danach in `sw.js` den Namen `GROSS` hochzählen, sonst behalten Geräte die alten Schnipsel.

## Online-Bestenliste (Server mit Docker)

Optionaler Server in `server/` (Node, keine Abhängigkeiten, SQLite): globale Bestenliste, Aktivität pro Spieler und eine Admin-Seite. Er liefert auch die App selbst aus – App und API laufen dann unter derselben Adresse.

```bash
cp server/.env.example server/.env
```

In `server/.env` ein langes `ADMIN_PASSWORT` setzen, dann:

```bash
docker compose -f server/docker-compose.yml up -d --build
```

Der Container hört nur auf `127.0.0.1:8080`; im Reverse-Proxy z. B. `https://rechnen.example.at` → `http://127.0.0.1:8080` eintragen (HTTPS macht der Proxy). Wer `/admin` zusätzlich schützen will, kann es im Proxy auf Heim-IP/VPN beschränken.

- **Gruppen** (z. B. Klassen 1a, 1b): auf der Admin-Seite anlegen; beim Erzeugen eines Codes die Gruppe wählen – das Kind landet beim Einlösen darin. Jede Gruppe hat in der App ihre eigene Bestenliste (Reiter 👥 1a neben 🏠 Hier und 🌍 Welt). Spieler lassen sich später in eine andere Gruppe verschieben.
- **Admin-Seite** `https://…/admin`: Gruppen verwalten, Codes erzeugen (mit Gruppe und Notiz, für wen), Codes widerrufen, Spieler umbenennen/sperren/löschen, Rekorde ansehen, Aktivität (Rechenrunden gesamt/7 Tage/heute, Minispiele, letzte Runden, Runden pro Tag). Die Anmeldung gilt 12 Stunden.
- **Code einlösen**: In der App Spieler wählen → Eltern-Bereich → „Online-Bestenliste" → Code, Spitzname und Bild. Jeder Code gilt **einmal** und verbindet genau einen Spieler; der Spieler bekommt dafür einen dauerhaften geheimen Schlüssel.
- Online sichtbar sind nur Spitzname und Emoji – nie Fotos. Die Liste sehen nur verbundene Spieler.
- Ohne Netz geht alles weiter; Rekorde und Runden werden gesammelt und später nachgeschickt.
- Liegt die App woanders (z. B. GitHub Pages), im Eltern-Bereich die Server-Adresse eintragen und diese Adresse der App in `ERLAUBTE_ORIGIN` setzen.
- Daten liegen im Docker-Volume `rechenheld-daten` (`rechenheld.db`). Sicherung: `docker cp rechenheld:/daten/rechenheld.db .`

Lokal ohne Docker (Node 24): `ADMIN_PASSWORT=test HINTER_PROXY=0 node server/server.js` → http://localhost:8080

### Anmeldung: Codes, Piazzi oder BGBB

Derselbe Code kann drei Arten der Anmeldung; gewählt wird mit `ANMELDUNG` in der Env-Datei. Die App fragt den Server und zeigt im Eltern-Bereich die passende Anmeldung.

Bei `piazzi` und `bgbb` ist das Konto **Pflicht**, wenn die App vom Server selbst ausgeliefert wird: statt „Neuer Spieler" kommt gleich Anmelden/Registrieren, Name und Bild übernimmt der Spieler vom Konto. Ältere Spieler auf dem Gerät ohne Konto müssen sich erst anmelden. Wer sich im Eltern-Bereich abmeldet, landet wieder bei der Anmeldung.

| `ANMELDUNG` | Wer darf? | Anmeldung |
|---|---|---|
| `codes` (Standard) | wer einen Code bekommt | Einmal-Code, wie oben beschrieben |
| `piazzi` | wer eine im Admin freigegebene Adresse `@piazzi.at` angibt | Konto mit Benutzername, Bild und Passwort |
| `bgbb` | alle mit Microsoft-Schulkonto `@bgblumenstrasse.at` | „Mit Microsoft anmelden", Benutzername = Teil vor dem @ |

Bei `piazzi` und `bgbb` ist ein Konto auf **mehreren Geräten** gleichzeitig anmeldbar. **Sterne und Rekorde** werden abgeglichen: jede Änderung wird als Buchung (+/−) geschickt, der Kontostand kommt vom Server. Beim ersten Verbinden eines neuen Kontos werden die Sterne des Geräts zum Startguthaben; beim Anmelden an einem bestehenden Konto ersetzt dessen Stand die Sterne auf dem Gerät. Bestehende Code-Verbindungen bekommen beim ersten Senden ebenfalls ein Startguthaben und gleichen ab dann ab.

**Piazzi**
- Admin → „Adressen": Adressen freigeben (eine pro Zeile). Eine Adresse darf für mehrere Konten verwendet werden (z. B. Geschwister). Es wird keine Mail verschickt.
- App → Eltern-Bereich → Online-Bestenliste → „Neues Konto" (Adresse, Benutzername, Bild, Passwort) bzw. „Anmelden" auf weiteren Geräten.
- Admin → Spieler: Passwort zurücksetzen (neues Einmal-Passwort wird einmal angezeigt), alle Geräte abmelden.

**BGBB (Microsoft-SSO)**

Einmalig im Microsoft Entra Admin Center der Schule (*Identität → Anwendungen → App-Registrierungen → Neue Registrierung*):
1. Name z. B. „Rechenheld", *Unterstützte Kontotypen*: **Nur Konten in diesem Organisationsverzeichnis**.
2. *Umleitungs-URI*: Plattform **Web**, `https://<OEFFENTLICHE_ADRESSE>/api/sso/rueckruf`.
3. Unter *Zertifikate & Geheimnisse* einen geheimen Clientschlüssel anlegen (Ablaufdatum notieren und rechtzeitig erneuern).
4. In die Env-Datei: `MS_TENANT_ID` (Verzeichnis-ID), `MS_CLIENT_ID` (Anwendungs-ID), `MS_CLIENT_SECRET` (Wert des Schlüssels), `OEFFENTLICHE_ADRESSE`.

Angemeldet wird mit `openid profile email`; Berechtigungen, die ein Admin genehmigen muss, braucht es nicht. Geprüft werden Tenant, Anwendung und die Domain `@bgblumenstrasse.at`.

Klassen: Admin → „Klassen-Import" → CSV hochladen, z. B.

```
benutzername;klasse
max.muster;1a
lena.berg@bgblumenstrasse.at;2b
```

Trenner `;` `,` oder Tab, Kopfzeile optional, Adresse oder Benutzername. Fehlende Klassen werden angelegt, schon angemeldete Schüler:innen sofort verschoben, alle anderen beim ersten Anmelden.

**Zwei Instanzen auf einem Server** – je eine Env-Datei in `server/`, z. B. `piazzi.env`:

```
NAME=rechenheld-piazzi
PORT_HOST=8081
ENV_DATEI=piazzi.env
ANMELDUNG=piazzi
ADMIN_PASSWORT=…
```

```bash
docker compose -p piazzi --env-file server/piazzi.env -f server/docker-compose.yml up -d --build
```

Genauso `bgbb.env` mit `NAME=rechenheld-bgbb`, `PORT_HOST=8082`, `ENV_DATEI=bgbb.env` und `-p bgbb`. Jede Instanz hat ihr eigenes Volume und damit ihre eigene Datenbank.

## Fremde Bestandteile

- `audio/jonas/` – Wortschnipsel der Microsoft-Stimme „Jonas" (de-AT-JonasNeural), erzeugt mit `tools/stimme.py`. Derzeit über edge-tts erzeugt; für eine öffentlich verteilte App über Azure AI Speech neu erzeugen.
- `vendor/vosk.js` – [vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8, Apache-2.0
- `models/vosk-model-small-de-0.15.tar.gz` – [Vosk](https://alphacephei.com/vosk/models) deutsches Modell, Apache-2.0 (Lizenz liegt im Archiv). Aus der Original-ZIP unverändert als tar.gz umgepackt.
