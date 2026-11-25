// Turniermodus Frontend-Logik für Lehrkraft (Beamer) und Kinder (Handy).
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Globale Emoji-Liste (analog zu H.EMOJIS und BILDER)
  const EMOJIS = ['🚗', '✈️', '🐴', '🦄', '🚀', '🚒', '🚜', '🐶', '🐱', '🦁', '🐼', '🦊', '🐸', '🦖', '🐬', '🦋', '⚽', '🌈', '🙂',
    '🐰', '🐻', '🐨', '🐯', '🐮', '🐷', '🐵', '🐧', '🐢', '🐙', '🦈', '🐳', '🦒', '🐘', '🦓', '🦔', '🐝', '🐞', '🦜', '🦉', '🐲', '🦕', '🌻', '🍓', '🍕', '🍦', '🎈', '🌙', '🏀', '🎸', '🚂', '🚁', '⛵', '👑', '🧸', '🎨', '🤖', '👻'];

  // Zustand der aktuellen Sitzung
  let rolle = 'gast'; // 'leitung' | 'kind' | 'zuschauer' | 'gast'
  let turnierCode = null;
  let leitungSchluessel = null;
  let meinTeilnehmer = null; // { id, schluessel, name, emoji }
  let eventSource = null;
  let aktuellerZustand = null;
  let uhrOffsetMs = 0; // Differenz: Serverzeit - lokale Zeit

  // Rechnen (Kind)
  let meinSpielId = null;
  let meineAufgaben = [];
  let aufgabenIndex = 0;
  let aktuelleEingabe = '';
  let wakeLock = null;
  let rundenLiveTimer = null;
  let istEntscheidung = false;
  let meinRichtig = 0;
  let meinFalsch = 0;
  let rundeAufgabenAnzahl = 10;
  let gegnerEmoji = '';
  let antwortWarteschlange = [];
  let warteschlangeAktiv = false;
  let entscheidungSendet = false;
  let tastaturGesperrt = false;
  let countdownAbgelaufen = false;
  let countdownStartTimeout = null;
  let blitzTimer = null;
  let spielStaende = new Map();
  let ssePruefungLaeuft = false;

  function istChallengeModeAktiv() {
    return Boolean(aktuellerZustand && aktuellerZustand.einstellungen && aktuellerZustand.einstellungen.challengeMode);
  }

  function fmtUhr(sek) {
    const s = Math.max(0, Math.floor(sek));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function istZeitModusAktiv() {
    return Boolean(aktuellerZustand && aktuellerZustand.einstellungen && aktuellerZustand.einstellungen.art === 'zeit');
  }

  function rundenUhrStarten(startUm, dauerMs) {
    if (rundenLiveTimer) clearInterval(rundenLiveTimer);
    const basisStart = startUm || Date.now();
    const hatDauer = typeof dauerMs === 'number' && dauerMs > 0;
    const endeUm = hatDauer ? basisStart + dauerMs : null;

    function tick() {
      const serverJetzt = Date.now() + uhrOffsetMs;
      const beamerUhr = $('#live-uhr');
      if (beamerUhr && endeUm !== null) {
        const restSek = Math.max(0, Math.ceil((endeUm - serverJetzt) / 1000));
        const min = Math.floor(restSek / 60);
        const sek = restSek % 60;
        beamerUhr.textContent = `${String(min).padStart(2, '0')}:${String(sek).padStart(2, '0')}`;
      }

      const handyUhr = $('#uhr');
      if (handyUhr) {
        if (istEntscheidung || (istZeitModusAktiv() && endeUm !== null)) {
          const restMs = Math.max(0, (endeUm || (basisStart + 60000)) - serverJetzt);
          const restSek = Math.ceil(restMs / 1000);
          handyUhr.textContent = fmtUhr(restSek);
          if (!istEntscheidung && hatDauer) {
            const balken = $('#fortschritt .balken');
            if (balken && balken.firstElementChild) {
              balken.firstElementChild.style.width = `${Math.max(0, restMs / dauerMs) * 100}%`;
              balken.classList.toggle('knapp', restSek <= 10);
            }
          }
          if (restMs <= 0 && !beamerUhr) {
            clearInterval(rundenLiveTimer);
            rundenLiveTimer = null;
          }
        } else {
          const vergangenSek = Math.max(0, (serverJetzt - basisStart) / 1000);
          handyUhr.textContent = fmtUhr(vergangenSek);
        }
      }

      if (endeUm !== null && serverJetzt >= endeUm && (istEntscheidung || istZeitModusAktiv())) {
        clearInterval(rundenLiveTimer);
        rundenLiveTimer = null;
      }
    }
    tick();
    rundenLiveTimer = setInterval(tick, 200);
  }

  // Bildschirmwechsel
  function zeigeScreen(id) {
    $$('.screen').forEach((s) => s.classList.remove('aktiv'));
    const ziel = $(`#${id}`);
    if (ziel) ziel.classList.add('aktiv');
    document.body.classList.toggle('rechnen-aktiv', id === 'screen-rechnen');
    if (id === 'screen-rechnen') {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      window.scrollTo(0, 0);
    }
  }

  // WakeLock für Handys anfordern
  async function wakeLockAktivieren() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {
      // Ignorieren falls nicht unterstützt
    }
  }

  // -------------------------------------------------------------------
  // SSE: Server-Sent Events Live-Verbindung
  // -------------------------------------------------------------------
  function sseVerbinden(code, schluessel) {
    if (eventSource) eventSource.close();

    const param = schluessel ? `?s=${encodeURIComponent(schluessel)}` : '';
    eventSource = new EventSource(`/api/turnier/${code}/ereignisse${param}`);

    eventSource.addEventListener('open', () => {
      $('#offline-balken').classList.add('versteckt');
    });

    eventSource.addEventListener('error', async () => {
      $('#offline-balken').classList.remove('versteckt');
      const aktiverCode = turnierCode;
      if (!aktiverCode || ssePruefungLaeuft) return;
      ssePruefungLaeuft = true;
      try {
        const status = await turnierExistenzPruefen(aktiverCode);
        if (status === 'nicht_gefunden' && turnierCode === aktiverCode) {
          const alsKind = rolle === 'kind';
          allesZuruecksetzen(alsKind, alsKind ? 'Das Turnier wurde beendet oder existiert nicht mehr.' : '');
        }
      } finally {
        ssePruefungLaeuft = false;
      }
    });

    eventSource.addEventListener('hallo', (ev) => {
      $('#offline-balken').classList.add('versteckt');
      const daten = JSON.parse(ev.data);
      rolle = daten.rolle;
      uhrOffsetMs = daten.jetzt - Date.now();
      zustandAktualisieren(daten.zustand);
    });

    eventSource.addEventListener('teilnehmer', (ev) => {
      const liste = JSON.parse(ev.data);
      teilnehmerRendern(liste);
      if (typeof Ton !== 'undefined') Ton.klick();
    });

    eventSource.addEventListener('vorschau', (ev) => {
      const daten = JSON.parse(ev.data);
      if (!aktuellerZustand) aktuellerZustand = { code: turnierCode };
      aktuellerZustand.phase = 'vorschau';
      aktuellerZustand.runde = daten.runde;
      if (daten.baum !== undefined) aktuellerZustand.baum = daten.baum;
      zustandAktualisieren(aktuellerZustand);
    });

    eventSource.addEventListener('countdown', (ev) => {
      const daten = JSON.parse(ev.data);
      if (!aktuellerZustand) aktuellerZustand = { code: turnierCode };
      aktuellerZustand.phase = 'countdown';
      aktuellerZustand.countdownBis = daten.startUm;
      if (daten.dauerMs) {
        if (!aktuellerZustand.runde) aktuellerZustand.runde = {};
        aktuellerZustand.runde.start = daten.startUm;
        aktuellerZustand.runde.dauerMs = daten.dauerMs;
      }
      if (rolle === 'leitung' || rolle === 'zuschauer') {
        zeigeScreen('screen-live');
        liveRendern(aktuellerZustand.runde);
      }
      countdownStarten(daten.startUm, daten.dauerMs);
    });

    eventSource.addEventListener('beitritt', (ev) => {
      const daten = JSON.parse(ev.data);
      if (aktuellerZustand) aktuellerZustand.offen = daten.offen;
      const btn = $('#btn-beitritt-toggle');
      if (btn) {
        btn.textContent = daten.offen ? 'Beitritt: Offen' : 'Beitritt: Geschlossen';
        btn.className = daten.offen ? 'knopf klein gruen' : 'knopf klein grau';
      }
    });

    eventSource.addEventListener('aufgaben', (ev) => {
      const daten = JSON.parse(ev.data);
      meinSpielId = daten.spiel;
      meineAufgaben = daten.aufgaben || [];
      aufgabenIndex = 0;
      aktuelleEingabe = '';
      istEntscheidung = false;
      meinRichtig = 0;
      meinFalsch = 0;
      antwortWarteschlange = [];
      warteschlangeAktiv = false;
      entscheidungSendet = false;
      sperreAufheben();

      if (rolle === 'kind' && meineAufgaben.length > 0 && (countdownAbgelaufen || (aktuellerZustand && aktuellerZustand.phase === 'laeuft'))) {
        const startUm = (aktuellerZustand && (aktuellerZustand.countdownBis || (aktuellerZustand.runde && aktuellerZustand.runde.start))) || Date.now();
        const dauerMs = aktuellerZustand && aktuellerZustand.runde && aktuellerZustand.runde.dauerMs;
        rechnenStarten(startUm, dauerMs);
      }
    });

    eventSource.addEventListener('entscheidung', (ev) => {
      const daten = JSON.parse(ev.data);
      const warSchonEntscheidung = istEntscheidung && meinSpielId === daten.spiel;
      istEntscheidung = true;
      meinSpielId = daten.spiel;
      meineAufgaben = [daten.aufgabe];
      aufgabenIndex = 0;
      aktuelleEingabe = '';
      entscheidungSendet = false;

      if (!warSchonEntscheidung) {
        antwortWarteschlange = [];
        warteschlangeAktiv = false;
        sperreAufheben();
        rechnenStarten(Date.now() + uhrOffsetMs, 60000);
      } else {
        aufgabeZeigen();
      }
    });

    eventSource.addEventListener('entscheidung_beamer', (ev) => {
      const daten = JSON.parse(ev.data);
      if (!aktuellerZustand) aktuellerZustand = { code: turnierCode };
      aktuellerZustand.phase = 'entscheidung';
      if (daten && daten.runde) aktuellerZustand.runde = daten.runde;
      zustandAktualisieren(aktuellerZustand);
    });

    eventSource.addEventListener('fortschritt', (ev) => {
      const daten = JSON.parse(ev.data);
      fortschrittAktualisieren(daten);
    });

    eventSource.addEventListener('rundenende', (ev) => {
      const daten = JSON.parse(ev.data);
      rundenendeRendern(daten);
    });

    eventSource.addEventListener('ende', (ev) => {
      const daten = JSON.parse(ev.data);
      turnierendeRendern(daten);
    });

    eventSource.addEventListener('entfernt', () => {
      alert('Du wurdest aus dem Turnier entfernt.');
      storageLoeschen();
      location.hash = '';
      location.reload();
    });
  }

  // -------------------------------------------------------------------
  // Zustands-Renderer
  // -------------------------------------------------------------------
  function zustandAktualisieren(zustand) {
    if (!zustand) return;
    aktuellerZustand = zustand;
    turnierCode = zustand.code;

    // Je nach Rolle und Phase auf den richtigen Bildschirm springen
    if (rolle === 'leitung' || rolle === 'zuschauer') {
      beamerZustandRendern(zustand);
    } else if (rolle === 'kind') {
      kindZustandRendern(zustand);
    }
  }

  function beamerZustandRendern(z) {
    $('#lobby-titel').textContent = z.titel || 'Rechen-Turnier';
    $('#lobby-code').textContent = z.code;
    $('#lobby-url-text').textContent = `${location.host}/turnier`;
    $$('.btn-turnier-reset').forEach((btn) => btn.classList.toggle('versteckt', rolle !== 'leitung'));

    switch (z.phase) {
      case 'lobby': {
        zeigeScreen('screen-lobby');
        qrCodeRendern(`${location.origin}/turnier#${z.code}`);
        teilnehmerRendern(z.teilnehmer || []);
        $('#btn-beitritt-toggle').textContent = z.offen ? 'Beitritt: Offen' : 'Beitritt: Geschlossen';
        $('#btn-beitritt-toggle').className = z.offen ? 'knopf klein gruen' : 'knopf klein grau';
        $('#btn-turnier-starten').disabled = !z.teilnehmer || z.teilnehmer.length < 2;
        break;
      }
      case 'vorschau': {
        zeigeScreen('screen-vorschau');
        vorschauRendern(z.runde);
        break;
      }
      case 'countdown':
      case 'laeuft': {
        zeigeScreen('screen-live');
        liveRendern(z.runde);
        if (z.phase === 'countdown' && z.countdownBis) {
          countdownStarten(z.countdownBis);
        }
        break;
      }
      case 'entscheidung': {
        zeigeScreen('screen-ergebnis');
        ergebnisRendern(z.runde);
        const btn = $('#btn-naechste-runde');
        if (btn) btn.disabled = true;
        break;
      }
      case 'auswertung': {
        zeigeScreen('screen-ergebnis');
        ergebnisRendern(z.runde);
        const btn = $('#btn-naechste-runde');
        if (btn) btn.disabled = false;
        break;
      }
      case 'ende': {
        zeigeScreen('screen-siegerehrung');
        siegerehrungRendern(z.teilnehmer || []);
        break;
      }
    }
  }

  function kindZustandRendern(z) {
    wakeLockAktivieren();
    const ich = z.ich;
    if (ich) {
      $('#warten-mein-emoji').textContent = ich.emoji;
      $('#warten-mein-name').textContent = ich.name;
    }

    switch (z.phase) {
      case 'lobby': {
        zeigeScreen('screen-warten');
        $('#warten-status').textContent = 'Warte auf den Start durch die Lehrkraft …';
        $('#warten-gegner-info').classList.add('versteckt');
        $('#warten-zaehler').textContent = wartenZaehlerText((z.teilnehmer || []).length);
        break;
      }
      case 'vorschau': {
        countdownStoppen();
        sperreAufheben();
        spielStaende.clear();
        challengeAnzeigeVerstecken();
        zeigeScreen('screen-warten');
        $('#warten-status').textContent = 'Runde wird vorbereitet …';
        kindGegnerInfoRendern(z.runde);
        break;
      }
      case 'countdown': {
        if (z.runde && ich && ich.aktiv) {
          const sp = z.runde.spiele && z.runde.spiele.find((s) => s.teilnehmer.some((t) => t.id === ich.id));
          if (sp && Array.isArray(sp.meineAufgaben) && sp.meineAufgaben.length > 0) {
            meineAufgaben = sp.meineAufgaben;
            meinSpielId = sp.id;
          }
          aufgabenIndex = typeof ich.index === 'number' ? ich.index : 0;
          meinRichtig = ich.richtig || 0;
          meinFalsch = ich.falsch || 0;
          istEntscheidung = false;
        }
        if (z.countdownBis) countdownStarten(z.countdownBis, z.runde && z.runde.dauerMs);
        break;
      }
      case 'laeuft': {
        countdownStoppen();
        if (z.runde && ich && ich.aktiv) {
          if (ich.fertig) {
            zeigeScreen('screen-warten');
            $('#warten-status').textContent = 'Du hast alle Aufgaben gelöst! Warte auf das Rundenende …';
            return;
          }
          const sp = z.runde.spiele && z.runde.spiele.find((s) => s.teilnehmer.some((t) => t.id === ich.id));
          if (sp && Array.isArray(sp.meineAufgaben) && sp.meineAufgaben.length > 0) {
            meineAufgaben = sp.meineAufgaben;
            meinSpielId = sp.id;
          }
          aufgabenIndex = typeof ich.index === 'number' ? ich.index : 0;
          meinRichtig = ich.richtig || 0;
          meinFalsch = ich.falsch || 0;
          istEntscheidung = false;
          aktuelleEingabe = '';
          rechnenStarten(z.runde.start || (Date.now() + uhrOffsetMs), z.runde.dauerMs);
        } else {
          zeigeScreen('screen-warten');
          $('#warten-status').textContent = 'Du schaust in dieser Runde zu.';
        }
        break;
      }
      case 'entscheidung': {
        countdownStoppen();
        if (z.entscheidung && z.entscheidung.aufgabe) {
          istEntscheidung = true;
          meinSpielId = z.entscheidung.spiel;
          meineAufgaben = [z.entscheidung.aufgabe];
          aufgabenIndex = 0;
          aktuelleEingabe = '';
          rechnenStarten(Date.now() + uhrOffsetMs, 60000);
          const restSperreMs = (z.entscheidung.sperreBis || 0) - (Date.now() + uhrOffsetMs);
          if (restSperreMs > 0) {
            sperreAktivieren(Math.ceil(restSperreMs / 1000));
          }
        } else {
          zeigeScreen('screen-warten');
          $('#warten-status').textContent = 'Entscheidungsaufgabe läuft …';
        }
        break;
      }
      case 'auswertung': {
        zeigeScreen('screen-kind-ergebnis');
        const ich = z.ich;
        if (ich) {
          const ausgang = ich.ausgang || (ich.aktiv ? 'gewonnen' : 'verloren');
          if (ausgang === 'gewonnen') {
            $('#kind-ergebnis-emoji').textContent = '🎉';
            $('#kind-ergebnis-titel').textContent = 'Gewonnen!';
            $('#kind-ergebnis-nachricht').textContent = 'Du bist weiter!';
          } else if (ausgang === 'platz3') {
            $('#kind-ergebnis-emoji').textContent = '🥉';
            $('#kind-ergebnis-titel').textContent = 'Halbfinale beendet';
            $('#kind-ergebnis-nachricht').textContent = "Knapp verloren – jetzt geht's um Platz 3!";
          } else if (ausgang === 'gruppe') {
            $('#kind-ergebnis-emoji').textContent = '👏';
            $('#kind-ergebnis-titel').textContent = 'Runde beendet!';
            $('#kind-ergebnis-nachricht').textContent = `Platz ${ich.spielPlatz || ich.platz || '-'} in deiner Gruppe – ${ich.punkte || 0} Punkte`;
          } else if (ausgang === 'liga') {
            $('#kind-ergebnis-emoji').textContent = '👏';
            $('#kind-ergebnis-titel').textContent = 'Runde beendet!';
            $('#kind-ergebnis-nachricht').textContent = `Runde abgeschlossen! Platz ${ich.spielPlatz || ich.platz || '-'}`;
          } else {
            $('#kind-ergebnis-emoji').textContent = '👏';
            $('#kind-ergebnis-titel').textContent = 'Stark gekämpft!';
            $('#kind-ergebnis-nachricht').textContent = 'Du scheidest aus und schaust jetzt zu.';
          }
        }
        break;
      }
      case 'ende': {
        zeigeScreen('screen-kind-ergebnis');
        $('#kind-ergebnis-emoji').textContent = '🏆';
        $('#kind-ergebnis-titel').textContent = 'Turnier beendet!';
        $('#kind-ergebnis-nachricht').textContent = ich && ich.platz ? `Du hast Platz ${ich.platz} erreicht!` : 'Tolle Leistung!';
        break;
      }
    }
  }

  // -------------------------------------------------------------------
  // QR-Code rendern
  // -------------------------------------------------------------------
  function qrCodeRendern(url) {
    const kasten = $('#lobby-qr-code');
    if (!kasten || typeof qrcode === 'undefined') return;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      kasten.innerHTML = qr.createSvgTag(6, 12);
    } catch (e) {
      kasten.textContent = url;
    }
  }

  // -------------------------------------------------------------------
  // Teilnehmerliste & Chips
  // -------------------------------------------------------------------
  function wartenZaehlerText(n) {
    return n === 1 ? '1 Teilnehmer ist dabei' : `${n} Teilnehmer sind dabei`;
  }

  function teilnehmerRendern(teilnehmer) {
    if (aktuellerZustand) aktuellerZustand.teilnehmer = teilnehmer;
    const wartenZaehler = $('#warten-zaehler');
    if (wartenZaehler && (!aktuellerZustand || aktuellerZustand.phase === 'lobby')) {
      wartenZaehler.textContent = wartenZaehlerText(teilnehmer.length);
    }
    const raster = $('#lobby-teilnehmer-raster');
    const zaehler = $('#lobby-zaehler');
    if (zaehler) zaehler.textContent = `${teilnehmer.length} Teilnehmer da`;
    if ($('#btn-turnier-starten')) {
      $('#btn-turnier-starten').disabled = teilnehmer.length < 2;
    }

    if (!raster) return;
    raster.innerHTML = '';
    teilnehmer.forEach((tn) => {
      const chip = document.createElement('div');
      chip.className = 'kind-chip';
      chip.innerHTML = `
        <span><span class="emoji">${tn.emoji}</span>${escapeHtml(tn.name)}</span>
        ${rolle === 'leitung' ? `<button class="loeschen-btn" data-id="${tn.id}" title="Entfernen">✕</button>` : ''}
      `;
      raster.appendChild(chip);
    });

    // Entfernen-Knöpfe
    if (rolle === 'leitung') {
      raster.querySelectorAll('.loeschen-btn').forEach((btn) => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const id = btn.dataset.id;
          if (confirm('Teilnehmer wirklich entfernen?')) {
            await befehlSenden('entfernen', { id });
          }
        });
      });
    }
  }

  // -------------------------------------------------------------------
  // Vorschau rendern
  // -------------------------------------------------------------------
  function vorschauRendern(runde) {
    if (!runde) return;
    $('#vorschau-stufe').textContent = rundeStufenName(runde.stufe, runde.nr);
    const raster = $('#vorschau-spiele-raster');
    if (!raster) return;
    raster.innerHTML = '';

    (runde.spiele || []).forEach((sp, idx) => {
      const karte = document.createElement('div');
      karte.className = 'duell-karte';

      const titel = sp.typ === 'platz3'
        ? '<div class="grau klein fett text-blau">🥉 Spiel um Platz 3</div>'
        : (sp.gruppeNr ? `<div class="grau klein fett">Gruppe ${sp.gruppeNr}</div>` : `<div class="grau klein">Spiel ${idx + 1}</div>`);

      if (sp.teilnehmer.length > 2) {
        let spielerHtml = '<div class="gruppe-teilnehmer-liste mt-1">';
        sp.teilnehmer.forEach((tn) => {
          spielerHtml += `<div><span class="emoji">${tn.emoji}</span> ${escapeHtml(tn.name)}</div>`;
        });
        spielerHtml += '</div>';
        karte.innerHTML = `${titel}${spielerHtml}`;
        raster.appendChild(karte);
        return;
      }

      const t1 = sp.teilnehmer[0] || { name: 'Offen', emoji: '❓' };
      const t2 = sp.teilnehmer[1] || (sp.freilos ? { name: 'Freilos', emoji: '✨' } : { name: 'Offen', emoji: '❓' });

      karte.innerHTML = `
        ${titel}
        <div class="duell-kontrahenten">
          <div class="spieler-name-box">
            <span class="emoji">${t1.emoji}</span>
            <span>${escapeHtml(t1.name)}</span>
          </div>
          <div class="duell-vs">vs.</div>
          <div class="spieler-name-box rechts">
            <span>${escapeHtml(t2.name)}</span>
            <span class="emoji">${t2.emoji}</span>
          </div>
        </div>
      `;
      raster.appendChild(karte);
    });
  }

  function kindGegnerInfoRendern(runde) {
    if (!runde || !meinTeilnehmer) return;
    const sp = (runde.spiele || []).find((s) => s.teilnehmer.some((t) => t.id === meinTeilnehmer.id));
    const kasten = $('#warten-gegner-info');
    if (!sp || !kasten) return;

    kasten.classList.remove('versteckt');
    if (sp.teilnehmer.length > 2) {
      const andere = sp.teilnehmer.filter((t) => t.id !== meinTeilnehmer.id);
      const namen = andere.map((t) => `${t.emoji} ${escapeHtml(t.name)}`).join(', ');
      kasten.innerHTML = `<p>${sp.gruppeNr ? `Gruppe ${sp.gruppeNr}` : 'Sprint'}: Du spielst gegen <strong>${namen}</strong></p>`;
      return;
    }

    const gegner = sp.teilnehmer.find((t) => t.id !== meinTeilnehmer.id);
    if (sp.freilos || !gegner) {
      kasten.innerHTML = '<p class="text-gruen">✨ Du hast in dieser Runde ein Freilos!</p>';
    } else {
      kasten.innerHTML = `<p>Du spielst gegen <strong>${gegner.emoji} ${escapeHtml(gegner.name)}</strong></p>`;
    }
  }

  // -------------------------------------------------------------------
  // Countdown
  // -------------------------------------------------------------------
  let countdownTimer = null;
  function countdownStoppen() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (countdownStartTimeout) {
      clearTimeout(countdownStartTimeout);
      countdownStartTimeout = null;
    }
    const overlay = $('#countdown-overlay');
    if (overlay) overlay.classList.add('versteckt');
  }

  function countdownStarten(startUm, dauerMs) {
    countdownStoppen();
    countdownAbgelaufen = false;
    const overlay = $('#countdown-overlay');
    const zahl = $('#countdown-zahl');

    if (overlay) overlay.classList.remove('versteckt');

    function tick() {
      const restMs = startUm - (Date.now() + uhrOffsetMs);
      const sek = Math.ceil(restMs / 1000);
      if (sek > 0) {
        if (zahl) zahl.textContent = sek;
        if (typeof Ton !== 'undefined') Ton.note(440, 0, 0.08, 'triangle', 0.2);
      } else {
        if (zahl) zahl.textContent = 'Los!';
        if (typeof Ton !== 'undefined') Ton.note(880, 0, 0.2, 'triangle', 0.3);
        clearInterval(countdownTimer);
        countdownTimer = null;
        countdownStartTimeout = setTimeout(() => {
          countdownStartTimeout = null;
          countdownAbgelaufen = true;
          if (overlay) overlay.classList.add('versteckt');
          const effektiveDauerMs = dauerMs || (aktuellerZustand && aktuellerZustand.runde && aktuellerZustand.runde.dauerMs);
          if (rolle === 'kind' && meineAufgaben.length > 0) {
            rechnenStarten(startUm, effektiveDauerMs);
          } else if (effektiveDauerMs) {
            rundenUhrStarten(startUm, effektiveDauerMs);
          }
        }, 600);
      }
    }

    tick();
    countdownTimer = setInterval(tick, 200);
  }

  // -------------------------------------------------------------------
  // Live-Anzeige (Beamer)
  // -------------------------------------------------------------------
  function liveRendern(runde) {
    if (!runde) return;
    $('#live-stufe').textContent = rundeStufenName(runde.stufe, runde.nr);
    const liste = $('#live-spiele-liste');
    if (!liste) return;
    liste.innerHTML = '';

    (runde.spiele || []).forEach((sp) => {
      if (sp.teilnehmer && sp.teilnehmer.length > 2) {
        const kasten = document.createElement('div');
        kasten.className = 'live-mehrspieler-kasten';
        kasten.id = `live-spiel-${sp.id}`;
        if (sp.gruppeNr) {
          const ueberschrift = document.createElement('div');
          ueberschrift.className = 'grau klein fett';
          ueberschrift.textContent = `Gruppe ${sp.gruppeNr}`;
          kasten.appendChild(ueberschrift);
        }
        sp.teilnehmer.forEach((tn) => {
          const st = (sp.stand && sp.stand[tn.id]) || { richtig: 0, falsch: 0, index: 0 };
          const z = document.createElement('div');
          z.className = 'live-spieler-zeile';
          z.innerHTML = `
            <div class="spieler-name-box">
              <span class="emoji">${tn.emoji}</span>
              <span>${escapeHtml(tn.name)}</span>
            </div>
            <div class="fortschritt-balken-rahmen">
              <div id="balken-${sp.id}-${tn.id}-richtig" class="fortschritt-segment richtig" style="width: 0%"></div>
              <div id="balken-${sp.id}-${tn.id}-falsch" class="fortschritt-segment falsch" style="width: 0%"></div>
            </div>
            <div class="duell-score text-rechts">
              <span id="score-${sp.id}-${tn.id}">${st.richtig}</span>
            </div>
          `;
          kasten.appendChild(z);
        });
        liste.appendChild(kasten);
        return;
      }

      const zeile = document.createElement('div');
      zeile.className = 'live-duell-zeile';
      zeile.id = `live-spiel-${sp.id}`;

      const t1 = sp.teilnehmer[0] || { id: 't1', name: '-', emoji: '❓' };
      const t2 = sp.teilnehmer[1] || (sp.freilos ? { id: 't2', name: 'Freilos', emoji: '✨' } : { id: 't2', name: '-', emoji: '❓' });

      const st1 = (sp.stand && sp.stand[t1.id]) || { richtig: 0, falsch: 0, index: 0 };
      const st2 = (sp.stand && sp.stand[t2.id]) || { richtig: 0, falsch: 0, index: 0 };

      zeile.innerHTML = `
        <div class="spieler-name-box">
          <span class="emoji">${t1.emoji}</span>
          <span>${escapeHtml(t1.name)}</span>
        </div>
        <div class="duell-balken-mitte">
          <div class="fortschritt-balken-rahmen">
            <div id="balken-${sp.id}-${t1.id}-richtig" class="fortschritt-segment richtig" style="width: 0%"></div>
            <div id="balken-${sp.id}-${t1.id}-falsch" class="fortschritt-segment falsch" style="width: 0%"></div>
          </div>
          <div class="duell-score" id="score-${sp.id}">
            <span id="score-${sp.id}-${t1.id}">${st1.richtig}</span> : <span id="score-${sp.id}-${t2.id}">${st2.richtig}</span>
          </div>
          <div class="fortschritt-balken-rahmen">
            <div id="balken-${sp.id}-${t2.id}-richtig" class="fortschritt-segment richtig" style="width: 0%"></div>
            <div id="balken-${sp.id}-${t2.id}-falsch" class="fortschritt-segment falsch" style="width: 0%"></div>
          </div>
        </div>
        <div class="spieler-name-box rechts">
          <span>${escapeHtml(t2.name)}</span>
          <span class="emoji">${t2.emoji}</span>
        </div>
      `;
      liste.appendChild(zeile);
    });
  }

  function fortschrittAktualisieren(daten) {
    const { spiel, id, index, richtig, falsch } = daten;
    const scoreElem = $(`#score-${spiel}-${id}`);
    if (scoreElem) scoreElem.textContent = richtig;

    const istZeitModus = aktuellerZustand && aktuellerZustand.einstellungen && aktuellerZustand.einstellungen.art === 'zeit';
    let zielAnzahl = 10;
    if (istZeitModus) {
      const scoreElems = $$(`[id^="score-${spiel}-"]`);
      let maxScore = 5;
      scoreElems.forEach((el) => {
        const val = Number.parseInt(el.textContent) || 0;
        if (val > maxScore) maxScore = val;
      });
      zielAnzahl = maxScore;
    } else {
      zielAnzahl = (aktuellerZustand && aktuellerZustand.einstellungen && aktuellerZustand.einstellungen.anzahl) || 10;
    }

    const pRichtig = Math.min(100, (richtig / zielAnzahl) * 100);
    const pFalsch = Math.min(100, (falsch / zielAnzahl) * 100);

    const bRichtig = $(`#balken-${spiel}-${id}-richtig`);
    const bFalsch = $(`#balken-${spiel}-${id}-falsch`);
    if (bRichtig) bRichtig.style.width = `${pRichtig}%`;
    if (bFalsch) bFalsch.style.width = `${pFalsch}%`;

    // Challenge-Anzeige am Handy aktualisieren
    if (rolle === 'kind' && meinTeilnehmer && istChallengeModeAktiv() && spiel === meinSpielId) {
      const eintrag = spielStaende.get(id);
      if (eintrag) {
        if (richtig > eintrag.richtig) eintrag.zuletzt = Date.now();
        eintrag.richtig = richtig;
        eintrag.falsch = falsch;
        eintrag.index = index;
        eintrag.fertig = Boolean(daten.fertig);
        challengeAnzeigeAktualisieren();
      }
    }
  }

  // -------------------------------------------------------------------
  // Ergebnis der Runde (Beamer)
  // -------------------------------------------------------------------
  function ergebnisRendern(runde) {
    if (!runde) return;
    const raster = $('#ergebnis-spiele-raster');
    if (!raster) return;
    raster.innerHTML = '';

    (runde.spiele || []).forEach((sp, idx) => {
      const karte = document.createElement('div');
      karte.className = 'duell-karte';

      const erg = sp.ergebnis || [];
      const titel = sp.typ === 'platz3'
        ? '<div class="grau klein fett text-blau">🥉 Spiel um Platz 3</div>'
        : (sp.gruppeNr ? `<div class="grau klein fett">Gruppe ${sp.gruppeNr}</div>` : `<div class="grau klein">Spiel ${idx + 1}</div>`);

      let html = titel;
      erg.forEach((e) => {
        const tn = (sp.teilnehmer || []).find((t) => (typeof t === 'string' ? t === e.id : t.id === e.id));
        const name = tn ? (tn.name || tn.id) : e.id;
        const emoji = tn ? (tn.emoji || '👤') : '👤';
        const istGewinner = e.platz === 1;
        html += `
          <div class="duell-kontrahenten ${istGewinner ? 'text-gruen fett' : 'grau'}">
            <span>${istGewinner ? '👑 ' : ''}${emoji} ${escapeHtml(name)}</span>
            <span>${e.richtig} richtig (${e.zeit} s)</span>
          </div>
        `;
      });
      if (sp.entscheidung) {
        if (sp.entscheidung.geloestVon) {
          const siegerTn = (sp.teilnehmer || []).find((t) => (typeof t === 'string' ? t === sp.entscheidung.geloestVon : t.id === sp.entscheidung.geloestVon));
          const name = siegerTn ? (siegerTn.name || siegerTn.id) : sp.entscheidung.geloestVon;
          html += `<div class="klein fett text-blau mt-1">⚡ Entschieden durch Zusatzaufgabe: ${escapeHtml(name)}</div>`;
        } else if (sp.entscheidung.los) {
          const siegerTn = (sp.teilnehmer || []).find((t) => (typeof t === 'string' ? t === sp.entscheidung.losEntscheidung : t.id === sp.entscheidung.losEntscheidung));
          const name = siegerTn ? (siegerTn.name || siegerTn.id) : sp.entscheidung.losEntscheidung;
          html += `<div class="klein fett text-blau mt-1">🎲 Entschieden durch Los: ${escapeHtml(name)}</div>`;
        } else {
          html += '<div class="klein fett text-blau mt-1">⚡ Entscheidung läuft …</div>';
        }
      }
      karte.innerHTML = html;
      raster.appendChild(karte);
    });
  }

  // -------------------------------------------------------------------
  // Siegerehrung & Podest
  // -------------------------------------------------------------------
  function siegerehrungRendern(teilnehmer) {
    if (typeof Ton !== 'undefined') Ton.jubel();
    const titelElem = $('#siegerehrung-titel');
    if (titelElem) {
      titelElem.textContent = (aktuellerZustand && aktuellerZustand.titel) || 'Rechen-Turnier';
    }
    const sortiert = teilnehmer.slice().sort((a, b) => {
      const pA = Number.parseInt(a.platz) || 999;
      const pB = Number.parseInt(b.platz) || 999;
      return pA - pB;
    });

    const p1 = sortiert.find((t) => String(t.platz) === '1');
    const p2 = sortiert.find((t) => String(t.platz) === '2');
    const p3 = sortiert.find((t) => String(t.platz) === '3');

    if (p1) {
      $('#podest-emoji-1').textContent = p1.emoji;
      $('#podest-name-1').textContent = p1.name;
    }
    if (p2) {
      $('#podest-emoji-2').textContent = p2.emoji;
      $('#podest-name-2').textContent = p2.name;
    }
    if (p3) {
      $('#podest-emoji-3').textContent = p3.emoji;
      $('#podest-name-3').textContent = p3.name;
    }

    const tbody = $('#endrangliste tbody');
    if (tbody) {
      tbody.innerHTML = '';
      sortiert.forEach((t) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>Platz ${t.platz || '-'}</strong></td>
          <td>${t.emoji} ${escapeHtml(t.name)}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  function rundenendeRendern(daten) {
    countdownStoppen();
    sperreAufheben();
    spielStaende.clear();
    challengeAnzeigeVerstecken();
    antwortWarteschlange = [];
    warteschlangeAktiv = false;
    entscheidungSendet = false;
    istEntscheidung = false;
    if (rundenLiveTimer) { clearInterval(rundenLiveTimer); rundenLiveTimer = null; }
    if (!aktuellerZustand) aktuellerZustand = { code: turnierCode };
    aktuellerZustand.phase = 'auswertung';
    if (daten && daten.runde) aktuellerZustand.runde = daten.runde;
    if (daten && daten.teilnehmer) aktuellerZustand.teilnehmer = daten.teilnehmer;
    if (daten && daten.ich) aktuellerZustand.ich = daten.ich;

    if (rolle === 'leitung' || rolle === 'zuschauer') {
      zeigeScreen('screen-ergebnis');
      ergebnisRendern((daten && daten.runde) || (aktuellerZustand && aktuellerZustand.runde));
      // War vorher eine Entscheidung offen, ist der Knopf noch gesperrt
      const btn = $('#btn-naechste-runde');
      if (btn) btn.disabled = false;
    } else if (rolle === 'kind') {
      zeigeScreen('screen-kind-ergebnis');
      const ich = daten && daten.ich;
      const format = (aktuellerZustand && aktuellerZustand.einstellungen && aktuellerZustand.einstellungen.format) || 'ko';
      const detailsElem = $('#kind-ergebnis-details');

      if (ich) {
        const ausgang = ich.ausgang || (ich.weiter ? 'gewonnen' : 'verloren');
        if (ausgang === 'gewonnen') {
          $('#kind-ergebnis-emoji').textContent = '🎉';
          $('#kind-ergebnis-titel').textContent = 'Gewonnen!';
          $('#kind-ergebnis-nachricht').textContent = 'Du bist weiter!';
        } else if (ausgang === 'platz3') {
          $('#kind-ergebnis-emoji').textContent = '🥉';
          $('#kind-ergebnis-titel').textContent = 'Halbfinale beendet';
          $('#kind-ergebnis-nachricht').textContent = "Knapp verloren – jetzt geht's um Platz 3!";
        } else if (ausgang === 'gruppe') {
          $('#kind-ergebnis-emoji').textContent = '👏';
          $('#kind-ergebnis-titel').textContent = 'Runde beendet!';
          $('#kind-ergebnis-nachricht').textContent = `Platz ${ich.platz || '-'} in deiner Gruppe – ${ich.punkte || 0} Punkte`;
        } else if (ausgang === 'liga') {
          $('#kind-ergebnis-emoji').textContent = '👏';
          $('#kind-ergebnis-titel').textContent = 'Runde beendet!';
          $('#kind-ergebnis-nachricht').textContent = `Runde abgeschlossen! Platz ${ich.platz || '-'}`;
        } else {
          $('#kind-ergebnis-emoji').textContent = '👏';
          $('#kind-ergebnis-titel').textContent = 'Stark gekämpft!';
          $('#kind-ergebnis-nachricht').textContent = 'Du scheidest aus und schaust jetzt zu.';
        }
        if (detailsElem) {
          detailsElem.innerHTML = `
            <p><strong>${ich.richtig || 0}</strong> richtig${ich.falsch ? `, <strong>${ich.falsch}</strong> Fehler` : ''}</p>
            ${ich.zeit ? `<p class="grau klein">Zeit: ${ich.zeit} s</p>` : ''}
          `;
        }
      }
    }
  }

  function turnierendeRendern(daten) {
    countdownStoppen();
    sperreAufheben();
    spielStaende.clear();
    challengeAnzeigeVerstecken();
    antwortWarteschlange = [];
    warteschlangeAktiv = false;
    entscheidungSendet = false;
    istEntscheidung = false;
    if (rundenLiveTimer) { clearInterval(rundenLiveTimer); rundenLiveTimer = null; }
    if (!aktuellerZustand) aktuellerZustand = { code: turnierCode };
    aktuellerZustand.phase = 'ende';
    if (daten && daten.teilnehmer) aktuellerZustand.teilnehmer = daten.teilnehmer;
    if (daten && daten.ich) aktuellerZustand.ich = daten.ich;

    if (rolle === 'leitung' || rolle === 'zuschauer') {
      zeigeScreen('screen-siegerehrung');
      siegerehrungRendern((daten && daten.teilnehmer) || (aktuellerZustand && aktuellerZustand.teilnehmer) || []);
    } else if (rolle === 'kind') {
      zeigeScreen('screen-kind-ergebnis');
      $('#kind-ergebnis-emoji').textContent = '🏆';
      $('#kind-ergebnis-titel').textContent = 'Turnier beendet!';
      let meinPlatz = null;
      if (daten && daten.teilnehmer && meinTeilnehmer) {
        const tn = daten.teilnehmer.find((t) => t.id === meinTeilnehmer.id);
        if (tn) meinPlatz = tn.platz;
      }
      $('#kind-ergebnis-nachricht').textContent = meinPlatz ? `Du hast Platz ${meinPlatz} erreicht!` : 'Tolle Leistung!';
      const detailsElem = $('#kind-ergebnis-details');
      if (detailsElem) {
        detailsElem.innerHTML = '<p class="text-gruen fett">Danke fürs Mitmachen!</p>';
      }
    }
  }

  // -------------------------------------------------------------------
  // Kind: Rechnen & Eingabe
  // -------------------------------------------------------------------
  function gegnerBadgeVorbereiten() {
    const badge = $('#turnier-gegner-badge');
    gegnerEmoji = '';
    if (!badge) return;
    badge.textContent = istEntscheidung ? '⚡' : '';
  }

  function challengeAnzeigeVerstecken() {
    const el = $('#challenge-anzeige');
    if (el) {
      el.classList.add('versteckt');
      el.textContent = '';
    }
  }

  function challengeAnzeigeAktualisieren() {
    const el = $('#challenge-anzeige');
    if (!el) return;
    if (!istChallengeModeAktiv() || istEntscheidung || rolle !== 'kind' || !meinTeilnehmer || spielStaende.size < 2) {
      challengeAnzeigeVerstecken();
      return;
    }

    const zeitModus = istZeitModusAktiv();
    if (spielStaende.size === 2) {
      let gegner = null;
      for (const eintrag of spielStaende.values()) {
        if (eintrag.id !== meinTeilnehmer.id) {
          gegner = eintrag;
          break;
        }
      }
      if (!gegner) {
        challengeAnzeigeVerstecken();
        return;
      }
      el.textContent = zeitModus
        ? `⚔️ ${gegner.emoji} ${gegner.name}: ${gegner.richtig} richtig`
        : `⚔️ ${gegner.emoji} ${gegner.name}: ${gegner.richtig} / ${rundeAufgabenAnzahl}${gegner.fertig ? ' ✓' : ''}`;
      el.classList.remove('versteckt');
      return;
    }

    const sortiert = Array.from(spielStaende.values()).sort((a, b) => {
      if (b.richtig !== a.richtig) return b.richtig - a.richtig;
      if (a.falsch !== b.falsch) return a.falsch - b.falsch;
      return (a.zuletzt || 0) - (b.zuletzt || 0);
    });
    const bester = sortiert[0];
    if (!bester || bester.richtig <= 0) {
      el.textContent = '👑 Führend: –';
    } else if (bester.id === meinTeilnehmer.id) {
      el.textContent = `👑 Du führst! (${bester.richtig})`;
    } else {
      el.textContent = `👑 Führend: ${bester.emoji} ${bester.name} (${bester.richtig})`;
    }
    el.classList.remove('versteckt');
  }

  function challengeVorbereiten() {
    spielStaende.clear();
    if (!istChallengeModeAktiv() || istEntscheidung || rolle !== 'kind' || !meinTeilnehmer) {
      challengeAnzeigeVerstecken();
      return;
    }
    const runde = aktuellerZustand && aktuellerZustand.runde;
    const sp = runde && runde.spiele
      && runde.spiele.find((s) => (meinSpielId && s.id === meinSpielId) || (s.teilnehmer && s.teilnehmer.some((t) => t.id === meinTeilnehmer.id)));
    if (sp && Array.isArray(sp.teilnehmer)) {
      sp.teilnehmer.forEach((tn) => {
        const st = (sp.stand && sp.stand[tn.id]) || {};
        spielStaende.set(tn.id, {
          id: tn.id,
          name: tn.name || '-',
          emoji: tn.emoji || '👤',
          richtig: Number(st.richtig) || 0,
          falsch: Number(st.falsch) || 0,
          index: Number(st.index) || 0,
          fertig: Boolean(st.fertigUm),
          zuletzt: Number(st.letzterPunktUm) || 0,
        });
      });
    }
    challengeAnzeigeAktualisieren();
  }

  function rechnenVorbereiten() {
    sperreAufheben();
    antwortWarteschlange = [];
    warteschlangeAktiv = false;
    entscheidungSendet = false;
    aktuelleEingabe = '';
    clearTimeout(blitzTimer);
    const karte = $('#aufgabe-karte');
    if (karte) karte.classList.remove('ok', 'nok');
    const b = $('#blitz');
    if (b) b.className = 'blitz';

    const einstellungen = (aktuellerZustand && aktuellerZustand.einstellungen) || {};
    const zeitModus = istZeitModusAktiv();
    rundeAufgabenAnzahl = Number(einstellungen.anzahl) || meineAufgaben.length || 10;

    const fort = $('#fortschritt');
    if (fort) {
      if (istEntscheidung) {
        fort.innerHTML = '<span class="entscheidung-hinweis">⚡ Entscheidung</span>';
      } else if (!zeitModus && rundeAufgabenAnzahl <= 20) {
        fort.innerHTML = Array.from({ length: rundeAufgabenAnzahl }, () => '<span class="punkt"></span>').join('');
      } else {
        fort.innerHTML = '<div class="balken"><div></div></div>';
      }
    }

    const btnUeberspringen = $('#ueberspringen');
    if (btnUeberspringen) {
      btnUeberspringen.classList.toggle('unsichtbar', istEntscheidung);
      btnUeberspringen.disabled = istEntscheidung;
    }

    gegnerBadgeVorbereiten();
    challengeVorbereiten();
  }

  function rechnenStarten(startUm, dauerMs) {
    countdownStoppen();
    rechnenVorbereiten();
    zeigeScreen('screen-rechnen');
    aufgabeZeigen();
    rundenUhrStarten(startUm, dauerMs);
  }

  function zaehlerAktualisieren() {
    const el = $('#zaehler');
    if (!el || tastaturGesperrt) return;
    if (istEntscheidung) {
      el.textContent = '⚡ Entscheidung – wer zuerst richtig rechnet, gewinnt!';
    } else if (istZeitModusAktiv()) {
      el.textContent = `✅ ${meinRichtig}   ❌ ${meinFalsch}`;
    } else {
      const gesamt = rundeAufgabenAnzahl || meineAufgaben.length;
      el.textContent = `Aufgabe ${Math.min(aufgabenIndex + 1, gesamt)} von ${gesamt}`;
    }
  }

  function aufgabeZeigen() {
    const zeitModus = istZeitModusAktiv();
    if (!istEntscheidung && !zeitModus && aufgabenIndex >= rundeAufgabenAnzahl) {
      zeigeScreen('screen-warten');
      $('#warten-status').textContent = 'Du hast alle Aufgaben gelöst! Warte auf das Rundenende …';
      return;
    }
    if (aufgabenIndex >= meineAufgaben.length) {
      zeigeScreen('screen-warten');
      $('#warten-status').textContent = 'Geschafft! Warte auf das Rundenende …';
      return;
    }

    aktuelleEingabe = '';
    const auf = meineAufgaben[aufgabenIndex];
    if (!auf) return;

    const luecke = `<span class="luecke" id="luecke">${aktuelleEingabe}</span>`;
    const zeichen = Aufgaben.ZEICHEN[auf.op] || auf.op;
    const zahl = (n) => (n === null ? luecke : n);
    const aufgEl = $('#aufgabe');
    if (aufgEl) {
      aufgEl.innerHTML = `${zahl(auf.a)} ${zeichen} ${zahl(auf.b)} = ${zahl(auf.c)}`;
    }

    if (!istEntscheidung && !zeitModus) {
      $$('#fortschritt .punkt').forEach((p, i) => p.classList.toggle('jetzt', i === aufgabenIndex));
      const balken = $('#fortschritt .balken');
      if (balken && balken.firstElementChild && rundeAufgabenAnzahl > 0) {
        balken.firstElementChild.style.width = `${(aufgabenIndex / rundeAufgabenAnzahl) * 100}%`;
      }
    }

    zaehlerAktualisieren();
  }

  function blitz(ok) {
    const b = $('#blitz');
    const k = $('#aufgabe-karte');
    if (b) {
      b.className = `blitz ${ok ? 'ok' : 'nok'}`;
      requestAnimationFrame(() => { b.className = 'blitz'; });
    }
    if (k) {
      k.classList.remove('ok', 'nok');
      k.classList.add(ok ? 'ok' : 'nok');
      clearTimeout(blitzTimer);
      blitzTimer = setTimeout(() => k.classList.remove('ok', 'nok'), 250);
    }
  }

  function zifferTippen(z) {
    if (tastaturGesperrt) return;
    const screen = $('#screen-rechnen');
    if (!screen || !screen.classList.contains('aktiv')) return;
    if (istEntscheidung && entscheidungSendet) return;

    const auf = meineAufgaben[aufgabenIndex];
    if (!auf) return;

    aktuelleEingabe += String(z);
    const l = $('#luecke');
    if (l) l.textContent = aktuelleEingabe;

    if (typeof Ton !== 'undefined') Ton.klick();

    const zielStellen = Math.max(1, Number(auf.stellen) || 1);
    if (aktuelleEingabe.length >= zielStellen) {
      const wert = Number(aktuelleEingabe);
      aktuelleEingabe = '';
      eingabeAbschicken(wert);
    }
  }

  function zifferZurueck() {
    if (tastaturGesperrt) return;
    const screen = $('#screen-rechnen');
    if (!screen || !screen.classList.contains('aktiv')) return;
    if (istEntscheidung && entscheidungSendet) return;
    if (!aktuelleEingabe) return;

    aktuelleEingabe = aktuelleEingabe.slice(0, -1);
    const l = $('#luecke');
    if (l) l.textContent = aktuelleEingabe;
  }

  function aufgabeUeberspringen() {
    if (tastaturGesperrt || istEntscheidung) return;
    const screen = $('#screen-rechnen');
    if (!screen || !screen.classList.contains('aktiv')) return;
    const auf = meineAufgaben[aufgabenIndex];
    if (!auf) return;

    aktuelleEingabe = '';
    if (typeof Ton !== 'undefined') Ton.klick();
    eingabeAbschicken(null);
  }

  function eingabeAbschicken(wert) {
    if (istEntscheidung) {
      entscheidungSendet = true;
      antwortWarteschlange.push({
        spiel: meinSpielId,
        index: aufgabenIndex,
        wert,
        entscheidung: true,
      });
      warteschlangeAbarbeiten();
      return;
    }

    const index = aufgabenIndex;
    aufgabenIndex++;
    antwortWarteschlange.push({
      spiel: meinSpielId,
      index,
      wert,
      entscheidung: false,
    });
    warteschlangeAbarbeiten();

    const zeitModus = istZeitModusAktiv();
    if (!zeitModus && aufgabenIndex >= rundeAufgabenAnzahl) {
      zeigeScreen('screen-warten');
      $('#warten-status').textContent = 'Du hast alle Aufgaben gelöst! Warte auf das Rundenende …';
    } else if (aufgabenIndex >= meineAufgaben.length) {
      zeigeScreen('screen-warten');
      $('#warten-status').textContent = 'Geschafft! Warte auf das Rundenende …';
    } else {
      aufgabeZeigen();
    }
  }

  let sperreTimer = null;
  function sperreAufheben() {
    if (sperreTimer) {
      clearInterval(sperreTimer);
      sperreTimer = null;
    }
    tastaturGesperrt = false;
    const tastatur = $('#tastatur');
    if (tastatur) tastatur.classList.remove('gesperrt');
  }

  function sperreAktivieren(sekunden) {
    sperreAufheben();
    tastaturGesperrt = true;
    const tastatur = $('#tastatur');
    if (tastatur) tastatur.classList.add('gesperrt');
    const el = $('#zaehler');
    let rest = Math.max(1, sekunden);
    if (el) el.textContent = `⏳ Sperre (${rest} s)`;
    sperreTimer = setInterval(() => {
      rest--;
      if (rest > 0) {
        if (el) el.textContent = `⏳ Sperre (${rest} s)`;
      } else {
        sperreAufheben();
        zaehlerAktualisieren();
      }
    }, 1000);
  }

  async function antwortSendenMitRetry(item, versuch = 0) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      return await fetch(`/api/turnier/${turnierCode}/antwort`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${meinTeilnehmer.schluessel}`,
        },
        body: JSON.stringify({
          spiel: item.spiel,
          index: item.index,
          wert: item.wert,
        }),
        signal: controller ? controller.signal : undefined,
      });
    } catch (err) {
      if (versuch < 1 && item.spiel === meinSpielId && (!aktuellerZustand || aktuellerZustand.phase === 'laeuft' || aktuellerZustand.phase === 'entscheidung' || aktuellerZustand.phase === 'countdown')) {
        return antwortSendenMitRetry(item, versuch + 1);
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async function warteschlangeAbarbeiten() {
    if (warteschlangeAktiv) return;
    warteschlangeAktiv = true;

    try {
      while (antwortWarteschlange.length > 0) {
        const item = antwortWarteschlange.shift();
        if (!item || !meinTeilnehmer || !turnierCode) continue;
        if (item.spiel !== meinSpielId) continue;

        try {
          const res = await antwortSendenMitRetry(item);
          if (!res.ok) {
            if (item.entscheidung) {
              entscheidungSendet = false;
              aufgabeZeigen();
            }
            continue;
          }

          const daten = await res.json();
          if (item.spiel !== meinSpielId) continue;

          if (daten.gesperrt) {
            if (typeof Ton !== 'undefined') Ton.falsch();
            blitz(false);
            if (daten.aufgabeNeu) {
              meineAufgaben = [daten.aufgabeNeu];
              aufgabenIndex = 0;
            }
            sperreAktivieren(daten.restSek || 3);
            if (item.entscheidung) {
              entscheidungSendet = false;
              aufgabeZeigen();
            }
            continue;
          }

          if (daten.ignoriert) {
            if (daten.fertig) {
              zeigeScreen('screen-warten');
              $('#warten-status').textContent = 'Du hast alle Aufgaben gelöst! Warte auf das Rundenende …';
            } else if (antwortWarteschlange.length === 0 && typeof daten.aktuellerIndex === 'number') {
              aufgabenIndex = daten.aktuellerIndex;
              if (daten.naechste) meineAufgaben[aufgabenIndex] = daten.naechste;
              if (aufgabenIndex >= meineAufgaben.length) {
                zeigeScreen('screen-warten');
                $('#warten-status').textContent = 'Geschafft! Warte auf das Rundenende …';
              } else if ($('#screen-rechnen').classList.contains('aktiv')) {
                aufgabeZeigen();
              }
            }
            if (item.entscheidung) entscheidungSendet = false;
            continue;
          }

          if (daten.richtig === true) {
            meinRichtig++;
            if (typeof Ton !== 'undefined') Ton.richtig();
            blitz(true);
          } else if (daten.richtig === false) {
            meinFalsch++;
            if (typeof Ton !== 'undefined') Ton.falsch();
            blitz(false);
          }

          if (!item.entscheidung && !istZeitModusAktiv()) {
            const p = $$('#fortschritt .punkt')[item.index];
            if (p) p.classList.add(daten.richtig ? 'richtig' : 'falsch');
          }
          if (istZeitModusAktiv() && $('#screen-rechnen').classList.contains('aktiv')) {
            zaehlerAktualisieren();
          }

          if (daten.naechste && typeof daten.index === 'number') {
            meineAufgaben[daten.index] = daten.naechste;
          }

          if (daten.entscheidungGewonnen || daten.fertig) {
            zeigeScreen('screen-warten');
            $('#warten-status').textContent = daten.entscheidungGewonnen
              ? 'Geschafft! Auswertung läuft …'
              : 'Du hast alle Aufgaben gelöst! Warte auf das Rundenende …';
          }
          if (item.entscheidung) entscheidungSendet = false;
        } catch (err) {
          if (item.entscheidung) {
            entscheidungSendet = false;
            aufgabeZeigen();
          }
        }
      }
    } finally {
      warteschlangeAktiv = false;
      entscheidungSendet = false;
    }
  }

  // -------------------------------------------------------------------
  // API-Helfer
  // -------------------------------------------------------------------
  async function befehlSenden(befehl, daten = {}) {
    if (!turnierCode || !leitungSchluessel) return;
    try {
      const res = await fetch(`/api/turnier/${turnierCode}/befehl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${leitungSchluessel}`,
        },
        body: JSON.stringify({ befehl, ...daten }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.fehler || 'Befehl fehlgeschlagen');
      }
    } catch (e) {
      alert('Netzwerkfehler');
    }
  }

  function rundeStufenName(stufe, nr) {
    switch (stufe) {
      case 'sprint': return 'Sprint';
      case 'finale': return '🏆 Finale';
      case 'halbfinale': return 'Halbfinale';
      case 'viertelfinale': return 'Viertelfinale';
      case 'achtelfinale': return 'Achtelfinale';
      case 'platz3': return 'Spiel um Platz 3';
      case 'gruppe': return `Gruppenphase (Runde ${nr})`;
      case 'liga': return `Liga (Runde ${nr})`;
      default: return `Runde ${nr}`;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // -------------------------------------------------------------------
  // Initialisierung & UI-Events
  // -------------------------------------------------------------------
  function initKatalog() {
    const kasten = $('#uebungen-katalog');
    if (!kasten || typeof Aufgaben === 'undefined') return;
    kasten.innerHTML = '';
    Aufgaben.UEBUNGEN.forEach((u, i) => {
      const chip = document.createElement('div');
      chip.className = `chip ${i === 0 ? 'gewaehlt' : ''}`;
      chip.dataset.id = u.id;
      chip.textContent = `${u.name} (${u.beispiel})`;
      chip.addEventListener('click', () => {
        chip.classList.toggle('gewaehlt');
      });
      kasten.appendChild(chip);
    });
  }

  function initEmojiRaster() {
    const raster = $('#kind-emoji-raster');
    if (!raster) return;
    raster.innerHTML = '';
    EMOJIS.forEach((em, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `emoji-knopf ${idx === 0 ? 'gewaehlt' : ''}`;
      btn.textContent = em;
      btn.dataset.emoji = em;
      btn.addEventListener('click', () => {
        raster.querySelectorAll('.emoji-knopf').forEach((b) => b.classList.remove('gewaehlt'));
        btn.classList.add('gewaehlt');
      });
      raster.appendChild(btn);
    });
  }

  function storageSpeichern(art, daten) {
    try {
      localStorage.setItem(`turnier-${art}`, JSON.stringify(daten));
      sessionStorage.setItem(`turnier-${art}`, JSON.stringify(daten));
    } catch (e) {}
  }

  function storageLaden(art) {
    try {
      const s = sessionStorage.getItem(`turnier-${art}`) || localStorage.getItem(`turnier-${art}`);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }

  function storageLoeschen() {
    try {
      localStorage.removeItem('turnier-teilnehmer');
      sessionStorage.removeItem('turnier-teilnehmer');
    } catch (e) {}
  }

  function leitungStorageLoeschen() {
    try {
      localStorage.removeItem('turnier-leitung');
      sessionStorage.removeItem('turnier-leitung');
    } catch (e) {}
  }

  async function turnierExistenzPruefen(code) {
    if (!code) return 'nicht_gefunden';
    try {
      const res = await fetch(`/api/turnier/${encodeURIComponent(code)}`, { cache: 'no-store' });
      if (res.status === 404) return 'nicht_gefunden';
      return res.ok ? 'ok' : 'netzwerk';
    } catch (e) {
      return 'netzwerk';
    }
  }

  function allesZuruecksetzen(zuBeitritt = false, hinweis = '') {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (rundenLiveTimer) {
      clearInterval(rundenLiveTimer);
      rundenLiveTimer = null;
    }
    countdownStoppen();
    sperreAufheben();
    spielStaende.clear();
    challengeAnzeigeVerstecken();
    antwortWarteschlange = [];
    warteschlangeAktiv = false;
    entscheidungSendet = false;
    istEntscheidung = false;

    const offlineBalken = $('#offline-balken');
    if (offlineBalken) offlineBalken.classList.add('versteckt');

    leitungStorageLoeschen();
    storageLoeschen();

    rolle = 'gast';
    turnierCode = null;
    leitungSchluessel = null;
    meinTeilnehmer = null;
    aktuellerZustand = null;
    meinSpielId = null;
    meineAufgaben = [];
    aufgabenIndex = 0;
    aktuelleEingabe = '';

    if (location.hash) {
      try {
        history.replaceState(null, '', '/turnier');
      } catch (e) {
        location.hash = '';
      }
    }

    const startCode = $('#start-code-eingabe');
    if (startCode) startCode.value = '';
    const startCodeFehler = $('#start-code-fehler');
    if (startCodeFehler) {
      startCodeFehler.textContent = '';
      startCodeFehler.classList.add('versteckt');
    }

    if (zuBeitritt) {
      const codeBox = $('#box-code-eingabe');
      if (codeBox) codeBox.classList.remove('versteckt');
      const codeEingabe = $('#kind-code');
      if (codeEingabe) codeEingabe.value = '';
      const fehlerBox = $('#beitritt-fehler');
      if (fehlerBox) {
        if (hinweis) {
          fehlerBox.textContent = hinweis;
          fehlerBox.classList.remove('versteckt');
        } else {
          fehlerBox.textContent = '';
          fehlerBox.classList.add('versteckt');
        }
      }
      zeigeScreen('screen-beitreten');
    } else {
      zeigeScreen('screen-erstellen');
    }
  }

  async function appStarten() {
    initKatalog();
    initEmojiRaster();

    // Modus-Umschalter für Rundenlänge
    $('#turnier-art').addEventListener('change', (ev) => {
      const zeit = ev.target.value === 'zeit';
      $('#feld-anzahl').classList.toggle('versteckt', zeit);
      $('#feld-zeit').classList.toggle('versteckt', !zeit);
    });

    // Tastatur-Events (Kind) – identisch zu app.js mit Touch/Pointer-Fallback
    const tastaturEl = $('#tastatur');
    function tasteVerarbeiten(btn) {
      if (!btn) return;
      if (btn.id === 'ueberspringen') {
        aufgabeUeberspringen();
      } else if (btn.id === 'zurueck') {
        zifferZurueck();
      } else if (btn.dataset.z !== undefined) {
        zifferTippen(btn.dataset.z);
      }
    }

    if ('PointerEvent' in window) {
      tastaturEl.addEventListener('pointerdown', (ev) => {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        const btn = ev.target.closest('button');
        if (!btn) return;
        ev.preventDefault();
        tasteVerarbeiten(btn);
      });
    } else {
      tastaturEl.addEventListener('touchstart', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn) return;
        ev.preventDefault();
        tasteVerarbeiten(btn);
      }, { passive: false });
      tastaturEl.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        const btn = ev.target.closest('button');
        if (!btn) return;
        ev.preventDefault();
        tasteVerarbeiten(btn);
      });
    }

    // Tastaturbedienung per Fokus + Enter/Leertaste (Barrierefreiheit)
    tastaturEl.addEventListener('click', (ev) => {
      if (ev.detail !== 0) return;
      const btn = ev.target.closest('button');
      if (!btn) return;
      tasteVerarbeiten(btn);
    });

    // Physische Tastatur unterstützen
    document.addEventListener('keydown', (ev) => {
      if (!$('#screen-rechnen').classList.contains('aktiv')) return;
      if (/^[0-9]$/.test(ev.key)) {
        zifferTippen(ev.key);
      } else if (ev.key === 'Backspace') {
        ev.preventDefault();
        zifferZurueck();
      }
    });

    // Knöpfe der Lehrkraft
    $('#btn-turnier-anlegen').addEventListener('click', async () => {
      const uebungen = $$('#uebungen-katalog .chip.gewaehlt').map((c) => c.dataset.id);
      if (!uebungen.length) {
        alert('Bitte mindestens eine Übung auswählen.');
        return;
      }
      const titel = $('#turnier-titel').value.trim();
      const einsetzen = $('#turnier-einsetzen').checked;
      const challengeMode = Boolean($('#turnier-challenge') && $('#turnier-challenge').checked);
      const art = $('#turnier-art').value;
      const anzahl = Number($('#turnier-anzahl').value);
      const sekunden = Number($('#turnier-sekunden').value);
      const format = $('#turnier-format').value;

      try {
        const res = await fetch('/api/turnier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titel,
            einstellungen: { uebungen, einsetzen, challengeMode, art, anzahl, sekunden, format },
          }),
        });
        if (!res.ok) throw new Error('Fehler beim Anlegen');
        const daten = await res.json();
        turnierCode = daten.code;
        leitungSchluessel = daten.leitung;
        rolle = 'leitung';
        storageSpeichern('leitung', { code: turnierCode, leitung: leitungSchluessel });
        sseVerbinden(turnierCode, leitungSchluessel);
      } catch (err) {
        alert(err.message);
      }
    });

    $('#btn-beitritt-toggle').addEventListener('click', () => {
      if (!aktuellerZustand) return;
      befehlSenden('beitritt', { offen: !aktuellerZustand.offen });
    });

    $('#btn-turnier-starten').addEventListener('click', () => befehlSenden('starten'));
    $('#btn-neu-mischen').addEventListener('click', () => befehlSenden('neu_mischen'));
    $('#btn-runde-starten').addEventListener('click', () => befehlSenden('runde_starten'));
    $('#btn-runde-beenden').addEventListener('click', () => befehlSenden('beenden'));
    $('#btn-runde-abbrechen').addEventListener('click', () => befehlSenden('abbrechen'));
    $('#btn-naechste-runde').addEventListener('click', () => befehlSenden('naechste'));
    $('#btn-neues-turnier-gleiche').addEventListener('click', () => befehlSenden('neues_turnier'));

    const ladenResetBtn = $('#btn-laden-reset');
    if (ladenResetBtn) {
      ladenResetBtn.addEventListener('click', () => allesZuruecksetzen(false));
    }

    function leitungTurnierZuruecksetzen() {
      if (confirm('Turnier wirklich beenden und ein neues anlegen?')) {
        allesZuruecksetzen(false);
      }
    }
    $$('.btn-turnier-reset').forEach((btn) => btn.addEventListener('click', leitungTurnierZuruecksetzen));
    $('#btn-turnier-beenden').addEventListener('click', leitungTurnierZuruecksetzen);

    $$('.btn-kind-verlassen').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Turnier wirklich verlassen?')) return;
        if (turnierCode && meinTeilnehmer && meinTeilnehmer.schluessel) {
          try {
            await fetch(`/api/turnier/${encodeURIComponent(turnierCode)}/verlassen`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${meinTeilnehmer.schluessel}` },
            });
          } catch (e) {}
        }
        allesZuruecksetzen(true);
      });
    });

    $('#btn-drucken').addEventListener('click', () => window.print());

    $('#btn-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Kind: Beitreten
    $('#btn-kind-beitreten').addEventListener('click', async () => {
      const codeInput = $('#kind-code').value.trim().toUpperCase() || turnierCode;
      const name = $('#kind-name').value.trim();
      const gewaehltesEmoji = $('#kind-emoji-raster .emoji-knopf.gewaehlt');
      const emoji = gewaehltesEmoji ? gewaehltesEmoji.dataset.emoji : '🦊';
      const fehlerBox = $('#beitritt-fehler');

      if (!codeInput || codeInput.length !== 4) {
        fehlerBox.textContent = 'Bitte einen gültigen 4-stelligen Code eingeben.';
        fehlerBox.classList.remove('versteckt');
        return;
      }
      if (!name || name.length < 2) {
        fehlerBox.textContent = 'Bitte einen Namen mit mindestens 2 Buchstaben eingeben.';
        fehlerBox.classList.remove('versteckt');
        return;
      }

      fehlerBox.classList.add('versteckt');

      try {
        const res = await fetch(`/api/turnier/${codeInput}/beitreten`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, emoji }),
        });
        const daten = await res.json();
        if (!res.ok) {
          fehlerBox.textContent = daten.fehler || 'Beitritt fehlgeschlagen';
          fehlerBox.classList.remove('versteckt');
          return;
        }

        turnierCode = codeInput;
        meinTeilnehmer = { id: daten.id, schluessel: daten.schluessel, name, emoji };
        rolle = 'kind';
        storageSpeichern('teilnehmer', { code: turnierCode, ...meinTeilnehmer });
        location.hash = `#${turnierCode}`;
        sseVerbinden(turnierCode, daten.schluessel);
      } catch (e) {
        fehlerBox.textContent = 'Verbindungsfehler';
        fehlerBox.classList.remove('versteckt');
      }
    });

    $('#btn-kind-weiter').addEventListener('click', () => {
      zeigeScreen('screen-warten');
    });

    async function mitCodeWeiter() {
      const codeInput = $('#start-code-eingabe');
      const fehlerBox = $('#start-code-fehler');
      const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      if (code.length !== 4) {
        if (fehlerBox) {
          fehlerBox.textContent = 'Bitte einen 4-stelligen Turnier-Code eingeben.';
          fehlerBox.classList.remove('versteckt');
        }
        return;
      }
      const status = await turnierExistenzPruefen(code);
      if (status === 'nicht_gefunden') {
        if (fehlerBox) {
          fehlerBox.textContent = 'Turnier mit diesem Code nicht gefunden.';
          fehlerBox.classList.remove('versteckt');
        }
        return;
      }
      if (fehlerBox) {
        fehlerBox.textContent = '';
        fehlerBox.classList.add('versteckt');
      }
      turnierCode = code;
      if ($('#kind-code')) $('#kind-code').value = code;
      if ($('#box-code-eingabe')) $('#box-code-eingabe').classList.remove('versteckt');
      const beitrittFehler = $('#beitritt-fehler');
      if (beitrittFehler) {
        beitrittFehler.textContent = '';
        beitrittFehler.classList.add('versteckt');
      }
      try {
        history.replaceState(null, '', `/turnier#${code}`);
      } catch (e) {
        location.hash = `#${code}`;
      }
      zeigeScreen('screen-beitreten');
      if ($('#kind-name')) $('#kind-name').focus();
    }

    const btnMitCodeWeiter = $('#btn-mit-code-weiter');
    if (btnMitCodeWeiter) btnMitCodeWeiter.addEventListener('click', mitCodeWeiter);
    const startCodeEingabe = $('#start-code-eingabe');
    if (startCodeEingabe) {
      startCodeEingabe.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') mitCodeWeiter();
      });
    }
    const btnBeitrittZurueck = $('#btn-beitritt-zurueck');
    if (btnBeitrittZurueck) {
      btnBeitrittZurueck.addEventListener('click', () => allesZuruecksetzen(false));
    }

    // -----------------------------------------------------------------
    // Routing beim Laden
    // -----------------------------------------------------------------
    const hash = location.hash.replace(/^#/, '').trim().toUpperCase();
    const istZuschauer = location.search.includes('zuschauen');

    if (hash && hash.length === 4) {
      // Kind- oder Zuschauer-Modus mit Code
      turnierCode = hash;
      const gespeichertesKind = storageLaden('teilnehmer');
      if (gespeichertesKind && gespeichertesKind.code === turnierCode) {
        const status = await turnierExistenzPruefen(turnierCode);
        if (status === 'nicht_gefunden') {
          allesZuruecksetzen(true, 'Dieses Turnier existiert nicht mehr – gib einen neuen Code ein.');
        } else {
          meinTeilnehmer = gespeichertesKind;
          rolle = 'kind';
          sseVerbinden(turnierCode, meinTeilnehmer.schluessel);
        }
      } else if (istZuschauer) {
        const status = await turnierExistenzPruefen(turnierCode);
        if (status === 'nicht_gefunden') {
          allesZuruecksetzen(true, 'Dieses Turnier existiert nicht mehr.');
        } else {
          rolle = 'zuschauer';
          sseVerbinden(turnierCode, null);
        }
      } else {
        // Neu beitreten
        const status = await turnierExistenzPruefen(turnierCode);
        if (status === 'nicht_gefunden') {
          $('#kind-code').value = '';
          $('#box-code-eingabe').classList.remove('versteckt');
          const fehlerBox = $('#beitritt-fehler');
          if (fehlerBox) {
            fehlerBox.textContent = 'Dieses Turnier existiert nicht mehr – gib einen neuen Code ein.';
            fehlerBox.classList.remove('versteckt');
          }
          zeigeScreen('screen-beitreten');
        } else {
          $('#kind-code').value = turnierCode;
          $('#box-code-eingabe').classList.add('versteckt');
          zeigeScreen('screen-beitreten');
        }
      }
    } else {
      // Kein Hash: Prüfen, ob wir eine aktive Leitungssitzung haben
      const gespeicherteLeitung = storageLaden('leitung');
      if (gespeicherteLeitung && gespeicherteLeitung.code && gespeicherteLeitung.leitung) {
        const status = await turnierExistenzPruefen(gespeicherteLeitung.code);
        if (status === 'nicht_gefunden') {
          allesZuruecksetzen(false);
        } else {
          turnierCode = gespeicherteLeitung.code;
          leitungSchluessel = gespeicherteLeitung.leitung;
          rolle = 'leitung';
          sseVerbinden(turnierCode, leitungSchluessel);
        }
      } else {
        zeigeScreen('screen-erstellen');
      }
    }
  }

  window.addEventListener('DOMContentLoaded', appStarten);
})();
