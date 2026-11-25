// Tag der offenen Tür: Konfiguration durch die Lehrperson und Live-Beamer-Ansicht.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const GRENZEN = { aufgaben: { min: 5, max: 50, schritt: 5 }, zeit: { min: 1, max: 10, schritt: 1 } };
  const STORAGE_KEY = 'tdot-leitung';

  let stationCode = null;
  let leitungSchluessel = null;
  let rolle = 'gast'; // 'leitung' | 'zuschauer' | 'gast'
  let aktuelleStation = null;
  let eventSource = null;
  let tonAn = true;

  const zeilenMap = new Map();
  let highlightTimer = null;

  function zeigeScreen(id) {
    $$('.screen').forEach((s) => s.classList.toggle('aktiv', s.id === id));
    window.scrollTo(0, 0);
  }

  function storageSpeichern(daten) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(daten));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(daten));
    } catch (e) {}
  }

  function storageLaden() {
    try {
      const roh = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      return roh ? JSON.parse(roh) : null;
    } catch (e) {
      return null;
    }
  }

  function storageLoeschen() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  // ---------- Formular-Helfer (Setup & Bearbeiten teilen dieselbe Logik) ----------
  function formularController(opts) {
    const {
      root, titelInput, laengeEl, wenigerBtn, mehrBtn,
      strafeBox, strafeSelect, fehlerEl, initial, onChange,
    } = opts;

    const zustand = {
      modus: initial.modus || 'schrift',
      art: initial.art || 'aufgaben',
      anzahl: initial.anzahl || 10,
      minuten: initial.minuten || 1,
      ops: [...(initial.ops || ['+'])],
      raum: initial.raum || 10,
      negativ: Boolean(initial.negativ),
      einsetzen: Boolean(initial.einsetzen),
      strafe: initial.strafe ?? 3,
    };

    function zeichnen() {
      root.querySelectorAll('.chips').forEach((ch) => {
        const feld = ch.dataset.feld;
        ch.querySelectorAll('button').forEach((b) => {
          const v = b.dataset.wert;
          const an = feld === 'ops' ? zustand.ops.includes(v) : String(zustand[feld]) === v;
          b.classList.toggle('an', an);
        });
      });

      const istAufg = zustand.art === 'aufgaben';
      const g = GRENZEN[zustand.art];
      const wert = istAufg ? zustand.anzahl : zustand.minuten;
      laengeEl.textContent = istAufg
        ? `${zustand.anzahl} Aufgaben`
        : `${zustand.minuten} ${zustand.minuten === 1 ? 'Minute' : 'Minuten'}`;
      wenigerBtn.disabled = wert <= g.min;
      mehrBtn.disabled = wert >= g.max;
      strafeBox.classList.toggle('versteckt', !istAufg);
      strafeSelect.value = String(zustand.strafe);
    }

    function setzen(einstellungen, titel) {
      if (titel !== undefined) titelInput.value = titel;
      zustand.modus = einstellungen.modus || 'schrift';
      zustand.art = einstellungen.art || 'aufgaben';
      zustand.anzahl = einstellungen.anzahl || 10;
      zustand.minuten = einstellungen.minuten || 1;
      zustand.ops = [...(einstellungen.ops || ['+'])];
      zustand.raum = einstellungen.raum || 10;
      zustand.negativ = Boolean(einstellungen.negativ);
      zustand.einsetzen = Boolean(einstellungen.einsetzen);
      zustand.strafe = einstellungen.strafe ?? 3;
      fehlerEl.textContent = '';
      zeichnen();
    }

    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const ch = b.closest('.chips');
      if (!ch) return;
      if (typeof Ton !== 'undefined') Ton.klick();
      const feld = ch.dataset.feld;
      let v = b.dataset.wert;
      if (feld === 'ops') {
        const l = zustand.ops;
        if (l.includes(v)) {
          if (l.length > 1) l.splice(l.indexOf(v), 1);
        } else {
          l.push(v);
        }
      } else {
        if ('zahl' in ch.dataset) v = Number(v);
        if ('bool' in ch.dataset) v = v === 'true';
        zustand[feld] = v;
      }
      zeichnen();
      if (onChange) onChange();
    });

    function laengeAendern(richtung) {
      const g = GRENZEN[zustand.art];
      const feld = zustand.art === 'aufgaben' ? 'anzahl' : 'minuten';
      const neu = Math.round((zustand[feld] + richtung * g.schritt) / g.schritt) * g.schritt;
      zustand[feld] = Math.min(g.max, Math.max(g.min, neu));
      if (typeof Ton !== 'undefined') Ton.klick();
      zeichnen();
      if (onChange) onChange();
    }

    wenigerBtn.addEventListener('click', () => laengeAendern(-1));
    mehrBtn.addEventListener('click', () => laengeAendern(1));
    strafeSelect.addEventListener('change', () => {
      zustand.strafe = Number(strafeSelect.value);
      if (onChange) onChange();
    });

    zeichnen();

    return {
      setzen,
      lesen: () => ({
        titel: titelInput.value.trim() || 'Tag der offenen Tür',
        einstellungen: {
          modus: zustand.modus,
          art: zustand.art,
          anzahl: zustand.anzahl,
          minuten: zustand.minuten,
          ops: [...zustand.ops],
          raum: zustand.raum,
          negativ: zustand.negativ,
          einsetzen: zustand.einsetzen,
          strafe: zustand.strafe,
        },
      }),
    };
  }

  // ---------- Formatierung ----------
  function fmtZeitMs(ms) {
    const sek = ms / 1000;
    if (sek < 60) return `${sek.toFixed(1).replace('.', ',')} s`;
    const min = Math.floor(sek / 60);
    const rest = (sek % 60).toFixed(1).padStart(4, '0').replace('.', ',');
    return `${min}:${rest}`;
  }

  function fmtErgebnisWert(art, wert) {
    if (art === 'zeit') return `${wert} ${wert === 1 ? 'Punkt' : 'Punkte'}`;
    return fmtZeitMs(wert);
  }

  function reorder(container, orderedNodes) {
    const move = Object.hasOwn(Element.prototype, 'moveBefore')
      ? (node) => container.moveBefore(node, null)
      : (node) => container.append(node);
    for (const node of orderedNodes) move(node);
  }

  function reorderMitTransition(wrapper, tbody, orderedNodes) {
    const update = () => reorder(tbody, orderedNodes);
    if (orderedNodes.length > 150) {
      update();
      return;
    }
    if (wrapper && wrapper.startViewTransition) {
      wrapper.startViewTransition(update);
    } else if (document.startViewTransition) {
      document.startViewTransition(update);
    } else {
      update();
    }
  }

  // ---------- Beamer-Rendering ----------
  function qrCodeRendern(url) {
    const kasten = $('#beamer-qr');
    if (!kasten || typeof qrcode === 'undefined') return;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      kasten.innerHTML = qr.createSvgTag(8, 16);
    } catch (e) {
      kasten.textContent = url;
    }
  }

  function stationRendern(st) {
    if (!st) return;
    aktuelleStation = st;
    stationCode = st.code;

    $('#beamer-titel').textContent = st.titel;
    $('#beamer-code').textContent = st.code;
    const teilnahmeUrl = `${location.origin}/?tdot=${st.code}`;
    $('#beamer-url').textContent = `${location.host}/?tdot=${st.code}`;
    qrCodeRendern(teilnahmeUrl);

    const statusBadge = $('#beamer-status');
    statusBadge.textContent = st.aktiv ? '🟢 Aktiv' : '⏸️ Pausiert';
    statusBadge.classList.toggle('pausiert', !st.aktiv);
    $('#beamer-pause-overlay').classList.toggle('versteckt', st.aktiv);

    const pauseBtn = $('#btn-tdot-pause');
    pauseBtn.textContent = st.aktiv ? '⏸️ Pausieren' : '▶️ Aktivieren';
    pauseBtn.className = `knopf klein leitung-nur ${st.aktiv ? 'grau' : 'gruen'}`;

    const e = st.einstellungen;
    const badges = [
      e.modus === 'sprache' ? '🎤 Sprechen' : '⌨️ Tippen',
      e.art === 'zeit'
        ? `⏱️ ${e.minuten} ${e.minuten === 1 ? 'Minute' : 'Minuten'}`
        : `🔢 ${e.anzahl} Aufgaben`,
      Aufgaben.opsText(e.ops, e.raum, e.negativ),
    ];
    if (e.einsetzen) badges.push('🧩 Einsetzen');
    const infoBox = $('#beamer-info');
    infoBox.innerHTML = '';
    badges.forEach((text) => {
      const sp = document.createElement('span');
      sp.className = 'tdot-badge';
      sp.textContent = text;
      infoBox.appendChild(sp);
    });

    $('#beamer-wertung-hinweis').textContent = e.art === 'zeit'
      ? 'Meiste Punkte gewinnen (−1 Punkt je 4 Fehler)'
      : (e.strafe > 0
        ? `Schnellste Zeit gewinnt (+${e.strafe} s Strafzeit je Fehler)`
        : 'Schnellste Zeit gewinnt');
  }

  function zelleTextSetzen(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function zeileErstellen(eintrag) {
    const tr = document.createElement('tr');
    tr.className = 'tdot-zeile';
    tr.dataset.id = String(eintrag.id);

    const tdPlatz = document.createElement('td');
    tdPlatz.className = 'tdot-platz-zelle';

    const thSpieler = document.createElement('th');
    thSpieler.scope = 'row';
    const spielerWrap = document.createElement('span');
    spielerWrap.className = 'tdot-spieler-zelle';
    const em = document.createElement('span');
    em.className = 'tdot-spieler-emoji';
    const nm = document.createElement('span');
    spielerWrap.append(em, nm);
    thSpieler.appendChild(spielerWrap);

    const tdWert = document.createElement('td');
    tdWert.className = 'tdot-wert-zelle';

    const tdDetails = document.createElement('td');
    tdDetails.className = 'tdot-details-zelle';
    const detailsText = document.createElement('span');
    const versucheBadge = document.createElement('span');
    versucheBadge.className = 'tdot-versuche-badge';
    tdDetails.append(detailsText, versucheBadge);

    const tdAktion = document.createElement('td');
    tdAktion.className = 'spalte-aktion';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tdot-entfernen-btn';
    btn.title = 'Eintrag entfernen';
    btn.setAttribute('aria-label', 'Eintrag entfernen');
    btn.textContent = '✕';
    btn.addEventListener('click', () => eintragEntfernen(eintrag.id));
    tdAktion.appendChild(btn);

    tr.append(tdPlatz, thSpieler, tdWert, tdDetails, tdAktion);
    tr._refs = { tdPlatz, em, nm, tdWert, detailsText, versucheBadge, btn };
    return tr;
  }

  function listeAktualisieren(liste, gesamt, rundenGesamt, neuInfo = null) {
    const art = (aktuelleStation && aktuelleStation.einstellungen.art) || 'aufgaben';
    $('#beamer-spieler-zahl').textContent = `${gesamt} ${gesamt === 1 ? 'Mitspieler' : 'Mitspieler'}`;
    $('#beamer-runden-zahl').textContent = `${rundenGesamt} ${rundenGesamt === 1 ? 'Runde' : 'Runden'}`;

    const leer = !liste || liste.length === 0;
    $('#tdot-leer').classList.toggle('versteckt', !leer);
    $('#tdot-tabelle-wrap').classList.toggle('versteckt', leer);

    const tbody = $('#tdot-tbody');
    const wrapper = $('#tdot-tabelle-wrap');
    const gueltigeIds = new Set((liste || []).map((x) => x.id));

    for (const [id, tr] of zeilenMap.entries()) {
      if (!gueltigeIds.has(id)) {
        tr.remove();
        zeilenMap.delete(id);
      }
    }

    if (leer) {
      $('#tdot-status').textContent = 'Highscoreliste ist leer.';
      return;
    }

    const geordneteZeilen = [];
    liste.forEach((x) => {
      let tr = zeilenMap.get(x.id);
      if (!tr) {
        tr = zeileErstellen(x);
        zeilenMap.set(x.id, tr);
      }

      const r = tr._refs;
      const platzText = ['🥇', '🥈', '🥉'][x.platz - 1] || `${x.platz}.`;
      zelleTextSetzen(r.tdPlatz, platzText);
      zelleTextSetzen(r.em, x.emoji);
      zelleTextSetzen(r.nm, x.name);
      r.btn.setAttribute('aria-label', `${x.name} entfernen`);
      zelleTextSetzen(r.tdWert, fmtErgebnisWert(art, x.wert));
      zelleTextSetzen(r.detailsText, `✅ ${x.richtig}${x.falsch ? ` · ❌ ${x.falsch}` : ''}`);
      if (x.versuche > 1) {
        versucheBadgeZeigen(r.versucheBadge, `${x.versuche}×`);
      } else {
        versucheBadgeZeigen(r.versucheBadge, '');
      }

      tr.classList.toggle('platz-1', x.platz === 1);
      tr.classList.toggle('platz-2', x.platz === 2);
      tr.classList.toggle('platz-3', x.platz === 3);
      geordneteZeilen.push(tr);
    });

    reorderMitTransition(wrapper, tbody, geordneteZeilen);

    if (neuInfo) {
      $('#tdot-status').textContent = `${neuInfo.name} auf Platz ${neuInfo.platz}, ${gesamt} Einträge`;
      const tr = zeilenMap.get(neuInfo.id);
      if (tr) {
        tr.classList.remove('neu-highlight');
        void tr.offsetWidth;
        tr.classList.add('neu-highlight');
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => tr.classList.remove('neu-highlight'), 2400);
      }
      if (tonAn && typeof Ton !== 'undefined') {
        if (neuInfo.platz === 1 && neuInfo.verbessert) Ton.jubel();
        else if (neuInfo.verbessert) Ton.richtig();
      }
    } else {
      $('#tdot-status').textContent = `${gesamt} Einträge in der Highscoreliste`;
    }
  }

  function versucheBadgeZeigen(el, text) {
    el.textContent = text;
    el.classList.toggle('versteckt', !text);
  }

  // ---------- SSE & API ----------
  function sseVerbinden(code, schluessel) {
    if (eventSource) eventSource.close();
    const param = schluessel ? `?s=${encodeURIComponent(schluessel)}` : '';
    eventSource = new EventSource(`/api/tdot/${code}/ereignisse${param}`);

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
      document.body.classList.toggle('ist-zuschauer', rolle !== 'leitung');
      stationRendern(daten.station);
      zeigeScreen('screen-beamer');
      listeAktualisieren(daten.liste, daten.gesamt, daten.rundenGesamt);
    });

    eventSource.addEventListener('update', (ev) => {
      const daten = JSON.parse(ev.data);
      listeAktualisieren(daten.liste, daten.gesamt, daten.rundenGesamt, daten.neu || null);
    });

    eventSource.addEventListener('station', (ev) => {
      const daten = JSON.parse(ev.data);
      stationRendern(daten.station);
      listeAktualisieren(daten.liste, daten.gesamt, daten.rundenGesamt);
    });

    eventSource.addEventListener('beendet', () => {
      if (eventSource) eventSource.close();
      storageLoeschen();
      alert('Diese Station wurde beendet.');
      location.href = '/offene-tuer';
    });
  }

  async function apiAufruf(pfad, methode, body) {
    const h = {};
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (leitungSchluessel) h.Authorization = `Bearer ${leitungSchluessel}`;
    const res = await fetch(pfad, {
      method: methode,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.fehler || `Fehler ${res.status}`);
    return j;
  }

  async function eintragEntfernen(id) {
    if (rolle !== 'leitung' || !stationCode) return;
    if (!confirm('Diesen Eintrag aus der Highscoreliste entfernen?')) return;
    try {
      await apiAufruf(`/api/tdot/${stationCode}/eintraege/${id}`, 'DELETE');
    } catch (err) {
      alert(err.message);
    }
  }

  // ---------- Initialisierung ----------
  async function appStarten() {
    const setupCtrl = formularController({
      root: $('#setup-form'),
      titelInput: $('#tdot-titel'),
      laengeEl: $('#tdot-laenge'),
      wenigerBtn: $('#tdot-weniger'),
      mehrBtn: $('#tdot-mehr'),
      strafeBox: $('#tdot-strafe-box'),
      strafeSelect: $('#tdot-strafe'),
      fehlerEl: $('#setup-fehler'),
      initial: { modus: 'schrift', art: 'aufgaben', anzahl: 10, minuten: 1, ops: ['+'], raum: 10, negativ: false, einsetzen: false, strafe: 3 },
    });

    const editDialog = $('#dialog-einstellungen');
    let editAusgangsSettings = null;
    const editCtrl = formularController({
      root: $('#edit-form'),
      titelInput: $('#edit-titel'),
      laengeEl: $('#edit-laenge'),
      wenigerBtn: $('#edit-weniger'),
      mehrBtn: $('#edit-mehr'),
      strafeBox: $('#edit-strafe-box'),
      strafeSelect: $('#edit-strafe'),
      fehlerEl: $('#edit-fehler'),
      initial: { modus: 'schrift', art: 'aufgaben', anzahl: 10, minuten: 1, ops: ['+'], raum: 10, negativ: false, einsetzen: false, strafe: 3 },
      onChange: () => {
        if (!editAusgangsSettings) return;
        const aktuell = editCtrl.lesen().einstellungen;
        const geaendert = JSON.stringify(aktuell) !== JSON.stringify(editAusgangsSettings);
        if (geaendert) $('#edit-liste-leeren').checked = true;
      },
    });

    $('#btn-tdot-aktivieren').addEventListener('click', async () => {
      const btn = $('#btn-tdot-aktivieren');
      const errBox = $('#setup-fehler');
      errBox.textContent = '';
      btn.disabled = true;
      try {
        if (typeof Ton !== 'undefined') Ton.init();
        const daten = setupCtrl.lesen();
        const erg = await apiAufruf('/api/tdot', 'POST', daten);
        stationCode = erg.code;
        leitungSchluessel = erg.leitung;
        rolle = 'leitung';
        storageSpeichern({ code: stationCode, leitung: leitungSchluessel });
        location.hash = `#${stationCode}`;
        sseVerbinden(stationCode, leitungSchluessel);
      } catch (err) {
        errBox.textContent = `❌ ${err.message}`;
      }
      btn.disabled = false;
    });

    $('#btn-tdot-pause').addEventListener('click', async () => {
      if (!aktuelleStation || rolle !== 'leitung') return;
      try {
        await apiAufruf(`/api/tdot/${stationCode}`, 'PATCH', { aktiv: !aktuelleStation.aktiv });
      } catch (err) {
        alert(err.message);
      }
    });

    $('#btn-tdot-leeren').addEventListener('click', async () => {
      if (rolle !== 'leitung' || !stationCode) return;
      if (!confirm('Wirklich alle Einträge aus der Highscoreliste löschen?')) return;
      try {
        await apiAufruf(`/api/tdot/${stationCode}/eintraege`, 'DELETE');
      } catch (err) {
        alert(err.message);
      }
    });

    $('#btn-tdot-beenden').addEventListener('click', async () => {
      if (rolle !== 'leitung' || !stationCode) return;
      if (!confirm('Station „Tag der offenen Tür“ wirklich beenden? Die Highscoreliste wird gelöscht.')) return;
      try {
        await apiAufruf(`/api/tdot/${stationCode}`, 'DELETE');
        storageLoeschen();
        location.hash = '';
        location.href = '/offene-tuer';
      } catch (err) {
        alert(err.message);
      }
    });

    $('#btn-tdot-einstellungen').addEventListener('click', () => {
      if (!aktuelleStation || rolle !== 'leitung') return;
      editAusgangsSettings = {
        ...aktuelleStation.einstellungen,
        ops: [...(aktuelleStation.einstellungen.ops || ['+'])],
      };
      editCtrl.setzen(aktuelleStation.einstellungen, aktuelleStation.titel);
      $('#edit-liste-leeren').checked = false;
      editDialog.showModal();
    });

    $('#btn-edit-schliessen').addEventListener('click', () => editDialog.close());
    $('#btn-edit-abbrechen').addEventListener('click', () => editDialog.close());
    $('#btn-edit-speichern').addEventListener('click', async () => {
      const btn = $('#btn-edit-speichern');
      $('#edit-fehler').textContent = '';
      btn.disabled = true;
      try {
        const daten = editCtrl.lesen();
        daten.listeLeeren = $('#edit-liste-leeren').checked;
        await apiAufruf(`/api/tdot/${stationCode}`, 'PATCH', daten);
        editDialog.close();
      } catch (err) {
        $('#edit-fehler').textContent = `❌ ${err.message}`;
      }
      btn.disabled = false;
    });

    $('#btn-tdot-ton').addEventListener('click', () => {
      if (typeof Ton !== 'undefined') Ton.init();
      tonAn = !tonAn;
      const b = $('#btn-tdot-ton');
      b.textContent = tonAn ? '🔊' : '🔇';
      b.title = tonAn ? 'Ton aus' : 'Ton an';
      b.setAttribute('aria-label', b.title);
      if (tonAn && typeof Ton !== 'undefined') Ton.klick();
    });

    $('#btn-tdot-vollbild').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    $('#btn-tdot-kopieren').addEventListener('click', async () => {
      if (!stationCode) return;
      const url = `${location.origin}/?tdot=${stationCode}`;
      const btn = $('#btn-tdot-kopieren');
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = '✅ Kopiert';
        setTimeout(() => { btn.textContent = '🔗 Link kopieren'; }, 1800);
      } catch (e) {
        prompt('Link zum Mitspielen:', url);
      }
    });

    // Routing beim Laden
    const hash = location.hash.replace(/^#/, '').trim().toUpperCase();
    const zuschauer = location.search.includes('zuschauen') || location.search.includes('beamer');
    const gespeichert = storageLaden();

    if (/^[2-9A-HJ-NP-Z]{4}$/.test(hash)) {
      stationCode = hash;
      if (gespeichert && gespeichert.code === stationCode && gespeichert.leitung) {
        leitungSchluessel = gespeichert.leitung;
        sseVerbinden(stationCode, leitungSchluessel);
      } else if (zuschauer) {
        sseVerbinden(stationCode, null);
      } else {
        location.replace(`/?tdot=${stationCode}`);
      }
      return;
    }

    if (gespeichert && gespeichert.code && gespeichert.leitung) {
      try {
        await apiAufruf(`/api/tdot/${gespeichert.code}`, 'GET');
        stationCode = gespeichert.code;
        leitungSchluessel = gespeichert.leitung;
        location.hash = `#${stationCode}`;
        sseVerbinden(stationCode, leitungSchluessel);
        return;
      } catch (e) {
        storageLoeschen();
      }
    }

    zeigeScreen('screen-einrichten');
  }

  window.addEventListener('DOMContentLoaded', appStarten);
})();
