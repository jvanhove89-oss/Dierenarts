
// ── VERGADERMODULE ────────────────────────────────────────────
// Persoonlijke punten: localStorage (alleen jij ziet ze)
// Gedeelde punten: server (iedereen ziet ze)

function getPersoneelKey() {
  return 'verg-persoonlijk-' + (window.user || 'anon');
}

function getPersoonlijkePunten() {
  try {
    return JSON.parse(localStorage.getItem(getPersoneelKey()) || '[]');
  } catch(e) { return []; }
}

function savePersoonlijkePunten(punten) {
  localStorage.setItem(getPersoneelKey(), JSON.stringify(punten));
}

function renderVergadering() {
  const el = document.getElementById('verg-content');
  if (!el) return;
  const verg = window.D.vergadering || {};
  const gedeeld = verg.agenda || [];
  const persoonlijk = getPersoonlijkePunten();
  const archief = window.D.vergaderingArchief || [];

  // Verzamelde punten van taken (gedeeld)
  const vanTaken = (window.D.taken || []).filter(t => t.bespreek).map(t => ({
    id: 'taak-' + t.id, tekst: t.naam, type: 'taak', taakId: t.id,
    door: t.bespreekDoor || t.verant || '?', ts: t.bespreekTs || 0, afgevinkt: false
  }));

  const alleGedeeld = [
    ...gedeeld,
    ...vanTaken.filter(vt => !gedeeld.find(a => a.id === vt.id))
  ].sort((a,b) => (a.ts||0) - (b.ts||0));

  const status = verg.status || 'voorbereiding';
  const statusLabel = {
    voorbereiding: '🗂️ Voorbereiding',
    bezig: '▶️ Bezig',
    afgerond: '✅ Afgerond'
  }[status];

  el.innerHTML = `
    <div class="verg-header">
      <div>
        <div class="verg-status-badge">${statusLabel}</div>
        <div style="font-size:13px;color:var(--gray-500);margin-top:4px">
          ${verg.datum ? '📅 ' + window.fmtD(verg.datum) : 'Nog geen datum'}
          ${verg.locatie ? '· 📍 ' + verg.locatie : ''}
        </div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        ${status === 'voorbereiding' ? `
          <button class="btn btn-s" onclick="openVergSetup()">⚙️ Instellen</button>
          <button class="btn btn-p" onclick="startVergadering()">▶️ Start vergadering</button>` : ''}
        ${status === 'bezig' ? `
          <button class="btn btn-p" onclick="sluitVergadering()">✅ Afsluiten</button>` : ''}
        ${status === 'afgerond' ? `
          <button class="btn btn-s" onclick="downloadVerslag()">📄 Verslag</button>
          <button class="btn btn-p" onclick="nieuweVergadering()">🔄 Nieuwe vergadering</button>` : ''}
      </div>
    </div>

    ${status === 'bezig' ? `<div class="banner bw2" style="margin-bottom:12px">▶️ <div>Vergadering is bezig. Vink punten af, noteer beslissingen en actiepunten.</div></div>` : ''}
    ${status === 'afgerond' ? `<div class="banner bg2" style="margin-bottom:12px">✅ <div>Vergadering afgerond. <a href="#" onclick="downloadVerslag()" style="color:inherit;font-weight:600">📄 Verslag downloaden</a></div></div>` : ''}

    <!-- AANWEZIGHEID -->
    <div class="verg-section">
      <div class="verg-section-title">👥 Aanwezigen</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        ${(window.D.namen || ['Karen','Alexandra','Sylvie','Andere']).map(n => {
          const aan = (verg.aanwezig || []).includes(n);
          return `<button class="verg-person-btn ${aan ? 'aan' : ''}" onclick="toggleAanwezig('${n}')">${n}</button>`;
        }).join('')}
      </div>
    </div>

    <!-- PERSOONLIJKE PUNTEN (alleen zichtbaar voor jezelf) -->
    ${window.user ? `
    <div class="verg-section" style="border-color:#7C3AED33;background:var(--purple-light)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:7px">
        <div>
          <div class="verg-section-title" style="margin-bottom:2px;color:var(--purple)">🔒 Jouw persoonlijke punten</div>
          <div style="font-size:11px;color:var(--purple);opacity:.8">Alleen jij ziet deze punten — niemand anders</div>
        </div>
        ${status !== 'afgerond' ? `
        <div style="display:flex;gap:6px">
          <button class="btn" style="padding:5px 11px;font-size:12px;background:var(--purple);color:white;border:none" onclick="openAgendaPunt('persoonlijk')">＋ Persoonlijk punt</button>
          ${persoonlijk.length && status !== 'bezig' ? `<button class="btn btn-s" style="font-size:12px;padding:5px 11px" onclick="inbrengenModal()">👥 Inbrengen in vergadering</button>` : ''}
          ${persoonlijk.length && status === 'bezig' ? `<button class="btn btn-p" style="font-size:12px;padding:5px 11px" onclick="inbrengenModal()">👥 Nu inbrengen</button>` : ''}
        </div>` : ''}
      </div>
      ${persoonlijk.length === 0 ? `
        <div style="font-size:13px;color:var(--purple);opacity:.7;padding:8px 0">
          Nog geen persoonlijke punten. Voeg punten toe die je wil bespreken — ze blijven privé tot jij ze inbrengt.
        </div>` :
        persoonlijk.map(p => `
          <div class="agenda-item" style="background:white;border-color:#C4B5FD">
            <div style="display:flex;align-items:flex-start;gap:8px">
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">${p.tekst}</div>
                <div style="font-size:11px;color:var(--gray-500)">${p.prioriteit ? {hoog:'🔴 Hoog',normaal:'🟡 Normaal',laag:'🟢 Laag'}[p.prioriteit] : ''}</div>
              </div>
              <button class="ibtn" onclick="delPersoonlijk('${p.id}')">🗑️</button>
            </div>
          </div>`).join('')
      }
    </div>` : `
    <div class="verg-section" style="border-color:#7C3AED33">
      <div class="verg-section-title" style="color:var(--purple)">🔒 Persoonlijke punten</div>
      <div style="font-size:13px;color:var(--gray-500)">Kies je naam bovenaan om persoonlijke punten te zien en toe te voegen.</div>
    </div>`}

    <!-- GEDEELDE AGENDA -->
    <div class="verg-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:7px">
        <div>
          <div class="verg-section-title" style="margin-bottom:2px">👥 Gedeelde agenda (${alleGedeeld.length} punten)</div>
          <div style="font-size:11px;color:var(--gray-500)">Zichtbaar voor het hele team</div>
        </div>
        ${status !== 'afgerond' ? `<button class="btn btn-p" style="padding:5px 11px;font-size:12px" onclick="openAgendaPunt('gedeeld')">＋ Gedeeld punt</button>` : ''}
      </div>
      ${alleGedeeld.length === 0 ? `
        <div class="empty" style="padding:16px">
          <div class="empty-icon">📋</div>
          <p>Nog geen gedeelde punten. Voeg een gedeeld punt toe, of breng persoonlijke punten in.</p>
        </div>` :
        alleGedeeld.map((item, i) => `
        <div class="agenda-item ${item.afgevinkt ? 'afgevinkt' : ''}" id="ai-${item.id}">
          <div style="display:flex;align-items:flex-start;gap:9px">
            ${status === 'bezig' ? `<input type="checkbox" style="margin-top:3px;width:15px;height:15px;accent-color:var(--navy);cursor:pointer;flex-shrink:0" ${item.afgevinkt?'checked':''} onchange="toggleAgendaItem('${item.id}',this.checked)">` :
              `<span style="font-size:12px;font-weight:600;color:var(--gray-500);min-width:18px;flex-shrink:0">${i+1}.</span>`}
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600">${item.tekst}</div>
              <div style="font-size:11px;color:var(--gray-500)">
                ${item.type === 'taak' ? '🔗 Van takenbord · ' : ''}Door ${item.door}
                ${item.prioriteit ? ' · ' + {hoog:'🔴 Hoog',normaal:'🟡 Normaal',laag:'🟢 Laag'}[item.prioriteit] : ''}
              </div>
              ${item.beslissing ? `<div style="margin-top:5px;background:var(--green-light);border-radius:6px;padding:5px 8px;font-size:12px;color:#145A3A">✅ ${item.beslissing}</div>` : ''}
              ${item.actiepunt ? `<div style="margin-top:4px;background:var(--blue-light);border-radius:6px;padding:5px 8px;font-size:12px;color:#1E40AF">📌 ${item.actiepunt}${item.actiepuntVoor ? ' → ' + item.actiepuntVoor : ''}</div>` : ''}
              ${status === 'bezig' && item.afgevinkt ? `
                <div style="margin-top:7px;display:flex;gap:6px;flex-wrap:wrap">
                  <input type="text" placeholder="Beslissing..." value="${item.beslissing||''}"
                    style="flex:1;min-width:130px;padding:5px 8px;border:1px solid var(--gray-300);border-radius:5px;font-size:12px;font-family:inherit"
                    onchange="updateAgendaItem('${item.id}','beslissing',this.value)">
                  <input type="text" placeholder="Actiepunt..." value="${item.actiepunt||''}"
                    style="flex:1;min-width:130px;padding:5px 8px;border:1px solid var(--gray-300);border-radius:5px;font-size:12px;font-family:inherit"
                    onchange="updateAgendaItem('${item.id}','actiepunt',this.value)">
                  <select onchange="updateAgendaItem('${item.id}','actiepuntVoor',this.value)"
                    style="padding:5px 8px;border:1px solid var(--gray-300);border-radius:5px;font-size:12px;font-family:inherit">
                    <option value="">Voor wie?</option>
                    ${(window.D.namen||['Karen','Alexandra','Sylvie','Andere']).map(n=>`<option value="${n}" ${item.actiepuntVoor===n?'selected':''}>${n}</option>`).join('')}
                  </select>
                </div>` : ''}
            </div>
            ${status !== 'afgerond' ? `<button class="ibtn" onclick="verwijderAgendaItem('${item.id}')">🗑️</button>` : ''}
          </div>
        </div>`).join('')
      }
    </div>

    <!-- NOTITIES -->
    <div class="verg-section">
      <div class="verg-section-title">📝 Gedeelde notities</div>
      ${status !== 'afgerond' ?
        `<textarea id="verg-notities" placeholder="Vrije notities tijdens het overleg..."
          style="width:100%;padding:9px 11px;border:1px solid var(--gray-300);border-radius:7px;font-family:inherit;font-size:13px;min-height:80px;resize:vertical"
          onchange="updateNotities(this.value)">${verg.notities||''}</textarea>` :
        `<div style="font-size:13px;white-space:pre-wrap;padding:6px 0">${verg.notities||'Geen notities.'}</div>`
      }
    </div>

    <!-- ARCHIEF -->
    ${archief.length ? `
    <div class="verg-section">
      <div class="verg-section-title" style="cursor:pointer" onclick="toggleArchief()">
        📚 Vorige vergaderingen (${archief.length}) <span id="arch-arrow">▼</span>
      </div>
      <div id="archief-list" style="display:none">
        ${archief.slice().reverse().map(v => `
          <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:10px 13px;margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <div style="font-size:13px;font-weight:600">📅 ${window.fmtD(v.datum||'')} ${v.locatie?'· '+v.locatie:''}</div>
              <div style="font-size:11px;color:var(--gray-500)">${(v.aanwezig||[]).join(', ')}</div>
            </div>
            <div style="font-size:12px;color:var(--gray-500);margin-top:3px">
              ${(v.agenda||[]).length} punten · ${(v.agenda||[]).filter(a=>a.actiepunt).length} actiepunten
            </div>
          </div>`).join('')}
      </div>
    </div>` : ''}
  `;
}

// ── PERSOONLIJKE PUNTEN ───────────────────────────────────────
function delPersoonlijk(id) {
  const punten = getPersoonlijkePunten().filter(p => p.id !== id);
  savePersoonlijkePunten(punten);
  renderVergadering();
}

function inbrengenModal() {
  const punten = getPersoonlijkePunten();
  if (!punten.length) { window.toast('Geen persoonlijke punten om in te brengen'); return; }
  const el = document.getElementById('inbrengen-lijst');
  el.innerHTML = punten.map(p => `
    <div class="agenda-item" style="display:flex;align-items:center;gap:9px">
      <input type="checkbox" id="ib-${p.id}" checked style="width:15px;height:15px;accent-color:var(--navy);cursor:pointer;flex-shrink:0">
      <label for="ib-${p.id}" style="font-size:13px;cursor:pointer;flex:1">${p.tekst}</label>
    </div>`).join('');
  document.getElementById('inbrengen-modal').style.display = 'flex';
}

async function bevestigInbrengen() {
  const punten = getPersoonlijkePunten();
  const geselecteerd = punten.filter(p => {
    const cb = document.getElementById('ib-' + p.id);
    return cb && cb.checked;
  });
  const behouden = punten.filter(p => {
    const cb = document.getElementById('ib-' + p.id);
    return cb && !cb.checked;
  });

  if (!geselecteerd.length) { window.toast('⚠️ Selecteer minstens één punt'); return; }

  if (!window.D.vergadering) window.D.vergadering = {};
  if (!window.D.vergadering.agenda) window.D.vergadering.agenda = [];

  geselecteerd.forEach(p => {
    window.D.vergadering.agenda.push({
      id: window.uid(), tekst: p.tekst,
      prioriteit: p.prioriteit, type: 'vrij',
      door: window.user || 'onbekend',
      ts: Date.now(), afgevinkt: false
    });
  });

  savePersoonlijkePunten(behouden);
  document.getElementById('inbrengen-modal').style.display = 'none';
  await window.sla(`👥 ${geselecteerd.length} punt${geselecteerd.length !== 1 ? 'en' : ''} ingebracht`);
}

// ── AGENDA MODALS ─────────────────────────────────────────────
let agendaType = 'gedeeld';

function openAgendaPunt(type) {
  agendaType = type || 'gedeeld';
  const isPers = agendaType === 'persoonlijk';
  document.getElementById('ap-modal-title').textContent = isPers ? '🔒 Persoonlijk agendapunt' : '👥 Gedeeld agendapunt';
  document.getElementById('ap-modal-sub').textContent = isPers
    ? 'Alleen jij ziet dit punt — tot jij het zelf inbrengt.'
    : 'Dit punt is meteen zichtbaar voor het hele team.';
  document.getElementById('ap-tekst').value = '';
  document.getElementById('ap-prioriteit').value = 'normaal';
  document.getElementById('agenda-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('ap-tekst').focus(), 50);
}

async function saveAgendaPunt() {
  const tekst = document.getElementById('ap-tekst').value.trim();
  if (!tekst) { window.toast('⚠️ Vul een agendapunt in'); return; }

  if (agendaType === 'persoonlijk') {
    const punten = getPersoonlijkePunten();
    punten.push({
      id: window.uid(), tekst,
      prioriteit: document.getElementById('ap-prioriteit').value,
      ts: Date.now()
    });
    savePersoonlijkePunten(punten);
    document.getElementById('agenda-modal').style.display = 'none';
    window.toast('🔒 Persoonlijk punt opgeslagen');
    renderVergadering();
  } else {
    if (!window.D.vergadering) window.D.vergadering = {};
    if (!window.D.vergadering.agenda) window.D.vergadering.agenda = [];
    window.D.vergadering.agenda.push({
      id: window.uid(), tekst,
      prioriteit: document.getElementById('ap-prioriteit').value,
      type: 'vrij', door: window.user || 'onbekend',
      ts: Date.now(), afgevinkt: false
    });
    document.getElementById('agenda-modal').style.display = 'none';
    await window.sla('📋 Agendapunt toegevoegd');
  }
}

// ── VERGADERING SETUP ─────────────────────────────────────────
function openVergSetup() {
  if (!window.D.vergadering) window.D.vergadering = {};
  document.getElementById('vs-datum').value = window.D.vergadering.datum || new Date().toISOString().split('T')[0];
  document.getElementById('vs-locatie').value = window.D.vergadering.locatie || '';
  document.getElementById('verg-setup-modal').style.display = 'flex';
}

async function saveVergSetup() {
  if (!window.D.vergadering) window.D.vergadering = {};
  window.D.vergadering.datum = document.getElementById('vs-datum').value;
  window.D.vergadering.locatie = document.getElementById('vs-locatie').value.trim();
  document.getElementById('verg-setup-modal').style.display = 'none';
  await window.sla('📅 Vergadering ingesteld');
}

async function startVergadering() {
  if (!window.D.vergadering) window.D.vergadering = {};
  window.D.vergadering.status = 'bezig';
  window.D.vergadering.startTijd = Date.now();
  await window.sla('▶️ Vergadering gestart');
}

async function sluitVergadering() {
  if (!confirm('Vergadering afsluiten? Actiepunten worden automatisch taken.')) return;
  const verg = window.D.vergadering || {};
  const agenda = verg.agenda || [];

  let n = 0;
  agenda.filter(a => a.actiepunt).forEach(a => {
    if (!window.D.taken) window.D.taken = [];
    window.D.taken.unshift({
      id: window.uid(), naam: a.actiepunt, status: 'waiting',
      verant: a.actiepuntVoor || '', cat: 'opvolging',
      opmerking: 'Actiepunt vergadering ' + window.fmtD(verg.datum || ''),
      door: window.user || 'vergadering', op: window.vandaag(),
      subtaken: [], comments: [], overdracht: false
    });
    n++;
  });

  window.D.taken = (window.D.taken || []).map(t => ({ ...t, bespreek: false, bespreekDoor: null }));

  if (!window.D.vergaderingArchief) window.D.vergaderingArchief = [];
  window.D.vergaderingArchief.push({ ...verg, status: 'afgerond', eindTijd: Date.now() });
  window.D.vergadering = { status: 'afgerond', ...verg };

  await window.sla(`✅ Vergadering afgesloten · ${n} taak${n !== 1 ? 'en' : ''} aangemaakt`);
}

async function nieuweVergadering() {
  if (!confirm('Nieuwe vergadering starten? De huidige wordt gearchiveerd.')) return;
  window.D.vergadering = { status: 'voorbereiding', agenda: [], aanwezig: [], notities: '' };
  await window.sla('🔄 Nieuwe vergadering gestart');
}

async function toggleAanwezig(naam) {
  if (!window.D.vergadering) window.D.vergadering = {};
  if (!window.D.vergadering.aanwezig) window.D.vergadering.aanwezig = [];
  const idx = window.D.vergadering.aanwezig.indexOf(naam);
  if (idx >= 0) window.D.vergadering.aanwezig.splice(idx, 1);
  else window.D.vergadering.aanwezig.push(naam);
  await window.sla();
}

async function verwijderAgendaItem(id) {
  if (!window.D.vergadering) return;
  window.D.vergadering.agenda = (window.D.vergadering.agenda || []).filter(a => a.id !== id);
  await window.sla();
}

async function toggleAgendaItem(id, val) {
  const item = (window.D.vergadering?.agenda || []).find(a => a.id === id);
  if (item) { item.afgevinkt = val; await window.sla(); }
}

async function updateAgendaItem(id, veld, val) {
  const item = (window.D.vergadering?.agenda || []).find(a => a.id === id);
  if (item) { item[veld] = val; await window.sla(); }
}

async function updateNotities(val) {
  if (!window.D.vergadering) window.D.vergadering = {};
  window.D.vergadering.notities = val;
  await window.sla();
}

async function markeerBespreek(taakId) {
  if (!window.user) { window.toast('⚠️ Kies eerst je naam'); return; }
  const taak = (window.D.taken || []).find(t => t.id === taakId);
  if (!taak) return;
  taak.bespreek = !taak.bespreek;
  taak.bespreekDoor = taak.bespreek ? window.user : null;
  taak.bespreekTs = taak.bespreek ? Date.now() : null;
  await window.sla(taak.bespreek ? '📌 Gemarkeerd voor vergadering' : '📌 Markering verwijderd');
}

function downloadVerslag() {
  const verg = window.D.vergadering || {};
  const agenda = verg.agenda || [];
  let t = `VERGADERVERSLAG\n${'═'.repeat(40)}\n`;
  t += `Datum: ${window.fmtD(verg.datum||'')}\n`;
  if (verg.locatie) t += `Locatie: ${verg.locatie}\n`;
  t += `Aanwezig: ${(verg.aanwezig||[]).join(', ')||'—'}\n\n`;
  t += `AGENDA & BESLISSINGEN\n${'─'.repeat(40)}\n`;
  agenda.forEach((a,i) => {
    t += `${i+1}. ${a.tekst}\n`;
    if (a.beslissing) t += `   ✅ Beslissing: ${a.beslissing}\n`;
    if (a.actiepunt) t += `   📌 Actie: ${a.actiepunt}${a.actiepuntVoor?' → '+a.actiepuntVoor:''}\n`;
  });
  if (verg.notities) t += `\nNOTITIES\n${'─'.repeat(40)}\n${verg.notities}\n`;
  const acties = agenda.filter(a => a.actiepunt);
  if (acties.length) {
    t += `\nACTIEPUNTEN\n${'─'.repeat(40)}\n`;
    acties.forEach(a => { t += `• ${a.actiepunt}${a.actiepuntVoor?' ('+a.actiepuntVoor+')':''}\n`; });
  }
  const blob = new Blob([t], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`verslag-${verg.datum||'vergadering'}.txt`;
  a.click(); URL.revokeObjectURL(url);
}

function toggleArchief() {
  const el = document.getElementById('archief-list');
  const arr = document.getElementById('arch-arrow');
  if (el.style.display==='none'){el.style.display='block';arr.textContent='▲';}
  else{el.style.display='none';arr.textContent='▼';}
}

// Expose
window.renderVergadering = renderVergadering;
window.openVergSetup = openVergSetup;
window.saveVergSetup = saveVergSetup;
window.startVergadering = startVergadering;
window.sluitVergadering = sluitVergadering;
window.nieuweVergadering = nieuweVergadering;
window.toggleAanwezig = toggleAanwezig;
window.openAgendaPunt = openAgendaPunt;
window.saveAgendaPunt = saveAgendaPunt;
window.verwijderAgendaItem = verwijderAgendaItem;
window.toggleAgendaItem = toggleAgendaItem;
window.updateAgendaItem = updateAgendaItem;
window.updateNotities = updateNotities;
window.markeerBespreek = markeerBespreek;
window.downloadVerslag = downloadVerslag;
window.toggleArchief = toggleArchief;
window.inbrengenModal = inbrengenModal;
window.bevestigInbrengen = bevestigInbrengen;
window.delPersoonlijk = delPersoonlijk;
