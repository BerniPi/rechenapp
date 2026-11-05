# Turniermodus: Fehlerliste aus der Prüfung (Zweig `turnier`, Stand 371009c)

> **Auftrag an Gemini:** Behebe die folgenden Punkte auf dem Zweig `turnier`. Grundlage bleibt `docs/TURNIER-KONZEPT.md`, und es gelten die Regeln aus `PROJEKTWISSEN.md`. Schreib zu jedem Fehler der Logik **zuerst einen Test in `tools/test.js`**, der heute fehlschlägt, und behebe ihn dann. Mach einen Commit pro Punkt oder pro zusammengehöriger Gruppe (`fix(turnier): …`). Lass am Ende `node tools/test.js` laufen und spiel im Browser einmal mit 1 Lehrkraft und 3 Kindern durch: K.-o. im Aufgaben-Modus, K.-o. im Zeit-Modus, Sprint, Liga, Gruppenphase → K.-o. Lade dabei ein Kind mitten in der Runde neu und schalte einmal „Beitritt“ um.

## A. Schwere Fehler

### A1. Bei Gleichstand der Richtigen zählt die Zeit nie, es gewinnt das zuerst gelistete Kind
- `server/turnier.js`, `wertungSpiel()`: verwendet `spiel.start` und `spiel.dauerMs`. Beides gibt es nicht, Start und Dauer liegen bei der **Runde** (`runde.start`, `runde.dauerMs`). Deshalb ist `zeit` immer 0 und `zeitBonus` im Zeit-Modus immer 0.
- Im Aufgaben-Modus ist richtig + falsch = Anzahl, Gleichstand (z. B. beide 10/10) ist also der Normalfall. Nachgestellt: Das langsame Kind (100 s) gewinnt gegen das schnelle (5 s), weil es in `teilnehmer[0]` steht.
- **Lösung:** Rundenstart (und im Zeit-Modus das Rundenende) an `wertungSpiel` übergeben, z. B. als Parameter `runde`, oder beim Planen in jedes Spiel kopieren. Wer nicht fertig ist, bekommt als Zeit die volle Rundendauer bis `runde.ende`, nie 0. Ein unfertiges Kind darf nie besser sein als ein fertiges mit gleich vielen Richtigen.
- **Gleichstand im Duell** nach allen Kriterien → **Entscheidungsaufgabe** nach Konzept Abschnitt 4. Ein K.-o.-Sieger darf nie davon abhängen, wer zuerst gelistet ist. Bis die Entscheidungsaufgabe fertig ist, bleibt das Duell offen, und die Lehrkraft sieht „Gleichstand – Entscheidung“.
- Tests: Gleich viele Richtige, unterschiedliche Zeit → das schnellere Kind gewinnt. Gleiche Punkte im Zeit-Modus → weniger Fehler, danach früherer letzter Punkt. Völliger Gleichstand → kein Sieger ohne Entscheidung.

### A2. Keine Zeitgrenze am Server: Zeit-Runden enden nie
- Weder in `turnier.js` noch in `turnier-routen.js` gibt es einen Timer. Nachgestellt: In einer 30-Sekunden-Runde wird eine Antwort 10 Minuten nach dem Start noch gezählt.
- **Lösung:**
  - `antworten()` lehnt Antworten nach `runde.start + sekunden*1000 + 2000` (Kulanz) ab bzw. beendet die Runde dann.
  - Zusätzlich läuft ein Server-Timer (`setTimeout` beim Rundenstart, beim Abbrechen löschen). Er beendet die Runde zur Zeitgrenze und verschickt `rundenende`/`ende`, auch wenn niemand mehr antwortet.
  - **Aufgaben-Modus** bekommt die Zeitgrenze aus dem Konzept: Anzahl × Zielzeit der Übungen × 3. Danach endet die Runde, unfertige Kinder werden mit ihrem Stand gewertet.
  - Der Countdown-Übergang `countdown → laeuft` wird ebenfalls per Timer ausgelöst, nicht erst durch die erste Antwort.
- **Handy:** Restzeit gut sichtbar anzeigen, mit Serverzeit (`uhrOffsetMs`) gerechnet. **Beamer:** Restzeit groß anzeigen.
- Tests: Antwort nach Ablauf wird ignoriert. Die Runde endet zur Zeitgrenze auch ohne Antworten (Logik mit übergebenem `jetzt` testbar machen, z. B. `pruefeZeit(t, jetzt)`).

### A3. Liga und Gruppenphase → K.-o. enden nie
- `rundePlanen()` plant für `liga`/`gruppen_ko` endlos neue Gruppenrunden. `tn.punkte` wird nie erhöht, `ligaRunden`, `gruppenRunden` und `weiterProGruppe` werden nie benutzt, und `rundeBeenden()` prüft für diese Formate kein Ende. Nachgestellt: nach 12 Runden noch keine Wertung, alle Punkte 0.
- **Lösung nach Konzept Abschnitt 4:**
  - **Liga:** Jede Runde ist ein Sprint mit allen (eine Gruppe, nicht `gruppenEinteilen`). Punkte nach Platz (10, 8, 6, 5, 4, 3, 2, 1, dann 0) auf `tn.punkte`. Nach `ligaRunden` Runden ist Ende, Endplatz nach Punkten, bei Gleichstand nach der besseren Leistung in der letzten Runde.
  - **Gruppen → K.-o.:** Gruppen einmal auslosen (mischen!) und für alle `gruppenRunden` Runden gleich lassen. Punkte wie oben, innerhalb der Gruppe. Danach die besten `weiterProGruppe` je Gruppe in den K.-o.-Baum, mit Setzung: Gruppensieger bekommen die Freilose, Erster und Zweiter derselben Gruppe treffen sich frühestens im Finale. Ab dann läuft die vorhandene K.-o.-Logik weiter (eigenes Feld für die Phase, z. B. `t.abschnitt = 'gruppen' | 'ko'`).
  - Bei weniger als 4 Kindern statt Gruppenphase ein Sprint (steht im Konzept).
- Bis das fertig ist, darf das Formular diese Formate **nicht anbieten**.
- Test „Durchspielen“ für Liga und Gruppen → K.-o. mit 13 Kindern bis zum `ende`, jedes Kind hat einen Platz.

### A4. „Beitritt umschalten“ legt alle Geräte lahm
- `turnier-routen.js` Befehl `beitritt` schickt `hallo` mit `rolle: 'alle'` und `zustand: { offen }`. Im Browser setzt `hallo` dann `rolle = 'alle'` und ersetzt den ganzen Zustand, `turnierCode` wird `undefined`. Danach geht kein Befehl und keine Antwort mehr.
- **Lösung:** eigenes Ereignis `beitritt` (`{ offen }`), oder `hallo` pro Verbindung mit vollem `zustandFuer(t, c)` und echter Rolle wie bei `neues_turnier`. Grundregel: `hallo` immer vollständig und mit der Rolle der jeweiligen Verbindung.

### A5. Handys bleiben nach der Runde stehen
- `js/turnier.js`: `rundenendeRendern()` und `turnierendeRendern()` tun für `rolle === 'kind'` nichts. `vorschau` schaltet das Kind nicht auf den Wartebildschirm, und die Gegner-Info fehlt.
- **Lösung:** Kinder bekommen bei `rundenende` den Ergebnisbildschirm („Gewonnen! Du bist weiter“ / „Knapp verloren – Platz x“ mit eigenen Richtigen und der Zeit, Daten aus `payload.ich` und dem eigenen Spiel). Bei `vorschau`: Wartebildschirm mit „Du spielst gegen …“ bzw. Gruppe. Bei `ende`: der eigene Endplatz. Ausgeschiedene sehen weiter die Live-Anzeige bzw. „Du schaust zu“.
- Der Server muss dafür in `rundenende` pro Kind den Platz der Runde und `weiter` mitschicken (`tn.platz` ist erst am Turnierende gesetzt, also eigenes Feld).

### A6. Beamer zeigt leeres Rundenergebnis und bleibt beim Countdown auf der Vorschau
- `rundenendeRendern()` rendert `aktuellerZustand.runde` vom Zeitpunkt der Vorschau, da gibt es noch kein `ergebnis`. Die mitgeschickten `daten.ergebnisse` werden ignoriert. `aktuellerZustand.phase` wird bei Ereignissen nicht nachgeführt.
- Beim Ereignis `countdown` wechselt der Beamer nicht auf `screen-live` und ruft `liveRendern()` nicht auf.
- **Lösung:** Jedes Ereignis aktualisiert `aktuellerZustand` (Phase, Runde, Ergebnisse, Teilnehmer) und ruft danach dieselbe Render-Funktion wie `hallo` auf. Am einfachsten schickt der Server bei jedem Phasenwechsel ein vollständiges `zustand` pro Verbindung, und der Browser hat nur noch **eine** Render-Funktion pro Rolle.

### A7. Neu verbinden während der Runde geht nicht
- Nach einem Neuladen setzt das Handy `aufgabenIndex = 0`, der Server steht aber z. B. bei 5. Jede Antwort kommt als `ignoriert` zurück, und das Kind steckt bei Aufgabe 1 fest.
- **Lösung:** Im `hallo` für das Kind den eigenen Stand mitschicken (`index`, `richtig`, `falsch`, `fertig`) und `aufgabenIndex` daraus setzen. Kommt `ignoriert` mit `aktuellerIndex` zurück, auf diesen Index springen und die mitgeschickte Aufgabe anzeigen, statt still nichts zu tun. Ist das Kind schon fertig, den Wartebildschirm zeigen.

## B. Kleinere Fehler

- **B1. Sprint- und Gruppen-Live-Anzeige zeigt nur 2 Kinder** (`liveRendern()` nimmt `teilnehmer[0]` und `[1]`). Für Spiele mit mehr als 2 Kindern eine Rangliste bzw. Rennbahn mit allen.
- **B2. Fortschrittsbalken im Zeit-Modus** rechnen mit `anzahl`. Im Zeit-Modus relativ zum Besten im Spiel skalieren.
- **B3. Ziffern gehen beim schnellen Tippen verloren:** Während die Antwort unterwegs ist und 150 ms lang danach zählen neue Ziffern noch zur alten Aufgabe und werden dann verworfen. Die Rückmeldung richtig/falsch sofort aus der Antwort ableiten ist nicht möglich, weil die Lösung am Server liegt. Deshalb die Eingabe sperren, bis die Antwort da ist, und Doppel-Senden verhindern (ein Flag `sendetGerade`), oder alternativ die nächste Aufgabe sofort zeigen und die Rückmeldung nachreichen.
- **B4. `/turnier/` mit Schrägstrich:** Die relativen Pfade (`css/…`, `js/…`) gehen dort ins Leere. Entweder `/turnier/` auf `/turnier` umleiten (301) oder absolute Pfade (`/css/…`) in `turnier.html` verwenden.
- **B5. Knopf „Neues Turnier mit denselben Kindern“** ist am Server in jeder Phase erlaubt, auch mitten in einer Runde. Nur in `ende` zulassen.
- **B6. Entfernte oder verlassene Kinder** werden in K.-o.-Folgerunden noch gepaart. Sind sie nicht `aktiv`, gewinnt der Gegner kampflos, und das Spiel gilt sofort als fertig.
- **B7. `aufraeumen()`** löscht Turniere, ihre SSE-Verbindungen bleiben aber in `verbindungen` offen. Beim Löschen schließen (`res.end()`), und `aufraeumen` zusätzlich alle 10 min per `setInterval(...).unref()` laufen lassen, nicht nur beim Anlegen.
- **B8.** Stufennamen in K.-o.-Folgerunden: Statt `ko_2` aus der Zahl der Spiele „Viertelfinale“ / „Halbfinale“ ableiten. Das Spiel um Platz 3 im Finale als eigene Karte mit Titel zeigen.

## C. Vor dem Zusammenführen in `server`

- README: Formate erst nennen, wenn sie funktionieren.
- `PROJEKTWISSEN.md`: Zustände, Ereignisse und Timer des Turniers kurz eintragen (Pflege-Regel).
- `sw.js`: `VERSION` hochzählen.
