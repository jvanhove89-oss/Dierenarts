// ── PERSOONLIJK DAGBOEKJE ─────────────────────────────────────
// Volledig lokaal — opgeslagen in localStorage, nooit naar server

function getDagboekKey() {
  return 'dagboek-' + (window.user || 'anon');
}

function getDagboekItems() {
  try { return JSON.parse(localStorage.getItem(getDagboekKey()) || '[]'); }
  catch(e) { return []; }
}

function saveDagboekItems(items) {
  localStorage.setItem(getDagboekKey(), JSON.stringify(items));
}

function renderDagboek() {
  const el = document.getElementById('dagboek-content');
  if (!el) return;

  if (!window.user) {
    el.innerHTML = `<div class="dagboek-lock">
      <div style="font-size:40px;margin-bottom:10px">🔒</div>
      <h3>Persoonlijk dagboekje</h3>
      <p>Kies je naam bovenaan om je dagboekje te openen.<br>Niemand anders kan jouw notities zien.</p>
    </div>`;
    return;
  }

  const items = getDagboekItems();
  const filter = window.dagboekFilter || 'alle';
  let lijst = items;
  if (filter === 'notitie') lijst = items.filter(i=>i.type==='notitie');
  else if (filter === 'reflectie') lijst = items.filter(i=>i.type==='reflectie');
  else if (filter === 'idee') lijst = items.filter(i=>i.type==='idee');
  else if (filter === 'todo') lijst = items.filter(i=>i.type==='todo');

  const typeKleur = {notitie:'#EEF4FF',reflectie:'#F5F3FF',idee:'#FDF3E7',todo:'#EAF3DE'};
  const typeTxt = {notitie:'📝 Notitie',reflectie:'💭 Reflectie',idee:'💡 Idee',todo:'☑️ To-do'};
  const typeIcoon = {notitie:'📝',reflectie:'💭',idee:'💡',todo:'☑️'};

  el.innerHTML = `
    <div style="background:var(--purple-light);border:1px solid #C4B5FD;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <div style="font-size:20px">🔒</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--purple)">Alleen voor ${window.user}</div>
        <div style="font-size:12px;color:var(--purple);opacity:.8">Deze notities staan alleen op dit toestel. Niemand anders kan ze zien.</div>
      </div>
    </div>

    <!-- SCHRIJFVENSTER -->
    <div class="dagboek-compose">
      <div style="display:flex;gap:7px;margin-bottom:9px;flex-wrap:wrap">
        ${Object.keys(typeTxt).map(t => `
          <button class="dagboek-type-btn ${(window.dagboekNieuwType||'notitie')===t?'active':''}"
            onclick="setDagboekType('${t}')" style="background:${typeKleur[t]}">
            ${typeTxt[t]}
          </button>`).join('')}
      </div>
      <textarea id="dagboek-input" placeholder="${
        (window.dagboekNieuwType||'notitie')==='reflectie' ? 'Hoe was het vandaag? Wat wil je onthouden?' :
        (window.dagboekNieuwType||'notitie')==='idee' ? 'Een idee voor de praktijk of het team...' :
        (window.dagboekNieuwType||'notitie')==='todo' ? 'Iets wat je niet wil vergeten...' :
        'Schrijf hier je notitie...'
      }" style="width:100%;min-height:80px;padding:9px 11px;border:1px solid var(--gray-300);border-radius:7px;font-family:inherit;font-size:13px;resize:vertical;margin-bottom:8px"></textarea>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-p" onclick="saveDagboek()">💾 Opslaan</button>
      </div>
    </div>

    <!-- FILTERS -->
    <div class="filters" style="margin-bottom:12px">
      <button class="fbtn ${filter==='alle'?'active':''}" onclick="setDagboekFilter('alle')">Alle</button>
      ${Object.keys(typeTxt).map(t => `
        <button class="fbtn ${filter===t?'active':''}" onclick="setDagboekFilter('${t}')">${typeTxt[t]}</button>`).join('')}
    </div>

    <!-- ITEMS -->
    ${lijst.length === 0 ? `
      <div class="empty">
        <div class="empty-icon">${typeIcoon[filter]||'📓'}</div>
        <h3>Nog niets geschreven</h3>
        <p>Dit is jouw privé ruimte. Noteer wat je wil — niemand kan het zien.</p>
      </div>` :
      lijst.map(item => `
        <div class="dagboek-item" style="border-left:3px solid ${typeKleur[item.type]?typeKleur[item.type].replace('F','D'):'#CBD5E0'}">
          <div style="display:flex;align-items:flex-start;gap:8px">
            <div style="flex:1">
              <div style="font-size:11px;font-weight:600;color:var(--gray-500);margin-bottom:4px">
                ${typeTxt[item.type]||item.type} · ${item.datum||'?'}${item.tijd?' om '+item.tijd:''}
              </div>
              <div style="font-size:13px;color:var(--gray-800);line-height:1.6;white-space:pre-wrap">${item.tekst}</div>
            </div>
            <button class="ibtn" onclick="delDagboek('${item.id}')" title="Verwijderen">🗑️</button>
          </div>
        </div>`).join('')
    }

    ${items.length > 0 ? `
    <div style="text-align:center;margin-top:16px">
      <button class="btn btn-s" style="font-size:12px" onclick="exportDagboek()">📥 Exporteren als tekst</button>
    </div>` : ''}
  `;
}

function setDagboekType(t) {
  window.dagboekNieuwType = t;
  renderDagboek();
}

function setDagboekFilter(f) {
  window.dagboekFilter = f;
  renderDagboek();
}

function saveDagboek() {
  const tekst = document.getElementById('dagboek-input').value.trim();
  if (!tekst) { window.toast('⚠️ Schrijf eerst iets'); return; }
  const items = getDagboekItems();
  const nu = new Date();
  items.unshift({
    id: window.uid(),
    type: window.dagboekNieuwType || 'notitie',
    tekst,
    datum: window.vandaag(),
    tijd: nu.toLocaleTimeString('nl-BE', {hour:'2-digit',minute:'2-digit'})
  });
  saveDagboekItems(items);
  window.toast('💾 Opgeslagen');
  renderDagboek();
}

function delDagboek(id) {
  if (!confirm('Notitie verwijderen?')) return;
  const items = getDagboekItems().filter(i => i.id !== id);
  saveDagboekItems(items);
  renderDagboek();
}

function exportDagboek() {
  const items = getDagboekItems();
  const typeTxt = {notitie:'Notitie',reflectie:'Reflectie',idee:'Idee',todo:'To-do'};
  let tekst = `DAGBOEKJE VAN ${(window.user||'').toUpperCase()}\n${'═'.repeat(40)}\n\n`;
  items.forEach(i => {
    tekst += `[${typeTxt[i.type]||i.type}] ${i.datum||''}${i.tijd?' om '+i.tijd:''}\n`;
    tekst += `${i.tekst}\n\n`;
  });
  const blob = new Blob([tekst], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`dagboek-${window.user||'mijn'}.txt`;
  a.click(); URL.revokeObjectURL(url);
}

window.renderDagboek = renderDagboek;
window.setDagboekType = setDagboekType;
window.setDagboekFilter = setDagboekFilter;
window.saveDagboek = saveDagboek;
window.delDagboek = delDagboek;
window.exportDagboek = exportDagboek;
