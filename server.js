const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'taken.json');

// Zorg dat taken.json bestaat bij opstarten
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    taken: [],
    bijgewerktDoor: '',
    laatstBijgewerkt: ''
  }, null, 2));
}

// GET – taken ophalen
app.get('/api/taken', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: 'Kan bestand niet lezen' });
  }
});

// POST – taken opslaan
app.post('/api/taken', (req, res) => {
  try {
    const data = req.body;
    data.serverTijd = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: 'Kan niet opslaan: ' + e.message });
  }
});

// GET – backup downloaden als JSON
app.get('/api/backup', (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    res.setHeader('Content-Disposition', 'attachment; filename="taken-backup.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch(e) {
    res.status(500).json({ error: 'Backup mislukt' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Takenbord draait op poort ${PORT}`));
