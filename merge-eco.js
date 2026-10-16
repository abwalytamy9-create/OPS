const fs = require('fs');
const db = JSON.parse(fs.readFileSync('ops-data.json', 'utf8'));
fs.copyFileSync('ops-data.json', 'ops-data.backup2.json'); // نسخة احتياطية

db.ecoGlobal = db.ecoGlobal || {};
let n = 0;
for (const users of Object.values(db.economy || {})) {
  for (const [id, u] of Object.entries(users)) {
    const g = (db.ecoGlobal[id] = db.ecoGlobal[id] || { balance: 0, lastDaily: 0 });
    g.balance = Math.max(g.balance, Number(u.balance) || 0); // ياخد الأكبر عشان ما يتضاعف
    g.lastDaily = Math.max(g.lastDaily, Number(u.lastDaily) || 0);
    n++;
  }
}
fs.writeFileSync('ops-data.json', JSON.stringify(db));
console.log('تم دمج', n, 'حساب');