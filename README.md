# Rechenheld

Rechen-Trainer für die Volksschule als Web-App (PWA) – ohne Build-Schritt, reines HTML/CSS/JS.

- **Schreiben**: Aufgabe sehen, Ergebnis auf der Bildschirmtastatur tippen. Jede Ziffer wird sofort geprüft; „Überspringen" zählt als falsch.
- **Sprechen**: Aufgabe wird vorgelesen, das Kind sagt das Ergebnis. Erkennung wahlweise mit **Vosk** (offline im Browser, nur Zahlwörter 0–100 erlaubt – Standard) oder der Google-Erkennung von Chrome (braucht Internet). Umschalten im Eltern-Bereich. Mikrofon braucht HTTPS.
- **Spielarten**: 10 Aufgaben auf Zeit, Zeit-Challenge 1 Minute oder 5 Minuten.
- Rechenarten + − · : (mischbar), Zahlenraum 10/20/50/100, Einsetzaufgaben (nur Schreiben).
- 1–5 Sterne pro Runde → Sterne sind Währung für Minispiele: Flappy Vogel, Snake, Farbblöcke, Tierturm, Schrauben, Unblock.
- **Eltern-Bereich**: Zahnrad oben links **lange drücken** – Sterne-Schwellen, Spielpreis, Spieldauer, Verlauf.

## Lokal starten

```bash
python -m http.server 8765
```

Dann http://localhost:8765 öffnen.

## Tests

```bash
node tools/test.js
```

Prüft Aufgaben-Generator (keine negativen Ergebnisse, keine Reste, eindeutige Lücken), Zahlwort-Erkennung und die Level-Generatoren von Schrauben und Unblock.

## Aufs Tablet bringen

Mikrofon und Installation brauchen HTTPS – z.B. über GitHub Pages. Danach in Chrome am Tablet öffnen → Menü → „Zum Startbildschirm hinzufügen".

Nach Änderungen an Dateien `VERSION` in `sw.js` hochzählen, damit Geräte die neue Fassung laden.

Icons neu erzeugen: `node tools/icon.js`

## Fremde Bestandteile

- `vendor/vosk.js` – [vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8, Apache-2.0
- `models/vosk-model-small-de-0.15.tar.gz` – [Vosk](https://alphacephei.com/vosk/models) deutsches Modell, Apache-2.0 (Lizenz liegt im Archiv). Aus der Original-ZIP unverändert als tar.gz umgepackt.
