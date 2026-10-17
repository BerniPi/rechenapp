// Hauptlogik: Bildschirme, Einstellungen, Rechenrunden, Sterne, Spiele-Menü, Eltern-Bereich.
(() => {
  const d = Speicher.laden();
  const e = d.eltern;
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
  const ART_NAME = { zehn: '10 Aufgaben', m1: '1 Minute', m5: '5 Minuten' };

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
    $('#gruppe-einsetzen').classList.toggle('aus', s.modus === 'sprache');
    rekordInfo();
    sprachHinweis();
  }

  async function sprachHinweis() {
    const el = $('#sprach-hinweis');
    el.textContent = '';
    if (d.settings.modus !== 'sprache') return;
    if (!Sprache.kannHoeren) {
      el.textContent = '⚠️ Dieser Browser kann keine Sprache erkennen – bitte Chrome verwenden.';
      return;
    }
    const st = await Sprache.stimmenBereit();
    if (d.settings.modus === 'sprache' && !st) {
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

  function rekordSchluessel(s) {
    const ein = s.modus === 'schrift' && s.einsetzen ? 'E' : '';
    return `${s.modus}|${s.art}|${[...s.ops].sort().join('')}|${s.raum}|${ein}`;
  }
  function rekordText(r, art) {
    if (!r) return '';
    return art === 'zehn' ? `🏆 Bestzeit: ${fmt(r.wert)}` : `🏆 Rekord: ${r.wert} Punkte`;
  }
  function rekordInfo() {
    const s = d.settings;
    $('#rekord-info').textContent = rekordText(d.rekorde[rekordSchluessel(s)], s.art);
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

  function rundeStarten() {
    Ton.init();
    const s = { ...d.settings, ops: [...d.settings.ops] };
    if (s.modus === 'sprache') {
      if (!Sprache.kannHoeren) {
        alert('Dieser Browser kann leider keine Sprache erkennen. Bitte Chrome verwenden – jetzt geht es mit Schreiben weiter.');
        s.modus = 'schrift';
      } else {
        s.einsetzen = false;
      }
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
      zeit: 0,          // gemessene Zeit in ms (10-Aufgaben-Modus)
      laufSeit: null,
      start: performance.now(),
      dauer: s.art === 'm1' ? 60 : s.art === 'm5' ? 300 : 0,
      zuhoerer: null,
      tastatur: s.modus === 'schrift',
    };

    const sprache = s.modus === 'sprache';
    $('#tastatur').classList.toggle('versteckt', sprache);
    $('#sprach-bereich').classList.toggle('versteckt', !sprache);
    $('#sprach-knoepfe').classList.toggle('versteckt', !sprache);

    const fort = $('#fortschritt');
    fort.innerHTML = s.art === 'zehn'
      ? Array.from({ length: 10 }, () => '<span class="punkt"></span>').join('')
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
    if (R.s.art === 'zehn') {
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
    if (R.s.art === 'zehn' && R.nr >= 10) { rundeEnde(); return; }
    R.auf = R.gen();
    R.nr++;
    R.eingabe = '';
    aufgabeZeigen();
    if (R.s.art === 'zehn') {
      $$('#fortschritt .punkt').forEach((p, i) => p.classList.toggle('jetzt', i === R.nr - 1));
      $('#zaehler').textContent = `Aufgabe ${R.nr} von 10`;
    } else {
      $('#zaehler').textContent = `✅ ${R.richtig}   ❌ ${R.falsch}`;
    }
    if (R.s.modus === 'sprache') frageVorlesen();
  }

  function aufgabeZeigen() {
    const t = Aufgaben.teile(R.auf);
    const zahl = (n) => (n === null ? `<span class="luecke" id="luecke">${R.eingabe}</span>` : n);
    const c = R.s.modus === 'sprache' && !R.tastatur && t.c === null ? '<span class="luecke">?</span>' : zahl(t.c);
    $('#aufgabe').innerHTML = `${zahl(t.a)} ${t.zeichen} ${zahl(t.b)} = ${c}`;
  }

  function ziffer(z) {
    if (!R || !R.aktiv || !R.tastatur) return;
    const ziel = String(R.auf.loesung);
    const neu = R.eingabe + z;
    R.eingabe = neu;
    const l = $('#luecke');
    if (l) l.textContent = neu;
    if (!ziel.startsWith(neu)) bewerte(false, Number(neu));
    else if (neu === ziel) bewerte(true, Number(neu));
  }

  function bewerte(ok, gegeben) {
    if (!R || !R.aktiv) return;
    R.liste.push({ auf: R.auf, gegeben, ok });
    if (ok) { R.richtig++; Ton.richtig(); } else { R.falsch++; Ton.falsch(); }
    blitz(ok);
    if (R.s.art === 'zehn') {
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
    if (R.s.art === 'zehn') uhrLaeuft(false);
    mikroStatus('spricht');
    $('#gehoert').innerHTML = '&nbsp;';
    await new Promise((r) => setTimeout(r, 250)); // Ton ausklingen lassen
    if (!R || !R.aktiv || R.auf !== auf) return;
    await Sprache.vorlesen(Aufgaben.alsSatz(auf));
    if (!R || !R.aktiv || R.auf !== auf) return;
    uhrLaeuft(true);
    if (R.tastatur) { mikroStatus('aus'); return; } // Mikro ging nicht – vorlesen, aber tippen
    mikroStatus('hoert');
    R.zuhoerer = Sprache.zuhoeren({
      loesung: auf.loesung,
      onText: (t) => { $('#gehoert').textContent = t; },
      onStatus: (st, meldung) => {
        if (st === 'aus') {
          mikroStatus('aus');
          $('#gehoert').textContent = `${meldung} Tippe die Antwort.`;
          R.tastatur = true;
          $('#tastatur').classList.remove('versteckt');
          $('#sprach-knoepfe').classList.add('versteckt');
          if (R.auf.luecke === 'c') {
            $('#aufgabe').querySelector('.luecke').id = 'luecke';
            $('#aufgabe').querySelector('.luecke').textContent = '';
          }
        }
      },
      onZahl: (zahl, ok) => {
        if (!R || R.auf !== auf) return;
        R.zuhoerer = null;
        if (R.s.art === 'zehn') uhrLaeuft(false);
        $('#gehoert').textContent = `${zahl}`;
        bewerte(ok, zahl);
      },
    });
  }

  $('#nochmal').addEventListener('click', () => { if (R && R.aktiv) frageVorlesen(); });
  $('#ueberspringen-sprache').addEventListener('click', () => {
    if (!R || !R.aktiv) return;
    zuhoerenStoppen();
    if (R.s.art === 'zehn') uhrLaeuft(false);
    bewerte(false, null);
  });

  // --- Tastatur ---
  $('#tastatur').addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    ev.preventDefault();
    if (b.id === 'ueberspringen') { if (R && R.aktiv) bewerte(false, null); return; }
    ziffer(b.dataset.z);
  });
  document.addEventListener('keydown', (ev) => {
    if (!$('#runde').classList.contains('aktiv')) return;
    if (/^[0-9]$/.test(ev.key)) ziffer(ev.key);
  });

  $('#abbrechen').addEventListener('click', () => {
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
    uhrLaeuft(false);
    wachHalten(false);
  }

  // --- Auswertung ---
  function sterneBerechnen() {
    if (R.s.art === 'zehn') {
      if (R.richtig < 5) return 0;
      const eff = (R.zeit / 1000 + R.falsch * e.strafe) / 10;
      const th = e.zehn;
      let st = eff <= th[0] ? 5 : eff <= th[1] ? 4 : eff <= th[2] ? 3 : eff <= th[3] ? 2 : 1;
      st -= Math.floor(R.falsch / 3);
      return Math.max(1, st);
    }
    const netto = (R.richtig - R.falsch) / (R.dauer / 60);
    if (netto <= 0) return 0;
    const f = R.s.modus === 'sprache' ? 0.6 : 1;
    const th = e.minute.map((x) => x * f);
    return netto >= th[0] ? 5 : netto >= th[1] ? 4 : netto >= th[2] ? 3 : netto >= th[3] ? 2 : 1;
  }

  function rundeEnde() {
    if (!R || !R.aktiv) return;
    rundeAufraeumen();
    const s = R.s;
    const st = sterneBerechnen();
    const faktor = s.art === 'm5' ? 2 : 1;
    const gewinn = st * faktor;
    d.sterne += gewinn;

    // Rekord
    const key = rekordSchluessel(s);
    const alt = d.rekorde[key];
    let neuerRekord = false;
    let wert;
    if (s.art === 'zehn') {
      wert = Math.round(R.zeit / 1000 + R.falsch * e.strafe);
      if (R.richtig >= 5 && (!alt || wert < alt.wert)) neuerRekord = true;
    } else {
      wert = R.richtig - R.falsch;
      if (wert > 0 && (!alt || wert > alt.wert)) neuerRekord = true;
    }
    if (neuerRekord) d.rekorde[key] = { wert, datum: Date.now() };

    d.verlauf.unshift({
      t: Date.now(), modus: s.modus, art: s.art, ops: s.ops.join(''), raum: s.raum,
      einsetzen: s.einsetzen, richtig: R.richtig, falsch: R.falsch,
      zeit: Math.round((s.art === 'zehn' ? R.zeit / 1000 : R.dauer)), sterne: gewinn,
    });
    d.verlauf = d.verlauf.slice(0, 300);
    Speicher.speichern();
    sterneAnzeigen();

    // Anzeige
    $('#erg-titel').textContent = st >= 4 ? 'Super gemacht! 🎉' : st >= 2 ? 'Gut gemacht! 👍' : st === 1 ? 'Geschafft! 💪' : 'Probier es nochmal! 💪';
    const sterneEl = $('#erg-sterne');
    sterneEl.innerHTML = Array.from({ length: 5 }, () => '<span>⭐</span>').join('')
      + (faktor > 1 && st > 0 ? '<div style="font-size:28px;font-weight:900">× 2</div>' : '');
    const spans = sterneEl.querySelectorAll('span');
    for (let i = 0; i < st; i++) {
      setTimeout(() => { spans[i].classList.add('an'); Ton.stern(i); }, 450 + i * 320);
    }
    const zeitText = s.art === 'zehn' ? `⏱️ ${fmt(R.zeit / 1000)}` : `⏱️ ${ART_NAME[s.art]}`;
    $('#erg-text').innerHTML = `${zeitText} &nbsp; ✅ ${R.richtig} richtig &nbsp; ❌ ${R.falsch} falsch`
      + `<br>+${gewinn} ⭐ &nbsp;→&nbsp; Konto: ${d.sterne} ⭐`;
    const rek = $('#erg-rekord');
    rek.textContent = neuerRekord ? (alt ? '🏆 Neuer Rekord!' : '🏆 Erster Rekord!') : rekordText(d.rekorde[key], s.art);
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

  // ---------- Spiele ----------
  function spieleOeffnen() {
    sterneAnzeigen();
    $('#spiele-info').textContent = `Eine Spielrunde (${e.spielMinuten} Min.) kostet ${e.preis} ⭐`;
    $('#spiele-meldung').textContent = '';
    const liste = $('#spiele-liste');
    liste.innerHTML = '';
    Spiele.liste.forEach((def) => {
      const k = document.createElement('button');
      k.className = 'spiel-karte' + (d.sterne < e.preis ? ' zu-teuer' : '');
      k.innerHTML = `<div class="emoji">${def.emoji}</div><div class="name">${def.name}</div>`
        + `<div class="beschr">${def.beschr}</div><div class="preis">${e.preis} ⭐</div>`;
      k.addEventListener('click', () => {
        if (d.sterne < e.preis) {
          Ton.falsch();
          $('#spiele-meldung').textContent = `Du brauchst noch ${e.preis - d.sterne} ⭐ – rechne eine Runde!`;
          return;
        }
        d.sterne -= e.preis;
        Speicher.speichern();
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
    S = { def, ende: performance.now() + e.spielMinuten * 60000, instanz: null };
    wachHalten(true);
    const hilfe = {
      ton: Ton,
      stand: () => (d.spielstand[def.id] = d.spielstand[def.id] || {}),
      speichern: () => Speicher.speichern(),
    };
    requestAnimationFrame(() => { if (S) S.instanz = def.start(flaeche, hilfe); });
    const tick = () => {
      if (!S) return;
      const rest = (S.ende - performance.now()) / 1000;
      $('#spiel-zeit').textContent = fmt(Math.ceil(rest));
      if (rest <= 0) spielVorbei(true);
    };
    S.timer = setInterval(tick, 250);
    tick();
  }

  function spielVorbei(zeitUm) {
    if (!S) return;
    clearInterval(S.timer);
    let text = '';
    try {
      if (S.instanz && S.instanz.zusammenfassung) text = S.instanz.zusammenfassung();
      if (S.instanz) S.instanz.stop();
    } catch (err) { console.error(err); }
    S = null;
    wachHalten(false);
    if (zeitUm) {
      $('#spiel-vorbei-text').textContent = text || '';
      $('#spiel-vorbei').classList.remove('versteckt');
      Ton.jubel();
    } else {
      $('#spiel-flaeche').innerHTML = '';
      spieleOeffnen();
    }
  }

  $('#spiel-ende').addEventListener('click', () => {
    if (confirm('Spiel beenden? Die restliche Zeit verfällt.')) spielVorbei(false);
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
    stimmeInfo();
    zeige('eltern');
  }

  async function stimmeInfo() {
    const st = await Sprache.stimmenBereit();
    const alle = Sprache.alleStimmen();
    $('#stimme-info').textContent = st
      ? `Vorlese-Stimme: ${st.name} (${st.lang})`
      : `Keine deutsche Stimme gefunden (${alle.length} Stimmen vorhanden: ${alle.slice(0, 4).map((v) => v.lang).join(', ') || 'keine'}).`
        + ' Android: Einstellungen → Sprachausgabe → Deutsch installieren.';
  }

  $('#test-stimme').addEventListener('click', () => Sprache.vorlesen('Sieben plus drei'));

  let mikroTest = null;
  $('#test-mikro').addEventListener('click', () => {
    const aus = $('#mikro-test');
    if (!Sprache.kannHoeren) { aus.textContent = '❌ Dieser Browser kann keine Sprache erkennen – bitte Chrome verwenden.'; return; }
    if (mikroTest) mikroTest.stop();
    aus.textContent = '🎤 Sag eine Zahl …';
    const ende = setTimeout(() => { if (mikroTest) { mikroTest.stop(); mikroTest = null; aus.textContent += ' (Zeit um – nichts erkannt)'; } }, 12000);
    mikroTest = Sprache.zuhoeren({
      loesung: -1,
      onStatus: (st, meldung) => {
        if (st === 'hoert') aus.textContent = '🎤 Ich höre zu – sag eine Zahl …';
        if (st === 'aus') { clearTimeout(ende); mikroTest = null; aus.textContent = `❌ ${meldung}`; }
      },
      onText: (t) => { aus.textContent = `🎤 Gehört: „${t}"`; },
      onZahl: (z) => { clearTimeout(ende); mikroTest = null; aus.textContent += ` → ✅ Zahl ${z} erkannt`; },
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
    if (!confirm('Wirklich alles löschen? Sterne, Rekorde, Verlauf und Einstellungen gehen verloren.')) return;
    Speicher.zuruecksetzen();
    location.reload();
  });

  function verlaufZeigen() {
    const v = d.verlauf;
    if (!v.length) { $('#verlauf').textContent = 'Noch keine Runden gespielt.'; return; }
    const zeilen = v.slice(0, 100).map((x) => {
      const dt = new Date(x.t);
      const datum = `${dt.getDate()}.${dt.getMonth() + 1}. ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}`;
      const ops = [...x.ops].map((o) => OP_NAME[o]).join(' ');
      return `<tr><td>${datum}</td><td>${x.modus === 'sprache' ? '🎤' : '✏️'} ${ART_NAME[x.art]}</td>`
        + `<td>${ops} bis ${x.raum}${x.einsetzen ? ' (E)' : ''}</td>`
        + `<td>✅${x.richtig} ❌${x.falsch}</td><td>${x.art === 'zehn' ? fmt(x.zeit) : ''}</td><td>+${x.sterne}⭐</td></tr>`;
    }).join('');
    $('#verlauf').innerHTML = `<table><tr><th>Wann</th><th>Art</th><th>Rechnungen</th><th>Ergebnis</th><th>Zeit</th><th>Sterne</th></tr>${zeilen}</table>`;
  }

  // ---------- Los ----------
  chipsAnzeigen();
  sterneAnzeigen();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
