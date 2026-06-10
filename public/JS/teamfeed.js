// ── TEAMFEED ──────────────────────────────────────────────────
function renderFeed() {
  const el = document.getElementById('feed-list');
  if (!el) return;
  const items = (window.D.feed || []).slice().sort((a,b) => b.ts - a.ts);
  if (!items.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">💬</div><h3>Nog geen berichten</h3><p>Post een kort bericht voor het team.</p></div>`;
    return;
  }
  const now = Date.now();
  el.innerHTML = items.map(m => {
    const age = Math.floor((now - m.ts) / 60000);
    const ageStr = age < 1 ? 'Net nu' : age < 60 ? age + ' min geleden' : age < 1440 ? Math.floor(age/60) + 'u geleden' : Math.floor(age/1440) + 'd geleden';
    const isOld = age > (window.D.feedDays || 7) * 1440;
    const pinned = m.pinned ? '<span style="color:var(--amber);margin-right:4px">📌</span>' : '';
    const tagCls = {info:'feed-tag-info', urgent:'feed-tag-urgent', vraag:'feed-tag-vraag', fyi:'feed-tag-fyi'}[m.tag] || 'feed-tag-fyi';
    const tagLbl = {info:'ℹ️ Info', urgent:'🔴 Urgent', vraag:'❓ Vraag', fyi:'💬 FYI'}[m.tag] || '💬';
    return `<div class="feed-card ${isOld ? 'feed-old' : ''}" id="fm-${m.id}">
      <div class="feed-top">
        <div class="feed-av">${(m.door||'?')[0]}</div>
        <div class="feed-body">
          <div class="feed-meta">${pinned}<strong>${m.door||'?'}</strong> <span class="feed-tag ${tagCls}">${tagLbl}</span> <span class="feed-time">${ageStr}</span></div>
          <div class="feed-text">${m.tekst}</div>
          ${m.taakId ? `<div class="feed-link" onclick="linkToTask('${m.taakId}')">🔗 Gekoppelde taak bekijken</div>` : ''}
        </div>
        <div style="display:flex;gap:3px;flex-shrink:0">
          <button class="ibtn" onclick="togglePin('${m.id}')" title="${m.pinned?'Losmaken':'Vastpinnen'}">${m.pinned?'📌':'📍'}</button>
          ${m.door === window.user ? `<button class="ibtn" onclick="delFeed('${m.id}')">🗑️</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function openFeedModal(taakId) {
  document.getElementById('fm-taakid').value = taakId || '';
  document.getElementById('fm-tekst').value = '';
  document.getElementById('fm-tag').value = 'fyi';
  document.getElementById('feed-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('fm-tekst').focus(), 50);
}

async function saveFeed() {
  const tekst = document.getElementById('fm-tekst').value.trim();
  if (!tekst) { window.toast('⚠️ Schrijf een bericht'); return; }
  if (!window.user) { window.toast('⚠️ Kies eerst je naam'); return; }
  if (!window.D.feed) window.D.feed = [];
  window.D.feed.unshift({
    id: window.uid(), tekst,
    tag: document.getElementById('fm-tag').value,
    taakId: document.getElementById('fm-taakid').value || null,
    door: window.user, ts: Date.now(), pinned: false
  });
  // Auto-cleanup: verwijder berichten ouder dan feedDays
  const maxAge = (window.D.feedDays || 7) * 24 * 60 * 60 * 1000;
  window.D.feed = window.D.feed.filter(m => Date.now() - m.ts < maxAge);
  document.getElementById('feed-modal').style.display = 'none';
  await window.sla('💬 Bericht geplaatst');
}

async function delFeed(id) {
  window.D.feed = (window.D.feed || []).filter(m => m.id !== id);
  await window.sla();
}

async function togglePin(id) {
  const m = (window.D.feed || []).find(x => x.id === id);
  if (m) { m.pinned = !m.pinned; await window.sla(m.pinned ? '📌 Vastgepind' : '📍 Losgemaakt'); }
}

function linkToTask(taakId) {
  document.querySelectorAll('.ntab')[0].click();
  setTimeout(() => {
    const el = document.getElementById('tc-' + taakId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
}

window.renderFeed = renderFeed;
window.openFeedModal = openFeedModal;
window.saveFeed = saveFeed;
window.delFeed = delFeed;
window.togglePin = togglePin;
window.linkToTask = linkToTask;
