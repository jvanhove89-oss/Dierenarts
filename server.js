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
    const init = {
      taken:[], herinneringen:[], rooster:[], feed:[], casussen:[],
      vergadering:{status:'voorbereiding',agenda:[],aanwezig:[],notities:''},
      vergaderingArchief:[], bijgewerktDoor:'', laatstBijgewerkt:''
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const init = {
      wachtwoord: 'praktijk2024',
      namen: ['Karen','Alexandra','Sylvie','Andere'],
      // Groep WhatsApp (dagelijks overzicht)
      groep_apikey: '',
      groep_phone: '',
      groep_tijd: '08:00',
      // Persoonlijke nummers per collega
      // { naam: { phone, apikey, reminders_deadline, reminders_herinneringen } }
      persoonlijk: {}
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// ── AUTH ──────────────────────────────────────────────────────
function auth(req, res, next) {
  const pw = req.headers['x-praktijk-pw'];
  const config = readConfig();
  if (!config.wachtwoord || pw === config.wachtwoord) return next();
  res.status(401).json({ error: 'Ongeldig wachtwoord' });
}

// ── WHATSAPP ──────────────────────────────────────────────────
function stuurWhatsApp(phone, apikey, tekst) {
  if (!apikey || !phone) return Promise.resolve({ skip: true });
  const msg = encodeURIComponent(tekst);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${msg}&apikey=${apikey}`;
  return new Promise((resolve) => {
    https.get(url, (r) => {
      let body = '';
      r.on('data', d => body += d);
      r.on('end', () => resolve({ ok: true, status: r.statusCode, body }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

// ── DAGELIJKSE GROEPSMELDING ──────────────────────────────────
let laasteGroepCheck = '';

function groepCheck() {
  const config = readConfig();
  if (!config.groep_apikey || !config.groep_phone) return;

  const nu = new Date();
  const tijdStip = `${String(nu.getHours()).padStart(2,'0')}:${String(nu.getMinutes()).padStart(2,'0')}`;
  const gewenstTijd = config.groep_tijd || '08:00';
  const dagKey = `groep-${nu.toDateString()}-${gewenstTijd}`;

  if (tijdStip !== gewenstTijd || laasteGroepCheck === dagKey) return;
  laasteGroepCheck = dagKey;

  const data = readData();
  const today = new Date(); today.setHours(0,0,0,0);

  const deadline = data.taken.filter(t => {
    if (!t.deadline || t.status === 'done') return false;
    const d = new Date(t.deadline); d.setHours(0,0,0,0);
    return (d - today) / 864e5 <= 1;
  });
  const urgent = data.taken.filter(t => t.status === 'urgent');
  const herin = (data.herinneringen || []).filter(r => {
    if (!r.datum) return false;
    const d = new Date(r.datum); d.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  });

  if (!deadline.length && !urgent.length && !herin.length) return;

  let bericht = `🐾 *Praktijkbord – dagelijks overzicht*\n\n`;
  if (urgent.length) bericht += `🔴 *Urgent (${urgent.length})*\n${urgent.map(t=>`• ${t.naam} (${t.verant||'?'})`).join('\n')}\n\n`;
  if (deadline.length) bericht += `⏰ *Deadline vandaag/morgen*\n${deadline.map(t=>`• ${t.naam}`).join('\n')}\n\n`;
  if (herin.length) bericht += `🔔 *Herinneringen*\n${herin.map(r=>`• ${r.titel}`).join('\n')}\n\n`;
  bericht += `👉 https://dierenarts.onrender.com`;

  stuurWhatsApp(config.groep_phone, config.groep_apikey, bericht)
    .then(r => console.log('Groep WhatsApp:', r));
}

// ── PERSOONLIJKE REMINDERS ────────────────────────────────────
const laatstePersoonlijk = {};

function persoonlijkCheck() {
  const config = readConfig();
  const persoonlijk = config.persoonlijk || {};
  if (!Object.keys(persoonlijk).length) return;

  const nu = new Date();
  const tijdStip = `${String(nu.getHours()).padStart(2,'0')}:${String(nu.getMinutes()).padStart(2,'0')}`;
  const data = readData();
  const today = new Date(); today.setHours(0,0,0,0);

  Object.entries(persoonlijk).forEach(([naam, instellingen]) => {
    if (!instellingen.phone || !instellingen.apikey) return;

    const reminderTijd = instellingen.reminder_tijd || '08:00';
    const dagKey = `${naam}-${nu.toDateString()}-${reminderTijd}`;
    if (tijdStip !== reminderTijd || laatstePersoonlijk[dagKey]) return;
    laatstePersoonlijk[dagKey] = true;

    const berichten = [];

    // Taken waar deze persoon verantwoordelijke of opvolger is
    if (instellingen.reminders_taken !== false) {
      const mijnTaken = data.taken.filter(t =>
        (t.verant === naam || t.opvolger === naam) && t.status !== 'done'
      );
      const urgent = mijnTaken.filter(t => t.status === 'urgent');
      const deadline = mijnTaken.filter(t => {
        if (!t.deadline) return false;
        const d = new Date(t.deadline); d.setHours(0,0,0,0);
        return (d - today) / 864e5 <= 1;
      });
      if (urgent.length) berichten.push(`🔴 ${urgent.length} urgente taak${urgent.length>1?'en':''}`);
      if (deadline.length) berichten.push(`⏰ ${deadline.length} deadline vandaag/morgen`);
    }

    // Herinneringen voor deze persoon
    if (instellingen.reminders_herinneringen !== false) {
      const herinVandaag = (data.herinneringen || []).filter(r => {
        if (!r.datum) return false;
        if (r.voor && r.voor !== naam && r.voor !== 'Iedereen' && r.voor !== '') return false;
        const d = new Date(r.datum); d.setHours(0,0,0,0);
        return d.getTime() === today.getTime();
      });
      if (herinVandaag.length) berichten.push(`🔔 ${herinVandaag.length} herinnering${herinVandaag.length>1?'en':''} vandaag`);
    }

    if (!berichten.length) return;

    const bericht = `🐾 *Goeiemorgen ${naam}!*\n\n${berichten.join('\n')}\n\n👉 https://dierenarts.onrender.com`;
    stuurWhatsApp(instellingen.phone, instellingen.apikey, bericht)
      .then(r => console.log(`Persoonlijk WhatsApp ${naam}:`, r));
  });
}

// Elke minuut checken
setInterval(() => { groepCheck(); persoonlijkCheck(); }, 60000);

// ── ROUTES: DATA ──────────────────────────────────────────────
app.get('/api/taken', (req, res) => {
  try { res.json(readData()); }
  catch(e) { res.status(500).json({ error: e.message }); }
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
    const safe = { ...c, wachtwoord: c.wachtwoord ? '***' : '' };
    res.json(safe);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', auth, (req, res) => {
  try {
    const huidig = readConfig();
    const nieuw = req.body;
    if (nieuw.wachtwoord === '***') nieuw.wachtwoord = huidig.wachtwoord;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...huidig, ...nieuw }, null, 2));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── WHATSAPP TEST ─────────────────────────────────────────────
app.post('/api/whatsapp-test', auth, async (req, res) => {
  const { phone, apikey, naam } = req.body;
  const config = readConfig();
  const p = phone || config.groep_phone;
  const k = apikey || config.groep_apikey;
  const ontvanger = naam || 'het team';
  const result = await stuurWhatsApp(p, k, `🐾 Testbericht voor ${ontvanger} — het Praktijkbord werkt!`);
  res.json(result);
});

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Praktijkbord draait op poort ${PORT}`));
