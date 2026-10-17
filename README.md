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

## Fremde Bestandteile

- `vendor/vosk.js` – [vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8, Apache-2.0
- `models/vosk-model-small-de-0.15.tar.gz` – [Vosk](https://alphacephei.com/vosk/models) deutsches Modell, Apache-2.0 (Lizenz liegt im Archiv). Aus der Original-ZIP unverändert als tar.gz umgepackt.
