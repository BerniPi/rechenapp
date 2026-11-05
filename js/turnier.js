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
  let sendetGerade = false;
  let rundenLiveTimer = null;

  function rundenUhrStarten(endeUm) {
    if (rundenLiveTimer) clearInterval(rundenLiveTimer);
    function tick() {
      const restMs = endeUm - (Date.now() + uhrOffsetMs);
      const restSek = Math.max(0, Math.ceil(restMs / 1000));
      const min = Math.floor(restSek / 60);
      const sek = restSek % 60;
      const str = `${String(min).padStart(2, '0')}:${String(sek).padStart(2, '0')}`;
      const beamerUhr = $('#live-uhr');
      if (beamerUhr) beamerUhr.textContent = str;
      const handyUhr = $('#leiste-uhr');
      if (handyUhr) handyUhr.textContent = `⏱️ ${restSek} s`;
      if (restMs <= 0) {
        clearInterval(rundenLiveTimer);
        rundenLiveTimer = null;
      }
    }
    tick();
    rundenLiveTimer = setInterval(tick, 500);
  }

  // Bildschirmwechsel
  function zeigeScreen(id) {
    $$('.screen').forEach((s) => s.classList.remove('aktiv'));
    const ziel = $(`#${id}`);
    if (ziel) ziel.classList.add('aktiv');
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

    eventSource.addEventListener('error', () => {
      $('#offline-balken').classList.remove('versteckt');
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
      if (aktuellerZustand) {
        aktuellerZustand.phase = 'vorschau';
        aktuellerZustand.runde = daten.runde;
        aktuellerZustand.baum = daten.baum;
      }
      vorschauRendern(daten.runde);
    });

    eventSource.addEventListener('countdown', (ev) => {
      const daten = JSON.parse(ev.data);
      if (aktuellerZustand) {
        aktuellerZustand.phase = 'countdown';
        aktuellerZustand.countdownBis = daten.startUm;
      }
      if (rolle === 'leitung' || rolle === 'zuschauer') {
        zeigeScreen('screen-live');
        if (aktuellerZustand && aktuellerZustand.runde) {
          liveRendern(aktuellerZustand.runde);
        }
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
      case 'auswertung': {
        zeigeScreen('screen-ergebnis');
        ergebnisRendern(z.runde);
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
        $('#warten-zaehler').textContent = `${(z.teilnehmer || []).length} Kinder sind dabei`;
        break;
      }
      case 'vorschau': {
        zeigeScreen('screen-warten');
        $('#warten-status').textContent = 'Runde wird vorbereitet …';
        kindGegnerInfoRendern(z.runde);
        break;
      }
      case 'countdown': {
        if (z.countdownBis) countdownStarten(z.countdownBis);
        break;
      }
      case 'laeuft': {
        if (z.runde && ich && ich.aktiv) {
          if (ich.fertig) {
            zeigeScreen('screen-warten');
            $('#warten-status').textContent = 'Du hast alle Aufgaben gelöst! Warte auf das Rundenende …';
            return;
          }
          const sp = z.runde.spiele && z.runde.spiele.find((s) => s.teilnehmer.some((t) => t.id === ich.id));
          if (sp && sp.meineAufgaben) {
            meineAufgaben = sp.meineAufgaben;
            meinSpielId = sp.id;
          }
          aufgabenIndex = typeof ich.index === 'number' ? ich.index : 0;
          zeigeScreen('screen-rechnen');
          aufgabeZeigen();
          if (z.runde.start && z.runde.dauerMs) {
            rundenUhrStarten(z.runde.start + z.runde.dauerMs);
          }
        } else {
          zeigeScreen('screen-warten');
          $('#warten-status').textContent = 'Du schaust in dieser Runde zu.';
        }
        break;
      }
      case 'auswertung': {
        zeigeScreen('screen-kind-ergebnis');
        if (ich && ich.aktiv) {
          $('#kind-ergebnis-emoji').textContent = '🎉';
          $('#kind-ergebnis-titel').textContent = 'Runde beendet!';
          $('#kind-ergebnis-nachricht').textContent = 'Super gerechnet!';
        } else {
          $('#kind-ergebnis-emoji').textContent = '👏';
          $('#kind-ergebnis-titel').textContent = 'Gekämpft!';
          $('#kind-ergebnis-nachricht').textContent = ich && ich.platz ? `Dein Platz: ${ich.platz}` : 'Runde vorbei';
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
  function teilnehmerRendern(teilnehmer) {
    const raster = $('#lobby-teilnehmer-raster');
    const zaehler = $('#lobby-zaehler');
    if (zaehler) zaehler.textContent = `${teilnehmer.length} ${teilnehmer.length === 1 ? 'Kind' : 'Kinder'} da`;
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
  function countdownStarten(startUm, dauerMs) {
    const overlay = $('#countdown-overlay');
    const zahl = $('#countdown-zahl');
    if (countdownTimer) clearInterval(countdownTimer);

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
        setTimeout(() => {
          if (overlay) overlay.classList.add('versteckt');
          if (rolle === 'kind' && meineAufgaben.length > 0) {
            zeigeScreen('screen-rechnen');
            aufgabeZeigen();
          }
          const effektiveDauerMs = dauerMs || (aktuellerZustand && aktuellerZustand.runde && aktuellerZustand.runde.dauerMs);
          if (effektiveDauerMs) {
            rundenUhrStarten(startUm + effektiveDauerMs);
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

    // Auch Mini-Leiste am Handy aktualisieren
    if (rolle === 'kind' && meinTeilnehmer) {
      if (id !== meinTeilnehmer.id) {
        $('#leiste-gegner').textContent = `Gegner: ${richtig}`;
        $('#balken-gegner').style.width = `${pRichtig}%`;
      } else {
        $('#leiste-ich').textContent = `Du: ${richtig}`;
        $('#balken-ich').style.width = `${pRichtig}%`;
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
      karte.innerHTML = html;
      raster.appendChild(karte);
    });
  }

  // -------------------------------------------------------------------
  // Siegerehrung & Podest
  // -------------------------------------------------------------------
  function siegerehrungRendern(teilnehmer) {
    if (typeof Ton !== 'undefined') Ton.jubel();
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
    if (rundenLiveTimer) { clearInterval(rundenLiveTimer); rundenLiveTimer = null; }
    if (aktuellerZustand) {
      aktuellerZustand.phase = 'auswertung';
      if (daten && daten.runde) aktuellerZustand.runde = daten.runde;
      if (daten && daten.teilnehmer) aktuellerZustand.teilnehmer = daten.teilnehmer;
    }

    if (rolle === 'leitung' || rolle === 'zuschauer') {
      zeigeScreen('screen-ergebnis');
      ergebnisRendern((daten && daten.runde) || (aktuellerZustand && aktuellerZustand.runde));
    } else if (rolle === 'kind') {
      zeigeScreen('screen-kind-ergebnis');
      const ich = daten && daten.ich;
      const format = (aktuellerZustand && aktuellerZustand.einstellungen && aktuellerZustand.einstellungen.format) || 'ko';
      const detailsElem = $('#kind-ergebnis-details');

      if (ich) {
        if (ich.weiter) {
          $('#kind-ergebnis-emoji').textContent = '🎉';
          $('#kind-ergebnis-titel').textContent = 'Runde beendet!';
          $('#kind-ergebnis-nachricht').textContent = (format === 'ko' || format === 'gruppen_ko')
            ? 'Gewonnen! Du bist eine Runde weiter!'
            : `Runde abgeschlossen! Platz ${ich.platz || '-'}`;
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
    if (rundenLiveTimer) { clearInterval(rundenLiveTimer); rundenLiveTimer = null; }
    if (aktuellerZustand) {
      aktuellerZustand.phase = 'ende';
      if (daten && daten.teilnehmer) aktuellerZustand.teilnehmer = daten.teilnehmer;
    }

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
  function aufgabeZeigen() {
    if (aufgabenIndex >= meineAufgaben.length) {
      zeigeScreen('screen-warten');
      $('#warten-status').textContent = 'Du hast alle Aufgaben gelöst! Warte auf das Rundenende …';
      return;
    }

    aktuelleEingabe = '';
    const auf = meineAufgaben[aufgabenIndex];
    if (!auf) return;

    $('#teil-a').textContent = auf.a === null ? '__' : auf.a;
    $('#teil-op').textContent = Aufgaben.ZEICHEN[auf.op] || auf.op;
    $('#teil-b').textContent = auf.b === null ? '__' : auf.b;
    $('#teil-c').textContent = auf.c === null ? '?' : auf.c;

    // Lücke hervorheben
    ['a', 'b', 'c'].forEach((x) => {
      const el = $(`#teil-${x}`);
      if (el) el.classList.toggle('luecke', auf.luecke === x);
    });

    const lueckeElem = $(`#teil-${auf.luecke}`);
    if (lueckeElem) lueckeElem.textContent = '?';

    $('#leiste-ich').textContent = `Du: ${aufgabenIndex}/${meineAufgaben.length}`;
  }

  async function zifferTippen(z) {
    if (sendetGerade) return;
    const auf = meineAufgaben[aufgabenIndex];
    if (!auf) return;

    aktuelleEingabe += z;
    const lueckeElem = $(`#teil-${auf.luecke}`);
    if (lueckeElem) lueckeElem.textContent = aktuelleEingabe;

    if (typeof Ton !== 'undefined') Ton.klick();

    // Erst absenden, wenn alle Stellen eingegeben sind
    if (aktuelleEingabe.length >= auf.stellen) {
      const wert = aktuelleEingabe;
      aktuelleEingabe = '';
      sendetGerade = true;
      await antwortAbsenden(wert);
    }
  }

  function zifferZurueck() {
    if (sendetGerade) return;
    const auf = meineAufgaben[aufgabenIndex];
    if (!auf || !aktuelleEingabe) return;
    aktuelleEingabe = aktuelleEingabe.slice(0, -1);
    const lueckeElem = $(`#teil-${auf.luecke}`);
    if (lueckeElem) lueckeElem.textContent = aktuelleEingabe || '?';
  }

  async function antwortAbsenden(wert) {
    const index = aufgabenIndex;
    const karte = $('#aufgabe-karte');

    try {
      const res = await fetch(`/api/turnier/${turnierCode}/antwort`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${meinTeilnehmer.schluessel}`,
        },
        body: JSON.stringify({
          spiel: meinSpielId,
          index,
          wert: Number(wert),
        }),
      });

      if (!res.ok) {
        sendetGerade = false;
        return;
      }
      const daten = await res.json();

      if (daten.ignoriert) {
        if (typeof daten.aktuellerIndex === 'number') {
          aufgabenIndex = daten.aktuellerIndex;
          if (daten.naechste) {
            meineAufgaben[aufgabenIndex] = daten.naechste;
          }
          if (daten.fertig || aufgabenIndex >= meineAufgaben.length) {
            zeigeScreen('screen-warten');
            $('#warten-status').textContent = 'Geschafft! Warte auf das Rundenende …';
          } else {
            aufgabeZeigen();
          }
        }
        sendetGerade = false;
        return;
      }

      if (daten.richtig) {
        if (typeof Ton !== 'undefined') Ton.richtig();
        karte.classList.add('ok');
      } else {
        if (typeof Ton !== 'undefined') Ton.falsch();
        karte.classList.add('nok');
      }

      setTimeout(() => {
        karte.classList.remove('ok', 'nok');
        aufgabenIndex++;
        if (daten.naechste) {
          meineAufgaben[aufgabenIndex] = daten.naechste;
        }
        if (daten.fertig || aufgabenIndex >= meineAufgaben.length) {
          zeigeScreen('screen-warten');
          $('#warten-status').textContent = 'Geschafft! Warte auf das Rundenende …';
        } else {
          aufgabeZeigen();
        }
        sendetGerade = false;
      }, 150);
    } catch (e) {
      sendetGerade = false;
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

  async function appStarten() {
    initKatalog();
    initEmojiRaster();

    // Modus-Umschalter für Rundenlänge
    $('#turnier-art').addEventListener('change', (ev) => {
      const zeit = ev.target.value === 'zeit';
      $('#feld-anzahl').classList.toggle('versteckt', zeit);
      $('#feld-zeit').classList.toggle('versteckt', !zeit);
    });

    // Tastatur-Events (Kind)
    $('#tastatur').addEventListener('pointerdown', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      ev.preventDefault();
      const z = btn.dataset.z;
      if (z !== undefined) {
        zifferTippen(z);
      } else if (btn.id === 'btn-zurueck') {
        zifferZurueck();
      } else if (btn.id === 'btn-ok') {
        if (aktuelleEingabe) {
          const w = aktuelleEingabe;
          aktuelleEingabe = '';
          antwortAbsenden(w);
        }
      }
    });

    // Physische Tastatur unterstützen
    window.addEventListener('keydown', (ev) => {
      if (!$('#screen-rechnen').classList.contains('aktiv')) return;
      if (ev.key >= '0' && ev.key <= '9') {
        zifferTippen(ev.key);
      } else if (ev.key === 'Backspace') {
        zifferZurueck();
      } else if (ev.key === 'Enter') {
        if (aktuelleEingabe) {
          const w = aktuelleEingabe;
          aktuelleEingabe = '';
          antwortAbsenden(w);
        }
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
            einstellungen: { uebungen, einsetzen, art, anzahl, sekunden, format },
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
    $('#btn-turnier-beenden').addEventListener('click', () => {
      if (confirm('Turnier wirklich beenden?')) {
        localStorage.removeItem('turnier-leitung');
        sessionStorage.removeItem('turnier-leitung');
        location.href = '/turnier';
      }
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
        meinTeilnehmer = gespeichertesKind;
        rolle = 'kind';
        sseVerbinden(turnierCode, meinTeilnehmer.schluessel);
      } else if (istZuschauer) {
        rolle = 'zuschauer';
        sseVerbinden(turnierCode, null);
      } else {
        // Neu beitreten
        $('#kind-code').value = turnierCode;
        $('#box-code-eingabe').classList.add('versteckt');
        zeigeScreen('screen-beitreten');
      }
    } else {
      // Kein Hash: Prüfen, ob wir eine aktive Leitungssitzung haben
      const gespeicherteLeitung = storageLaden('leitung');
      if (gespeicherteLeitung && gespeicherteLeitung.code && gespeicherteLeitung.leitung) {
        turnierCode = gespeicherteLeitung.code;
        leitungSchluessel = gespeicherteLeitung.leitung;
        rolle = 'leitung';
        sseVerbinden(turnierCode, leitungSchluessel);
      } else {
        zeigeScreen('screen-erstellen');
      }
    }
  }

  window.addEventListener('DOMContentLoaded', appStarten);
})();
