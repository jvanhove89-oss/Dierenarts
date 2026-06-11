// ── VETERINAIRE RADAR ─────────────────────────────────────────
// Wekelijks nieuws + weer + klinische signalen via Claude AI + web search

const RADAR_CACHE_KEY = 'vet-radar-cache';
const RADAR_CACHE_TTL = 2 * 24 * 60 * 60 * 1000; // 2 dagen (3x/week)

async function renderRadar() {
  const el = document.getElementById('radar-content');
  if (!el) return;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--navy)">Veterinaire Radar</h2>
        <p style="font-size:13px;color:var(--gray-500);margin-top:2px">Wekelijks overzicht — Vlaanderen & sector</p>
      </div>

    </div>
    <div id="radar-body">
      <div class="radar-loading">
        <div class="radar-spinner"></div>
        <p>Nieuws ophalen uit veterinaire bronnen...</p>
      </div>
    </div>`;

  await laadRadar(false);
}

async function laadRadar(forceer) {
  const body = document.getElementById('radar-body');
  if (!body) return;

  // Check cache
  if (!forceer) {
    const cached = loadRadarCache();
    if (cached) {
      renderRadarContent(cached);
      return;
    }
  }

  // Toon loading
  body.innerHTML = `
    <div class="radar-loading">
      <div class="radar-spinner"></div>
      <p>Veterinaire bronnen raadplegen — 3x per week bijgewerkt...<br><span style="font-size:12px;color:var(--gray-400)">DGZ · AMCRA · VILT · SAVAB · internationale vakpers</span></p>
    </div>`;



  try {
    const result = await fetchRadarViaAI();
    saveRadarCache(result);
    renderRadarContent(result);
  } catch(e) {
    body.innerHTML = `<div class="radar-error">⚠️ Kon geen verbinding maken met de nieuwsbronnen. Probeer later opnieuw.<br><small>${e.message}</small></div>`;
  }

}

async function fetchRadarViaAI() {
  const vandaag = new Date().toLocaleDateString('nl-BE', {day:'2-digit', month:'long', year:'numeric'});
  const maand = new Date().toLocaleDateString('nl-BE', {month:'long'});
  const jaar = new Date().getFullYear();

  const prompt = `Je bent een veterinaire nieuwsanalist voor een Vlaamse dierenartspraktijk (gezelschapsdieren: honden, katten). 
Vandaag is het ${vandaag}. De praktijk is gevestigd in Tessenderlo, België.

Zoek naar het MEEST RECENTE nieuws (laatste 2 weken) uit deze bronnen:
- dgz.be (Dierengezondheidszorg Vlaanderen)  
- amcra.be (antibioticabeleid)
- vilt.be (landbouw en dier)
- favv.be (voedselveiligheid en dierengezondheid)
- SAVAB (Vlaamse kleine dierenartsen)
- veterinary forums en internationale vaktijdschriften (VetRecord, JAVMA, Veterinary Times)
- r/veterinary en andere professionele fora

Geef een professioneel overzicht voor dierenartsen. GEEN basisinformatie die elke dierenarts al kent.
Focus op:
1. ACTUELE uitbraken, waarschuwingen of ongewone klinische trends in België/Vlaanderen
2. Nieuwe regelgeving of protocollen die een praktijk raken
3. Klinisch relevante signalen die collega's deze week melden (afwijkingen van het normale patroon)
4. Relevante sectorontwikkelingen (niet algemeen maar specifiek actueel)

Antwoord ENKEL in dit JSON-formaat, niets anders:
{
  "gegenereerd_op": "${vandaag}",
  "bronnen_geraadpleegd": ["lijst van bronnen die je effectief hebt geraadpleegd"],
  "secties": [
    {
      "type": "waarschuwing|nieuws|klinisch|regelgeving|sector",
      "urgentie": "hoog|medium|laag",
      "titel": "Korte pakkende titel (max 10 woorden)",
      "inhoud": "2-3 zinnen. Concreet, professioneel, geen basisinfo. Wat is nieuw of afwijkend?",
      "bron": "Naam van de bron",
      "bron_url": "URL indien beschikbaar",
      "datum": "Datum van het nieuws indien bekend"
    }
  ],
  "klinische_radar": {
    "omschrijving": "1 zin: wat verwacht je deze week te zien dat AFWIJKT van normaal voor ${maand} ${jaar}?",
    "items": [
      {"aandoening": "naam", "trend": "stijgend|dalend|ongewoon", "reden": "korte onderbouwing op basis van actuele data"}
    ]
  },
  "weer_context": {
    "situatie": "Beschrijf het huidige weer in Tessenderlo regio en klinische relevantie voor deze week",
    "relevant_voor": ["lijst van aandoeningen die hierdoor beïnvloed worden"]
  }
}

Maximaal 6 secties. Enkel écht recente en relevante informatie. Als er niets significants is voor een categorie, laat die weg.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  
  // Verzamel alle tekst uit content blocks
  const tekst = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Parse JSON
  const clean = tekst.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const startIdx = clean.indexOf('{');
  const endIdx = clean.lastIndexOf('}');
  if (startIdx === -1) throw new Error('Geen JSON gevonden in antwoord');
  
  return JSON.parse(clean.substring(startIdx, endIdx + 1));
}

function renderRadarContent(data) {
  const body = document.getElementById('radar-body');
  if (!body) return;

  const urgentieKleur = { hoog: '#C0392B', medium: '#D4872A', laag: '#1D9E75' };
  const urgentieTxt = { hoog: 'URGENT', medium: 'AANDACHT', laag: 'INFO' };
  const typeIcoon = { waarschuwing: '⚠️', nieuws: '📰', klinisch: '🔬', regelgeving: '📋', sector: '🏥' };

  const secties = data.secties || [];
  const radar = data.klinische_radar || {};
  const weer = data.weer_context || {};
  const bronnen = data.bronnen_geraadpleegd || [];

  body.innerHTML = `

    <!-- HEADER INFO -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--gray-200);flex-wrap:wrap;gap:8px">
      <div style="font-size:12px;color:var(--gray-500)">
        Bijgewerkt: <strong>${data.gegenereerd_op || '—'}</strong> · 
        Bronnen: ${bronnen.map(b => `<span style="background:var(--gray-100);padding:1px 6px;border-radius:3px;font-size:11px">${b}</span>`).join(' ')}
      </div>
    </div>

    <!-- KLINISCHE RADAR -->
    ${radar.omschrijving || radar.items?.length ? `
    <div class="radar-section" style="margin-bottom:20px">
      <div class="radar-section-title">🔬 KLINISCHE RADAR — DEZE WEEK</div>
      ${radar.omschrijving ? `<p style="font-size:13px;color:var(--gray-600);margin-bottom:12px;font-style:italic">${radar.omschrijving}</p>` : ''}
      ${(radar.items || []).map(item => `
        <div class="radar-klinisch-item">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="radar-trend-dot trend-${item.trend}"></div>
            <div>
              <span style="font-size:13px;font-weight:600;color:var(--gray-800)">${item.aandoening}</span>
              <span class="radar-trend-badge trend-badge-${item.trend}">${item.trend === 'stijgend' ? '↑ Stijgend' : item.trend === 'dalend' ? '↓ Dalend' : '⚡ Ongewoon'}</span>
            </div>
          </div>
          <p style="font-size:12px;color:var(--gray-600);margin-top:4px;padding-left:22px">${item.reden}</p>
        </div>`).join('')}
    </div>` : ''}

    <!-- WEER CONTEXT -->
    ${weer.situatie ? `
    <div class="radar-weer" style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--gray-500);margin-bottom:6px">🌤️ WEER & KLINISCHE CONTEXT — TESSENDERLO</div>
      <p style="font-size:13px;color:var(--gray-700);line-height:1.6">${weer.situatie}</p>
      ${weer.relevant_voor?.length ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px">${weer.relevant_voor.map(w => `<span style="font-size:11px;background:var(--blue-light);color:var(--blue);padding:2px 8px;border-radius:20px">${w}</span>`).join('')}</div>` : ''}
    </div>` : ''}

    <!-- NIEUWS SECTIES -->
    <div class="radar-section-title" style="margin-bottom:12px">📡 ACTUEEL NIEUWS & WAARSCHUWINGEN</div>
    ${secties.length === 0 ? `<p style="font-size:13px;color:var(--gray-500);font-style:italic">Geen significante meldingen deze week.</p>` :
      secties.map(s => `
      <div class="radar-nieuwsitem urgentie-${s.urgentie}">
        <div class="radar-nieuwsitem-header">
          <div style="display:flex;align-items:flex-start;gap:10px;flex:1">
            <span style="font-size:16px;flex-shrink:0">${typeIcoon[s.type] || '📌'}</span>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                <span style="font-size:14px;font-weight:600;color:var(--gray-800)">${s.titel}</span>
                <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;background:${urgentieKleur[s.urgentie]}20;color:${urgentieKleur[s.urgentie]};letter-spacing:.5px">${urgentieTxt[s.urgentie]}</span>
              </div>
              <p style="font-size:13px;color:var(--gray-600);line-height:1.6;margin-bottom:6px">${s.inhoud}</p>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                ${s.bron ? `<span style="font-size:11px;color:var(--gray-400);font-weight:500">${s.bron}</span>` : ''}
                ${s.datum ? `<span style="font-size:11px;color:var(--gray-400)">· ${s.datum}</span>` : ''}
                ${s.bron_url ? `<a href="${s.bron_url}" target="_blank" rel="noopener" style="font-size:11px;color:var(--navy);text-decoration:none">Lees meer →</a>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>`).join('')}

    <!-- FOOTER -->
    <div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--gray-200);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <p style="font-size:11px;color:var(--gray-400)">Automatisch bijgewerkt op maandag, woensdag en vrijdag via AI op basis van publieke veterinaire bronnen. Raadpleeg altijd de originele bron voor kritische beslissingen.</p>

    </div>
  `;
}

function verversRadar(forceer) {
  laadRadar(forceer || false);
}

// Cache management
function saveRadarCache(data) {
  try {
    localStorage.setItem(RADAR_CACHE_KEY, JSON.stringify({
      data, timestamp: Date.now()
    }));
  } catch(e) {}
}

function loadRadarCache() {
  try {
    const raw = localStorage.getItem(RADAR_CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > RADAR_CACHE_TTL) return null;
    return data;
  } catch(e) { return null; }
}

window.renderRadar = renderRadar;
