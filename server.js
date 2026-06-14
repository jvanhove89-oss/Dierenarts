const express = require('express');
let webpush = null;
try { webpush = require('web-push'); } catch(e) { console.log('web-push niet beschikbaar'); }
const fs = require('fs');
const path = require('path');
const https = require('https');
const app = express();

// ── EMAIL BACKUP (nodemailer) ─────────────────────────────────
let mailer = null;
try {
  const nodemailer = require('nodemailer');
  mailer = nodemailer;
} catch(e) {
  console.log('nodemailer niet beschikbaar — backup mail uitgeschakeld');
}

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'taken.json');

// ── GITHUB BACKUP ─────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = 'jvanhove89-oss/Dierenarts';
const GITHUB_FILE = 'data/taken.json';

async function laadVanGitHub() {
  if (!GITHUB_TOKEN) return null;
  try {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'Praktijkbord',
          'Accept': 'application/vnd.github.v3+json'
        }
      };
      https_module.get(options, (r) => {
        let body = '';
        r.on('data', d => body += d);
        r.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.content) {
              const data = JSON.parse(Buffer.from(json.content, 'base64').toString('utf8'));
              console.log('✅ Data geladen van GitHub');
              resolve({ data, sha: json.sha });
            } else {
              resolve(null);
            }
          } catch(e) { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });
  } catch(e) { return null; }
}

async function slaOpGitHub(data) {
  if (!GITHUB_TOKEN) return;
  try {
    // Haal huidige SHA op
    const huidig = await laadVanGitHub();
    const sha = huidig ? huidig.sha : null;
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const body = JSON.stringify({
      message: 'Auto-backup: ' + new Date().toISOString(),
      content,
      ...(sha ? { sha } : {})
    });
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'Praktijkbord',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = https_module.request(options, (r) => {
        let resp = '';
        r.on('data', d => resp += d);
        r.on('end', () => {
          if (r.statusCode === 200 || r.statusCode === 201) {
            console.log('✅ Data opgeslagen op GitHub');
          } else {
            console.log('⚠️ GitHub backup fout:', r.statusCode, resp.substring(0, 100));
          }
          resolve();
        });
      });
      req.on('error', (e) => { console.log('GitHub fout:', e.message); resolve(); });
      req.write(body);
      req.end();
    });
  } catch(e) { console.log('GitHub backup error:', e.message); }
}
const PUSH_FILE = path.join(__dirname, 'push_subscriptions.json');
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BCzVTVsXHNTXcxprsle0O7gOViAjwil6aazVycSrh0jwdBpPPtRi8N5sdShKdRoDEsSiq-oVz09dFbKsBz3qFQ4';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

// VAPID setup
if (webpush && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:praktijk@dierenarts.be', VAPID_PUBLIC, VAPID_PRIVATE);
}

function readSubscriptions() {
  if (!fs.existsSync(PUSH_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PUSH_FILE, 'utf8')); } catch(e) { return []; }
}

function saveSubscriptions(subs) {
  fs.writeFileSync(PUSH_FILE, JSON.stringify(subs, null, 2));
}

async function stuurPushNotificatie(titel, body, url, urgent, tag) {
  if (!webpush || !VAPID_PRIVATE) return;
  const subs = readSubscriptions();
  const payload = JSON.stringify({ title: titel, body, url: url || '/', urgent: urgent || false, tag: tag || 'praktijkbord' });
  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(sub.subscription, payload).catch(err => {
      if (err.statusCode === 410) return 'expired'; // Verwijder verlopen subs
      throw err;
    }))
  );
  // Verwijder verlopen subscriptions
  const actief = subs.filter((_, i) => results[i].value !== 'expired');
  if (actief.length !== subs.length) saveSubscriptions(actief);
}
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
      namen: ['Karen','Alexandra','Sylvie','Jade'],
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

// ── WHATSAPP VIA GREEN API ────────────────────────────────────
function stuurWhatsApp(phone, token, tekst, idInstance) {
  // Ondersteunt zowel CallMeBot (legacy) als Green API
  if (!phone) return Promise.resolve({ skip: true });

  // Green API formaat
  if (idInstance && token) {
    const chatId = phone.replace('+', '').replace(/\s/g, '') + '@c.us';
    const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${token}`;
    const body = JSON.stringify({ chatId, message: tekst });
    return new Promise((resolve) => {
      const req = require('https').request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (r) => {
        let data = '';
        r.on('data', d => data += d);
        r.on('end', () => resolve({ ok: r.statusCode === 200, status: r.statusCode, body: data }));
      });
      req.on('error', e => resolve({ error: e.message }));
      req.write(body);
      req.end();
    });
  }

  // CallMeBot fallback (legacy)
  if (token) {
    const msg = encodeURIComponent(tekst);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${msg}&apikey=${token}`;
    return new Promise((resolve) => {
      https.get(url, (r) => {
        let data = '';
        r.on('data', d => data += d);
        r.on('end', () => resolve({ ok: true, status: r.statusCode }));
      }).on('error', e => resolve({ error: e.message }));
    });
  }

  return Promise.resolve({ skip: true });
}

// Helper: haal Green API config op
function getGreenApiConfig(config, naam) {
  // Groep of persoonlijk
  if (naam && config.persoonlijk && config.persoonlijk[naam]) {
    const p = config.persoonlijk[naam];
    return {
      phone: p.phone,
      token: p.green_token || p.apikey,
      idInstance: p.green_instance || null
    };
  }
  return {
    phone: config.groep_phone,
    token: config.groep_green_token || config.groep_apikey,
    idInstance: config.groep_green_instance || null
  };
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

  const gc = getGreenApiConfig(config, null);
  stuurWhatsApp(gc.phone, gc.token, bericht, gc.idInstance)
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
    const pc = getGreenApiConfig(config, naam);
    stuurWhatsApp(pc.phone, pc.token, bericht, pc.idInstance)
      .then(r => console.log(`Persoonlijk WhatsApp ${naam}:`, r));
  });
}

// Elke minuut checken
setInterval(() => {
  groepCheck();
  persoonlijkCheck();
  backupMailCheck();
}, 60000);

// ── WEKELIJKSE BACKUP MAIL ────────────────────────────────────
let laasteBackupMail = '';

function backupMailCheck() {
  const config = readConfig();
  if (!config.backup_email || !config.backup_smtp_user || !config.backup_smtp_pass) return;
  if (!mailer) return;

  const nu = new Date();
  // Elke maandag om 07:00
  const isDayOk = nu.getDay() === 1; // maandag
  const tijdStip = `${String(nu.getHours()).padStart(2,'0')}:${String(nu.getMinutes()).padStart(2,'0')}`;
  const dagKey = `backup-${nu.toDateString()}`;

  if (!isDayOk || tijdStip !== '07:00' || laasteBackupMail === dagKey) return;
  laasteBackupMail = dagKey;

  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    const aantalTaken = (parsed.taken || []).length;
    const urgent = (parsed.taken || []).filter(t => t.status === 'urgent').length;
    const lopend = (parsed.taken || []).filter(t => t.status === 'waiting').length;

    const transporter = mailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.backup_smtp_user,
        pass: config.backup_smtp_pass
      }
    });

    transporter.sendMail({
      from: config.backup_smtp_user,
      to: config.backup_email,
      subject: `🐾 Praktijkbord — wekelijkse backup ${nu.toLocaleDateString('nl-BE')}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px">
          <h2 style="color:#1B3557">🐾 Wekelijkse backup Praktijkbord</h2>
          <p>Goeimorgen! Hier is de automatische backup van maandag ${nu.toLocaleDateString('nl-BE')}.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr style="background:#1B3557;color:white">
              <td style="padding:8px 12px">Overzicht</td><td style="padding:8px 12px">Aantal</td>
            </tr>
            <tr><td style="padding:7px 12px;border-bottom:1px solid #eee">Totaal taken</td><td style="padding:7px 12px;border-bottom:1px solid #eee">${aantalTaken}</td></tr>
            <tr><td style="padding:7px 12px;border-bottom:1px solid #eee">🔴 Urgent</td><td style="padding:7px 12px;border-bottom:1px solid #eee">${urgent}</td></tr>
            <tr><td style="padding:7px 12px">⏳ Lopend</td><td style="padding:7px 12px">${lopend}</td></tr>
          </table>
          <p style="color:#666;font-size:13px">De volledige backup staat als bijlage.</p>
          <a href="https://dierenarts.onrender.com" style="display:inline-block;background:#1B3557;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:8px">🔗 Open het bord</a>
        </div>`,
      attachments: [{
        filename: `backup-${nu.toISOString().split('T')[0]}.json`,
        content: data,
        contentType: 'application/json'
      }]
    }, (err, info) => {
      if (err) console.log('Backup mail fout:', err.message);
      else console.log('Backup mail verstuurd:', info.messageId);
    });
  } catch(e) {
    console.log('Backup mail error:', e.message);
  }
}

// ── ROUTES: DATA ──────────────────────────────────────────────
app.get('/api/taken', (req, res) => {
  try { res.json(readData()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/taken', auth, async (req, res) => {
  try {
    const oudeData = readData();
    const data = req.body;
    data.serverTijd = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    // Async backup naar GitHub (blokkeert niet)
    slaOpGitHub(data).catch(e => console.log('Backup fout:', e.message));
    
    // Check voor nieuwe urgente taken → push notificatie
    const oudeUrgent = new Set((oudeData.taken || []).filter(t => t.status === 'urgent').map(t => t.id));
    const nieuweUrgent = (data.taken || []).filter(t => t.status === 'urgent' && !oudeUrgent.has(t.id));
    if (nieuweUrgent.length) {
      const taak = nieuweUrgent[0];
      stuurPushNotificatie(
        '🔴 Urgente taak',
        taak.naam + (taak.verant ? ' — ' + taak.verant : ''),
        '/',
        true,
        'urgent-' + taak.id
      ).catch(e => console.log('Push fout:', e.message));
    }
    
    // Check voor nieuwe berichten in feed
    const oudeFeed = new Set((oudeData.feed || []).map(f => f.id));
    const nieuweFeed = (data.feed || []).filter(f => !oudeFeed.has(f.id));
    if (nieuweFeed.length) {
      const msg = nieuweFeed[0];
      stuurPushNotificatie(
        '💬 ' + (msg.door || 'Team') + ' via Teamfeed',
        msg.tekst,
        '/?tab=feed',
        msg.tag === 'urgent',
        'feed-' + msg.id
      ).catch(e => console.log('Push fout:', e.message));
    }
    
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
  const { phone, apikey, naam, green_instance, green_token } = req.body;
  const config = readConfig();
  const p = phone || config.groep_phone;
  const k = green_token || apikey || config.groep_green_token || config.groep_apikey;
  const inst = green_instance || config.groep_green_instance || null;
  const ontvanger = naam || 'het team';
  const result = await stuurWhatsApp(p, k, `🐾 Testbericht voor ${ontvanger} — het Praktijkbord werkt!`, inst);
  res.json(result);
});


// ── PUSH NOTIFICATIES ────────────────────────────────────────
// VAPID public key ophalen (voor browser)
app.get('/api/vapid-public', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

// Subscription opslaan
app.post('/api/push/subscribe', auth, (req, res) => {
  const { subscription, naam } = req.body;
  if (!subscription) return res.status(400).json({ error: 'Geen subscription' });
  const subs = readSubscriptions();
  // Vervang bestaande sub voor deze naam
  const gefilterd = subs.filter(s => s.naam !== naam);
  gefilterd.push({ naam: naam || 'onbekend', subscription, ts: Date.now() });
  saveSubscriptions(gefilterd);
  res.json({ ok: true });
});

// Subscription verwijderen (uitloggen)
app.post('/api/push/unsubscribe', auth, (req, res) => {
  const { naam } = req.body;
  const subs = readSubscriptions().filter(s => s.naam !== naam);
  saveSubscriptions(subs);
  res.json({ ok: true });
});

// Test notificatie sturen
app.post('/api/push/test', auth, async (req, res) => {
  const { naam } = req.body;
  try {
    await stuurPushNotificatie(
      '🐾 Praktijkbord test',
      'Push notificaties werken! Je krijgt voortaan meldingen.',
      '/',
      false,
      'test'
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TEST BACKUP MAIL ─────────────────────────────────────────
app.post('/api/backup-mail-test', auth, async (req, res) => {
  const config = readConfig();
  if (!config.backup_email || !config.backup_smtp_user || !config.backup_smtp_pass) {
    return res.json({ error: 'Vul eerst e-mail en Gmail-gegevens in' });
  }
  if (!mailer) {
    return res.json({ error: 'nodemailer niet beschikbaar' });
  }
  try {
    const transporter = mailer.createTransport({
      service: 'gmail',
      auth: { user: config.backup_smtp_user, pass: config.backup_smtp_pass }
    });
    await transporter.sendMail({
      from: config.backup_smtp_user,
      to: config.backup_email,
      subject: '🐾 Praktijkbord — test backup mail',
      html: '<p>Als je deze mail ziet, werkt de automatische backup correct! Elke maandag om 7u krijg je een backup.</p>'
    });
    res.json({ ok: true });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Praktijkbord draait op poort ${PORT}`);
  // Laad data van GitHub bij opstarten
  if (GITHUB_TOKEN && !fs.existsSync(DATA_FILE)) {
    const result = await laadVanGitHub();
    if (result && result.data) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(result.data, null, 2));
      console.log('✅ Data hersteld van GitHub backup');
    }
  }
});
