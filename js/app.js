// Hauptlogik: Bildschirme, Einstellungen, Rechenrunden, Sterne, Spiele-Menü, Eltern-Bereich.
(() => {
  let d = null; // Daten des aktiven Spielers
  let e = null; // seine Eltern-Einstellungen
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ---------- Allgemein ----------
  function zeige(id) {
    $$('.screen').forEach((s) => s.classList.toggle('aktiv', s.id === id));
    window.scrollTo(0, 0);
  }
  function sterneAnzeigen() { $$('.sterne-zahl').forEach((el) => { el.textContent = d.sterne; }); }
  function fmt(sek) {
    sek = Math.max(0, Math.floor(sek));
    return `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`;
  }
  const OP_NAME = { '+': '+', '-': '−', '*': '·', '/': ':' };
  const ART_NAME = { zehn: '10 Aufgaben', m1: '1 Minute', m5: '5 Minuten' }; // alte Verlaufseinträge
  const GRENZEN = { aufgaben: { min: 5, max: 50, schritt: 5 }, zeit: { min: 1, max: 10, schritt: 1 } };
  const istAufgaben = (s) => s.art === 'aufgaben';
  function laengeText(s) {
    return istAufgaben(s) ? `${s.anzahl} Aufgaben` : `${s.minuten} ${s.minuten === 1 ? 'Minute' : 'Minuten'}`;
  }
  // Rekorde gibt es nur bei festen Längen: 10/20 Aufgaben, 1/5 Minuten.
  function rekordArt(s) {
    if (istAufgaben(s)) return s.anzahl === 10 ? 'zehn' : s.anzahl === 20 ? 'a20' : null;
    return s.minuten === 1 ? 'm1' : s.minuten === 5 ? 'm5' : null;
  }

  let wakeLock = null;
  async function wachHalten(an) {
    try {
      if (an && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
      if (!an && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (err) { wakeLock = null; }
  }

  // ---------- Startbildschirm ----------
  function chipsAnzeigen() {
    const s = d.settings;
    $$('.chips').forEach((ch) => {
      const feld = ch.dataset.feld;
      ch.querySelectorAll('button').forEach((b) => {
        const v = b.dataset.wert;
        const an = feld === 'ops' ? s.ops.includes(v) : String(s[feld]) === v;
        b.classList.toggle('an', an);
      });
    });
    laengeAnzeigen();
    rekordInfo();
    sprachHinweis();
  }

  function laengeAnzeigen() {
    const s = d.settings;
    const g = GRENZEN[s.art];
    const wert = istAufgaben(s) ? s.anzahl : s.minuten;
    $('#laenge').innerHTML = `${laengeText(s)}<small>${rekordArt(s) ? '🏆 mit Rekord' : 'Rekord nur bei ' + (istAufgaben(s) ? '10 und 20' : '1 und 5')}</small>`;
    $('#weniger').disabled = wert <= g.min;
    $('#mehr').disabled = wert >= g.max;
  }

  function laengeAendern(richtung) {
    const s = d.settings;
    const g = GRENZEN[s.art];
    const feld = istAufgaben(s) ? 'anzahl' : 'minuten';
    // auf das Raster einrasten, z. B. 5, 10, 15 …
    const neu = Math.round((s[feld] + richtung * g.schritt) / g.schritt) * g.schritt;
    s[feld] = Math.min(g.max, Math.max(g.min, neu));
    Ton.klick();
    Speicher.speichern();
    chipsAnzeigen();
  }
  $('#weniger').addEventListener('click', () => laengeAendern(-1));
  $('#mehr').addEventListener('click', () => laengeAendern(1));

  async function sprachHinweis() {
    const el = $('#sprach-hinweis');
    el.textContent = '';
    if (d.settings.modus !== 'sprache') return;
    if (!Sprache.kannHoeren) {
      el.textContent = '⚠️ Dieser Browser kann keine Sprache erkennen – bitte Chrome verwenden.';
      return;
    }
    const st = await Sprache.stimmenBereit();
    if (d.settings.modus === 'sprache' && !st && !Sprache.jonasMoeglich) {
      el.textContent = '⚠️ Keine deutsche Vorlese-Stimme gefunden. Android: Einstellungen → Sprachausgabe → Deutsch installieren.';
    }
  }

  $$('.chips').forEach((ch) => {
    ch.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      Ton.klick();
      const feld = ch.dataset.feld;
      let v = b.dataset.wert;
      if (feld === 'ops') {
        const ops = d.settings.ops;
        if (ops.includes(v)) { if (ops.length > 1) ops.splice(ops.indexOf(v), 1); } else ops.push(v);
      } else {
        if ('zahl' in ch.dataset) v = Number(v);
        if ('bool' in ch.dataset) v = v === 'true';
        d.settings[feld] = v;
      }
      Speicher.speichern();
      chipsAnzeigen();
    });
  });

  function schluessel(s, art) {
    const ein = s.einsetzen ? 'E' : '';
    return `${s.modus}|${art}|${[...s.ops].sort().join('')}|${s.raum}|${ein}`;
  }
  // null = für diese Länge gibt es keinen Rekord
  function rekordSchluessel(s) {
    const art = rekordArt(s);
    return art ? schluessel(s, art) : null;
  }
  // Der persönliche Schnitt ist ein Tempo und gilt für jede Länge.
  function tempoSchluessel(s) { return schluessel(s, istAufgaben(s) ? 'zehn' : 'm1'); }
  function rekordWert(wert, s) { return istAufgaben(s) ? fmt(wert) : `${wert} Punkte`; }
  function rekordText(r, s) {
    if (!r) return '';
    return istAufgaben(s) ? `🏆 Bestzeit: ${fmt(r.wert)}` : `🏆 Rekord: ${r.wert} Punkte`;
  }
  // Beste zuerst: bei Aufgaben die kleinste Zeit, bei Zeit die meisten Punkte.
  function bestenliste(s) {
    const key = rekordSchluessel(s);
    if (!key) return [];
    return Speicher.bestenliste(key).sort((a, b) => (istAufgaben(s) ? a.wert - b.wert : b.wert - a.wert) || a.datum - b.datum);
  }
  function rekordInfo() {
    const s = d.settings;
    const key = rekordSchluessel(s);
    let text = key ? rekordText(d.rekorde[key], s) : '';
    const erster = bestenliste(s)[0];
    if (erster && erster.benutzer.id !== Speicher.benutzer.aktiv && Speicher.benutzer.liste.length > 1) {
      text += `${text ? '  ·  ' : ''}👑 ${erster.benutzer.name}: ${rekordWert(erster.wert, s)}`;
    }
    $('#rekord-info').textContent = text;
  }

  // Eltern-Knopf: lange drücken
  (() => {
    const k = $('#eltern-knopf');
    let t = null;
    const weg = () => { clearTimeout(t); t = null; };
    k.addEventListener('pointerdown', () => { t = setTimeout(() => { t = null; elternOeffnen(); }, 1500); });
    k.addEventListener('pointerup', () => { if (t) { weg(); $('#rekord-info').textContent = 'Eltern-Bereich: Knopf lange drücken'; setTimeout(rekordInfo, 2000); } });
    k.addEventListener('pointerleave', weg);
    k.addEventListener('contextmenu', (ev) => ev.preventDefault());
  })();

  $('#los').addEventListener('click', rundeStarten);
  $('#zu-spielen').addEventListener('click', spieleOeffnen);
  $('#konto-start').addEventListener('click', spieleOeffnen);
  $$('.zurueck-start').forEach((b) => b.addEventListener('click', () => { chipsAnzeigen(); zeige('start'); }));

  // ---------- Rechenrunde ----------
  let R = null;

  let laedt = false;

  async function rundeStarten() {
    if (laedt) return;
    Ton.init();
    const s = { ...d.settings, ops: [...d.settings.ops] };
    if (s.modus === 'sprache') {
      if (!Sprache.kannHoeren) {
        alert('Dieser Browser kann leider keine Sprache erkennen. Bitte Chrome verwenden – jetzt geht es mit Tippen weiter.');
        s.modus = 'schrift';
      }
    }
    // Sprechen: erst Sprachmodell laden und Mikrofon öffnen, dann startet die Uhr.
    let sprachFehler = null;
    if (s.modus === 'sprache') {
      R = null;
      laedt = true;
      $('#fortschritt').innerHTML = '';
      $('#uhr').textContent = '0:00';
      $('#aufgabe').textContent = '⏳';
      $('#zaehler').textContent = '';
      $('#tastatur').classList.add('versteckt');
      $('#sprach-knoepfe').classList.add('versteckt');
      $('#sprach-bereich').classList.remove('versteckt');
      mikroStatus('aus');
      $('#gehoert').textContent = 'Mikrofon wird vorbereitet …';
      zeige('runde');
      try {
        await Sprache.vorbereiten((p) => {
          $('#gehoert').textContent = p === 'entpacken'
            ? 'Sprachmodell wird vorbereitet …'
            : `Sprachmodell wird geladen … ${p} % (nur beim ersten Mal)`;
        });
      } catch (err) {
        sprachFehler = (err && err.name === 'NotAllowedError')
          ? 'Das Mikrofon ist nicht erlaubt.'
          : (err && err.message) || 'Spracherkennung geht nicht.';
      }
      const abgebrochen = !laedt;
      laedt = false;
      if (abgebrochen) { Sprache.ruhe(); return; }
    }

    R = {
      s,
      gen: Aufgaben.erzeuger(s),
      nr: 0,
      liste: [],
      richtig: 0,
      falsch: 0,
      eingabe: '',
      aktiv: true,
      zeit: 0,          // gemessene Zeit in ms (Aufgaben-Modus)
      laufSeit: null,
      start: performance.now(),
      dauer: istAufgaben(s) ? 0 : s.minuten * 60,
      punkte: istAufgaben(s) && s.anzahl <= 20, // Fortschritt als Punkte, sonst als Balken
      zuhoerer: null,
      tastatur: s.modus === 'schrift' || !!sprachFehler,
      hinweis: sprachFehler ? `${sprachFehler} Tippe die Antwort.` : '',
    };

    const sprache = s.modus === 'sprache';
    $('#tastatur').classList.toggle('versteckt', !R.tastatur);
    $('#sprach-bereich').classList.toggle('versteckt', !sprache);
    $('#sprach-knoepfe').classList.toggle('versteckt', !sprache || R.tastatur);

    const fort = $('#fortschritt');
    fort.innerHTML = R.punkte
      ? Array.from({ length: s.anzahl }, () => '<span class="punkt"></span>').join('')
      : '<div class="balken"><div></div></div>';

    zeige('runde');
    wachHalten(true);
    if (!sprache) uhrLaeuft(true);
    naechste();
    R.tick = setInterval(tick, 200);
    tick();
  }

  function uhrLaeuft(an) {
    if (!R) return;
    const jetzt = performance.now();
    if (an && R.laufSeit === null) R.laufSeit = jetzt;
    if (!an && R.laufSeit !== null) { R.zeit += jetzt - R.laufSeit; R.laufSeit = null; }
  }
  function gemessen() { return R.zeit + (R.laufSeit !== null ? performance.now() - R.laufSeit : 0); }

  function tick() {
    if (!R || !R.aktiv) return;
    if (istAufgaben(R.s)) {
      $('#uhr').textContent = fmt(gemessen() / 1000);
    } else {
      const rest = R.dauer - (performance.now() - R.start) / 1000;
      $('#uhr').textContent = fmt(Math.ceil(rest));
      const balken = $('#fortschritt .balken');
      balken.firstElementChild.style.width = `${Math.max(0, rest / R.dauer) * 100}%`;
      balken.classList.toggle('knapp', rest <= 10);
      if (rest <= 0) rundeEnde();
    }
  }

  function naechste() {
    if (!R || !R.aktiv) return;
    if (istAufgaben(R.s) && R.nr >= R.s.anzahl) { rundeEnde(); return; }
    R.auf = R.gen();
    R.nr++;
    R.eingabe = '';
    aufgabeZeigen();
    if (istAufgaben(R.s)) {
      $$('#fortschritt .punkt').forEach((p, i) => p.classList.toggle('jetzt', i === R.nr - 1));
      const balken = $('#fortschritt .balken');
      if (balken) balken.firstElementChild.style.width = `${((R.nr - 1) / R.s.anzahl) * 100}%`;
      $('#zaehler').textContent = `Aufgabe ${R.nr} von ${R.s.anzahl}`;
    } else {
      $('#zaehler').textContent = `✅ ${R.richtig}   ❌ ${R.falsch}`;
    }
    if (R.s.modus === 'sprache') frageVorlesen();
  }

  function aufgabeZeigen() {
    const luecke = `<span class="luecke" id="luecke">${R.eingabe}</span>`;
    // Im Sprechmodus wird die Aufgabe nur vorgelesen, nicht angezeigt.
    if (R.s.modus === 'sprache') {
      $('#aufgabe').innerHTML = R.tastatur ? `👂 = ${luecke}` : '👂';
      return;
    }
    const t = Aufgaben.teile(R.auf);
    const zahl = (n) => (n === null ? luecke : n);
    $('#aufgabe').innerHTML = `${zahl(t.a)} ${t.zeichen} ${zahl(t.b)} = ${zahl(t.c)}`;
  }

  function ziffer(z) {
    if (!R || !R.aktiv || !R.tastatur) return;
    const ziel = String(R.auf.loesung);
    const neu = R.eingabe + z;
    R.eingabe = neu;
    const l = $('#luecke');
    if (l) l.textContent = neu;
    // Erst bewerten, wenn so viele Ziffern getippt sind, wie die Lösung Stellen hat –
    // sonst landet die zweite Ziffer einer falschen Eingabe in der nächsten Aufgabe.
    if (neu.length >= ziel.length) bewerte(neu === ziel, Number(neu));
  }

  function zurueck() {
    if (!R || !R.aktiv || !R.tastatur || !R.eingabe) return;
    R.eingabe = R.eingabe.slice(0, -1);
    const l = $('#luecke');
    if (l) l.textContent = R.eingabe;
  }

  function bewerte(ok, gegeben) {
    if (!R || !R.aktiv) return;
    R.liste.push({ auf: R.auf, gegeben, ok });
    if (ok) { R.richtig++; Ton.richtig(); } else { R.falsch++; Ton.falsch(); }
    blitz(ok);
    if (R.punkte) {
      const p = $$('#fortschritt .punkt')[R.nr - 1];
      if (p) p.classList.add(ok ? 'richtig' : 'falsch');
    }
    naechste();
  }

  let blitzTimer = null;
  function blitz(ok) {
    const b = $('#blitz');
    const k = $('#aufgabe-karte');
    b.className = 'blitz ' + (ok ? 'ok' : 'nok');
    k.classList.remove('ok', 'nok');
    k.classList.add(ok ? 'ok' : 'nok');
    clearTimeout(blitzTimer);
    requestAnimationFrame(() => { b.className = 'blitz'; });
    blitzTimer = setTimeout(() => k.classList.remove('ok', 'nok'), 250);
  }

  // --- Sprechmodus ---
  function mikroStatus(st) {
    const m = $('#mikro');
    m.classList.toggle('hoert', st === 'hoert');
    m.classList.toggle('spricht', st === 'spricht');
    m.textContent = st === 'spricht' ? '🔊' : '🎤';
  }

  function zuhoerenStoppen() {
    if (R && R.zuhoerer) { R.zuhoerer.stop(); R.zuhoerer = null; }
  }

  async function frageVorlesen() {
    const auf = R.auf;
    zuhoerenStoppen();
    if (istAufgaben(R.s)) uhrLaeuft(false);
    mikroStatus('spricht');
    $('#gehoert').innerHTML = '&nbsp;';
    await new Promise((r) => setTimeout(r, 250)); // Ton ausklingen lassen
    if (!R || !R.aktiv || R.auf !== auf) return;
    await Sprache.vorlesen(Aufgaben.alsSatz(auf));
    if (!R || !R.aktiv || R.auf !== auf) return;
    uhrLaeuft(true);
    if (R.tastatur) { mikroStatus('aus'); $('#gehoert').textContent = R.hinweis; return; } // Mikro ging nicht – vorlesen, aber tippen
    mikroStatus('hoert');
    R.zuhoerer = Sprache.zuhoeren({
      loesung: auf.loesung,
      onText: (t) => { $('#gehoert').textContent = t; },
      onStatus: (st, meldung) => {
        if (st === 'aus') {
          mikroStatus('aus');
          R.hinweis = `${meldung} Tippe die Antwort.`;
          $('#gehoert').textContent = R.hinweis;
          R.tastatur = true;
          $('#tastatur').classList.remove('versteckt');
          $('#sprach-knoepfe').classList.add('versteckt');
          aufgabeZeigen();
        }
      },
      onZahl: (zahl, ok) => {
        if (!R || R.auf !== auf) return;
        R.zuhoerer = null;
        if (istAufgaben(R.s)) uhrLaeuft(false);
        $('#gehoert').textContent = `${zahl}`;
        bewerte(ok, zahl);
      },
    });
  }

  $('#nochmal').addEventListener('click', () => { if (R && R.aktiv) frageVorlesen(); });
  $('#ueberspringen-sprache').addEventListener('click', () => {
    if (!R || !R.aktiv) return;
    zuhoerenStoppen();
    if (istAufgaben(R.s)) uhrLaeuft(false);
    bewerte(false, null);
  });

  // --- Tastatur ---
  $('#tastatur').addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    ev.preventDefault();
    if (b.id === 'ueberspringen') { if (R && R.aktiv) bewerte(false, null); return; }
    if (b.id === 'zurueck') { zurueck(); return; }
    ziffer(b.dataset.z);
  });
  document.addEventListener('keydown', (ev) => {
    if (!$('#runde').classList.contains('aktiv')) return;
    if (/^[0-9]$/.test(ev.key)) ziffer(ev.key);
    else if (ev.key === 'Backspace') { ev.preventDefault(); zurueck(); }
  });

  $('#abbrechen').addEventListener('click', () => {
    if (laedt) { laedt = false; chipsAnzeigen(); zeige('start'); return; }
    if (!R) return;
    if (!confirm('Runde abbrechen? Dann gibt es keine Sterne.')) return;
    rundeAufraeumen();
    chipsAnzeigen();
    zeige('start');
  });

  function rundeAufraeumen() {
    if (!R) return;
    R.aktiv = false;
    clearInterval(R.tick);
    zuhoerenStoppen();
    Sprache.stopVorlesen();
    Sprache.ruhe();
    uhrLaeuft(false);
    wachHalten(false);
  }

  // --- Auswertung ---
  // Leistung der Runde: Sekunden pro Aufgabe (Aufgaben, kleiner = besser) bzw. netto richtige pro Minute.
  // null = Runde zählt nicht (weniger als die Hälfte richtig / netto nichts).
  function leistung() {
    if (istAufgaben(R.s)) return R.richtig < R.s.anzahl / 2 ? null : (R.zeit / 1000 + R.falsch * e.strafe) / R.s.anzahl;
    const netto = (R.richtig - R.falsch) / (R.dauer / 60);
    return netto > 0 ? netto : null;
  }

  // Persönlicher Schnitt, begrenzt durch die festen Schwellen, damit absichtlich
  // langsames Spielen die Latte nicht beliebig senkt.
  function tempoRahmen(s) {
    if (istAufgaben(s)) return [e.zehn[0] * 0.75, e.zehn[3] * 1.5];
    const f = s.modus === 'sprache' ? 0.6 : 1;
    return [e.minute[3] * f * 0.6, e.minute[0] * f * 1.25];
  }

  function tempoAktualisieren(s, wert) {
    const key = tempoSchluessel(s);
    const t = d.tempo[key] || { wert, n: 0 };
    if (t.n < 3) {
      t.wert = (t.wert * t.n + wert) / (t.n + 1);
    } else {
      // Besser werden zählt schnell, schlechter werden nur langsam.
      const besser = istAufgaben(s) ? wert < t.wert : wert > t.wert;
      t.wert += (wert - t.wert) * (besser ? 0.5 : 0.1);
    }
    const [lo, hi] = tempoRahmen(s);
    t.wert = Math.min(hi, Math.max(lo, t.wert));
    t.n += 1;
    d.tempo[key] = t;
  }

  function sterneBerechnen(wert) {
    if (wert === null) return 0;
    const s = R.s;
    const t = d.tempo[tempoSchluessel(s)];
    let st;
    if (e.anpassen && t && t.n >= 3) {
      // Verhältnis > 1 heißt: besser als der eigene Schnitt
      const v = istAufgaben(s) ? t.wert / wert : wert / t.wert;
      st = v >= 1.2 ? 5 : v >= 1.08 ? 4 : v >= 0.92 ? 3 : v >= 0.8 ? 2 : 1;
    } else if (istAufgaben(s)) {
      const th = e.zehn;
      st = wert <= th[0] ? 5 : wert <= th[1] ? 4 : wert <= th[2] ? 3 : wert <= th[3] ? 2 : 1;
    } else {
      const f = s.modus === 'sprache' ? 0.6 : 1;
      const th = e.minute.map((x) => x * f);
      st = wert >= th[0] ? 5 : wert >= th[1] ? 4 : wert >= th[2] ? 3 : wert >= th[3] ? 2 : 1;
    }
    // je 3 Fehler auf 10 Aufgaben ein Stern weniger
    if (istAufgaben(s)) st = Math.max(1, st - Math.floor((R.falsch * 10) / s.anzahl / 3));
    return st;
  }

  function tempoText(s) {
    const t = d.tempo[tempoSchluessel(s)];
    if (!e.anpassen || !t) return '';
    if (t.n < 3) return `<br>📈 Noch ${3 - t.n} Runde${t.n === 2 ? '' : 'n'}, dann zählt dein eigenes Tempo`;
    const w = istAufgaben(s)
      ? `${t.wert.toFixed(1).replace('.', ',')} s pro Aufgabe`
      : `${t.wert.toFixed(1).replace('.', ',')} pro Minute`;
    return `<br>📈 Dein Schnitt: ${w}`;
  }

  function rundeEnde() {
    if (!R || !R.aktiv) return;
    rundeAufraeumen();
    const s = R.s;
    const wert = leistung();
    const st = sterneBerechnen(wert);
    if (wert !== null) tempoAktualisieren(s, wert);
    // Längere Runden geben mehr Sterne: 10 Aufgaben bzw. 1 Minute = ×1, 5 Minuten = ×2.
    const faktor = istAufgaben(s) ? s.anzahl / 10 : 1 + (s.minuten - 1) / 4;
    const gewinn = st > 0 ? Math.max(1, Math.round(st * faktor)) : 0;
    d.sterne += gewinn;

    // Rekord
    const key = rekordSchluessel(s);
    const alt = key && d.rekorde[key];
    const geraeteBest = bestenliste(s)[0];
    let neuerRekord = false;
    let rekWert;
    if (istAufgaben(s)) {
      rekWert = Math.round(R.zeit / 1000 + R.falsch * e.strafe);
      if (key && R.richtig >= s.anzahl / 2 && (!alt || rekWert < alt.wert)) neuerRekord = true;
    } else {
      rekWert = R.richtig - R.falsch;
      if (key && rekWert > 0 && (!alt || rekWert > alt.wert)) neuerRekord = true;
    }
    if (neuerRekord) {
      d.rekorde[key] = { wert: rekWert, datum: Date.now() };
      Online.merkeRekord(d, key, rekWert, d.rekorde[key].datum);
    }
    const geraeteRekord = neuerRekord && Speicher.benutzer.liste.length > 1 && (!geraeteBest
      || (istAufgaben(s) ? rekWert < geraeteBest.wert : rekWert > geraeteBest.wert));

    const eintrag = {
      t: Date.now(), modus: s.modus, art: s.art, anzahl: s.anzahl, minuten: s.minuten,
      ops: s.ops.join(''), raum: s.raum,
      einsetzen: s.einsetzen, richtig: R.richtig, falsch: R.falsch,
      zeit: Math.round((istAufgaben(s) ? R.zeit / 1000 : R.dauer)), sterne: gewinn,
    };
    d.verlauf.unshift(eintrag);
    d.verlauf = d.verlauf.slice(0, 300);
    Online.merkeRunde(d, {
      typ: 'rechnen', t: eintrag.t, modus: s.modus, art: s.art, laenge: istAufgaben(s) ? s.anzahl : s.minuten,
      ops: eintrag.ops, raum: s.raum, einsetzen: s.einsetzen, richtig: R.richtig, falsch: R.falsch, zeit: eintrag.zeit, sterne: gewinn,
    });
    Speicher.speichern();
    sterneAnzeigen();
    const gesendet = Online.senden(Speicher.benutzer.aktiv);

    // Anzeige
    $('#erg-titel').textContent = st >= 4 ? 'Super gemacht! 🎉' : st >= 2 ? 'Gut gemacht! 👍' : st === 1 ? 'Geschafft! 💪' : 'Probier es nochmal! 💪';
    const sterneEl = $('#erg-sterne');
    sterneEl.innerHTML = Array.from({ length: 5 }, () => '<span>⭐</span>').join('')
      + (faktor !== 1 && st > 0 ? `<div style="font-size:28px;font-weight:900">× ${String(Math.round(faktor * 100) / 100).replace('.', ',')}</div>` : '');
    const spans = sterneEl.querySelectorAll('span');
    for (let i = 0; i < st; i++) {
      setTimeout(() => { spans[i].classList.add('an'); Ton.stern(i); }, 450 + i * 320);
    }
    const zeitText = istAufgaben(s) ? `⏱️ ${fmt(R.zeit / 1000)}` : `⏱️ ${laengeText(s)}`;
    $('#erg-text').innerHTML = `${zeitText} &nbsp; ✅ ${R.richtig} richtig &nbsp; ❌ ${R.falsch} falsch`
      + `<br>+${gewinn} ⭐ &nbsp;→&nbsp; Konto: ${d.sterne} ⭐` + tempoText(s);
    const rek = $('#erg-rekord');
    rek.textContent = geraeteRekord ? '👑 Neuer Geräte-Rekord!'
      : neuerRekord ? (alt ? '🏆 Neuer Rekord!' : '🏆 Erster Rekord!')
        : key ? rekordText(d.rekorde[key], s) : '';
    bestenlisteZeigen(s, gesendet);
    if (neuerRekord) setTimeout(() => Ton.jubel(), 450 + st * 320 + 200);

    const fehler = R.liste.filter((x) => !x.ok);
    $('#erg-fehler').innerHTML = fehler.length
      ? '<h3>Das üben wir noch:</h3>' + fehler.map((x) => {
        const g = x.gegeben === null ? '⏭️' : x.gegeben;
        return `<div class="fehler-zeile"><span>${Aufgaben.alsText(x.auf, true)}</span><span><span class="falsch">${g}</span> → <span class="loesung">${x.auf.loesung}</span></span></div>`;
      }).join('')
      : '';
    zeige('ergebnis');
  }

  $('#nochmal-runde').addEventListener('click', rundeStarten);
  $('#erg-menue').addEventListener('click', () => { chipsAnzeigen(); zeige('start'); });
  $('#erg-spiele').addEventListener('click', spieleOeffnen);

  // Bestenliste: 🏠 alle Spieler auf diesem Gerät, 👥 eigene Gruppe und 🌍 Welt (wenn online verbunden)
  let welche = null;
  function bestenlisteZeigen(s, gesendet = Promise.resolve()) {
    const box = $('#erg-bestenliste');
    box.innerHTML = '';
    const key = rekordSchluessel(s);
    const geraet = bestenliste(s);
    const hatWelt = !!(key && d.online && d.online.status === 'ok');
    // Reiter: 🏠 Gerät (ab 2 Spielern), 👥 eigene Gruppe/Klasse, 🌍 Welt
    const reiter = [];
    if (Speicher.benutzer.liste.length > 1 && geraet.length > 0) reiter.push(['geraet', '🏠 Hier']);
    if (hatWelt && d.online.gruppe) reiter.push(['gruppe', `👥 ${d.online.gruppe}`]);
    if (hatWelt) reiter.push(['welt', '🌍 Welt']);
    if (!reiter.length) return;
    // Standard: zuerst die eigene Gruppe, sonst Welt, sonst Gerät
    if (!reiter.some(([w]) => w === welche)) welche = ['gruppe', 'welt', 'geraet'].find((w) => reiter.some(([x]) => x === w));

    const h = document.createElement('h3');
    h.textContent = `Bestenliste · ${laengeText(s)}`;
    box.appendChild(h);
    if (reiter.length > 1) {
      const tabs = document.createElement('div');
      tabs.className = 'listen-tabs';
      reiter.forEach(([w, text]) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.classList.toggle('an', welche === w);
        b.addEventListener('click', () => { Ton.klick(); welche = w; bestenlisteZeigen(s); });
        tabs.appendChild(b);
      });
      box.appendChild(tabs);
    }
    const ol = document.createElement('ol');
    box.appendChild(ol);
    const eintrag = (platz, u, name, wert, ich) => {
      const li = document.createElement('li');
      if (ich) li.className = 'ich';
      const p = document.createElement('span');
      p.className = 'platz';
      p.textContent = ['🥇', '🥈', '🥉'][platz - 1] || `${platz}.`;
      const n = document.createElement('span');
      n.className = 'name';
      n.textContent = name;
      const w = document.createElement('span');
      w.textContent = rekordWert(wert, s);
      li.append(p, avatar(u, 'klein'), n, w);
      ol.appendChild(li);
    };

    if (welche === 'geraet') {
      geraet.slice(0, 5).forEach((x, i) => eintrag(i + 1, x.benutzer, x.benutzer.name, x.wert, x.benutzer.id === Speicher.benutzer.aktiv));
      return;
    }
    const info = document.createElement('p');
    info.className = 'listen-info';
    const zeichen = welche === 'gruppe' ? '👥' : '🌍';
    info.textContent = `${zeichen} wird geladen …`;
    box.appendChild(info);
    const daten = d;
    gesendet.then(() => Online.liste(daten, key, welche)).then((j) => {
      if (daten !== d || !box.contains(ol)) return; // inzwischen woanders
      if (!j) { info.textContent = `${zeichen} Gerade keine Verbindung zur Bestenliste.`; return; }
      const u = (x) => ({ bild: { art: 'emoji', wert: x.emoji } });
      j.top.slice(0, 5).forEach((x) => eintrag(x.platz, u(x), x.name, x.wert, x.ich));
      if (j.ich && j.ich.platz > 5) eintrag(j.ich.platz, u(j.ich), j.ich.name, j.ich.wert, true);
      info.textContent = j.gesamt ? `${j.gesamt} ${j.gesamt === 1 ? 'Kind' : 'Kinder'} in dieser Liste` : 'Noch niemand in dieser Liste – sei der Erste!';
    });
  }

  // ---------- Spiele ----------
  function spieleOeffnen() {
    sterneAnzeigen();
    $('#spiele-info').textContent = `Eine Spielrunde kostet ${e.preis} ⭐ – du hast genau einen Versuch!`;
    $('#spiele-meldung').textContent = '';
    const liste = $('#spiele-liste');
    liste.innerHTML = '';
    Spiele.liste.forEach((def) => {
      const k = document.createElement('button');
      k.className = 'spiel-karte' + (d.sterne < e.preis ? ' zu-teuer' : '');
      k.innerHTML = `<div class="emoji">${def.emoji}</div><div class="name">${def.name}</div>`
        + `<div class="beschr">${def.beschr}</div>`
        + `<div class="preis">${e.preis} ⭐${def.zeitlimit ? ` · ⏱️ ${Math.round(def.zeitlimit / 60)} Min` : ''}</div>`;
      k.addEventListener('click', () => {
        if (d.sterne < e.preis) {
          Ton.falsch();
          $('#spiele-meldung').textContent = `Du brauchst noch ${e.preis - d.sterne} ⭐ – rechne eine Runde!`;
          return;
        }
        d.sterne -= e.preis;
        Online.merkeRunde(d, { typ: 'spiel', t: Date.now(), spiel: def.id });
        Speicher.speichern();
        Online.senden(Speicher.benutzer.aktiv);
        sterneAnzeigen();
        spielStarten(def);
      });
      liste.appendChild(k);
    });
    zeige('spiele');
  }

  let S = null;
  function spielStarten(def) {
    Ton.init();
    zeige('spiel');
    $('#spiel-vorbei').classList.add('versteckt');
    $('#spiel-name').textContent = `${def.emoji} ${def.name}`;
    const flaeche = $('#spiel-flaeche');
    flaeche.innerHTML = '';
    const runde = { def, instanz: null, timer: null, uhr: null, zeitUm: false, pause: false };
    S = runde;
    spielUhr(runde);
    wachHalten(true);
    const hilfe = {
      ton: Ton,
      stand: () => (d.spielstand[def.id] = d.spielstand[def.id] || {}),
      speichern: () => Speicher.speichern(),
      // Uhr anhalten, z. B. während ein Level gebaut wird oder der Sieg-Hinweis zu sehen ist
      pause: (an) => { runde.pause = !!an; },
      // Das Spiel meldet: Runde zu Ende (verloren oder Level geschafft).
      // Kurz warten, damit man den Absturz bzw. das gelöste Level noch sieht.
      vorbei: () => {
        if (S !== runde || runde.timer) return;
        runde.timer = setTimeout(() => { if (S === runde) spielVorbei(true); }, 1500);
      },
    };
    requestAnimationFrame(() => { if (S === runde) runde.instanz = def.start(flaeche, hilfe); });
  }

  // Zeitlimit: zählt nur, solange die App sichtbar ist und das Spiel nicht pausiert.
  // Endet die Runde vorher (verloren), bleibt die Uhr stehen.
  function spielUhr(runde) {
    const uhr = $('#spiel-uhr');
    uhr.textContent = '';
    uhr.classList.remove('knapp');
    const limit = runde.def.zeitlimit;
    if (!limit) return;
    let rest = limit;
    let zuletzt = performance.now();
    const zeigen = () => {
      uhr.textContent = `⏱️ ${fmt(Math.ceil(rest))}`;
      uhr.classList.toggle('knapp', rest <= 15);
    };
    zeigen();
    runde.uhr = setInterval(() => {
      const jetzt = performance.now();
      if (document.visibilityState === 'visible' && !runde.timer && !runde.pause) rest -= (jetzt - zuletzt) / 1000;
      zuletzt = jetzt;
      if (S !== runde) { clearInterval(runde.uhr); return; }
      if (rest <= 0) {
        rest = 0;
        zeigen();
        runde.zeitUm = true;
        spielVorbei(true);
        return;
      }
      zeigen();
    }, 250);
  }

  function spielVorbei(fertig) {
    if (!S) return;
    clearTimeout(S.timer);
    clearInterval(S.uhr);
    const zeitUm = S.zeitUm;
    let text = '';
    try {
      if (S.instanz && S.instanz.zusammenfassung) text = S.instanz.zusammenfassung();
      if (S.instanz) S.instanz.stop();
    } catch (err) { console.error(err); }
    S = null;
    wachHalten(false);
    if (fertig) {
      $('#spiel-vorbei-text').textContent = (zeitUm ? '⏰ Zeit um! ' : '') + (text || '');
      $('#spiel-vorbei').classList.remove('versteckt');
      Ton.jubel();
    } else {
      $('#spiel-flaeche').innerHTML = '';
      spieleOeffnen();
    }
  }

  $('#spiel-ende').addEventListener('click', () => {
    if (confirm('Spiel beenden? Die Runde ist dann verbraucht.')) spielVorbei(false);
  });
  $('#spiel-zurueck').addEventListener('click', () => {
    $('#spiel-vorbei').classList.add('versteckt');
    $('#spiel-flaeche').innerHTML = '';
    spieleOeffnen();
  });

  // ---------- Eltern ----------
  function elternOeffnen() {
    sterneAnzeigen();
    $$('[data-eltern]').forEach((inp) => { inp.value = e[inp.dataset.eltern]; });
    $$('[data-schwelle]').forEach((inp) => { inp.value = e[inp.dataset.schwelle][Number(inp.dataset.i)]; });
    $$('[data-zeige]').forEach((el) => { el.textContent = e[el.dataset.zeige]; });
    verlaufZeigen();
    onlineZeigen();
    $('#erkennung').value = e.erkennung;
    $('#anpassen').checked = e.anpassen;
    stimmeInfo();
    zeige('eltern');
  }

  async function stimmeInfo() {
    const st = await Sprache.stimmenBereit();
    const alle = Sprache.alleStimmen();
    $('#stimme-info').textContent = st
      ? `Vorlese-Stimme: ${st.name} (${st.lang})`
      : Sprache.jonasMoeglich
        ? 'Vorlese-Stimme: Jonas (mitgeliefert) – der Browser hat keine deutsche Stimme.'
        : `Keine deutsche Stimme gefunden (${alle.length} Stimmen vorhanden: ${alle.slice(0, 4).map((v) => v.lang).join(', ') || 'keine'}).`
        + ' Android: Einstellungen → Sprachausgabe → Deutsch installieren.';
  }

  $('#erkennung').addEventListener('change', () => {
    e.erkennung = $('#erkennung').value;
    Speicher.speichern();
    Sprache.setzeMotor(e.erkennung);
  });

  $('#anpassen').addEventListener('change', () => {
    e.anpassen = $('#anpassen').checked;
    Speicher.speichern();
  });
  $('#tempo-loeschen').addEventListener('click', () => {
    if (!confirm('Den persönlichen Schnitt löschen? Er wird dann in den nächsten 3 Runden neu gemessen.')) return;
    d.tempo = {};
    Speicher.speichern();
  });

  $('#test-stimme').addEventListener('click', () => Sprache.vorlesen('7 plus 3'));

  let mikroTest = null;
  $('#test-mikro').addEventListener('click', () => {
    const aus = $('#mikro-test');
    if (!Sprache.kannHoeren) { aus.textContent = '❌ Dieser Browser kann keine Sprache erkennen – bitte Chrome verwenden.'; return; }
    if (mikroTest) mikroTest.stop();
    aus.textContent = '🎤 Sag eine Zahl …';
    // Zeitlimit erst, wenn wirklich zugehört wird (Modell laden kann dauern)
    let ende = null;
    const zeitlimit = () => { clearTimeout(ende); ende = setTimeout(() => { if (mikroTest) { mikroTest.stop(); mikroTest = null; Sprache.ruhe(); aus.textContent += ' (Zeit um – nichts erkannt)'; } }, 12000); };
    mikroTest = Sprache.zuhoeren({
      loesung: -1,
      onStatus: (st, meldung) => {
        if (st === 'laedt') aus.textContent = meldung === 'entpacken' ? '⏳ Sprachmodell wird vorbereitet …' : `⏳ Sprachmodell wird geladen … ${meldung} %`;
        if (st === 'hoert') zeitlimit();
        if (st === 'hoert') aus.textContent = `🎤 Ich höre zu (${Sprache.motor() === 'vosk' ? 'Vosk' : 'Google'}) – sag eine Zahl …`;
        if (st === 'aus') { clearTimeout(ende); mikroTest = null; Sprache.ruhe(); aus.textContent = `❌ ${meldung}`; }
      },
      onText: (t) => { aus.textContent = `🎤 Gehört: „${t}"`; },
      onZahl: (z) => { clearTimeout(ende); mikroTest = null; Sprache.ruhe(); aus.textContent += ` → ✅ Zahl ${z} erkannt`; },
    });
  });

  $$('[data-eltern]').forEach((inp) => inp.addEventListener('change', () => {
    const v = Number(inp.value);
    if (Number.isFinite(v) && v >= Number(inp.min)) { e[inp.dataset.eltern] = v; Speicher.speichern(); }
    inp.value = e[inp.dataset.eltern];
  }));
  $$('[data-schwelle]').forEach((inp) => inp.addEventListener('change', () => {
    const v = Number(inp.value);
    if (Number.isFinite(v) && v > 0) { e[inp.dataset.schwelle][Number(inp.dataset.i)] = v; Speicher.speichern(); }
    inp.value = e[inp.dataset.schwelle][Number(inp.dataset.i)];
  }));
  $$('[data-sterne]').forEach((b) => b.addEventListener('click', () => {
    d.sterne = Math.max(0, d.sterne + Number(b.dataset.sterne));
    Speicher.speichern();
    sterneAnzeigen();
  }));
  $('#alles-loeschen').addEventListener('click', () => {
    const u = Speicher.aktiverBenutzer();
    if (!confirm(`Wirklich alles von ${u ? u.name : 'diesem Spieler'} löschen? Sterne, Rekorde, Verlauf und Einstellungen gehen verloren.`)) return;
    Speicher.zuruecksetzen();
    benutzerStarten(Speicher.benutzer.aktiv);
  });

  function verlaufZeigen() {
    const v = d.verlauf;
    if (!v.length) { $('#verlauf').textContent = 'Noch keine Runden gespielt.'; return; }
    const zeilen = v.slice(0, 100).map((x) => {
      const dt = new Date(x.t);
      const datum = `${dt.getDate()}.${dt.getMonth() + 1}. ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}`;
      const ops = [...x.ops].map((o) => OP_NAME[o]).join(' ');
      const art = ART_NAME[x.art] || laengeText(x);
      return `<tr><td>${datum}</td><td>${x.modus === 'sprache' ? '🎤' : '⌨️'} ${art}</td>`
        + `<td>${ops} bis ${x.raum}${x.einsetzen ? ' (E)' : ''}</td>`
        + `<td>✅${x.richtig} ❌${x.falsch}</td><td>${x.art === 'zehn' || x.art === 'aufgaben' ? fmt(x.zeit) : ''}</td><td>+${x.sterne}⭐</td></tr>`;
    }).join('');
    $('#verlauf').innerHTML = `<table><tr><th>Wann</th><th>Art</th><th>Rechnungen</th><th>Ergebnis</th><th>Zeit</th><th>Sterne</th></tr>${zeilen}</table>`;
  }

  // ---------- Online-Bestenliste (Eltern-Bereich) ----------
  function onlineZeigen() {
    const box = $('#online-box');
    box.innerHTML = '';
    const u = Speicher.aktiverBenutzer();
    const o = d.online;
    const neu = (tag, text, klasse) => {
      const el = document.createElement(tag);
      if (text) el.textContent = text;
      if (klasse) el.className = klasse;
      return el;
    };
    const feld = (titel, wert, platzhalter) => {
      const l = neu('label', titel);
      const i = neu('input', null, 'text');
      i.type = 'text';
      i.value = wert || '';
      i.placeholder = platzhalter || '';
      i.autocomplete = 'off';
      l.appendChild(i);
      box.appendChild(l);
      return i;
    };
    // Bildauswahl wie bei „Neuer Spieler" – nur Emojis, keine Fotos
    const bildWahl = (start) => {
      let gewaehlt = start;
      const g = neu('div', null, 'bilder');
      BILDER.forEach((b) => {
        const k = neu('button', b);
        k.classList.toggle('an', b === gewaehlt);
        k.addEventListener('click', () => {
          Ton.klick();
          gewaehlt = b;
          g.querySelectorAll('button').forEach((x) => x.classList.toggle('an', x === k));
        });
        g.appendChild(k);
      });
      box.appendChild(g);
      return () => gewaehlt;
    };
    const meldung = neu('p', '', 'hinweis online-meldung');
    const knopfZeile = () => { const z = neu('div', null, 'zeile'); box.appendChild(z); return z; };
    const knopf = (zeile, text, klasse, fn) => {
      const k = neu('button', text, `knopf klein ${klasse || ''}`);
      k.addEventListener('click', async () => {
        k.disabled = true;
        meldung.textContent = '';
        try { await fn(); } catch (err) { meldung.textContent = `❌ ${err.message}`; }
        k.disabled = false;
      });
      zeile.appendChild(k);
      return k;
    };

    if (!o) {
      box.appendChild(neu('p', `Mit einem Code nimmt ${u.name} an der Bestenliste der Klasse/Gruppe und der Welt teil. Online sichtbar sind nur Spitzname und Bild – nie ein Foto. Jeder Code gilt nur einmal.`, 'hinweis'));
      const code = feld('Code', '', 'RH-XXXX-XXXX');
      code.autocapitalize = 'characters';
      const name = feld('Spitzname', u.name);
      name.maxLength = 16;
      box.appendChild(neu('p', 'Bild für die Bestenliste:', 'hinweis'));
      const eigenes = u.bild && u.bild.art === 'emoji' && BILDER.includes(u.bild.wert) ? u.bild.wert : BILDER[0];
      const bild = bildWahl(eigenes);
      const mehr = neu('details', null, 'online-mehr');
      mehr.appendChild(neu('summary', 'Server-Adresse'));
      box.appendChild(mehr);
      const server = feld('Adresse (leer = dieselbe wie die App)', '', 'https://rechnen.example.at');
      mehr.appendChild(server.parentElement);
      knopf(knopfZeile(), '🌍 Verbinden', 'gruen', async () => {
        if (!code.value.trim()) throw new Error('Bitte den Code eingeben.');
        const verbindung = await Online.einloesen(server.value.trim(), code.value, name.value.trim(), bild());
        d.online = verbindung;
        // bisherige Rekorde gleich mitnehmen
        Object.entries(d.rekorde).forEach(([key, r]) => Online.merkeRekord(d, key, r.wert, r.datum));
        Speicher.speichern();
        await Online.senden(Speicher.benutzer.aktiv);
        onlineZeigen();
      });
      box.appendChild(meldung);
      return;
    }

    const status = o.status === 'gesperrt' ? '⛔ Dieser Spieler wurde gesperrt.'
      : o.status === 'ungueltig' ? '⚠️ Die Verbindung gilt nicht mehr. Bitte trennen und einen neuen Code eingeben.'
        : `✅ Verbunden als ${o.emoji} ${o.name}${o.gruppe ? ` · Gruppe ${o.gruppe}` : ''}`;
    box.appendChild(neu('p', status, 'online-status'));
    const n = Online.wartet(d);
    if (n) box.appendChild(neu('p', `📤 ${n} ${n === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Übertragung (passiert automatisch, sobald Internet da ist).`, 'hinweis'));

    if (o.status === 'ok') {
      const name = feld('Spitzname', o.name);
      name.maxLength = 16;
      const bild = bildWahl(o.emoji);
      knopf(knopfZeile(), 'Spitzname/Bild speichern', '', async () => {
        await Online.aendern(d, name.value.trim(), bild());
        Speicher.speichern();
        onlineZeigen();
      });
    }
    const z = knopfZeile();
    if (o.status === 'ok') {
      knopf(z, '📤 Jetzt senden', 'blau', async () => {
        await Online.senden(Speicher.benutzer.aktiv);
        onlineZeigen();
      });
    }
    knopf(z, 'Trennen', 'grau', async () => {
      if (!confirm('Online-Verbindung trennen? Zum Wiederverbinden braucht es einen neuen Code.')) return;
      d.online = null;
      Speicher.speichern();
      onlineZeigen();
    });
    box.appendChild(meldung);
  }

  // ---------- Spieler ----------
  const BILDER = ['🚗', '✈️', '🐴', '🦄', '🚀', '🚒', '🚜', '🐶', '🐱', '🦁', '🐼', '🦊', '🐸', '🦖', '🐬', '🦋', '⚽', '🌈'];

  function avatar(u, klasse = '') {
    const el = document.createElement('span');
    el.className = `avatar ${klasse}`;
    if (u.bild && u.bild.art === 'foto') {
      const img = document.createElement('img');
      img.src = u.bild.wert;
      img.alt = '';
      el.appendChild(img);
    } else {
      el.textContent = (u.bild && u.bild.wert) || '🙂';
    }
    return el;
  }

  let loeschModus = false;
  function benutzerZeigen() {
    const liste = Speicher.benutzerLaden();
    if (!liste.length) { neuOeffnen(); return; }
    const box = $('#benutzer-liste');
    box.innerHTML = '';
    box.classList.toggle('loeschen', loeschModus);
    liste.forEach((u) => {
      const k = document.createElement('button');
      k.className = 'benutzer-karte';
      k.appendChild(avatar(u));
      const n = document.createElement('span');
      n.className = 'name';
      n.textContent = u.name;
      k.appendChild(n);
      if (loeschModus) {
        const x = document.createElement('span');
        x.className = 'weg';
        x.textContent = '✖';
        k.appendChild(x);
      }
      k.addEventListener('click', () => {
        if (!loeschModus) { Ton.klick(); benutzerStarten(u.id); return; }
        if (!confirm(`${u.name} wirklich löschen? Alle Sterne, Rekorde und Einstellungen gehen verloren.`)) return;
        Speicher.benutzerLoeschen(u.id);
        if (!Speicher.benutzer.liste.length) loeschModus = false;
        benutzerZeigen();
      });
      box.appendChild(k);
    });
    $('#benutzer-bearbeiten').textContent = loeschModus ? '✔️ Fertig mit Löschen' : '🗑️ Spieler löschen';
    zeige('benutzer');
  }

  function benutzerStarten(id) {
    d = Speicher.waehlen(id);
    e = d.eltern;
    Sprache.setzeMotor(e.erkennung);
    const wer = $('#wer');
    wer.innerHTML = '';
    const u = Speicher.aktiverBenutzer();
    wer.appendChild(avatar(u, 'klein'));
    const n = document.createElement('span');
    n.textContent = u.name;
    wer.appendChild(n);
    chipsAnzeigen();
    sterneAnzeigen();
    tonAnzeigen();
    zeige('start');
    // Liegengebliebenes nachschicken und Gruppe/Sperre auffrischen
    Online.senden(id);
  }
  window.addEventListener('online', () => { if (d) Online.senden(Speicher.benutzer.aktiv); });

  function tonAnzeigen() {
    Ton.an = d.settings.ton !== false;
    const k = $('#ton-knopf');
    k.textContent = Ton.an ? '🔊' : '🔇';
    k.title = Ton.an ? 'Ton aus' : 'Ton an';
    k.setAttribute('aria-label', k.title);
  }
  $('#ton-knopf').addEventListener('click', () => {
    d.settings.ton = !Ton.an;
    Speicher.speichern();
    tonAnzeigen();
    Ton.klick();
  });

  $('#wer').addEventListener('click', () => { loeschModus = false; benutzerZeigen(); });
  $('#benutzer-neu').addEventListener('click', () => { loeschModus = false; neuOeffnen(); });
  $('#benutzer-bearbeiten').addEventListener('click', () => { loeschModus = !loeschModus; benutzerZeigen(); });

  // Neuer Spieler: Name + Foto oder fertiges Bild
  let neuBild = null;
  function neuVorschau() {
    const v = $('#neu-vorschau');
    v.innerHTML = '';
    v.appendChild(avatar({ bild: neuBild }, 'riesig'));
    $$('#neu-bilder button').forEach((b) => b.classList.toggle('an', !!neuBild && neuBild.art === 'emoji' && b.textContent === neuBild.wert));
  }
  function neuOeffnen() {
    neuBild = { art: 'emoji', wert: BILDER[Math.floor(Math.random() * BILDER.length)] };
    $('#neu-name').value = '';
    $('#neu-hinweis').classList.toggle('versteckt', !Speicher.hatAlteDaten());
    $('#neu-zurueck').classList.toggle('unsichtbar', !Speicher.benutzer.liste.length);
    neuVorschau();
    zeige('neu');
  }
  BILDER.forEach((b) => {
    const k = document.createElement('button');
    k.textContent = b;
    k.addEventListener('click', () => { Ton.klick(); neuBild = { art: 'emoji', wert: b }; neuVorschau(); });
    $('#neu-bilder').appendChild(k);
  });

  // Foto quadratisch zuschneiden und klein rechnen, damit es in den Speicher passt.
  $('#neu-foto').addEventListener('change', (ev) => {
    const datei = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!datei) return;
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => {
      const g = 240;
      const seite = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = g; c.height = g;
      c.getContext('2d').drawImage(img, (img.naturalWidth - seite) / 2, (img.naturalHeight - seite) / 2, seite, seite, 0, 0, g, g);
      URL.revokeObjectURL(url);
      neuBild = { art: 'foto', wert: c.toDataURL('image/jpeg', 0.8) };
      neuVorschau();
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('Das Foto konnte nicht geladen werden.'); };
    img.src = url;
  });

  $('#neu-zurueck').addEventListener('click', benutzerZeigen);
  $('#neu-fertig').addEventListener('click', () => {
    const name = $('#neu-name').value.trim();
    if (!name) { Ton.falsch(); $('#neu-name').focus(); return; }
    const u = Speicher.benutzerAnlegen(name, neuBild);
    Ton.klick();
    benutzerStarten(u.id);
  });

  // ---------- Los ----------
  benutzerZeigen();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
