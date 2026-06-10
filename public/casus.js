// ── CASUSBESPREKING ───────────────────────────────────────────

function renderCasus() {
  const el = document.getElementById('casus-content');
  if (!el) return;
  const casussen = window.D.casussen || [];
  const filter = window.casusFilter || 'alle';

  let lijst = casussen;
  if (filter === 'open') lijst = casussen.filter(c => !c.opgelost);
  else if (filter === 'opgelost') lijst = casussen.filter(c => c.opgelost);
  else if (filter === 'mijne') lijst = casussen.filter(c => c.door === window.user);
  else if (filter === 'vergadering') lijst = casussen.filter(c => c.bespreek);

  el.innerHTML = `
    <div class="toolbar" style="margin-bottom:14px">
      <div class="filters">
        <button class="fbtn ${filter==='alle'?'active':''}" onclick="setCasusFilter('alle',this)">Alle</button>
        <button class="fbtn ${filter==='open'?'active':''}" onclick="setCasusFilter('open',this)">🔍 Open</button>
        <button class="fbtn ${filter==='opgelost'?'active':''}" onclick="setCasusFilter('opgelost',this)">✅ Opgelost</button>
        <button class="fbtn ${filter==='mijne'?'active':''}" onclick="setCasusFilter('mijne',this)">👤 Van mij</button>
        <button class="fbtn ${filter==='vergadering'?'active':''}" onclick="setCasusFilter('vergadering',this)">📌 Vergadering</button>
      </div>
      <button class="btn btn-p" onclick="openCasusModal()">＋ Casus toevoegen</button>
    </div>

    ${lijst.length === 0 ? `
      <div class="empty">
        <div class="empty-icon">🐾</div>
        <h3>Geen casussen</h3>
        <p>Voeg een interessante of lastige casus toe om te bespreken met het team.</p>
      </div>` :
      lijst.map(c => {
        const reacties = c.reacties || [];
        const soortKleur = {vraag:'#EEF4FF',leermoment:'#EAF3DE',urgent:'#FDF0EF',interessant:'#FDF3E7'}[c.soort] || '#F8F9FA';
        const soortTxt = {vraag:'❓ Vraag',leermoment:'💡 Leermoment',urgent:'🔴 Urgent',interessant:'🐾 Interessant'}[c.soort] || c.soort;
        return `
        <div class="casus-card ${c.opgelost?'opgelost':''}" id="cas-${c.id}">
          <div class="casus-top">
            <div style="flex:1">
              <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:5px">
                <span style="font-size:14px;font-weight:600;color:var(--gray-800)">${c.titel}</span>
                <span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;background:${soortKleur}">${soortTxt}</span>
                ${c.opgelost ? '<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;background:var(--green-light);color:var(--green)">✅ Opgelost</span>' : ''}
                ${c.bespreek ? '<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:20px;background:#EEF4FF;color:#1E40AF">📌 Vergadering</span>' : ''}
              </div>
              <div style="font-size:13px;color:var(--gray-600);line-height:1.6;margin-bottom:7px">${c.beschrijving}</div>
              ${c.diersoort ? `<div style="font-size:12px;color:var(--gray-500)">🐾 ${c.diersoort}${c.leeftijd?' · '+c.leeftijd:''}${c.ras?' · '+c.ras:''}</div>` : ''}
              <div style="font-size:11px;color:var(--gray-400);margin-top:4px">Door ${c.door||'?'} · ${c.op||'?'} · ${reacties.length} reactie${reacties.length!==1?'s':''}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
              <button class="ibtn" onclick="toggleCasusVergadering('${c.id}')" title="${c.bespreek?'Verwijder uit vergadering':'Markeer voor vergadering'}">📌</button>
              <button class="ibtn" onclick="toggleOpgelost('${c.id}')" title="${c.opgelost?'Heropenen':'Markeer als opgelost'}">${c.opgelost?'↩️':'✅'}</button>
              ${c.door===window.user?`<button class="ibtn" onclick="delCasus('${c.id}')">🗑️</button>`:''}
            </div>
          </div>

          <!-- REACTIES -->
          <div class="casus-reacties" id="cr-${c.id}">
            ${reacties.map(r => `
              <div class="comment">
                <div class="cav">${(r.door||'?')[0]}</div>
                <div class="cbody">
                  <div class="cname">${r.door} <span class="ctime">· ${r.op}</span></div>
                  <div class="ctext">${r.tekst}</div>
                </div>
              </div>`).join('')}
            <div class="cadd">
              <input type="text" id="ri-${c.id}" placeholder="Reactie of antwoord..." onkeydown="if(event.key==='Enter')addCasusReactie('${c.id}')">
              <button onclick="addCasusReactie('${c.id}')">Stuur</button>
            </div>
          </div>
        </div>`;
      }).join('')
    }
  `;
}

function setCasusFilter(f, btn) {
  window.casusFilter = f;
  renderCasus();
}

function openCasusModal(id) {
  window.editCasusId = id || null;
  const c = id ? (window.D.casussen||[]).find(x=>x.id===id) : null;
  document.getElementById('cm-titel').value = c ? c.titel : '';
  document.getElementById('cm-soort').value = c ? c.soort : 'vraag';
  document.getElementById('cm-beschrijving').value = c ? c.beschrijving : '';
  document.getElementById('cm-diersoort').value = c ? c.diersoort||'' : '';
  document.getElementById('cm-leeftijd').value = c ? c.leeftijd||'' : '';
  document.getElementById('cm-ras').value = c ? c.ras||'' : '';
  document.getElementById('casus-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('cm-titel').focus(), 50);
}

async function saveCasus() {
  const titel = document.getElementById('cm-titel').value.trim();
  if (!titel) { window.toast('⚠️ Vul een titel in'); return; }
  if (!window.D.casussen) window.D.casussen = [];
  const oud = window.editCasusId ? window.D.casussen.find(c=>c.id===window.editCasusId) : null;
  const casus = {
    id: window.editCasusId || window.uid(),
    titel,
    soort: document.getElementById('cm-soort').value,
    beschrijving: document.getElementById('cm-beschrijving').value.trim(),
    diersoort: document.getElementById('cm-diersoort').value.trim(),
    leeftijd: document.getElementById('cm-leeftijd').value.trim(),
    ras: document.getElementById('cm-ras').value.trim(),
    door: oud ? oud.door : (window.user||'onbekend'),
    op: oud ? oud.op : window.vandaag(),
    opgelost: oud ? oud.opgelost : false,
    bespreek: oud ? oud.bespreek : false,
    reacties: oud ? oud.reacties||[] : []
  };
  if (window.editCasusId) window.D.casussen = window.D.casussen.map(c=>c.id===window.editCasusId?casus:c);
  else window.D.casussen.unshift(casus);
  document.getElementById('casus-modal').style.display = 'none';
  await window.sla('🐾 Casus opgeslagen');
}

async function delCasus(id) {
  if (!confirm('Casus verwijderen?')) return;
  window.D.casussen = (window.D.casussen||[]).filter(c=>c.id!==id);
  await window.sla();
}

async function toggleOpgelost(id) {
  const c = (window.D.casussen||[]).find(x=>x.id===id);
  if (c) { c.opgelost = !c.opgelost; await window.sla(c.opgelost?'✅ Casus opgelost':'↩️ Heropend'); }
}

async function toggleCasusVergadering(id) {
  const c = (window.D.casussen||[]).find(x=>x.id===id);
  if (c) { c.bespreek = !c.bespreek; await window.sla(c.bespreek?'📌 Gemarkeerd voor vergadering':'📌 Markering verwijderd'); }
}

async function addCasusReactie(id) {
  if (!window.user) { window.toast('⚠️ Kies eerst je naam'); return; }
  const inp = document.getElementById('ri-'+id);
  const tekst = inp.value.trim(); if (!tekst) return;
  const c = (window.D.casussen||[]).find(x=>x.id===id); if (!c) return;
  if (!c.reacties) c.reacties = [];
  c.reacties.push({ id:window.uid(), door:window.user, tekst, op:window.vandaag() });
  inp.value = '';
  await window.sla('💬 Reactie toegevoegd');
}

window.renderCasus = renderCasus;
window.setCasusFilter = setCasusFilter;
window.openCasusModal = openCasusModal;
window.saveCasus = saveCasus;
window.delCasus = delCasus;
window.toggleOpgelost = toggleOpgelost;
window.toggleCasusVergadering = toggleCasusVergadering;
window.addCasusReactie = addCasusReactie;
