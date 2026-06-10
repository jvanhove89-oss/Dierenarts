const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'taken.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// ── INITIALISATIE ─────────────────────────────────────────────
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = { taken:[], herinneringen:[], rooster:[], feed:[], casussen:[], vergadering:{status:'voorbereiding',agenda:[],aanwezig:[],notities:''}, vergaderingArchief:[], bijgewerktDoor:'', laatstBijgewerkt:'' };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const init = { wachtwoord:'praktijk2024', callmebot_apikey:'', callmebot_phone:'', whatsapp_tijd:'08:00', emailjs_service:'', emailjs_template:'', emailjs_user:'', emails:[] };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────
function auth(req, res, next) {
  const pw = req.headers['x-praktijk-pw'];
  const config = readConfig();
  if (!config.wachtwoord || pw === config.wachtwoord) return next();
  res.status(401).json({ error: 'Ongeldig wachtwoord' });
}

// ── ROUTES: DATA ──────────────────────────────────────────────
app.get('/api/taken', (req, res) => {
  try { res.json(readData()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/taken', auth, (req, res) => {
  try {
    const data = req.body;
    data.serverTijd = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/backup', auth, (req, res) => {
  try {
    res.setHeader('Content-Disposition', 'attachment; filename="taken-backup.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ROUTES: CONFIG ────────────────────────────────────────────
app.get('/api/config', auth, (req, res) => {
  try {
    const c = readConfig();
    // Stuur nooit het wachtwoord zelf terug
    const safe = { ...c, wachtwoord: c.wachtwoord ? '***' : '' };
    res.json(safe);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', auth, (req, res) => {
  try {
    const huidig = readConfig();
    const nieuw = req.body;
    // Wachtwoord alleen updaten als het echt veranderd is
    if (nieuw.wachtwoord === '***') nieuw.wachtwoord = huidig.wachtwoord;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...huidig, ...nieuw }, null, 2));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── WHATSAPP VIA CALLMEBOT ────────────────────────────────────
function stuurWhatsApp(tekst) {
  const config = readConfig();
  if (!config.callmebot_apikey || !config.callmebot_phone) return Promise.resolve({ skip: true });
  const msg = encodeURIComponent(tekst);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${config.callmebot_phone}&text=${msg}&apikey=${config.callmebot_apikey}`;
  return new Promise((resolve) => {
    https.get(url, (r) => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => resolve({ ok: true, status: r.statusCode }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

// Handmatig testen
app.post('/api/whatsapp-test', auth, async (req, res) => {
  const result = await stuurWhatsApp('🐾 Test bericht van het Praktijkbord — alles werkt!');
  res.json(result);
});

// ── DAGELIJKSE CHECK (elke minuut kijken of het tijd is) ──────
let laasteCheck = '';

function dagelijkseCheck() {
  const config = readConfig();
  if (!config.callmebot_apikey || !config.callmebot_phone) return;

  const nu = new Date();
  const tijdStip = `${String(nu.getHours()).padStart(2,'0')}:${String(nu.getMinutes()).padStart(2,'0')}`;
  const gewenstTijd = config.whatsapp_tijd || '08:00';
  const dagKey = `${nu.toDateString()}-${gewenstTijd}`;

  if (tijdStip === gewenstTijd && laasteCheck !== dagKey) {
    laasteCheck = dagKey;
    const data = readData();
    const today = new Date(); today.setHours(0,0,0,0);

    // Taken met deadline vandaag of over 1 dag
    const deadline = data.taken.filter(t => {
      if (!t.deadline || t.status === 'done') return false;
      const d = new Date(t.deadline); d.setHours(0,0,0,0);
      const diff = (d - today) / (1000*60*60*24);
      return diff >= 0 && diff <= 1;
    });

    // Urgente taken
    const urgent = data.taken.filter(t => t.status === 'urgent');

    // Herinneringen van vandaag
    const herin = (data.herinneringen || []).filter(r => {
      if (!r.datum) return false;
      const d = new Date(r.datum); d.setHours(0,0,0,0);
      return d.getTime() === today.getTime();
    });

    if (!deadline.length && !urgent.length && !herin.length) return;

    let bericht = `🐾 *Praktijkbord – dagelijks overzicht*\n\n`;
    if (urgent.length) bericht += `🔴 *${urgent.length} urgente taak${urgent.length>1?'en':''}*\n${urgent.map(t=>`• ${t.naam} (${t.verant||'?'})`).join('\n')}\n\n`;
    if (deadline.length) bericht += `⏰ *Deadline vandaag/morgen*\n${deadline.map(t=>`• ${t.naam} – ${t.deadline}`).join('\n')}\n\n`;
    if (herin.length) bericht += `🔔 *Herinneringen vandaag*\n${herin.map(r=>`• ${r.titel}`).join('\n')}\n\n`;
    bericht += `Bekijk het bord: https://dierenarts.onrender.com`;

    stuurWhatsApp(bericht).then(r => console.log('WhatsApp verstuurd:', r));
  }
}

setInterval(dagelijkseCheck, 60000); // Elke minuut checken

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Praktijkbord draait op poort ${PORT}`));
