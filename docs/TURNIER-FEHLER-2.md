# Turniermodus: zweite Prüfung (Zweig `turnier`, Stand 68a60bb)

> **Auftrag an Gemini:** Behebe die folgenden Punkte auf dem Zweig `turnier`. Es gelten weiter `docs/TURNIER-KONZEPT.md`, `docs/TURNIER-FEHLER.md` und `PROJEKTWISSEN.md`. Schreib zu jedem Punkt der Logik zuerst einen Test in `tools/test.js`, der heute fehlschlägt. Der Test muss den **echten Ablauf** über `starten` → `rundeStarten` → `antworten` → `rundeBeenden`/`naechste` prüfen, nicht Felder von Hand setzen. Danach `node tools/test.js` und ein Durchlauf im Browser (siehe Abschnitt C). Ein Commit pro Punkt (`fix(turnier): …`).

Behoben und bestätigt sind aus der ersten Liste: A1 Zeit-Wertung, A2 Zeitgrenze, A3 Liga/Gruppen, A4 Beitritt, A6 Live-Anzeige beim Countdown, A7 Neuverbinden, B1, B2, B4, B5, B6, B7. Die folgenden Punkte sind neu oder noch offen.

## A. Schwere Fehler

### A1. Lehrkraft bleibt nach „Turnier starten“ und nach „Nächste Runde“ hängen
- `js/turnier.js`, Handler `vorschau`: rendert nur `vorschauRendern()`, wechselt aber nicht auf `screen-vorschau`. Die Lehrkraft sieht weiter die Lobby (bzw. das Rundenergebnis) und kommt nicht an den Knopf „Runde starten“. Nur ein Neuladen hilft.
- Im Browser nachgestellt: Nach Klick auf „Turnier starten“ bleibt `screen-lobby` aktiv, obwohl der Server in `vorschau` ist.
- **Lösung:** Im `vorschau`-Handler `aktuellerZustand` nachführen und danach dieselbe Render-Funktion wie bei `hallo` aufrufen (`zustandAktualisieren(aktuellerZustand)`), für Lehrkraft und Kind. Dasselbe Prinzip für **alle** Ereignisse prüfen: Nach jedem Ereignis muss jede Rolle auf dem Bildschirm stehen, den ein frisches `hallo` zeigen würde.

### A2. Runde endet still, wenn kurz nach Ablauf noch eine Antwort kommt
- `server/turnier.js` `antworten()`: Bei `jetzt >= runde.endeUm + 1000` wird `rundeBeenden()` aufgerufen und `{ ignoriert: true, grund: 'Zeit um' }` zurückgegeben. `turnier-routen.js` verschickt Ereignisse aber nur bei `!ergebnis.ignoriert`, also gar nichts. Der Server-Timer läuft erst bei `endeUm + 2000` und überspringt dann, weil die Phase schon `auswertung` ist.
- Ergebnis: Kein `rundenende` geht raus, Beamer und Handys bleiben bei „00:00“ stehen, und „Runde beenden“ liefert 409. Im Test genau so passiert: Antwort 1,5 s nach Ablauf.
- **Lösung:** Eine einzige Stelle beendet Runden und verschickt die Ereignisse, z. B. `rundenendeSenden()` in `turnier-routen.js`. `turnier.js` beendet die Runde nicht mehr nebenbei in `antworten()`, sondern meldet nur `zeitUm: true` bzw. `rundeFertig: true`, und die Route ruft dann `rundenendeSenden()` auf. Der Fall „alle fertig“ läuft genauso über diese eine Stelle. Antworten nach `endeUm` (ohne extra Kulanz) sind ungültig, der Timer feuert bei `endeUm + 1000`.
- Test: Antwort kurz nach Ablauf → die Runde ist beendet **und** ein `rundenende` wurde verschickt. Dafür die Sende-Funktion so aufbauen, dass man sie im Test ersetzen kann, oder die Logik so trennen, dass die Rückgabe von `antworten()` sagt, dass gesendet werden muss.

### A3. Entscheidungsaufgabe ist nicht spielbar
- `wertungSpiel()` legt `spiel.entscheidung` erst beim Rundenende an. Danach ist die Phase `auswertung`, `antworten()` lehnt alles mit „Runde läuft nicht“ ab, und `st.fertigUm` ist ohnehin gesetzt. Am Handy gibt es keine Anzeige dafür.
- Per Skript nachgestellt: Bei völligem Gleichstand gewinnt weiter das zuerst gelistete Kind.
- Der Test „A1: Duell-Entscheidungsaufgabe“ setzt `geloestVon` von Hand und prüft den Ablauf deshalb nicht.
- **Lösung (Vorschlag):** Eigene Phase `entscheidung` nach `auswertung` nur für die betroffenen Duelle.
  - Der Server schickt den beiden Kindern ein Ereignis `entscheidung` mit der Aufgabe (ohne Lösung). Am Handy erscheint „Entscheidung! Wer zuerst richtig rechnet, gewinnt“.
  - Am Beamer steht bei diesem Duell „⚡ Entscheidung“, und „Nächste Runde“ ist gesperrt, bis alle Entscheidungen gefallen sind.
  - Eine falsche Antwort sperrt das Kind 3 Sekunden lang und bringt eine neue Aufgabe für beide, damit nicht geraten wird.
  - Nach 60 s ohne richtige Antwort gewinnt, wer im Duell weniger Fehler hatte, sonst entscheidet das Los. Das Los sieht die Lehrkraft am Beamer.
  - Erst danach gibt es das endgültige `rundenende` bzw. `ende`.
- Test über den echten Ablauf: zwei Kinder antworten identisch zur selben Zeit → Phase `entscheidung`. Kind B antwortet richtig → B gewinnt das Duell und kommt in die nächste Runde, unabhängig von der Reihenfolge in `teilnehmer`.

## B. Kleinere Fehler

- **B1. Falsche Meldung am Handy:** Wer im Halbfinale verliert, liest bei aktiviertem Spiel um Platz 3 „Gewonnen! Du bist eine Runde weiter!“, weil `tn.aktiv` dort absichtlich `true` bleibt. In der Gruppenphase steht dieselbe Meldung nach jeder Runde bei allen. Der Server soll pro Kind ein klares Feld schicken, z. B. `ich.ausgang: 'gewonnen' | 'verloren' | 'platz3' | 'gruppe' | 'liga'`, und den Platz im Spiel. Das Handy zeigt dann zum Beispiel:
  - „Gewonnen! Du bist weiter“
  - „Knapp verloren – jetzt geht's um Platz 3“
  - „Platz 2 in deiner Gruppe – 3 Punkte“
- **B2. Vorschau am Handy:** Beim Ereignis `vorschau` wechselt das Handy nicht auf den Wartebildschirm mit „Du spielst gegen …“. Das löst sich mit A1, wenn auch das Kind über `zustandAktualisieren()` läuft. `kindGegnerInfoRendern()` muss dabei aufgerufen werden.
- **B3. Titel der Siegerehrung** ist fest „3b Einmaleins-Cup“ (`turnier.html:207`, `#siegerehrung-titel`). Mit `zustand.titel` füllen, ohne Titel einfach „Rechen-Turnier“.
- **B4. Gruppen werden nicht gemischt:** `gruppenEinteilen(aktive…)` nimmt die Beitrittsreihenfolge, deshalb ändert „Neu mischen“ in der Gruppenphase nichts. Vorher `mischen()` aufrufen.
- **B5. Setzung nach der Gruppenphase:** Die Aufsteiger werden nur global nach Punkten sortiert, Erster und Zweiter derselben Gruppe können sich deshalb schon in Runde 1 treffen. Nach Konzept: Gruppensieger auf die oberen Setzplätze, Gruppenzweite so verteilen, dass sie in die andere Baumhälfte kommen. Bei Punktgleichheit in der Gruppe entscheiden erst die Richtigen in der Gruppenphase, dann die Zeit.
- **B6. Wiederherstellen:** Den gelöschten Test „KO-Turnier mit 5 Kindern durchspielen“ wieder aufnehmen, dazu „Sprint mit 4 Kindern“ bis `ende`.
- **B7. Neuverbinden im Countdown:** Kommt das `hallo` in der Phase `countdown`, lädt das Handy `meineAufgaben` nicht aus `z.runde.spiele[].meineAufgaben` und bleibt nach dem Countdown leer. Im Fall `countdown` dieselbe Lade-Logik wie bei `laeuft` verwenden.
- **B8. Antwort auf eine schon fertige Aufgabenliste:** `antworten()` gibt `{ fertig: true, richtig: null }` ohne `ignoriert` zurück, und das Handy spielt dann den Ton für „falsch“. Mit `ignoriert: true` zurückgeben oder am Handy `richtig === null` gesondert behandeln.

## C. Browser-Durchlauf vor dem nächsten „fertig“

Mit `server-piazzi` lokal, die Lehrkraft in einem Fenster, die Kinder in **privaten Fenstern** (getrennter Speicher) oder per Skript. Alles **nur über Klicks**, ohne Neuladen:

1. K.-o., Zeit 30 s, 5 Kinder (mit Freilosen und Spiel um Platz 3), bis zur Siegerehrung. Ein Kind tippt bis 1 s nach Ablauf weiter.
2. K.-o., 5 Aufgaben, zwei Kinder antworten absichtlich gleich: Die Entscheidung läuft am Handy, der Sieger kommt weiter.
3. Gruppen → K.-o. mit 7 Kindern, einmal „Neu mischen“, bis zum Ende.
4. Liga, 3 Runden, bis zum Ende.
5. Ein Kind mitten in einer Runde und einmal im Countdown neu laden.

Für jeden Durchlauf festhalten, was der Beamer und was das Handy nach jedem Schritt zeigt.
