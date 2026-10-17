// Admin-Seite: alles per fetch auf /admin/api, Texte immer über textContent (Namen kommen von Kindern).
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const OP = { '+': '+', '-': '−', '*': '·', '/': ':' };
  const ART = { zehn: '10 Aufgaben', a20: '20 Aufgaben', m1: '1 Minute', m5: '5 Minuten' };
  const SPIELE = { flappy: 'Flattervogel', snake: 'Apfelschlange', bloecke: 'Farbblöcke', tierturm: 'Tierturm', schrauben: 'Schrauben', unblock: 'Ausparken' };
  let daten = { spieler: [], codes: [], gruppen: [] };
  let offen = null; // Spieler in der Detailansicht

  async function api(methode, pfad, body) {
    const r = await fetch(`api/${pfad}`, {
      method: methode,
      headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && pfad !== 'login') { zeigeLogin(); throw new Error('abgemeldet'); }
    if (!r.ok) throw new Error(j.fehler || `Fehler ${r.status}`);
    return j;
  }

  let meldungTimer = null;
  function meldung(text, fehler = false) {
    const m = $('#meldung');
    m.textContent = text;
    m.classList.toggle('fehler', fehler);
    m.classList.add('sichtbar');
    clearTimeout(meldungTimer);
    meldungTimer = setTimeout(() => m.classList.remove('sichtbar'), 3000);
  }
  const versuch = (fn) => async (...a) => {
    try { await fn(...a); } catch (err) { if (err.message !== 'abgemeldet') meldung(err.message, true); }
  };

  function el(tag, text, klasse) {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (klasse) e.className = klasse;
    return e;
  }
  function zeile(zellen) {
    const tr = document.createElement('tr');
    zellen.forEach((z) => {
      const td = document.createElement('td');
      if (z instanceof Node) td.appendChild(z);
      else if (z && typeof z === 'object') { td.textContent = z.text; if (z.klasse) td.className = z.klasse; } else td.textContent = z ?? '';
      tr.appendChild(td);
    });
    return tr;
  }
  function wann(t) {
    if (!t) return '–';
    const d = new Date(t);
    const heute = new Date();
    const zeit = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === heute.toDateString()) return `heute ${zeit}`;
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear() !== heute.getFullYear() ? d.getFullYear() : ''} ${zeit}`;
  }
  const fmt = (sek) => `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`;
  const zahl = (n) => ({ text: String(n ?? 0), klasse: 'zahl' });

  // ---------- Login ----------
  function zeigeLogin() {
    $('#haupt').classList.add('versteckt');
    $('#login').classList.remove('versteckt');
    $('#passwort').value = '';
    $('#passwort').focus();
  }
  $('#login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('#login-fehler').textContent = '';
    try {
      await api('POST', 'login', { passwort: $('#passwort').value });
      $('#login').classList.add('versteckt');
      start();
    } catch (err) { $('#login-fehler').textContent = err.message; }
  });
  $('#abmelden').addEventListener('click', versuch(async () => { await api('POST', 'logout'); zeigeLogin(); }));

  // ---------- Tabs ----------
  function tab(name) {
    $$('.tabs button').forEach((b) => b.classList.toggle('an', b.dataset.tab === name));
    $$('[data-bereich]').forEach((s) => s.classList.toggle('versteckt', s.dataset.bereich !== name));
    if (name === 'rekorde') versuch(rekordeLaden)();
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));

  // ---------- Übersicht ----------
  async function laden() {
    daten = await api('GET', 'uebersicht');
    gruppenAuswahl();
    spielerZeigen();
    codesZeigen();
    gruppenZeigen();
  }

  // Auswahllisten mit den Gruppen füllen; der gewählte Wert bleibt erhalten
  function optionen(select, erste) {
    const alt = select.value;
    select.innerHTML = '';
    erste.forEach(([wert, text]) => select.appendChild(new Option(text, wert)));
    daten.gruppen.forEach((g) => select.appendChild(new Option(g.name, String(g.id))));
    if ([...select.options].some((o) => o.value === alt)) select.value = alt;
  }
  function gruppenAuswahl() {
    $$('.gruppen-filter').forEach((sel) => optionen(sel, [['', 'Alle'], ['0', 'ohne Gruppe']]));
    optionen($('#code-gruppe'), [['', '– keine –']]);
    optionen($('#d-gruppe'), [['', '– keine –']]);
  }
  // Filterwert: '' = alle, '0' = ohne Gruppe, sonst Gruppen-Id
  const passt = (filter, gruppeId) => filter === '' || String(gruppeId || 0) === filter;
  $('#spieler-filter').addEventListener('change', () => spielerZeigen());
  $('#rekorde-filter').addEventListener('change', versuch(() => rekordeLaden()));

  function gruppenZeigen() {
    const tb = $('#gruppen-tabelle tbody');
    tb.innerHTML = '';
    if (!daten.gruppen.length) { tb.appendChild(zeile([{ text: 'Noch keine Gruppen.', klasse: 'leise' }])); return; }
    daten.gruppen.forEach((g) => {
      const knoepfe = el('div', null, 'knoepfe');
      const um = el('button', 'Umbenennen', 'knopf leise klein');
      um.addEventListener('click', versuch(async () => {
        const neu = prompt('Neuer Name der Gruppe:', g.name);
        if (!neu || neu === g.name) return;
        await api('PATCH', `gruppen/${g.id}`, { name: neu });
        await laden();
      }));
      const weg = el('button', 'Löschen', 'knopf leise klein');
      weg.addEventListener('click', versuch(async () => {
        if (!confirm(`Gruppe „${g.name}" löschen? Die ${g.spieler} Spieler bleiben, sind dann aber ohne Gruppe.`)) return;
        await api('DELETE', `gruppen/${g.id}`);
        await laden();
      }));
      const zeigen = el('button', 'Spieler zeigen', 'knopf leise klein');
      zeigen.addEventListener('click', () => { $('#spieler-filter').value = String(g.id); spielerZeigen(); tab('spieler'); });
      knoepfe.append(zeigen, um, weg);
      tb.appendChild(zeile([{ text: g.name, klasse: 'fett' }, zahl(g.spieler), knoepfe]));
    });
  }
  $('#gruppe-form').addEventListener('submit', versuch(async (ev) => {
    ev.preventDefault();
    const g = await api('POST', 'gruppen', { name: $('#gruppe-name').value });
    $('#gruppe-name').value = '';
    meldung(`Gruppe „${g.name}" angelegt`);
    await laden();
  }));

  function spielerZeigen() {
    const tb = $('#spieler-tabelle tbody');
    tb.innerHTML = '';
    $('#spieler-leer').classList.toggle('versteckt', daten.spieler.length > 0);
    const filter = $('#spieler-filter').value;
    daten.spieler.filter((s) => passt(filter, s.gruppe_id)).forEach((s) => {
      const name = el('button', `${s.emoji} ${s.name}`, 'link');
      name.addEventListener('click', versuch(() => detailOeffnen(s.id)));
      const quote = s.richtig + s.falsch ? Math.round((s.richtig / (s.richtig + s.falsch)) * 100) : null;
      const tr = zeile([
        name, s.gruppe || '–', s.notiz || '', zahl(s.rechnen), zahl(s.rechnen7), zahl(s.rechnenHeute), zahl(s.spiele),
        { text: quote === null ? '–' : `${quote} %`, klasse: 'zahl' }, wann(s.zuletzt),
        el('span', s.gesperrt ? 'gesperrt' : 'aktiv', `marke ${s.gesperrt ? 'rot' : 'gruen'}`),
        el('span', `seit ${wann(s.erstellt)}`, 'leise'),
      ]);
      if (offen === s.id) tr.classList.add('gewaehlt');
      tb.appendChild(tr);
    });
  }

  function codesZeigen() {
    const tb = $('#codes-tabelle tbody');
    tb.innerHTML = '';
    if (!daten.codes.length) { tb.appendChild(zeile([{ text: 'Noch keine Codes.', klasse: 'leise' }])); return; }
    daten.codes.forEach((c) => {
      let status;
      if (c.used_at) status = el('span', `eingelöst ${wann(c.used_at)}${c.name ? ` von ${c.emoji} ${c.name}` : ''}`, 'marke gruen');
      else if (c.widerrufen) status = el('span', 'widerrufen', 'marke grau');
      else status = el('span', 'offen', 'marke gelb');
      let aktion = '';
      if (!c.used_at && !c.widerrufen) {
        aktion = el('button', 'Widerrufen', 'knopf leise klein');
        aktion.addEventListener('click', versuch(async () => {
          if (!confirm(`Code …${c.ende} widerrufen? Er kann dann nicht mehr eingelöst werden.`)) return;
          await api('DELETE', `codes/${c.id}`);
          await laden();
        }));
      }
      tb.appendChild(zeile([{ text: `RH-…-${c.ende}`, klasse: 'mono' }, c.gruppe || '–', c.notiz, wann(c.erstellt), status, aktion]));
    });
  }

  $('#codes-form').addEventListener('submit', versuch(async (ev) => {
    ev.preventDefault();
    const r = await api('POST', 'codes', { anzahl: Number($('#anzahl').value), notiz: $('#notiz').value, gruppeId: Number($('#code-gruppe').value) || null });
    $('#neue-codes-liste').textContent = r.codes.join('\n');
    $('#neue-codes').classList.remove('versteckt');
    $('#notiz').value = '';
    await laden();
  }));
  $('#kopieren').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#neue-codes-liste').textContent);
      meldung('Kopiert');
    } catch (err) { meldung('Kopieren ging nicht – bitte markieren', true); }
  });

  // ---------- Spieler-Detail ----------
  async function detailOeffnen(id) {
    const s = daten.spieler.find((x) => x.id === id);
    if (!s) return;
    offen = id;
    const r = await api('GET', `spieler/${id}/runden`);
    $('#detail-titel').textContent = `${s.emoji} ${s.name}`;
    $('#d-sperren').textContent = s.gesperrt ? 'Entsperren' : 'Sperren';
    $('#d-gruppe').value = s.gruppe_id ? String(s.gruppe_id) : '';

    const box = $('#tage');
    box.innerHTML = '';
    const max = Math.max(1, ...r.tage.map((t) => t.rechnen + t.spiel));
    r.tage.forEach((t) => {
      const spalte = el('div', null, 'tag');
      const [, m, d] = t.tag.split('-');
      spalte.title = `${Number(d)}.${Number(m)}.: ${t.rechnen} Rechenrunden, ${t.spiel} Minispiele`;
      const saeule = el('div', null, 'saeule');
      const sp = el('div', null, 'teil spiel');
      sp.style.height = `${(t.spiel / max) * 100}%`;
      const re = el('div', null, 'teil rechnen');
      re.style.height = `${(t.rechnen / max) * 100}%`;
      saeule.append(sp, re);
      spalte.append(saeule, el('span', t.rechnen + t.spiel ? String(t.rechnen + t.spiel) : '', 'n'), el('span', `${Number(d)}.`, 'datum'));
      box.appendChild(spalte);
    });

    const tb = $('#runden-tabelle tbody');
    tb.innerHTML = '';
    if (!r.runden.length) tb.appendChild(zeile([{ text: 'Noch keine Runden.', klasse: 'leise' }]));
    r.runden.forEach((x) => {
      if (x.typ === 'spiel') {
        tb.appendChild(zeile([wann(x.datum), `🎮 ${SPIELE[x.spiel] || x.spiel}`, '', '', '', '', '']));
        return;
      }
      const art = `${x.modus === 'sprache' ? '🎤' : '⌨️'} ${x.art === 'aufgaben' ? `${x.laenge} Aufgaben` : `${x.laenge} Min`}`;
      const ops = `${[...x.ops].map((o) => OP[o]).join(' ')} bis ${x.raum}${x.einsetzen ? ' (E)' : ''}`;
      tb.appendChild(zeile([wann(x.datum), art, ops, zahl(x.richtig), zahl(x.falsch),
        { text: x.art === 'aufgaben' ? fmt(x.zeit) : '', klasse: 'zahl' }, zahl(x.sterne)]));
    });
    $('#detail').classList.remove('versteckt');
    spielerZeigen();
    $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const aktuell = () => daten.spieler.find((x) => x.id === offen);
  $('#d-zu').addEventListener('click', () => { offen = null; $('#detail').classList.add('versteckt'); spielerZeigen(); });
  $('#d-umbenennen').addEventListener('click', versuch(async () => {
    const s = aktuell();
    const neu = prompt('Neuer Spitzname (1–16 Buchstaben/Ziffern):', s.name);
    if (!neu || neu === s.name) return;
    await api('PATCH', `spieler/${s.id}`, { name: neu });
    await laden();
    await detailOeffnen(s.id);
  }));
  $('#d-gruppe').addEventListener('change', versuch(async () => {
    const s = aktuell();
    await api('PATCH', `spieler/${s.id}`, { gruppeId: Number($('#d-gruppe').value) || null });
    await laden();
    meldung('Gruppe geändert');
  }));
  $('#d-sperren').addEventListener('click', versuch(async () => {
    const s = aktuell();
    await api('PATCH', `spieler/${s.id}`, { gesperrt: !s.gesperrt });
    await laden();
    await detailOeffnen(s.id);
    meldung(s.gesperrt ? 'Entsperrt' : 'Gesperrt – erscheint nicht mehr in der Bestenliste');
  }));
  $('#d-rekorde').addEventListener('click', versuch(async () => {
    const s = aktuell();
    if (!confirm(`Alle Online-Rekorde von ${s.name} löschen?`)) return;
    const r = await api('DELETE', `spieler/${s.id}/rekorde`);
    meldung(`${r.geloescht} Rekorde gelöscht`);
    await laden();
  }));
  $('#d-loeschen').addEventListener('click', versuch(async () => {
    const s = aktuell();
    if (!confirm(`${s.name} mit allen Rekorden und Runden endgültig löschen? Das Gerät kann sich danach nur mit einem neuen Code wieder verbinden.`)) return;
    await api('DELETE', `spieler/${s.id}`);
    offen = null;
    $('#detail').classList.add('versteckt');
    await laden();
  }));

  // ---------- Bestenliste ----------
  function keyText(k) {
    const [modus, art, ops, raum, e] = k.split('|');
    return `${modus === 'sprache' ? '🎤' : '⌨️'} ${ART[art] || art} · ${[...ops].map((o) => OP[o]).join(' ')} bis ${raum}${e ? ' · Einsetzen' : ''}`;
  }
  async function rekordeLaden() {
    const r = await api('GET', 'rekorde');
    const gruppen = {};
    const filter = $('#rekorde-filter').value;
    r.rekorde.filter((x) => passt(filter, x.gruppe_id)).forEach((x) => { (gruppen[x.key] = gruppen[x.key] || []).push(x); });
    const box = $('#rekorde-liste');
    box.innerHTML = '';
    if (!Object.keys(gruppen).length) { box.appendChild(el('p', 'Noch keine Rekorde.', 'leise')); return; }
    Object.keys(gruppen).sort().forEach((key) => {
      const art = key.split('|')[1];
      const klein = art === 'zehn' || art === 'a20';
      const liste = gruppen[key].sort((a, b) => (klein ? a.wert - b.wert : b.wert - a.wert) || a.datum - b.datum);
      const karte = el('div', null, 'karte');
      karte.appendChild(el('h3', keyText(key)));
      const ol = el('ol', null, 'rangliste');
      liste.forEach((x) => {
        const li = el('li', null, x.gesperrt ? 'gesperrt' : '');
        li.append(el('span', `${x.emoji} ${x.name}${x.gesperrt ? ' (gesperrt)' : ''}`), el('span', klein ? fmt(x.wert) : `${x.wert} Punkte`, 'mono'), el('span', wann(x.datum), 'leise'));
        ol.appendChild(li);
      });
      karte.appendChild(ol);
      box.appendChild(karte);
    });
  }

  // ---------- Start ----------
  async function start() {
    $('#haupt').classList.remove('versteckt');
    await laden();
  }
  (async () => {
    try {
      await api('GET', 'ich');
      await start();
    } catch (err) { if (err.message !== 'abgemeldet') meldung(err.message, true); }
  })();
  // Beim Zurückkehren auf den Tab frisch laden
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !$('#haupt').classList.contains('versteckt')) versuch(laden)();
  });
})();
