const fs = require('fs');

const GUILD_ID = '1544077828151054537'; // ← سيرفرك

const old = JSON.parse(fs.readFileSync('old-economy.json', 'utf8'));
const db = JSON.parse(fs.readFileSync('ops-data.json', 'utf8'));

fs.copyFileSync('ops-data.json', 'ops-data.backup3.json');

db.economy = db.economy || {};
const eco = (db.economy[GUILD_ID] = db.economy[GUILD_ID] || {});

let n = 0;
for (const [id, v] of Object.entries(old)) {
  if (!/^\d{15,25}$/.test(id) || !v || typeof v.balance !== 'number') continue;
  eco[id] = { balance: v.balance, lastDaily: v.lastDaily || 0 };
  n++;
}

fs.writeFileSync('ops-data.json', JSON.stringify(db));
console.log(`تم استرجاع ${n} عضو للسيرفر ${GUILD_ID}`);