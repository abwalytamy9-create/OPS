// OPS COIN — single-file project
//   • Landing page + Discord OAuth2 login
//   • Dashboard with REAL stats (account + per-server)
//   • Built-in bot that tracks messages / voice / XP / invites / joins
//   • Bot profile, security (smart / general), image protection, ALL commands (admin / general / roles / security / settings / chat)
// Setup:  npm i express express-session discord.js   then   node ops-coin.js
//
// ===== الأسرار =====
// لا تحط التوكن أو السيكرت داخل هذا الملف. ضعهم بملف اسمه .env بجانب الملف (أسهل على ويندوز):
//     DISCORD_CLIENT_SECRET=xxxxxxxx
//     DISCORD_BOT_TOKEN=xxxxxxxx
//     SESSION_SECRET=اي_نص_طويل_عشوائي      (اختياري)
// أو بمتغيرات البيئة. وتأكد إن .env مو مرفوع على GitHub.

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, Routes, PermissionFlagsBits, EmbedBuilder, ChannelType, Partials, AuditLogEvent,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, UserSelectMenuBuilder } = require('discord.js');

const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
// تحميل ملف .env (بدون مكتبات إضافية)
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (_) { /* ما في ملف .env */ }

// =====================  الإعدادات: عدّل القيم هنا  =====================
const BOT_PERM_NAMES = [
    'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'UseExternalEmojis', 'AddReactions',
  'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'UseExternalEmojis',
  'ManageMessages', 'ManageGuild', 'KickMembers', 'BanMembers', 'ModerateMembers', 'ManageNicknames',
  'ManageRoles', 'ManageChannels', 'ManageGuildExpressions', 'ManageEmojisAndStickers',
  'MoveMembers', 'MuteMembers', 'ChangeNickname', 'Connect', 'Speak', 'ViewAuditLog',
];
const CONFIG = {
  CLIENT_ID: '1553099566239318086',      // Application ID  (OAuth2) — مو سر
  CLIENT_SECRET: '',                     // ← لا تكتبه هون: DISCORD_CLIENT_SECRET بملف .env
  BOT_TOKEN: '',                         // ← لا تكتبه هون: DISCORD_BOT_TOKEN بملف .env
  REDIRECT_URI: 'https://ops-system-dashboard.up.railway.app/auth/callback', // لازم يطابق Redirects في Portal
  SUPPORT_URL: 'https://discord.gg/wVwjHms4y', // رابط سيرفر الدعم / تذاكر الشراء
  OWNER_IDS: ['1391956716853264414'],    // ايديات حسابات ديسكورد اللي بتقدر تفعّل البريميوم وتدير مكتبة الصور
  TIMEZONE: 'Asia/Amman',                // توقيت حساب اليومي/الأسبوعي
  // صلاحيات رابط إضافة البوت (لازم تعيد دعوة البوت بعد أي تغيير هون)
  BOT_PERMISSIONS: String(BOT_PERM_NAMES.reduce((acc, n) => acc | (PermissionFlagsBits[n] || 0n), 0n)),
  DB_FILE: 'ops-data.json',              // ملف حفظ الإحصائيات (بيتولد لحاله)
  SESSION_SECRET: '',                    // فاضي = يتولد تلقائياً (الجلسات تنمسح عند إعادة التشغيل)
  PORT: 3000,
  PRODUCTION: false,                     // true لما ترفع الموقع على دومين HTTPS
};
// =======================================================================

// متغيرات البيئة (إن وُجدت) بتاخد الأولوية
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || CONFIG.CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || CONFIG.CLIENT_SECRET;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || CONFIG.BOT_TOKEN;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || CONFIG.REDIRECT_URI;
const SUPPORT_URL = process.env.SUPPORT_URL || CONFIG.SUPPORT_URL;
const PORT = process.env.PORT || CONFIG.PORT;
const TZ = CONFIG.TIMEZONE;
const OWNER_IDS = (CONFIG.OWNER_IDS || []).map(String);
const SESSION_SECRET =
  process.env.SESSION_SECRET || CONFIG.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const isProd = process.env.NODE_ENV === 'production' || CONFIG.PRODUCTION;
path.resolve(DATA_DIR, CONFIG.DB_FILE)

// ===== روابط الصور (غيّرها هون كل ما تنتهي صلاحيتها) =====
const BG_URL = 'https://cdn.discordapp.com/attachments/1553738433506189414/1560725064725438524/00ddcbc2c5a70d1c.png?ex=6ad3c1fc&is=6ad2707c&hm=5ccc2893bc5914c30ae5e0a54ac15d6cd03aa5659f4bbc8e6df5aa6b7a333d67&';
const LOGO_URL = 'https://cdn.discordapp.com/attachments/1553738433506189414/1560725103849898024/Gemini_Generated_Image_cfloegcfloegcflo.png?ex=6ad3c205&is=6ad27085&hm=910f08b4b759aabbbb91b87a2cf0980efef84310097b3fe66307c08c1e3c88af&';

if (!/^\d{15,25}$/.test(String(CLIENT_ID))) {
  console.error('CONFIG.CLIENT_ID غير صحيح: ضع Application ID (أرقام فقط).');
  process.exit(1);
}
if (!CLIENT_SECRET || CLIENT_SECRET.includes('ضع_')) {
  console.error('CLIENT_SECRET فاضي: اكتب DISCORD_CLIENT_SECRET=... بملف .env بجانب هذا الملف (او كمتغير بيئة).');
  process.exit(1);
}
const botEnabled = typeof BOT_TOKEN === 'string' && BOT_TOKEN.length > 40 && !BOT_TOKEN.includes('ضع_');
const INVITE_URL =
  'https://discord.com/oauth2/authorize?' +
  new URLSearchParams({ client_id: CLIENT_ID, scope: 'bot applications.commands', permissions: CONFIG.BOT_PERMISSIONS });

// =====================  التخزين (ملف JSON)  =====================
const DB_PATH = path.resolve(DATA_DIR, CONFIG.DB_FILE);
let db = { guilds: {}, premium: {}, settings: {} };
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.error('تعذر قراءة ملف البيانات، تم حفظ نسخة منه باسم .bad:', e.message);
    try { fs.copyFileSync(DB_PATH, DB_PATH + '.bad'); } catch (_) {}
  }
}
let dirty = false;
function save() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.writeFileSync(DB_PATH + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_PATH + '.tmp', DB_PATH);
  } catch (e) {
    dirty = true;
    console.error('DB save error:', e.message);
  }
}
setInterval(save, 15000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

// مخازن إضافية: dbk = قراءة/إنشاء ، dbr = قراءة فقط
const dbk = (name, gid) => { db[name] = db[name] || {}; return db[name][gid] || (db[name][gid] = {}); };
const dbr = (name, gid) => (db[name] && db[name][gid]) || {};

// ---- وقت (حسب TIMEZONE) ----
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});
function parts(ts) {
  const o = {};
  for (const p of fmt.formatToParts(ts)) o[p.type] = p.value;
  return o;
}
const dayKey = (ts) => { const p = parts(ts); return `${p.year}-${p.month}-${p.day}`; };
const hourKey = (ts) => { const p = parts(ts); return `${p.year}-${p.month}-${p.day}T${p.hour}`; };
const hoursBack = (n) => { const now = Date.now(); const a = []; for (let i = n - 1; i >= 0; i--) a.push(hourKey(now - i * 36e5)); return a; };
const daysBack = (n) => { const now = Date.now(); const a = []; for (let i = n - 1; i >= 0; i--) a.push(dayKey(now - i * 864e5)); return a; };
const NF = (n) => Number(n || 0).toLocaleString('en-US');
const fmtMinS = (n) => (n < 60 ? `${NF(n)} د` : `${NF(Math.floor(n / 60))} س ${n % 60} د`);

// ---- بنية البيانات ----
const G = (gid) => db.guilds[gid] || (db.guilds[gid] = { members: {}, hours: {} });
const M = (g, uid) => g.members[uid] || (g.members[uid] = { w: 0, v: 0, xp: 0, inv: 0, la: 0, days: {} });
function hourBucket(g, ts) {
  const hk = hourKey(ts);
  return g.hours[hk] || (g.hours[hk] = { m: 0, v: 0, j: 0, l: 0, u: {} });
}
// kind: 'w' = رسالة (نقطة كتابية)، 'v' = دقيقة صوتية
function bump(gid, uid, kind, now = Date.now(), ch) {
  const g = G(gid), m = M(g, uid);
  m[kind]++;
  m.la = now;
  if (kind === 'w' && ch) { m.c = m.c || {}; m.c[ch] = (m.c[ch] || 0) + 1; }
  const d = dayKey(now);
  const day = m.days[d] || (m.days[d] = [0, 0]);
  day[kind === 'w' ? 0 : 1]++;
  const h = hourBucket(g, now);
  if (kind === 'w') h.m++; else h.v++;
  if (h.u) h.u[uid] = 1;
  dirty = true;
}
function prune() {
  const now = Date.now();
  const oldHour = hourKey(now - 32 * 864e5);
  const uCut = hourKey(now - 26 * 36e5);
  const oldDay = dayKey(now - 33 * 864e5);
  for (const g of Object.values(db.guilds)) {
    for (const hk of Object.keys(g.hours)) {
      if (hk < oldHour) delete g.hours[hk];
      else if (hk < uCut && g.hours[hk].u) {
        g.hours[hk].ua = Object.keys(g.hours[hk].u).length;
        delete g.hours[hk].u;
      }
    }
    for (const m of Object.values(g.members)) for (const d of Object.keys(m.days)) if (d < oldDay) delete m.days[d];
  }
  dirty = true;
}
prune();
setInterval(prune, 3600e3);

// ---- إحصائيات الحساب ----
const sumDays = (m, keys, idx) => { let s = 0; for (const k of keys) { const d = m.days[k]; if (d) s += d[idx]; } return s; };
function userStats(uid) {
  const t1 = daysBack(1), t7 = daysBack(7), t30 = daysBack(30);
  const r = { w: { total: 0, day: 0, week: 0, month: 0 }, v: { total: 0, day: 0, week: 0, month: 0 }, b: 0 };
  for (const g of Object.values(db.guilds)) {
    const m = g.members[uid];
    if (!m) continue;
    r.w.total += m.w; r.v.total += m.v; r.b += m.b || 0;
    r.w.day += sumDays(m, t1, 0); r.w.week += sumDays(m, t7, 0); r.w.month += sumDays(m, t30, 0);
    r.v.day += sumDays(m, t1, 1); r.v.week += sumDays(m, t7, 1); r.v.month += sumDays(m, t30, 1);
  }
  return r;
}
let rankCache = { t: 0, list: [] };
function globalRanking() {
  if (Date.now() - rankCache.t < 20000) return rankCache.list;
  const tot = new Map();
  for (const g of Object.values(db.guilds))
    for (const [uid, m] of Object.entries(g.members)) tot.set(uid, (tot.get(uid) || 0) + m.w + m.v + (m.b || 0));
  const list = [...tot].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
  rankCache = { t: Date.now(), list };
  return list;
}
function xpInfo(xp) {
  let l = 0;
  while (xp >= 5 * l * l + 50 * l + 100) { xp -= 5 * l * l + 50 * l + 100; l++; }
  return { level: l, cur: xp, need: 5 * l * l + 50 * l + 100 };
}
const levelFromXp = (xp) => xpInfo(xp).level;
const isPremium = (gid) => !!(db.premium[gid] && db.premium[gid].until > Date.now());

// =====================  البوت (يتتبع النشاط الحقيقي)  =====================
let client = null;
let botReady = false;
const cool = new Map();        // `${gid}:${uid}` -> { m: آخر رسالة محسوبة, x: آخر XP }
const inviteCache = new Map(); // gid -> Map(code -> { uses, inviter })
setInterval(() => { const cut = Date.now() - 300000; for (const [k, v] of cool) if (v.m < cut && v.x < cut) cool.delete(k); }, 300000);

async function cacheInvites(guild) {
  try {
    const inv = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(inv.map((i) => [i.code, { uses: i.uses || 0, inviter: i.inviter ? i.inviter.id : null }])));
  } catch (_) { /* البوت ما عنده صلاحية Manage Server */ }
}
const isMuted = (gid, uid) => {
  const mu = dbr('mutes', gid)[uid];
  if (!mu) return false;
      if (mu.until && mu.until < Date.now()) return false; // muteSweep يشيل الرتبة ويمسح السجل
  return true;
};
function onMessage(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId) return;
  if (isMuted(msg.guildId, msg.author.id)) return;
  const now = Date.now();
  const key = msg.guildId + ':' + msg.author.id;
  const c = cool.get(key) || { m: 0, x: 0 };
  if (now - c.m < 2000) return;            // حماية من السبام: رسالة وحدة كل ثانيتين تنحسب
  c.m = now;
  bump(msg.guildId, msg.author.id, 'w', now, msg.channelId);
  if (now - c.x >= 60000) {                // XP: مرة كل دقيقة (15-25)
    c.x = now;
    const rec = M(G(msg.guildId), msg.author.id);
    const before = levelFromXp(rec.xp);
    rec.xp += 15 + Math.floor(Math.random() * 11);
    const after = levelFromXp(rec.xp);
    if (after > before && msg.member) lvlOnUp(msg.guild, msg.member, 'text', after).catch(() => {});
  }
  cool.set(key, c);
}async function sendBotWelcome(guild) {
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) return;
  const ch = [...guild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildText && c.permissionsFor(me) && c.permissionsFor(me).has(['ViewChannel', 'SendMessages']))
    .sort((a, b) => a.rawPosition - b.rawPosition)[0];   // أول روم كتابي بالسيرفر
  if (!ch) return;
  let dash = null;
  try { dash = new URL(REDIRECT_URI).origin + '/dashboard'; } catch (_) {}
  const e = new EmbedBuilder().setColor(0xffffff)
    .setTitle('Welcome to OPS System')
    .setDescription([
      'السلام عليكم، تم إضافة أفضل بوت لسيرفركم!',
      '',
      '**روابط مهمة تحتاجها:**',
      '',
      dash ? `• لوحة التحكم (الداشبورد): [اضغط هنا للرابط](${dash})` : null,
      SUPPORT_URL ? `• سيرفر الدعم الفني: [اضغط هنا للرابط](${SUPPORT_URL})` : null,
      '• قائمة الأوامر: اكتب `help!` عشان تشوف كل ميزاتي.',
      '',
      'شكراً لثقتكم ويلا ابدأوا جربوا الأوامر!',
    ].filter((x) => x !== null).join('\n'));
  await ch.send({ embeds: [e], allowedMentions: { parse: [] } }).catch(() => {});
}
// ---- البوت بروم صوتي (تثبيت) ----
async function joinVoice(guild, chId) {
  await guild.shard.send({ op: 4, d: { guild_id: guild.id, channel_id: chId, self_mute: false, self_deaf: true } });
}

function startBot(withMembers = true) {

  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildInvites];
  if (withMembers) intents.push(GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildPresences);
  intents.push(GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildExpressions || GatewayIntentBits.GuildEmojisAndStickers);
  client = new Client({ intents, partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User] });
  attachLogs(client);
  attachGuard(client);

    client.once(Events.ClientReady, (c) => {
    botReady = true;
    console.log(`Bot online: ${c.user.tag} (${c.guilds.cache.size} سيرفر)`);
        console.log('GuildMembers intent مفعّل بالكود:', client.options.intents.has(GatewayIntentBits.GuildMembers));
    tvSweep().catch(() => {});   // ← هون
    muteSweep().catch(() => {});
        prisonSweep().catch(() => {});
    setInterval(() => prisonSweep().catch(() => {}), 30000);
    setInterval(() => muteSweep().catch(() => {}), 30000);
        setInterval(() => sprSweep().catch(() => {}), 30000);
    for (const g of c.guilds.cache.values()) {
      cacheInvites(g);
      
      const vc = (db.settings[g.id] || {}).voiceChannel;
      if (vc && g.channels.cache.has(vc)) joinVoice(g, vc).catch(() => {});
    }
    setInterval(() => {                    // كل دقيقة: نقطة صوتية لكل عضو بالفويس (مو مكتوم الصوت الكامل)
      const now = Date.now();
      for (const guild of client.guilds.cache.values()) {
        for (const vs of guild.voiceStates.cache.values()) {
          if (!vs.channelId || vs.selfDeaf || vs.serverDeaf || vs.channelId === guild.afkChannelId) continue;
          if (vs.member && vs.member.user && vs.member.user.bot) continue;
          bump(guild.id, vs.id, 'v', now);
          { // XP صوتي (10 لكل دقيقة) + عدّاد الغرفة الصوتية
            const gd = G(guild.id), rv = M(gd, vs.id);
            const lb = levelFromXp(rv.vxp || 0);
            rv.vxp = (rv.vxp || 0) + 10;
            const la = levelFromXp(rv.vxp);
            gd.vc = gd.vc || {};
            gd.vc[vs.channelId] = (gd.vc[vs.channelId] || 0) + 1;
            if (la > lb && vs.member) lvlOnUp(guild, vs.member, 'voice', la).catch(() => {});
          }
        }
      }
    }, 60000);
  });
    client.on(Events.GuildCreate, (guild) => {
    cacheInvites(guild);
    if (botReady && guild.joinedTimestamp && Date.now() - guild.joinedTimestamp < 60000) sendBotWelcome(guild).catch(() => {});
  });
  client.on(Events.MessageCreate, onGuard);
  client.on(Events.MessageCreate, onMessage);
  client.on(Events.MessageCreate, onCommand);
    client.on(Events.MessageCreate, onEconomy);
  client.on(Events.InteractionCreate, onEcoInteraction);
    client.on(Events.InteractionCreate, onDetlogInteraction);
  client.on(Events.MessageCreate, onPrivateGuard);
    client.on(Events.InteractionCreate, onStatsInteraction);
  client.on(Events.InteractionCreate, onHelpInteraction);
  client.on(Events.MessageCreate, onImageScan);
  client.on(Events.MessageCreate, onAutoReply);
  client.on(Events.MessageCreate, onChannelSync);
    client.on(Events.MessageCreate, onAutoLine);
        client.on(Events.MessageCreate, onAutoReact);
          client.on(Events.MessageCreate, onVent);
  client.on(Events.InteractionCreate, onEmbedInteraction);
  client.on(Events.InteractionCreate, onTempVoiceInteraction);
client.on(Events.VoiceStateUpdate, onTempVoice);
    client.on(Events.InteractionCreate, onRolePanelInteraction);
      client.on(Events.InteractionCreate, onTicketInteraction);
        client.on(Events.InteractionCreate, onPenaltyInteraction);
          client.on(Events.InteractionCreate, onInfractionInteraction);
  client.on(Events.ChannelDelete, (ch) => {   // لو انحذفت غرفة تذكرة يدوياً ننظف سجلها
    const st = ch.guild && db.tickets && db.tickets[ch.guild.id];
    if (st && st.rooms && st.rooms[ch.id]) { delete st.rooms[ch.id]; dirty = true; }
  });
  client.on(Events.MessageReactionAdd, rpReaction(true));
  client.on(Events.MessageReactionRemove, rpReaction(false));
  client.on(Events.InviteCreate, (i) => {
    const c = inviteCache.get(i.guild.id);
    if (c) c.set(i.code, { uses: i.uses || 0, inviter: i.inviter ? i.inviter.id : null });
  });
  client.on(Events.InviteDelete, (i) => { const c = inviteCache.get(i.guild.id); if (c) c.delete(i.code); });
    client.on(Events.GuildMemberAdd, async (m) => {
    console.log(`[join] ${m.user.tag} دخل ${m.guild.name}`);
    try {
      if (isMuted(m.guild.id, m.id)) { const mr = (db.settings[m.guild.id] || {}).muteRole; if (mr) m.roles.add(mr, 'OPS: mute (rejoin)').catch(() => {}); }
    } catch (e) { console.error('[join] mute check:', e.message); }
    let used = null;
    try {
      if (!m.user.bot) {
        hourBucket(G(m.guild.id), Date.now()).j++;
        dirty = true;
        const old = inviteCache.get(m.guild.id);
        if (old) {
          const inv = await Promise.race([
            m.guild.invites.fetch(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('invites timeout')), 4000)),
          ]);
          for (const i of inv.values()) {
            const prev = old.get(i.code);
            if ((i.uses || 0) > (prev ? prev.uses : 0)) { used = i; break; }
          }
          inviteCache.set(m.guild.id, new Map(inv.map((i) => [i.code, { uses: i.uses || 0, inviter: i.inviter ? i.inviter.id : null }])));
          if (used && used.inviter) { M(G(m.guild.id), used.inviter.id).inv++; dirty = true; }
        }
      }
    } catch (e) { console.error('[join] invites:', e.message); }
        grantAutoRoles(m).catch((e) => console.error('[autoroles]', e.message));
    try { await memberJoin(m, used); } catch (e) { console.error('[welcome] error:', e); }
  });
  client.on(Events.GuildMemberRemove, (m) => {
    if (m.user && m.user.bot) return;
    hourBucket(G(m.guild.id), Date.now()).l++;
    dirty = true;
  });
  // بلوك الرتب (rblock): إذا انعطى العضو رتبة محظورة عليه ينسحبها البوت
  client.on(Events.GuildMemberUpdate, (o, n) => {
    const rb = dbr('rblock', n.guild.id)[n.id];
    if (!rb || !rb.length || !isPremium(n.guild.id)) return;
    const bad = n.roles.cache.filter((r) => rb.includes(r.id) && r.editable);
    if (bad.size) n.roles.remove(bad.map((r) => r.id), 'OPS: rblock').catch(() => {});
  });
  // تثبيت البوت بالفويس: إذا انسحب يرجعه
  client.on(Events.VoiceStateUpdate, (o, n) => {
    if (!client.user || n.id !== client.user.id) return;
    const want = (db.settings[n.guild.id] || {}).voiceChannel;
    if (want && n.channelId !== want) setTimeout(() => joinVoice(n.guild, want).catch(() => {}), 3000);
  
  });
    // رتبة السجن: كل روم جديد ينخفي عنها
  client.on(Events.ChannelCreate, (ch) => {
    const rid = ch.guild && (db.settings[ch.guild.id] || {}).prisonRole;
    if (rid && ch.permissionOverwrites) ch.permissionOverwrites.edit(rid, { ViewChannel: false, SendMessages: false, Connect: false }).catch(() => {});
  });

  // ⬇️ الجديدة: كل روم جديد ينمنع عليه الكتابة للمسكّتين
  client.on(Events.ChannelCreate, (ch) => {
    const rid = ch.guild && (db.settings[ch.guild.id] || {}).muteRole;
    if (rid && ch.permissionOverwrites) ch.permissionOverwrites.edit(rid, MUTE_DENY).catch(() => {});
  });

  client.on(Events.Error, (e) => console.error('Discord client error:', e.message));
  client.on(Events.Error, (e) => console.error('Discord client error:', e.message));

  client.login(BOT_TOKEN).catch((err) => {
    if (withMembers && /disallowed intents/i.test(err.message)) {
      console.warn('⚠ فعّل "Server Members Intent" و "Message Content Intent" من Developer Portal > Bot. البوت يشتغل حالياً بدونهم (بدون أوامر ولا حماية صور).');
      startBot(false);
      return;
    }
    console.error('فشل تسجيل دخول البوت (تأكد من التوكن):', err.message);
  });
}
if (botEnabled) startBot();
else console.warn('⚠ BOT_TOKEN غير مضبوط: اكتب DISCORD_BOT_TOKEN=... بملف .env. الموقع يشتغل لكن بدون إحصائيات حقيقية.');

async function getUser(uid) {
  if (!client) return null;
  return client.users.cache.get(uid) || (await client.users.fetch(uid).catch(() => null));
}
// ===== تخزين الجلسات بملف (يضل الدخول حتى لو انعاد تشغيل البوت) =====
class FileStore extends session.Store {
  constructor(file) {
    super();
    this.file = file;
    this.data = {};
    this.dirty = false;
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
    setInterval(() => this.flush(), 5000).unref();
    setInterval(() => this.sweep(), 3600e3).unref();
    process.on('exit', () => this.flush());
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch (e) { this.dirty = true; console.error('session save error:', e.message); }
  }
  sweep() {
    const now = Date.now();
    for (const [k, v] of Object.entries(this.data)) if (v.exp < now) { delete this.data[k]; this.dirty = true; }
  }
  get(sid, cb) {
    const e = this.data[sid];
    if (!e || e.exp < Date.now()) return cb(null, null);
    cb(null, JSON.parse(JSON.stringify(e.s)));
  }
  set(sid, sess, cb) {
    const exp = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 30 * 864e5;
    this.data[sid] = { s: JSON.parse(JSON.stringify(sess)), exp };
    this.dirty = true;
    cb && cb();
  }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
  destroy(sid, cb) { delete this.data[sid]; this.dirty = true; cb && cb(); }
}
// =====================  الموقع  =====================
const app = express();
if (isProd) app.set('trust proxy', 1);
app.use(
  session({
    name: 'ops.sid',
    secret: SESSION_SECRET,
    store: new FileStore(path.resolve(DATA_DIR, 'ops-sessions.json')),
    resave: false,
    saveUninitialized: false,
    rolling: true, // كل زيارة بتجدد المدة
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '20mb' }));
// احفظ فوراً بعد أي تعديل من الداشبورد
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) save(); });
  next();
});

// ---- ملفات الواجهة (كلها من هذا الملف) ----
// السيرفر يجيب الصورة من ديسكورد ويخزنها 10 دقايق (عشان ما يعتمد المتصفح على رابط ينتهي)
const imgCache = {};
function proxyImage(getUrl) {
  return async (req, res) => {
    const url = getUrl();
    const c = imgCache[url];
    if (c && Date.now() - c.t < 600000) {
      res.set('Cache-Control', 'public, max-age=600').type(c.type);
      return res.send(c.buf);
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('status ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const type = r.headers.get('content-type') || 'image/png';
      imgCache[url] = { buf, type, t: Date.now() };
      res.set('Cache-Control', 'public, max-age=600').type(type).send(buf);
    } catch (e) {
      console.error('[image] فشل جلب الصورة (يمكن انتهى الرابط، حدّثه):', e.message);
      if (c) return res.type(c.type).send(c.buf); // آخر نسخة ناجحة
      res.status(502).end();
    }
  };
}
app.get('/bg.jpg', proxyImage(() => BG_URL));
app.get('/logo.png', proxyImage(() => LOGO_URL));
app.get('/style.css', (req, res) => res.type('text/css').send(CSS));
app.get('/bg.jpg', (req, res) => res.sendFile(path.join(__dirname, 'bg.jpg')));
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, 'logo.png')));
app.get('/bg.jpg', (req, res) => res.sendFile(path.join(__dirname, 'bg.jpg')));
app.get('/app.js', (req, res) => res.type('application/javascript').send('(' + clientMain.toString() + ')();'));
app.get('/dash.js', (req, res) => res.type('application/javascript').send('(' + dashMain.toString() + ')();'));
app.get('/', (req, res) => {
  let html = INDEX_HTML;
  if (req.session.user) {
    html = html
      .replace('href="/login"', 'href="/dashboard"')
      .replace('class="hbtn solid"', 'class="hbtn solid entered"')
      .replace('تفعيل النظام</span>', 'دخول النظام</span>');
  }
  res.type('html').send(html);
});
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.type('html').send(DASH_HTML);
});
app.get('/soon', (req, res) => res.redirect('/dashboard'));

app.get('/api/config', (req, res) => res.json({ supportUrl: SUPPORT_URL, loggedIn: Boolean(req.session.user) }));

// ---- تسجيل الدخول ----
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
    scope: 'identify guilds', state, prompt: 'none',
  });
  req.session.save(() => res.redirect(`https://discord.com/oauth2/authorize?${params}`));
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/');
  const expected = req.session.oauthState;
  if (!code || !state || !expected || state !== expected) return res.redirect('/?error=login_failed');
  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code',
        code: String(code), redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const token = await tokenRes.json();
        const tokenData = token;
    const userRes = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!userRes.ok) throw new Error(`user fetch failed: ${userRes.status}`);
    const u = await userRes.json();
    req.session.regenerate((err) => {
      if (err) return res.redirect('/?error=login_failed');
      req.session.user = { id: u.id, username: u.username, name: u.global_name || u.username, avatar: u.avatar };
      req.session.accessToken = token.access_token;
      req.session.refreshToken = token.refresh_token;
      req.session.tokenExp = Date.now() + (token.expires_in || 604800) * 1000 - 60000;
      req.session.save(() => res.redirect('/'));
    });
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect('/?error=login_failed');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('ops.sid'); res.redirect('/'); });
});

// ---- مساعدات API ----
const auth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'not_logged_in' });
  next();
};
const wrap = (fn) => (req, res, next) =>
  fn(req, res, next).catch((err) => {
    console.error(`[API ${req.method} ${req.originalUrl}]`, err);
    if (err.status === 401) return req.session.destroy(() => res.status(401).json({ error: 'session_expired' }));
    res.status(500).json({ error: 'server_error', detail: String(err.message || err).slice(0, 200) });
  });
async function refreshToken(s) {
  if (!s.refreshToken) { const e = new Error('no refresh'); e.status = 401; throw e; }
  const r = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: s.refreshToken }),
  });
  if (!r.ok) { const e = new Error('refresh failed'); e.status = 401; throw e; }
  const t = await r.json();
  s.accessToken = t.access_token;
  s.refreshToken = t.refresh_token || s.refreshToken;
  s.tokenExp = Date.now() + (t.expires_in || 604800) * 1000 - 60000;
}
async function userGuilds(req) {
  const s = req.session;
  if (s.guilds && Date.now() - s.guildsAt < 120000) return s.guilds;
  if (s.tokenExp && Date.now() > s.tokenExp) await refreshToken(s);
  let r;
  try {
    r = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${s.accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    if (s.guilds) return s.guilds;   // مشكلة شبكة: استخدم القائمة القديمة
    throw e;
  }
  if (!r.ok) {
    if (r.status !== 401 && s.guilds) return s.guilds;   // 429 أو خطأ من ديسكورد
    const e = new Error('discord ' + r.status); e.status = r.status; throw e;
  }
  const list = await r.json();
  s.guilds = list.map((g) => ({ id: g.id, owner: g.owner, permissions: g.permissions, name: g.name, icon: g.icon }));
  s.guildsAt = Date.now();
  return s.guilds;
}
// السيرفرات اللي فيها البوت + المستخدم
// السيرفرات اللي المستخدم مالك/أدمن فيها والبوت موجود فيها
async function sharedGuilds(req) {
  const ug = await userGuilds(req);
  if (!botReady) return [];
  const out = [];
  for (const g of ug) {
    if (!(Boolean(g.owner) || (BigInt(g.permissions) & 0x28n) !== 0n)) continue;
    const cg = client.guilds.cache.get(g.id);
    if (!cg) continue;
    out.push({
      id: cg.id, name: cg.name, icon: cg.icon,
      owner: Boolean(g.owner), canManage: true,
      premium: isPremium(cg.id),
      premiumUntil: db.premium[cg.id] ? db.premium[cg.id].until : 0,
    });
  }
  return out;
}
// السيرفرات اللي المستخدم أدمن فيها والبوت مو موجود
async function missingGuilds(req) {
  const ug = await userGuilds(req);
  if (!botReady) return [];
  return ug
    .filter((g) => (Boolean(g.owner) || (BigInt(g.permissions) & 0x28n) !== 0n) && !client.guilds.cache.has(g.id))
    .map((g) => ({ id: g.id, name: g.name || 'سيرفر', icon: g.icon || null, botIn: false }));
}
app.get('/api/me', auth, (req, res) => {
  res.json({
    ...req.session.user,
    bot: { enabled: botEnabled, online: botReady },
    supportUrl: SUPPORT_URL,
    inviteUrl: INVITE_URL,
  });
});

app.get('/api/overview', auth, (req, res) => {
  const uid = req.session.user.id;
  const s = userStats(uid);
  const ranking = globalRanking();
  const idx = ranking.findIndex(([id]) => id === uid);
  res.json({
    rank: idx < 0 ? null : idx + 1,
    points: { total: s.w.total + s.v.total + s.b, today: s.w.day + s.v.day },
    written: s.w,
    voice: s.v,
  });
});

app.get('/api/guilds', auth, wrap(async (req, res) => {
  const have = (await sharedGuilds(req)).map((g) => ({ ...g, botIn: true }));
  res.json([...have, ...(await missingGuilds(req))]);
}));

const RANGES = { '24h': { hours: 24, days: 0 }, '7d': { hours: 168, days: 7 }, '30d': { hours: 720, days: 30 } };
app.get('/api/guild/:id', auth, wrap(async (req, res) => {
  const info = (await sharedGuilds(req)).find((g) => g.id === req.params.id);
  if (!info) return res.status(404).json({ error: 'not_found' });
  const cg = client.guilds.cache.get(info.id);
  const g = db.guilds[info.id] || { members: {}, hours: {} };
  const range = RANGES[req.query.range] ? req.query.range : '24h';
  const R = RANGES[range];
  const now = Date.now();
  const hks = hoursBack(R.hours);
  const uniq = (h) => (h ? (h.u ? Object.keys(h.u).length : h.ua || 0) : 0);

  let messages = 0, joins = 0, leaves = 0;
  for (const hk of hks) {
    const h = g.hours[hk];
    if (h) { messages += h.m; joins += h.j; leaves += h.l; }
  }
  const since = now - R.hours * 36e5;
  let active = 0;
  for (const m of Object.values(g.members)) if (m.la >= since) active++;

  const chart = { type: range === '24h' ? 'hour' : 'day', labels: [], messages: [], active: [], joins: [], leaves: [] };
  if (range === '24h') {
    for (const hk of hks) {
      const h = g.hours[hk];
      chart.labels.push(hk.slice(11));
      chart.messages.push(h ? h.m : 0);
      chart.active.push(uniq(h));
      chart.joins.push(h ? h.j : 0);
      chart.leaves.push(h ? h.l : 0);
    }
  } else {
    const dks = daysBack(R.days);
    const byDay = {};
    for (const [hk, h] of Object.entries(g.hours)) {
      const d = byDay[hk.slice(0, 10)] || (byDay[hk.slice(0, 10)] = { m: 0, j: 0, l: 0 });
      d.m += h.m; d.j += h.j; d.l += h.l;
    }
    for (const dk of dks) {
      let a = 0;
      for (const m of Object.values(g.members)) if (m.days[dk]) a++;
      const d = byDay[dk];
      chart.labels.push(dk.slice(5));
      chart.messages.push(d ? d.m : 0);
      chart.active.push(a);
      chart.joins.push(d ? d.j : 0);
      chart.leaves.push(d ? d.l : 0);
    }
  }
  const p = db.premium[info.id];
  res.json({
    guild: { id: info.id, name: cg.name, icon: cg.icon, memberCount: cg.memberCount },
    range,
    stats: { members: cg.memberCount, active, messages, joins, leaves },
    chart,
    premium: { active: isPremium(info.id), until: p ? p.until : 0 },
    canManage: info.canManage,
  });
}));

const LEADER_KEY = { messages: 'w', xp: 'xp', invites: 'inv', voice: 'v' };
app.get('/api/guild/:id/leaders', auth, wrap(async (req, res) => {
  const info = (await sharedGuilds(req)).find((g) => g.id === req.params.id);
  if (!info) return res.status(404).json({ error: 'not_found' });
  const type = LEADER_KEY[req.query.type] ? req.query.type : 'messages';
  const key = LEADER_KEY[type];
  const g = db.guilds[info.id] || { members: {} };
  const rows = Object.entries(g.members).filter(([, m]) => m[key] > 0).sort((a, b) => b[1][key] - a[1][key]).slice(0, 10);
  const list = await Promise.all(rows.map(async ([uid, m]) => {
    const u = await getUser(uid);
    return {
      id: uid,
      name: u ? u.globalName || u.username : 'مستخدم غير معروف',
      avatar: u ? u.displayAvatarURL({ size: 64, extension: 'png' }) : null,
      value: m[key],
      level: type === 'xp' ? levelFromXp(m.xp) : undefined,
    };
  }));
  res.json({ type, list });
}));

app.get('/api/leaders', auth, wrap(async (req, res) => {
  const top = globalRanking().slice(0, 20);
  const list = await Promise.all(top.map(async ([uid, points], i) => {
    const u = await getUser(uid);
    return {
      rank: i + 1, id: uid, points, me: uid === req.session.user.id,
      name: u ? u.globalName || u.username : 'مستخدم غير معروف',
      avatar: u ? u.displayAvatarURL({ size: 64, extension: 'png' }) : null,
    };
  }));
  res.json({ list });
}));

app.get('/api/subscriptions', auth, wrap(async (req, res) => {
  const shared = await sharedGuilds(req);
  const out = [];
  for (const g of shared) {
    const p = db.premium[g.id];
    if (p && p.history && p.history.length) out.push({ id: g.id, name: g.name, icon: g.icon, active: p.until > Date.now(), until: p.until, history: p.history });
  }
  res.json(out);
}));

// تفعيل البريميوم لسيرفر (للمالك فقط): /api/admin/premium?guild=ID&days=30   أو   &revoke=1
app.get('/api/admin/premium', auth, (req, res) => {
  if (!OWNER_IDS.includes(req.session.user.id)) return res.status(403).json({ error: 'forbidden' });
  const gid = String(req.query.guild || '');
  if (!/^\d{15,25}$/.test(gid)) return res.status(400).json({ error: 'bad_guild_id' });
  const now = Date.now();
  const p = db.premium[gid] || (db.premium[gid] = { until: 0, history: [] });
  if (req.query.revoke) {
    p.until = 0;
  } else {
    const days = parseInt(req.query.days, 10);
    if (!(days > 0 && days <= 3650)) return res.status(400).json({ error: 'bad_days' });
    p.until = Math.max(now, p.until) + days * 864e5;
    p.history.push({ start: now, end: p.until, days, by: req.session.user.id });
  }
  dirty = true;
  res.json({ ok: true, guild: gid, until: p.until });
});
// ===== شراء البريميوم بعملة OPS =====
const PREMIUM_COIN_PRICE = 200000;          // السعر
const PREMIUM_COIN_DAYS = 30;               // المدة
const PREMIUM_RENEW_WINDOW = 3 * 864e5;     // التجديد متاح لما يتبقى 3 أيام أو أقل

function coinPremState(gid, uid) {
  const bal = Number((dbr('economy', gid)[uid] || {}).balance) || 0;
  const p = db.premium[gid];
  const until = p && p.until > Date.now() ? p.until : 0;
  const left = until ? until - Date.now() : 0;
  let reason = null;
  if (until && left > PREMIUM_RENEW_WINDOW) reason = 'too_early';
  else if (bal < PREMIUM_COIN_PRICE) reason = 'no_balance';
  return { bal, until, reason };
}

app.get('/api/guild/:id/premium/coin', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const st = coinPremState(info.id, req.session.user.id);
  res.json({
    price: PREMIUM_COIN_PRICE, days: PREMIUM_COIN_DAYS,
    balance: st.bal, currency: ecoCfg(info.id).currencyName,
    active: st.until > 0, until: st.until, reason: st.reason,
  });
}));

app.post('/api/guild/:id/premium/coin', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const uid = req.session.user.id;
  // من هون وتحت كله بدون await عشان ما يصير شراء مرتين
  const st = coinPremState(info.id, uid);
  if (st.reason) return res.status(400).json({ error: st.reason });
  const now = Date.now();
  const p = db.premium[info.id] || (db.premium[info.id] = { until: 0, history: [] });
  p.history = p.history || [];
  p.until = Math.max(now, p.until || 0) + PREMIUM_COIN_DAYS * 864e5;
  p.history.push({ start: now, end: p.until, days: PREMIUM_COIN_DAYS, by: uid, via: 'coin' });
  ecoUser(info.id, uid).balance -= PREMIUM_COIN_PRICE;
    ecoLog(info.id, uid, -PREMIUM_COIN_PRICE, 'premium');
  dirty = true;
  res.json({ ok: true, until: p.until });
}));
// ===== إعدادات السيرفر: بروفايل البوت + الحماية =====
const S = (gid) => db.settings[gid] || (db.settings[gid] = {});
const SNOW = /^\d{15,25}$/;
const CDN = 'https://cdn.discordapp.com';
const ext = (h) => (String(h).startsWith('a_') ? 'gif' : 'png');
const discordMsg = (e) => (e && ((e.rawError && e.rawError.message) || e.message)) || 'discord_error';

// يرجّع معلومات السيرفر أو يرد بخطأ. manage = صلاحية إدارة، owner = مالك السيرفر فقط
async function ctxGuild(req, res, opt = {}) {
  const info = (await sharedGuilds(req)).find((g) => g.id === req.params.id);
  if (!info) { res.status(404).json({ error: 'not_found' }); return null; }
  if (opt.manage && !info.canManage) { res.status(403).json({ error: 'forbidden' }); return null; }
  if (opt.owner && !info.owner) { res.status(403).json({ error: 'owner_only' }); return null; }
  return info;
}

// ---------- بروفايل البوت (بريميوم) ----------
const imgCheck = (v, maxMb) => {
  if (v === null) return true;
  if (typeof v !== 'string') return 'bad_image';
  const m = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+\/=]+)$/.exec(v);
  if (!m) return 'bad_image';
  if (Buffer.byteLength(m[2], 'base64') > maxMb * 1048576) return 'too_large';
  return true;
};

app.get('/api/guild/:id/botprofile', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  let m = S(info.id).botProfile || {};
  try { m = await client.rest.get(Routes.guildMember(info.id, client.user.id)); } catch (_) {}
  const uid = client.user.id;
  res.json({
    guildName: info.name, canManage: info.canManage, premium: info.premium,
    bot: { name: client.user.username, tag: client.user.tag, avatar: client.user.displayAvatarURL({ size: 256, extension: 'png' }) },
    nick: m.nick || '',
    avatar: m.avatar ? `${CDN}/guilds/${info.id}/users/${uid}/avatars/${m.avatar}.${ext(m.avatar)}?size=256` : null,
    banner: m.banner ? `${CDN}/guilds/${info.id}/users/${uid}/banners/${m.banner}.${ext(m.banner)}?size=600` : null,
  });
}));

app.post('/api/guild/:id/botprofile', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (!isPremium(info.id)) return res.status(403).json({ error: 'premium_required' });
  const b = req.body || {};
  const body = {};
  if (b.reset === true) {
    body.nick = null; body.avatar = null; body.banner = null;
  } else {
    if ('nick' in b) {
      const nick = String(b.nick == null ? '' : b.nick).trim();
      if (nick.length > 32) return res.status(400).json({ error: 'bad_nick' });
      body.nick = nick || null;
    }
    for (const [k, mb] of [['avatar', 5], ['banner', 8]]) {
      if (!(k in b)) continue;
      const ok = imgCheck(b[k], mb);
      if (ok !== true) return res.status(400).json({ error: ok });
      body[k] = b[k];
    }
  }
  if (!Object.keys(body).length) return res.status(400).json({ error: 'nothing_to_update' });
  try {
    const m = await client.rest.patch(Routes.guildMember(info.id, '@me'), { body });
    S(info.id).botProfile = { nick: m.nick || null, avatar: m.avatar || null, banner: m.banner || null };
    dirty = true;
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'discord_error', detail: discordMsg(e) });
  }
}));

// ---------- الحماية الذكية (الإعدادات + المحرك تحت attachGuard) ----------
const LIMIT_KEYS = ['ban', 'kick', 'channels', 'roles', 'memberRoles'];
const ACTIONS = ['strip', 'kick', 'ban', 'log'];
function smartCfg(gid) {
  const s = S(gid).smart || {};
  const lim = s.limits || {};
  const limits = {};
  for (const k of LIMIT_KEYS) {
    limits[k] = {
      max: (lim[k] && lim[k].max) || 3,
      action: lim[k] && ACTIONS.includes(lim[k].action) ? lim[k].action : 'strip',
    };
  }
  const cl = s.cmdLimits || {};
  const cmdLimits = {};
  for (const k of CMD_LIMIT_KEYS) cmdLimits[k] = Math.min(100, Math.max(1, parseInt(cl[k], 10) || 3));
  return {
    enabled: !!s.enabled, logChannel: s.logChannel || null, whitelist: Array.isArray(s.whitelist) ? s.whitelist : [], limits,
    cmdLimits, cmdAction: CMD_LIMIT_ACTIONS.includes(s.cmdAction) ? s.cmdAction : 'strip',
  };
}
async function whitelistUsers(ids) {
  return Promise.all(ids.map(async (id) => {
    const u = await getUser(id);
    return { id, name: u ? u.globalName || u.username : 'مستخدم غير معروف', avatar: u ? u.displayAvatarURL({ size: 64, extension: 'png' }) : null };
  }));
}
function textChannels(gid) {
  const cg = client.guilds.cache.get(gid);
  if (!cg) return [];
  return [...cg.channels.cache.values()]
    .filter((c) => c.type === 0 || c.type === 5)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: c.name }));
}

// =====================  اللوقات + الترحيب والمغادرة  =====================
let canvasLib = null;
try { canvasLib = require('@napi-rs/canvas'); } catch (_) { /* اختياري: npm i @napi-rs/canvas لتوليد صورة الترحيب */ }
const WEL_DIR = path.resolve(DATA_DIR, 'ops-welcome');
const BG_EXT = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };

// =====================  تعريف اللوقات  =====================
// [المفتاح, العنوان, الوصف, الأيقونة, مجموعة قنوات setlog الاحتياطية, بريميوم]
const LOG_TYPES = {
  admin: [
    ['channels', 'القنوات', 'سجل إنشاء وحذف وتعديل القنوات', 'hash', 'channels'],
    ['purge', 'الحذف الجماعي', 'سجل حذف الرسائل الجماعية (Purge)', 'alert', 'mod', 1],
    ['serverupdate', 'تحديث السيرفر', 'سجل تغيير اسم أو صورة أو بنر السيرفر', 'gear', 'channels'],
    ['bots', 'البوتات', 'سجل إضافة البوتات', 'bot', 'members'],
    ['roles', 'الرتب', 'سجل تعديل وإنشاء الرتب', 'shield', 'roles'],
    ['roleassign', 'إعطاء وسحب الرتب', 'سجل إعطاء وسحب الرتب للأعضاء', 'shield', 'roles'],
    ['voicepull', 'السحب الصوتي', 'سجل سحب ونقل الأعضاء صوتياً', 'expand', 'voice'],
    ['bans', 'الباند / فك الباند', 'سجل الحظر وإزالة الحظر', 'ban', 'mod'],
    ['kick', 'الطرد', 'سجل طرد الأعضاء', 'userminus', 'mod'],
    ['voicemute', 'الميوت / الديفن', 'سجل الميوت والديفن الصوتي', 'micoff', 'voice'],
    ['timeouts', 'التايم اوت', 'سجل إعطاء وإزالة التايم اوت', 'clock', 'mod'],
    ['emojis', 'الإيموجي', 'سجل إضافة وحذف الإيموجي', 'smile', 'channels'],
    ['stickers', 'الملصقات', 'سجل إضافة وحذف الملصقات', 'smile', 'channels'],
    ['prison', 'السجن', 'سجل السجن وفك السجن', 'lock', 'mod'],
    ['warns', 'التحذيرات والرسائل الخاصة', 'سجل التحذيرات الإدارية', 'alert', 'mod', 1],
    ['voicekick', 'الطرد الصوتي', 'سجل طرد الأعضاء من الروم الصوتي', 'userminus', 'voice'],
    ['textmute', 'ميوت كتابي', 'سجل الميوت الكتابي', 'volume', 'mod'],
    ['reactions', 'التفاعلات', 'سجل إضافة وإزالة الرياكشنات', 'smile', 'messages'],
    ['rblock', 'حظر الرتب', 'سجل حظر وفك حظر الرتب للأعضاء', 'ban', 'roles', 1],
  ],
  general: [
    ['msgs', 'الرسائل النصية', 'سجل حذف وتعديل الرسائل', 'chat', 'messages'],
    ['images', 'الصور', 'سجل إرسال الصور والوسائط', 'image', 'messages'],
    ['botmsgs', 'رسائل البوتات', 'سجل حذف وتعديل رسائل البوتات', 'bot', 'messages'],
    ['joinleave', 'دخول/خروج الأعضاء', 'سجل دخول وخروج الأعضاء من السيرفر', 'userplus', 'members'],
    ['links', 'الروابط', 'سجل نشر الروابط', 'link', 'messages'],
    ['voicejoin', 'دخول/خروج صوتي', 'سجل الدخول والخروج من الرومات الصوتية', 'mic', 'voice'],
    ['selfmute', 'كتم/الغاء كتم النفس', 'سجل كتم وإلغاء كتم الأعضاء لأنفسهم', 'micoff', 'voice', 1],
    ['voiceswitch', 'تنقل بالرومات الصوتية', 'سجل تنقل الأعضاء بأنفسهم بين الرومات', 'expand', 'voice'],
    ['nicks', 'الأسماء المستعارة', 'سجل تغيير الأسماء في السيرفر', 'user', 'members'],
    ['accounts', 'تعديل الحسابات', 'سجل تغيير الأفتار واليوزر الحقيقي للحساب', 'user', 'members', 1],
  ],
};
const LOGT = {};
for (const [cat, rows] of Object.entries(LOG_TYPES)) {
  for (const [key, title, desc, icon, group, premium] of rows) LOGT[key] = { key, title, desc, icon, group, premium: !!premium, cat };
}
const DEF_COLOR = '#fbbf24';
const COLOR_RE = /^#[0-9a-f]{6}$/i;

// =====================  الترحيب: القيم الافتراضية  =====================
const WEL_DEF = {
  avatar: { x: 50, y: 33, size: 20, ar: 1 },
  username: { x: 50, y: 69, size: 9, color: '#ffffff' },
  text: { x: 50, y: 84, size: 7, color: '#d1d5db', content: 'Welcome' },
};

function safeUrl(u) {
  if (!u) return '';
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:') return null;
    const h = x.hostname.toLowerCase();
    if (h === 'localhost' || h.startsWith('[') || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.local') || h.endsWith('.internal')) return null;
    return x.href.slice(0, 500);
  } catch (_) { return null; }
}


// ---------- إعدادات اللوق ----------
const rawLog = (gid, key) => (((db.settings[gid] || {}).logcfg) || {})[key] || {};
function logCfg(gid, key) {
  const def = LOGT[key];
  const c = rawLog(gid, key);
  let enabled = c.enabled === undefined ? !def.premium : !!c.enabled;
  if (def.premium && !isPremium(gid)) enabled = false;
  const fb = (((db.settings[gid] || {}).logs) || {}).ch;
  return {
    enabled,
    channel: SNOW.test(String(c.channel || '')) ? c.channel : null,
    color: COLOR_RE.test(String(c.color || '')) ? c.color : DEF_COLOR,
    fallback: fb && fb[def.group] ? fb[def.group] : null,
  };
}

const logMain = (gid) => {
  const m = (db.settings[gid] || {}).logmain || {};
  return { enabled: !!m.enabled, channel: SNOW.test(String(m.channel || '')) ? m.channel : null };
};
function logTarget(guild, key) {
  if (!guild || !has(LOGT, key)) return null;
  const c = logCfg(guild.id, key);
  if (!c.enabled) return null;
  const m = logMain(guild.id);
  const ch = guild.channels.cache.get((m.enabled && m.channel) || c.channel || c.fallback);
  if (!ch || typeof ch.send !== 'function') return null;
  return { c, ch };
}
function L(guild, key, title, desc, o = {}) {
  try {
    const t = logTarget(guild, key);
    if (!t) return;
    const gi = guild.iconURL({ size: 64 }) || undefined;
    const au = o.author || null, ex = o.exec || null;
    const e = new EmbedBuilder()
      .setColor(parseInt(t.c.color.slice(1), 16))
      .setAuthor(au ? { name: au.globalName || au.username, iconURL: au.displayAvatarURL({ size: 64 }) } : { name: guild.name, iconURL: gi })
      .setDescription((`**${title}**` + (desc ? `\n\n${desc}` : '')).slice(0, 3900))
      .setFooter(ex ? { text: ex.username, iconURL: ex.displayAvatarURL({ size: 64 }) } : { text: guild.name, iconURL: gi })
      .setTimestamp();
    t.ch.send({ embeds: [e], allowedMentions: { parse: [] } }).catch(() => {});
  } catch (_) { /* اللوق ما لازم يكسر البوت */ }
}
// يجيب منفّذ الإجراء من سجل التدقيق (Audit Log). يتشارك الطلب بين اللوق والحماية.
const auditCache = new Map();
function execOf(guild, type, targetId) {
  const k = `${guild.id}:${type}:${targetId || ''}`;
  if (auditCache.has(k)) return auditCache.get(k);
  const p = (async () => {
    const me = guild.members.me;
    if (!me || !me.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
    for (const wait of [700, 1600]) {
      await new Promise((r) => setTimeout(r, wait));
      try {
        const logs = await guild.fetchAuditLogs({ type, limit: 10 });
        const now = Date.now();
        const en = logs.entries.find((e) => (!targetId || (e.target && e.target.id === targetId)) && now - e.createdTimestamp < 20000);
        if (en) return { id: en.id, user: en.executor, reason: en.reason };
      } catch (_) { return null; }
    }
    return null;
  })();
  auditCache.set(k, p);
  setTimeout(() => auditCache.delete(k), 2500);
  return p;
}
async function LX(guild, key, title, desc, type, targetId) {
  try {
    if (!logTarget(guild, key)) return;
    const e = await execOf(guild, type, targetId);
    const extra = e && e.user ? `\n**المشرف المسؤول:**\n<@${e.user.id}>` + (e.reason ? `\n**سبب التنفيذ:** ${cut(e.reason, 200)}` : '') : '';
    L(guild, key, title, (desc || '') + extra, { exec: e && e.user });
  } catch (_) {}
}
// فرق صلاحيات الروم (للوق تعديل الروم)
function permDiff(o, n) {
  const out = [];
  const oc = o.permissionOverwrites ? o.permissionOverwrites.cache : new Map();
  const nc = n.permissionOverwrites ? n.permissionOverwrites.cache : new Map();
  for (const id of new Set([...oc.keys(), ...nc.keys()])) {
    const a = oc.get(id), b = nc.get(id), ref = b || a;
    const who = id === n.guild.id ? '@everyone' : ref.type === 0 ? `<@&${id}>` : `<@${id}>`;
    const st = (ow, bit) => (!ow ? 0 : (ow.allow.bitfield & bit) ? 1 : (ow.deny.bitfield & bit) ? -1 : 0);
    for (const [name, bit] of Object.entries(PermissionFlagsBits)) {
      const s1 = st(a, bit), s2 = st(b, bit);
      if (s1 !== s2) out.push(`↘️ ${who}\n${s2 === 1 ? '✅' : s2 === -1 ? '⛔' : '➖'} ${name}`);
    }
  }
  return out.slice(0, 12);
}
const who = (u) => (u ? `<@${u.id}> (${u.username || u.tag || u.id})` : 'غير معروف');
const cut = (s, n = 900) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };

// ---------- API: اللوقات ----------
app.get('/api/guild/:id/logs', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const cat = req.query.cat === 'general' ? 'general' : 'admin';
  res.json({
    canManage: info.canManage,
    guildPremium: isPremium(info.id),
    channels: textChannels(info.id),
    main: logMain(info.id),
    items: LOG_TYPES[cat].map(([key]) => {
      const def = LOGT[key];
      const c = logCfg(info.id, key);
      return { key, title: def.title, desc: def.desc, icon: def.icon, premium: def.premium, enabled: c.enabled, channel: c.channel, color: c.color };
    }),
  });
}));

app.put('/api/guild/:id/logs', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const body = req.body || {};
  const patch = body.items === undefined ? {} : body.items;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return res.status(400).json({ error: 'bad_value' });
  const keys = Object.keys(patch);
  if (keys.length > Object.keys(LOGT).length) return res.status(400).json({ error: 'bad_value' });
  if (!keys.length && !body.main) return res.status(400).json({ error: 'bad_value' });
  const chans = new Set(textChannels(info.id).map((c) => c.id));
  const next = {};
  for (const k of keys) {
    if (!has(LOGT, k)) return res.status(404).json({ error: 'not_found' });
    const b = patch[k] || {};
    const cur = { ...rawLog(info.id, k) };
    if ('enabled' in b) {
      cur.enabled = b.enabled === true;
      if (cur.enabled && LOGT[k].premium && !isPremium(info.id)) return res.status(403).json({ error: 'premium_required' });
    }
    if ('channel' in b) {
      if (b.channel === null || b.channel === '') cur.channel = null;
      else if (typeof b.channel === 'string' && chans.has(b.channel)) cur.channel = b.channel;
      else return res.status(400).json({ error: 'bad_channel' });
    }
    if ('color' in b) {
      if (typeof b.color !== 'string' || !COLOR_RE.test(b.color)) return res.status(400).json({ error: 'bad_value' });
      cur.color = b.color;
    }
    next[k] = cur;
  }
  let main = null;
  if (body.main) {
    const m = body.main;
    if (typeof m !== 'object') return res.status(400).json({ error: 'bad_value' });
    const ch = m.channel === null || m.channel === '' || m.channel === undefined ? null : m.channel;
    if (ch !== null && !(typeof ch === 'string' && chans.has(ch))) return res.status(400).json({ error: 'bad_channel' });
    if (m.enabled === true && !ch) return res.status(400).json({ error: 'bad_channel' });
    main = { enabled: m.enabled === true, channel: ch };
  }
  const s = S(info.id);
  if (keys.length) s.logcfg = Object.assign(s.logcfg || {}, next);
  if (main) s.logmain = main;
  dirty = true;
  res.json({ ok: true });
}));

// ---------- أحداث ديسكورد → لوق ----------
function attachLogs(client) {
  if (!client) return;
  const on = (ev, fn) => client.on(ev, (...args) => {
    try { const r = fn(...args); if (r && r.catch) r.catch(() => {}); } catch (_) {}
  });
  const me = () => (client.user ? client.user.id : null);

  // --- أدمن (مع منفّذ الإجراء من سجل التدقيق) ---
    on(Events.ChannelCreate, (c) => c.guild && LX(c.guild, 'channels', `🏘️ تم إنشاء روم: \`${c.name}\``, '', AuditLogEvent.ChannelCreate, c.id));
  on(Events.ChannelDelete, (c) => c.guild && LX(c.guild, 'channels', `🏘️ تم إزالة روم: \`${c.name}\``, '', AuditLogEvent.ChannelDelete, c.id));
  on(Events.ChannelUpdate, (o, n) => {
    if (!n.guild) return;
    if (o.name !== n.name) LX(n.guild, 'channels', `🏘️ تم تغيير اسم روم: <#${n.id}>`, `**قبل:** \`${o.name}\`\n**بعد:** \`${n.name}\``, AuditLogEvent.ChannelUpdate, n.id);
    const pd = permDiff(o, n);
    if (pd.length) LX(n.guild, 'channels', `🏘️ تم تحديث صلاحيات روم: \`${n.name}\``, '**Permissions:**\n' + pd.join('\n'), AuditLogEvent.ChannelOverwriteUpdate, n.id);
  });
  on(Events.GuildRoleCreate, (r) => LX(r.guild, 'roles', '➕ إنشاء رتبة', `**${cut(r.name, 100)}** (${r.id})`, AuditLogEvent.RoleCreate, r.id));
  on(Events.GuildRoleDelete, (r) => LX(r.guild, 'roles', '🗑️ حذف رتبة', `**${cut(r.name, 100)}** (${r.id})`, AuditLogEvent.RoleDelete, r.id));
  on(Events.GuildRoleUpdate, (o, n) => {
    const ch = [];
    if (o.name !== n.name) ch.push(`**الاسم:** \`${o.name}\` ← \`${n.name}\``);
    if (o.color !== n.color) ch.push('**اللون:** تم التغيير');
    if (o.permissions.bitfield !== n.permissions.bitfield) ch.push('**الصلاحيات:** تم التغيير');
    if (ch.length) LX(n.guild, 'roles', '✏️ تعديل رتبة', `<@&${n.id}>\n${ch.join('\n')}`, AuditLogEvent.RoleUpdate, n.id);
  });
  on(Events.GuildBanAdd, (b) => LX(b.guild, 'bans', '🔨 حظر عضو', `**العضو:** ${who(b.user)}\n**السبب:** ${cut(b.reason || '-', 300)}`, AuditLogEvent.MemberBanAdd, b.user.id));
  on(Events.GuildBanRemove, (b) => LX(b.guild, 'bans', '✅ فك حظر', `**العضو:** ${who(b.user)}`, AuditLogEvent.MemberBanRemove, b.user.id));
  on(Events.GuildEmojiCreate, (e) => LX(e.guild, 'emojis', '➕ إضافة إيموجي', `${e} \`${e.name}\``, AuditLogEvent.EmojiCreate, e.id));
  on(Events.GuildEmojiDelete, (e) => LX(e.guild, 'emojis', '🗑️ حذف إيموجي', `\`${e.name}\` (${e.id})`, AuditLogEvent.EmojiDelete, e.id));
  on(Events.GuildStickerCreate, (s) => LX(s.guild, 'stickers', '➕ إضافة ملصق', `\`${s.name}\``, AuditLogEvent.StickerCreate, s.id));
  on(Events.GuildStickerDelete, (s) => LX(s.guild, 'stickers', '🗑️ حذف ملصق', `\`${s.name}\``, AuditLogEvent.StickerDelete, s.id));
  on(Events.GuildUpdate, (o, n) => {
    const ch = [];
    if (o.name !== n.name) ch.push(`**الاسم:** \`${o.name}\` ← \`${n.name}\``);
    if (o.icon !== n.icon) ch.push('**الصورة:** تم التغيير');
    if (o.banner !== n.banner) ch.push('**البنر:** تم التغيير');
    if (ch.length) LX(n, 'serverupdate', '⚙️ تحديث السيرفر', ch.join('\n'), AuditLogEvent.GuildUpdate, n.id);
  });
  on(Events.MessageReactionAdd, async (rx, u) => {
    if (u.bot) return;
    if (rx.partial) await rx.fetch().catch(() => null);
    const m = rx.message;
    if (m && m.guild) L(m.guild, 'reactions', '➕ إضافة تفاعل', `${who(u)} ${rx.emoji}\n[الرسالة](https://discord.com/channels/${m.guild.id}/${m.channelId}/${m.id})`);
  });
  on(Events.MessageReactionRemove, async (rx, u) => {
    if (u.bot) return;
    if (rx.partial) await rx.fetch().catch(() => null);
    const m = rx.message;
    if (m && m.guild) L(m.guild, 'reactions', '➖ إزالة تفاعل', `${who(u)} ${rx.emoji}\n[الرسالة](https://discord.com/channels/${m.guild.id}/${m.channelId}/${m.id})`);
  });

  // --- أعضاء: رتب / لقب / تايم أوت / حساب ---
  on(Events.GuildMemberUpdate, (o, n) => {
    const g = n.guild;
    if (o.partial) return;
    const added = n.roles.cache.filter((r) => !o.roles.cache.has(r.id));
    const removed = o.roles.cache.filter((r) => !n.roles.cache.has(r.id));
    if (added.size || removed.size) {
      LX(g, 'roleassign', '🎭 تغيير رتب عضو',
        `**العضو:** ${who(n.user)}` + (added.size ? `\n**أضيف:** ${added.map((r) => `<@&${r.id}>`).join(' ')}` : '') + (removed.size ? `\n**سُحب:** ${removed.map((r) => `<@&${r.id}>`).join(' ')}` : ''), AuditLogEvent.MemberRoleUpdate, n.id);
    }
    if (o.nickname !== n.nickname) L(g, 'nicks', '📝 تغيير لقب', `**العضو:** ${who(n.user)}\n**قبل:** ${cut(o.nickname || '-', 100)}\n**بعد:** ${cut(n.nickname || '-', 100)}`);
    if (o.communicationDisabledUntilTimestamp !== n.communicationDisabledUntilTimestamp) {
      const t = n.communicationDisabledUntilTimestamp;
      LX(g, 'timeouts', t && t > Date.now() ? '⏳ تايم أوت' : '✅ إزالة تايم أوت',
        `**العضو:** ${who(n.user)}` + (t && t > Date.now() ? `\n**ينتهي:** <t:${Math.floor(t / 1000)}:R>` : ''), AuditLogEvent.MemberUpdate, n.id);
    }
    if (o.user && n.user && (o.user.avatar !== n.user.avatar || o.user.username !== n.user.username || o.user.globalName !== n.user.globalName)) {
      const ch = [];
      if (o.user.username !== n.user.username) ch.push(`**اليوزر:** \`${o.user.username}\` ← \`${n.user.username}\``);
      if (o.user.globalName !== n.user.globalName) ch.push(`**الاسم المعروض:** \`${o.user.globalName || '-'}\` ← \`${n.user.globalName || '-'}\``);
      if (o.user.avatar !== n.user.avatar) ch.push('**الأفتار:** تم التغيير');
      L(g, 'accounts', '👤 تعديل حساب', `**العضو:** ${who(n.user)}\n${ch.join('\n')}`);
    }
  });

  // --- خروج الأعضاء + رسالة المغادرة ---
  on(Events.GuildMemberRemove, (m) => {
    if (!m.user || m.user.id === me()) return;
    if (logTarget(m.guild, 'kick')) {
      execOf(m.guild, AuditLogEvent.MemberKick, m.user.id).then((e) => {
        if (e && e.user && e.user.id !== me()) L(m.guild, 'kick', '👢 طرد عضو', `**العضو:** ${who(m.user)}\n**المنفذ:** ${who(e.user)}` + (e.reason ? `\n**السبب:** ${cut(e.reason, 200)}` : ''));
      }).catch(() => {});
    }
    if (m.user.bot) return;
    L(m.guild, 'joinleave', '📤 خروج عضو', `**العضو:** ${who(m.user)}`);
    return memberLeave(m);
  });

  // --- صوت ---
  on(Events.VoiceStateUpdate, (o, n) => {
    if (n.id === me()) return;
    const g = n.guild;
    const u = (n.member || o.member || {}).user || { id: n.id };
    if (!o.channelId && n.channelId) L(g, 'voicejoin', '🔊 دخول صوتي', `${who(u)} ← <#${n.channelId}>`);
    else if (o.channelId && !n.channelId) L(g, 'voicejoin', '🔇 خروج صوتي', `${who(u)} ← <#${o.channelId}>`);
    else if (o.channelId && n.channelId && o.channelId !== n.channelId) L(g, 'voiceswitch', '🔀 تنقل صوتي', `${who(u)}\n<#${o.channelId}> ← <#${n.channelId}>`);
    if (o.serverMute !== n.serverMute || o.serverDeaf !== n.serverDeaf) {
      L(g, 'voicemute', '🎙️ ميوت/ديفن من الإدارة',
        `${who(u)}\n**ميوت:** ${n.serverMute ? 'نعم' : 'لا'} • **ديفن:** ${n.serverDeaf ? 'نعم' : 'لا'}`);
    }
    if (o.selfMute !== n.selfMute || o.selfDeaf !== n.selfDeaf) {
      L(g, 'selfmute', '🎧 كتم النفس', `${who(u)}\n**ميوت:** ${n.selfMute ? 'نعم' : 'لا'} • **ديفن:** ${n.selfDeaf ? 'نعم' : 'لا'}`);
    }
  });

  // --- رسائل ---
    on(Events.MessageDelete, (m) => {
    if (!m.guild || (m.author && m.author.id === me())) return;
    const isBot = !!(m.author && m.author.bot);
    const att = m.attachments && m.attachments.size ? `\n📎 مرفقات: ${m.attachments.size}` : '';
    L(m.guild, isBot ? 'botmsgs' : 'msgs',
      `رسالة أُرسلت بواسطة ${m.author ? `<@${m.author.id}>` : 'غير معروف'} مُسحت في <#${m.channelId}>.`,
      (m.content ? cut(m.content) : '(غير متوفر)') + att,
      { author: m.author });
  });
  on(Events.MessageUpdate, (o, n) => {
    if (!n.guild || !n.author || n.author.id === me()) return;
    if (o.content == null || o.content === n.content) return;
    const fx = (s) => cut(String(s || '').replace(/```/g, "'''"), 700);
    L(n.guild, n.author.bot ? 'botmsgs' : 'msgs',
      `رسالة أُرسلت بواسطة <@${n.author.id}> عُدِّلت في <#${n.channelId}>. [✏️ انتقل إلى الرسالة](${n.url})`,
      `**القديمة**\n\`\`\`\n${fx(o.content)}\n\`\`\`\n**الجديدة**\n\`\`\`\n${fx(n.content)}\n\`\`\``,
      { author: n.author });
  });
  on(Events.MessageCreate, (m) => {
    if (!m.guild || !m.author || m.author.bot || m.webhookId) return;
    const imgs = [...(m.attachments ? m.attachments.values() : [])].filter((a) => /^(image|video)\//.test(a.contentType || ''));
    if (imgs.length) L(m.guild, 'images', '🖼️ إرسال صور', `${who(m.author)} في <#${m.channelId}>\n${imgs.slice(0, 5).map((a) => a.url).join('\n')}`);
    const links = String(m.content || '').match(/https?:\/\/[^\s<>]+/gi);
    if (links) L(m.guild, 'links', '🔗 نشر روابط', `${who(m.author)} في <#${m.channelId}>\n${cut(links.slice(0, 5).join('\n'), 1500)}`);
  });
}

// =====================  محرك الحماية الذكية (Anti-Nuke)  =====================
const GUARD_WINDOW = 60000; // العدّاد: عدد العمليات خلال آخر 60 ثانية
const guardHits = new Map();
const guardSeen = new Set();
const GUARD_TITLES = { ban: 'حماية الباند', kick: 'حماية الطرد', channels: 'حماية القنوات', roles: 'حماية الرتب', memberRoles: 'حماية رتب الأعضاء' };
const GUARD_FB = { ban: 'mod', kick: 'mod', channels: 'channels', roles: 'roles', memberRoles: 'roles' };
const DANGER_PERMS = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ModerateMembers', 'ManageWebhooks'];

async function guardPunish(guild, member, action) {
  if (action === 'log') return { done: true, text: 'تسجيل في اللوق فقط' };
  const me = guild.members.me;
  if (member.id === guild.ownerId) return { done: false, text: 'العضو مالك السيرفر' };
  if (!me || member.roles.highest.position >= me.roles.highest.position) return { done: false, text: 'العضو اعلى من البوت' };
  try {
    if (action === 'ban') {
      if (!member.bannable) return { done: false, text: 'ما أقدر أحظره (صلاحيات البوت)' };
      await member.ban({ reason: 'OPS: تعدي حدود الحماية' });
      return { done: true, text: 'تم حظر العضو' };
    }
    if (action === 'kick') {
      if (!member.kickable) return { done: false, text: 'ما أقدر أطرده (صلاحيات البوت)' };
      await member.kick('OPS: تعدي حدود الحماية');
      return { done: true, text: 'تم طرد العضو' };
    }
    const bad = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && DANGER_PERMS.some((p) => r.permissions.has(PermissionFlagsBits[p])));
    if (!bad.size) return { done: true, text: 'ما عنده رتب إدارية لسحبها' };
    const ok = bad.filter((r) => r.editable);
    if (!ok.size) return { done: false, text: 'رتب العضو الإدارية اعلى من البوت' };
    await member.roles.remove(ok.map((r) => r.id), 'OPS: تعدي حدود الحماية');
    return { done: true, text: `تم سحب ${ok.size} رتبة إدارية` };
  } catch (e) { return { done: false, text: 'فشل التنفيذ: ' + discordMsg(e) }; }
}

async function guardCheck(guild, key, auditType, targetId, what, lines) {
  const cfg = smartCfg(guild.id);
  if (!cfg.enabled) return;
  const e = await execOf(guild, auditType, targetId);
  if (!e || !e.user) return;
  const uid = e.user.id;
  if (uid === client.user.id || uid === guild.ownerId || cfg.whitelist.includes(uid)) return;
  if (key === 'memberRoles' && e.user.bot) return;
  if (e.id) {
    if (guardSeen.has(e.id)) return;
    guardSeen.add(e.id);
    setTimeout(() => guardSeen.delete(e.id), 120000);
  }
  const k = `${guild.id}:${uid}:${key}`;
  const now = Date.now();
  const hits = (guardHits.get(k) || []).filter((t) => now - t < GUARD_WINDOW);
  hits.push(now);
  guardHits.set(k, hits);
  const lim = cfg.limits[key];
  if (hits.length <= lim.max) return;
  guardHits.set(k, []);
  const member = await guild.members.fetch(uid).catch(() => null);
  const res = member ? await guardPunish(guild, member, lim.action) : { done: false, text: 'العضو غير موجود بالسيرفر' };
  const fb = ((S(guild.id).logs || {}).ch || {})[GUARD_FB[key]];
  const ch = guild.channels.cache.get(cfg.logChannel) || guild.channels.cache.get(fb);
  if (!ch || typeof ch.send !== 'function') return;
  const emb = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(`⚠️ ${GUARD_TITLES[key]}`)
    .setDescription([
      `**العضو :** <@${uid}>`,
      `**معرف العضو :** \`${uid}\``,
      '',
      res.done ? `**تم الاجراء :** ${res.text}` : `**لم يتم الاجراء :** ${res.text}`,
      '',
      `**السبب :** تعدي حدود الحماية في ${what}`,
      ...lines,
    ].join('\n'))
    .setFooter({ text: client.user.username })
    .setTimestamp();
  ch.send({ embeds: [emb], allowedMentions: { parse: [] } }).catch(() => {});
}

function attachGuard(client) {
  if (!client) return;
  const on = (ev, fn) => client.on(ev, (...args) => {
    try { const r = fn(...args); if (r && r.catch) r.catch(() => {}); } catch (_) {}
  });
  const chInfo = (c) => [`**القناة :** <#${c.id}>`, `**معرف القناة :** \`${c.id}\``];
  const chChanged = (o, n) => o.name !== n.name || o.topic !== n.topic || o.parentId !== n.parentId || o.nsfw !== n.nsfw ||
    JSON.stringify([...(o.permissionOverwrites ? o.permissionOverwrites.cache.values() : [])].map((p) => [p.id, String(p.allow.bitfield), String(p.deny.bitfield)]).sort()) !==
    JSON.stringify([...(n.permissionOverwrites ? n.permissionOverwrites.cache.values() : [])].map((p) => [p.id, String(p.allow.bitfield), String(p.deny.bitfield)]).sort());
  on(Events.ChannelCreate, (c) => c.guild && guardCheck(c.guild, 'channels', AuditLogEvent.ChannelCreate, c.id, 'إنشاء قناة', chInfo(c)));
  on(Events.ChannelDelete, (c) => c.guild && guardCheck(c.guild, 'channels', AuditLogEvent.ChannelDelete, c.id, 'حذف قناة', [`**القناة :** \`#${c.name}\``, `**معرف القناة :** \`${c.id}\``]));
  on(Events.ChannelUpdate, (o, n) => n.guild && chChanged(o, n) && guardCheck(n.guild, 'channels', AuditLogEvent.ChannelUpdate, n.id, 'تعديل قناة', chInfo(n)));
  const rInfo = (r) => [`**الرتبة :** <@&${r.id}>`, `**معرف الرتبة :** \`${r.id}\``];
  on(Events.GuildRoleCreate, (r) => guardCheck(r.guild, 'roles', AuditLogEvent.RoleCreate, r.id, 'إنشاء رتبة', rInfo(r)));
  on(Events.GuildRoleDelete, (r) => guardCheck(r.guild, 'roles', AuditLogEvent.RoleDelete, r.id, 'حذف رتبة', [`**الرتبة :** \`${cut(r.name, 80)}\``, `**معرف الرتبة :** \`${r.id}\``]));
  on(Events.GuildRoleUpdate, (o, n) => {
    if (o.name === n.name && o.color === n.color && o.permissions.bitfield === n.permissions.bitfield && o.hoist === n.hoist && o.mentionable === n.mentionable) return;
    return guardCheck(n.guild, 'roles', AuditLogEvent.RoleUpdate, n.id, 'تعديل رتبة', rInfo(n));
  });
  on(Events.GuildBanAdd, (b) => guardCheck(b.guild, 'ban', AuditLogEvent.MemberBanAdd, b.user.id, 'حظر الأعضاء', [`**العضو المحظور :** <@${b.user.id}>`]));
  on(Events.GuildMemberRemove, (m) => m.user && guardCheck(m.guild, 'kick', AuditLogEvent.MemberKick, m.user.id, 'طرد الأعضاء', [`**العضو المطرود :** <@${m.user.id}>`]));
  on(Events.GuildMemberUpdate, (o, n) => {
    if (o.partial) return;
    const changed = n.roles.cache.size !== o.roles.cache.size || n.roles.cache.some((r) => !o.roles.cache.has(r.id));
    if (changed) return guardCheck(n.guild, 'memberRoles', AuditLogEvent.MemberRoleUpdate, n.id, 'تعديل رتب الأعضاء', [`**العضو المستهدف :** <@${n.id}>`]);
  });
}

// =====================  الرد التلقائي + الإيمبد  =====================
const newId = () => crypto.randomBytes(5).toString('hex');
const AR_MATCH = ['exact', 'contains', 'starts'];
const arLimit = (gid) => (isPremium(gid) ? 100 : 20);
const arNorm = (s) => String(s || '').normalize('NFKC').toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ').replace(/^[\s!?.,،؛؟~'"]+|[\s!?.,،؛؟~'"]+$/g, '');
const arRules = (gid) => arr(((db.settings[gid] || {}).autoreply || {}).rules).filter((r) => r && typeof r.keyword === 'string');
const codeErr = (c) => { const e = new Error(c); e.code = c; return e; };

function arClean(list, gid) {
  if (!Array.isArray(list)) throw codeErr('bad_value');
  if (list.length > arLimit(gid)) throw codeErr('limit_reached');
  const roles = new Set(roleList(gid).map((r) => r.id));
  const chans = new Set(textChannels(gid).map((c) => c.id));
  const ids = (v, set) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > 50) throw codeErr('bad_value');
    return [...new Set(v.map(String))].filter((x) => set.has(x));
  };
  const seen = new Set();
  return list.map((r) => {
    if (!r || typeof r !== 'object') throw codeErr('bad_value');
    const keyword = String(r.keyword || '').trim(), reply = String(r.reply || '').trim();
    if (!keyword || keyword.length > 100) throw codeErr('bad_keyword');
    if (!reply || reply.length > 1000) throw codeErr('bad_reply');
    if (!AR_MATCH.includes(r.match)) throw codeErr('bad_value');
    let id = String(r.id || '');
    if (!/^[a-f0-9]{6,16}$/.test(id) || seen.has(id)) id = newId();
    seen.add(id);
    return {
      id, keyword, match: r.match, reply, enabled: r.enabled !== false,
      allowRoles: ids(r.allowRoles, roles), blockRoles: ids(r.blockRoles, roles),
      allowChannels: ids(r.allowChannels, chans), blockChannels: ids(r.blockChannels, chans),
    };
  });
}

app.get('/api/guild/:id/autoreply', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), max: arLimit(info.id), roles: roleList(info.id), channels: textChannels(info.id), rules: arRules(info.id) });
}));
app.put('/api/guild/:id/autoreply', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  let rules;
  try { rules = arClean((req.body || {}).rules, info.id); }
  catch (e) { if (e.code) return res.status(400).json({ error: e.code }); throw e; }
  S(info.id).autoreply = { rules };
  dirty = true;
  res.json({ ok: true, rules });
}));

const arCool = new Map();
setInterval(() => { const c = Date.now() - 60000; for (const [k, v] of arCool) if (v < c) arCool.delete(k); }, 60000);
async function onAutoReply(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId || !msg.content) return;
  const rules = arRules(msg.guildId);
  if (!rules.length) return;
  const text = arNorm(msg.content);
  if (!text) return;
  if (resolveCmd(msg.guildId, msg.content.trim().split(/\s+/)[0].toLowerCase())) return;
  const chIds = [msg.channelId, msg.channel && msg.channel.parentId].filter(Boolean);
  const myRoles = msg.member ? msg.member.roles.cache : null;
  for (const r of rules) {
    if (r.enabled === false) continue;
    const k = arNorm(r.keyword);
    if (!k) continue;
    const hit = r.match === 'exact' ? text === k : r.match === 'starts' ? text.startsWith(k) : text.includes(k);
    if (!hit) continue;
    if (arr(r.blockChannels).some((x) => chIds.includes(x))) continue;
    if (arr(r.allowChannels).length && !arr(r.allowChannels).some((x) => chIds.includes(x))) continue;
    if (myRoles && arr(r.blockRoles).some((x) => myRoles.has(x))) continue;
    if (arr(r.allowRoles).length && !(myRoles && arr(r.allowRoles).some((x) => myRoles.has(x)))) continue;
    const ck = msg.author.id + ':' + r.id, now = Date.now();
    if (now - (arCool.get(ck) || 0) < 4000) return;
    arCool.set(ck, now);
    const out = tpl(r.reply, { user: `<@${msg.author.id}>`, userName: msg.author.globalName || msg.author.username, server: msg.guild.name, memberCount: msg.guild.memberCount });
    await msg.reply({ content: out.slice(0, 2000), allowedMentions: { users: [msg.author.id], repliedUser: false } }).catch(() => {});
    return;
  }
}

// ---------- الإيمبد ----------
function embCore(d) {
  const e = {};
  const c = parseInt(String(d.color || '').slice(1), 16);
  if (Number.isFinite(c)) e.color = c;
  const au = d.author || {}, ft = d.footer || {};
  if (au.name) e.author = Object.assign({ name: au.name }, au.icon ? { icon_url: au.icon } : {}, au.url ? { url: au.url } : {});
  if (d.title) { e.title = d.title; if (d.titleUrl) e.url = d.titleUrl; }
  if (d.description) e.description = d.description;
  if (d.thumbnail) e.thumbnail = { url: d.thumbnail };
  if (d.fields && d.fields.length) e.fields = d.fields.map((f) => ({ name: f.name, value: f.value, inline: !!f.inline }));
  if (d.image) e.image = { url: d.image };
  if (ft.text) e.footer = Object.assign({ text: ft.text }, ft.icon ? { icon_url: ft.icon } : {});
  const filled = Object.keys(e).some((k) => k !== 'color');
  return { content: d.content || '', embed: filled ? e : null };
}
function embMeasure(d) {
  const core = embCore(d);
  const e = core.embed || {};
  let chars = core.content.length + String(e.title || '').length + String(e.description || '').length + String((e.author || {}).name || '').length + String((e.footer || {}).text || '').length;
  for (const f of e.fields || []) chars += f.name.length + f.value.length;
  for (const a of (d.kind !== 'none' ? d.actions || [] : [])) chars += String(a.label || '').length;
  const s = JSON.stringify({ content: core.content, embed: core.embed });
  const bytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(s) : new TextEncoder().encode(s).length;
  return { chars, bytes };
}

const EMB_STYLE = { primary: 1, secondary: 2, success: 3, danger: 4 };
const embLimits = (gid) => { const p = isPremium(gid); return { chars: p ? 6000 : 1500, bytes: p ? 10240 : 3584, actions: p ? 25 : 5, count: p ? 50 : 10 }; };
const embList = (gid) => arr((db.settings[gid] || {}).embeds).filter((e) => e && e.id);
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣/u;

function embClean(b, gid, id) {
  if (!b || typeof b !== 'object') throw codeErr('bad_value');
  const L = embLimits(gid);
  const s = (v, max) => { const t = v == null ? '' : String(v).trim(); if (t.length > max) throw codeErr('bad_text'); return t; };
  const url = (v) => { const t = s(v, 500); if (!t) return ''; const u = safeUrl(t); if (u === null) throw codeErr('bad_url'); return u; };
  const name = s(b.name, 60);
  if (!name) throw codeErr('emb_name');
  const cg = client && client.guilds.cache.get(gid);
  let channel = null;
  if (b.channel) {
    if (!SNOW.test(String(b.channel)) || !textChannels(gid).some((c) => c.id === b.channel)) throw codeErr('bad_channel');
    channel = b.channel;
  }
  const kind = ['none', 'button', 'select'].includes(b.kind) ? b.kind : 'none';
  const roles = new Set(roleList(gid).map((r) => r.id));
  if (!Array.isArray(b.fields || []) || (b.fields || []).length > 10) throw codeErr('bad_value');
  if (!Array.isArray(b.actions || []) || (b.actions || []).length > L.actions) throw codeErr('limit_reached');
  const au = b.author || {}, ft = b.footer || {};
  const doc = {
    id, name, channel,
    content: s(b.content, 2000),
    mode: b.mode === 'v2' ? 'v2' : 'classic',
    color: COLOR_RE.test(String(b.color)) ? String(b.color).toLowerCase() : '#fbbf24',
    author: { name: s(au.name, 256), icon: url(au.icon), url: url(au.url) },
    title: s(b.title, 256), titleUrl: url(b.titleUrl),
    description: s(b.description, 4096),
    thumbnail: url(b.thumbnail),
    fields: (b.fields || []).map((f) => {
      const fn = s(f && f.name, 256), fv = s(f && f.value, 1024);
      if (!fn || !fv) throw codeErr('bad_field');
      return { name: fn, value: fv, inline: !!(f && f.inline) };
    }),
    image: url(b.image),
    footer: { text: s(ft.text, 2048), icon: url(ft.icon) },
    timestamp: b.timestamp === true,
    kind, placeholder: s(b.placeholder, 150),
    actions: kind === 'none' ? [] : (b.actions || []).map((a) => {
      a = a || {};
      const label = s(a.label, 80), emoji = s(a.emoji, 64);
      if (!label && (!emoji || kind === 'select')) throw codeErr('bad_label');
      if (emoji && !/^<a?:\w{1,32}:\d{15,25}>$/.test(emoji) && !EMOJI_RE.test(emoji)) throw codeErr('bad_emoji');
      let roleId = '';
      if (a.roleId) {
        const role = cg && cg.roles.cache.get(String(a.roleId));
        if (!role || !roles.has(role.id)) throw codeErr('bad_value');
        if (DANGER_PERMS.some((p) => role.permissions.has(PermissionFlagsBits[p]))) throw codeErr('role_dangerous');
        roleId = role.id;
      }
      return { label, emoji, style: has(EMB_STYLE, a.style) ? a.style : 'primary', reply: s(a.reply, 2000), roleId };
    }),
  };
  const m = embMeasure(doc);
  if (m.chars > L.chars || (doc.mode === 'v2' && m.chars > 4000)) throw codeErr('embed_chars');
  if (m.bytes > L.bytes) throw codeErr('embed_bytes');
  return doc;
}

function embComponents(doc) {
  const A = doc.actions || [];
  if (doc.kind === 'none' || !A.length) return [];
  const emoji = (e) => { const m = /^<(a?):(\w{1,32}):(\d{15,25})>$/.exec(e); return m ? { id: m[3], name: m[2], animated: !!m[1] } : { name: e }; };
  if (doc.kind === 'select') {
    return [{ type: 1, components: [{
      type: 3, custom_id: `embs:${doc.id}`, placeholder: (doc.placeholder || 'اختر...').slice(0, 150), min_values: 1, max_values: 1,
      options: A.slice(0, 25).map((a, i) => Object.assign({ label: (a.label || 'خيار').slice(0, 100), value: String(i) }, a.emoji ? { emoji: emoji(a.emoji) } : {})),
    }] }];
  }
  const rows = [];
  A.slice(0, 25).forEach((a, i) => {
    if (i % 5 === 0) rows.push({ type: 1, components: [] });
    rows[rows.length - 1].components.push(Object.assign({ type: 2, style: EMB_STYLE[a.style] || 1, custom_id: `emb:${doc.id}:${i}` },
      a.label ? { label: a.label.slice(0, 80) } : {}, a.emoji ? { emoji: emoji(a.emoji) } : {}));
  });
  return rows;
}

function embBody(doc) {
  const rows = embComponents(doc);
  const mentions = { parse: [] };
  if (doc.mode === 'v2') {
    const inner = [];
    if (doc.content) inner.push({ type: 10, content: doc.content.slice(0, 2000) });
    const texts = [];
    if (doc.author.name) texts.push('-# ' + doc.author.name);
    if (doc.title) texts.push('## ' + (doc.titleUrl ? `[${doc.title}](${doc.titleUrl})` : doc.title));
    if (doc.description) texts.push(doc.description);
    for (const f of doc.fields) texts.push(`**${f.name}**\n${f.value}`);
    const head = texts.join('\n');
    if (head && doc.thumbnail) inner.push({ type: 9, components: [{ type: 10, content: head }], accessory: { type: 11, media: { url: doc.thumbnail } } });
    else {
      if (head) inner.push({ type: 10, content: head });
      if (doc.thumbnail) inner.push({ type: 12, items: [{ media: { url: doc.thumbnail } }] });
    }
    if (doc.image) inner.push({ type: 12, items: [{ media: { url: doc.image } }] });
    if (doc.footer.text) inner.push({ type: 14, divider: true, spacing: 1 }, { type: 10, content: '-# ' + doc.footer.text });
    if (!inner.length) throw codeErr('empty_embed');
    if (rows.length) inner.push({ type: 14, divider: true, spacing: 1 }, ...rows);
    return { flags: 1 << 15, components: [{ type: 17, accent_color: parseInt(doc.color.slice(1), 16), components: inner }], allowed_mentions: mentions };
  }
  const core = embCore(doc);
  if (doc.timestamp && core.embed) core.embed.timestamp = new Date().toISOString();
  const body = { allowed_mentions: mentions };
  if (core.content) body.content = core.content;
  if (core.embed) body.embeds = [core.embed];
  if (rows.length) body.components = rows;
  if (!body.content && !body.embeds && !rows.length) throw codeErr('empty_embed');
  return body;
}

const embErr = (res, e) => (e.code ? res.status(400).json({ error: e.code }) : null);
app.get('/api/guild/:id/embeds', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), limits: embLimits(info.id), roles: roleList(info.id), channels: textChannels(info.id), embeds: embList(info.id) });
}));
app.post('/api/guild/:id/embeds', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (embList(info.id).length >= embLimits(info.id).count) return res.status(400).json({ error: 'limit_reached' });
  let doc;
  try { doc = embClean((req.body || {}).embed, info.id, newId()); } catch (e) { if (embErr(res, e)) return; throw e; }
  S(info.id).embeds = embList(info.id).concat(doc);
  dirty = true;
  res.json({ ok: true, embed: doc });
}));
app.put('/api/guild/:id/embeds/:eid', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const list = embList(info.id);
  const i = list.findIndex((e) => e.id === req.params.eid);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  let doc;
  try { doc = embClean((req.body || {}).embed, info.id, list[i].id); } catch (e) { if (embErr(res, e)) return; throw e; }
  list[i] = doc;
  S(info.id).embeds = list;
  dirty = true;
  res.json({ ok: true, embed: doc });
}));
app.delete('/api/guild/:id/embeds/:eid', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  S(info.id).embeds = embList(info.id).filter((e) => e.id !== req.params.eid);
  dirty = true;
  res.json({ ok: true });
}));
app.post('/api/guild/:id/embeds/:eid/send', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const doc = embList(info.id).find((e) => e.id === req.params.eid);
  if (!doc) return res.status(404).json({ error: 'not_found' });
  if (!doc.channel) return res.status(400).json({ error: 'no_channel' });
  const cg = client.guilds.cache.get(info.id);
  const ch = cg && cg.channels.cache.get(doc.channel);
  if (!ch) return res.status(400).json({ error: 'bad_channel' });
  let body;
  try { body = embBody(doc); } catch (e) { if (embErr(res, e)) return; throw e; }
  try {
    const m = await client.rest.post(Routes.channelMessages(doc.channel), { body });
    res.json({ ok: true, url: `https://discord.com/channels/${info.id}/${doc.channel}/${m.id}` });
  } catch (e) { res.status(400).json({ error: 'discord_error', detail: discordMsg(e) }); }
}));

async function onEmbedInteraction(i) {
  try {
    const cid = String(i.customId || '');
    const isBtn = i.isButton && i.isButton(), isSel = i.isStringSelectMenu && i.isStringSelectMenu();
    if (!i.guildId || !(isBtn || isSel) || !(cid.startsWith('emb:') || cid.startsWith('embs:'))) return;
    const parts = cid.split(':');
    const idx = Number(isSel ? i.values[0] : parts[2]);
    const doc = embList(i.guildId).find((e) => e.id === parts[1]);
    const a = doc && doc.actions[idx];
    if (!a) return void (await i.reply({ content: 'هذا الخيار لم يعد متاحاً.', flags: 64 }));
    let note = '';
    if (a.roleId) {
      const role = i.guild.roles.cache.get(a.roleId);
      const mem = await i.guild.members.fetch(i.user.id).catch(() => null);
      if (!role || !mem || !role.editable || DANGER_PERMS.some((p) => role.permissions.has(PermissionFlagsBits[p]))) note = '⚠️ ما أقدر أعدّل هذه الرتبة.';
      else if (mem.roles.cache.has(role.id)) { await mem.roles.remove(role.id, 'OPS: embed'); note = `➖ تم سحب رتبة **${role.name}**`; }
      else { await mem.roles.add(role.id, 'OPS: embed'); note = `➕ تم إعطاؤك رتبة **${role.name}**`; }
    }
    const text = a.reply ? tpl(a.reply, { user: `<@${i.user.id}>`, userName: i.user.globalName || i.user.username, server: i.guild.name, memberCount: i.guild.memberCount }) : '';
    await i.reply({ content: ([text, note].filter(Boolean).join('\n') || 'تم ✅').slice(0, 2000), flags: 64, allowedMentions: { parse: [] } });
  } catch (_) {}
}

// ---------- الترحيب والمغادرة ----------
function welCfg(gid) {
  const s = ((db.settings[gid] || {}).welcome) || {};
  const j = s.join || {}, im = s.image || {}, l = s.leave || {}, e = im.elements || {};
  const n = (v, d, lo, hi) => (v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : d);
  const c = (v, d) => (COLOR_RE.test(String(v)) ? v : d);
  const ch = (v) => (SNOW.test(String(v || '')) ? String(v) : null);
  const t = (v, d, max) => (typeof v === 'string' ? v.slice(0, max) : d);
  const elc = (k, color) => {
    const o = e[k] || {};
    const r = { x: n(o.x, WEL_DEF[k].x, 0, 100), y: n(o.y, WEL_DEF[k].y, 0, 100), size: n(o.size, WEL_DEF[k].size, 3, 60) };
    if (color) r.color = c(o.color, WEL_DEF[k].color);
    if (k === 'avatar') r.ar = n(o.ar, 1, 0.2, 5);
    return r;
  };
    const text = elc('text', true);
  text.content = t((e.text || {}).content, WEL_DEF.text.content, 60);
  return {
    enabled: !!s.enabled,
    join: { enabled: j.enabled === undefined ? true : !!j.enabled, text: t(j.text, 'Welcome {user} to {server}!', 2000), mode: j.mode === 'dm' ? 'dm' : 'chat', channel: ch(j.channel) },
    image: {
      enabled: !!im.enabled,
      method: ['embed', 'separate', 'channel'].includes(im.method) ? im.method : 'embed',
      fit: ['contain', 'stretch', 'cover'].includes(im.fit) ? im.fit : 'contain',
      channel: ch(im.channel),
      bgUrl: t(im.bgUrl, '', 500),
      bgFile: Object.values(BG_EXT).includes(im.bgFile) ? im.bgFile : null,
      bgAt: Number(im.bgAt) || 0,
      elements: { avatar: elc('avatar', false), username: elc('username', true), text },
    },
    leave: { enabled: l.enabled === undefined ? true : !!l.enabled, text: t(l.text, 'في أمان الله {user}', 2000), channel: ch(l.channel), image: l.image === true },
  };
}
const welPublic = (c) => {
  const o = JSON.parse(JSON.stringify(c));
  delete o.image.bgFile; delete o.image.bgAt;
  return o;
};
const tpl = (text, vars) => String(text || '').replace(/\{(\w+)\}/g, (x, k) => (has(vars, k) ? String(vars[k]) : x));
const bgPath = (gid, ext) => path.join(WEL_DIR, gid + '.' + ext);
const rmBg = (gid) => { for (const e of Object.values(BG_EXT)) { try { fs.unlinkSync(bgPath(gid, e)); } catch (_) {} } };

function sanitizeWel(b, gid, guild, premium) {
  const bad = (code) => { const e = new Error(code); e.code = code; throw e; };
  if (!b || typeof b !== 'object' || Array.isArray(b)) bad('bad_cfg');
  const max = premium ? 2000 : 1500;
  const chan = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string' && SNOW.test(v) && guild.channels.cache.has(v)) return v;
    return bad('bad_channel');
  };
  const text = (v, d) => { if (v === undefined) return d; if (typeof v !== 'string' || v.length > max) bad('bad_text'); return v; };
  const num = (v, d, lo, hi) => { if (v === undefined) return d; const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) bad('bad_cfg'); return Math.round(x * 10) / 10; };
  const col = (v, d) => { if (v === undefined) return d; if (typeof v !== 'string' || !COLOR_RE.test(v)) bad('bad_cfg'); return v; };
  const cur = welCfg(gid);
  const j = b.join || {}, im = b.image || {}, l = b.leave || {}, e = im.elements || {};
  const el = (k, color) => {
    const o = e[k] || {}, c = cur.image.elements[k];
    const r = { x: num(o.x, c.x, 0, 100), y: num(o.y, c.y, 0, 100), size: num(o.size, c.size, 3, 60) };
    if (color) r.color = col(o.color, c.color);
    if (k === 'avatar') {
      const x = o.ar === undefined ? (c.ar || 1) : Number(o.ar);
      if (!Number.isFinite(x) || x < 0.2 || x > 5) bad('bad_cfg');
      r.ar = Math.round(x * 100) / 100;
    }
    return r;
  };
  const tx = el('text', true);
  tx.content = e.text && e.text.content !== undefined ? String(e.text.content).slice(0, 60) : cur.image.elements.text.content;
  let bgUrl = cur.image.bgUrl;
  if (im.bgUrl !== undefined) {
    const u = safeUrl(String(im.bgUrl).trim());
    if (u === null) bad('bad_url');
    bgUrl = u;
  }
  return {
    enabled: b.enabled === undefined ? cur.enabled : b.enabled === true,
    join: {
      enabled: j.enabled === undefined ? cur.join.enabled : j.enabled === true,
      text: text(j.text, cur.join.text),
      mode: j.mode === undefined ? cur.join.mode : (['chat', 'dm'].includes(j.mode) ? j.mode : bad('bad_cfg')),
      channel: j.channel === undefined ? cur.join.channel : chan(j.channel),
    },
    image: {
      enabled: im.enabled === undefined ? cur.image.enabled : im.enabled === true,
      method: im.method === undefined ? cur.image.method : (['embed', 'separate', 'channel'].includes(im.method) ? im.method : bad('bad_cfg')),
      fit: im.fit === undefined ? cur.image.fit : (['contain', 'stretch', 'cover'].includes(im.fit) ? im.fit : bad('bad_cfg')),
      channel: im.channel === undefined ? cur.image.channel : chan(im.channel),
      bgUrl,
      bgFile: cur.image.bgFile,
      bgAt: cur.image.bgAt,
      elements: { avatar: el('avatar', false), username: el('username', true), text: tx },
    },
    leave: {
      enabled: l.enabled === undefined ? cur.leave.enabled : l.enabled === true,
      text: text(l.text, cur.leave.text),
            channel: l.channel === undefined ? cur.leave.channel : chan(l.channel),
      image: l.image === undefined ? cur.leave.image : l.image === true,
    },
  };
}

app.get('/api/guild/:id/welcome', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const c = welCfg(info.id);
  res.json({
    canManage: info.canManage, guildPremium: isPremium(info.id), maxLen: isPremium(info.id) ? 2000 : 1500,
    channels: textChannels(info.id), canvas: !!canvasLib,
    hasBg: !!(c.image.bgFile && fs.existsSync(bgPath(info.id, c.image.bgFile))), bgAt: c.image.bgAt,
    cfg: welPublic(c),
  });
}));

app.put('/api/guild/:id/welcome', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  let next;
  try { next = sanitizeWel((req.body || {}).cfg, info.id, cg, isPremium(info.id)); }
  catch (e) { if (e.code) return res.status(400).json({ error: e.code }); throw e; }
  if (next.image.bgUrl) { rmBg(info.id); next.image.bgFile = null; }
  S(info.id).welcome = next;
  dirty = true;
  res.json({ ok: true });
}));

app.post('/api/guild/:id/welcome/bg', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const v = (req.body || {}).image;
  const ok = imgCheck(v, 5);
  if (ok !== true || v === null) return res.status(400).json({ error: ok === true ? 'bad_image' : ok });
  const m = /^data:image\/(png|jpeg|gif|webp);base64,(.+)$/.exec(v);
  if (!m) return res.status(400).json({ error: 'bad_image' });
  try {
    fs.mkdirSync(WEL_DIR, { recursive: true });
    rmBg(info.id);
    fs.writeFileSync(bgPath(info.id, BG_EXT[m[1]]), Buffer.from(m[2], 'base64'));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'server_error' }); }
  const cur = welCfg(info.id);
  cur.image.bgFile = BG_EXT[m[1]]; cur.image.bgAt = Date.now(); cur.image.bgUrl = '';
  S(info.id).welcome = cur;
  dirty = true;
  res.json({ ok: true });
}));

app.delete('/api/guild/:id/welcome/bg', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  rmBg(info.id);
  const cur = welCfg(info.id);
  cur.image.bgFile = null; cur.image.bgAt = 0;
  S(info.id).welcome = cur;
  dirty = true;
  res.json({ ok: true });
}));

app.get('/api/guild/:id/welcome/bg', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const c = welCfg(info.id);
  const f = c.image.bgFile && bgPath(info.id, c.image.bgFile);
  if (!f || !fs.existsSync(f)) return res.status(404).end();
  res.set({ 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(f);
}));
app.post('/api/guild/:id/welcome/test', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const g = client.guilds.cache.get(info.id);
  const m = g && await g.members.fetch(req.session.user.id).catch(() => null);
  if (!m) return res.status(400).json({ error: 'bad_cfg' });
  await memberJoin(m, null, true);
  res.json({ ok: true });
}));
// ---- توليد صورة الترحيب (يحتاج @napi-rs/canvas) ----
async function renderWelcome(guild, user, cfg, vars) {
  let bgImg = null;
  try {
    let src = null;
    if (cfg.image.bgFile && fs.existsSync(bgPath(guild.id, cfg.image.bgFile))) src = bgPath(guild.id, cfg.image.bgFile);
    else if (safeUrl(cfg.image.bgUrl)) src = cfg.image.bgUrl;
    if (src) bgImg = await canvasLib.loadImage(src);
  } catch (_) {}
  const W = 1024;
  const H = bgImg ? Math.max(300, Math.min(1400, Math.round(W * bgImg.height / bgImg.width))) : 450;
  const cv = canvasLib.createCanvas(W, H);
  const ctx2 = cv.getContext('2d');
  const gr = ctx2.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#16161c'); gr.addColorStop(1, '#2a2110');
  ctx2.fillStyle = gr;
  ctx2.fillRect(0, 0, W, H);
  if (bgImg) ctx2.drawImage(bgImg, 0, 0, W, H);
  const E = cfg.image.elements;
  try {
    const av = await canvasLib.loadImage(user.displayAvatarURL({ size: 256, extension: 'png' }));
    const s = (E.avatar.size / 100) * W, sh = s * (E.avatar.ar || 1), cx = (E.avatar.x / 100) * W, cy = (E.avatar.y / 100) * H;
    ctx2.save();
    ctx2.beginPath(); ctx2.ellipse(cx, cy, s / 2, sh / 2, 0, 0, Math.PI * 2); ctx2.closePath(); ctx2.clip();
    ctx2.drawImage(av, cx - s / 2, cy - sh / 2, s, sh);
    ctx2.restore();
    ctx2.lineWidth = 6; ctx2.strokeStyle = '#ffffff';
    ctx2.beginPath(); ctx2.ellipse(cx, cy, s / 2, sh / 2, 0, 0, Math.PI * 2); ctx2.stroke();
  } catch (_) {}
  ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
  const draw = (el, str) => {
    if (!String(str || '').trim()) return;
    ctx2.fillStyle = el.color;
    ctx2.font = 'bold ' + Math.max(10, Math.round((el.size / 100) * H)) + 'px sans-serif';
    ctx2.shadowColor = 'rgba(0,0,0,0.6)'; ctx2.shadowBlur = 8;
    ctx2.fillText(String(str).slice(0, 60), (el.x / 100) * W, (el.y / 100) * H, W * 0.92);
    ctx2.shadowBlur = 0;
  };
  draw(E.username, user.globalName || user.username);
  draw(E.text, tpl(E.text.content, vars));
  return cv.toBuffer('image/png');
}
// ---- يستدعيه الملف الرئيسي عند دخول عضو (بعد حساب الداعي) ----
async function memberJoin(m, used, test) {
  const g = m.guild;
  console.log(`[welcome] بدأ memberJoin لـ ${m.user.tag} (test=${!!test})`);
  if (m.user.bot) { L(g, 'bots', '🤖 إضافة بوت', `**البوت:** ${who(m.user)}`); console.log('[welcome] بوت، تخطيت'); return; }
  const inviter = used && used.inviter ? used.inviter : (test ? m.user : null); // بالتجربة يعتبرك انت الداعي عشان تشوف الشكل
  const invCount = inviter ? ((((db.guilds[g.id] || {}).members || {})[inviter.id] || {}).inv || 0) : 0;
  if (!test) L(g, 'joinleave', '📥 دخول عضو', `**العضو:** ${who(m.user)}\n**الداعي:** ${inviter ? who(inviter) : 'غير معروف'}\n**عدد الأعضاء:** ${g.memberCount}`);

  const cfg = welCfg(g.id);
  console.log(`[welcome] enabled=${cfg.enabled} join.enabled=${cfg.join.enabled} mode=${cfg.join.mode} channel=${cfg.join.channel} image=${cfg.image.enabled}`);
  if (!cfg.enabled) { console.log(`[welcome] ${g.name}: النظام مطفي. فعّل "تفعيل النظام" بالداشبورد واحفظ`); return; }
  const ct = Math.floor(m.user.createdTimestamp / 1000);
  const vars = {
    user: `<@${m.id}>`, userName: m.user.globalName || m.user.username, username: m.user.username, userId: m.id,
    memberCount: g.memberCount, server: g.name,
    inviter: inviter ? `<@${inviter.id}>` : 'غير معروف',
    inviterName: inviter ? (inviter.globalName || inviter.username) : 'غير معروف',
    inviterId: inviter ? inviter.id : 'غير معروف',
    invites: invCount,
    inviteCode: used && used.code ? used.code : 'غير معروف',
    accountCreated: `<t:${ct}:R>`,
    accountDate: `<t:${ct}:D>`,
    joinedAt: `<t:${Math.floor(Date.now() / 1000)}:F>`,
  };
  const text = tpl(cfg.join.text, vars).slice(0, 2000);
  const img = cfg.image.enabled
    ? await renderWelcome(g, m.user, cfg, vars).catch((e) => { console.error('[welcome] فشل توليد الصورة:', e.message); return null; })
    : null;
  if (cfg.image.enabled && !img) console.warn('[welcome] الصورة ما انولدت. تأكد من تثبيت: npm i @napi-rs/canvas');
  const file = img ? { attachment: img, name: 'welcome.png' } : null;
  const mentions = { users: [...new Set([m.id].concat(inviter ? [inviter.id] : []))] };
  const send = async (t, payload) => {
    if (!t || typeof t.send !== 'function') return null;
    try { return await t.send({ ...payload, allowedMentions: mentions }); }
    catch (e) { console.error(`[welcome] فشل الإرسال: ${e.message}`); return null; }
  };
  const joinTarget = cfg.join.mode === 'dm' ? m : (cfg.join.channel ? g.channels.cache.get(cfg.join.channel) : null);
  if (!joinTarget && cfg.join.enabled) console.warn(`[welcome] ${g.name}: ما في روم ترحيب محدد أو انحذف. اختر الروم واحفظ`);
  if (joinTarget && typeof joinTarget.permissionsFor === 'function') {
    const p = joinTarget.permissionsFor(g.members.me);
    if (!p || !p.has(['ViewChannel', 'SendMessages'])) console.warn(`[welcome] البوت ما عنده صلاحية View/Send بروم #${joinTarget.name}`);
  }

  if (cfg.join.enabled && text.trim()) {
    if (file && cfg.image.method === 'embed') await send(joinTarget, { content: text, files: [file] });
    else {
      await send(joinTarget, { content: text });
      if (file && cfg.image.method === 'separate') await send(joinTarget, { files: [file] });
    }
  }
  if (file && cfg.image.method === 'channel') {
    await send(cfg.image.channel ? g.channels.cache.get(cfg.image.channel) : null, { files: [file] });
  } else if (file && !(cfg.join.enabled && text.trim())) {
    await send(joinTarget, { files: [file] });
  }
  console.log('[welcome] خلص');
}

async function memberLeave(m) {
  const g = m.guild;
  const cfg = welCfg(g.id);
  if (!cfg.enabled || !cfg.leave.enabled || !cfg.leave.channel) return;
  const ch = g.channels.cache.get(cfg.leave.channel);
  if (!ch || typeof ch.send !== 'function') return;
  const vars = { user: `<@${m.id}>`, userName: m.user.globalName || m.user.username, memberCount: g.memberCount, server: g.name };
  const text = tpl(cfg.leave.text, vars).slice(0, 2000);
  const img = cfg.leave.image ? await renderWelcome(g, m.user, cfg, vars).catch(() => null) : null;
  const payload = { allowedMentions: { parse: [] } };
  if (text.trim()) payload.content = text;
  if (img) payload.files = [{ attachment: img, name: 'leave.png' }];
  if (payload.content || payload.files) ch.send(payload).catch(() => {});
}


function installLogWrap() {

const WRAP = {
  kick: ['kick', '👢 طرد عضو', 1], mute: ['textmute', '🔇 ميوت كتابي'], unmute: ['textmute', '🔊 فك ميوت كتابي'],
  prison: ['prison', '⛓️ سجن عضو', 1], unprison: ['prison', '🔓 فك سجن'], warn: ['warns', '⚠️ تحذير إداري', 1],
  vkick: ['voicekick', '🔌 طرد صوتي'], rblock: ['rblock', '🚫 حظر رتبة'], removeblock: ['rblock', '✅ فك حظر رتبة'],
  clear: ['purge', '🧹 حذف رسائل جماعي'], move: ['voicepull', '↔️ سحب صوتي'], moveme: ['voicepull', '↔️ انتقال صوتي'],
  moveto: ['voicepull', '↔️ نقل صوتي'], moveall: ['voicepull', '↔️ نقل جماعي صوتي'],
};
for (const [name, [key, title, withReason]] of Object.entries(WRAP)) {
  const orig = HANDLERS[name];
  if (typeof orig !== 'function') continue;
  HANDLERS[name] = async function (msg, mod, a) {
    await orig.call(this, msg, mod, a); // لو فشل الأمر بيرمي خطأ فما ينسجل
    try {
      const t = msg.mentions.users.first();
      const raw = String((a && a[0]) || '').replace(/[<@!>#&]/g, '');
      const id = t ? t.id : (SNOW.test(raw) ? raw : null);
      const lines = [`**المنفذ:** <@${mod.id}>`];
      if (id && name !== 'clear') lines.push(`**الهدف:** <@${id}>`);
      lines.push(`**الأمر:** \`${name}!\``, `**الروم:** <#${msg.channelId}>`);
      if (name === 'clear') lines.push(`**العدد:** ${cut(a[0], 10)}`);
      if (withReason && a.slice(1).length) lines.push(`**السبب:** ${cut(a.slice(1).join(' '), 300)}`);
      L(msg.guild, key, title, lines.join('\n'));
    } catch (_) {}
  };
}
}


app.get('/api/guild/:id/security/smart', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const c = smartCfg(info.id);
  res.json({
    ...c,
    whitelist: await whitelistUsers(c.whitelist),
    channels: info.canManage ? textChannels(info.id) : [],
    canManage: info.canManage,
    isOwner: Boolean(info.owner),
  });
}));

app.put('/api/guild/:id/security/smart', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const b = req.body || {};
  const cur = smartCfg(info.id);
  if ('enabled' in b) cur.enabled = b.enabled === true;
  if ('logChannel' in b) {
    if (b.logChannel === null || b.logChannel === '') cur.logChannel = null;
    else if (textChannels(info.id).some((c) => c.id === b.logChannel)) cur.logChannel = b.logChannel;
    else return res.status(400).json({ error: 'bad_channel' });
  }
  if (b.limits && typeof b.limits === 'object') {
    for (const k of LIMIT_KEYS) {
      const v = b.limits[k];
      if (!v) continue;
      const max = parseInt(v.max, 10);
      if (!(max >= 1 && max <= 100) || !ACTIONS.includes(v.action)) return res.status(400).json({ error: 'bad_limits' });
      cur.limits[k] = { max, action: v.action };
    }
  }  if (b.cmdLimits && typeof b.cmdLimits === 'object') {
    for (const k of CMD_LIMIT_KEYS) {
      if (!(k in b.cmdLimits)) continue;
      const n = parseInt(b.cmdLimits[k], 10);
      if (!(n >= 1 && n <= 100)) return res.status(400).json({ error: 'bad_limits' });
      cur.cmdLimits[k] = n;
    }
  }
  if ('cmdAction' in b) {
    if (!CMD_LIMIT_ACTIONS.includes(b.cmdAction)) return res.status(400).json({ error: 'bad_limits' });
    cur.cmdAction = b.cmdAction;
  }
  S(info.id).smart = cur;
  dirty = true;
  res.json({ ok: true });
}));

app.post('/api/guild/:id/security/smart/whitelist', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { owner: true }); if (!info) return;
  const uid = String((req.body || {}).id || '').trim();
  if (!SNOW.test(uid)) return res.status(400).json({ error: 'bad_user_id' });
  const u = await getUser(uid);
  if (!u) return res.status(404).json({ error: 'user_not_found' });
  const cur = smartCfg(info.id);
  if (!cur.whitelist.includes(uid)) {
    if (cur.whitelist.length >= 50) return res.status(400).json({ error: 'list_full' });
    cur.whitelist.push(uid);
  }
  S(info.id).smart = cur;
  dirty = true;
  res.json({ whitelist: await whitelistUsers(cur.whitelist) });
}));

app.delete('/api/guild/:id/security/smart/whitelist/:uid', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { owner: true }); if (!info) return;
  const cur = smartCfg(info.id);
  cur.whitelist = cur.whitelist.filter((x) => x !== req.params.uid);
  S(info.id).smart = cur;
  dirty = true;
  res.json({ whitelist: await whitelistUsers(cur.whitelist) });
}));

// ---------- الحماية العامة (Discord AutoMod) ----------
const amErr = (res, e) => res.status(400).json({ error: 'discord_error', detail: discordMsg(e) });

app.get('/api/guild/:id/automod', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  try {
    const rules = await client.rest.get(Routes.guildAutoModerationRules(info.id));
    res.json({
      rules: rules.map((r) => ({
        id: r.id, name: r.name, enabled: r.enabled, type: r.trigger_type,
        actions: (r.actions || []).length,
        mentionLimit: (r.trigger_metadata && r.trigger_metadata.mention_total_limit) || null,
      })),
    });
  } catch (e) { amErr(res, e); }
}));

app.post('/api/guild/:id/automod', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'bad_name' });
  const list = (v) => String(v || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const body = { name, event_type: 1, enabled: true, actions: [{ type: 1 }] };
  if (b.kind === 'keywords') {
    const k = list(b.value).filter((s) => s.length <= 60).slice(0, 1000);
    if (!k.length) return res.status(400).json({ error: 'bad_value' });
    body.trigger_type = 1; body.trigger_metadata = { keyword_filter: k };
  } else if (b.kind === 'links') {
    const k = list(b.value)
      .map((s) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9.\-\/]/g, ''))
      .filter((s) => s && s.length <= 56).slice(0, 1000).map((s) => '*' + s + '*');
    if (!k.length) return res.status(400).json({ error: 'bad_value' });
    body.trigger_type = 1; body.trigger_metadata = { keyword_filter: k };
  } else if (b.kind === 'mention') {
    const n = parseInt(b.value, 10);
    if (!(n >= 1 && n <= 50)) return res.status(400).json({ error: 'bad_value' });
    body.trigger_type = 5; body.trigger_metadata = { mention_total_limit: n };
  } else if (b.kind === 'spam') {
    body.trigger_type = 3;
  } else {
    return res.status(400).json({ error: 'bad_value' });
  }
  try {
    await client.rest.post(Routes.guildAutoModerationRules(info.id), { body });
    res.json({ ok: true });
  } catch (e) { amErr(res, e); }
}));

app.patch('/api/guild/:id/automod/:rid', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (!SNOW.test(req.params.rid)) return res.status(400).json({ error: 'bad_value' });
  try {
    await client.rest.patch(Routes.guildAutoModerationRule(info.id, req.params.rid), { body: { enabled: (req.body || {}).enabled === true } });
    res.json({ ok: true });
  } catch (e) { amErr(res, e); }
}));

app.delete('/api/guild/:id/automod/:rid', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (!SNOW.test(req.params.rid)) return res.status(400).json({ error: 'bad_value' });
  try {
    await client.rest.delete(Routes.guildAutoModerationRule(info.id, req.params.rid));
    res.json({ ok: true });
  } catch (e) { amErr(res, e); }
}));

// ===================== إدارة الأوامر + حماية الصور =====================
const arr = (v) => (Array.isArray(v) ? v : []);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function roleList(gid) {
  const cg = client && client.guilds.cache.get(gid);
  if (!cg) return [];
  return [...cg.roles.cache.values()]
    .filter((r) => r.id !== gid && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: '#' + (r.color || 0x99aab5).toString(16).padStart(6, '0') }));
}

// ---------- سجل العقوبات ----------
function infOf(gid) { db.infr = db.infr || {}; return db.infr[gid] || (db.infr[gid] = {}); }
function logInf(gid, uid, type, by, reason, dur) {
  const o = infOf(gid);
  const l = o[uid] || (o[uid] = []);
  l.push({ id: crypto.randomBytes(4).toString('hex'), type, by, reason: String(reason || '').slice(0, 200), at: Date.now(), dur: dur || 0 });
  if (l.length > 200) l.shift();
  dirty = true;
}
const INF_LABEL = { warn: 'تحذير', ban: 'حظر', kick: 'طرد', timeout: 'تايم أوت', vmute: 'ميوت صوتي',mute: 'ميوت كتابي', prison: 'سجن', image: 'صورة احتيالية' };
const dstr = (t) => new Date(t).toISOString().slice(0, 10);

// ---------- تعريف الأوامر ----------
// [الاسم, الوصف, صلاحية ديسكورد الافتراضية (null = للجميع), مفعّل افتراضياً, بريميوم]
const CMD_RAW = {
  admin: [
    ['stickers', 'اضافة ستيكرز للسيرفر', 'ManageGuildExpressions', 0],
    ['aemoji', 'اضافة ايموجي للسيرفر', 'ManageGuildExpressions', 0],
    ['botstatus', 'حالة البوتات في السيرفر', 'ManageGuild', 0],
    ['blockpic', 'بلوك صور', 'ManageMessages', 0],
    ['blocked', 'عرض الاعضاء من عليهم بلوك صور', 'ManageMessages', 0],
    ['removeblockpic', 'ازالة بلوك الصور من شخص معين', 'ManageMessages', 0],
    ['mute', 'اسكات كتابي', 'ModerateMembers', 0],
    ['mymute', 'معلومات ميوت العضو', 'ModerateMembers', 0],
    ['unmute', 'الغاء الاسكات الكتابي', 'ModerateMembers', 0],
    ['vmute', 'اسكات عضو من الفويس', 'MuteMembers', 0],
    ['myvmute', 'معلومات الميوت الصوتي للعضو', 'MuteMembers', 0],
    ['unvmute', 'فك ميوت صوتي عن عضو', 'MuteMembers', 0],
    ['ban', 'حظر العضو', 'BanMembers', 1],
    ['unban', 'الغاء الحظر من شخص', 'BanMembers', 1],
    ['kick', 'طرد عضو من السيرفر', 'KickMembers', 0],
    ['prison', 'سجن عضو', 'ModerateMembers', 0],
    ['myprison', 'معلومات سجن العضو', 'ModerateMembers', 0],
    ['unprison', 'فك سجن عضو', 'ModerateMembers', 0],
    ['vkick', 'طرد عضو من الروم الصوتي', 'MoveMembers', 0],
    ['setnick', 'تغيير اسم عضو داخل السيرفر', 'ManageNicknames', 0],
    ['clear', 'مسح رسائل الشات (من 1 إلى 1000)', 'ManageMessages', 1],
    ['move', 'سحب عضو إلى الروم الخاص بك', 'MoveMembers', 0],
    ['moveme', 'انتقال إلى الروم الخاص بعضو آخر', 'MoveMembers', 0],
    ['moveto', 'سحب عضو أو نفسك إلى روم محدد', 'MoveMembers', 0],
    ['moveall', 'سحب جميع أعضاء روم معين إلى روم آخر', 'MoveMembers', 0],
    ['warn', 'اعطاء تحذير لعضو', 'ModerateMembers', 1],
    ['warnings', 'الحصول على قائمة التحذيرات لعضو', 'ModerateMembers', 1],
    ['dinfractions', 'إدارة وعرض سجلات العقوبات للعضو', 'ModerateMembers', 1],
    ['timeout', 'اعطاء تايم اوت', 'ModerateMembers', 1],
    ['untimeout', 'ازلة التايم اوت', 'ModerateMembers', 1],
    ['stats', 'اظهار معلومات الاداري', 'ModerateMembers', 1],
  ],
  general: [
    ['help', 'قائمه المساعدة', null, 0],
    ['avatar', 'عرض صورة شخص', null, 0],
    ['banner', 'عرض بنر شخص', null, 0],
    ['profile', 'عرض الملف الشخصي', null, 0],
    ['level', 'عرض مستوى ونقاط المستخدم', null, 0],
    ['server', 'عرض معلومات السيرفر', null, 0],
    ['ping', 'عرض سرعة اتصال البوت', null, 0],
    ['semoji', 'ارسال صورة الايموجي', null, 0],
    ['user', 'عرض معلومات المستخدم (الانضمام والإنشاء)', null, 0],
    ['point', 'إدارة وعرض نقاط الأعضاء', null, 0],
    ['statistics', 'عرض لوحة إحصائيات السيرفر التفاعلية للرسائل والفويس', null, 0],
    ['messages', 'عرض ترتيب ومجموع الرسائل للأعضاء في شات أو رتبة معينة', null, 0],
  ],
  roles: [
    ['role', 'اضافة رتبة لعضو (وإذا عنده الرتبة تنسحب منه)', 'ManageRoles', 0],
    ['removeroles', 'سحب جميع الرتب من العضو', 'ManageRoles',  0, 1],
    ['rblock', 'بلوك رول من شخص معين', 'ManageRoles', 0, 1],
    ['removeblock', 'ازالة البلوك رول من شخص معين', 'ManageRoles', 0, 1],
  ],
  security: [
    ['advice', 'نصائح يمكن تفيدك', null, 0],
    ['bots', 'اظهار البوتات الموجودة بالسيرفر', 'ManageGuild', 0],
    ['pslist', 'عرض قائمة الحماية المفعلة والمعطلة', 'ManageGuild', 0],
  ],
  settings: [
    ['setlog', 'انشاء شاتات اللوق', 'ManageGuild', 0],
    ['detlog', 'حذف شاتات اللوق', 'ManageGuild', 0],
    ['setvoice', 'تثبيت البوت بفويس', 'ManageGuild', 0],
  ],
  chat: [
    ['hide', 'إخفاء الشات عن الكل', 'ManageChannels', 1],
    ['unhide', 'إظهار الشات للكل', 'ManageChannels', 1],
    ['lock', 'قفل الروم', 'ManageChannels', 1],
    ['unlock', 'فتح الروم', 'ManageChannels', 1],
    ['slowmode', 'تفعيل الوضع البطيء بالروم', 'ManageChannels', 1],
  ],
  colors: [
    ['color', 'لتغيير لونك بالسيرفر', null, 1],
    ['colors', 'يسرد لك كل الألوان المتاحة', null, 1],
  ],
};
const CMD_LIST = [].concat(...Object.entries(CMD_RAW).map(([cat, rows]) =>
  rows.map(([name, desc, perm, def, premium]) => ({ name, desc, perm, def: !!def, premium: !!premium, cat }))));
const COMMANDS = Object.fromEntries(CMD_LIST.map((c) => [c.name, c]));
const permOf = (n) => PermissionFlagsBits[n] || (n === 'ManageGuildExpressions' ? PermissionFlagsBits.ManageEmojisAndStickers : undefined);

function cmdCfg(gid, name) {
  const c = ((db.settings[gid] || {}).cmds || {})[name] || {};
  const def = COMMANDS[name];
  let enabled = c.enabled === undefined ? def.def : !!c.enabled;
  if (def.premium && !isPremium(gid)) enabled = false;
  return {
    enabled,
    allowRoles: arr(c.allowRoles), blockRoles: arr(c.blockRoles),
    allowChannels: arr(c.allowChannels), blockChannels: arr(c.blockChannels),
    aliases: arr(c.aliases),
            penalty: c.penalty, wreasons: c.wreasons,
  };
}
// الاختصار: كلمة وحدة بدون مسافات، بالشكل اللي كاتبه العضو (مثال: امسح)
function normAlias(raw) {
  const a = String(raw || '').trim().toLowerCase();
  if (!a || a.length > 20 || /[\s@#<>]/.test(a)) return null;
  return a;
}
// الأمر يشتغل بالاسم الأساسي (name!) أو بأي اختصار مضاف
function resolveCmd(gid, word) {
  if (word.length > 1 && word.endsWith('!') && has(COMMANDS, word.slice(0, -1))) return word.slice(0, -1);
  const all = (db.settings[gid] || {}).cmds;
  if (!all) return null;
  for (const [n, c] of Object.entries(all)) if (has(COMMANDS, n) && arr(c.aliases).includes(word)) return n;
  return null;
}

// ---------- API: الأوامر ----------
app.get('/api/guild/:id/commands', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const cat = String(req.query.cat || 'admin');
  res.json({
    canManage: info.canManage,
    guildPremium: isPremium(info.id),
    roles: roleList(info.id),
    channels: textChannels(info.id),
    cmds: CMD_LIST.filter((c) => c.cat === cat).map((c) => ({ name: c.name, desc: c.desc, premium: c.premium, ...cmdCfg(info.id, c.name), pen: PEN_CMDS.includes(c.name) ? penCfg(info.id, c.name) : null })),
  });
}));

// حفظ دفعة وحدة (كل التعديلات المعلقة بالواجهة) — كلها تنحفظ أو ولا وحدة
app.put('/api/guild/:id/commands', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  const patch = (req.body || {}).cmds;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return res.status(400).json({ error: 'bad_value' });
  const names = Object.keys(patch);
  if (!names.length || names.length > CMD_LIST.length) return res.status(400).json({ error: 'bad_value' });
  const roleOk = (x) => cg.roles.cache.has(x);
  const chOk = (x) => cg.channels.cache.has(x);
  const next = {};
  for (const name of names) {
    if (!has(COMMANDS, name)) return res.status(404).json({ error: 'not_found' });
    const b = patch[name] || {};
    if (COMMANDS[name].premium && !isPremium(info.id)) return res.status(403).json({ error: 'premium_required' });
    const cur = cmdCfg(info.id, name);
    if ('enabled' in b) {
      cur.enabled = b.enabled === true;
      if (cur.enabled && COMMANDS[name].premium && !isPremium(info.id)) return res.status(403).json({ error: 'premium_required' });
    }
    for (const [k, ok] of [['allowRoles', roleOk], ['blockRoles', roleOk], ['allowChannels', chOk], ['blockChannels', chOk]]) {
      if (!(k in b)) continue;
      if (!Array.isArray(b[k]) || !b[k].every((x) => typeof x === 'string' && SNOW.test(x) && ok(x))) return res.status(400).json({ error: 'bad_value' });
      cur[k] = [...new Set(b[k])].slice(0, 100);
    }
    if ('aliases' in b) {
      if (!Array.isArray(b.aliases) || b.aliases.length > 10) return res.status(400).json({ error: 'bad_alias' });
      const out = [];
      for (const raw of b.aliases) {
        const a = normAlias(raw);
        if (!a) return res.status(400).json({ error: 'bad_alias' });
        if (!out.includes(a)) out.push(a);
      }
      cur.aliases = out;
    }
        if (b.penalty !== undefined && PEN_CMDS.includes(name)) {
              if (b.wreasons !== undefined && name === 'warn') {
      try { cur.wreasons = warnClean(b.wreasons); } catch (e) { return res.status(400).json({ error: e.code || 'bad_value' }); }
    }
      try { cur.penalty = penClean(b.penalty); } catch (e) { return res.status(400).json({ error: e.code || 'bad_value' }); }
    }
    next[name] = cur;
  
  }
  // فحص تعارض الاختصارات على الوضع النهائي (بعد كل التعديلات)
  const owner = new Map();
  for (const n of Object.keys(COMMANDS)) {
    const list = next[n] ? next[n].aliases : cmdCfg(info.id, n).aliases;
    for (const a of list) {
      const clash = (a.endsWith('!') && has(COMMANDS, a.slice(0, -1))) || (owner.has(a) && owner.get(a) !== n);
      if (clash) return res.status(400).json({ error: 'alias_taken', detail: a });
      owner.set(a, n);
    }
  }
  const all = S(info.id).cmds || (S(info.id).cmds = {});
  Object.assign(all, next);
  dirty = true;
  res.json({ ok: true });
}));

// ---------- تنفيذ الأوامر ----------
const say = (msg, text) => msg.reply({ content: String(text).slice(0, 1900), allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
const EMB = () => new EmbedBuilder().setColor(0xfbbf24);
const card = (msg, e) => msg.reply({ embeds: [e], allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
const ts = (ms, f = 'F') => `<t:${Math.floor(ms / 1000)}:${f}>`;
const chunkList = (lines, max = 3800) => {
  let out = '', n = 0;
  for (const l of lines) { if ((out + l).length > max) { out += `... و${lines.length - n} آخرين`; break; } out += l + '\n'; n++; }
  return out;
};
const idOf = (s) => String(s || '').replace(/[<@!>#&]/g, '');
const need = (cond, text) => { if (!cond) { const e = new Error(text); e.usage = true; throw e; } };
async function targetMember(msg, args) {
  const m = msg.mentions.members && msg.mentions.members.first();
  if (m) return m;
  const id = idOf(args[0]);
  return SNOW.test(id) ? msg.guild.members.fetch(id).catch(() => null) : null;
}
async function targetUser(msg, args) {
  const u = msg.mentions.users.first();
  if (u) return u;
  const id = idOf(args[0]);
  return SNOW.test(id) ? client.users.fetch(id).catch(() => null) : null;
}
function roleFrom(msg, args) {
  const r = msg.mentions.roles.first();
  if (r) return r;
  for (const a of args) { const id = idOf(a); if (SNOW.test(id) && msg.guild.roles.cache.has(id)) return msg.guild.roles.cache.get(id); }
  const name = args.join(' ').trim().toLowerCase();
  return name ? msg.guild.roles.cache.find((x) => x.name.toLowerCase() === name) || null : null;
}
function outranks(msg, mod, t) {
  if (msg.guild.ownerId === mod.id) return true;
  if (t.id === msg.guild.ownerId) return false;
  return mod.roles.highest.comparePositionTo(t.roles.highest) > 0;
}
function parseDur(s) {
  const m = /^(\d+)(s|m|h|d)?$/i.exec(s || '');
  if (!m) return 0;
  return Number(m[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[(m[2] || 'm').toLowerCase()];
}
const reasonOf = (mod, text) => `${mod.user.tag}: ${text || '-'}`.slice(0, 500);

// قائمة البوتات (تستخدم بـ botstatus و bots)
async function botList(msg) {
  const all = await msg.guild.members.fetch();
  const bots = all.filter((m) => m.user.bot);
  const lines = bots.map((m) =>
    `<@${m.id}> — ${m.permissions.has(PermissionFlagsBits.Administrator) ? '⚠️ أدمن' : 'عادي'}${m.voice.channel ? ' — 🔊 ' + m.voice.channel.name : ''} — انضم ${ts(m.joinedTimestamp, 'R')}`);
  card(msg, EMB().setTitle(`🤖 البوتات (${bots.size})`).setDescription(chunkList([...lines.values()]) || 'لا يوجد بوتات.'));
}



const LOG_CH = [['messages', 'log-messages'], ['members', 'log-members'], ['voice', 'log-voice'], ['mod', 'log-moderation'], ['roles', 'log-roles'], ['channels', 'log-channels']];
const ADVICE = [
  'فعّل المصادقة الثنائية (2FA) لكل الإداريين، وخصوصاً أصحاب صلاحية Administrator.',
  'لا تعطي صلاحية Administrator إلا للضروري، وخلي رتبة البوت أقل من رتب الإدارة.',
  'فعّل التحقق من العضوية (Verification Level) لتقليل حسابات السبام والريد.',
  'امنع @everyone من إرسال الروابط والملفات بالرومات العامة.',
  'راجع البوتات اللي عندها صلاحيات خطيرة بشكل دوري (استخدم bots!).',
  'اعمل شات لوق للعقوبات والتعديلات الإدارية، عشان تتبع أي تخريب بسرعة.',
  'لا تشارك التوكن أو الـ Client Secret مع أي شخص، وغيّرهم فوراً لو انكشفوا.',
  'فعّل AutoMod لحجب الروابط والمنشن الجماعي والكلمات الممنوعة.',
];
// ---------- رسالة الاستخدام: [الصيغة, الأمثلة]  ({u} = منشن، {id} = ايدي) ----------
const CMD_USAGE = {
  ban: ['[user] (reason)', ['{u}', '{u} spam', '{id}']],
  unban: ['[id]', ['{id}']],
  kick: ['[user] (reason)', ['{u}', '{u} spam']],
  mute: ['[user] (time) (reason)', ['{u}', '{u} 1h spam', '{u} 1d السبب هنا']],
  unmute: ['[user]', ['{u}', '{id}']],
  mymute: ['(user)', ['{u}']],
    dinfractions: ['[user]', ['{u}', '{id}']],
  warnings: ['(user) (page)', ['{u}', '{u} 2']],
  blockpic: ['[user] (reason)', ['{u}', '{id}']],
  removeblockpic: ['[user]', ['{u}', '{id}']],
  timeout: ['[user] [time] (reason)', ['{u} 10m', '{u} 1h spam']],
  untimeout: ['[user]', ['{u}']],
  prison: ['[user] (reason)', ['{u}', '{u} spam']],
  unprison: ['[user]', ['{u}']],
  myprison: ['(user)', ['{u}']],
  vkick: ['[user]', ['{u}']],
  vmute: ['[user]', ['{u}']],
  unvmute: ['[user]', ['{u}']],
  setnick: ['[user] [nick]', ['{u} الاسم_الجديد']],
  clear: ['[count]', ['10', '100']],
  warn: ['[user] (reason)', ['{u} spam']],
  warnings: ['(user)', ['{u}']],
  role: ['[user] [role]', ['{u} @role']],
  removeroles: ['[user]', ['{u}']],
  rblock: ['[user] [role]', ['{u} @role']],
  removeblock: ['[user] [role]', ['{u} @role']],
  move: ['[user]', ['{u}']],
  moveme: ['[user]', ['{u}']],
  moveto: ['[user] [#voice]', ['{u} #voice']],
  moveall: ['[#from] [#to]', ['#from #to']],
};
function usageCard(msg, name) {
  const def = COMMANDS[name];
  const [args, exs] = CMD_USAGE[name] || ['', []];
  const al = cmdCfg(msg.guildId, name).aliases;
  const fix = (s) => s.replace(/\{u\}/g, `<@${msg.author.id}>`).replace(/\{id\}/g, '123456789');
  card(msg, new EmbedBuilder().setColor(0x2b2d31).setTitle(`Command: ${name}`).setDescription(def.desc + '.')
    .addFields(
      { name: 'الأختصارات:', value: al.length ? al.join('\n') : 'لا يوجد' },
      { name: 'الاستخدام:', value: `${name}! ${args}`.trim() },
      { name: 'أمثلة للأمر:', value: exs.length ? exs.map((x) => `${name}! ${fix(x)}`).join('\n') : `${name}!` }));
// قائمة منشنات بحد أقصى للأحرف (حد ديسكورد لنصوص V2 مجتمعة 4000)
const fitList = (arr, max = 1300) => {
  let out = '', n = 0;
  for (const m of arr) {
    const t = (n ? ', ' : '') + `<@${m.id}>`;
    if ((out + t).length > max) return out + `\n... و${arr.length - n} آخرين`;
    out += t; n++;
  }
  return out || '—';
};
async function botStatusCard(msg) {
  const all = await msg.guild.members.fetch({ withPresences: true });
  const bots = [...all.filter((m) => m.user.bot).values()];
  const online = bots.filter((m) => m.presence && m.presence.status !== 'offline');
  const offline = bots.filter((m) => !m.presence || m.presence.status === 'offline');
  const sep = { type: 14, divider: true, spacing: 1 };
  await client.rest.post(Routes.channelMessages(msg.channelId), { body: {
    flags: 1 << 15,
    allowed_mentions: { parse: [] },
    message_reference: { message_id: msg.id, fail_if_not_exists: false },
    components: [{ type: 17, accent_color: 0xef4444, components: [
      { type: 10, content: `## 🤖 حالة البوتات في السيرفر\n**عدد البوتات :** \`${bots.length}\`` },
      sep,
      { type: 10, content: `## ✅ البوتات المتصلة\n${fitList(online)}` },
      sep,
      { type: 10, content: `## ⛔ البوتات الغير متصلة\n${fitList(offline)}` },
      sep,
      { type: 10, content: `-# <t:${Math.floor(Date.now() / 1000)}:f>` },
    ] }],
  } });
}
    }// ---------- رتبة الميوت الكتابي ----------
const MUTE_DENY = { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false, AddReactions: false };
async function muteRole(guild) {
  const s = S(guild.id);
  let role = s.muteRole && guild.roles.cache.get(s.muteRole);
  if (!role) {
    role = await guild.roles.create({ name: 'Muted', permissions: [], reason: 'OPS mute role' });
    s.muteRole = role.id; dirty = true;
  }
    
  for (const ch of guild.channels.cache.values()) {
    if (!ch.permissionOverwrites) continue;
    const ow = ch.permissionOverwrites.cache.get(role.id);
    if (ow && ow.deny.has(PermissionFlagsBits.SendMessages)) continue;
    await ch.permissionOverwrites.edit(role, MUTE_DENY).catch(() => {});
  }
  return role;
}
// ينهي الميوت المنتهي: يشيل الرتبة ويمسح السجل
async function muteSweep() {
  for (const [gid, list] of Object.entries(db.mutes || {})) {
    const guild = client.guilds.cache.get(gid);
    for (const [uid, mu] of Object.entries(list)) {
      if (!mu.until || mu.until > Date.now()) continue;
      delete list[uid]; dirty = true;
      const rid = (db.settings[gid] || {}).muteRole;
      if (!guild || !rid) continue;
      const mem = await guild.members.fetch(uid).catch(() => null);
      if (mem && mem.roles.cache.has(rid)) await mem.roles.remove(rid, 'OPS: mute expired').catch(() => {});
    }
  }
}async function muteSweep() {
  for (const [gid, list] of Object.entries(db.mutes || {})) {
    const guild = client.guilds.cache.get(gid);
    for (const [uid, mu] of Object.entries(list)) {
      if (!mu.until || mu.until > Date.now()) continue;
      delete list[uid]; dirty = true;
      const rid = (db.settings[gid] || {}).muteRole;
      if (!guild || !rid) continue;
      const mem = await guild.members.fetch(uid).catch(() => null);
      if (mem && mem.roles.cache.has(rid)) await mem.roles.remove(rid, 'OPS: mute expired').catch(() => {});
    }
  }
}

// ---------- نظام العقوبات (الميوت + السجن) ----------
const PRISON_IMG = ''; // اختياري: رابط صورة تظهر برسالة الترحيب بالسجن
const PEN_CMDS = ['mute', 'prison', 'timeout', 'ban'];
const PEN_UNITS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
const PEN_MAX = 365 * 864e5;
const silentErr = () => Object.assign(new Error('silent'), { silent: true });

function penCfg(gid, name) {
  const p = (((db.settings[gid] || {}).cmds || {})[name] || {}).penalty || {};
  const mk = (n, u) => { const x = Number(n); return Number.isInteger(x) && x >= 0 && has(PEN_UNITS, u) && x * PEN_UNITS[u] <= PEN_MAX ? { n: x, u } : null; };
  const time = mk(p.time && p.time.n, p.time && p.time.u) || (name === 'ban' ? { n: 0, u: 'd' } : { n: 1, u: 'h' });
  const reasons = arr(p.reasons).map((r) => {
    const t = r && mk(r.n, r.u);
    return r && typeof r.text === 'string' && r.text.trim() && t ? { text: r.text.trim().slice(0, 100), n: t.n, u: t.u } : null;
  }).filter(Boolean).slice(0, 25);
  return { mode: p.mode === 'reasons' ? 'reasons' : 'default', time, reasons };
}
const penMs = (t) => t.n * PEN_UNITS[t.u];

function penClean(b) {
  if (!b || typeof b !== 'object') throw codeErr('bad_value');
  const t = (x) => {
    const n = Number(x && x.n);
    if (!x || !Number.isInteger(n) || n < 0 || !has(PEN_UNITS, x.u) || n * PEN_UNITS[x.u] > PEN_MAX) throw codeErr('bad_value');
    return { n, u: x.u };
  };
  const list = arr(b.reasons);
  if (list.length > 25) throw codeErr('limit_reached');
  return {
    mode: b.mode === 'reasons' ? 'reasons' : 'default',
    time: t(b.time),
    reasons: list.map((r) => {
      const text = String((r && r.text) || '').trim();
      if (!text || text.length > 100) throw codeErr('bad_value');
      return { text, ...t(r) };
    }),
  };
}

// يفصل: المنشن/الايدي، المدة (7d / 1h / 10m ... بأي مكان)، والباقي = السبب
function parsePenalty(a) {
  let ms = 0, skipped = false, pos = 0;
  const rest = [];
  for (const w of a) {
    if (!skipped && SNOW.test(idOf(w))) { skipped = true; continue; }
    if (!ms && /^\d+(s|m|h|d)?$/i.test(w) && (pos === 0 || /[smhd]$/i.test(w))) { ms = parseDur(w); pos++; continue; }
    rest.push(w); pos++;
  }
  return { ms, reason: rest.join(' ') };
}

// ---------- السجن ----------
// رتبة + روم واحد فقط (ينعملوا أول مرة). كل الرومات الباقية تنخفي عن الرتبة.
async function prisonRole(guild) {
  const s = S(guild.id), V = PermissionFlagsBits;
  let role = s.prisonRole && guild.roles.cache.get(s.prisonRole);
  if (!role) {
    role = await guild.roles.create({ name: 'Prison', permissions: [], reason: 'OPS prison role' });
    s.prisonRole = role.id; dirty = true;
  }
  let room = s.prisonChannel && guild.channels.cache.get(s.prisonChannel);
  if (!room) {
    room = await guild.channels.create({
      name: 'prison-chat', type: ChannelType.GuildText, reason: 'OPS prison room',
      permissionOverwrites: [
        { id: guild.id, deny: [V.ViewChannel] },
        { id: role.id, allow: [V.ViewChannel, V.ReadMessageHistory], deny: [V.SendMessages, V.AddReactions] },
        { id: client.user.id, allow: [V.ViewChannel, V.SendMessages, V.EmbedLinks, V.ManageChannels] },
      ],
    });
    s.prisonChannel = room.id; dirty = true;
  }
  for (const ch of guild.channels.cache.values()) {
    if (ch.id === room.id || !ch.permissionOverwrites) continue;
    const ow = ch.permissionOverwrites.cache.get(role.id);
    if (ow && ow.deny.has(V.ViewChannel)) continue;
    await ch.permissionOverwrites.edit(role, { ViewChannel: false, SendMessages: false, Connect: false }).catch(() => {});
  }
  return { role, room };
}

async function applyPrison(guild, mod, m, ms, reason) {
  const { role, room } = await prisonRole(guild);
  need(role.editable, 'رتبة البوت لازم تكون أعلى من رتبة السجن.');
  const P = dbk('prison', guild.id);
  const prev = P[m.id];
  P[m.id] = {
    roles: prev ? prev.roles : m.roles.cache.filter((r) => r.id !== guild.id && r.id !== role.id && !r.managed && r.editable).map((r) => r.id),
    by: mod.id, reason, at: Date.now(), until: ms ? Date.now() + ms : 0,
  };
  const keep = m.roles.cache.filter((r) => r.id !== guild.id && r.id !== role.id && (r.managed || !r.editable)).map((r) => r.id);
  await m.roles.set([...keep, role.id], reasonOf(mod, reason));
  if (m.voice.channel) m.voice.disconnect('OPS: prison').catch(() => {});
  logInf(guild.id, m.id, 'prison', mod.id, reason, ms);
  dirty = true;
  if (room && typeof room.send === 'function') {
    const e = new EmbedBuilder().setColor(0xef4444).setTitle('⛓️ مرحباً بك في السجن')
      .setDescription(`**العضو :** <@${m.id}>\n**المدة :** ${ms ? ts(Date.now() + ms, 'R') : 'دائم'}`)
      .setFooter({ text: ms ? 'ستتم إعادة رتبتك تلقائياً بعد انتهاء المدة' : 'ستتم إعادة رتبتك عند فك السجن' });
    if (PRISON_IMG) e.setThumbnail(PRISON_IMG);
    room.send({ content: `<@${m.id}>`, embeds: [e], allowedMentions: { users: [m.id] } }).catch(() => {});
  }
  return `✅ تم سجن ${m.user.username} !`;
}

// يرجّع الرتب القديمة ويشيل رتبة السجن
async function prisonRelease(guild, uid, why) {
  const P = dbr('prison', guild.id);
  const rec = P[uid];
  const rid = (db.settings[guild.id] || {}).prisonRole;
  const m = await guild.members.fetch(uid).catch(() => null);
  if (m) {
    const keep = m.roles.cache.filter((r) => r.id !== guild.id && r.id !== rid).map((r) => r.id);
    const back = rec ? arr(rec.roles).filter((x) => guild.roles.cache.has(x)) : [];
    await m.roles.set([...new Set([...keep, ...back])], 'OPS: ' + why).catch(() => {});
  }
  delete P[uid]; dirty = true;
}
async function prisonSweep() {
  for (const [gid, list] of Object.entries(db.prison || {})) {
    const guild = client.guilds.cache.get(gid);
    if (!guild) continue;
    for (const [uid, p] of Object.entries(list)) {
      if (p.until && p.until <= Date.now()) await prisonRelease(guild, uid, 'prison expired').catch(() => {});
    }
  }
}

// ---------- الميوت ----------
async function applyMute(guild, mod, m, ms, reason) {
  const role = await muteRole(guild);
  need(role.editable, 'رتبة البوت لازم تكون أعلى من رتبة Muted.');
  await m.roles.add(role, reasonOf(mod, reason));
  dbk('mutes', guild.id)[m.id] = { until: ms ? Date.now() + ms : 0, by: mod.id, reason, at: Date.now() };
  logInf(guild.id, m.id, 'mute', mod.id, reason, ms);
  dirty = true;
  return `🤐 تم إسكات ${m.user.username} !`;
}

// ---------- قائمة الأسباب (مشتركة للميوت والسجن) ----------
async function penaltyMenu(msg, mod, target, kind) {
  const cfg = penCfg(msg.guildId, kind);
  const sym = kind === 'mute' ? '🤐' : '⛓️';
  await client.rest.post(Routes.channelMessages(msg.channelId), { body: {
    flags: 1 << 15, allowed_mentions: { parse: [] },
    message_reference: { message_id: msg.id, fail_if_not_exists: false },
    components: [{ type: 17, accent_color: 0x0ea5e9, components: [
      { type: 1, components: [{
        type: 3, custom_id: `pen:s:${kind}:${mod.id}:${target.id}`, placeholder: 'اختر سبباً',
        options: cfg.reasons.slice(0, 25).map((r, i) => ({ label: r.text.slice(0, 100), value: String(i), description: r.n ? `المدة: ${r.n}${r.u}` : 'المدة: دائم', emoji: { name: sym } })),
      }] },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 2, style: 4, custom_id: `pen:x:${kind}:${mod.id}:0`, label: 'إلغاء' }] },
    ] }],
  } });
}

async function onPenaltyInteraction(i) {
  try {
    const cid = String(i.customId || '');
    if (!i.guildId || !cid.startsWith('pen:')) return;
    const [, act, kind, modId, targetId] = cid.split(':');
    if (i.user.id !== modId) return void (await i.reply({ content: '⚠️ هذي القائمة للمشرف اللي كتب الأمر.', flags: 64 }));
    if (act === 'x') { await i.deferUpdate(); return void i.message.delete().catch(() => {}); }
    if (act !== 's' || !i.isStringSelectMenu() || !PEN_CMDS.includes(kind)) return;
    await i.deferUpdate();
    const guild = i.guild;
    const r = penCfg(guild.id, kind).reasons[Number(i.values[0])];
    const mod = await guild.members.fetch(i.user.id);
    const m = await guild.members.fetch(targetId).catch(() => null);
    let text;
    if (!r) text = '⚠️ هذا السبب لم يعد متاحاً.';
    else if (!m) text = '⚠️ العضو غير موجود بالسيرفر.';
    else if (!outranks({ guild }, mod, m)) text = '⚠️ ما بتقدر تعاقب عضو رتبته مثل رتبتك أو أعلى.';
    else {
      const ms = r.n * PEN_UNITS[r.u];
      try {
        text = kind === 'mute' ? await applyMute(guild, mod, m, ms, r.text) : await applyPrison(guild, mod, m, ms, r.text);
        L(guild, kind === 'mute' ? 'textmute' : 'prison', kind === 'mute' ? '🔇 ميوت كتابي' : '⛓️ سجن عضو',
          `**المنفذ:** <@${mod.id}>\n**الهدف:** <@${m.id}>\n**السبب:** ${cut(r.text, 300)}`);
      } catch (e) { text = e.usage ? e.message : '⚠️ تعذر التنفيذ: ' + discordMsg(e); }
    }
    await client.rest.patch(Routes.channelMessage(i.channelId, i.message.id), { body: {
      flags: 1 << 15, components: [{ type: 17, accent_color: 0x22c55e, components: [{ type: 10, content: text }] }],
    } });
  } catch (_) {}
}// ================= مدد: 10m / 1h / 2d / 1w / 1mo / 1y =================
const DUR_RE = /^(\d+)(s|m|h|d|w|mo|y)?$/i;
const DUR_MS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, mo: 2592e6, y: 31536e6 };
const durOf = (w) => { const m = DUR_RE.exec(w || ''); return m ? Number(m[1]) * DUR_MS[(m[2] || 'm').toLowerCase()] : 0; };
function durText(ms) {
  if (!ms) return 'نهائي';
  for (const [v, one, many] of [[864e5, 'يوم', 'أيام'], [36e5, 'ساعة', 'ساعات'], [6e4, 'دقيقة', 'دقائق'], [1e3, 'ثانية', 'ثواني']]) {
    if (ms >= v) { const n = Math.floor(ms / v); return n === 1 ? one : `${n} ${n <= 10 ? many : one}`; }
  }
  return '—';
}
// يفصل: المنشن/الايدي، المدة (بأي مكان)، والباقي = السبب
function parsePenalty(a) {
  let ms = 0, skipped = false, pos = 0;
  const rest = [];
  for (const w of a) {
    if (!skipped && SNOW.test(idOf(w))) { skipped = true; continue; }
    if (!ms && DUR_RE.test(w) && (pos === 0 || /\D$/.test(w))) { ms = durOf(w); pos++; continue; }
    rest.push(w); pos++;
  }
  return { ms, reason: rest.join(' ') };
}

const PEN_ICON = { mute: '🤐', prison: '⛓️', timeout: '⏳', ban: '🔨', warn: '⚠️' };
const PEN_LOG = { mute: ['textmute', '🔇 ميوت كتابي'], prison: ['prison', '⛓️ سجن عضو'], warn: ['warns', '⚠️ تحذير إداري'] };

// ================= التحذير (قائمة أسباب بدون وقت + رسالة بالخاص) =================
function warnReasons(gid) {
  const l = ((((db.settings[gid] || {}).cmds || {}).warn || {}).wreasons);
  return arr(l).map((r) => (r && typeof r.label === 'string' && typeof r.text === 'string' && r.label.trim() && r.text.trim()
    ? { label: r.label.trim().slice(0, 100), text: r.text.trim().slice(0, 500) } : null)).filter(Boolean).slice(0, 25);
}
function warnClean(list) {
  if (!Array.isArray(list) || list.length > 25) throw codeErr('limit_reached');
  return list.map((r) => {
    const label = String((r && r.label) || '').trim(), text = String((r && r.text) || '').trim();
    if (!label || label.length > 100 || !text || text.length > 500) throw codeErr('bad_value');
    return { label, text };
  });
}
async function applyWarn(guild, mod, m, reason) {
  logInf(guild.id, m.id, 'warn', mod.id, reason || 'بدون سبب');
  const e = new EmbedBuilder().setColor(0xfbbf24).setTitle('⚠️ لقد تم تحذيرك !')
    .setDescription(`**السيرفر :** ${guild.name}\n\n**📝 السبب**\n${cut(reason || 'بدون سبب', 900)}`).setTimestamp();
  const ic = guild.iconURL({ size: 128 });
  if (ic) e.setThumbnail(ic);
  m.send({ embeds: [e] }).catch(() => {});
  return `✅ تم تحذير ${m.user.username} !`;
}

// ================= تايم اوت + حظر (بمدة) =================
async function applyTimeout(guild, mod, m, ms, reason) {
  need(ms >= 1000 && ms <= 28 * 864e5, 'التايم اوت: المدة من ثانية إلى 28 يوم. مثال: timeout! @عضو 10m');
  await m.timeout(ms, reasonOf(mod, reason));
  logInf(guild.id, m.id, 'timeout', mod.id, reason, ms);
  return `⏳ تم إعطاء ${m.user.username} تايم أوت !`;
}
async function applyBan(guild, mod, m, ms, reason) {   // m = عضو أو { id, user: { username } }
  await guild.members.ban(m.id, { reason: reasonOf(mod, reason) });
  if (ms) dbk('tempbans', guild.id)[m.id] = { until: Date.now() + ms, by: mod.id };
  logInf(guild.id, m.id, 'ban', mod.id, reason, ms);
  dirty = true;
  return `🔨 تم حظر ${m.user.username} !` + (ms ? ` (${durText(ms)})` : '');
}
async function banSweep() {
  for (const [gid, list] of Object.entries(db.tempbans || {})) {
    const guild = client.guilds.cache.get(gid);
    for (const [uid, b] of Object.entries(list)) {
      if (!b.until || b.until > Date.now()) continue;
      delete list[uid]; dirty = true;
      if (guild) await guild.members.unban(uid, 'OPS: temp ban expired').catch(() => {});
    }
  }
}

const PEN_APPLY = {
  mute: applyMute, prison: applyPrison, timeout: applyTimeout, ban: applyBan,
  warn: (g, mod, m, ms, r) => applyWarn(g, mod, m, r),
};

// ================= قائمة الأسباب (مشتركة) =================
async function penaltyMenu(msg, mod, target, kind) {
  const opts = kind === 'warn'
    ? warnReasons(msg.guildId).map((r, i) => ({ label: r.label.slice(0, 100), value: String(i), description: r.text.slice(0, 100), emoji: { name: PEN_ICON.warn } }))
    : penCfg(msg.guildId, kind).reasons.map((r, i) => ({ label: r.text.slice(0, 100), value: String(i), description: r.n ? `المدة: ${r.n}${r.u}` : 'المدة: دائم', emoji: { name: PEN_ICON[kind] } }));
  await client.rest.post(Routes.channelMessages(msg.channelId), { body: {
    flags: 1 << 15, allowed_mentions: { parse: [] },
    message_reference: { message_id: msg.id, fail_if_not_exists: false },
    components: [{ type: 17, accent_color: 0x0ea5e9, components: [
      { type: 1, components: [{ type: 3, custom_id: `pen:s:${kind}:${mod.id}:${target.id}`, placeholder: 'اختر سبباً', options: opts.slice(0, 25) }] },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 2, style: 4, custom_id: `pen:x:${kind}:${mod.id}:0`, label: 'إلغاء' }] },
    ] }],
  } });
}

async function onPenaltyInteraction(i) {
  try {
    const cid = String(i.customId || '');
    if (!i.guildId || !cid.startsWith('pen:')) return;
    const [, act, kind, modId, targetId] = cid.split(':');
    if (i.user.id !== modId) return void (await i.reply({ content: '⚠️ هذي القائمة للمشرف اللي كتب الأمر.', flags: 64 }));
    if (act === 'x') { await i.deferUpdate(); return void i.message.delete().catch(() => {}); }
    if (act !== 's' || !i.isStringSelectMenu() || !(PEN_CMDS.includes(kind) || kind === 'warn')) return;
    await i.deferUpdate();
    const guild = i.guild, idx = Number(i.values[0]);
    const mod = await guild.members.fetch(i.user.id);
    const m = await guild.members.fetch(targetId).catch(() => null);
    const wr = kind === 'warn' ? warnReasons(guild.id)[idx] : null;
    const r = kind === 'warn' ? (wr && { text: wr.text, n: 0, u: 's' }) : penCfg(guild.id, kind).reasons[idx];
    let text;
    if (!r) text = '⚠️ هذا السبب لم يعد متاحاً.';
    else if (!m && kind !== 'ban') text = '⚠️ العضو غير موجود بالسيرفر.';
    else if (m && !outranks({ guild }, mod, m)) text = '⚠️ ما بتقدر تعاقب عضو رتبته مثل رتبتك أو أعلى.';
    else {
      const ms = kind === 'warn' ? 0 : r.n * PEN_UNITS[r.u];
      const target = m || { id: targetId, user: { username: targetId } };
      try {
        text = await PEN_APPLY[kind](guild, mod, target, ms, r.text);
        const lg = PEN_LOG[kind];
        if (lg) L(guild, lg[0], lg[1], `**المنفذ:** <@${mod.id}>\n**الهدف:** <@${targetId}>\n**السبب:** ${cut(r.text, 300)}`);
      } catch (e) { text = e.usage ? e.message : '⚠️ تعذر التنفيذ: ' + discordMsg(e); }
    }
    await client.rest.patch(Routes.channelMessage(i.channelId, i.message.id), { body: {
      flags: 1 << 15, components: [{ type: 17, accent_color: 0x22c55e, components: [{ type: 10, content: text }] }],
    } });
  } catch (e) { console.error('penalty interaction:', e.message); }
}

// ================= إدارة السجلات (dinfractions) =================
const INF_CATS = [
  ['mute', 'الاسكات', '⏰', ['mute']], ['vmute', 'الميوت', '🔇', ['vmute']], ['timeout', 'التايم اوت', '⏳', ['timeout']],
  ['prison', 'السجن', '⛓️', ['prison']], ['ban', 'الحظر', '🔨', ['ban']], ['kick', 'الطرد', '👢', ['kick']], ['warn', 'التحذيرات', '⚠️', ['warn']],
];
const INF_TIMED = ['mute', 'timeout', 'prison', 'ban'];
const infBtn = (id, label, emoji, style = 2, disabled = false) =>
  Object.assign({ type: 2, style, custom_id: id, label, disabled }, emoji ? { emoji: { name: emoji } } : {});

function infBody(guild, modId, uid, cat, page) {
  const list = arr(infOf(guild.id)[uid]);
  const sep = { type: 14, divider: true, spacing: 1 };
  if (!cat) {
    const rows = [];
    INF_CATS.forEach(([k, t, e, types], i) => {
      if (i % 5 === 0) rows.push({ type: 1, components: [] });
      rows[rows.length - 1].components.push(infBtn(`inf:cat:${modId}:${uid}:${k}:1`, `${t} (${list.filter((x) => types.includes(x.type)).length})`, e));
    });
    return { flags: 1 << 15, allowed_mentions: { parse: [] }, components: [
      { type: 17, accent_color: 0xef4444, components: [
        { type: 10, content: '## ⚖️ إدارة العقوبات' }, sep,
        { type: 10, content: `**العضو :** <@${uid}>\n**المشرف المسؤول :** <@${modId}>` }, sep,
        { type: 10, content: '**اختر التصنيف لعرض السجلات وحذفها :**' },
      ] }, ...rows ] };
  }
  const def = INF_CATS.find((c) => c[0] === cat) || INF_CATS[0];
  const all = list.filter((x) => def[3].includes(x.type)).slice().reverse();
  const per = 3, pages = Math.max(1, Math.ceil(all.length / per));
  page = Math.min(pages, Math.max(1, page));
  const comps = [{ type: 9, components: [{ type: 10, content: `## 📂 سجلات ${def[1]} (صفحة ${page})` }],
    accessory: { type: 2, style: 2, custom_id: `inf:menu:${modId}:${uid}`, label: 'القائمة', emoji: { name: '⬅️' } } }];
  if (!all.length) comps.push(sep, { type: 10, content: 'لا توجد سجلات.' });
  for (const x of all.slice((page - 1) * per, page * per)) {
    comps.push(sep, { type: 9,
      components: [{ type: 10, content: `**بواسطة :** <@${x.by}>\n**السبب :** ${cut(x.reason || 'بدون سبب', 150)}` + (INF_TIMED.includes(x.type) ? `\n**المدة :** ${durText(x.dur)}` : '') }],
      accessory: { type: 2, style: 4, custom_id: `inf:del:${modId}:${uid}:${cat}:${page}:${x.id || x.at}`, label: 'حذف' } });
  }
  return { flags: 1 << 15, allowed_mentions: { parse: [] }, components: [
    { type: 17, accent_color: 0xef4444, components: comps },
    { type: 1, components: [
      infBtn(`inf:cat:${modId}:${uid}:${cat}:${page - 1}`, 'السابقة', null, 2, page <= 1),
      infBtn(`inf:cat:${modId}:${uid}:${cat}:${page + 1}`, 'التالية', null, 2, page >= pages),
    ] } ] };
}

async function onInfractionInteraction(i) {
  try {
    const cid = String(i.customId || '');
    if (!i.guildId || !cid.startsWith('inf:')) return;
    const [, act, modId, uid, cat, pg, key, panelId] = cid.split(':');
    if (i.user.id !== modId) return void (await i.reply({ content: '⚠️ هذي اللوحة للمشرف اللي كتب الأمر.', flags: 64 }));

    // زر "حذف": يطلع تأكيد (يظهر للمشرف بس)
    if (act === 'del') {
      const what = cat === 'warn' ? 'هذا التحذير' : 'هذا السجل';
      return void (await i.reply({
        content: `⚠️ **هل أنت متأكد من حذف ${what} نهائياً !**`,
        components: [{ type: 1, components: [
          { type: 2, style: 4, custom_id: `inf:ok:${modId}:${uid}:${cat}:${pg}:${key}:${i.message.id}`, label: 'تأكيد الحذف' },
          { type: 2, style: 2, custom_id: `inf:no:${modId}:${uid}:x:1:x:x`, label: 'إلغاء' },
        ] }],
        flags: 64,
      }));
    }

    // تأكيد الحذف: لو السجل لنفسه ينمنع، لو لغيره ينحذف
    if (act === 'ok') {
      if (uid === i.user.id) {
        return void (await i.update({ content: '❌ **لا يمكنك حذف سجلات العقوبات الخاصة بك**', components: [] }));
      }
      await i.deferUpdate();
      const o = infOf(i.guildId);
      o[uid] = arr(o[uid]).filter((x) => String(x.id || x.at) !== key);
      dirty = true;
      await i.editReply({ content: '✅ تم الحذف.', components: [] });
      await client.rest.patch(Routes.channelMessage(i.channelId, panelId), {
        body: infBody(i.guild, modId, uid, cat, parseInt(pg, 10) || 1),
      }).catch(() => {});
      return;
    }

    if (act === 'no') return void (await i.update({ content: 'تم الإلغاء.', components: [] }));

    // تنقل (القائمة / التصنيفات / الصفحات)
    await i.deferUpdate();
    const body = act === 'menu' ? infBody(i.guild, modId, uid, null, 1) : infBody(i.guild, modId, uid, cat, parseInt(pg, 10) || 1);
    await client.rest.patch(Routes.channelMessage(i.channelId, i.message.id), { body });
  } catch (e) { console.error('infractions:', e.message); }
}

// ================= حدود الأوامر (Anti-abuse للمشرفين) =================
const CMD_LIMIT_KEYS = ['mute', 'vmute', 'prison', 'timeout', 'kick', 'ban', 'role'];
const CMD_LIMIT_ACTIONS = ['strip', 'stripAll'];
const CMD_LIMIT_MAP = { mute: 'mute', vmute: 'vmute', prison: 'prison', timeout: 'timeout', kick: 'kick', ban: 'ban', role: 'role', removeroles: 'role' };
const cmdHits = new Map();

async function guardStripAll(guild, member) {
  const me = guild.members.me;
  if (member.id === guild.ownerId) return { done: false, text: 'العضو مالك السيرفر' };
  if (!me || member.roles.highest.position >= me.roles.highest.position) return { done: false, text: 'العضو اعلى من البوت' };
  const rm = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.editable);
  if (!rm.size) return { done: true, text: 'ما عنده رتب لسحبها' };
  try { await member.roles.remove(rm.map((r) => r.id), 'OPS: تعدي حدود الأوامر'); return { done: true, text: `تم سحب ${rm.size} رتبة` }; }
  catch (e) { return { done: false, text: 'فشل التنفيذ: ' + discordMsg(e) }; }
}
async function cmdLimitCheck(msg, mod, name) {
  const key = CMD_LIMIT_MAP[name];
  if (!key) return;
  const cfg = smartCfg(msg.guildId);
  if (!cfg.enabled || mod.id === msg.guild.ownerId || cfg.whitelist.includes(mod.id)) return;
  const k = `${msg.guildId}:${mod.id}:${key}`, now = Date.now();
  const hits = (cmdHits.get(k) || []).filter((t) => now - t < GUARD_WINDOW);
  hits.push(now);
  cmdHits.set(k, hits);
  if (hits.length <= cfg.cmdLimits[key]) return;
  cmdHits.set(k, []);
  const res = cfg.cmdAction === 'stripAll' ? await guardStripAll(msg.guild, mod) : await guardPunish(msg.guild, mod, 'strip');
  const fb = ((S(msg.guildId).logs || {}).ch || {}).mod;
  const ch = msg.guild.channels.cache.get(cfg.logChannel) || msg.guild.channels.cache.get(fb);
  if (!ch || typeof ch.send !== 'function') return;
  ch.send({ embeds: [new EmbedBuilder().setColor(0xef4444).setTitle('⚠️ حدود الأوامر')
    .setDescription([`**العضو :** <@${mod.id}>`, `**الأمر :** \`${name}!\``, '', res.done ? `**تم الاجراء :** ${res.text}` : `**لم يتم الاجراء :** ${res.text}`, '', `**السبب :** تعدي الحد المسموح (${cfg.cmdLimits[key]}) خلال 60 ثانية`].join('\n'))
    .setTimestamp()], allowedMentions: { parse: [] } }).catch(() => {});
}
const HANDLERS = {
 
  // ===================== إدارية =====================

 
    async ban(msg, mod, a) {
    const m = await targetMember(msg, a);
    const uid = m ? m.id : idOf(a[0]);
    need(SNOW.test(uid), 'الاستخدام: ban!');
    need(!m || outranks(msg, mod, m), 'ما بتقدر تحظر عضو رتبته مثل رتبتك أو أعلى.');
    let { ms, reason } = parsePenalty(a);
    const cfg = penCfg(msg.guildId, 'ban');
    const target = m || { id: uid, user: { username: uid } };
    if (!ms && !reason && cfg.mode === 'reasons' && cfg.reasons.length) { await penaltyMenu(msg, mod, target, 'ban'); throw silentErr(); }
    if (!ms) ms = penMs(cfg.time);
    say(msg, await applyBan(msg.guild, mod, target, ms, reason));
  },
  async unban(msg, mod, a) {
    const uid = idOf(a[0]);
    need(SNOW.test(uid), 'الاستخدام: unban! <ايدي العضو>');
    await msg.guild.members.unban(uid, reasonOf(mod, ''));
        delete dbr('tempbans', msg.guildId)[uid]; dirty = true;
    say(msg, `✅ تم فك الحظر عن <@${uid}>.`);
  },
  async kick(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: kick! @عضو [السبب]');
    need(outranks(msg, mod, m), 'ما بتقدر تطرد عضو رتبته مثل رتبتك أو أعلى.');
    const reason = a.slice(1).join(' ');
    await m.kick(reasonOf(mod, reason));
    logInf(msg.guildId, m.id, 'kick', mod.id, reason);
    say(msg, `👢 تم طرد <@${m.id}>.`);
  },
    async timeout(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: timeout!');
    need(outranks(msg, mod, m), 'ما بتقدر تعطي تايم أوت لعضو رتبته مثل رتبتك أو أعلى.');
    let { ms, reason } = parsePenalty(a);
    const cfg = penCfg(msg.guildId, 'timeout');
    if (!ms && !reason && cfg.mode === 'reasons' && cfg.reasons.length) { await penaltyMenu(msg, mod, m, 'timeout'); throw silentErr(); }
    if (!ms) ms = penMs(cfg.time);
    say(msg, await applyTimeout(msg.guild, mod, m, ms, reason));
  },
  async untimeout(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: untimeout! @عضو');
    await m.timeout(null, reasonOf(mod, ''));
    say(msg, `✅ تم إزالة التايم أوت عن <@${m.id}>.`);
  },
  // يمسح من 1 إلى 1000 رسالة (البوت يمسح على دفعات 100). ديسكورد ما بيسمح بمسح رسائل أقدم من 14 يوم.
  async clear(msg, mod, a) {
    const n = parseInt(a[0], 10);
    need(n >= 1 && n <= 1000, 'الاستخدام: clear! 100  (من 1 إلى 1000)');
    const ch = msg.channel;
    need(ch.bulkDelete && ch.messages, 'ما أقدر أمسح بهذا الروم.');
    await msg.delete().catch(() => {});
    const limit = Date.now() - 14 * 864e5 + 60000;
    let left = n, deleted = 0, before, old = false;
    while (left > 0 && !old) {
      const batch = await ch.messages.fetch({ limit: Math.min(100, left), before });
      if (!batch.size) break;
      before = batch.last().id;
      left -= batch.size;
      const fresh = batch.filter((m) => m.createdTimestamp > limit && !m.pinned);
      if (batch.some((m) => m.createdTimestamp <= limit)) old = true;
      if (fresh.size) deleted += (await ch.bulkDelete(fresh, true)).size;
      if (batch.size < 100 && left > 0) break;
    }
        const note = await ch.send(`✅ تم مسح ${NF(deleted)} رسالة.` + (old ? ' (الرسائل الأقدم من 14 يوم ما بتنمسح)' : '')).catch(() => null);
    if (note) setTimeout(() => note.delete().catch(() => {}), 5000);
  },
  async setnick(msg, mod, a) {
    const m = await targetMember(msg, a);
    const nick = a.slice(1).join(' ').trim();
    need(m && nick.length <= 32, 'الاستخدام: setnick! @عضو الاسم_الجديد (الحد 32 حرف)');
    need(outranks(msg, mod, m), 'ما بتقدر تغير اسم عضو رتبته مثل رتبتك أو أعلى.');
    await m.setNickname(nick || null, reasonOf(mod, ''));
    say(msg, `✅ تم تغيير الاسم.`);
  },
  async vkick(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m && m.voice.channel, 'الاستخدام: vkick! @عضو (لازم يكون بروم صوتي)');
    await m.voice.disconnect(reasonOf(mod, ''));
    say(msg, `✅ تم طرد <@${m.id}> من الروم الصوتي.`);
  },
  async vmute(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m && m.voice.channel, 'الاستخدام: vmute! @عضو (لازم يكون بروم صوتي)');
    await m.voice.setMute(true, reasonOf(mod, ''));
        logInf(msg.guildId, m.id, 'vmute', mod.id, a.slice(1).join(' '));
    say(msg, `🔇 تم إسكات <@${m.id}> صوتياً.`);
  
  },
  async unvmute(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m && m.voice.channel, 'الاستخدام: unvmute! @عضو (لازم يكون بروم صوتي)');
    await m.voice.setMute(false, reasonOf(mod, ''));
    say(msg, `🔊 تم فك الميوت الصوتي عن <@${m.id}>.`);
  },
  async myvmute(msg, mod, a) {
    const m = (await targetMember(msg, a)) || mod;
    say(msg, m.voice.channel
      ? `🎙️ ${m.displayName} في «${m.voice.channel.name}» — ${m.voice.serverMute ? 'مكتوم صوتياً 🔇' : 'غير مكتوم 🔊'}`
      : `${m.displayName} مو بروم صوتي حالياً.`);
  },
  async move(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m && m.voice.channel && mod.voice.channel, 'لازم تكون انت والعضو بروم صوتي. الاستخدام: move! @عضو');
    await m.voice.setChannel(mod.voice.channel, reasonOf(mod, ''));
    say(msg, `✅ تم سحب <@${m.id}> إلى رومك.`);
  },
  async moveme(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m && m.voice.channel && mod.voice.channel, 'لازم تكون انت والعضو بروم صوتي. الاستخدام: moveme! @عضو');
    await mod.voice.setChannel(m.voice.channel, reasonOf(mod, ''));
    say(msg, `✅ تم نقلك إلى روم <@${m.id}>.`);
  },
  async moveto(msg, mod, a) {
    const ids = a.map(idOf).filter((x) => SNOW.test(x));
    const vc = ids.length && msg.guild.channels.cache.get(ids[ids.length - 1]);
    need(vc && vc.isVoiceBased(), 'الاستخدام: moveto! [@عضو] #روم_صوتي');
    const t = (await targetMember(msg, a)) || mod;
    need(t.voice.channel, 'العضو لازم يكون بروم صوتي.');
    await t.voice.setChannel(vc, reasonOf(mod, ''));
    say(msg, `✅ تم النقل إلى ${vc.name}.`);
  },
  async moveall(msg, mod, a) {
    const ids = a.map(idOf).filter((x) => SNOW.test(x));
    const from = ids.length > 1 ? msg.guild.channels.cache.get(ids[0]) : mod.voice.channel;
    const to = msg.guild.channels.cache.get(ids[ids.length - 1]);
    need(from && to && from.isVoiceBased() && to.isVoiceBased() && from.id !== to.id, 'الاستخدام: moveall! #من_روم #إلى_روم');
    let n = 0;
    for (const m of [...from.members.values()]) if (await m.voice.setChannel(to).then(() => 1, () => 0)) n++;
    say(msg, `✅ تم نقل ${n} عضو.`);
  },
    async warn(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: warn!');
    need(outranks(msg, mod, m), 'ما بتقدر تحذر عضو رتبته مثل رتبتك أو أعلى.');
    const reason = a.slice(1).join(' ');
    if (!reason && warnReasons(msg.guildId).length) { await penaltyMenu(msg, mod, m, 'warn'); throw silentErr(); }
    say(msg, await applyWarn(msg.guild, mod, m, reason));
  },
      async warnings(msg, mod, a) {
    const m = await targetMember(msg, a);
    const raw = idOf(a[0]);
    const uid = m ? m.id : (SNOW.test(raw) ? raw : mod.id);
    const l = arr(infOf(msg.guildId)[uid]).filter((x) => x.type === 'warn');
    if (!l.length) return say(msg, `⚠️ ليس لدى <@${uid}> تحذيرات`);
    const per = 10, pages = Math.ceil(l.length / per);
    const page = Math.min(pages, Math.max(1, parseInt(a.find((x) => /^\d{1,3}$/.test(x)), 10) || 1));
    const lines = l.slice((page - 1) * per, page * per).map((x, i) => `${(page - 1) * per + i + 1}. ${cut(x.reason || 'بدون سبب', 120)}`).join('\n');
    card(msg, new EmbedBuilder().setColor(0xfbbf24).setTitle('⚠️ سجل التحذيرات')
      .addFields({ name: 'العضو :', value: `<@${uid}>` }, { name: 'المشرف المسؤول :', value: `<@${l[l.length - 1].by}>` })
      .setDescription('```\n' + lines + '\n```')
      .setFooter({ text: `الصفحة ${page} من ${pages} • إجمالي: ${l.length}` }));
  },
  async dinfractions(msg, mod, a) {
    const m = await targetMember(msg, a);
    const uid = m ? m.id : idOf(a[0]);
    need(SNOW.test(uid), 'الاستخدام: dinfractions!');
    await client.rest.post(Routes.channelMessages(msg.channelId), { body: { ...infBody(msg.guild, mod.id, uid, null, 1), message_reference: { message_id: msg.id, fail_if_not_exists: false } } });
  },
  async dinfractions(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: dinfractions! @عضو   أو   dinfractions! @عضو clear');
    if (String(a[1]).toLowerCase() === 'clear') { delete infOf(msg.guildId)[m.id]; dirty = true; return say(msg, '🧹 تم مسح سجل العقوبات.'); }
    const l = arr(infOf(msg.guildId)[m.id]);
    say(msg, l.length
      ? `📋 سجل ${m.displayName}:\n` + l.slice(-10).map((x, i) => `${i + 1}. [${INF_LABEL[x.type] || x.type}] ${dstr(x.at)} — ${x.reason || '-'}`).join('\n')
      : 'السجل نظيف.');
  },
  async stats(msg, mod, a) {
    const m = (await targetMember(msg, a)) || mod;
    const c = {};
    for (const l of Object.values(infOf(msg.guildId))) for (const x of l) if (x.by === m.id) c[x.type] = (c[x.type] || 0) + 1;
    say(msg, `📊 إحصائيات ${m.displayName}:\n` + Object.entries(INF_LABEL).map(([k, t]) => `${t}: ${c[k] || 0}`).join('\n'));
  },
  // --- ميوت كتابي: البوت يحذف رسائل العضو (مدة اختيارية) ---
      // --- ميوت كتابي: رتبة Muted (وقت افتراضي أو قائمة أسباب من الداشبورد) ---
  async mute(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: mute!');
    need(outranks(msg, mod, m), 'ما بتقدر تسكت عضو رتبته مثل رتبتك أو أعلى.');
    let { ms, reason } = parsePenalty(a);
    const cfg = penCfg(msg.guildId, 'mute');
    if (!ms && !reason && cfg.mode === 'reasons' && cfg.reasons.length) { await penaltyMenu(msg, mod, m, 'mute'); throw silentErr(); }
    if (!ms) ms = penMs(cfg.time);
    say(msg, await applyMute(msg.guild, mod, m, ms, reason));
  },
    async mymute(msg, mod, a) {
    const m = (await targetMember(msg, a)) || mod;
    const mu = isMuted(msg.guildId, m.id) ? dbr('mutes', msg.guildId)[m.id] : null;
    if (!mu) return say(msg, `⚠️ ليس لدى ${m.user.username} عقوبة حالية`);
    card(msg, new EmbedBuilder().setColor(0x0ea5e9).setTitle('📄 قائمة عقوبة الاسكات الحاليه')
      .addFields(
        { name: 'المشرف المسؤول :', value: `<@${mu.by}>` },
        { name: 'العضو :', value: `<@${m.id}>` },
        { name: 'السبب :', value: '`' + cut(mu.reason || 'بدون سبب', 200) + '`' },
        { name: 'الوقت المتبقي :', value: mu.until ? ts(mu.until, 'R') : 'نهائي' })
      .setFooter({ text: `طلب بواسطة ${msg.author.username}` }).setTimestamp());
  },
  async unmute(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: unmute!');
    const o = dbr('mutes', msg.guildId);
    const rid = (db.settings[msg.guildId] || {}).muteRole;
    need(o[m.id] || (rid && m.roles.cache.has(rid)), 'هذا العضو مو مسكّت.');
    delete o[m.id]; dirty = true;
    if (rid && m.roles.cache.has(rid)) await m.roles.remove(rid, reasonOf(mod, 'unmute')).catch(() => {});
    say(msg, `✅ تم إزالة اسكات ${m.user.username} !`);
  },
  // --- سجن: يسحب كل الرتب ويعطي رتبة Prison + روم واحد، وبعد انتهاء المدة بترجع الرتب ---
  async prison(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: prison!');
    need(outranks(msg, mod, m), 'ما بتقدر تسجن عضو رتبته مثل رتبتك أو أعلى.');
    let { ms, reason } = parsePenalty(a);
    const cfg = penCfg(msg.guildId, 'prison');
    if (!ms && !reason && cfg.mode === 'reasons' && cfg.reasons.length) { await penaltyMenu(msg, mod, m, 'prison'); throw silentErr(); }
    if (!ms) ms = penMs(cfg.time);
    say(msg, await applyPrison(msg.guild, mod, m, ms, reason));
  },
  async myprison(msg, mod, a) {
    const m = (await targetMember(msg, a)) || mod;
    const p = dbr('prison', msg.guildId)[m.id];
    if (!p) return say(msg, `⚠️ ليس لدى ${m.user.username} عقوبة حالية`);
    const roles = arr(p.roles).filter((id) => msg.guild.roles.cache.has(id)).map((id) => `<@&${id}>`).join(' ') || '—';
    card(msg, new EmbedBuilder().setColor(0xef4444).setTitle('⛓️ معلومات السجين')
      .addFields(
        { name: 'المشرف المسؤول :', value: `<@${p.by}>` },
        { name: 'المستخدم :', value: `<@${m.id}>` },
        { name: 'السبب :', value: '`' + cut(p.reason || 'بدون سبب', 200) + '`' },
        { name: 'الوقت المتبقي :', value: p.until ? ts(p.until, 'R') : 'دائم' },
        { name: 'الرتب المسحوبة', value: cut(roles, 1000) })
      .setFooter({ text: `طلب بواسطة ${msg.author.username}` }).setTimestamp());
  },
  async unprison(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: unprison!');
    const rid = (db.settings[msg.guildId] || {}).prisonRole;
    need(dbr('prison', msg.guildId)[m.id] || (rid && m.roles.cache.has(rid)), 'هذا العضو مو مسجون.');
    await prisonRelease(msg.guild, m.id, 'unprison by ' + mod.user.tag);
    say(msg, `✅ تم تحرير ${m.user.username}!`);
  },
  
  // --- بلوك صور ---
  async blockpic(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: blockpic! @عضو [السبب]');
    need(outranks(msg, mod, m), 'ما بتقدر تبلوك عضو رتبته مثل رتبتك أو أعلى.');
    dbk('picblock', msg.guildId)[m.id] = { by: mod.id, reason: a.slice(1).join(' '), at: Date.now() };
    dirty = true;
    say(msg, `✅ تم منع ${m.user.username} من ارسال الصور و الفيديوهات !`);
  },
    async blocked(msg, mod, a) {
    const P = dbr('picblock', msg.guildId);
    const ids = Object.keys(P);
    const per = 5, pages = Math.max(1, Math.ceil(ids.length / per));
    const page = Math.min(pages, Math.max(1, parseInt(a[0], 10) || 1));
    const e = new EmbedBuilder().setColor(0xef4444).setTitle('⛔ قائمة اعضاء البلوك صور')
      .setFooter({ text: `OPS COIN • النظام الاداري • صفحة ${page} من ${pages}` });
    const rows = ids.slice((page - 1) * per, page * per);
    if (!rows.length) e.setDescription('ما في أحد عليه بلوك.');
    for (const id of rows) e.addFields({ name: '\u200b', value: `**المستخدم :** <@${id}>\n**المشرف المسؤول :** <@${P[id].by}>` });
    card(msg, e);
  },
  async removeblockpic(msg, mod, a) {
    const m = await targetMember(msg, a);
    const id = m ? m.id : idOf(a[0]);
    need(SNOW.test(id), 'الاستخدام: removeblockpic! @عضو');
    const P = dbr('picblock', msg.guildId);
    need(P[id], 'هذا العضو ما عليه بلوك صور.');
    delete P[id]; dirty = true;
    const bu = await client.users.fetch(id).catch(() => null);
    say(msg, `✅ تم إزالة البلوك صور من ${bu ? bu.username : id} !`);
  },
  async stickers(msg, mod, a) {
    const att = msg.attachments.first();
    need(att, 'الاستخدام: stickers! الاسم  (مع إرفاق صورة PNG/APNG/GIF أقل من 512KB)');
    const name = (a.join(' ').trim() || att.name.replace(/\.[^.]+$/, '')).slice(0, 30);
    need(name.length >= 2, 'اسم الستيكر لازم حرفين على الأقل.');
    const s = await msg.guild.stickers.create({ file: att.url, name, tags: 'ops', reason: reasonOf(mod, '') });
    say(msg, `✅ تمت إضافة الستيكر «${s.name}».`);
  },
  async aemoji(msg, mod, a) {
    let url, name;
    const em = /<(a?):(\w{2,32}):(\d+)>/.exec(a.join(' '));
    const att = msg.attachments.first();
    if (em) { url = `${CDN}/emojis/${em[3]}.${em[1] ? 'gif' : 'png'}?size=128`; name = em[2]; }
    else if (att) { url = att.url; name = a[0] || att.name.replace(/\.[^.]+$/, ''); }
    else if (/^https?:\/\//i.test(a[0] || '')) { url = a[0]; name = a[1] || 'emoji'; }
    need(url, 'الاستخدام: aemoji! <:ايموجي:>   أو   aemoji! الاسم مع صورة مرفقة   أو   aemoji! رابط الاسم');
    name = String(name).replace(/[^\w]/g, '_').slice(0, 32);
    if (name.replace(/_/g, '').length < 2) name = 'emoji_' + crypto.randomInt(1000, 9999);
    const e = await msg.guild.emojis.create({ attachment: url, name, reason: reasonOf(mod, '') });
    say(msg, `✅ تمت إضافة الإيموجي ${e} (${e.name}).`);
  },
  async botstatus(msg) { await botStatusCard(msg); },

  // ===================== عامة =====================
  async help(msg) {
    const gid = msg.guildId;
    const lines = CMD_LIST.filter((c) => cmdCfg(gid, c.name).enabled).map((c) => {
      const al = cmdCfg(gid, c.name).aliases;
      return `\`${c.name}!\`${al.length ? ' / ' + al.map((x) => `\`${x}\``).join(' / ') : ''} — ${c.desc}`;
    });
    card(msg, EMB().setTitle('📖 قائمة الأوامر').setDescription(chunkList(lines) || 'لا توجد أوامر مفعلة.'));
  },
  async avatar(msg, mod, a) {
    const u = (await targetUser(msg, a)) || msg.author;
    card(msg, EMB().setTitle(`صورة ${u.globalName || u.username}`).setImage(u.displayAvatarURL({ size: 1024, extension: 'png' })));
  },
  async banner(msg, mod, a) {
    const u = (await targetUser(msg, a)) || msg.author;
    const f = await u.fetch(true);
    const url = f.bannerURL({ size: 1024, extension: 'png' });
    need(url, 'هذا الشخص ما عنده بنر.');
    card(msg, EMB().setTitle(`بنر ${u.globalName || u.username}`).setImage(url));
  },
  async profile(msg, mod, a) {
    const m = (await targetMember(msg, a)) || mod;
    const r = (db.guilds[msg.guildId] || { members: {} }).members[m.id] || {};
    const x = xpInfo(r.xp || 0);
    card(msg, EMB().setAuthor({ name: m.displayName, iconURL: m.displayAvatarURL() }).setThumbnail(m.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'الرسائل', value: NF(r.w), inline: true },
        { name: 'الصوت', value: fmtMinS(r.v || 0), inline: true },
        { name: 'المستوى', value: `${x.level} (${NF(x.cur)}/${NF(x.need)} XP)`, inline: true },
        { name: 'الدعوات', value: NF(r.inv), inline: true },
        { name: 'انضم للسيرفر', value: m.joinedTimestamp ? ts(m.joinedTimestamp, 'R') : '-', inline: true },
        { name: 'أنشأ الحساب', value: ts(m.user.createdTimestamp, 'R'), inline: true }));
  },
  async level(msg, mod, a) {
    const m = (await targetMember(msg, a)) || mod;
    const g = db.guilds[msg.guildId] || { members: {} };
    const xp = (g.members[m.id] || {}).xp || 0;
    const x = xpInfo(xp);
    const rank = Object.values(g.members).filter((o) => (o.xp || 0) > xp).length + 1;
    const filled = Math.round((x.cur / x.need) * 10);
    card(msg, EMB().setAuthor({ name: m.displayName, iconURL: m.displayAvatarURL() })
      .setDescription(`**المستوى ${x.level}** — الترتيب #${rank}\n${'🟨'.repeat(filled)}${'⬛'.repeat(10 - filled)}\n${NF(x.cur)} / ${NF(x.need)} XP (المجموع ${NF(xp)})`));
  },
  async server(msg) {
    const g = msg.guild;
    const chs = g.channels.cache;
    card(msg, EMB().setTitle(g.name).setThumbnail(g.iconURL({ size: 256 }))
      .addFields(
        { name: 'المالك', value: `<@${g.ownerId}>`, inline: true },
        { name: 'الأعضاء', value: NF(g.memberCount), inline: true },
        { name: 'الرتب', value: NF(g.roles.cache.size - 1), inline: true },
        { name: 'الرومات', value: `كتابي ${chs.filter((c) => c.isTextBased() && !c.isVoiceBased() && !c.isThread()).size} • صوتي ${chs.filter((c) => c.isVoiceBased()).size}`, inline: true },
        { name: 'البوست', value: `${g.premiumSubscriptionCount || 0} (مستوى ${g.premiumTier})`, inline: true },
        { name: 'تاريخ الإنشاء', value: ts(g.createdTimestamp, 'R'), inline: true })
      .setFooter({ text: 'ID: ' + g.id }));
  },
  async ping(msg) {
    const t = Date.now();
    const m = await msg.reply({ content: '🏓 ...', allowedMentions: { parse: [], repliedUser: false } }).catch(() => null);
    if (m) m.edit(`🏓 Pong!  WebSocket: ${Math.round(client.ws.ping)}ms  |  الرد: ${Date.now() - t}ms`).catch(() => {});
  },
  async semoji(msg, mod, a) {
    const text = a.join(' ');
    const em = /<(a?):(\w+):(\d+)>/.exec(text);
    let url;
    if (em) url = `${CDN}/emojis/${em[3]}.${em[1] ? 'gif' : 'png'}?size=256`;
    else {
      const cp = [...text.trim()].map((c) => c.codePointAt(0).toString(16)).filter((x) => x !== 'fe0f' && x !== '200d' || false);
      need(cp.length && /\p{Extended_Pictographic}/u.test(text), 'الاستخدام: semoji! <ايموجي>');
      url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp.slice(0, 4).join('-')}.png`;
    }
    card(msg, EMB().setImage(url));
  },
  async user(msg, mod, a) {
    const u = (await targetUser(msg, a)) || msg.author;
    const m = await msg.guild.members.fetch(u.id).catch(() => null);
    card(msg, EMB().setAuthor({ name: u.globalName || u.username, iconURL: u.displayAvatarURL() }).setThumbnail(u.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'المعرّف', value: u.id, inline: true },
        { name: 'إنشاء الحساب', value: ts(u.createdTimestamp, 'F') + '\n' + ts(u.createdTimestamp, 'R'), inline: true },
        { name: 'الانضمام للسيرفر', value: m && m.joinedTimestamp ? ts(m.joinedTimestamp, 'F') + '\n' + ts(m.joinedTimestamp, 'R') : 'مو بالسيرفر', inline: true }));
  },
  // point! [@عضو]   |   point! add/remove/reset @عضو [العدد]  (للإداريين)
  async point(msg, mod, a) {
    const sub = String(a[0] || '').toLowerCase();
    if (['add', 'remove', 'reset'].includes(sub)) {
      need(mod.permissions.has(PermissionFlagsBits.ManageGuild), 'تعديل النقاط يحتاج صلاحية Manage Server.');
      const m = await targetMember(msg, a.slice(1));
      need(m, 'الاستخدام: point! add @عضو 50   |   point! remove @عضو 50   |   point! reset @عضو');
      const rec = M(G(msg.guildId), m.id);
      if (sub === 'reset') rec.b = 0;
      else {
        const n = parseInt(a.find((x, i) => i > 0 && /^\d+$/.test(x)), 10);
        need(n >= 1 && n <= 1e7, 'اكتب عدد صحيح للنقاط.');
        rec.b = Math.max(0, (rec.b || 0) + (sub === 'add' ? n : -n));
      }
      dirty = true; rankCache.t = 0;
      return say(msg, `✅ نقاط ${m.displayName} الإضافية: ${NF(rec.b)}`);
    }
    const m = (await targetMember(msg, a)) || mod;
    const r = (db.guilds[msg.guildId] || { members: {} }).members[m.id] || {};
    const total = (r.w || 0) + (r.v || 0) + (r.b || 0);
    card(msg, EMB().setAuthor({ name: m.displayName, iconURL: m.displayAvatarURL() })
      .setDescription(`**النقاط الكلية: ${NF(total)}**\nرسائل: ${NF(r.w)} • صوت: ${NF(r.v)} • إضافية: ${NF(r.b)}`));
  },
  async statistics(msg) {
    const g = db.guilds[msg.guildId] || { hours: {} };
    const sum = (n) => { const o = { m: 0, v: 0, j: 0, l: 0 }; for (const hk of hoursBack(n)) { const h = g.hours[hk]; if (h) { o.m += h.m; o.v += h.v; o.j += h.j; o.l += h.l; } } return o; };
    const row = (o) => `💬 ${NF(o.m)} رسالة\n🎙️ ${fmtMinS(o.v)} صوت\n📥 ${NF(o.j)} / 📤 ${NF(o.l)}`;
    card(msg, EMB().setTitle(`📊 إحصائيات ${msg.guild.name}`)
      .addFields({ name: 'آخر 24 ساعة', value: row(sum(24)), inline: true }, { name: 'آخر 7 أيام', value: row(sum(168)), inline: true }, { name: 'آخر 30 يوم', value: row(sum(720)), inline: true })
      .setFooter({ text: `الأعضاء: ${NF(msg.guild.memberCount)}` }));
  },
  // messages!  |  messages! #شات  |  messages! @رتبة
  async messages(msg) {
    const g = db.guilds[msg.guildId] || { members: {} };
    const ch = msg.mentions.channels.first();
    const role = msg.mentions.roles.first();
    let title = 'ترتيب الرسائل في السيرفر', rows;
    if (ch) {
      title = `ترتيب الرسائل في #${ch.name} (منذ بدء تتبع الرومات)`;
      rows = Object.entries(g.members).map(([id, m]) => [id, (m.c && m.c[ch.id]) || 0]);
    } else if (role) {
      await msg.guild.members.fetch().catch(() => {});
      title = `ترتيب رسائل رتبة ${role.name}`;
      rows = role.members.map((m) => [m.id, (g.members[m.id] || {}).w || 0]);
    } else rows = Object.entries(g.members).map(([id, m]) => [id, m.w || 0]);
    rows = rows.filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
    const total = rows.reduce((s, r) => s + r[1], 0);
    const me = rows.findIndex(([id]) => id === msg.author.id);
    card(msg, EMB().setTitle(title)
      .setDescription(rows.length ? rows.slice(0, 10).map(([id, n], i) => `**${i + 1}.** <@${id}> — ${NF(n)}`).join('\n') : 'لا توجد بيانات.')
      .setFooter({ text: `المجموع: ${NF(total)}` + (me >= 0 ? ` • ترتيبك: ${me + 1}` : '') }));
  },

  // ===================== رولات =====================
  async role(msg, mod, a) {
    const m = await targetMember(msg, a);
    const role = roleFrom(msg, a.slice(1));
    need(m && role, 'الاستخدام: role! @عضو @رتبة   (إذا العضو عنده الرتبة بتنسحب منه)');
    need(role.id !== msg.guildId && !role.managed, 'هذي الرتبة ما بتنعطى بالأوامر.');
    need(role.editable, 'رتبة البوت لازم تكون أعلى من هذي الرتبة.');
    need(msg.guild.ownerId === mod.id || mod.roles.highest.position > role.position, 'ما بتقدر تتحكم برتبة مثل رتبتك أو أعلى.');
    if (m.roles.cache.has(role.id)) {
      await m.roles.remove(role, reasonOf(mod, ''));
      return say(msg, `➖ تم سحب رتبة «${role.name}» من <@${m.id}>.`);
    }
    const rb = arr(dbr('rblock', msg.guildId)[m.id]);
    need(!rb.includes(role.id), 'هذي الرتبة محظورة على العضو (rblock).');
    await m.roles.add(role, reasonOf(mod, ''));
    say(msg, `➕ تم إعطاء <@${m.id}> رتبة «${role.name}».`);
  },
  async removeroles(msg, mod, a) {
    const m = await targetMember(msg, a);
    need(m, 'الاستخدام: removeroles! @عضو');
    need(outranks(msg, mod, m), 'ما بتقدر تسحب رتب عضو رتبته مثل رتبتك أو أعلى.');
    const owner = msg.guild.ownerId === mod.id;
    const cant = (r) => r.managed || !r.editable || (!owner && r.position >= mod.roles.highest.position);
    const keep = m.roles.cache.filter((r) => r.id !== msg.guildId && cant(r));
    const gone = m.roles.cache.filter((r) => r.id !== msg.guildId && !cant(r)).size;
    need(gone > 0, 'ما في رتب أقدر أسحبها من هذا العضو.');
    await m.roles.set([...keep.keys()], reasonOf(mod, ''));
    say(msg, `🧹 تم سحب ${gone} رتبة من <@${m.id}>.`);
  },
  async rblock(msg, mod, a) {
    const m = await targetMember(msg, a);
    const role = roleFrom(msg, a.slice(1));
    need(m && role, 'الاستخدام: rblock! @عضو @رتبة');
    need(role.id !== msg.guildId && !role.managed, 'هذي الرتبة ما ينفع تنبلوك.');
    need(msg.guild.ownerId === mod.id || mod.roles.highest.position > role.position, 'ما بتقدر تتحكم برتبة مثل رتبتك أو أعلى.');
    const P = dbk('rblock', msg.guildId);
    P[m.id] = [...new Set([...arr(P[m.id]), role.id])].slice(0, 50);
    dirty = true;
    if (m.roles.cache.has(role.id) && role.editable) await m.roles.remove(role, reasonOf(mod, 'rblock')).catch(() => {});
    say(msg, `🚫 تم حظر رتبة «${role.name}» على <@${m.id}>.`);
  },
  async removeblock(msg, mod, a) {
    const m = await targetMember(msg, a);
    const role = roleFrom(msg, a.slice(1));
    need(m && role, 'الاستخدام: removeblock! @عضو @رتبة');
    const P = dbr('rblock', msg.guildId);
    need(arr(P[m.id]).includes(role.id), 'هذي الرتبة مو محظورة على العضو.');
    P[m.id] = P[m.id].filter((x) => x !== role.id);
    if (!P[m.id].length) delete P[m.id];
    dirty = true;
    say(msg, `✅ تم إزالة بلوك رتبة «${role.name}» عن <@${m.id}>.`);
  },

  // ===================== حماية =====================
  async advice(msg) {
    card(msg, EMB().setTitle('💡 نصيحة أمنية').setDescription(ADVICE[crypto.randomInt(ADVICE.length)]));
  },
  async bots(msg) { await botList(msg); },
  async pslist(msg) {
    const gid = msg.guildId;
    const rows = [['الحماية الذكية', smartCfg(gid).enabled], ['حماية الصور', imgCfg(gid).enabled]];
    try {
      const am = await client.rest.get(Routes.guildAutoModerationRules(gid));
      for (const r of am) rows.push([`AutoMod: ${r.name}`, r.enabled]);
    } catch (_) {}
    card(msg, EMB().setTitle('🛡️ قائمة الحماية').setDescription(chunkList(rows.map(([n, on]) => `${on ? '✅' : '❌'} ${n}`))));
  },

  // ===================== إعدادات =====================
  async setlog(msg, mod) {
    const g = msg.guild, s = S(g.id);
    need(!(s.logs && s.logs.category && g.channels.cache.has(s.logs.category)), 'قنوات اللوق موجودة مسبقاً. استخدم detlog! لحذفها أولاً.');
    const V = PermissionFlagsBits;
    const ow = [
      { id: g.id, deny: [V.ViewChannel] },
      { id: client.user.id, allow: [V.ViewChannel, V.SendMessages, V.EmbedLinks] },
    ];
    for (const r of g.roles.cache.values()) {
      if (r.id !== g.id && !r.managed && (r.permissions.has(V.Administrator) || r.permissions.has(V.ManageGuild))) ow.push({ id: r.id, allow: [V.ViewChannel] });
    }
    const cat = await g.channels.create({ name: 'OPS LOGS', type: ChannelType.GuildCategory, permissionOverwrites: ow.slice(0, 100), reason: reasonOf(mod, 'setlog') });
    const ch = {};
    for (const [key, name] of LOG_CH) {
      const c = await g.channels.create({ name, type: ChannelType.GuildText, parent: cat.id, permissionOverwrites: ow.slice(0, 100), reason: reasonOf(mod, 'setlog') });
      ch[key] = c.id;
    }
    s.logs = { category: cat.id, ch };
    dirty = true;
    say(msg, `✅ تم إنشاء قنوات اللوق (${LOG_CH.length}) داخل كاتيجوري «OPS LOGS».`);
  },
  async detlog(msg, mod) {
    const g = msg.guild, s = S(g.id);
    need(s.logs, 'ما في قنوات لوق منشأة بالبوت.');
    let n = 0;
    for (const id of [...Object.values(s.logs.ch || {}), s.logs.category]) {
      const c = g.channels.cache.get(id);
      if (c && await c.delete(reasonOf(mod, 'detlog')).then(() => 1, () => 0)) n++;
    }
    delete s.logs; dirty = true;
    // إذا الروم الحالي انحذف ما نقدر نرد فيه
    if (g.channels.cache.has(msg.channelId)) say(msg, `🗑️ تم حذف ${n} قناة/كاتيجوري من اللوق.`);
  },
  // setvoice!  (يثبت بروم صوتك)  |  setvoice! #روم_صوتي  |  setvoice! off
  async setvoice(msg, mod, a) {
    const g = msg.guild, s = S(g.id);
    if (String(a[0] || '').toLowerCase() === 'off') {
      s.voiceChannel = null; dirty = true;
      await g.shard.send({ op: 4, d: { guild_id: g.id, channel_id: null, self_mute: false, self_deaf: false } });
      return say(msg, '✅ تم إلغاء تثبيت البوت بالفويس.');
    }
    const id = a.map(idOf).find((x) => SNOW.test(x));
    const vc = id ? g.channels.cache.get(id) : mod.voice.channel;
    need(vc && vc.isVoiceBased(), 'يرجى تحديد الروم بالمنشن او بالايدي، او ادخل روم صوتي واكتب الامر.');
    s.voiceChannel = vc.id; dirty = true;
    await joinVoice(g, vc.id);
    say(msg, `✅ تم تثبيت البوت في «${vc.name}».`);
  },

  // ===================== شات =====================
   async hide(msg, mod) { await chatPerm(msg, mod, { ViewChannel: false }, 'hide'); },
  async unhide(msg, mod) { await chatPerm(msg, mod, { ViewChannel: null }, 'unhide'); },
  async lock(msg, mod) { await chatPerm(msg, mod, 'lock', 'lock'); },
  async unlock(msg, mod) { await chatPerm(msg, mod, 'unlock', 'unlock'); },
  async slowmode(msg, mod, a) {
    const ch = msg.mentions.channels.first() || msg.channel;
    need(ch.setRateLimitPerUser, 'ما أقدر أعدّل هذا الروم.');
    const txt = (n) => (n >= 3600 && n % 3600 === 0 ? `${n / 3600} ساعة` : n >= 60 && n % 60 === 0 ? `${n / 60} دقيقة` : `${n} ثانية`);
    const room = ch.id === msg.channelId ? 'في هذا الروم' : `في <#${ch.id}>`;
    const box = (t) => card(msg, new EmbedBuilder().setColor(0x2b2d31).setDescription(t));
    const arg = String(a.find((x) => !/^<#/.test(x)) || '').toLowerCase();

    // بدون رقم: عرض الحالة الحالية
    if (!arg) {
      const cur = ch.rateLimitPerUser || 0;
      return void box(`⏱️ | السلو مود ${room} ${cur ? '`' + txt(cur) + '`' : '`معطل`'}`);
    }

    let s;
    if (['off', '0', 'ايقاف', 'إيقاف'].includes(arg)) s = 0;
    else {
      const m = /^(\d+)(s|m|h)?$/.exec(arg);
      need(m, 'الاستخدام: slowmode! 10   (ثواني — أو 5m / 1h — الحد 6 ساعات)   |   slowmode! off');
      s = Number(m[1]) * ({ s: 1, m: 60, h: 3600 }[m[2] || 's']);
    }
    need(s >= 0 && s <= 21600, 'الحد الأقصى للوضع البطيء 6 ساعات.');
    await ch.setRateLimitPerUser(s, reasonOf(mod, ''));
    box(s ? `⏱️ | تم ضبط السلو مود على \`${txt(s)}\` ${room}` : `⏱️ | تم إيقاف السلو مود ${room}`);
  },
};

HANDLERS.dinfractions = async function (msg, mod, a) {
  const m = await targetMember(msg, a);
  const uid = m ? m.id : idOf(a[0]);
  need(SNOW.test(uid), 'الاستخدام: dinfractions!');
  await client.rest.post(Routes.channelMessages(msg.channelId), {
    body: { ...infBody(msg.guild, mod.id, uid, null, 1), message_reference: { message_id: msg.id, fail_if_not_exists: false } },
  });
};


installLogWrap();
HANDLERS.advice = async function (msg) {
  await card(msg, new EmbedBuilder().setColor(0xffffff)
    .setTitle('إرشادات مهمة لحماية سيرفرك')
    .setDescription('اتبع هذه التوجيهات للحفاظ على أمان مجتمعك وتجنب المشكلات الإدارية:')
    .addFields(
      { name: 'لا تمنح الصلاحيات عشوائيا', value: 'لا تقم بمنح الرتب أو الصلاحيات الإدارية إلا للأشخاص الموثوقين تماما، وتأكد من معرفتك الجيدة بهم قبل إجراء أي ترقية.' },
      { name: 'فعّل أنظمة الحماية', value: 'احرص على تفعيل جميع إعدادات الأمان المتاحة في الخادم، مثل التحقق الثنائي ومستويات التحقق الخاصة بالأعضاء.' },
      { name: 'راجع الصلاحيات بدقة', value: 'قبل حفظ أي تعديلات، تأكد من مراجعة الصلاحيات الممنوحة لتفادي منح صلاحيات غير مقصودة أو زائدة.' },
      { name: 'انتبه عند إجراء التعديلات', value: 'كن حذرا عند تعديل إعدادات الخادم أو الرتب، وأجرِ التغييرات بعناية لتجنب أي أخطاء غير مقصودة.' },
      { name: 'تابع الأعضاء الجدد', value: 'راقب نشاط الأعضاء الجدد، ولا تتردد في اتخاذ الإجراءات المناسبة عند ملاحظة أي سلوك مريب.' })
    .setFooter({ text: 'حافظ على مجتمعك آمنا' }).setTimestamp());
};

HANDLERS.bots = async function (msg, mod, a) {
  const all = await msg.guild.members.fetch();
  const bots = [...all.filter((m) => m.user.bot).values()];
  const per = 5, pages = Math.max(1, Math.ceil(bots.length / per));
  const page = Math.min(pages, Math.max(1, parseInt(a[0], 10) || 1));
  const lines = bots.slice((page - 1) * per, page * per).map((m, i) =>
    `**${(page - 1) * per + i + 1}.** <@${m.id}>\n**معرف البوت :** \`${m.id}\``);
  await card(msg, new EmbedBuilder().setColor(0xffffff).setTitle('بوتات السيرفر')
    .setThumbnail(msg.guild.iconURL({ size: 256 }))
    .setDescription(`**عدد البوتات :** \`${bots.length}\` (الصفحة ${page}/${pages})\n\n` + (lines.join('\n\n') || 'لا يوجد بوتات.')));
};
HANDLERS.setlog = async function (msg, mod, a) {
  const g = msg.guild, s = S(g.id), V = PermissionFlagsBits;
  need(!(s.logmade && g.channels.cache.has(s.logmade.category)), 'قنوات اللوق موجودة مسبقا. استخدم detlog! لحذفها وإعادة الإعدادات أولا.');
  const keys = Object.keys(LOGT).filter((k) => logCfg(g.id, k).enabled);
  need(keys.length, 'ما في لوقات مفعلة بالداشبورد. فعّل اللوقات اللي بدك ياها أول.');
  const extra = roleFrom(msg, a);   // اختياري: setlog! @رتبة  (الرتبة اللي بتشوف اللوقات)
  const ow = [
    { id: g.id, deny: [V.ViewChannel] },
    { id: client.user.id, allow: [V.ViewChannel, V.SendMessages, V.EmbedLinks] },
  ];
  for (const r of g.roles.cache.values()) {
    if (r.id !== g.id && !r.managed && (r.permissions.has(V.Administrator) || r.permissions.has(V.ManageGuild))) ow.push({ id: r.id, allow: [V.ViewChannel] });
  }
  if (extra && !ow.some((o) => o.id === extra.id)) ow.push({ id: extra.id, allow: [V.ViewChannel] });
  const wait = await card(msg, EMB().setDescription('جاري البدء في إنشاء اللوقات وإعداد النظام...'));
  const cat = await g.channels.create({ name: 'OPS LOGS', type: ChannelType.GuildCategory, permissionOverwrites: ow.slice(0, 100), reason: reasonOf(mod, 'setlog') });
  const made = { category: cat.id, items: {} };
  s.logmade = made; s.logcfg = s.logcfg || {}; dirty = true;   // نحفظ بدري عشان detlog ينظف لو وقف النص
  for (const k of keys) {
    const name = ('لوق-' + LOGT[k].title).replace(/[\s\/\\]+/g, '-').slice(0, 100);
    const c = await g.channels.create({ name, type: ChannelType.GuildText, parent: cat.id, permissionOverwrites: ow.slice(0, 100), reason: reasonOf(mod, 'setlog') });
    made.items[k] = { id: c.id, prev: rawLog(g.id, k).channel || null };
    s.logcfg[k] = { ...rawLog(g.id, k), channel: c.id };
    dirty = true;
  }
  const done = EMB().setDescription(`تم إنشاء ${keys.length} روم لوق وربطها بالإعدادات.`);
  if (wait) wait.edit({ embeds: [done] }).catch(() => {}); else say(msg, 'تم إنشاء رومات اللوق.');
};

HANDLERS.detlog = async function (msg, mod) {
  need(S(msg.guildId).logmade, 'ما في قنوات لوق منشأة بالبوت.');
  await msg.reply({
    embeds: [new EmbedBuilder().setColor(0xfbbf24).setDescription('**تأكيد حذف اللوقات واعادة ضبط الإعدادات**')],
    components: [{ type: 1, components: [
      { type: 2, style: 3, custom_id: `dl:y:${mod.id}`, label: 'تأكيد' },
      { type: 2, style: 2, custom_id: `dl:n:${mod.id}`, label: 'إلغاء' },
    ] }],
    allowedMentions: { parse: [], repliedUser: false },
  });
};

async function onDetlogInteraction(i) {
  try {
    const cid = String(i.customId || '');
    if (!i.guildId || !cid.startsWith('dl:') || !i.isButton()) return;
    const [, act, modId] = cid.split(':');
    if (i.user.id !== modId) return void (await i.reply({ content: 'هذا الزر للمشرف اللي كتب الأمر.', flags: 64 }));
    if (act === 'n') return void (await i.update({ content: 'تم الإلغاء.', embeds: [], components: [] }));
    const g = i.guild, s = S(g.id), made = s.logmade;
    if (!made) return void (await i.update({ content: 'ما في لوقات لحذفها.', embeds: [], components: [] }));
    await i.update({ content: 'جاري الحذف وإعادة الإعدادات...', embeds: [], components: [] });
    s.logcfg = s.logcfg || {};
    for (const [k, it] of Object.entries(made.items || {})) {
      const cur = { ...(s.logcfg[k] || {}) };
      if (cur.channel === it.id) cur.channel = it.prev && g.channels.cache.has(it.prev) ? it.prev : null;
      s.logcfg[k] = cur;
      const c = g.channels.cache.get(it.id);
      if (c) await c.delete('OPS: detlog').catch(() => {});
    }
    const cat = g.channels.cache.get(made.category);
    if (cat) await cat.delete('OPS: detlog').catch(() => {});
    delete s.logmade; dirty = true;
    i.editReply({ content: 'تم حذف قنوات اللوق وإعادة كل لوق للروم اللي كان عليه.' }).catch(() => {});
  } catch (e) { console.error('detlog:', e.message); }
}
// ===================== بطاقات الصور (أبيض وأسود) + الأوامر العامة الجديدة =====================
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const loadImg = async (url) => { try { return await canvasLib.loadImage(url); } catch (_) { return null; } };
function cardBase(W, H) {
  const cv = canvasLib.createCanvas(W, H), c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0a0a0a'); g.addColorStop(1, '#1c1c1f');
  c.fillStyle = g; rr(c, 0, 0, W, H, 28); c.fill();
  c.strokeStyle = '#3f3f46'; c.lineWidth = 2; rr(c, 1, 1, W - 2, H - 2, 28); c.stroke();
  return { cv, c };
}
function avatarCircle(c, img, cx, cy, R, ring = '#fff') {
  if (img) { c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip(); c.drawImage(img, cx - R, cy - R, R * 2, R * 2); c.restore(); }
  c.lineWidth = 6; c.strokeStyle = ring; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
}
const rankOf = (g, id, key) => { const v = (g.members[id] || {})[key] || 0; return Object.values(g.members).filter((o) => (o[key] || 0) > v).length + 1; };
const linkRow = (label, url) => [{ type: 1, components: [{ type: 2, style: 5, label, url }] }];
const NOPING = { parse: [], repliedUser: false };

// ---------- بطاقة المستوى (level) ----------
async function levelCard(m, rec, g) {
  const W = 900, H = 560;
  const { cv, c } = cardBase(W, H);
  const av = await loadImg(m.user.displayAvatarURL({ size: 256, extension: 'png', forceStatic: true }));
  avatarCircle(c, av, W / 2, 125, 85);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.font = 'bold 44px sans-serif';
  c.fillText(m.displayName.slice(0, 24), W / 2, 258);
  const row = (y, xp, key, label) => {
    const x = xpInfo(xp), bx = 140, bw = 620, bh = 46;
    c.fillStyle = '#27272a'; rr(c, bx, y, bw, bh, 23); c.fill();
    c.fillStyle = '#fff'; rr(c, bx, y, Math.max(bh, bw * x.cur / x.need), bh, 23); c.fill();
    c.textAlign = 'center'; c.font = 'bold 24px sans-serif'; c.lineJoin = 'round'; c.lineWidth = 5;
    c.strokeStyle = '#000'; c.strokeText(`${NF(x.cur)} / ${NF(x.need)}`, bx + bw / 2, y + bh / 2);
    c.fillStyle = '#f4f4f5'; c.fillText(`${NF(x.cur)} / ${NF(x.need)}`, bx + bw / 2, y + bh / 2);
    c.textAlign = 'left'; c.font = 'bold 26px sans-serif'; c.fillStyle = '#fff'; c.fillText('lvl.' + x.level, 28, y + bh / 2);
    c.font = '20px sans-serif'; c.fillStyle = '#a1a1aa'; c.direction = 'rtl';
    c.textAlign = 'left'; c.fillText('إجمالي النقاط: ' + NF(xp), bx, y + bh + 28);
    c.textAlign = 'right'; c.fillText(`${label} #${rankOf(g, m.id, key)}`, bx + bw, y + bh + 28);
    c.direction = 'ltr';
  };
  row(310, rec.vxp || 0, 'vxp', 'ترتيبك الصوتي:');
  row(430, rec.xp || 0, 'xp', 'ترتيبك الكتابي:');
  c.textAlign = 'center'; c.font = 'bold 18px sans-serif'; c.fillStyle = '#52525b'; c.fillText('OPS SYSTEM', W / 2, H - 26);
  return cv.toBuffer('image/png');
}
HANDLERS.level = async function (msg, mod, a) {
  need(canvasLib, 'لازم تثبّت المكتبة: npm i @napi-rs/canvas');
  const m = (await targetMember(msg, a)) || mod;
  const g = db.guilds[msg.guildId] || { members: {} };
  const png = await levelCard(m, g.members[m.id] || {}, g);
  await msg.reply({ files: [{ attachment: png, name: 'level.png' }], allowedMentions: NOPING });
};

// ---------- بطاقة البروفايل (profile) ----------
async function profileCard(m, rec) {
  const W = 900, H = 480;
  const { cv, c } = cardBase(W, H);
  let ban = null;
  try { const u = await m.user.fetch(true); const bu = u.bannerURL({ size: 600, extension: 'png', forceStatic: true }); if (bu) ban = await loadImg(bu); } catch (_) {}
  c.save(); rr(c, 0, 0, W, H, 28); c.clip();
  if (ban) {
    const s = Math.max(W / ban.width, 190 / ban.height);
    c.drawImage(ban, (W - ban.width * s) / 2, (190 - ban.height * s) / 2, ban.width * s, ban.height * s);
    c.globalCompositeOperation = 'saturation'; c.fillStyle = '#000'; c.fillRect(0, 0, W, 190); c.globalCompositeOperation = 'source-over';
  } else { c.fillStyle = '#27272a'; c.fillRect(0, 0, W, 190); }
  c.restore();
  const av = await loadImg(m.user.displayAvatarURL({ size: 256, extension: 'png', forceStatic: true }));
  c.fillStyle = '#0a0a0a'; c.beginPath(); c.arc(140, 195, 84, 0, Math.PI * 2); c.fill();
  avatarCircle(c, av, 140, 195, 75);
  c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif';
  c.fillText(m.displayName.slice(0, 22), 250, 235);
  c.font = '24px sans-serif'; c.fillStyle = '#a1a1aa'; c.fillText('@' + m.user.username, 250, 278);
  const x = xpInfo(rec.xp || 0);
  const boxes = [['الرسائل', NF(rec.w)], ['الصوت', fmtMinS(rec.v || 0)], ['المستوى', String(x.level)], ['الدعوات', NF(rec.inv)]];
  boxes.forEach(([l, v], i) => {
    const bx = 40 + i * 210;
    c.fillStyle = '#18181b'; rr(c, bx, 320, 190, 90, 18); c.fill();
    c.textAlign = 'center'; c.fillStyle = '#a1a1aa'; c.font = '20px sans-serif'; c.fillText(l, bx + 95, 345);
    c.fillStyle = '#fff'; c.font = 'bold 28px sans-serif'; c.fillText(v, bx + 95, 385);
  });
  c.textAlign = 'center'; c.fillStyle = '#71717a'; c.font = '18px sans-serif';
  c.fillText(`انضم للسيرفر: ${m.joinedAt ? m.joinedAt.toISOString().slice(0, 10) : '-'}   •   أنشأ الحساب: ${m.user.createdAt.toISOString().slice(0, 10)}`, W / 2, 445);
  return cv.toBuffer('image/png');
}
HANDLERS.profile = async function (msg, mod, a) {
  need(canvasLib, 'لازم تثبّت المكتبة: npm i @napi-rs/canvas');
  const m = (await targetMember(msg, a)) || mod;
  const rec = (db.guilds[msg.guildId] || { members: {} }).members[m.id] || {};
  await msg.reply({ files: [{ attachment: await profileCard(m, rec), name: 'profile.png' }], allowedMentions: NOPING });
};

// ---------- لوحة الإحصائيات (statistics) ----------
async function statsCard(guild, n) {
  const g = db.guilds[guild.id] || { members: {} };
  const keys = daysBack(n);
  const mem = Object.entries(g.members).map(([id, m]) => [id, sumDays(m, keys, 0), sumDays(m, keys, 1)]);
  const topW = mem.filter((x) => x[1] > 0).sort((p, q) => q[1] - p[1]).slice(0, 3);
  const topV = mem.filter((x) => x[2] > 0).sort((p, q) => q[2] - p[2]).slice(0, 3);
  const chs = {};
  for (const m of Object.values(g.members)) for (const [k, v] of Object.entries(m.c || {})) chs[k] = (chs[k] || 0) + v;
  const topC = Object.entries(chs).sort((p, q) => q[1] - p[1]).slice(0, 3);
  const topVC = Object.entries(g.vc || {}).sort((p, q) => q[1] - p[1]).slice(0, 3);
  const nm = async (id) => { const u = await client.users.fetch(id).catch(() => null); return u ? (u.globalName || u.username) : id; };
  const cn = (id) => { const ch = guild.channels.cache.get(id); return ch ? '# ' + ch.name : '# (محذوف)'; };
  const W = 1000, H = 620;
  const { cv, c } = cardBase(W, H);
  c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif';
  c.fillText('Top Statistics', 40, 45);
  const panel = (x, y, title, rows) => {
    c.textAlign = 'left'; c.fillStyle = '#d4d4d8'; c.font = 'bold 22px sans-serif'; c.fillText(title, x, y);
    rows.forEach(([name, val], i) => {
      const ry = y + 28 + i * 58;
      c.fillStyle = '#18181b'; rr(c, x, ry, 430, 46, 12); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 20px sans-serif'; c.textAlign = 'left'; c.fillText(String(i + 1), x + 14, ry + 23);
      c.font = '20px sans-serif'; c.fillText(String(name).slice(0, 22), x + 50, ry + 23);
      c.fillStyle = '#27272a'; rr(c, x + 330, ry + 7, 90, 32, 8); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'bold 18px sans-serif'; c.fillText(val, x + 375, ry + 23);
    });
  };
  const mr = await Promise.all(topW.map(async (x) => [await nm(x[0]), NF(x[1])]));
  const vr = await Promise.all(topV.map(async (x) => [await nm(x[0]), (x[2] / 60).toFixed(2) + ' h']));
  panel(40, 100, '# Messages', mr);
  panel(530, 100, '# Channels', topC.map(([id, v]) => [cn(id), NF(v)]));
  panel(40, 340, 'Voice Activity', vr);
  panel(530, 340, 'Channels Voice', topVC.map(([id, v]) => [cn(id), (v / 60).toFixed(2) + ' h']));
  c.textAlign = 'center'; c.fillStyle = '#71717a'; c.font = '16px sans-serif';
  c.fillText(`Members: last ${n} day(s)  •  Channels: all time  •  Timezone: ${TZ}`, W / 2, H - 28);
  return cv.toBuffer('image/png');
}
const statsRows = (n) => [
  { type: 1, components: [{ type: 2, style: 2, custom_id: `st:r:${n}`, label: 'تحديث البيانات', emoji: { name: '🔄' } }] },
  { type: 1, components: [{ type: 3, custom_id: `st:p:${n}`, placeholder: 'تغيير الفترة', options: [
    { label: 'آخر 24 ساعة', value: '1', default: n === 1 }, { label: 'آخر 7 أيام', value: '7', default: n === 7 }, { label: 'آخر 30 يوم', value: '30', default: n === 30 },
  ] }] },
];
HANDLERS.statistics = async function (msg) {
  need(canvasLib, 'لازم تثبّت المكتبة: npm i @napi-rs/canvas');
  const png = await statsCard(msg.guild, 7);
  await msg.reply({ files: [{ attachment: png, name: 'stats.png' }], components: statsRows(7), allowedMentions: NOPING });
};
async function onStatsInteraction(i) {
  try {
    const cid = String(i.customId || '');
    if (!i.guildId || !cid.startsWith('st:')) return;
    const n = i.isStringSelectMenu() ? Number(i.values[0]) : Number(cid.split(':')[2]);
    if (![1, 7, 30].includes(n) || !canvasLib) return;
    await i.deferUpdate();
    const png = await statsCard(i.guild, n);
    await i.editReply({ files: [{ attachment: png, name: 'stats.png' }], attachments: [], components: statsRows(n) });
  } catch (e) { console.error('stats:', e.message); }
}

// ---------- المساعدة (help) ----------
const HELP_CATS = [['general', 'الأوامر العامة'], ['admin', 'الأوامر الإدارية'], ['roles', 'أوامر الرتب'], ['chat', 'أوامر الشاتات'], ['security', 'أوامر الحماية'], ['settings', 'أوامر الإعدادات']];
HANDLERS.help = async function (msg) {
  const e = new EmbedBuilder().setColor(0xffffff).setTitle('🤖 اوامر البوت')
    .setDescription(`**يمكنك الان عرض قائمة الاوامر المناسبة لك**\n\n📚 **عدد الأوامر :** ${CMD_LIST.length}\n🔖 **البادئة :** \`!\` (بعد اسم الأمر، مثال: \`ping!\`)`)
    .setThumbnail(client.user.displayAvatarURL({ size: 256 })).setTimestamp();
  await msg.reply({
    embeds: [e], allowedMentions: NOPING,
    components: [{ type: 1, components: [{ type: 3, custom_id: `help:s:${msg.author.id}`, placeholder: 'اختر من القائمة',
      options: [...HELP_CATS.map(([k, l]) => ({ label: l, value: k })), { label: 'حذف القائمة', value: 'del', emoji: { name: '🗑️' } }] }] }],
  });
};
async function onHelpInteraction(i) {
  try {
    const cid = String(i.customId || '');
    if (!i.guildId || !cid.startsWith('help:') || !i.isStringSelectMenu()) return;
    if (i.user.id !== cid.split(':')[2]) return void (await i.reply({ content: '⚠️ هذي القائمة لصاحب الأمر.', flags: 64 }));
    const v = i.values[0];
    if (v === 'del') { await i.deferUpdate(); return void i.message.delete().catch(() => {}); }
    const list = CMD_LIST.filter((x) => x.cat === v && cmdCfg(i.guildId, x.name).enabled).map((x) => {
      const al = cmdCfg(i.guildId, x.name).aliases;
      return `\`${x.name}!\`${al.length ? ' / ' + al.map((s) => `\`${s}\``).join(' / ') : ''} — ${x.desc}`;
    });
    const title = (HELP_CATS.find((x) => x[0] === v) || [])[1] || 'الأوامر';
    await i.reply({ embeds: [new EmbedBuilder().setColor(0xffffff).setTitle(title).setDescription(chunkList(list) || 'لا توجد أوامر مفعلة بهذا القسم.')], flags: 64 });
  } catch (_) {}
}

// ---------- الأفتار والبنر ----------
HANDLERS.avatar = async function (msg, mod, a) {
  const u = (await targetUser(msg, a)) || msg.author;
  const url = u.displayAvatarURL({ size: 1024, extension: 'png' });
  await msg.reply({ embeds: [new EmbedBuilder().setColor(0xffffff).setAuthor({ name: u.globalName || u.username }).setImage(url)], components: linkRow('تحميل الأفتار', url), allowedMentions: NOPING });
};
HANDLERS.banner = async function (msg, mod, a) {
  const u = (await targetUser(msg, a)) || msg.author;
  const f = await u.fetch(true);
  const url = f.bannerURL({ size: 1024, extension: 'png' });
  need(url, 'هذا الشخص ما عنده بنر.');
  await msg.reply({ embeds: [new EmbedBuilder().setColor(0xffffff).setAuthor({ name: u.globalName || u.username }).setImage(url)], components: linkRow('تحميل البنر', url), allowedMentions: NOPING });
};

// ---------- معلومات السيرفر ----------
HANDLERS.server = async function (msg) {
  const g = msg.guild;
  await g.members.fetch().catch(() => {});
  const bots = g.members.cache.filter((m) => m.user.bot).size;
  const chs = g.channels.cache;
  const e = new EmbedBuilder().setColor(0xffffff).setTitle('💻 معلومات السيرفر')
    .setThumbnail(g.iconURL({ size: 256 }))
    .setDescription([
      `**المالك :** <@${g.ownerId}>`,
      `**تاريخ الإنشاء :** ${ts(g.createdTimestamp, 'D')}`,
      '',
      `**عدد الأعضاء :** \`${g.memberCount - bots}\``,
      `**عدد البوتات :** \`${bots}\``,
      `**عدد الرومات الكتابية :** \`${chs.filter((c) => c.type === 0).size}\``,
      `**عدد الرومات الصوتية :** \`${chs.filter((c) => c.isVoiceBased()).size}\``,
      `**عدد الرتب :** \`${g.roles.cache.size - 1}\``,
      '',
      `**عدد البوست :** \`${g.premiumSubscriptionCount || 0}\``,
    ].join('\n'))
    .setFooter({ text: `تم الطلب بواسطة ${msg.author.username}`, iconURL: msg.author.displayAvatarURL({ size: 64 }) }).setTimestamp();
  await msg.reply({ embeds: [e], allowedMentions: NOPING });
};

// ---------- معلومات المستخدم ----------
function nextAnniv(t) {
  const now = new Date(), d = new Date(t), nx = new Date(d);
  nx.setFullYear(now.getFullYear());
  if (nx <= now) nx.setFullYear(now.getFullYear() + 1);
  const days = Math.ceil((nx - now) / 864e5);
  return `بعد ${Math.floor(days / 30)} أشهر و ${days % 30} يوم`;
}
HANDLERS.user = async function (msg, mod, a) {
  const u = (await targetUser(msg, a)) || msg.author;
  const m = await msg.guild.members.fetch(u.id).catch(() => null);
  const rec = (db.guilds[msg.guildId] || { members: {} }).members[u.id] || {};
  const lines = [];
  if (m && m.joinedTimestamp) lines.push(`**تاريخ الدخول للسيرفر :** ${ts(m.joinedTimestamp, 'R')}`, `الذكرى القادمة: **${nextAnniv(m.joinedTimestamp)}**`, '');
  lines.push(`**تاريخ الدخول للديسكورد :** ${ts(u.createdTimestamp, 'R')}`, `الذكرى القادمة: **${nextAnniv(u.createdTimestamp)}**`, '', `**الدعوات :** \`${NF(rec.inv)}\``);
  await msg.reply({ embeds: [new EmbedBuilder().setColor(0xffffff).setThumbnail(u.displayAvatarURL({ size: 256 })).setDescription(lines.join('\n')).setFooter({ text: u.username })], allowedMentions: NOPING });
};

// ---------- ترتيب الرسائل ----------
HANDLERS.messages = async function (msg) {
  const g = db.guilds[msg.guildId] || { members: {} };
  const ch = msg.mentions.channels.first(), role = msg.mentions.roles.first();
  let period = 'كل الوقت', rows;
  if (ch) { period = `#${ch.name}`; rows = Object.entries(g.members).map(([id, m]) => [id, (m.c && m.c[ch.id]) || 0]); }
  else if (role) { await msg.guild.members.fetch().catch(() => {}); period = `رتبة ${role.name}`; rows = role.members.map((m) => [m.id, (g.members[m.id] || {}).w || 0]); }
  else rows = Object.entries(g.members).map(([id, m]) => [id, m.w || 0]);
  rows = rows.filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).slice(0, 10);
  const e = new EmbedBuilder().setColor(0xffffff).setTitle('قائمة متصدرين الرسائل')
    .setDescription(`**الفترة الزمنية :** \`${period}\`\n\n` + (rows.length ? rows.map(([id, n], i) => `**${i + 1}.** <@${id}> **${NF(n)}**`).join('\n') : 'لا توجد بيانات.'))
    .setFooter({ text: `بطلب من ${msg.author.username}` });
  await msg.reply({ embeds: [e], allowedMentions: NOPING });
};


// إخفاء/قفل: البوت يعطي نفسه استثناء أولاً عشان ما يفقد الوصول للروم
async function chatPerm(msg, mod, perms, kind) {
  const ch = msg.mentions.channels.first() || msg.channel;
  need(ch.permissionOverwrites, 'ما أقدر أعدّل صلاحيات هذا الروم.');
  const voice = ch.isVoiceBased && ch.isVoiceBased();
  if (perms === 'lock' || perms === 'unlock') {
    const v = perms === 'lock' ? false : null;
    perms = voice ? { Connect: v } : { SendMessages: v, SendMessagesInThreads: v };
  }
  if (kind === 'hide' || kind === 'lock') {
    await ch.permissionOverwrites.edit(client.user.id, { ViewChannel: true, SendMessages: true, ManageChannels: true }).catch(() => {});
  }
  await ch.permissionOverwrites.edit(msg.guild.roles.everyone, perms, { reason: reasonOf(mod, kind) });
  const T = {
    hide: ['🙈 تم إخفاء روم', 'عن الجميع !', 0xef4444], unhide: ['👀 تم إظهار روم', 'للجميع !', 0x22c55e],
    lock: ['🔒 تم قفل روم', 'على الجميع !', 0xef4444], unlock: ['🔓 تم فتح روم', 'للجميع !', 0x22c55e],
  }[kind];
  card(msg, new EmbedBuilder().setColor(T[2]).setDescription(`**${T[0]} <#${ch.id}> ${T[1]}**`));
}

async function onCommand(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId || !msg.content) return;
  const words = msg.content.trim().split(/\s+/);
  const name = resolveCmd(msg.guildId, words[0].toLowerCase());
  if (!name) return;
  const def = COMMANDS[name];
  const c = cmdCfg(msg.guildId, name);
  if (!c.enabled) return;
  const mod = msg.member || (await msg.guild.members.fetch(msg.author.id).catch(() => null));
  if (!mod) return;
  // القنوات
  const chIds = [msg.channelId, msg.channel && msg.channel.parentId].filter(Boolean);
  if (c.blockChannels.some((x) => chIds.includes(x))) return;
  if (c.allowChannels.length && !c.allowChannels.some((x) => chIds.includes(x))) return;
  // الرتب
  if (msg.guild.ownerId !== mod.id) {
    if (mod.roles.cache.some((r) => c.blockRoles.includes(r.id))) return;
    const ok = c.allowRoles.length
      ? mod.roles.cache.some((r) => c.allowRoles.includes(r.id)) || mod.permissions.has(PermissionFlagsBits.Administrator)
      : !def.perm || mod.permissions.has(permOf(def.perm));
    if (!ok) return;
  }
  if (['ban', 'kick', 'mute', 'vmute', 'prison', 'timeout', 'warn', 'blockpic', 'vkick'].includes(name)) {
    const args1 = words.slice(1);
    const tm = await targetMember(msg, args1);
    const raw = idOf(args1[0]);
    const tid = tm ? tm.id : (SNOW.test(raw) ? raw : null);
    if (tid) {
      if (tid === msg.author.id) return say(msg, '⚠️ ما تقدر تستخدم هذا الأمر على نفسك.');
      const tu = tm ? tm.user : client.users.cache.get(tid);
      if ((tu && tu.bot) || tid === client.user.id) return say(msg, '⚠️ ما تقدر تستخدم هذا الأمر على البوتات.');
    }
  }
  if (!has(HANDLERS, name)) return say(msg, '🚧 هذا الأمر قيد التجهيز.');
  try {
    await HANDLERS[name](msg, mod, words.slice(1));
        cmdLimitCheck(msg, mod, name).catch(() => {});
  } catch (e) {
    if (e.usage && /الاستخدام/.test(e.message) && has(CMD_USAGE, name)) return usageCard(msg, name);
    say(msg, e.usage ? e.message : 'تعذر التنفيذ: ' + discordMsg(e));
  }
}

// ---------- حارس الرسائل: ميوت كتابي + بلوك صور ----------
const IMG_URL = /\.(png|jpe?g|gif|webp)(\?|$)|tenor\.com|giphy\.com/i;
function onGuard(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId) return;
  if (isMuted(msg.guildId, msg.author.id)) return void msg.delete().catch(() => {});
  if (dbr('picblock', msg.guildId)[msg.author.id]) {
    const hasImg = msg.attachments.some((x) => /^(image|video)\//.test(x.contentType || '')) || msg.stickers.size > 0 || IMG_URL.test(msg.content || '');
    if (hasImg) msg.delete().catch(() => {});
  }
}

// ---------- حماية الصور ----------
const IMG_DIR = path.resolve(DATA_DIR, 'ops-images');
const imgItems = () => (db.imglib = db.imglib || { items: [] }).items;
const IMG_ACTIONS = ['delete', 'timeout', 'kick', 'ban'];
const IMG_EXT = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };
function imgCfg(gid) {
  const s = S(gid).imgprot || {};
  return {
    enabled: !!s.enabled,
    action: IMG_ACTIONS.includes(s.action) ? s.action : 'delete',
    roles: arr(s.roles), channels: arr(s.channels), disabled: arr(s.disabled),
  };
}

app.use('/api/guild/:id/imgprot', auth, (req, res, next) => {
  if (req.method !== 'GET' && !isPremium(req.params.id)) return res.status(403).json({ error: 'premium_required' });
  next();
});
app.get('/api/guild/:id/imgprot', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const c = imgCfg(info.id);
  res.json({
    enabled: c.enabled, action: c.action, roles: c.roles, channels: c.channels, guildPremium: info.premium,
    canManage: info.canManage,
    isBotOwner: OWNER_IDS.includes(req.session.user.id),
    roleList: roleList(info.id), channelList: textChannels(info.id),
    items: imgItems().slice().sort((a, b) => b.added - a.added).map((i) => ({
      id: i.id, name: i.name, nsfw: !!i.nsfw, added: i.added, enabled: !c.disabled.includes(i.id),
    })),
  });
}));

app.put('/api/guild/:id/imgprot', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  const b = req.body || {};
  const cur = imgCfg(info.id);
  if ('enabled' in b) cur.enabled = b.enabled === true;
  if ('action' in b) {
    if (!IMG_ACTIONS.includes(b.action)) return res.status(400).json({ error: 'bad_value' });
    cur.action = b.action;
  }
  for (const [k, ok] of [['roles', (x) => cg.roles.cache.has(x)], ['channels', (x) => cg.channels.cache.has(x)]]) {
    if (!(k in b)) continue;
    if (!Array.isArray(b[k]) || !b[k].every((x) => typeof x === 'string' && SNOW.test(x) && ok(x))) return res.status(400).json({ error: 'bad_value' });
    cur[k] = [...new Set(b[k])].slice(0, 100);
  }
  S(info.id).imgprot = cur;
  dirty = true;
  res.json({ ok: true });
}));

app.post('/api/guild/:id/imgprot/toggle', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const b = req.body || {};
  const want = b.enabled === true;
  const cur = imgCfg(info.id);
  if (b.all === true) {
    cur.disabled = want ? [] : imgItems().map((i) => i.id);
  } else {
    const id = String(b.id || '');
    if (!imgItems().some((i) => i.id === id)) return res.status(404).json({ error: 'not_found' });
    cur.disabled = cur.disabled.filter((x) => x !== id);
    if (!want) cur.disabled.push(id);
  }
  S(info.id).imgprot = cur;
  dirty = true;
  res.json({ ok: true });
}));

app.get('/api/imglib/:id/file', auth, (req, res) => {
  const it = imgItems().find((i) => i.id === req.params.id);
  if (!it) return res.status(404).end();
  res.set({ 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.type(it.ext);
  res.sendFile(path.join(IMG_DIR, it.id + '.' + it.ext));
});

// إضافة / حذف صور من المكتبة العامة (لمالكي البوت فقط — OWNER_IDS)
app.post('/api/imglib', auth, (req, res) => {
  if (!OWNER_IDS.includes(req.session.user.id)) return res.status(403).json({ error: 'forbidden' });
  const b = req.body || {};
  if (b.image == null) return res.status(400).json({ error: 'bad_image' });
  const ok = imgCheck(b.image, 8);
  if (ok !== true) return res.status(400).json({ error: ok });
  const m = /^data:image\/(png|jpeg|gif|webp);base64,(.+)$/.exec(b.image);
  const buf = Buffer.from(m[2], 'base64');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (imgItems().some((i) => i.hash === hash)) return res.status(400).json({ error: 'duplicate' });
  const id = crypto.randomBytes(6).toString('hex');
  const ex = IMG_EXT[m[1]];
  try {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMG_DIR, id + '.' + ex), buf);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'server_error' }); }
  imgItems().push({
    id, hash, size: buf.length, ext: ex, nsfw: b.nsfw === true, added: Date.now(), by: req.session.user.id,
    name: String(b.name || '').trim().slice(0, 60) || 'صورة احتيالية ' + (100000 + crypto.randomInt(900000)),
  });
  dirty = true;
  res.json({ ok: true, id });
});

app.delete('/api/imglib/:id', auth, (req, res) => {
  if (!OWNER_IDS.includes(req.session.user.id)) return res.status(403).json({ error: 'forbidden' });
  const items = imgItems();
  const i = items.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  const [it] = items.splice(i, 1);
  try { fs.unlinkSync(path.join(IMG_DIR, it.id + '.' + it.ext)); } catch (_) {}
  dirty = true;
  res.json({ ok: true });
});

// ---------- محرك فحص الصور ----------
async function imgPunish(msg, cfg, item) {
  await msg.delete().catch(() => {});
  const mem = msg.member;
  const reason = 'OPS: صورة احتيالية ' + item.name;
  try {
    if (cfg.action === 'timeout' && mem && mem.moderatable) await mem.timeout(36e5, reason);
    else if (cfg.action === 'kick' && mem && mem.kickable) await mem.kick(reason);
    else if (cfg.action === 'ban' && mem && mem.bannable) await msg.guild.members.ban(msg.author.id, { reason, deleteMessageSeconds: 3600 });
  } catch (_) {}
  logInf(msg.guildId, msg.author.id, 'image', client.user.id, item.name);
  const n = await msg.channel.send({ content: `🛡️ ${msg.author}، تم حذف صورة احتيالية.`, allowedMentions: { users: [msg.author.id] } }).catch(() => null);
  if (n) setTimeout(() => n.delete().catch(() => {}), 5000);
}

async function onImageScan(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId || !msg.attachments.size) return;
  const cfg = imgCfg(msg.guildId);
  if (!cfg.enabled) return;
  if (!isPremium(msg.guildId)) return;
  const lib = imgItems().filter((i) => !cfg.disabled.includes(i.id));
  if (!lib.length) return;
  const chIds = [msg.channelId, msg.channel && msg.channel.parentId].filter(Boolean);
  if (cfg.channels.some((x) => chIds.includes(x))) return;
  if (msg.member && msg.member.roles.cache.some((r) => cfg.roles.includes(r.id))) return;
  const sizes = new Set(lib.map((i) => i.size));
  for (const a of msg.attachments.values()) {
    // نحمّل فقط الصور اللي حجمها مطابق لحجم صورة بالمكتبة
    if (!a.contentType || !a.contentType.startsWith('image/') || !sizes.has(a.size)) continue;
    try {
      const r = await fetch(a.url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const h = crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
      const hit = lib.find((i) => i.hash === h);
      if (hit) return imgPunish(msg, cfg, hit);
    } catch (_) {}
  }
}
// ===================== الرتب التلقائية =====================
const arolesCfg = (gid) => {
  const s = (db.settings[gid] || {}).autoroles || {};
  const ids = (v) => arr(v).map(String).filter((x) => SNOW.test(x));
  return { enabled: !!s.enabled, users: ids(s.users), bots: ids(s.bots) };
};

app.get('/api/guild/:id/autoroles', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), roles: roleList(info.id), cfg: arolesCfg(info.id) });
}));

app.put('/api/guild/:id/autoroles', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  const b = (req.body || {}).cfg || {};
  const cur = arolesCfg(info.id);
  if ('enabled' in b) cur.enabled = b.enabled === true;
  for (const k of ['users', 'bots']) {
    if (!(k in b)) continue;
    if (!Array.isArray(b[k]) || b[k].length > 25) return res.status(400).json({ error: 'bad_value' });
    const ids = [...new Set(b[k].map(String))];
    for (const id of ids) {
      const role = SNOW.test(id) && cg.roles.cache.get(id);
      if (!role || role.id === cg.id || role.managed) return res.status(400).json({ error: 'bad_value' });
      if (DANGER_PERMS.some((p) => role.permissions.has(PermissionFlagsBits[p]))) return res.status(400).json({ error: 'role_dangerous' });
    }
    cur[k] = ids;
  }
  S(info.id).autoroles = cur;
  dirty = true;
  res.json({ ok: true });
}));

async function grantAutoRoles(m) {
  const c = arolesCfg(m.guild.id);
  if (!c.enabled) return;
  const ids = (m.user.bot ? c.bots : c.users).filter((id) => {
    const r = m.guild.roles.cache.get(id);
        { const pr = dbr('prison', m.guild.id)[m.id], prr = (db.settings[m.guild.id] || {}).prisonRole; if (pr && prr) m.roles.add(prr, 'OPS: prison (rejoin)').catch(() => {}); }
    return r && r.editable && !r.managed;
  });
  if (ids.length) await m.roles.add(ids, 'OPS: auto roles');
}
// ===================== الرتب القابلة للأخذ =====================
const rpLimits = (gid) => { const p = isPremium(gid); return { ...embLimits(gid), panels: p ? 50 : 3, roles: p ? 25 : 10 }; };
const rpList = (gid) => arr((db.settings[gid] || {}).rpanels).filter((p) => p && p.id);
const rpEmojiKey = (e) => { const m = /^<a?:\w{1,32}:(\d{15,25})>$/.exec(String(e)); return m ? m[1] : String(e).replace(/\uFE0F/g, ''); };
const rpEmojiIdent = (e) => { const m = /^<a?:(\w{1,32}):(\d{15,25})>$/.exec(String(e)); return m ? `${m[1]}:${m[2]}` : String(e); };
const rpDanger = (role) => DANGER_PERMS.some((p) => role.permissions.has(PermissionFlagsBits[p]));

function rpClean(b, gid, id) {
  if (!b || typeof b !== 'object') throw codeErr('bad_value');
  const doc = embClean({ ...b, kind: 'none', actions: [] }, gid, id);
  const L = rpLimits(gid);
  const type = ['button', 'select', 'reaction'].includes(b.type) ? b.type : 'button';
  if (b.roles !== undefined && !Array.isArray(b.roles)) throw codeErr('bad_value');
  const input = b.roles || [];
  if (input.length > Math.min(L.roles, type === 'reaction' ? 20 : 25)) throw codeErr('limit_reached');
  const cg = client && client.guilds.cache.get(gid);
  const seen = new Set(), seenE = new Set();
  const roles = input.map((x) => {
    x = x || {};
    const label = String(x.label == null ? '' : x.label).trim();
    const emoji = String(x.emoji == null ? '' : x.emoji).trim();
    if (label.length > (type === 'select' ? 100 : 80) || emoji.length > 64) throw codeErr('bad_text');
    const role = cg && SNOW.test(String(x.roleId)) && cg.roles.cache.get(String(x.roleId));
    if (!role || role.id === gid || role.managed) throw codeErr('bad_role');
    if (rpDanger(role)) throw codeErr('role_dangerous');
    if (seen.has(role.id)) throw codeErr('dup_role');
    seen.add(role.id);
    if (emoji && !/^<a?:\w{1,32}:\d{15,25}>$/.test(emoji) && !EMOJI_RE.test(emoji)) throw codeErr('bad_emoji');
    if (type === 'reaction') {
      if (!emoji) throw codeErr('bad_emoji');
      const k = rpEmojiKey(emoji);
      if (seenE.has(k)) throw codeErr('bad_emoji');
      seenE.add(k);
    } else if (!label && (!emoji || type === 'select')) throw codeErr('bad_label');
    return { label, emoji, style: has(EMB_STYLE, x.style) ? x.style : 'primary', roleId: role.id };
  });
  delete doc.kind; delete doc.actions;
  Object.assign(doc, { type, roles });
  const m = embMeasure({ ...doc, kind: type === 'reaction' ? 'none' : type, actions: roles });
  if (m.chars > L.chars || (doc.mode === 'v2' && m.chars > 4000)) throw codeErr('embed_chars');
  if (m.bytes > L.bytes) throw codeErr('embed_bytes');
  return doc;
}

// نبني الرسالة بنفس محرك الإيمبد، بس نغيّر بادئة الـ custom_id عشان ما تتداخل مع الإيمبد
function rpBody(p) {
  const doc = { ...p, kind: p.type === 'reaction' ? 'none' : p.type, actions: p.roles.map((x) => ({ label: x.label, emoji: x.emoji, style: x.style, reply: '', roleId: x.roleId })) };
  const body = embBody(doc);
  return JSON.parse(JSON.stringify(body).replace(/"custom_id":"embs:/g, '"custom_id":"rps:').replace(/"custom_id":"emb:/g, '"custom_id":"rp:'));
}

app.get('/api/guild/:id/rolepanels', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), limits: rpLimits(info.id), roles: roleList(info.id), channels: textChannels(info.id), panels: rpList(info.id) });
}));
app.post('/api/guild/:id/rolepanels', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (rpList(info.id).length >= rpLimits(info.id).panels) return res.status(400).json({ error: 'limit_reached' });
  let doc;
  try { doc = rpClean((req.body || {}).panel, info.id, newId()); } catch (e) { if (embErr(res, e)) return; throw e; }
  doc.messageId = null;
  S(info.id).rpanels = rpList(info.id).concat(doc);
  dirty = true;
  res.json({ ok: true, panel: doc });
}));
app.put('/api/guild/:id/rolepanels/:pid', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const list = rpList(info.id);
  const i = list.findIndex((p) => p.id === req.params.pid);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  let doc;
  try { doc = rpClean((req.body || {}).panel, info.id, list[i].id); } catch (e) { if (embErr(res, e)) return; throw e; }
  doc.messageId = list[i].messageId || null;
  list[i] = doc;
  S(info.id).rpanels = list;
  dirty = true;
  res.json({ ok: true, panel: doc });
}));
app.delete('/api/guild/:id/rolepanels/:pid', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  S(info.id).rpanels = rpList(info.id).filter((p) => p.id !== req.params.pid);
  dirty = true;
  res.json({ ok: true });
}));
app.post('/api/guild/:id/rolepanels/:pid/send', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const p = rpList(info.id).find((x) => x.id === req.params.pid);
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (!p.channel) return res.status(400).json({ error: 'no_channel' });
  if (!p.roles.length) return res.status(400).json({ error: 'no_roles' });
  const cg = client.guilds.cache.get(info.id);
  if (!cg || !cg.channels.cache.get(p.channel)) return res.status(400).json({ error: 'bad_channel' });
  let body;
  try { body = rpBody(p); } catch (e) { if (embErr(res, e)) return; throw e; }
  let m;
  try { m = await client.rest.post(Routes.channelMessages(p.channel), { body }); }
  catch (e) { return res.status(400).json({ error: 'discord_error', detail: discordMsg(e) }); }
  let failed = 0;
  if (p.type === 'reaction') {
    for (const x of p.roles) {
      try { await client.rest.put(Routes.channelMessageOwnUserReaction(p.channel, m.id, encodeURIComponent(rpEmojiIdent(x.emoji)))); }
      catch (_) { failed++; }
    }
  }
  p.messageId = m.id;
  dirty = true;
  res.json({ ok: true, failed, url: `https://discord.com/channels/${info.id}/${p.channel}/${m.id}` });
}));

// ---- التنفيذ: إعطاء/سحب الرتبة ----
async function rpToggle(guild, uid, roleId, mode) {
  const role = guild.roles.cache.get(roleId);
  const mem = await guild.members.fetch(uid).catch(() => null);
  if (!role || !mem || !role.editable || role.managed || rpDanger(role)) return '⚠️ ما أقدر أعدّل هذه الرتبة.';
  const has2 = mem.roles.cache.has(role.id);
  const add = mode === 'add' ? true : mode === 'remove' ? false : !has2;
  try {
    if (add) {
      if (arr(dbr('rblock', guild.id)[uid]).includes(role.id)) return '🚫 هذي الرتبة محظورة عليك.';
      if (!has2) await mem.roles.add(role.id, 'OPS: role panel');
      return `➕ تم إعطاؤك رتبة **${role.name}**`;
    }
    if (has2) await mem.roles.remove(role.id, 'OPS: role panel');
    return `➖ تم سحب رتبة **${role.name}**`;
  } catch (e) { return '⚠️ تعذر التعديل: ' + discordMsg(e); }
}

async function onRolePanelInteraction(i) {
  try {
    const cid = String(i.customId || '');
    const isBtn = i.isButton && i.isButton(), isSel = i.isStringSelectMenu && i.isStringSelectMenu();
    if (!i.guildId || !(isBtn || isSel) || !(cid.startsWith('rp:') || cid.startsWith('rps:'))) return;
    const parts = cid.split(':');
    const p = rpList(i.guildId).find((x) => x.id === parts[1]);
    const a = p && p.roles[Number(isSel ? i.values[0] : parts[2])];
    if (!a) return void (await i.reply({ content: 'هذا الخيار لم يعد متاحاً.', flags: 64 }));
    const text = await rpToggle(i.guild, i.user.id, a.roleId, 'toggle');
    await i.reply({ content: text, flags: 64, allowedMentions: { parse: [] } });
  } catch (_) {}
}

function rpReaction(add) {
  return async (rx, u) => {
    try {
      if (u.bot) return;
      if (rx.partial) await rx.fetch().catch(() => null);
      const m = rx.message;
      const gid = m && (m.guildId || (m.guild && m.guild.id));
      if (!gid) return;
      const p = rpList(gid).find((x) => x.type === 'reaction' && x.messageId === m.id);
      if (!p) return;
      const key = String(rx.emoji.id || rx.emoji.name || '').replace(/\uFE0F/g, '');
      const a = p.roles.find((x) => rpEmojiKey(x.emoji) === key);
      const guild = client.guilds.cache.get(gid);
      if (a && guild) await rpToggle(guild, u.id, a.roleId, add ? 'add' : 'remove');
    } catch (_) {}
  };
}
// ===================== نظام المستويات =====================
const LVL_DEF_MSG = '[user]، مبروك! وصلت إلى المستوى [level] 🎉';
const lvlCfg = (gid) => {
  const s = (db.settings[gid] || {}).levels || {};
  const rewards = arr(s.rewards).filter((r) => r && SNOW.test(String(r.roleId))).map((r) => ({
    roleId: String(r.roleId),
    text: Math.min(1000, Math.max(1, parseInt(r.text, 10) || 1)),
    voice: Math.min(1000, Math.max(0, parseInt(r.voice, 10) || 0)),
    dm: r.dm === true,
    removePrev: r.removePrev === true,
  }));
  return {
    enabled: !!s.enabled,
    channel: SNOW.test(String(s.channel || '')) ? String(s.channel) : null,
    message: typeof s.message === 'string' ? s.message.slice(0, 1000) : LVL_DEF_MSG,
    rewards,
  };
};

app.get('/api/guild/:id/levels', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), roles: roleList(info.id), channels: textChannels(info.id), cfg: lvlCfg(info.id) });
}));

app.put('/api/guild/:id/levels', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad_value' });
  const cur = lvlCfg(info.id);
  if ('enabled' in b) cur.enabled = b.enabled === true;
  if ('channel' in b) {
    if (b.channel === null || b.channel === '') cur.channel = null;
    else if (typeof b.channel === 'string' && textChannels(info.id).some((c) => c.id === b.channel)) cur.channel = b.channel;
    else return res.status(400).json({ error: 'bad_channel' });
  }
  if ('message' in b) {
    if (typeof b.message !== 'string' || b.message.length > 1000) return res.status(400).json({ error: 'bad_text' });
    cur.message = b.message;
  }
  if ('rewards' in b) {
    if (!Array.isArray(b.rewards) || b.rewards.length > 25) return res.status(400).json({ error: 'limit_reached' });
    const seen = new Set();
    const out = [];
    for (const x of b.rewards) {
      const role = x && SNOW.test(String(x.roleId)) && cg.roles.cache.get(String(x.roleId));
      if (!role || role.id === cg.id || role.managed) return res.status(400).json({ error: 'bad_role' });
      if (rpDanger ? rpDanger(role) : DANGER_PERMS.some((p) => role.permissions.has(PermissionFlagsBits[p]))) return res.status(400).json({ error: 'role_dangerous' });
      if (seen.has(role.id)) return res.status(400).json({ error: 'dup_role' });
      seen.add(role.id);
      const text = parseInt(x.text, 10), voice = parseInt(x.voice, 10);
      if (!(text >= 1 && text <= 1000) || !(voice >= 0 && voice <= 1000)) return res.status(400).json({ error: 'bad_value' });
      out.push({ roleId: role.id, text, voice, dm: x.dm === true, removePrev: x.removePrev === true });
    }
    cur.rewards = out;
  }
  S(info.id).levels = cur;
  dirty = true;
  res.json({ ok: true });
}));

const lvlTpl = (text, vars) => String(text || '').replace(/\[(\w+)\]/g, (x, k) => (has(vars, k) ? String(vars[k]) : x));

// يُستدعى لما العضو يرتفع مستواه (كتابي أو صوتي)
async function lvlOnUp(guild, member, kind, level) {
  const c = lvlCfg(guild.id);
  if (!c.enabled || !member || member.user.bot) return;
  const rec = M(G(guild.id), member.id);
  const tl = xpInfo(rec.xp || 0).level, vl = xpInfo(rec.vxp || 0).level;

  // رسالة التهنئة
  const ch = c.channel && guild.channels.cache.get(c.channel);
  if (ch && typeof ch.send === 'function' && c.message.trim()) {
    const out = lvlTpl(c.message, { user: `<@${member.id}>`, userName: member.displayName, level, server: guild.name, type: kind === 'voice' ? 'الصوتي' : 'الكتابي' });
    ch.send({ content: out.slice(0, 2000), allowedMentions: { users: [member.id] } }).catch(() => {});
  }

  // المكافآت
  const sc = (r) => r.text + r.voice;
  const ok = c.rewards.filter((r) => tl >= r.text && vl >= r.voice);
  const top = ok.filter((r) => r.removePrev).sort((a, b) => sc(b) - sc(a))[0];
  const grant = top ? ok.filter((r) => sc(r) >= sc(top)) : ok;
  const drop = top ? ok.filter((r) => sc(r) < sc(top)) : [];

  for (const r of grant) {
    const role = guild.roles.cache.get(r.roleId);
    if (!role || !role.editable || role.managed || member.roles.cache.has(role.id)) continue;
    if (DANGER_PERMS.some((p) => role.permissions.has(PermissionFlagsBits[p]))) continue;
    try { await member.roles.add(role.id, 'OPS: level reward'); } catch (e) { console.error('[levels] فشل إعطاء الرتبة:', e.message); continue; }
    if (r.dm) member.send(`🎉 مبروك! حصلت على رتبة **${role.name}** في سيرفر **${guild.name}**`).catch(() => {});
  }
  const rm = drop.map((r) => guild.roles.cache.get(r.roleId)).filter((role) => role && role.editable && member.roles.cache.has(role.id));
  if (rm.length) await member.roles.remove(rm.map((x) => x.id), 'OPS: level rewards (remove previous)').catch(() => {});
}
// ===================== تنظيم القنوات =====================
const CHSYNC_FILTERS = ['none', 'images', 'videos', 'media', 'text'];
const chsyncLimit = (gid) => (isPremium(gid) ? 100 : 10);
const chsyncLast = new Map(); // channelId -> آخر رسالة خط فاصل
const CHSYNC_LINE = '━'.repeat(14);

function chsyncCfg(gid) {
  const s = (db.settings[gid] || {}).chsync || {};
  const seen = new Set();
  const channels = [];
  for (const c of arr(s.channels)) {
    if (!c || !SNOW.test(String(c.id)) || seen.has(String(c.id))) continue;
    seen.add(String(c.id));
    channels.push({
      id: String(c.id),
      filter: CHSYNC_FILTERS.includes(c.filter) ? c.filter : 'none',
      line: c.line === true,
      reactions: arr(c.reactions).map(String).slice(0, 5),
    });
  }
  return { enabled: !!s.enabled, channels };
}

app.get('/api/guild/:id/chsync', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), max: chsyncLimit(info.id), channels: textChannels(info.id), cfg: chsyncCfg(info.id) });
}));

app.put('/api/guild/:id/chsync', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object' || !Array.isArray(b.channels)) return res.status(400).json({ error: 'bad_value' });
  if (b.channels.length > chsyncLimit(info.id)) return res.status(400).json({ error: 'limit_reached' });
  const chans = new Set(textChannels(info.id).map((c) => c.id));
  const seen = new Set();
  const out = [];
  for (const c of b.channels) {
    const id = String((c && c.id) || '');
    if (!chans.has(id) || seen.has(id)) return res.status(400).json({ error: 'bad_channel' });
    seen.add(id);
    if (!CHSYNC_FILTERS.includes(c.filter)) return res.status(400).json({ error: 'bad_value' });
    const rx = arr(c.reactions);
    if (rx.length > 5) return res.status(400).json({ error: 'bad_value' });
    const reactions = [];
    for (const e of rx) {
      const t = String(e).trim();
      if (!t || t.length > 64 || (!/^<a?:\w{1,32}:\d{15,25}>$/.test(t) && !EMOJI_RE.test(t))) return res.status(400).json({ error: 'bad_emoji' });
      reactions.push(t);
    }
    out.push({ id, filter: c.filter, line: c.line === true, reactions });
  }
  S(info.id).chsync = { enabled: b.enabled === true, channels: out };
  dirty = true;
  res.json({ ok: true });
}));
// ===================== الروم المؤقت =====================
const TV_DEF_NAME = 'Room {user}';
const TV_DEF_TITLE = '🎛️ لوحة التحكم بالغرفة';
const TV_DEF_DESC = 'أهلاً {user}، هذه غرفتك المؤقتة {channel}.\nاستخدم الأزرار بالأسفل للتحكم فيها.';
const tvBusy = new Set();

function tvCfg(gid) {
  const s = (db.settings[gid] || {}).tempvoice || {};
  const id = (v) => (SNOW.test(String(v || '')) ? String(v) : null);
  const ids = (v) => arr(v).map(String).filter((x) => SNOW.test(x)).slice(0, 50);
  const t = (v, d, max) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : d);
  const n = (v, d, lo, hi) => { const x = Number(v); return Number.isInteger(x) && x >= lo && x <= hi ? x : d; };
  const c = s.ctl || {}, p = s.perms || {};
  return {
    enabled: !!s.enabled,
    joinChannel: id(s.joinChannel), controlChannel: id(s.controlChannel), category: id(s.category), logChannel: id(s.logChannel),
    nameTpl: t(s.nameTpl, TV_DEF_NAME, 100),
    limit: n(s.limit, 0, 0, 99), bitrate: n(s.bitrate, 64, 8, 384),
    deleteEmpty: s.deleteEmpty === undefined ? true : !!s.deleteEmpty,
    transferOwner: s.transferOwner === undefined ? true : !!s.transferOwner,
    ctl: { title: t(c.title, TV_DEF_TITLE, 256), description: t(c.description, TV_DEF_DESC, 2000), color: COLOR_RE.test(String(c.color)) ? c.color : '#fbbf24' },
    perms: { allowRoles: ids(p.allowRoles), blockRoles: ids(p.blockRoles) },
  };
}

function chanList(gid, types) {
  const cg = client && client.guilds.cache.get(gid);
  if (!cg) return [];
  return [...cg.channels.cache.values()].filter((c) => types.includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name }));
}

// ينشئ الفئة + قناة الإنشاء + قناة التحكم لو فاضيين
async function tvEnsure(guild, cfg) {
  let cat = cfg.category && guild.channels.cache.get(cfg.category);
  if (!cat) {
    cat = await guild.channels.create({ name: 'OPS Voice', type: ChannelType.GuildCategory, reason: 'OPS: temp voice' });
    cfg.category = cat.id;
  }
  if (!(cfg.joinChannel && guild.channels.cache.has(cfg.joinChannel))) {
    const c = await guild.channels.create({ name: '➕ انضم للإنشاء', type: ChannelType.GuildVoice, parent: cat.id, reason: 'OPS: temp voice' });
    cfg.joinChannel = c.id;
  }
  if (!(cfg.controlChannel && guild.channels.cache.has(cfg.controlChannel))) {
    const c = await guild.channels.create({ name: 'room-control', type: ChannelType.GuildText, parent: cat.id, reason: 'OPS: temp voice' });
    cfg.controlChannel = c.id;
  }
}

app.get('/api/guild/:id/tempvoice', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({
    canManage: info.canManage, guildPremium: isPremium(info.id), cfg: tvCfg(info.id), roles: roleList(info.id),
    channels: textChannels(info.id),
    voiceChannels: chanList(info.id, [ChannelType.GuildVoice]),
    categories: chanList(info.id, [ChannelType.GuildCategory]),
  });
}));

app.put('/api/guild/:id/tempvoice', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad_value' });
  const cur = tvCfg(info.id);
  const pick = (key, types) => {
    const v = b[key];
    if (v === null || v === undefined || v === '') return null;
    const ch = typeof v === 'string' && cg.channels.cache.get(v);
    if (ch && types.includes(ch.type)) return ch.id;
    if (v === cur[key]) return null; // قناة انحذفت من السيرفر
    throw codeErr('bad_channel');
  };
  const roles = (v) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > 50 || !v.every((x) => typeof x === 'string' && SNOW.test(x))) throw codeErr('bad_value');
    return [...new Set(v)].filter((x) => cg.roles.cache.has(x));
  };
  let next;
  try {
    const nameTpl = String(b.nameTpl == null ? '' : b.nameTpl).trim();
    const limit = Number(b.limit), bitrate = Number(b.bitrate);
    const c = b.ctl || {}, p = b.perms || {};
    const title = String(c.title == null ? '' : c.title), desc = String(c.description == null ? '' : c.description);
    if (!nameTpl || nameTpl.length > 100 || title.length > 256 || desc.length > 2000) throw codeErr('bad_text');
    if (!Number.isInteger(limit) || limit < 0 || limit > 99 || !Number.isInteger(bitrate) || bitrate < 8 || bitrate > 384) throw codeErr('bad_value');
    if (!COLOR_RE.test(String(c.color))) throw codeErr('bad_value');
    next = {
      enabled: b.enabled === true,
      joinChannel: pick('joinChannel', [ChannelType.GuildVoice]),
      controlChannel: pick('controlChannel', [ChannelType.GuildText]),
      category: pick('category', [ChannelType.GuildCategory]),
      logChannel: isPremium(info.id) ? pick('logChannel', [ChannelType.GuildText]) : cur.logChannel,
      nameTpl, limit, bitrate,
      deleteEmpty: b.deleteEmpty === true, transferOwner: b.transferOwner === true,
      ctl: { title: title.trim() || TV_DEF_TITLE, description: desc.trim() || TV_DEF_DESC, color: c.color },
      perms: { allowRoles: roles(p.allowRoles), blockRoles: roles(p.blockRoles) },
    };
  } catch (e) { if (e.code) return res.status(400).json({ error: e.code }); throw e; }
  if (next.enabled) {
    try { await tvEnsure(cg, next); await tvSendPanel(cg, next); }
    catch (e) { return res.status(400).json({ error: 'discord_error', detail: discordMsg(e) }); }
  }
  S(info.id).tempvoice = next;
  dirty = true;
  res.json({ ok: true });
}));// يلاقي الغرفة المؤقتة للعضو: اللي هو فيها، وإلا اللي هو مالكها
function tvFind(guildId, userId, member) {
  const rooms = dbr('tvrooms', guildId);
  const vc = member.voice && member.voice.channelId;
  if (vc && rooms[vc]) return vc;
  return Object.keys(rooms).find((id) => rooms[id].owner === userId) || null;
}

// لوحة وحدة ثابتة (ما فيها أي ايدي غرفة)
function tvPanelBody(cfg) {
  const btn = (a, label, emoji, style = 2) => ({ type: 2, style, custom_id: `tv:${a}:0`, label, emoji: { name: emoji } });
  const vars = { user: 'صاحب الغرفة', userName: 'صاحب الغرفة', channel: 'غرفتك' };
  return {
    allowed_mentions: { parse: [] },
    embeds: [{ title: cfg.ctl.title, description: tpl(cfg.ctl.description, vars).slice(0, 4000), color: parseInt(cfg.ctl.color.slice(1), 16) }],
    components: [
      { type: 1, components: [btn('lock', 'قفل / فتح', '🔒'), btn('hide', 'إخفاء / إظهار', '👁️'), btn('rename', 'الاسم', '✏️'), btn('limit', 'الحد', '👥'), btn('kick', 'طرد', '👢')] },
      { type: 1, components: [btn('permit', 'سماح', '✅'), btn('transfer', 'نقل الملكية', '🔁'), btn('claim', 'استلام', '👑'), btn('delete', 'حذف', '🗑️', 4)] },
    ],
  };
}

// يرسل اللوحة مرة وحدة، ولو موجودة يحدّثها
async function tvSendPanel(guild, cfg) {
  const s = S(guild.id);
  const cc = cfg.controlChannel && guild.channels.cache.get(cfg.controlChannel);
  if (!cc) return;
  const old = s.tvpanel;
  if (old && old.ch === cc.id && old.msg) {
    try { await client.rest.patch(Routes.channelMessage(cc.id, old.msg), { body: tvPanelBody(cfg) }); return; } catch (_) {}
  }
  if (old && old.msg) client.rest.delete(Routes.channelMessage(old.ch, old.msg)).catch(() => {});
  try {
    const m = await client.rest.post(Routes.channelMessages(cc.id), { body: tvPanelBody(cfg) });
    s.tvpanel = { ch: cc.id, msg: m.id };
    dirty = true;
  } catch (e) { console.error('[tempvoice] panel:', e.message); }
}
function tvAllowed(cfg, member) {
  const r = member.roles.cache;
  if (cfg.perms.blockRoles.some((x) => r.has(x))) return false;
  if (cfg.perms.allowRoles.length && !cfg.perms.allowRoles.some((x) => r.has(x))) return false;
  return true;
}

function tvControlBody(cfg, ch, ownerId, member) {
  const vars = { user: `<@${ownerId}>`, userName: member.displayName, channel: `<#${ch.id}>` };
  const btn = (a, label, emoji, style = 2) => ({ type: 2, style, custom_id: `tv:${a}:${ch.id}`, label, emoji: { name: emoji } });
  return {
    content: `<@${ownerId}>`,
    allowed_mentions: { users: [ownerId] },
    embeds: [{ title: cfg.ctl.title, description: tpl(cfg.ctl.description, vars).slice(0, 4000), color: parseInt(cfg.ctl.color.slice(1), 16) }],
    components: [
      { type: 1, components: [btn('lock', 'قفل / فتح', '🔒'), btn('hide', 'إخفاء / إظهار', '👁️'), btn('rename', 'الاسم', '✏️'), btn('limit', 'الحد', '👥'), btn('kick', 'طرد', '👢')] },
      { type: 1, components: [btn('permit', 'سماح', '✅'), btn('transfer', 'نقل الملكية', '🔁'), btn('claim', 'استلام', '👑'), btn('delete', 'حذف', '🗑️', 4)] },
    ],
  };
}

async function tvCreate(guild, member, cfg) {
  const vars = { user: member.displayName, username: member.user.username, userid: member.id, server: guild.name };
  const name = (tpl(cfg.nameTpl, vars).trim() || 'Room').slice(0, 100);
  const jc = guild.channels.cache.get(cfg.joinChannel);
  const parent = cfg.category && guild.channels.cache.has(cfg.category) ? cfg.category : (jc ? jc.parentId : null);
  const bitrate = Math.max(8000, Math.min(cfg.bitrate * 1000, guild.maximumBitrate || 96000));
  const ch = await guild.channels.create({ name, type: ChannelType.GuildVoice, parent, userLimit: cfg.limit, bitrate, reason: 'OPS: temp voice' });
  const moved = await member.voice.setChannel(ch).then(() => true, () => false);
  if (!moved) { await ch.delete().catch(() => {}); return; }
  const room = { owner: member.id, msg: null, mch: null, at: Date.now() };
  dbk('tvrooms', guild.id)[ch.id] = room;
  dirty = true;

}

async function tvArchive(guild, ch, room) {
  const cfg = tvCfg(guild.id);
  const lc = cfg.logChannel && guild.channels.cache.get(cfg.logChannel);
  if (!lc || typeof lc.send !== 'function' || !isPremium(guild.id) || !room || !ch.messages) return;
  const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs || !msgs.size) return;
  const text = [...msgs.values()].reverse()
    .map((m) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || '(مرفق/إيمبد)'}`).join('\n');
  await lc.send({
    content: `📜 سجل محادثة الغرفة **${cut(ch.name, 80)}** — المالك <@${room.owner}>`,
    files: [{ attachment: Buffer.from(text, 'utf8'), name: 'chat-log.txt' }],
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

async function tvDelete(guild, chId) {
  const rooms = dbk('tvrooms', guild.id);
  const room = rooms[chId];
  const ch = guild.channels.cache.get(chId);
  delete rooms[chId];
  dirty = true;
  if (room && room.msg && room.mch) client.rest.delete(Routes.channelMessage(room.mch, room.msg)).catch(() => {});
  if (ch) {
    try { await tvArchive(guild, ch, room); } catch (_) {}
    await ch.delete('OPS: temp voice').catch(() => {});
  }
}

async function onTempVoice(o, n) {
  try {
    const guild = n.guild;
    const member = n.member || o.member;
    if (!member || member.user.bot) return;
    const cfg = tvCfg(guild.id);
    const rooms = dbr('tvrooms', guild.id);
    // خروج / تنقل من غرفة مؤقتة
    if (o.channelId && o.channelId !== n.channelId && rooms[o.channelId]) {
      const room = rooms[o.channelId];
      const ch = guild.channels.cache.get(o.channelId);
      if (!ch) { delete rooms[o.channelId]; dirty = true; }
      else {
        const humans = ch.members.filter((m) => !m.user.bot);
        if (!humans.size) { if (cfg.deleteEmpty) await tvDelete(guild, ch.id); }
        else if (room.owner === member.id && cfg.transferOwner) { room.owner = humans.first().id; dirty = true; }
      }
    }
    // دخول قناة "انضم للإنشاء"
    if (cfg.enabled && n.channelId && n.channelId === cfg.joinChannel && o.channelId !== n.channelId) {
      if (!tvAllowed(cfg, member)) { member.voice.disconnect().catch(() => {}); return; }
      if (tvBusy.has(member.id)) return;
      tvBusy.add(member.id);
      try { await tvCreate(guild, member, cfg); } finally { tvBusy.delete(member.id); }
    }
  } catch (e) { console.error('tempvoice error:', e.message); }
}

// تنظيف عند تشغيل البوت: يحذف الغرف الفاضية ويمسح سجلات الغرف المحذوفة
async function tvSweep() {
  for (const guild of client.guilds.cache.values()) {
    const rooms = db.tvrooms && db.tvrooms[guild.id];
    if (!rooms) continue;
    for (const id of Object.keys(rooms)) {
      const ch = guild.channels.cache.get(id);
      if (!ch) { delete rooms[id]; dirty = true; }
      else if (!ch.members.filter((m) => !m.user.bot).size && tvCfg(guild.id).deleteEmpty) await tvDelete(guild, id);
    }
  }
}

async function onTempVoiceInteraction(i) {
  try {
    const parts = String(i.customId || '').split(':');
    if (!i.guildId || !['tv', 'tvm', 'tvu'].includes(parts[0])) return;
    const isBtn = i.isButton(), isModal = i.isModalSubmit(), isSel = i.isUserSelectMenu();
    if (!(isBtn || isModal || isSel)) return;
    const act = parts[1];
    let chId = parts[2];
    const say2 = (t) => (i.deferred || i.replied
      ? i.editReply({ content: t, allowedMentions: { parse: [] } })
      : i.reply({ content: t, flags: 64, allowedMentions: { parse: [] } }));
    const member = await i.guild.members.fetch(i.user.id);
    if (chId === '0') chId = tvFind(i.guildId, i.user.id, member); // أزرار اللوحة الموحدة
    const room = chId && dbr('tvrooms', i.guildId)[chId];
    const ch = chId && i.guild.channels.cache.get(chId);
    if (!room || !ch) return void (await say2('⚠️ لازم تكون داخل غرفة مؤقتة أو تكون مالك غرفة.'));
    const isOwner = room.owner === i.user.id;

    if (act === 'claim') {
      if (isOwner) return void (await say2('أنت مالك الغرفة أصلاً.'));
      if (!ch.members.has(i.user.id)) return void (await say2('لازم تكون داخل الغرفة.'));
      if (ch.members.has(room.owner)) return void (await say2('المالك ما زال داخل الغرفة.'));
      room.owner = i.user.id; dirty = true;
      return void (await say2('👑 صرت مالك الغرفة.'));
    }
    if (!isOwner && !member.permissions.has(PermissionFlagsBits.ManageChannels)) return void (await say2('هذا الزر لمالك الغرفة فقط.'));

    // أزرار تفتح مودال
    if (isBtn && (act === 'rename' || act === 'limit')) {
      const input = new TextInputBuilder().setCustomId('v').setStyle(TextInputStyle.Short).setRequired(true)
        .setLabel(act === 'rename' ? 'الاسم الجديد' : 'العدد (0 = بلا حد)').setMaxLength(act === 'rename' ? 100 : 2);
      const modal = new ModalBuilder().setCustomId(`tvm:${act}:${chId}`)
        .setTitle(act === 'rename' ? 'تغيير اسم الغرفة' : 'الحد الأقصى للأعضاء')
        .addComponents(new ActionRowBuilder().addComponents(input));
      return void (await i.showModal(modal));
    }
    // أزرار تفتح قائمة اختيار عضو
    if (isBtn && ['kick', 'permit', 'transfer'].includes(act)) {
      const menu = new UserSelectMenuBuilder().setCustomId(`tvu:${act}:${chId}`).setPlaceholder('اختر العضو...').setMinValues(1).setMaxValues(1);
      const txt = { kick: 'اختر العضو اللي بدك تطرده من الغرفة', permit: 'اختر العضو اللي بدك تسمح له بالدخول', transfer: 'اختر العضو (داخل الغرفة) لنقل الملكية له' }[act];
      return void (await i.reply({ content: txt, components: [new ActionRowBuilder().addComponents(menu)], flags: 64 }));
    }

    await i.deferReply({ flags: 64 });

    if (isModal) {
      const v = i.fields.getTextInputValue('v').trim();
      if (act === 'rename') {
        if (!v) return void (await say2('اكتب اسماً.'));
        await ch.setName(v.slice(0, 100), 'OPS: temp voice');
        return void (await say2('✅ تم تغيير الاسم.'));
      }
      const n = parseInt(v, 10);
      if (!(n >= 0 && n <= 99)) return void (await say2('اكتب رقم من 0 إلى 99.'));
      await ch.setUserLimit(n);
      return void (await say2(n ? `✅ الحد الأقصى صار ${n}.` : '✅ تم إلغاء الحد.'));
    }
    if (isSel) {
      const uid = i.values[0];
      if (act === 'kick') {
        const m = ch.members.get(uid);
        if (!m) return void (await say2('العضو مو داخل الغرفة.'));
        if (uid === room.owner) return void (await say2('ما تقدر تطرد المالك.'));
        await m.voice.disconnect('OPS: temp voice');
        return void (await say2('✅ تم الطرد.'));
      }
      if (act === 'permit') {
        await ch.permissionOverwrites.edit(uid, { ViewChannel: true, Connect: true });
        return void (await say2(`✅ تم السماح لـ <@${uid}> بالدخول.`));
      }
      if (act === 'transfer') {
        const m = ch.members.get(uid);
        if (!m || m.user.bot) return void (await say2('العضو لازم يكون داخل الغرفة.'));
        room.owner = uid; dirty = true;
        return void (await say2(`🔁 انتقلت الملكية إلى <@${uid}>.`));
      }
      return;
    }
    // أزرار مباشرة: قفل / إخفاء / حذف
    if (act === 'lock' || act === 'hide') {
      const perm = act === 'lock' ? 'Connect' : 'ViewChannel';
      await ch.permissionOverwrites.edit(client.user.id, { ViewChannel: true, Connect: true, ManageChannels: true }).catch(() => {});
      await ch.permissionOverwrites.edit(room.owner, { ViewChannel: true, Connect: true }).catch(() => {});
      const ow = ch.permissionOverwrites.cache.get(i.guildId);
      const denied = !!(ow && ow.deny.has(PermissionFlagsBits[perm]));
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { [perm]: denied ? null : false });
      return void (await say2(act === 'lock' ? (denied ? '🔓 تم فتح الغرفة.' : '🔒 تم قفل الغرفة.') : (denied ? '👁️ تم إظهار الغرفة.' : '🙈 تم إخفاء الغرفة.')));
    }
    if (act === 'delete') {
      await say2('🗑️ جاري حذف الغرفة...');
      return void (await tvDelete(i.guild, chId));
    }
  } catch (e) {
    try {
      const t = '⚠️ تعذر التنفيذ: ' + discordMsg(e);
      if (i.deferred || i.replied) await i.editReply({ content: t }); else await i.reply({ content: t, flags: 64 });
    } catch (_) {}
  }
}
// ===================== نظام الفضفضة =====================
function ventCfg(gid) {
  const s = (db.settings[gid] || {}).vent || {};
  return {
    channels: [...new Set(arr(s.channels).map(String).filter((x) => SNOW.test(x)))].slice(0, 25),
    color: COLOR_RE.test(String(s.color)) ? s.color : '#0099ff',
  };
}

app.get('/api/guild/:id/vent', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  const me = cg.members.me || client.user;
  res.json({
    canManage: info.canManage, guildName: cg.name, channels: textChannels(info.id), cfg: ventCfg(info.id),
    bot: { name: me.displayName || client.user.username, avatar: me.displayAvatarURL({ size: 128, extension: 'png' }) },
  });
}));

app.put('/api/guild/:id/vent', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad_value' });
  if (!Array.isArray(b.channels) || b.channels.length > 25 || !b.channels.every((x) => typeof x === 'string' && SNOW.test(x))) return res.status(400).json({ error: 'bad_value' });
  if (!COLOR_RE.test(String(b.color))) return res.status(400).json({ error: 'bad_value' });
  const chans = new Set(textChannels(info.id).map((c) => c.id));
  S(info.id).vent = { channels: [...new Set(b.channels)].filter((x) => chans.has(x)), color: b.color };
  dirty = true;
  res.json({ ok: true });
}));

const ventSeen = new Set();
async function onVent(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId) return;
  if (ventSeen.has(msg.id)) return;
  ventSeen.add(msg.id);
  setTimeout(() => ventSeen.delete(msg.id), 60000);
  const cfg = ventCfg(msg.guildId);
  if (!cfg.channels.includes(msg.channelId)) return;
  const text = String(msg.content || '').trim();
  if (!text) return;
  const me = msg.guild.members.me;
  const perms = me && msg.channel.permissionsFor(me);
  if (!perms || !perms.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages])) return;
  const e = new EmbedBuilder()
    .setColor(parseInt(cfg.color.slice(1), 16))
    .setThumbnail(msg.author.displayAvatarURL({ size: 128, extension: 'png' }))
    .setDescription('```\n' + text.replace(/```/g, "'''").slice(0, 3900) + '\n```')
    .setFooter({ text: msg.guild.name })
    .setTimestamp();
  const sent = await msg.channel.send({ embeds: [e], allowedMentions: { parse: [] } }).catch(() => null);
  if (sent) msg.delete().catch(() => {});
}

// ===================== نظام التذاكر =====================
// ===================== نظام التذاكر =====================
const TK_STYLES = ['primary', 'secondary', 'success', 'danger'];
const TK_DEF = {
  enabled: false, category: null, supportRoles: [],
  logEnabled: false, logChannel: null,
  ratingEnabled: false, ratingChannel: null, autoRating: false,
  askReason: true, mode: 'button',
  panel: { title: '🎫 | قسم الدعم الفني والمساعدة', description: 'لفتح تذكرة اضغط على الزر بالأسفل.', image: '', channel: null, messageId: null },
  options: [{ id: 'a1b2c3d4', name: 'دعم فني', emoji: '🎫', style: 'primary', message: 'يرجى انتظار مسؤولين التذكرة الرد عليك', image: '', roles: [] }],
};
const jcopy = (o) => JSON.parse(JSON.stringify(o));
const tkState = (gid) => { const s = dbk('tickets', gid); s.n = s.n || 0; s.rooms = s.rooms || {}; return s; };
const tkBusy = new Set();

// ---------- الصور المرفوعة ----------
const TK_DIR = path.resolve(DATA_DIR, 'ops-tickets');
const TK_IMG_RE = /^up:([a-f0-9]{10}\.(?:png|jpg|gif|webp))$/;
function tkImgFile(ref) {
  const m = TK_IMG_RE.exec(String(ref || ''));
  if (!m) return null;
  try { return { name: m[1], data: fs.readFileSync(path.join(TK_DIR, m[1])) }; } catch (_) { return null; }
}
// الصورة المرفوعة بتنرسل كمرفق، فبتشتغل حتى على localhost
const tkImgUrl = (ref) => { const f = tkImgFile(ref); return f ? 'attachment://' + f.name : (safeUrl(ref) || ''); };
function tkPost(chId, body, ref) {
  const f = tkImgFile(ref);
  return client.rest.post(Routes.channelMessages(chId), f ? { body, files: [{ name: f.name, data: f.data }] } : { body });
}

function tkCfg(gid) {
  const s = (db.settings[gid] || {}).tickets || {};
  const d = jcopy(TK_DEF);
  return {
    ...d, ...s,
    panel: { ...d.panel, ...(s.panel || {}) },
    supportRoles: arr(s.supportRoles),
    options: Array.isArray(s.options) && s.options.length ? s.options : d.options,
  };
}

function tkClean(b, gid) {
  if (!b || typeof b !== 'object') throw codeErr('bad_value');
  const cg = client && client.guilds.cache.get(gid);
  if (!cg) throw codeErr('bad_value');
  const str = (v, max) => { const t = v == null ? '' : String(v).trim(); if (t.length > max) throw codeErr('bad_text'); return t; };
  const url = (v) => { const t = str(v, 500); if (!t) return ''; const u = safeUrl(t); if (u === null) throw codeErr('bad_url'); return u; };
  const img = (v) => {
    const t = str(v, 500);
    if (!t) return '';
    const m = TK_IMG_RE.exec(t);
    if (m) { if (!fs.existsSync(path.join(TK_DIR, m[1]))) throw codeErr('bad_image'); return t; }
    return url(t); // روابط قديمة
  };
  const chan = (v, types) => {
    if (!v) return null;
    const c = cg.channels.cache.get(String(v));
    if (!c || !types.includes(c.type)) throw codeErr('bad_channel');
    return c.id;
  };
  const roles = (v) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > 25) throw codeErr('bad_value');
    return [...new Set(v.map(String))].filter((x) => x !== gid && cg.roles.cache.has(x));
  };
  if (!Array.isArray(b.options) || b.options.length < 1 || b.options.length > 25) throw codeErr('bad_options');
  const seen = new Set();
  const options = b.options.map((o) => {
    o = o || {};
    const name = str(o.name, 80);
    if (!name) throw codeErr('bad_label');
    const emoji = str(o.emoji, 64);
    if (emoji && !/^<a?:\w{1,32}:\d{15,25}>$/.test(emoji) && !EMOJI_RE.test(emoji)) throw codeErr('bad_emoji');
    let id = String(o.id || '');
    if (!/^[a-f0-9]{6,16}$/.test(id) || seen.has(id)) id = newId();
    seen.add(id);
    return { id, name, emoji, style: TK_STYLES.includes(o.style) ? o.style : 'primary', message: str(o.message, 2000), image: img(o.image), roles: roles(o.roles) };
  });
  const p = b.panel || {};
  const cfg = {
    enabled: b.enabled === true,
    category: chan(b.category, [ChannelType.GuildCategory]),
    supportRoles: roles(b.supportRoles),
    logEnabled: b.logEnabled === true, logChannel: chan(b.logChannel, [0, 5]),
    ratingEnabled: b.ratingEnabled === true, ratingChannel: chan(b.ratingChannel, [0, 5]),
    autoRating: b.autoRating === true,
    askReason: b.askReason === true,
    mode: b.mode === 'select' ? 'select' : 'button',
    panel: { title: str(p.title, 256), description: str(p.description, 4000), image: img(p.image), channel: chan(p.channel, [0, 5]), messageId: null },
    options,
  };
  if (cfg.logEnabled && !cfg.logChannel) throw codeErr('bad_channel');
  if (cfg.ratingEnabled && !cfg.ratingChannel) throw codeErr('bad_channel');
  return cfg;
}

// ---------- API ----------
app.get('/api/guild/:id/tickets', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  res.json({
    canManage: info.canManage, roles: roleList(info.id), channels: textChannels(info.id),
    categories: [...cg.channels.cache.values()].filter((c) => c.type === ChannelType.GuildCategory)
      .sort((x, y) => x.rawPosition - y.rawPosition).map((c) => ({ id: c.id, name: c.name })),
    cfg: tkCfg(info.id),
  });
}));

app.put('/api/guild/:id/tickets', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  let cfg;
  try { cfg = tkClean((req.body || {}).cfg, info.id); }
  catch (e) { if (e.code) return res.status(400).json({ error: e.code }); throw e; }
  cfg.panel.messageId = tkCfg(info.id).panel.messageId;
  S(info.id).tickets = cfg;
  dirty = true;
  res.json({ ok: true });
}));

app.post('/api/guild/:id/tickets/send', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const cfg = tkCfg(info.id);
  const cg = client.guilds.cache.get(info.id);
  const ch = cfg.panel.channel && cg.channels.cache.get(cfg.panel.channel);
  if (!ch) return res.status(400).json({ error: 'no_channel' });
  try {
    const m = await tkPost(ch.id, tkPanelBody(cfg), cfg.panel.image);
    S(info.id).tickets = { ...cfg, panel: { ...cfg.panel, messageId: m.id } };
    dirty = true;
    res.json({ ok: true, url: `https://discord.com/channels/${info.id}/${ch.id}/${m.id}` });
  } catch (e) { res.status(400).json({ error: 'discord_error', detail: discordMsg(e) }); }
}));

// إيموجيات السيرفر (لقائمة اختيار الإيموجي)
app.get('/api/guild/:id/emojis', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const cg = client.guilds.cache.get(info.id);
  res.json({ list: [...cg.emojis.cache.values()].filter((e) => e.available !== false).map((e) => ({
    id: e.id, name: e.name, animated: !!e.animated, tag: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`,
  })) });
}));

// رفع صورة (بدل الرابط)
app.post('/api/guild/:id/tickets/upload', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const v = (req.body || {}).image;
  const ok = imgCheck(v, 5);
  if (ok !== true || v === null) return res.status(400).json({ error: ok === true ? 'bad_image' : ok });
  const m = /^data:image\/(png|jpeg|gif|webp);base64,(.+)$/.exec(v);
  if (!m) return res.status(400).json({ error: 'bad_image' });
  const name = crypto.randomBytes(5).toString('hex') + '.' + BG_EXT[m[1]];
  try {
    fs.mkdirSync(TK_DIR, { recursive: true });
    fs.writeFileSync(path.join(TK_DIR, name), Buffer.from(m[2], 'base64'));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'server_error' }); }
  res.json({ ok: true, ref: 'up:' + name });
}));

app.get('/api/guild/:id/tickets/img/:name', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  if (!/^[a-f0-9]{10}\.(png|jpg|gif|webp)$/.test(req.params.name)) return res.status(404).end();
  const f = path.join(TK_DIR, req.params.name);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.set({ 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(f);
}));

// ---------- بناء الرسائل ----------
const tkEmoji = (e) => { const m = /^<(a?):(\w{1,32}):(\d{15,25})>$/.exec(e || ''); return m ? { id: m[3], name: m[2], animated: !!m[1] } : { name: e }; };

function tkPanelBody(cfg) {
  const p = cfg.panel;
  const embed = { color: 0xfbbf24, description: p.description || 'اضغط لفتح تذكرة.' };
  if (p.title) embed.title = p.title;
  const pu = tkImgUrl(p.image);
  if (pu) embed.image = { url: pu };
  const O = cfg.options.slice(0, 25);
  let components = [];
  if (cfg.mode === 'select') {
    components = [{ type: 1, components: [{
      type: 3, custom_id: 'tkp:s', placeholder: 'اختر نوع التذكرة...',
      options: O.map((o) => Object.assign({ label: o.name.slice(0, 100), value: o.id }, o.emoji ? { emoji: tkEmoji(o.emoji) } : {})),
    }] }];
  } else {
    O.forEach((o, i) => {
      if (i % 5 === 0) components.push({ type: 1, components: [] });
      components[components.length - 1].components.push(Object.assign(
        { type: 2, style: EMB_STYLE[o.style] || 1, custom_id: `tkp:b:${o.id}`, label: o.name.slice(0, 80) },
        o.emoji ? { emoji: tkEmoji(o.emoji) } : {}));
    });
  }
  return { embeds: [embed], components, allowed_mentions: { parse: [] } };
}

const TK_MENU = [
  ['come', 'Come', 'استدعاء صاحب التذكرة'],
  ['add', 'Add', 'اضافة عضو للتذكرة'],
  ['remove', 'Remove', 'إزالة عضو من التذكرة'],
  ['rename', 'Rename', 'تغيير اسم التذكرة'],
  ['rating', 'Rating', 'تقييم مستلم التكت'],
  ['close', 'Close', 'غلق التذكرة'],
  ['unclaim', 'Unclaim', 'إلغاء استلام التكت'],
  ['restart', 'Restart', 'إعادة تحميل القائمة'],
];
// room.sa = تم طلب الدعم مسبقاً، فيتعطل الزر
const tkControls = (room) => [
  { type: 1, components: [
    { type: 2, style: 2, custom_id: 'tk:support', label: 'طلب الدعم', emoji: { name: '🎧' }, disabled: !!(room && room.sa) },
    { type: 2, style: 3, custom_id: 'tk:claim', label: 'استلام', emoji: { name: '🙋' } },
    { type: 2, style: 4, custom_id: 'tk:close', label: 'غلق', emoji: { name: '🔒' } },
  ] },
  { type: 1, components: [{ type: 3, custom_id: 'tk:menu', placeholder: 'خيارات التكت', options: TK_MENU.map(([v, l, d]) => ({ label: l, value: v, description: d })) }] },
];

function tkTicketBody(room, user, ping) {
  const emb = {
    color: 0xfbbf24, title: room.snap.name,
    author: { name: user.globalName || user.username, icon_url: user.displayAvatarURL({ size: 64, extension: 'png' }) },
    timestamp: new Date().toISOString(),
  };
  if (room.snap.message) emb.description = room.snap.message;
  if (room.reason) emb.fields = [{ name: 'السبب', value: '```\n' + room.reason.replace(/```/g, "'''").slice(0, 900) + '\n```' }];
  if (room.snap.image) { const iu = tkImgUrl(room.snap.image); if (iu) emb.image = { url: iu }; }
  const body = { embeds: [emb], components: tkControls(room), allowed_mentions: { parse: [] } };
  if (ping) {
    body.content = [`<@${room.owner}>`, ...room.roles.map((r) => `<@&${r}>`)].join(' ');
    body.allowed_mentions = { users: [room.owner], roles: room.roles };
  }
  return body;
}

function tkRatingBody(guild, room) {
  return {
    embeds: [{ color: 0xfbbf24, title: '⭐ قيّم الدعم الفني', description: 'كيف كانت تجربتك مع الدعم؟ اختر عدد النجوم.', footer: { text: guild.name } }],
    components: [{ type: 1, components: [1, 2, 3, 4, 5].map((n) => ({
      type: 2, style: 2, custom_id: `tkr:${guild.id}:${room.owner}:${room.claimer || 0}:${n}`, label: '⭐'.repeat(n),
    })) }],
  };
}

// ---------- فتح / غلق / حذف ----------
async function tkOpen(i, optId, reason) {
  const guild = i.guild, cfg = tkCfg(guild.id);
  const opt = cfg.options.find((o) => o.id === optId);
  const reply = (t) => i.editReply({ content: t });
  if (!cfg.enabled) return reply('⚠️ نظام التذاكر معطل حالياً.');
  if (!opt) return reply('⚠️ هذا الخيار لم يعد متاحاً.');
  const st = tkState(guild.id);
  const mine = Object.keys(st.rooms).find((cid) => st.rooms[cid].owner === i.user.id && !st.rooms[cid].closed && guild.channels.cache.has(cid));
  if (mine) return reply(`⚠️ عندك تذكرة مفتوحة: <#${mine}>`);
  if (tkBusy.has(i.user.id)) return reply('⏳ استنى شوي...');
  tkBusy.add(i.user.id);
  try {
    const V = PermissionFlagsBits;
    const roles = (opt.roles.length ? opt.roles : cfg.supportRoles).filter((r) => guild.roles.cache.has(r));
    const base = [V.ViewChannel, V.SendMessages, V.ReadMessageHistory, V.AttachFiles, V.EmbedLinks];
    const ow = [
      { id: guild.id, deny: [V.ViewChannel] },
      { id: i.user.id, allow: base },
      { id: client.user.id, allow: [...base, V.ManageChannels, V.ManageMessages] },
      ...roles.map((id) => ({ id, allow: base })),
    ];
    const n = ++st.n;
    const ch = await guild.channels.create({
      name: `ticket-${String(n).padStart(4, '0')}`, type: ChannelType.GuildText,
      parent: cfg.category && guild.channels.cache.has(cfg.category) ? cfg.category : null,
      permissionOverwrites: ow, reason: 'OPS: ticket',
    });
    const room = {
      owner: i.user.id, reason, roles, claimer: null, at: Date.now(), n, msg: null, closed: false, sa: false,
      snap: { name: opt.name, message: opt.message, image: opt.image },
    };
    st.rooms[ch.id] = room;
    dirty = true;
    const m = await tkPost(ch.id, tkTicketBody(room, i.user, true), room.snap.image);
    room.msg = m.id;
    await reply(`✅ تم فتح تذكرتك: <#${ch.id}>`);
  } finally { tkBusy.delete(i.user.id); }
}

async function tkTranscript(ch) {
  const all = [];
  let before;
  for (let k = 0; k < 5; k++) {
    const b = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!b || !b.size) break;
    all.push(...b.values());
    before = b.last().id;
    if (b.size < 100) break;
  }
  return all.reverse().map((m) =>
    `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || (m.embeds.length ? '(إيمبد)' : '')}` +
    (m.attachments.size ? ' ' + [...m.attachments.values()].map((a) => a.url).join(' ') : '')).join('\n');
}

// غلق ناعم: يخفي التذكرة عن صاحبها ويغيّر اسمها، بدون حذف
async function tkSoftClose(guild, ch, room, closer) {
  room.closed = true; room.closedBy = closer.id; dirty = true;
  await ch.permissionOverwrites.edit(room.owner, { ViewChannel: false }).catch(() => {});
  await ch.send({
    embeds: [{ color: 0x6b7280, description: '**يمكنك حذف او استرجاع تكت من هنا**' }],
    components: [{ type: 1, components: [
      { type: 2, style: 4, custom_id: 'tk:delete', label: 'حذف التكت', emoji: { name: '🗑️' } },
      { type: 2, style: 2, custom_id: 'tk:reopen', label: 'فتح تكت', emoji: { name: '🔓' } },
    ] }],
  }).catch(() => {});
  // ديسكورد يحدّ تغيير اسم الروم (مرتين كل 10 دقايق)، فما نستنى
  ch.setName(`close-${String(room.n).padStart(4, '0')}`, 'OPS: ticket closed').catch(() => {});
  const cfg = tkCfg(guild.id);
  if (cfg.ratingEnabled && cfg.autoRating && cfg.ratingChannel) {
    const u = await client.users.fetch(room.owner).catch(() => null);
    if (u) u.send(tkRatingBody(guild, room)).catch(() => {});
  }
}

// حذف نهائي: يرسل السجل للوق ويحذف الروم
async function tkDelete(guild, ch, room, closer) {
  const cfg = tkCfg(guild.id), st = tkState(guild.id);
  if (!st.rooms[ch.id]) return;
  delete st.rooms[ch.id];
  dirty = true;
  try {
    const lc = cfg.logEnabled && cfg.logChannel && guild.channels.cache.get(cfg.logChannel);
    if (lc && typeof lc.send === 'function') {
      const text = await tkTranscript(ch);
      await lc.send({
        embeds: [{
          color: 0xef4444, title: '🔒 تذكرة مغلقة', timestamp: new Date().toISOString(),
          fields: [
            { name: 'التذكرة', value: `\`${ch.name}\``, inline: true },
            { name: 'صاحبها', value: `<@${room.owner}>`, inline: true },
            { name: 'أغلقها', value: `<@${closer.id}>`, inline: true },
            { name: 'المستلم', value: room.claimer ? `<@${room.claimer}>` : '—', inline: true },
            { name: 'النوع', value: room.snap.name, inline: true },
          ],
        }],
        files: [{ attachment: Buffer.from(text || '(فارغ)', 'utf8'), name: `${ch.name}.txt` }],
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }
  } catch (_) {}
  setTimeout(() => ch.delete('OPS: ticket deleted').catch(() => {}), 3000);
}

// ---------- التفاعلات ----------
async function onTicketInteraction(i) {
  try {
    const cid = String(i.customId || '');
    if (!/^tk[pmur]?:/.test(cid)) return;
    const [kind, a, b, x3] = cid.split(':');
    const ephem = (t) => (i.deferred || i.replied
      ? i.editReply({ content: t })
      : i.reply({ content: t, flags: 64, allowedMentions: { parse: [] } }));

    // التقييم (يشتغل بالخاص وبالسيرفر)
    if (kind === 'tkr') {
      const [, gid, owner, claimer, stars] = cid.split(':');
      if (i.user.id !== owner) return void (await ephem('هذا التقييم مو إلك.'));
      const n = Math.min(5, Math.max(1, parseInt(stars, 10) || 1));
      await i.update({ content: `شكراً لتقييمك! ${'⭐'.repeat(n)}`, embeds: [], components: [] });
      const cfg = tkCfg(gid), guild = client.guilds.cache.get(gid);
      const rc = cfg.ratingEnabled && guild && guild.channels.cache.get(cfg.ratingChannel);
      if (rc && typeof rc.send === 'function') {
        await rc.send({
          embeds: [{
            color: 0xfbbf24, title: '⭐ تقييم جديد', timestamp: new Date().toISOString(),
            fields: [
              { name: 'العضو', value: `<@${owner}>`, inline: true },
              { name: 'المستلم', value: claimer !== '0' ? `<@${claimer}>` : '—', inline: true },
              { name: 'التقييم', value: '⭐'.repeat(n) + ` (${n}/5)` },
            ],
          }],
          allowedMentions: { parse: [] },
        }).catch(() => {});
      }
      return;
    }
    if (!i.guildId) return;

    // البانل: فتح تذكرة
    if (kind === 'tkp') {
      const cfg = tkCfg(i.guildId);
      const sel = i.isStringSelectMenu();
      const optId = sel ? i.values[0] : b;
      if (sel) i.message.edit({ components: tkPanelBody(cfg).components }).catch(() => {}); // يرجّع القائمة فاضية
      if (!cfg.enabled) return void (await ephem('⚠️ نظام التذاكر معطل حالياً.'));
      if (!cfg.options.some((o) => o.id === optId)) return void (await ephem('⚠️ هذا الخيار لم يعد متاحاً.'));
      if (cfg.askReason) {
        return void (await i.showModal({
          custom_id: `tkm:o:${optId}`, title: 'فتح تذكرة',
          components: [{ type: 1, components: [{ type: 4, custom_id: 'v', label: 'سبب فتح التذكرة', style: 2, required: true, min_length: 3, max_length: 500 }] }],
        }));
      }
      await i.deferReply({ flags: 64 });
      return void (await tkOpen(i, optId, ''));
    }
    if (kind === 'tkm' && a === 'o') {
      await i.deferReply({ flags: 64 });
      return void (await tkOpen(i, b, i.fields.getTextInputValue('v').trim()));
    }

    // داخل التذكرة
    const st = tkState(i.guildId);
    const room = st.rooms[i.channelId];
    if (!room) return void (await ephem('هذي مو تذكرة فعّالة.'));
    const ch = i.channel, member = i.member, guild = i.guild;
    const isAdmin = member.permissions.has(PermissionFlagsBits.ManageGuild);
    const staff = isAdmin || room.roles.some((r) => member.roles.cache.has(r));
    const isOwner = room.owner === i.user.id;

    let act;
    if (kind === 'tk') {
      act = i.isStringSelectMenu() ? i.values[0] : a;
      if (i.isStringSelectMenu()) i.message.edit({ components: tkControls(room) }).catch(() => {});
    } else if (kind === 'tku') act = 'u:' + a;
    else if (kind === 'tkm') act = 'm:' + a;
    else return;

    if (room.closed && !['delete', 'reopen'].includes(act)) return void (await ephem('🔒 هذه التذكرة مغلقة.'));
    if (act === 'claim' && isOwner) return void (await ephem('❌ لا يمكنك استلام تذكرتك الخاصة.'));
    if (act === 'come' && isOwner) return void (await ephem('❌ لا يمكن لصاحب التذكرة استخدام أمر الاستدعاء.'));

    const STAFF_ONLY = ['claim', 'come', 'add', 'remove', 'rename', 'rating', 'unclaim', 'restart', 'reqclaim', 'delete', 'reopen', 'u:add', 'u:remove', 'm:rename'];
    if (STAFF_ONLY.includes(act) && !staff) return void (await ephem('⚠️ هذا الخيار لرتب الدعم فقط.'));
    if (act === 'rating' && room.claimer !== i.user.id) return void (await ephem('⚠️ يجب أن تكون مستلم هذه التذكرة لاستخدام التقييم.'));
    if (['close', 'cyes'].includes(act) && !staff && !isOwner) return void (await ephem('⚠️ بس صاحب التذكرة أو الدعم يقدروا يغلقوها.'));

    switch (act) {
      case 'claim':
        if (room.claimer === i.user.id) return void (await ephem('⚠️ أنت مستلم هذه التذكرة أصلاً.'));
        if (room.claimer) {
          return void (await i.reply({
            embeds: [{ color: 0x0ea5e9, description: `**تم استلام التكت من قبل <@${room.claimer}>**` }],
            components: [{ type: 1, components: [{ type: 2, style: 2, custom_id: 'tk:reqclaim', label: 'طلب استلام' }] }],
            flags: 64, allowedMentions: { parse: [] },
          }));
        }
        room.claimer = i.user.id; dirty = true;
        return void (await i.reply({ content: `🙋 <@${i.user.id}> استلم التذكرة <@${room.owner}>`, allowedMentions: { users: [i.user.id, room.owner] } }));

      case 'reqclaim': {
        if (!room.claimer) return void (await i.update({ content: 'التذكرة صارت غير مستلمة، اضغط استلام.', embeds: [], components: [] }));
        if (room.claimer === i.user.id) return void (await i.update({ content: 'أنت المستلم أصلاً.', embeds: [], components: [] }));
        await i.update({ content: '✅ تم إرسال طلبك للمستلم الحالي.', embeds: [], components: [] });
        return void ch.send({
          content: `<@${room.claimer}>`,
          embeds: [{ color: 0x8b5cf6, description: `**هاذ الاداري <@${i.user.id}> يريد استلام التكت**` }],
          components: [{ type: 1, components: [
            { type: 2, style: 3, custom_id: `tk:reqok:${i.user.id}:${room.claimer}`, label: 'قبول', emoji: { name: '✅' } },
            { type: 2, style: 4, custom_id: `tk:reqno:${i.user.id}:${room.claimer}`, label: 'رفض', emoji: { name: '❌' } },
          ] }],
          allowedMentions: { users: [room.claimer] },
        }).catch(() => {});
      }
      case 'reqok': case 'reqno': {
        const reqId = b, was = x3;
        if (i.user.id === reqId) return void (await ephem('⚠️ ما بتقدر ترد على طلبك بنفسك.'));
        if (!room.claimer || room.claimer !== was) {
          return void (await i.update({ content: '', embeds: [{ color: 0x6b7280, description: '**هذا الطلب لم يعد صالحاً**' }], components: [] }));
        }
        if (i.user.id !== was && !isAdmin) return void (await ephem('⚠️ بس المستلم الحالي يقدر يرد على الطلب.'));
        if (act === 'reqok') {
          room.claimer = reqId; dirty = true;
          return void (await i.update({ content: '', embeds: [{ color: 0x22c55e, description: `**✅ <@${was}> وافق، والمستلم الجديد <@${reqId}>**` }], components: [] }));
        }
        return void (await i.update({ content: '', embeds: [{ color: 0xef4444, description: `**❌ <@${was}> رفض طلب <@${reqId}>**` }], components: [] }));
      }
      case 'unclaim':
        if (!room.claimer) return void (await ephem('التذكرة مو مستلمة.'));
        if (room.claimer !== i.user.id && !isAdmin) return void (await ephem('⚠️ بس المستلم أو الإدارة يقدروا يلغوا الاستلام.'));
        room.claimer = null; dirty = true;
        return void (await i.reply({ content: `❌ <@${i.user.id}> ألغى استلام التذكرة.`, allowedMentions: { parse: [] } }));

      case 'support': {
        if (room.sa) return void (await ephem('⚠️ تم طلب الدعم الفني مسبقاً.'));
        room.sa = true; dirty = true;
        i.message.edit({ components: tkControls(room) }).catch(() => {}); // يعطّل الزر للجميع
        const pings = room.roles.map((r) => `<@&${r}>`).join(' ');
        return void (await i.reply({
          content: `🆘 طلب الدعم الفني | ${pings || (room.claimer ? `<@${room.claimer}>` : '')}`.trim(),
          allowedMentions: { roles: room.roles, users: room.claimer ? [room.claimer] : [] },
        }));
      }
      case 'come': {
        await i.reply({ content: `📢 <@${room.owner}> الدعم يستدعيك للتذكرة.`, allowedMentions: { users: [room.owner] } });
        client.users.fetch(room.owner).then((u) => u.send(`📢 الدعم يستدعيك بسيرفر **${guild.name}**: https://discord.com/channels/${guild.id}/${ch.id}`)).catch(() => {});
        return;
      }
      case 'add': case 'remove':
        return void (await i.reply({
          content: act === 'add' ? 'اختر العضو اللي بدك تضيفه:' : 'اختر العضو اللي بدك تشيله:',
          components: [{ type: 1, components: [{ type: 5, custom_id: `tku:${act}`, placeholder: 'اختر العضو...', min_values: 1, max_values: 1 }] }],
          flags: 64,
        }));
      case 'u:add': {
        const uid = i.values[0];
        await ch.permissionOverwrites.edit(uid, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
        await i.update({ content: `✅ تمت إضافة <@${uid}>`, components: [] });
        return void ch.send({ content: `➕ <@${i.user.id}> أضاف <@${uid}> للتذكرة.`, allowedMentions: { users: [uid] } }).catch(() => {});
      }
      case 'u:remove': {
        const uid = i.values[0];
        if (uid === room.owner) return void (await i.update({ content: '⚠️ ما بتقدر تشيل صاحب التذكرة.', components: [] }));
        await ch.permissionOverwrites.delete(uid);
        await i.update({ content: `✅ تمت إزالة <@${uid}>`, components: [] });
        return void ch.send({ content: `➖ <@${i.user.id}> شال <@${uid}> من التذكرة.`, allowedMentions: { parse: [] } }).catch(() => {});
      }
      case 'rename':
        return void (await i.showModal({
          custom_id: 'tkm:rename', title: 'تغيير اسم التذكرة',
          components: [{ type: 1, components: [{ type: 4, custom_id: 'v', label: 'الاسم الجديد', style: 1, required: true, max_length: 100 }] }],
        }));
      case 'm:rename': {
        await i.deferReply({ flags: 64 });
        const v = i.fields.getTextInputValue('v').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 100);
        if (!v) return void (await i.editReply({ content: 'اكتب اسماً.' }));
        await ch.setName(v, 'OPS: ticket rename');
        return void (await i.editReply({ content: '✅ تم تغيير الاسم.' }));
      }
      case 'rating': {
        const cfg = tkCfg(guild.id);
        if (!cfg.ratingEnabled || !cfg.ratingChannel) return void (await ephem('⚠️ فعّل التقييمات وحدد قناتها من الداشبورد أولاً.'));
        await ch.send({ content: `<@${room.owner}>`, ...tkRatingBody(guild, room), allowedMentions: { users: [room.owner] } });
        return void (await ephem('✅ انرسل طلب التقييم لصاحب التذكرة.'));
      }

      case 'close':
        return void (await i.reply({
          embeds: [{ color: 0xef4444, description: `**هل تود غلق التكت يا <@${i.user.id}> ؟**` }],
          components: [{ type: 1, components: [
            { type: 2, style: 4, custom_id: 'tk:cyes', label: 'نعم' },
            { type: 2, style: 2, custom_id: 'tk:cno', label: 'لا' },
          ] }],
          flags: 64, allowedMentions: { parse: [] },
        }));
      case 'cno':
        return void (await i.update({ content: 'تم الإلغاء.', embeds: [], components: [] }));
      case 'cyes':
        await i.update({ content: '🔒 جاري الغلق...', embeds: [], components: [] });
        return void (await tkSoftClose(guild, ch, room, i.user));
      case 'delete':
        await i.update({ content: '🗑️ جاري حذف التذكرة...', embeds: [], components: [] });
        return void (await tkDelete(guild, ch, room, i.user));
      case 'reopen': {
        await i.update({ content: '🔓 تم فتح التذكرة مجدداً.', embeds: [], components: [] });
        room.closed = false; dirty = true;
        await ch.permissionOverwrites.edit(room.owner, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }).catch(() => {});
        ch.setName(`ticket-${String(room.n).padStart(4, '0')}`, 'OPS: ticket reopened').catch(() => {});
        return void ch.send({ content: `<@${room.owner}> تم إعادة فتح تذكرتك.`, allowedMentions: { users: [room.owner] } }).catch(() => {});
      }
      case 'restart': {
        await i.deferReply({ flags: 64 });
        if (room.msg) client.rest.delete(Routes.channelMessage(ch.id, room.msg)).catch(() => {});
        const owner = await client.users.fetch(room.owner).catch(() => i.user);
        const m = await tkPost(ch.id, tkTicketBody(room, owner, false), room.snap.image);
        room.msg = m.id; dirty = true;
        return void (await i.editReply({ content: '✅ تمت إعادة تحميل القائمة.' }));
      }
    }
  } catch (e) {
    try {
      const t = '⚠️ تعذر التنفيذ: ' + discordMsg(e);
      if (i.deferred || i.replied) await i.editReply({ content: t }); else await i.reply({ content: t, flags: 64 });
    } catch (_) {}
  }
}
// ===================== القسم الجديد =====================
function mysecCfg(gid) {
  const s = (db.settings[gid] || {}).mysec || {};
  return { enabled: !!s.enabled };
}

app.get('/api/guild/:id/mysec', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, cfg: mysecCfg(info.id) });
}));

app.put('/api/guild/:id/mysec', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad_value' });
  S(info.id).mysec = { enabled: b.enabled === true };
  dirty = true;
  res.json({ ok: true });
res.json({ ok: true });

}));// ===================== نظام العملات (RT Coin) =====================
const ECO_VIP_ROLE = '1544858160982917261'; // رتبة المكافأة المميزة (غيّرها لرتبتك)
const ECO_ADMIN_GUILDS = ['1544077828151054537', '1537751084171272213']; // السيرفرات اللي فيها اعطي/سحب
const ecoLimit = (gid) => (isPremium(gid) ? 5 : 1);
const ecoPending = new Map();
setInterval(() => { const c = Date.now() - 120000; for (const [k, v] of ecoPending) if (v.at < c) ecoPending.delete(k); }, 60000);

function ecoCfg(gid) {
  const s = (db.settings[gid] || {}).economy || {};
  return {
    enabled: !!s.enabled,
    currencyName: isPremium(gid) && typeof s.currencyName === 'string' && s.currencyName.trim() && s.currencyName.trim() !== 'RT' ? s.currencyName.trim().slice(0, 20) : 'OPS',
    channels: [...new Set(arr(s.channels).map(String).filter((x) => SNOW.test(x)))].slice(0, ecoLimit(gid)),
    role: SNOW.test(String(s.role || '')) ? String(s.role) : null,
  };
}
const ecoUser = (gid, uid) => { const g = dbk('economy', gid); return g[uid] || (g[uid] = { balance: 0, lastDaily: 0 }); };
const SUPPORT_GID = '1537751084171272213';
function ecoLog(gid, uid, amt, src) {
  const g = dbk('ecolog', gid);
  const l = g[uid] || (g[uid] = []);
  l.push({ amt, src, at: Date.now() });
  if (l.length > 500) l.shift();
  dirty = true;
}
app.get('/api/me/transactions', auth, (req, res) => {
  const uid = req.session.user.id;
  const bal = Number((dbr('economy', SUPPORT_GID)[uid] || {}).balance) || 0;
  const list = arr(dbr('ecolog', SUPPORT_GID)[uid]).slice().reverse();
  let dep = 0, wd = 0;
  for (const x of list) { if (x.amt > 0) dep += x.amt; else wd += -x.amt; }
  res.json({ balance: bal, deposits: dep, withdrawals: wd, count: list.length, list: list.slice(0, 200) });
});
function ecoParse(v) {
  const m = /^(\d+(?:\.\d+)?)([kmbt])?$/.exec(String(v || '').trim().toLowerCase().replace(/,/g, ''));
  if (!m) return NaN;
  return Math.floor(Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2]] || 1));
}
function ecoFmt(n) {
  n = Number(n) || 0;
  for (const [v, s] of [[1e12, 't'], [1e9, 'b'], [1e6, 'm'], [1e3, 'k']]) if (n >= v) return `${Number((n / v).toFixed(2))}${s}`;
  return String(n);
}

// ---------- API ----------
app.get('/api/guild/:id/economy', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), max: ecoLimit(info.id), channels: textChannels(info.id), roles: roleList(info.id), cfg: ecoCfg(info.id) });
}));

app.put('/api/guild/:id/economy', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad_value' });
  const name = String(b.currencyName == null ? '' : b.currencyName).trim();
  if (!name || name.length > 20) return res.status(400).json({ error: 'bad_name' });
  if (!isPremium(info.id) && name !== 'OPS') return res.status(403).json({ error: 'premium_required' });
  const chans = new Set(textChannels(info.id).map((c) => c.id));
  if (!Array.isArray(b.channels) || b.channels.length > ecoLimit(info.id) || !b.channels.every((x) => typeof x === 'string' && chans.has(x)))
    return res.status(400).json({ error: 'limit_reached' });
  let role = null;
  if (b.role) {
    if (!roleList(info.id).some((r) => r.id === b.role)) return res.status(400).json({ error: 'bad_role' });
    role = b.role;
  }
  S(info.id).economy = { enabled: b.enabled === true, currencyName: name, channels: [...new Set(b.channels)], role };
  dirty = true;
  res.json({ ok: true });
}));

app.get('/api/guild/:id/economy/top', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const type = req.query.type === 'xp' ? 'xp' : 'rich';
  let rows;
  if (type === 'xp') rows = Object.entries((db.guilds[info.id] || { members: {} }).members).map(([id, m]) => [id, m.xp || 0]);
  else rows = Object.entries(dbr('economy', info.id)).map(([id, u]) => [id, Number(u.balance) || 0]);
  rows = rows.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 100);
  const list = await Promise.all(rows.map(async ([uid, v], i) => {
    const u = await getUser(uid);
    return {
      rank: i + 1, id: uid, value: v, level: type === 'xp' ? levelFromXp(v) : undefined,
      name: u ? u.globalName || u.username : 'مستخدم غير معروف',
      avatar: u ? u.displayAvatarURL({ size: 64, extension: 'png' }) : null,
    };
  }));
  res.json({ type, currency: ecoCfg(info.id).currencyName, list });
}));

// ---------- أوامر الشات ----------
async function onEconomy(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId || !msg.content) return;
  const gid = msg.guildId, uid = msg.author.id;
  const cfg = ecoCfg(gid);
  if (!cfg.enabled || !cfg.channels.includes(msg.channelId)) return;
  const isAdmin = !!(msg.member && msg.member.permissions.has(PermissionFlagsBits.Administrator));
  if (cfg.role && !isAdmin && !(msg.member && msg.member.roles.cache.has(cfg.role))) return;

  const cur = cfg.currencyName, cname = cur.toLowerCase();
  const content = msg.content.trim(), lower = content.toLowerCase();
  const words = content.split(/\s+/), first = words[0].toLowerCase();
  const send = (p) => msg.channel.send({ ...p, allowedMentions: { parse: [] } }).catch(() => null);
  const box = (t) => send({ embeds: [EMB().setDescription(t)] });
  const key = gid + ':' + uid;

  // تأكيد التحويل بالرمز
  const p = ecoPending.get(key);
  if (p && p.code && content === p.code) {
    ecoPending.delete(key);
    msg.delete().catch(() => {});
    if (p.msg) p.msg.delete().catch(() => {});
    const from = ecoUser(gid, uid), to = ecoUser(gid, p.targetId);
    if (from.balance < p.amount) return box('❌ ليس لديك رصيد كافٍ لإتمام عملية التحويل.');
    from.balance -= p.amount; to.balance += p.amount; dirty = true;
        ecoLog(gid, uid, -p.amount, 'transfer'); ecoLog(gid, p.targetId, p.amount, 'transfer');
    return box(`✅ تم تحويل **${ecoFmt(p.amount)} ${cur}** إلى <@${p.targetId}>.`);
  }

  // الرصيد
  if (first === 'رصيد' || first === 'ops' || lower === cname || lower.startsWith(cname + ' ')) {
    const t = msg.mentions.users.first() || msg.author;
    const b = ecoUser(gid, t.id).balance;
    return box(t.id === uid ? `رصيدك الحالي : ${ecoFmt(b)} ${cur}` : `رصيد العضو <@${t.id}> الحالي : ${ecoFmt(b)} ${cur}`);
  }

  // المكافأة اليومية
  if (content === 'مكافاة' || content === 'مكافأة') {
    if (Date.now() - msg.author.createdTimestamp < 14 * 864e5) return box('لا يمكنك أخذ المكافأة اليومية لأن عمر حسابك أقل من 14 يومًا.');
    const u = ecoUser(gid, uid), now = Date.now(), cd = 864e5;
    if (now - u.lastDaily < cd) {
      const r = cd - (now - u.lastDaily);
      return box(`⏳ لقد استلمت مكافأتك مسبقاً. يمكنك الاستلام بعد **${Math.floor(r / 36e5)} ساعة و ${Math.floor((r % 36e5) / 6e4)} دقيقة**.`);
    }
    const vip = !!(msg.member && msg.member.roles.cache.has(ECO_VIP_ROLE));
    const amt = vip ? 3000 + Math.floor(Math.random() * 2001) : 1700 + Math.floor(Math.random() * 301);
    u.balance += amt; u.lastDaily = now; dirty = true;
        ecoLog(gid, uid, amt, 'daily');
    return box(vip ? `🎁 **مكافأة عضو مميز**\n\nلقد حصلت على **${ecoFmt(amt)} ${cur}**` : `🎁 لقد حصلت على **${ecoFmt(amt)} ${cur}**`);
  }

  // التحويل
  if (first === 'تحويل') {
    const t = msg.mentions.users.first();
    const arg = String(words[2] || '').toLowerCase();
    if (!t || !arg) return box('❌ الاستخدام الصحيح: `تحويل @منشن المبلغ` أو `تحويل @منشن نص` أو `تحويل @منشن كامل`');
    if (t.id === uid) return box('❌ لا يمكنك التحويل لنفسك!');
    if (t.bot) return box('❌ لا يمكنك التحويل لبوت.');
    const bal = ecoUser(gid, uid).balance;
    const amount = arg === 'كامل' ? bal : arg === 'نص' ? Math.floor(bal / 2) : ecoParse(arg);
    if (!(amount > 0)) return box('❌ يرجى كتابة مبلغ صالح أو (نص) أو (كامل).\nالاختصارات: `k` `m` `b` `t`');
    if (bal < amount) return box('❌ ليس لديك رصيد كافٍ لإتمام عملية التحويل.');
    const m = await send({
      content: '🔒 اضغط على الزر لإظهار رمز التحقق ثم أرسله في الشات لتأكيد التحويل.',
      components: [{ type: 1, components: [{ type: 2, style: 2, custom_id: `ecov:${gid}:${uid}`, label: 'إظهار رمز التحقق' }] }],
    });
    ecoPending.set(key, { targetId: t.id, amount, code: '', msg: m, at: Date.now() });
    return;
  }

  // التوب
  if (['توب', 'التوب', 'top'].includes(lower) || /^توب\s+[1-5]$/.test(content)) {
    const pm = /^توب\s+([1-5])$/.exec(content);
    const page = pm ? Number(pm[1]) : 1, s = (page - 1) * 10;
    const rows = Object.entries(dbr('economy', gid)).filter(([, d]) => d.balance > 0).sort((a, b) => b[1].balance - a[1].balance);
    const lines = rows.slice(s, s + 10).map(([id, d], i) => `#${s + i + 1} <@${id}> — **${ecoFmt(d.balance)} ${cur}**`).join('\n') || `الصفحة **${page}** فارغة.`;
    return send({ embeds: [EMB().setTitle(`قائمة التوب — الصفحة ${page}`).setDescription(lines)] });
  }

  // معلومات الحساب
  if (content === 'معلومات' || content === 'المعلومات') {
    const t = msg.mentions.users.first() || msg.author;
    const u = ecoUser(gid, t.id), next = u.lastDaily + 864e5;
    return send({ embeds: [EMB().setTitle('معلومات الحساب').addFields(
      { name: 'العضو', value: `<@${t.id}>` },
      { name: 'الرصيد', value: `${cur} ${ecoFmt(u.balance)}` },
      { name: 'آخر مكافأة', value: u.lastDaily ? ts(u.lastDaily, 'R') : 'لم يستلم أبداً' },
      { name: 'المكافأة القادمة', value: next > Date.now() ? ts(next, 'R') : 'متاحة الآن' })] });
  }

  // اعطي / سحب (للإداريين)
  if ((first === 'اعطي' || first === 'سحب') && ECO_ADMIN_GUILDS.includes(gid)) {
    if (!isAdmin) return box('❌ هذا الأمر مخصص للإداريين فقط.');
    const t = msg.mentions.users.first();
    const arg = String(words[2] || '').toLowerCase();
    if (!t || !arg || t.bot) return box(`❌ الاستخدام الصحيح: \`${first} @العضو المبلغ\``);
    const u = ecoUser(gid, t.id);
    if (first === 'اعطي') {
      const amt = ecoParse(arg);
      if (!(amt > 0)) return box('❌ مبلغ غير صالح. مثال: `اعطي @العضو 20k`');
      u.balance += amt; dirty = true;
            ecoLog(gid, t.id, amt, 'admin');
      return box(`✅ تم إضافة **${ecoFmt(amt)} ${cur}** إلى رصيد <@${t.id}>`);
    }
    let amt = arg === 'كامل' ? u.balance : arg === 'نص' ? Math.floor(u.balance / 2) : ecoParse(arg);
    if (!(amt > 0)) return box('❌ مبلغ غير صالح.');
    amt = Math.min(amt, u.balance);
    u.balance -= amt; dirty = true;
        ecoLog(gid, t.id, -amt, 'admin');
    return box(`✅ تم سحب **${ecoFmt(amt)} ${cur}** من رصيد <@${t.id}>`);
  }
}

// زر إظهار رمز التحقق
async function onEcoInteraction(i) {
  try {
    if (!i.guildId || !i.isButton() || !String(i.customId).startsWith('ecov:')) return;
    const [, gid, uid] = i.customId.split(':');
    if (i.user.id !== uid) return void (await i.reply({ content: '❌ هذا الزر ليس مخصصاً لك.', flags: 64 }));
    const p = ecoPending.get(`${gid}:${uid}`);
    if (!p) return void (await i.reply({ content: '❌ عملية التحويل انتهت أو غير موجودة.', flags: 64 }));
    p.code = String(crypto.randomInt(100000, 1000000));
    await i.reply({ content: `🔐 رمز التحقق:\n\n**${p.code}**\n\nأرسله في الروم لتأكيد التحويل.`, flags: 64 });
  } catch (_) {}
}
app.listen(PORT, () => console.log(`OPS COIN site running on http://localhost:${PORT}`));
async function onChannelSync(msg) {
  client.on(Events.MessageCreate, onVent);
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId) return;
  if (!client.options.intents.has(GatewayIntentBits.MessageContent)) return; // بدون الإنتنت ما بنشوف النص وبنحذف غلط
  const cfg = chsyncCfg(msg.guildId);
  if (!cfg.enabled) return;
  const rule = cfg.channels.find((c) => c.id === msg.channelId);
  if (!rule) return;

  const text = String(msg.content || '').trim();
  const urlImg = !!text && !/\s/.test(text) && IMG_URL.test(text);
  const att = [...msg.attachments.values()];
  const img = att.filter((a) => /^image\//.test(a.contentType || '')).length + (urlImg ? 1 : 0);
  const vid = att.filter((a) => /^video\//.test(a.contentType || '')).length;
  const other = att.length - att.filter((a) => /^(image|video)\//.test(a.contentType || '')).length + msg.stickers.size;
  const hasText = !!text && !urlImg;

  const ok = {
    none: true,
    images: img > 0 && !vid && !other && !hasText,
    videos: vid > 0 && !img && !other && !hasText,
    media: img + vid > 0 && !other && !hasText,
    text: hasText && !img && !vid && !other,
  }[rule.filter];
  if (!ok) { msg.delete().catch(() => {}); return; }

  for (const e of rule.reactions) await msg.react(rpEmojiIdent(e)).catch(() => {});

  if (rule.line) {
    const prev = chsyncLast.get(msg.channelId);
    if (prev) msg.channel.messages.delete(prev).catch(() => {});
    const m = await msg.channel.send({ content: CHSYNC_LINE }).catch(() => null);
    if (m) chsyncLast.set(msg.channelId, m.id);
  }
}// ===================== الحماية الخاصة (سلومود تلقائي) =====================
const SPR_CALM = 5 * 60000;
const sprRules = (gid) => arr(((db.settings[gid] || {}).privguard || {}).rules).filter((r) => r && r.id);
function sprClean(list, gid) {
  if (!Array.isArray(list) || list.length > 20) throw codeErr('limit_reached');
  const chans = new Set(textChannels(gid).map((c) => c.id));
  const seen = new Set();
  return list.map((r) => {
    r = r || {};
    const name = String(r.name || '').trim();
    if (!name || name.length > 60) throw codeErr('bad_name');
    const channels = [...new Set(arr(r.channels).map(String))].filter((x) => chans.has(x)).slice(0, 25);
    if (!channels.length) throw codeErr('bad_channel');
    const n = (v, lo, hi) => { const x = parseInt(v, 10); if (!(x >= lo && x <= hi)) throw codeErr('bad_value'); return x; };
    let id = String(r.id || '');
    if (!/^[a-f0-9]{6,16}$/.test(id) || seen.has(id)) id = newId();
    seen.add(id);
    return { id, name, enabled: r.enabled !== false, channels, msgs: n(r.msgs, 2, 500), secs: n(r.secs, 3, 300), slow: n(r.slow, 1, 21600), drop: r.drop === 'instant' ? 'instant' : 'gradual' };
  });
}
app.get('/api/guild/:id/private', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), channels: textChannels(info.id), rules: sprRules(info.id) });
}));
app.put('/api/guild/:id/private', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (!isPremium(info.id)) return res.status(403).json({ error: 'premium_required' });
  let rules;
  try { rules = sprClean((req.body || {}).rules, info.id); }
  catch (e) { if (e.code) return res.status(400).json({ error: e.code }); throw e; }
  S(info.id).privguard = { rules };
  dirty = true;
  res.json({ ok: true, rules });
}));

const sprHits = new Map();
async function onPrivateGuard(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId) return;
  const rules = sprRules(msg.guildId);
  if (!rules.length || !isPremium(msg.guildId)) return;
  const now = Date.now();
  for (const r of rules) {
    if (r.enabled === false || !r.channels.includes(msg.channelId)) continue;
    const k = r.id + ':' + msg.channelId;
    const hits = (sprHits.get(k) || []).filter((t) => now - t < r.secs * 1000);
    hits.push(now);
    sprHits.set(k, hits);
    if (hits.length < r.msgs) continue;
    sprHits.set(k, []);
    const ch = msg.channel;
    if (!ch.setRateLimitPerUser) continue;
    const st = dbk('sprst', msg.guildId);
    const cur = ch.rateLimitPerUser || 0;
    if (!st[ch.id]) st[ch.id] = { orig: cur, last: now };
    st[ch.id].last = now;
    dirty = true;
    if (cur < r.slow) await ch.setRateLimitPerUser(r.slow, 'OPS: حماية خاصة').catch(() => {});
  }
}
async function sprSweep() {
  for (const [gid, list] of Object.entries(db.sprst || {})) {
    const guild = client && client.guilds.cache.get(gid);
    if (!guild) continue;
    for (const [cid, s] of Object.entries(list)) {
      const ch = guild.channels.cache.get(cid);
      if (!ch || !ch.setRateLimitPerUser) { delete list[cid]; dirty = true; continue; }
      if (Date.now() - s.last < SPR_CALM) continue;
      const rule = sprRules(gid).find((r) => r.channels.includes(cid));
      const cur = ch.rateLimitPerUser || 0;
      const next = rule && rule.drop === 'gradual' ? Math.max(s.orig, Math.floor(cur / 2)) : s.orig;
      if (cur !== next) await ch.setRateLimitPerUser(next, 'OPS: حماية خاصة').catch(() => {});
      if (next <= s.orig) { delete list[cid]; dirty = true; }
      else { s.last = Date.now() - SPR_CALM + 60000; dirty = true; }   // الخطوة الجاية بعد دقيقة
    }
  }
}// ===================== نظام الألوان =====================
// ===================== الخط التلقائي (VIP) =====================
const AL_DIR = path.resolve(DATA_DIR, 'ops-autoline');
const AL_IMG_RE = /^up:([a-f0-9]{10}\.(?:png|jpg|gif|webp))$/;
const alLast = new Map(); // channelId -> آخر رسالة صورة

function alCfg(gid) {
  const s = (db.settings[gid] || {}).autoline || {};
  const seen = new Set();
  const items = [];
  for (const it of arr(s.items)) {
    const cid = String((it && it.channelId) || '');
    if (!SNOW.test(cid) || seen.has(cid)) continue;
    seen.add(cid);
    items.push({ channelId: cid, image: AL_IMG_RE.test(String((it && it.image) || '')) ? it.image : '' });
  }
  return { enabled: !!s.enabled, count: Math.min(50, Math.max(1, parseInt(s.count, 10) || 1)), items: items.slice(0, 50) };
}

app.get('/api/guild/:id/autoline', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), channels: textChannels(info.id), cfg: alCfg(info.id) });
}));

app.put('/api/guild/:id/autoline', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (!isPremium(info.id)) return res.status(403).json({ error: 'premium_required' });
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad_value' });
  const count = parseInt(b.count, 10);
  const list = arr(b.items);
  if (!(count >= 1 && count <= 50) || list.length > count) return res.status(400).json({ error: 'bad_value' });
  const chans = new Set(textChannels(info.id).map((c) => c.id));
  const seen = new Set();
  const items = [];
  for (const it of list) {
    const cid = String((it && it.channelId) || '');
    if (!cid) continue;
    if (!chans.has(cid) || seen.has(cid)) return res.status(400).json({ error: 'bad_channel' });
    seen.add(cid);
    const img = String((it && it.image) || '');
    if (img) {
      const m = AL_IMG_RE.exec(img);
      if (!m || !fs.existsSync(path.join(AL_DIR, m[1]))) return res.status(400).json({ error: 'bad_image' });
    }
    items.push({ channelId: cid, image: img });
  }
  S(info.id).autoline = { enabled: b.enabled === true, count, items };
  dirty = true;
  res.json({ ok: true });
}));

app.post('/api/guild/:id/autoline/upload', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (!isPremium(info.id)) return res.status(403).json({ error: 'premium_required' });
  const v = (req.body || {}).image;
  const ok = imgCheck(v, 5);
  if (ok !== true || v === null) return res.status(400).json({ error: ok === true ? 'bad_image' : ok });
  const m = /^data:image\/(png|jpeg|gif|webp);base64,(.+)$/.exec(v);
  if (!m) return res.status(400).json({ error: 'bad_image' });
  const name = crypto.randomBytes(5).toString('hex') + '.' + BG_EXT[m[1]];
  try {
    fs.mkdirSync(AL_DIR, { recursive: true });
    fs.writeFileSync(path.join(AL_DIR, name), Buffer.from(m[2], 'base64'));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'server_error' }); }
  res.json({ ok: true, ref: 'up:' + name });
}));

app.get('/api/guild/:id/autoline/img/:name', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  if (!/^[a-f0-9]{10}\.(png|jpg|gif|webp)$/.test(req.params.name)) return res.status(404).end();
  const f = path.join(AL_DIR, req.params.name);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.set({ 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(f);
}));

async function onAutoLine(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId) return;
  if (!isPremium(msg.guildId)) return;
  const c = alCfg(msg.guildId);
  if (!c.enabled) return;
  const it = c.items.find((x) => x.channelId === msg.channelId && x.image);
  if (!it) return;
  const m = AL_IMG_RE.exec(it.image);
  if (!m) return;
  let data;
  try { data = fs.readFileSync(path.join(AL_DIR, m[1])); } catch (_) { return; }
  await msg.channel.send({ files: [{ attachment: data, name: m[1] }] }).catch(() => {});
}// ===================== التفاعل التلقائي (VIP) =====================
const arxEmoji = (e) => typeof e === 'string' && (/^<a?:\w{1,32}:\d{15,25}>$/.test(e) || EMOJI_RE.test(e));
function arxCfg(gid) {
  const s = (db.settings[gid] || {}).autoreact || {};
  const seen = new Set();
  const items = [];
  for (const it of arr(s.items)) {
    const cid = String((it && it.channelId) || '');
    if (!SNOW.test(cid) || seen.has(cid)) continue;
    seen.add(cid);
    items.push({ channelId: cid, emojis: arr(it.emojis).map(String).filter(arxEmoji).slice(0, 20) });
  }
  return { enabled: !!s.enabled, count: Math.min(50, Math.max(1, parseInt(s.count, 10) || 1)), items: items.slice(0, 50) };
}

app.get('/api/guild/:id/autoreact', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  res.json({ canManage: info.canManage, guildPremium: isPremium(info.id), channels: textChannels(info.id), cfg: arxCfg(info.id) });
}));

app.put('/api/guild/:id/autoreact', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  if (!isPremium(info.id)) return res.status(403).json({ error: 'premium_required' });
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad_value' });
  const count = parseInt(b.count, 10);
  const list = arr(b.items);
  if (!(count >= 1 && count <= 50) || list.length > count) return res.status(400).json({ error: 'bad_value' });
  const chans = new Set(textChannels(info.id).map((c) => c.id));
  const seen = new Set();
  const items = [];
  for (const it of list) {
    const cid = String((it && it.channelId) || '');
    if (!cid) continue;
    if (!chans.has(cid) || seen.has(cid)) return res.status(400).json({ error: 'bad_channel' });
    seen.add(cid);
    const em = arr(it && it.emojis).map((x) => String(x).trim());
    if (em.length > 20 || !em.every(arxEmoji)) return res.status(400).json({ error: 'bad_emoji' });
    items.push({ channelId: cid, emojis: [...new Set(em)] });
  }
  S(info.id).autoreact = { enabled: b.enabled === true, count, items };
  dirty = true;
  res.json({ ok: true });
}));

async function onAutoReact(msg) {
  if (!msg.guildId || !msg.author || msg.author.bot || msg.webhookId) return;
  if (!isPremium(msg.guildId)) return;
  const c = arxCfg(msg.guildId);
  if (!c.enabled) return;
  const it = c.items.find((x) => x.channelId === msg.channelId && x.emojis.length);
  if (!it) return;
  for (const e of it.emojis) await msg.react(rpEmojiIdent(e)).catch(() => {});
}
function lerpHex(stops, n) {
  const p = stops.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : (k / (n - 1)) * (p.length - 1);
    const i = Math.min(p.length - 2, Math.floor(t)), f = t - i;
    const c = p[i].map((v, j) => Math.round(v + (p[i + 1][j] - v) * f));
    out.push('#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
  }
  return out;
}
// [id, الاسم, ألوان البداية والنهاية, العدد]
const COLOR_SETS = [
  ['mono', 'أحادي اللون', ['#0d0d0d', '#e5e5e5'], 11],
  ['sun', 'شمس متوهجة', ['#ff4500', '#ff8c00'], 20],
  ['lake', 'بحيرة طبيعية', ['#26a69a', '#004d40'], 10],
  ['tea', 'شجرة الشاي', ['#6a9f87', '#2f4f40'], 10],
  ['blood', 'الدم الأحمر', ['#b30000', '#4d0000'], 10],
  ['ocean', 'المحيط الأطلسي', ['#2196f3', '#0d47a1'], 10],
  ['forest', 'موضوع الغابة', ['#4caf50', '#1b5e20'], 17],
  ['purple', 'موضوع بنفسجي', ['#9c27b0', '#4a148c'], 10],
  ['safari', 'رحلة سفاري', ['#8d6e63', '#3e2723'], 10],
  ['pinky', 'بينكي كاندي', ['#ec407a', '#880e4f'], 10],
  ['empire', 'الإمبراطورية', ['#7e57c2', '#311b92'], 10],
].map(([id, name, stops, n]) => ({ id, name, colors: lerpHex(stops, n) }));

const colorsCfg = (gid) => {
  const s = (db.settings[gid] || {}).colors || {};
  return {
    enabled: !!s.enabled,
    title: typeof s.title === 'string' && s.title.trim() ? s.title.slice(0, 60) : 'قائمة الألوان',
    shape: s.shape === 'circle' ? 'circle' : 'square',
    bg: ['transparent', 'dark', 'light'].includes(s.bg) ? s.bg : 'transparent',
    set: COLOR_SETS.some((x) => x.id === s.set) ? s.set : null,
    roles: arr(s.roles).map(String).filter((x) => SNOW.test(x)),
  };
};
async function colorsClear(guild, ids) {
  for (const id of ids) { const r = guild.roles.cache.get(id); if (r) await r.delete('OPS: colors').catch(() => {}); }
}

app.get('/api/guild/:id/colors', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res); if (!info) return;
  const c = colorsCfg(info.id), cg = client.guilds.cache.get(info.id);
  res.json({
    canManage: info.canManage, sets: COLOR_SETS,
    count: c.roles.filter((id) => cg.roles.cache.has(id)).length,
    cfg: { enabled: c.enabled, title: c.title, shape: c.shape, bg: c.bg, set: c.set },
  });
}));

app.put('/api/guild/:id/colors', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const b = (req.body || {}).cfg;
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'bad_value' });
  const title = String(b.title == null ? '' : b.title).trim();
  if (!title || title.length > 60) return res.status(400).json({ error: 'bad_text' });
  if (!['circle', 'square'].includes(b.shape) || !['transparent', 'dark', 'light'].includes(b.bg)) return res.status(400).json({ error: 'bad_value' });
  S(info.id).colors = { ...colorsCfg(info.id), enabled: b.enabled === true, title, shape: b.shape, bg: b.bg };
  dirty = true;
  res.json({ ok: true });
}));

app.post('/api/guild/:id/colors/apply', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const set = COLOR_SETS.find((x) => x.id === (req.body || {}).set);
  if (!set) return res.status(400).json({ error: 'bad_value' });
  const cg = client.guilds.cache.get(info.id);
  if (!cg.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) return res.status(400).json({ error: 'discord_error', detail: 'البوت يحتاج صلاحية Manage Roles' });
  const cur = colorsCfg(info.id);
  await colorsClear(cg, cur.roles);
  const ids = [];
  S(info.id).colors = { ...cur, set: set.id, roles: ids };
  dirty = true;
  try {
    for (let i = 0; i < set.colors.length; i++) {
      const r = await cg.roles.create({ name: String(i + 1), color: parseInt(set.colors[i].slice(1), 16), permissions: [], reason: 'OPS: colors' });
      ids.push(r.id); dirty = true;
    }
  } catch (e) { return res.status(400).json({ error: 'discord_error', detail: discordMsg(e) }); }
  res.json({ ok: true, count: ids.length });
}));

app.delete('/api/guild/:id/colors/roles', auth, wrap(async (req, res) => {
  const info = await ctxGuild(req, res, { manage: true }); if (!info) return;
  const cur = colorsCfg(info.id);
  await colorsClear(client.guilds.cache.get(info.id), cur.roles);
  S(info.id).colors = { ...cur, set: null, roles: [] };
  dirty = true;
  res.json({ ok: true });
}));

// ---- الأوامر ----
HANDLERS.color = async function (msg, mod, a) {
  const c = colorsCfg(msg.guildId);
  need(c.enabled && c.roles.length, 'نظام الألوان مو مفعّل أو ما في ألوان. فعّله وطبّق مجموعة من الداشبورد.');
  const raw = String(a[0] || '').toLowerCase();
  const off = ['off', '0', 'ازالة'].includes(raw);
  const n = parseInt(raw, 10);
  need(off || (n >= 1 && n <= c.roles.length), `الاستخدام: color! [1-${c.roles.length}]   |   color! off`);
  const have = c.roles.filter((id) => mod.roles.cache.has(id));
  if (have.length) await mod.roles.remove(have, 'OPS: color');
  if (off) return say(msg, '✅ تم إزالة لونك.');
  const role = msg.guild.roles.cache.get(c.roles[n - 1]);
  need(role, 'هذا اللون انحذف، أعد تطبيق المجموعة من الداشبورد.');
  need(role.editable, 'رتبة البوت لازم تكون أعلى من رتب الألوان.');
  await mod.roles.add(role, 'OPS: color');
  say(msg, `✅ تم تغيير لونك إلى ${n}.`);
};

const crr = (x, px, py, w, h, r) => {
  x.beginPath(); x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
};
const hexLum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
async function colorsImage(guild, c) {
  const items = c.roles.map((id, i) => [i + 1, guild.roles.cache.get(id)]).filter(([, r]) => r);
  const cols = Math.min(5, items.length), cell = 110, gap = 18, pad = 40, top = 110;
  const rows = Math.ceil(items.length / cols);
  const W = pad * 2 + cols * cell + (cols - 1) * gap, H = top + rows * (cell + gap) - gap + pad;
  const cv = canvasLib.createCanvas(W, H), x = cv.getContext('2d');
  const light = c.bg === 'light';
  if (c.bg !== 'transparent') { x.fillStyle = light ? '#f4f4f5' : '#111113'; crr(x, 0, 0, W, H, 28); x.fill(); }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = light ? '#111111' : '#ffffff'; x.font = 'bold 40px sans-serif';
  x.fillText(c.title, W / 2, 55, W - 60);
  items.forEach(([n, r], i) => {
    const cx = pad + (i % cols) * (cell + gap), cy = top + Math.floor(i / cols) * (cell + gap);
    x.fillStyle = r.hexColor;
    if (c.shape === 'circle') { x.beginPath(); x.arc(cx + cell / 2, cy + cell / 2, cell / 2, 0, Math.PI * 2); x.fill(); }
    else { crr(x, cx, cy, cell, cell, 18); x.fill(); }
    x.fillStyle = hexLum(r.hexColor) > 0.6 ? '#000000' : '#ffffff'; x.font = 'bold 34px sans-serif';
    x.fillText(String(n), cx + cell / 2, cy + cell / 2);
  });
  return cv.toBuffer('image/png');
}
HANDLERS.colors = async function (msg) {
  need(canvasLib, 'لازم تثبّت المكتبة: npm i @napi-rs/canvas');
  const c = colorsCfg(msg.guildId);
  need(c.enabled && c.roles.some((id) => msg.guild.roles.cache.has(id)), 'نظام الألوان مو مفعّل أو ما في ألوان.');
  await msg.reply({ files: [{ attachment: await colorsImage(msg.guild, c), name: 'colors.png' }], allowedMentions: { parse: [], repliedUser: false } });
};
// =====================  FRONT-END (كله داخل هذا الملف)  =====================

// Runs in the browser (served as /app.js) — الصفحة الرئيسية
function clientMain() {
  const I18N = {
    ar: {
      servers_active: "سيرفرات العملة مفعلة",
      trust: "سيرفر يثق بنا",
      welcome_pre: "هلا بك في",
      welcome_sub: "نظام أنيق وسهل لإدارة مظهر البوت",
      card_title: "إعدادات مظهر البوت",
      card_sub: "تعديل الاسم، الصورة، والبنر.",
      activate: "تفعيل النظام",
      support: "الدعم الفني",
      theme_blue: "أزرق + أسود",
      theme_pink: "وردي + أسود",
      theme_red: "أحمر + أسود",
      theme_gold: "ذهبي + أسود",
      theme_discord: "Discord",
      login_failed: "تعذّر تسجيل الدخول. حاول مرة أخرى.",
      soon_title: "قريباً",
      soon_sub: "الموقع قيد التجهيز، وسيفتح لك لوحة التحكم فور اكتمالها.",
      logout: "تسجيل الخروج",
    },
    en: {
      servers_active: "Servers using the coin",
      trust: "Servers trust us",
      welcome_pre: "Welcome to",
      welcome_sub: "A clean, simple way to manage your bot's look",
      card_title: "Bot appearance settings",
      card_sub: "Edit the name, avatar, and banner.",
      activate: "Activate system",
      support: "Support",
      theme_blue: "Blue + Black",
      theme_pink: "Pink + Black",
      theme_red: "Red + Black",
      theme_gold: "Gold + Black",
      theme_discord: "Discord",
      login_failed: "Couldn't sign you in. Please try again.",
      soon_title: "Coming soon",
      soon_sub: "The site is being prepared. Your dashboard will open here once it's ready.",
      logout: "Log out",
    },
  };

  const root = document.documentElement;
  const $ = (s) => document.querySelector(s);

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (_) {
      return null;
    }
  }

  function applyLang(lang) {
    if (!I18N[lang]) lang = "ar";
    const t = I18N[lang];
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t[el.dataset.i18n] ?? el.textContent;
    });
    const sel = $("#lang");
    if (sel) sel.value = lang;
    store("lang", lang);
  }

  function applyTheme(name, persist) {
    if (!["blue", "pink", "red", "gold", "discord"].includes(name)) name = "blue";
    root.dataset.theme = name === "blue" ? "" : name;
    if (persist) store("theme", name);
  }

  function makeBubbles() {
    const box = $("#bubbles");
    if (!box) return;
    for (let i = 0; i < 12; i++) {
      const b = document.createElement("div");
      const size = 52 + Math.random() * 56;
      b.className = "bubble";
      b.textContent = "OPS";
      b.style.cssText = `width:${size}px;height:${size}px;font-size:${size / 5}px;` +
        `left:${Math.random() * 94}%;top:${Math.random() * 92}%;` +
        `animation-duration:${10 + Math.random() * 10}s;animation-delay:-${Math.random() * 10}s;`;
      box.appendChild(b);
    }
  }

  function setupControls() {
    const lang = $("#lang");
    if (lang) lang.addEventListener("change", (e) => applyLang(e.target.value));

    const btn = $("#themeBtn");
    const menu = $("#themeMenu");
    if (!btn || !menu) return;
    const close = () => { menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
    menu.querySelectorAll("[data-theme-pick]").forEach((item) =>
      item.addEventListener("click", () => { applyTheme(item.dataset.themePick, true); close(); })
    );
    document.addEventListener("click", close);
    document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  }

  async function initLanding() {
    const btn = $("#enterBtn");
    const markEntered = () => {
      if (btn) btn.classList.add("entered");
      const t = $("#enterT");
      if (t) t.textContent = "دخول النظام";
    };

    try {
      const cfg = await (await fetch("/api/config")).json();
      const support = $("#support");
      if (support && cfg.supportUrl) support.href = cfg.supportUrl;
      if (cfg.loggedIn) { markEntered(); if (btn) btn.href = "/dashboard"; }
    } catch (_) { /* support link stays as-is */ }

    if (new URLSearchParams(location.search).get("error")) {
      $("#notice")?.classList.add("show");
      history.replaceState(null, "", "/");
    }
  }

  applyTheme(store("theme") || "blue");
  applyLang(store("lang") || "ar");
  makeBubbles();
  setupControls();
  if (document.body.dataset.page === "landing") initLanding();
}

// Runs in the browser (served as /dash.js) — لوحة التحكم بعد تسجيل الدخول
function dashMain() {
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    crown: '<path d="M2.5 19h19M3.5 7l4.5 5L12 5l4 7 4.5-5-2 10.5h-13z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.2c2.6.3 4.5 2.2 4.5 5.3"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    save: '<path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  };
  const root = document.documentElement;
  try {
    const t = localStorage.getItem('theme') || 'gold';
    root.dataset.theme = t === 'blue' ? '' : t;
  } catch (_) { root.dataset.theme = 'gold'; }

  const $ = (s) => document.querySelector(s);
  const view = $('#view');
  const NF = (n) => Number(n || 0).toLocaleString('en-US');
  const AR = (n) => Number(n).toLocaleString('ar-EG');
  const fmtMin = (n) => (n < 60 ? `${NF(n)} د` : `${NF(Math.floor(n / 60))} س ${n % 60} د`);
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  // ---- بناء عناصر بشكل آمن (كل النصوص عبر textContent) ----
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v; // فقط لأيقونات ثابتة
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
for (const kid of kids.flat(Infinity)) {
        if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }
  const icon = (name, cls = '') =>
    el('span', { class: 'ico ' + cls, html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>` });

  const put = (node, ...kids) => node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));

  async function api(path) {
    const r = await fetch(path, { headers: { Accept: 'application/json' } });
    if (r.status === 401) { window.onbeforeunload = null; location.href = '/'; throw new Error('auth'); }
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }

  let me = null, guilds = [], allGuilds = [], timer = null, token = 0;
  const setRefresh = (fn) => { clearInterval(timer); timer = setInterval(fn, 30000); };

  const initials = (n) => [...String(n).replace(/[^\p{L}\p{N} ]/gu, '').trim()].slice(0, 2).join('') || '؟';
  const userImg = (size = 52) =>
    el('img', {
      src: me.avatar
        ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(me.id) >> 22n) % 6n)}.png`,
      alt: '', width: size, height: size,
    });
  const guildIcon = (g, size = 52) =>
    g.icon
      ? el('img', { src: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}?size=128`, alt: '', width: size, height: size })
      : el('span', { class: 'fb' }, initials(g.name));

  // ---- عناصر مشتركة ----
  const statCard = (ic, value, label) =>
    el('div', { class: 'scard' }, el('div', { class: 'sico' }, icon(ic)), el('div', { class: 'stext' }, el('strong', {}, value), el('small', {}, label)));
  const errorBox = (retry) =>
    el('div', { class: 'empty' }, el('p', {}, 'تعذر جلب البيانات حالياً.'), el('button', { class: 'btn ghost small', type: 'button', onclick: retry }, 'إعادة المحاولة'));
  const statusPill = () =>
    el('div', { class: 'status' }, el('span', { class: 'dot ' + (me.bot.online ? 'on' : 'off') }), me.bot.online ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE');
  const botNotice = () => {
    if (!me.bot.enabled) return el('div', { class: 'notice show' }, 'توكن البوت غير مضبوط (DISCORD_BOT_TOKEN بملف .env)، لذلك لا تتوفر إحصائيات حقيقية بعد.');
    if (!me.bot.online) return el('div', { class: 'notice show' }, 'البوت غير متصل حالياً. ستظهر الإحصائيات فور اتصاله.');
    return null;
  };
  const activityCard = (ic, title, d, dark) =>
    el('section', { class: 'panelc' },
      el('div', { class: 'phd' }, el('span', { class: 'hico ' + (dark ? 'white' : '') }, icon(ic)), el('h2', {}, title)),
      [['النقاط الكلية', d.total], ['اليومية', d.day], ['الأسبوعية', d.week], ['الشهرية', d.month]].map(([l, v]) =>
        el('div', { class: 'arow' }, el('span', {}, l), el('b', {}, NF(v)))));

  // ---- الصفحة الرئيسية ----
  async function pageHome() {
    const box = el('div', { class: 'page' });
    async function fill() {
      const d = await api('/api/overview');
      put(box, 
        el('h1', { class: 'greet' }, 'مرحباً، ', el('span', { class: 'gold' }, me.name), ' 👋'),
        el('p', { class: 'lead' }, 'لوحة التحكم الخاصة بك. تابع نشاطك وتأثيرك في جميع المجتمعات.'),
        statusPill(),
        botNotice(),
        me.bot.online && guilds.length === 0
          ? el('div', { class: 'notice show' }, 'لا يوجد سيرفر مشترك بينك وبين البوت. ', el('a', { href: me.inviteUrl, target: '_blank', rel: 'noopener' }, 'أضف البوت لسيرفرك'))
          : null,
        el('div', { class: 'cards3' },
          statCard('crown', d.rank ? '#' + NF(d.rank) : '—', 'ترتيبك العالمي'),
          statCard('star', NF(d.points.total), 'النقاط الكلية'),
          statCard('calendar', NF(d.points.today), 'نقاط اليوم')),
        activityCard('pen', 'النشاط الكتابي', d.written, false),
        activityCard('mic', 'النشاط الصوتي', d.voice, true),
        el('section', { class: 'panelc upsell' },
          el('div', { class: 'phd' }, icon('crown', 'goldc'), el('h2', {}, 'ترقية السيرفر إلى OPS Premium ⭐')),
          el('p', { class: 'muted' }, 'احصل على سرعة فائقة للأوامر، حماية مشددة، وأدوات مخصصة بالكامل لسيرفرك مع إدارة سهلة للاشتراك والفوترة الفورية.'),
          el('a', { class: 'btn primary', href: '#/premium' }, 'استعراض الخطط والمزايا')));
    }
    await fill();
    setRefresh(() => fill().catch(() => {}));
    return box;
  }

  // ---- لوحة المتصدرين العامة ----
  async function pageLeaders() {
    const { list } = await api('/api/leaders');
    return el('div', { class: 'page' },
      el('h1', { class: 'greet' }, 'لوحة المتصدرين'),
      el('p', { class: 'lead' }, 'أعلى الأعضاء نقاطاً (كتابة + صوت) في جميع السيرفرات.'),
      el('section', { class: 'panelc' },
        list.length
          ? list.map((u) => el('div', { class: 'lrow' + (u.me ? ' me' : '') },
              el('span', { class: 'rk' }, '#' + u.rank),
              u.avatar ? el('img', { src: u.avatar, alt: '', width: 40, height: 40 }) : el('span', { class: 'fb' }, '؟'),
              el('span', { class: 'nm' }, u.name),
              el('b', {}, NF(u.points))))
          : el('div', { class: 'empty' }, 'لا تتوفر بيانات لعرض المتصدرين.')));
  }

  // ---- رسم بياني ----
  function lineSvg(series) {
    const W = 700, H = 220, pad = 10;
    const max = Math.max(1, ...series.flatMap((s) => s.data));
    const n = series[0].data.length;
    const x = (i) => pad + (n > 1 ? (i * (W - 2 * pad)) / (n - 1) : 0);
    const y = (v) => H - pad - (v / max) * (H - 2 * pad - 14);
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg">`;
    for (const f of [0.33, 0.66]) svg += `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" class="grid"/>`;
    for (const s of series) {
      const pts = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      svg += `<polyline points="${pts}" class="line ${s.cls}" fill="none" vector-effect="non-scaling-stroke"/>`;
    }
    return svg + '</svg>';
  }
  function chartLabels(chart) {
    const n = chart.labels.length, step = Math.ceil(n / 5);
    const fmtL = (l) => {
      if (chart.type === 'hour') { const h = parseInt(l, 10); return `${AR(h % 12 || 12)} ${h < 12 ? 'ص' : 'م'}`; }
      const [m, d] = l.split('-'); return `${AR(parseInt(d, 10))}/${AR(parseInt(m, 10))}`;
    };
    const row = el('div', { class: 'xlabels' });
    chart.labels.forEach((l, i) => {
      if (i % step === 0) row.append(el('span', { style: `left:${n > 1 ? (i / (n - 1)) * 100 : 0}%` }, fmtL(l)));
    });
    return row;
  }

  // ---- صفحة السيرفر ----
  function pageGuild(gid) {
    const g = guilds.find((x) => x.id === gid);
    let range = '24h', ctab = 'messages', ltab = 'messages', data = null;

    const head = el('div', { class: 'ghead' });
    const cards = el('div', { class: 'cards4' });
    const chartBody = el('div', { class: 'chartbox', dir: 'ltr' });
    const chartTabs = el('div', { class: 'tabs' });
    const leadBody = el('div', {});
    const leadTabs = el('div', { class: 'tabs' });

    const sel = el('select', { class: 'sel', 'aria-label': 'نطاق الإحصائيات', onchange: (e) => { range = e.target.value; loadStats(); } },
      el('option', { value: '24h' }, 'آخر 24 ساعة'), el('option', { value: '7d' }, 'آخر 7 أيام'), el('option', { value: '30d' }, 'آخر 30 يوماً'));

    const tabBtns = (box, items, cur, set) => {
      put(box, ...items.map(([id, label]) =>
        el('button', { type: 'button', class: 'tab' + (cur() === id ? ' on' : ''), onclick: () => { set(id); tabBtns(box, items, cur, set); } }, label)));
    };

    function drawChart() {
      if (!data) return;
      const c = data.chart;
      const series = ctab === 'messages' ? [{ data: c.messages, cls: 'l1' }]
        : ctab === 'active' ? [{ data: c.active, cls: 'l1' }]
        : [{ data: c.joins, cls: 'l1' }, { data: c.leaves, cls: 'l2' }];
      put(chartBody, 
        el('div', { class: 'svgwrap', html: lineSvg(series) }),
        chartLabels(c),
        ctab === 'jl' ? el('div', { class: 'legend', dir: 'rtl' }, el('span', { class: 'k1' }, 'انضمام'), el('span', { class: 'k2' }, 'مغادرة')) : null);
    }
    const chartItems = [['messages', 'الرسائل'], ['active', 'نشاط الأعضاء'], ['jl', 'الإنضمام والمغادرة']];
    const drawChartTabs = () => tabBtns(chartTabs, chartItems, () => ctab, (v) => { ctab = v; drawChart(); });

    async function loadStats() {
      try {
        data = await api(`/api/guild/${gid}?range=${range}`);
      } catch (e) { put(cards, errorBox(loadStats)); return; }
      const s = data.stats;
      put(head, 
        el('div', { class: 'gtitle' }, el('h1', {}, data.guild.name), el('p', { class: 'sub2' }, 'لوحة المراقبة والإحصائيات والنشاط المباشر')),
        el('div', { class: 'gicon' }, guildIcon(data.guild, 64), el('span', { class: 'dot on pos' })));
      put(cards, 
        statCard('users', NF(s.members), 'إجمالي الأعضاء'),
        statCard('activity', NF(s.active), 'الأعضاء النشطين'),
        statCard('chat', NF(s.messages), 'الرسائل الجديدة'),
        statCard('swap', `${NF(s.joins)}/${NF(s.leaves)}`, 'الإنضمام / المغادرة'));
      drawChart();
    }

    const leadItems = [['messages', 'الرسائل'], ['xp', 'XP'], ['invites', 'الدعوات'], ['voice', 'التواجد في الروم']];
    async function loadLeaders() {
      try {
        const { type, list } = await api(`/api/guild/${gid}/leaders?type=${ltab}`);
        if (type !== ltab) return;
        put(leadBody, list.length
          ? list.map((u, i) => el('div', { class: 'lrow' + (u.id === me.id ? ' me' : '') },
              el('span', { class: 'rk' }, '#' + (i + 1)),
              u.avatar ? el('img', { src: u.avatar, alt: '', width: 40, height: 40 }) : el('span', { class: 'fb' }, '؟'),
              el('span', { class: 'nm' }, u.name),
              el('b', {}, type === 'voice' ? fmtMin(u.value) : type === 'xp' ? `${NF(u.value)} XP · مستوى ${u.level}` : NF(u.value))))
          : el('div', { class: 'empty' }, 'لا تتوفر بيانات لعرض المتصدرين.'));
      } catch (e) { put(leadBody, errorBox(loadLeaders)); }
    }
    const drawLeadTabs = () => tabBtns(leadTabs, leadItems, () => ltab, (v) => { ltab = v; loadLeaders(); });

    drawChartTabs(); drawLeadTabs();
    loadStats(); loadLeaders();
    setRefresh(() => { loadStats(); loadLeaders(); });

    return el('div', { class: 'page' },
      botNotice(),
      head,
      el('section', { class: 'panelc rangebar' }, el('span', { class: 'gold2' }, 'عرض الإحصائيات'), sel),
      cards,
      el('section', { class: 'panelc' }, chartTabs, chartBody),
      el('section', { class: 'panelc' }, el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, 'قائمة كبار الأعضاء')), leadTabs, leadBody));
  }

  // ---- صفحة الاشتراكات والبريميوم ----
  const FEATS = [
    ['محرر الإيمبد 10KB', 'زيادة حجم الإيمبد إلى 10KB وتوسيع حقول الإيمبد إلى 25 حقل والنصوص إلى 4000 حرف.'],
    ['الحماية الخاصة المتكاملة', 'تفعيل كامل نظام الحماية الخاصة، حظر الرتب على بعض المستخدمين وحماية الإيموجي والأسطر.'],
    ['سجلات اللوق الحصرية', 'تتبع تغيير الحسابات، مسح الرسائل الجماعي، كتم الصوت، وتخصيص عدة أماكن لإرسال لوق الحذف أو الرياكشن على الرسالة حسب مصدر الشات أو الكاتيجوري.'],
    ['التوبات التلقائية', 'إنشاء عدد غير محدود من التوبات التلقائية بالسيرفر بدلاً من 3 توبات فقط للمجاني.'],
  ];
  const ROWS = [
    ['تخصيص بروفايل البوت (الافتار والبانر)', 'غير متاح (المظهر الافتراضي فقط)', 'متاح بالكامل (تغيير افتار وبانر البوت بشكل مستقل داخل سيرفرك)'],
    ['محرر الإيمبد والرسائل', 'سعة 3.5KB | 10 حقول إيمبد | 1500 حرف', 'سعة ضخمة 10KB | 25 حقل إيمبد | 4000 حرف'],
    ['نظام الحماية الخاصة', 'غير متاح', 'متاح بالكامل (حظر الرتب على المستخدمين + حماية الإيموجي والأسطر)'],
    ['سجلات اللوق المتقدمة', 'سجلات الحذف والتعديل الأساسية فقط', 'سجلات الحسابات، المسح الجماعي، كتم الصوت، وتخصيص واستثناء القنوات'],
    ['التوبات التلقائية', '3 توبات كحد أقصى (وقت الإرسال التلقائي عام فقط)', 'توبات غير محدودة بالكامل + (يمكنك تخصيص وقت الإرسال التلقائي للوقت الذي تريده)'],
    ['تنظيم الرومات التلقائي', '10 رومات كحد أقصى', 'معالجة رومات غير محدودة بالكامل'],
    ['لوحة الرتب القابلة للأخذ', '3 لوحات كحد أقصى', 'لوحات غير محدودة بالكامل'],
    ['رسائل الترحيب والمغادرة', 'رسائل حتى 1500 حرف', 'رسائل موسعة حتى 2000 حرف'],
    ['سرعة الاستجابة والدعم الفني', 'معالجة قياسية ودعم عام', 'أولوية VIP فائقة في التنفيذ + دعم فني مباشر 24/7'],
  ];
  const MONTH = 4.99, YEAR = 49.99;

  function pagePremium(r) {
    const g = r.ctx === 'guild' ? guilds.find((x) => x.id === r.gid) : null;
    let plan = 'month', months = 1;
    const total = el('b', {});
    const monthsOut = el('span', { class: 'mval' });
    const planM = el('div', { class: 'plan', role: 'button', tabindex: '0' });
    const planY = el('div', { class: 'plan', role: 'button', tabindex: '0' });

    const price = () => (plan === 'year' ? YEAR : MONTH * months).toFixed(2);
    function draw() {
      planM.classList.toggle('sel', plan === 'month');
      planY.classList.toggle('sel', plan === 'year');
      monthsOut.textContent = AR(months);
      total.textContent = `$${price()} USD`;
    }
    const step = (d) => (e) => { e.stopPropagation(); plan = 'month'; months = Math.min(11, Math.max(1, months + d)); draw(); };
    const li = (t) => el('li', {}, icon('check', 'goldc'), t);

    planM.append(
      el('h3', {}, 'الخطة الشهرية'), el('p', { class: 'muted' }, 'مرونة عالية واختيار مدة الأشهر'),
      el('div', { class: 'pr' }, el('strong', {}, `$${MONTH}`), ' / شهر'),
      el('div', { class: 'stepper' }, el('button', { type: 'button', onclick: step(-1), 'aria-label': 'أقل' }, '−'), el('span', {}, monthsOut, ' شهر'), el('button', { type: 'button', onclick: step(1), 'aria-label': 'أكثر' }, '+')),
      el('ul', {}, li('سرعة فائقة وأولوية VIP في معالجة الأوامر'), li('سعة إيمبد ضخمة 10KB و 25 حقل'), li('تفعيل كامل للحماية الخاصة وسجلات اللوق الحصرية')));
    planY.append(
      el('span', { class: 'ribbon' }, 'توفير 17%'),
      el('h3', {}, 'الخطة السنوية'), el('p', { class: 'muted' }, 'اشتراك كامل لمدة سنة (12 شهر) بسعر مخفض'),
      el('div', { class: 'pr' }, el('strong', {}, `$${YEAR}`), ' / سنة'),
      el('ul', {}, li('شهران مجاناً عند الاشتراك السنوي'), li('شارة البريميوم الذهبية في بروفايل السيرفر'), li('أولوية الاستجابة في معالجة الأوامر الذكية'), li('دعم فني مباشر وأولوية VIP على مدار الساعة')));
    const pick = (p) => () => { plan = p; draw(); };
    planM.addEventListener('click', pick('month')); planY.addEventListener('click', pick('year'));
    for (const [n, p] of [[planM, 'month'], [planY, 'year']]) n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p)(); } });
    draw();
const coinBox = el('div', {});
async function loadCoin() {
  if (!g) return;
  let c;
  try { c = await api(`/api/guild/${r.gid}/premium/coin`); } catch (e) { return; }
  const label = c.reason === 'no_balance' ? 'رصيدك غير كافٍ'
    : c.reason === 'too_early' ? 'التجديد متاح عندما يتبقى 3 أيام أو أقل'
    : c.active ? 'تجديد الاشتراك الآن' : 'اشترك الآن';
  const btn = el('button', {
    class: 'btn primary wide', type: 'button', disabled: !!c.reason,
    onclick: async () => {
      if (!confirm(`سيتم خصم ${NF(c.price)} ${c.currency} من رصيدك. متأكد؟`)) return;
      btn.disabled = true;
      try {
        const j = await apiSend('POST', `/api/guild/${r.gid}/premium/coin`);
        g.premium = true; g.premiumUntil = j.until;
        alert('تم تفعيل البريميوم ✅');
        route();
      } catch (e) {
        const m = { no_balance: 'رصيدك غير كافٍ.', too_early: 'التجديد متاح عندما يتبقى 3 أيام أو أقل.' };
        alert(m[e.code] || errText(e));
        loadCoin();
      }
    },
  }, c.reason === 'no_balance' ? icon('alert') : null, label);
  put(coinBox, el('section', { class: 'panelc' },
    el('div', { class: 'btnrow' },
      el('span', { class: 'pbadge' }, icon('coin'), `الدفع الفوري بعملة ${c.currency}`),
      el('span', { class: 'pbadge' }, `اشتراك شهر واحد فقط (${AR(c.days)} يوماً)`)),
    el('h2', { class: 'h2' }, `الاشتراك عبر عملة ${c.currency} `, icon('star', 'goldc')),
    el('p', { class: 'muted' }, `يمكنك ترقية أو تجديد سيرفرك المميز مباشرة برصيدك الافتراضي. التجديد متاح حصرياً عندما يتبقى 3 أيام أو أقل على انتهاء الاشتراك الحالي، أو بعد انتهائه.`),
    el('div', { class: 'btnrow' },
      el('span', { class: 'chip' }, `رصيدك الحالي: ${NF(c.balance)} ${c.currency}`),
      el('span', { class: 'chip' }, `التكلفة: ${NF(c.price)} ${c.currency} / شهر`)),
    btn));
}
loadCoin();
    const subsBox = el('div', {});
    let subsOpen = false;
    async function toggleSubs() {
      subsOpen = !subsOpen;
      if (!subsOpen) return put(subsBox, );
      try {
        const list = await api('/api/subscriptions');
        put(subsBox, el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, 'سجل الاشتراكات')),
          list.length
            ? list.map((s) => el('div', { class: 'arow col' },
                el('span', {}, s.name, ' — ', s.active ? 'مفعّل' : 'منتهي'),
                el('small', { class: 'muted' }, s.history.map((h) => `${fmtDate(h.start)} ← ${fmtDate(h.end)} (${AR(h.days)} يوم)`).join(' • '))))
            : el('div', { class: 'empty' }, 'لا توجد اشتراكات مسجلة حتى الآن.')));
      } catch (e) { put(subsBox, errorBox(() => { subsOpen = false; toggleSubs(); })); }
    }

    return el('div', { class: 'page' },
      el('p', { class: 'eyebrow' }, 'نظام إدارة الاشتراكات'),
      el('h1', { class: 'greet' }, 'خطط واشتراكات OPS System'),
      g ? el('div', { class: 'status' }, el('span', { class: 'dot ' + (g.premium ? 'on' : 'off') }),
          g.premium ? `البريميوم مفعّل لسيرفر ${g.name} حتى ${fmtDate(g.premiumUntil)}` : `البريميوم غير مفعّل لسيرفر ${g.name}`) : null,
      el('div', { class: 'rowbar' },
        el('h2', { class: 'h2' }, 'دليل المزايا والاشتراكات'),
        el('button', { class: 'btn ghost small', type: 'button', onclick: toggleSubs }, 'سجل الاشتراكات')),
      subsBox,
      el('p', { class: 'lead' }, 'استكشف كافة الفروقات والمزايا الحصرية المتاحة عند ترقية سيرفرك إلى عضوية OPS Premium للاستفادة من كامل قدرات النظام بدون حدود.'),
      el('div', { class: 'featgrid' }, FEATS.map(([t, d]) => el('div', { class: 'fcard' }, el('h3', {}, t), el('p', { class: 'muted' }, d)))),
      el('section', { class: 'panelc' },
        el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, 'مقارنة شاملة بين النسخة المجانية والبريميوم')),
        el('div', { class: 'tblwrap' }, el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, el('th', {}, 'الميزة / الوحدة'), el('th', {}, 'النسخة المجانية (Free)'), el('th', { class: 'goldc' }, 'النسخة البريميوم (OPS Premium)'))),
          el('tbody', {}, ROWS.map(([a, b, c]) => el('tr', {}, el('td', {}, a), el('td', { class: 'muted' }, b), el('td', {}, c))))))),
      g ? coinBox : null,
      el('section', { class: 'panelc' },
        el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, 'اختر الخطة')),
        el('div', { class: 'plans' }, planM, planY),
        el('div', { class: 'totalrow' }, el('span', {}, 'إجمالي السعر للباقة المختارة:'), total),
        el('a', { class: 'btn primary wide', href: me.supportUrl, target: '_blank', rel: 'noopener' }, 'فتح تذكرة الشراء بالدسكورد'),
        el('p', { class: 'fine' }, 'بالنقر على «فتح تذكرة الشراء» فإنك توافق على شروط الاستخدام، شروط الاسترجاع وسياسة الخصوصية.')),
      el('section', { class: 'panelc' },
        el('h3', {}, 'طريقة التفعيل والإدارة الرسمية:'),
        el('p', { class: 'muted' }, 'يتم تفعيل اشتراك OPS Premium للسيرفر المحدد فور طلب الشراء عبر تذاكر الدعم الفني الرسمية في سيرفر الدسكورد. تبقى جميع المزايا مفعلة ومحفوظة طوال فترة الاشتراك.')));
  }

  // ===== صفحات: بروفايل البوت + الحماية =====
  const secOpen = {};
  const ERRS = {
    premium_required: 'هذه الميزة تتطلب اشتراك بريميوم نشط بالسيرفر.',
    forbidden: 'ليست لديك صلاحية إدارة هذا السيرفر.',
    owner_only: 'هذا الإجراء متاح لمالك السيرفر فقط.',
    bad_image: 'صيغة الصورة غير مدعومة (PNG, JPG, WebP, GIF).',
    too_large: 'حجم الصورة أكبر من الحد المسموح.',
    bad_nick: 'اللقب طويل (الحد 32 حرف).',
    bad_user_id: 'ايدي المستخدم غير صحيح.',
    user_not_found: 'لم يتم العثور على المستخدم.',
    list_full: 'القائمة البيضاء ممتلئة (الحد 50).',
    bad_value: 'القيمة المدخلة غير صحيحة.',
    bad_name: 'اكتب اسماً للقاعدة.',
    bad_limits: 'قيم الحدود غير صحيحة.',
    bad_channel: 'القناة غير صالحة.',
    nothing_to_update: 'لا يوجد تغيير لحفظه.',
  };
  const errText = (e) =>
  e.code === 'server_error' && e.detail ? 'خطأ بالسيرفر: ' + e.detail
  : e.code === 'discord_error' && e.detail ? 'رفض ديسكورد الطلب: ' + e.detail
  : e.code === 'alias_taken' && e.detail ? `الاختصار "${e.detail}" مستخدم لأمر آخر أو يطابق اسم أمر أساسي.`
  : ERRS[e.code] || 'حدث خطأ، حاول مرة أخرى.';
  async function apiSend(method, path, body) {
    const r = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (r.status === 401) { location.href = '/'; throw new Error('auth'); }
    let j = {};
    try { j = await r.json(); } catch (_) {}
    if (!r.ok) {
      const e = new Error(j.error || 'http ' + r.status);
      e.code = r.status === 413 ? 'too_large' : j.error;
      e.detail = j.detail;
      throw e;
    }
    return j;
  }

  function flasher() {
    const n = el('div', { class: 'flash', role: 'status' });
    let t;
    n.show = (text, ok = true) => {
      clearTimeout(t);
      n.textContent = text;
      n.className = 'flash show ' + (ok ? 'ok' : 'bad');
      t = setTimeout(() => { n.className = 'flash'; }, 5000);
    };
    return n;
  }

  const toggle = (on, onchange, disabled) => {
    const b = el('button', { type: 'button', class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), disabled }, el('i'));
    b.addEventListener('click', () => {
      const v = !b.classList.contains('on');
      b.classList.toggle('on', v);
      b.setAttribute('aria-checked', String(v));
      onchange(v);
    });
    return b;
  };

  const pageSoon = (title) =>
    el('div', { class: 'page' },
      el('h1', { class: 'greet' }, title),
      el('div', { class: 'empty' }, el('p', {}, 'هذه الصفحة قيد التجهيز، منكملها بالخطوة الجاية 🚧')));

  const lockBox = (gid) =>
    el('div', { class: 'lockbox' },
      el('div', { class: 'phd' }, icon('crown', 'goldc'), el('h2', {}, 'هذه الميزة تتطلب اشتراك بريميوم نشط بالسيرفر')),
      el('p', { class: 'muted' }, 'قم بترقية السيرفر لتفعيل ميزة بروفايل البوت المخصص وإمكانية تغيير الافتار والبانر بشكل مستقل.'),
      el('a', { class: 'btn primary small', href: `#/g/${gid}/premium` }, 'ترقية إلى البريميوم'));

  const IMG_OK = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  function readImage(file, maxMB) {
    return new Promise((resolve, reject) => {
      if (!IMG_OK.includes(file.type)) return reject(Object.assign(new Error('bad'), { code: 'bad_image' }));
      if (file.size > maxMB * 1048576) return reject(Object.assign(new Error('big'), { code: 'too_large' }));
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(Object.assign(new Error('read'), { code: 'bad_image' }));
      fr.readAsDataURL(file);
    });
  }

  // ---- بروفايل البوت ----
  function pageBotProfile(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null;
    const pend = { avatar: undefined, banner: undefined }; // undefined = بدون تغيير، null = رجوع للافتراضي، نص = صورة جديدة

    async function load() {
      try { d = await api(`/api/guild/${gid}/botprofile`); } catch (e) { put(box, errorBox(load)); return; }
      pend.avatar = undefined; pend.banner = undefined;
      build();
    }

    function build() {
      const locked = !d.premium || !d.canManage;
      const curAvatar = () => (pend.avatar === null ? null : pend.avatar || d.avatar);
      const curBanner = () => (pend.banner === null ? null : pend.banner || d.banner);

      const pvBanner = el('div', { class: 'pv-banner' });
      const pvAv = el('img', { class: 'pv-av', alt: '', width: 84, height: 84 });
      const pvName = el('div', { class: 'pv-name' });
      const nickIn = el('input', { class: 'inp', type: 'text', maxlength: 32, value: d.nick, placeholder: d.bot.name, disabled: locked, 'aria-label': 'لقب البوت' });
      const count = el('small', { class: 'muted' });
      const avState = el('span', { class: 'chip' });
      const bnState = el('span', { class: 'chip' });
      const avThumb = el('img', { class: 'thumb', alt: '', width: 64, height: 64 });
      const bnThumb = el('div', { class: 'thumb wide' });

      const stateText = (p, saved) =>
        p === undefined ? (saved ? 'مخصص' : 'المظهر الافتراضي') : p === null ? 'سيرجع للافتراضي (غير محفوظ)' : 'صورة جديدة (غير محفوظة)';

      function refresh() {
        const a = curAvatar(), b = curBanner();
        pvAv.src = a || d.bot.avatar;
        avThumb.src = a || d.bot.avatar;
        pvBanner.style.backgroundImage = b ? `url("${b}")` : '';
        bnThumb.style.backgroundImage = b ? `url("${b}")` : '';
        avState.textContent = stateText(pend.avatar, d.avatar);
        bnState.textContent = stateText(pend.banner, d.banner);
        pvName.textContent = nickIn.value.trim() || d.bot.name;
        count.textContent = `${nickIn.value.length}/32`;
      }
      nickIn.addEventListener('input', refresh);

      const picker = (key, maxMB, label) => {
        const inp = el('input', { type: 'file', accept: IMG_OK.join(','), class: 'hidden' });
        inp.addEventListener('change', async () => {
          const f = inp.files[0];
          inp.value = '';
          if (!f) return;
          try { pend[key] = await readImage(f, maxMB); refresh(); }
          catch (e) { fl.show(`${errText(e)} (الحد الأقصى ${maxMB}MB)`, false); }
        });
        const open = () => inp.click();
        return el('div', { class: 'btnrow' }, inp,
          el('button', { class: 'btn ghost small', type: 'button', disabled: locked, onclick: open }, icon('upload'), label),
          el('button', { class: 'btn ghost small', type: 'button', disabled: locked, onclick: open }, 'اختيار من المعرض'),
          el('button', { class: 'btn ghost small danger', type: 'button', disabled: locked, onclick: () => { pend[key] = null; refresh(); } }, 'إزالة'));
      };

      const saveBtn = el('button', { class: 'btn primary wide', type: 'button', disabled: locked, onclick: () => save() }, 'حفظ وتطبيق التغييرات مباشرة');
      async function save() {
        const body = {};
        if (nickIn.value.trim() !== (d.nick || '')) body.nick = nickIn.value.trim();
        if (pend.avatar !== undefined) body.avatar = pend.avatar;
        if (pend.banner !== undefined) body.banner = pend.banner;
        saveBtn.disabled = true;
        try {
          await apiSend('POST', `/api/guild/${gid}/botprofile`, body);
          fl.show('تم حفظ وتطبيق التغييرات ✅');
          await load();
        } catch (e) { fl.show(errText(e), false); saveBtn.disabled = false; }
      }
      async function reset() {
        if (!confirm('استعادة المظهر الافتراضي للبوت في هذا السيرفر؟')) return;
        try { await apiSend('POST', `/api/guild/${gid}/botprofile`, { reset: true }); fl.show('تمت استعادة المظهر الافتراضي'); await load(); }
        catch (e) { fl.show(errText(e), false); }
      }

      put(box,
        el('p', { class: 'eyebrow' }, 'OPS SYSTEM · Bot Customization Module'),
        el('div', { class: 'rowbar' },
          el('h1', { class: 'greet' }, 'بروفايل البوت بالسيرفر ', el('span', { class: 'tag' }, 'بريميوم')),
          el('button', { class: 'btn ghost small', type: 'button', disabled: locked, onclick: reset }, 'استعادة المظهر الافتراضي')),
        el('p', { class: 'lead' }, `تخصيص افتار وبانر البوت واسمه المستعار داخل سيرفر ${d.guildName}`),
        fl,
        !d.premium ? lockBox(gid) : !d.canManage ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل البروفايل.') : null,
        el('div', { class: 'split' },
          el('div', { class: 'stack' },
            el('section', { class: 'panelc' },
              el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('div', {}, el('h2', {}, 'صورة الافتار (Avatar)'), el('small', { class: 'muted' }, 'الصورة الرمزية للبوت داخل هذا السيرفر'))),
              el('div', { class: 'assetrow' }, avThumb, avState),
              el('p', { class: 'fine start' }, 'المقاييس: 1:1 مربع (يوصى بـ 512×512 أو 1024×1024، الحد الأقصى 5MB)'),
              el('p', { class: 'fine start' }, 'الصيغ المدعومة: PNG, JPG, WebP, GIF (متحرك)'),
              picker('avatar', 5, 'رفع افتار من جهازك')),
            el('section', { class: 'panelc' },
              el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('div', {}, el('h2', {}, 'بانر البروفايل (Banner)'), el('small', { class: 'muted' }, 'صورة الخلفية العريضة لبطاقة البوت'))),
              el('div', { class: 'assetrow' }, bnThumb, bnState),
              el('p', { class: 'fine start' }, 'المقاييس: 16:9 عريض (يوصى بـ 960×540 أو 1024×576px، الحد الأقصى 8MB)'),
              el('p', { class: 'fine start' }, 'الصيغ المدعومة: PNG, JPG, WebP, GIF (متحرك)'),
              picker('banner', 8, 'رفع بانر من جهازك')),
            el('section', { class: 'panelc' },
              el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, 'لقب البوت داخل السيرفر (Nickname)'), count),
              nickIn),
            el('p', { class: 'fine start' }, 'يُمنع منعاً باتاً استخدام أي صور خادشة للحياء أو مخالفة لسياسات ديسكورد العامة (NSFW/Gore/Hate). يتم توثيق معرف المستخدم وتاريخ الرفع رسمياً، وتؤدي أي مخالفة لحظر الحساب والسيرفر بشكل فوري.'),
            saveBtn),
          el('section', { class: 'panelc preview' },
            el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, 'المعاينة الحية لبروفايل البوت')),
            el('div', { class: 'pv' },
              el('div', { class: 'pv-top' }, 'ديسكورد'),
              pvBanner,
              el('div', { class: 'pv-body' }, pvAv, pvName, el('div', { class: 'pv-tag' }, d.bot.tag),
                el('div', { class: 'pv-srv' }, 'السيرفر المفعل فيه التخصيص: ', el('b', {}, d.guildName)))))));
      refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }

  // ---- الحماية الذكية ----
  const LIMITS = [
    ['ban', 'الحد الاعلى للباند', 'عدد عمليات الحظر المسموحة'],
    ['kick', 'الحد الاعلى للطرد', 'عدد عمليات الطرد المسموحة'],
    ['channels', 'الحد الاعلى للرومات', '(تعديل / انشاء / حذف)'],
    ['roles', 'الحد الاعلى للرتب', '(تعديل / انشاء / حذف)'],
    ['memberRoles', 'إدارة رتب الأعضاء', '(إعطاء / سحب)'],
  ];
  const ACTION_OPTS = [
    ['strip', 'سحب الرتب الإدارية من العضو (ينصح به)'],
    ['kick', 'طرد العضو'],
    ['ban', 'حظر العضو'],
    ['log', 'تسجيل في اللوق فقط'],
  ];

  function pageSmart(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, tab = 'perm';

    async function load() {
      try { d = await api(`/api/guild/${gid}/security/smart`); } catch (e) { put(box, errorBox(load)); return; }
      build();
    }

    function build() {
      const ro = !d.canManage;
      const form = {};

      const limitCards = LIMITS.map(([k, title, sub]) => {
        const cur = d.limits[k];
        const num = el('input', { class: 'inp num', type: 'number', min: 1, max: 100, value: cur.max, disabled: ro, 'aria-label': title });
        const act = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'الاجراء المتخذ' },
          ACTION_OPTS.map(([v, t]) => el('option', { value: v, selected: v === cur.action }, t)));
        form[k] = { num, act };
        return el('div', { class: 'limit' },
          el('div', { class: 'lhead' }, el('div', {}, el('b', {}, title), el('small', { class: 'muted' }, sub)), num),
          el('label', { class: 'flabel' }, 'الاجراء المتخذ'), act);
      });

      const chSel = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'قناة اللوق' },
        el('option', { value: '' }, 'اختر القناة...'),
        d.channels.map((c) => el('option', { value: c.id, selected: c.id === d.logChannel }, '# ' + c.name)));

      const wlBox = el('div', {});
      const wlIn = el('input', { class: 'inp', type: 'text', inputmode: 'numeric', placeholder: 'ايدي العضو (User ID)', disabled: !d.isOwner, 'aria-label': 'ايدي العضو' });
      function drawWl(list) {
        put(wlBox, list.length
          ? list.map((u) => el('div', { class: 'lrow' },
              u.avatar ? el('img', { src: u.avatar, alt: '', width: 40, height: 40 }) : el('span', { class: 'fb' }, '؟'),
              el('span', { class: 'nm' }, u.name, el('small', { class: 'muted' }, u.id)),
              d.isOwner ? el('button', { class: 'btn ghost small danger', type: 'button', 'aria-label': 'إزالة', onclick: () => rmWl(u.id) }, icon('trash')) : null))
          : el('div', { class: 'empty' }, 'القائمة فارغة'));
      }
      async function addWl() {
        const id = wlIn.value.trim();
        if (!id) return;
        try { const j = await apiSend('POST', `/api/guild/${gid}/security/smart/whitelist`, { id }); wlIn.value = ''; drawWl(j.whitelist); }
        catch (e) { fl.show(errText(e), false); }
      }
      async function rmWl(id) {
        try { const j = await apiSend('DELETE', `/api/guild/${gid}/security/smart/whitelist/${id}`); drawWl(j.whitelist); }
        catch (e) { fl.show(errText(e), false); }
      }

      const sw = toggle(d.enabled, async (v) => {
        try { await apiSend('PUT', `/api/guild/${gid}/security/smart`, { enabled: v }); fl.show(v ? 'تم تفعيل الحدود' : 'تم تعطيل الحدود'); }
        catch (e) { fl.show(errText(e), false); sw.classList.toggle('on', !v); sw.setAttribute('aria-checked', String(!v)); }
      }, ro);

      async function save() {
        const limits = {};
        for (const [k] of LIMITS) limits[k] = { max: parseInt(form[k].num.value, 10), action: form[k].act.value };
        try { await apiSend('PUT', `/api/guild/${gid}/security/smart`, { limits, logChannel: chSel.value || null }); fl.show('تم حفظ إعدادات الحماية ✅'); }
        catch (e) { fl.show(errText(e), false); }
      }

      const permPane = el('div', { class: 'stack' },
        el('div', { class: 'chip' }, 'الكل (@everyone)'),
        el('div', { class: 'limits' }, limitCards),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, 'لوق تجاوز الحدود')), chSel),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, 'القائمة البيضاء (Whitelist)')),
          d.isOwner ? el('div', { class: 'btnrow' }, wlIn, el('button', { class: 'btn ghost small', type: 'button', onclick: addWl }, icon('plus'), 'إضافة')) : el('p', { class: 'fine start' }, 'تعديل القائمة البيضاء متاح لمالك السيرفر فقط.'),
          wlBox),
        el('button', { class: 'btn primary wide', type: 'button', disabled: ro, onclick: save }, 'حفظ الإعدادات'));
      const CL = [['mute', 'الميوت الكتابي'], ['vmute', 'الميوت الصوتي'], ['prison', 'السجن'], ['timeout', 'التايم اوت'], ['kick', 'الطرد'], ['ban', 'الباند'], ['role', 'إعطاء / سحب رتبة']];
      const clForm = {};
      const clRows = CL.map(([k, t]) => {
        const inp = el('input', { type: 'number', min: 1, max: 100, value: d.cmdLimits[k], disabled: ro, 'aria-label': t });
        const set = (v) => { v = Math.max(1, Math.min(100, Math.round(Number(v)) || 1)); inp.value = v; };
        inp.addEventListener('change', () => set(inp.value));
        clForm[k] = inp;
        return el('div', { class: 'clrow' }, el('b', {}, t),
          el('div', { class: 'nstep' },
            el('button', { type: 'button', disabled: ro, 'aria-label': 'زيادة', onclick: () => set(Number(inp.value) + 1) }, '+'),
            inp,
            el('button', { type: 'button', disabled: ro, 'aria-label': 'نقصان', onclick: () => set(Number(inp.value) - 1) }, '−')));
      });
      const clAct = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'الاجراء' },
        [['strip', 'سحب الرتب الإدارية الخاصة بالأوامر من هذا المسؤول'], ['stripAll', 'سحب جميع رتب هذا العضو بالكامل']]
          .map(([v, t]) => el('option', { value: v, selected: v === d.cmdAction }, t)));
      async function saveCl() {
        const cmdLimits = {};
        for (const [k] of CL) cmdLimits[k] = parseInt(clForm[k].value, 10);
        try { await apiSend('PUT', `/api/guild/${gid}/security/smart`, { cmdLimits, cmdAction: clAct.value }); fl.show('تم حفظ حدود الأوامر ✅'); }
        catch (e) { fl.show(errText(e), false); }
      }
      const cmdPane = el('div', { class: 'stack hidden' },
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('shield')), el('h2', {}, 'أوامر البريفكس الادارية')),
          clRows,
          el('p', { class: 'fine start' }, '⚠️ عند تجاوز الحدود المسموحة لأي من الأوامر المذكورة خلال 60 ثانية، سيتم تطبيق هذا الاجراء:'),
          clAct),
        el('button', { class: 'btn primary wide', type: 'button', disabled: ro, onclick: saveCl }, 'حفظ الإعدادات'));

      const tabsBox = el('div', { class: 'tabs' });
      const items = [['perm', 'حدود الصلاحيات'], ['cmd', 'حدود الاوامر']];
      function drawTabs() {
        put(tabsBox, items.map(([id, l]) => el('button', {
          type: 'button', class: 'tab' + (tab === id ? ' on' : ''),
          onclick: () => { tab = id; permPane.classList.toggle('hidden', tab !== 'perm'); cmdPane.classList.toggle('hidden', tab !== 'cmd'); drawTabs(); },
        }, l)));
      }

      put(box,
        el('p', { class: 'eyebrow' }, 'OPS SYSTEM · Security Module'),
        el('h1', { class: 'greet' }, 'الحماية الذكية'),
        el('p', { class: 'lead' }, 'تكوين نظام الحماية التلقائي ضد التخريب (Anti-Nuke/Raid).'),
        fl,
        el('div', { class: 'notice show' }, 'محرك الحماية شغّال: لو تجاوز العضو الحد خلال 60 ثانية بينفّذ عليه الإجراء المختار وبيرسل التقرير للوق. يحتاج البوت صلاحية «عرض سجل التدقيق» ورتبته فوق رتب المنفّذ.'),
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' },
            el('div', {}, el('h2', {}, 'تفعيل الحدود'), el('small', { class: 'muted' }, 'مراقبة الأنشطة المشبوهة والتصرف تلقائياً')),
            sw)),
        tabsBox, permPane, cmdPane);
      drawTabs();
      drawWl(d.whitelist);
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }

  // ---- الحماية العامة (Discord AutoMod) ----
  const AM_LABEL = { 1: 'كلمات / روابط ممنوعة', 3: 'سبام', 4: 'قائمة كلمات جاهزة', 5: 'سبام المنشن', 6: 'بروفايل الأعضاء' };
  const AM_KINDS = [
    ['keywords', 'كلمات ممنوعة', 'اكتب الكلمات مفصولة بفاصلة أو سطر جديد'],
    ['links', 'روابط / دومينات ممنوعة', 'مثال: discord.gg, bit.ly'],
    ['mention', 'سبام المنشن', 'أقصى عدد منشن بالرسالة (1-50)'],
    ['spam', 'سبام عام (من ديسكورد)', ''],
  ];

  function pageGeneral(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    const listBox = el('div', {});
    const formBox = el('div', {});
    let open = false;

    const ruleRow = (rule) => {
      const sw = toggle(rule.enabled, async (v) => {
        try { await apiSend('PATCH', `/api/guild/${gid}/automod/${rule.id}`, { enabled: v }); }
        catch (e) { fl.show(errText(e), false); sw.classList.toggle('on', !v); sw.setAttribute('aria-checked', String(!v)); }
      }, false);
      return el('div', { class: 'rule' },
        el('div', { class: 'rinfo' }, el('b', {}, rule.name),
          el('small', { class: 'muted' }, `${AM_LABEL[rule.type] || 'قاعدة'}${rule.mentionLimit ? ' · ' + rule.mentionLimit + ' منشن' : ''} · ${rule.actions} إجراءات`)),
        sw,
        el('button', {
          class: 'btn ghost small danger', type: 'button', 'aria-label': 'حذف القاعدة',
          onclick: async () => {
            if (!confirm('حذف القاعدة "' + rule.name + '"؟')) return;
            try { await apiSend('DELETE', `/api/guild/${gid}/automod/${rule.id}`); fl.show('تم حذف القاعدة'); loadRules(); }
            catch (e) { fl.show(errText(e), false); }
          },
        }, icon('trash')));
    };

    async function loadRules() {
      try {
        const j = await api(`/api/guild/${gid}/automod`);
        put(listBox, j.rules.length ? j.rules.map(ruleRow) : el('div', { class: 'empty' }, 'لا توجد قواعد حماية بعد.'));
      } catch (e) { put(listBox, errorBox(loadRules)); }
    }

    function drawForm() {
      if (!open) { put(formBox); return; }
      const name = el('input', { class: 'inp', type: 'text', maxlength: 100, placeholder: 'اسم القاعدة', 'aria-label': 'اسم القاعدة' });
      const kind = el('select', { class: 'sel full', 'aria-label': 'نوع القاعدة' }, AM_KINDS.map(([v, t]) => el('option', { value: v }, t)));
      const val = el('textarea', { class: 'inp', rows: 3, 'aria-label': 'القيمة' });
      const sync = () => {
        const k = AM_KINDS.find((x) => x[0] === kind.value);
        val.placeholder = k[2];
        val.classList.toggle('hidden', kind.value === 'spam');
      };
      kind.addEventListener('change', sync);
      sync();
      put(formBox, el('section', { class: 'panelc' }, name, kind, val,
        el('button', {
          class: 'btn primary', type: 'button',
          onclick: async () => {
            try {
              await apiSend('POST', `/api/guild/${gid}/automod`, { name: name.value, kind: kind.value, value: val.value });
              fl.show('تم إنشاء القاعدة ✅'); open = false; drawForm(); loadRules();
            } catch (e) { fl.show(errText(e), false); }
          },
        }, 'إنشاء')));
    }

    put(box,
      el('p', { class: 'eyebrow' }, 'OPS SYSTEM · Security Module'),
      el('h1', { class: 'greet' }, 'إعدادات الأمان'),
      el('p', { class: 'lead' }, 'إدارة تصفية المحتوى وحماية السيرفر بشكل تلقائي'),
      fl,
      el('section', { class: 'panelc' },
        el('div', { class: 'rowbar' },
          el('div', {}, el('h2', {}, 'قواعد الحماية التلقائية'), el('small', { class: 'muted' }, 'تحكم في المحتوى المحظور والروابط الممنوعة باستخدام نظام Discord AutoMod')),
          el('button', { class: 'btn primary small', type: 'button', onclick: () => { open = !open; drawForm(); } }, icon('plus'), 'إنشاء قاعدة جديدة')),
        formBox, listBox));
    put(listBox, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    loadRules();
    return box;
  }

  // ===== إدارة الأوامر + حماية الصور =====
  Object.assign(ERRS, {
    bad_alias: 'الاختصار غير صالح (بدون مسافات، حتى 20 حرف، وبحد أقصى 10 اختصارات).',
    alias_taken: 'هذا الاختصار مستخدم لأمر آخر.',
    duplicate: 'هذه الصورة موجودة بالمكتبة.',
    not_found: 'العنصر غير موجود.',
  });

  // قائمة اختيار متعدد (رتب / شاتات)
  function multiPick(items, selected, placeholder, disabled, onChange) {
    const sel = new Set(selected);
    let open = false;
    const dot = (c) => el('i', { class: 'cdot', style: 'background:' + (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#99aab5') });
    const chips = el('span', { class: 'mp-chips' });
    const chev = icon('chevron', 'chev');
    const q = el('input', { class: 'inp', type: 'search', placeholder: 'بحث...', 'aria-label': 'بحث' });
    const opts = el('div', { class: 'mp-opts' });
    const list = el('div', { class: 'mp-list hidden' }, q, opts);
    const head = el('button', { type: 'button', class: 'mp-head', disabled, 'aria-expanded': 'false' }, chips, chev);
    const find = (id) => items.find((x) => x.id === id);
    function drawChips() {
      put(chips, sel.size
        ? [...sel].map((id) => { const it = find(id); return el('span', { class: 'mchip' }, it && it.color ? dot(it.color) : null, it ? it.name : id); })
        : el('span', { class: 'muted' }, placeholder));
    }
    function drawOpts() {
      const t = q.value.trim().toLowerCase();
      put(opts, items.filter((it) => !t || it.name.toLowerCase().includes(t)).map((it) =>
        el('button', {
          type: 'button', class: 'mp-opt' + (sel.has(it.id) ? ' on' : ''),
          onclick: () => { if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id); drawChips(); drawOpts(); onChange([...sel]); },
        }, it.color ? dot(it.color) : null, el('span', {}, it.name), sel.has(it.id) ? icon('check', 'goldc') : null)));
    }
    head.addEventListener('click', () => {
      open = !open;
      list.classList.toggle('hidden', !open);
      chev.classList.toggle('up', open);
      head.setAttribute('aria-expanded', String(open));
      if (open) q.focus();
    });
    q.addEventListener('input', drawOpts);
    drawChips(); drawOpts();
    return el('div', { class: 'mp' }, head, list);
  }

  // ---- إدارة الأوامر (التعديلات تنحفظ بدفعة وحدة عند الضغط على "حفظ الإعدادات") ----
  const CAT_TITLE = { admin: 'الأوامر الإدارية', general: 'الأوامر العامة', roles: 'أوامر الرولات', security: 'أوامر الحماية', settings: 'أوامر الإعدادات', chat: 'أوامر الشات', colors: 'أوامر الألوان' };
  const normA = (s) => { const a = String(s || '').trim().toLowerCase(); return a && a.length <= 20 && !/[\s@#<>]/.test(a) ? a : null; };

  function pageCommands(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    const openSet = new Set();
    const clone = (c) => JSON.parse(JSON.stringify(c));
    const srt = (a) => [...a].sort();
    const snap = (c) => JSON.stringify([c.enabled, srt(c.allowRoles), srt(c.blockRoles), srt(c.allowChannels), srt(c.blockChannels), srt(c.aliases), c.pen || null, c.wr || null]);    let d = null, base = {};
    let refreshBar = () => {};
    const changed = () => d.cmds.filter((c) => snap(c) !== snap(base[c.name]));

    async function load() {
      try { d = await api(`/api/guild/${gid}/commands?cat=${r.cat}`); } catch (e) { put(box, errorBox(load)); return; }
      base = {};
      d.cmds.forEach((c) => { base[c.name] = clone(c); });
      build();
    }
    function penEditor(c, ro) {
      const p = c.pen;
      const UN = [['s', 'ثانية'], ['m', 'دقيقة'], ['h', 'ساعة'], ['d', 'يوم']];
      const tabs = el('div', { class: 'mtabs' });
      const pane = el('div', { class: 'stack' });
      const timeRow = (t, onChange) => {
        const n = el('input', { class: 'inp num', type: 'number', min: 0, max: 9999, value: t.n, disabled: ro, 'aria-label': 'المدة' });
        const u = el('select', { class: 'sel', disabled: ro, 'aria-label': 'الوحدة' }, UN.map(([v, l]) => el('option', { value: v, selected: v === t.u }, l)));
        n.addEventListener('input', () => { t.n = Math.max(0, Math.floor(Number(n.value) || 0)); onChange(); });
        u.addEventListener('change', () => { t.u = u.value; onChange(); });
        return [n, u];
      };
      const draw = () => {
        put(tabs, [['default', 'وقت افتراضي'], ['reasons', 'قائمة الأسباب']].map(([k, l]) =>
          el('button', { type: 'button', class: 'mtab' + (p.mode === k ? ' on' : ''), disabled: ro, onclick: () => { p.mode = k; draw(); refreshBar(); } }, l)));
        if (p.mode === 'default') {
          put(pane, el('div', { class: 'flabel' }, 'الوقت الافتراضي (0 = دائم)'), el('div', { class: 'penrow' }, timeRow(p.time, refreshBar)));
          return;
        }
        const rIn = el('input', { class: 'inp', type: 'text', maxlength: 100, placeholder: 'السبب (مثال: سب وشتم)', disabled: ro, 'aria-label': 'السبب' });
        const nt = { n: 1, u: 'h' };
        const add = () => {
          const t = rIn.value.trim();
          if (!t) return;
          if (p.reasons.length >= 25) return fl.show('الحد الأقصى 25 سبب.', false);
          p.reasons.push({ text: t, n: nt.n, u: nt.u });
          draw(); refreshBar();
        };
        rIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
        put(pane,
          el('span', { class: 'chip' }, `25 / ${p.reasons.length}`),
          p.reasons.map((r, i) => el('div', { class: 'penrow' },
            el('b', {}, r.text), timeRow(r, refreshBar),
            el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف', onclick: () => { p.reasons.splice(i, 1); draw(); refreshBar(); } }, icon('trash')))),
          el('div', { class: 'penrow' }, rIn, timeRow(nt, () => {}),
            el('button', { class: 'plus', type: 'button', disabled: ro, 'aria-label': 'إضافة', onclick: add }, icon('plus'))));
      };
      draw();
      return el('div', { class: 'stack' }, tabs, pane);
    }
    function aliasEditor(c, ro) {
      const row = el('div', { class: 'chips' });
      const inp = el('input', { class: 'inp', type: 'text', maxlength: 20, placeholder: 'أضف اختصار جديد (مثال: امسح)...', disabled: ro, 'aria-label': 'اختصار جديد' });
      const draw = () => put(row, c.aliases.map((a) =>
        el('span', { class: 'achip' }, el('b', { dir: 'auto' }, a),
          el('button', { type: 'button', class: 'x', 'aria-label': 'إزالة', disabled: ro, onclick: () => { c.aliases = c.aliases.filter((x) => x !== a); draw(); refreshBar(); } }, '×'))));
      function add() {
        if (!inp.value.trim()) return;
        const v = normA(inp.value);
        if (!v) return fl.show('الاختصار غير صالح (كلمة وحدة بدون مسافات، حتى 20 حرف).', false);
        if (c.aliases.includes(v)) { inp.value = ''; return; }
        if (c.aliases.length >= 10) return fl.show('الحد الأقصى 10 اختصارات.', false);
        const clash = d.cmds.find((x) => x.name !== c.name && x.aliases.includes(v));
        if (clash) return fl.show(`الاختصار "${v}" مستخدم للأمر ${clash.name}!`, false);
        c.aliases = [...c.aliases, v];
        inp.value = '';
        draw(); refreshBar();
      }
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      draw();
      return el('div', { class: 'stack' }, row,
        el('div', { class: 'addrow' }, inp, el('button', { class: 'plus', type: 'button', disabled: ro, 'aria-label': 'إضافة', onclick: add }, icon('plus'))),
        el('small', { class: 'muted' }, `الأمر يشتغل دايماً بالاسم الأساسي ${c.name}! وكمان بأي اختصار تضيفه (بدون علامة !). لازم تضغط حفظ الإعدادات.`));
    }
    function warnEditor(c, ro) {
      const box = el('div', { class: 'stack' });
      const lIn = el('input', { class: 'inp', type: 'text', maxlength: 100, placeholder: 'السبب', disabled: ro, 'aria-label': 'السبب' });
      const tIn = el('input', { class: 'inp', type: 'text', maxlength: 500, placeholder: 'نص التحذير الكامل', disabled: ro, 'aria-label': 'نص التحذير الكامل' });
      const add = () => {
        const label = lIn.value.trim(), text = tIn.value.trim();
        if (!label || !text) return fl.show('اكتب السبب ونص التحذير الكامل.', false);
        if (c.wr.length >= 25) return fl.show('الحد الأقصى 25 سبب.', false);
        c.wr.push({ label, text });
        lIn.value = ''; tIn.value = '';
        draw(); refreshBar();
      };
      [lIn, tIn].forEach((x) => x.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }));
      function draw() {
        put(box,
          el('span', { class: 'chip' }, `25 / ${c.wr.length}`),
          c.wr.map((r, i) => el('div', { class: 'penrow' },
            el('b', {}, r.label), el('small', { class: 'muted' }, r.text),
            el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف', onclick: () => { c.wr.splice(i, 1); draw(); refreshBar(); } }, icon('trash')))),
          el('div', { class: 'penrow' }, lIn, tIn,
            el('button', { class: 'plus', type: 'button', disabled: ro, 'aria-label': 'إضافة', onclick: add }, icon('plus'))),
          el('small', { class: 'muted' }, 'بدون أسباب: التحذير بيشتغل مباشرة. ومع أسباب: بتطلع قائمة «اختر سبباً».'));
      }
      draw();
      return box;
    }
    function card(c) {
      const ro = !d.canManage;
      const locked = c.premium && !d.guildPremium;
      const chans = d.channels.map((x) => ({ id: x.id, name: '# ' + x.name }));
      const body = el('div', { class: 'cbody' + (openSet.has(c.name) ? '' : ' hidden') });
      const chev = icon('chevron', 'chev' + (openSet.has(c.name) ? ' up' : ''));
      const sw = locked
        ? el('span', { class: 'lockedsw', title: 'يتطلب اشتراك بريميوم' }, icon('lock'))
        : toggle(c.enabled, (v) => { c.enabled = v; refreshBar(); }, ro);
      sw.addEventListener('click', (e) => e.stopPropagation());
      const flip = () => {
        if (locked) return fl.show('هذا الأمر يتطلب اشتراك بريميوم نشط بالسيرفر.', false);
        const o = !openSet.has(c.name);
        if (o) openSet.add(c.name); else openSet.delete(c.name);
        body.classList.toggle('hidden', !o);
        chev.classList.toggle('up', o);
      };
      const pick = (key, items, ph) => multiPick(items, c[key], ph, ro, (v) => { c[key] = v; refreshBar(); });
      const lbl = (t, cls) => el('div', { class: 'plabel ' + cls }, t);
      put(body,
        el('div', { class: 'csec' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox blue' }, icon('shield')), el('h3', {}, 'صلاحيات الرتب')),
          lbl('المسموح لهم', 'okc'), pick('allowRoles', d.roles, 'حسب صلاحيات ديسكورد (لم تُحدد رتب)'),
          lbl('المحظورين', 'badc'), pick('blockRoles', d.roles, 'لا يوجد حظر')),
        el('div', { class: 'csec' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox orange' }, icon('chat')), el('h3', {}, 'صلاحيات الشاتات')),
          lbl('شاتات مسموحة', 'okc'), pick('allowChannels', chans, 'الجميع مسموح'),
          lbl('شاتات محظورة', 'badc'), pick('blockChannels', chans, 'لا يوجد حظر')),
        c.pen ? el('div', { class: 'csec' },
                  c.wr ? el('div', { class: 'csec' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('shield')), el('h3', {}, 'أسباب التحذير')),
          warnEditor(c, ro)) : null,
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('shield')), el('h3', {}, 'نظام العقوبات (إذا لم يحدد وقت)')),
          penEditor(c, ro)) : null,
        el('div', { class: 'csec' },
          el('div', { class: 'rowbar' },
            el('div', { class: 'phd' }, icon('bolt', 'goldc'), el('h3', {}, 'الاختصارات')),
            el('small', { class: 'muted' }, 'اضغط Enter للإضافة')),
          aliasEditor(c, ro)));
      return el('section', { class: 'ccard' },
        el('div', {
          class: 'chead', role: 'button', tabindex: '0', onclick: flip,
          onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); flip(); } },
        },
          el('div', { class: 'ctitle' },
            el('div', { class: 'tline' }, el('h3', { dir: 'ltr' }, c.name + '!'), c.premium ? el('span', { class: 'pbadge' }, icon('lock'), 'بريميوم') : null),
            el('small', { class: 'muted' }, c.desc)),
          el('div', { class: 'cctl' }, sw, chev)),
        body);
    }

    async function saveAll() {
      const list = changed();
      if (!list.length) return;
      const cmds = {};
      for (const c of list) cmds[c.name] = { enabled: c.enabled, allowRoles: c.allowRoles, blockRoles: c.blockRoles, allowChannels: c.allowChannels, blockChannels: c.blockChannels, aliases: c.aliases, penalty: c.pen || undefined, wreasons: c.wr || undefined };
      try {
        await apiSend('PUT', `/api/guild/${gid}/commands`, { cmds });
        list.forEach((c) => { base[c.name] = clone(c); });
        fl.show('تم حفظ الإعدادات ✅');
        refreshBar();
      } catch (e) { fl.show(errText(e), false); }
    }
    function ignore() {
      d.cmds.forEach((c) => Object.assign(c, clone(base[c.name])));
      build();
    }

    function build() {
      const search = el('input', { class: 'inp', type: 'search', placeholder: 'بحث عن أمر...', 'aria-label': 'بحث' });
      const cards = d.cmds.map((c) => ({ c, node: card(c) }));
      search.addEventListener('input', () => {
        const t = search.value.trim().toLowerCase();
        for (const { c, node } of cards) node.classList.toggle('hidden', !!t && !(c.name.includes(t) || c.desc.includes(t) || c.aliases.some((x) => x.includes(t))));
      });

      const saveBtn = el('button', { class: 'btn primary', type: 'button', onclick: async () => { saveBtn.disabled = true; await saveAll(); saveBtn.disabled = false; } }, 'حفظ الإعدادات');
      const ignoreBtn = el('button', { class: 'btn ghost', type: 'button', onclick: ignore }, 'تجاهل');
      const sub = el('small', { class: 'sbsub' }, 'يوجد إعدادات جديدة بانتظار التأكيد');
      const bar = el('div', { class: 'savebar hidden', role: 'region', 'aria-live': 'polite' },
        el('div', { class: 'sbinfo' },
          el('span', { class: 'sbico' }, icon('save')),
          el('div', {}, el('b', {}, 'تغييرات غير محفوظة ', el('i', { class: 'sbdot' })), sub)),
        el('div', { class: 'sbbtns' }, ignoreBtn, saveBtn));
      refreshBar = () => {
        const n = changed().length;
        bar.classList.toggle('hidden', !n);
        document.body.classList.toggle('has-savebar', n > 0);
        window.onbeforeunload = n ? () => true : null;
      };

      put(box,
        el('p', { class: 'eyebrow' }, 'SYSTEM MODULE'),
        el('h1', { class: 'greet' }, 'إدارة الأوامر'),
        el('p', { class: 'lead' }, 'إعدادات الأوامر المتقدمة والتحكم الكامل'),
        fl,
        !d.canManage ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل الأوامر.') : null,
        el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('h2', {}, CAT_TITLE[r.cat] || 'الأوامر')),
        d.cmds.length ? search : null,
        d.cmds.length ? el('div', { class: 'stack' }, cards.map((x) => x.node)) : el('div', { class: 'empty' }, 'لا توجد أوامر بهذا القسم.'),
        bar);
      refreshBar();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }

  // ---- حماية الصور ----
  function pageImages(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null;
    const ACT = [
      ['delete', 'حذف الرسالة فقط (Only Delete)'],
      ['timeout', 'حذف الرسالة + تايم أوت ساعة'],
      ['kick', 'حذف الرسالة + طرد العضو'],
      ['ban', 'حذف الرسالة + حظر العضو'],
    ];

    async function load() {
      try { d = await api(`/api/guild/${gid}/imgprot`); } catch (e) { put(box, errorBox(load)); return; }
      d.canManage = d.canManage && d.guildPremium;
      build();
    }

    function build() {
      const ro = !d.canManage;
      const grid = el('div', { class: 'imggrid' });
      const badge = el('span', { class: 'cbadge' });
      const search = el('input', { class: 'inp', type: 'search', placeholder: 'بحث بالاسم أو +18...', 'aria-label': 'بحث' });

      async function toggleOne(i) {
        try { await apiSend('POST', `/api/guild/${gid}/imgprot/toggle`, { id: i.id, enabled: !i.enabled }); i.enabled = !i.enabled; drawGrid(); }
        catch (e) { fl.show(errText(e), false); }
      }
      async function toggleAll(v) {
        try { await apiSend('POST', `/api/guild/${gid}/imgprot/toggle`, { all: true, enabled: v }); d.items.forEach((i) => { i.enabled = v; }); drawGrid(); }
        catch (e) { fl.show(errText(e), false); }
      }
      async function del(i) {
        if (!confirm('حذف "' + i.name + '" من المكتبة لكل السيرفرات؟')) return;
        try { await apiSend('DELETE', `/api/imglib/${i.id}`); fl.show('تم حذف الصورة'); await load(); }
        catch (e) { fl.show(errText(e), false); }
      }

      const itemCard = (i) => el('div', { class: 'icard' },
        el('div', { class: 'ithumb' + (i.nsfw ? ' nsfw' : '') },
          el('img', { src: `/api/imglib/${i.id}/file`, alt: '', loading: 'lazy' }),
          el('span', { class: 'ibadge ' + (i.enabled ? 'ok' : 'off') }, i.enabled ? 'مفعل بالسيرفر' : 'معطل بالسيرفر'),
          i.nsfw ? el('span', { class: 'nbadge' }, '+18') : null),
        el('h4', {}, i.name),
        el('small', { class: 'muted' }, 'تاريخ التوثيق: ' + fmtDate(i.added)),
        el('button', { class: 'btn ghost small' + (i.enabled ? ' danger' : ' good'), type: 'button', disabled: ro, onclick: () => toggleOne(i) },
          i.enabled ? 'تعطيل هذه الصورة بالسيرفر' : 'تفعيل هذه الصورة بالسيرفر'),
        d.isBotOwner ? el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, onclick: () => del(i) }, icon('trash'), 'حذف من المكتبة') : null);

      function drawGrid() {
        badge.textContent = `${d.items.filter((i) => i.enabled).length} من ${d.items.length} مفعلة`;
        const t = search.value.trim().toLowerCase();
        const list = d.items.filter((i) => !t || i.name.toLowerCase().includes(t) || (/18/.test(t) && i.nsfw));
        put(grid, list.length ? list.map(itemCard) : el('div', { class: 'empty' }, 'لا توجد صور بالمكتبة.'));
      }
      search.addEventListener('input', drawGrid);

      // الإعدادات
      let roles = d.roles, chans = d.channels;
      const sw = toggle(d.enabled, async (v) => {
        try { await apiSend('PUT', `/api/guild/${gid}/imgprot`, { enabled: v }); fl.show(v ? 'تم تفعيل حماية الصور' : 'تم تعطيل حماية الصور'); }
        catch (e) { fl.show(errText(e), false); sw.classList.toggle('on', !v); sw.setAttribute('aria-checked', String(!v)); }
      }, ro);
      const act = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'الإجراء المتخذ' },
        ACT.map(([v, t]) => el('option', { value: v, selected: v === d.action }, t)));
      const rp = multiPick(d.roleList, roles, 'اختر الرتب...', ro, (v) => { roles = v; });
      const cp = multiPick(d.channelList.map((c) => ({ id: c.id, name: '# ' + c.name })), chans, 'اختر الشاتات...', ro, (v) => { chans = v; });
      async function saveCfg() {
        try { await apiSend('PUT', `/api/guild/${gid}/imgprot`, { action: act.value, roles, channels: chans }); fl.show('تم حفظ الإعدادات ✅'); }
        catch (e) { fl.show(errText(e), false); }
      }

      // رفع صور (لمالك البوت فقط)
      let upload = null;
      if (d.isBotOwner) {
        const fileIn = el('input', { type: 'file', accept: IMG_OK.join(','), multiple: true, class: 'hidden' });
        const nameIn = el('input', { class: 'inp', type: 'text', maxlength: 60, placeholder: 'اسم الصورة (اختياري — لصورة وحدة فقط)', 'aria-label': 'اسم الصورة', disabled: !d.guildPremium });
        const nsfwIn = el('input', { type: 'checkbox', id: 'nsfwchk', disabled: !d.guildPremium });
        fileIn.addEventListener('change', async () => {
          const files = [...fileIn.files];
          fileIn.value = '';
          let ok = 0;
          for (const f of files) {
            try {
              const image = await readImage(f, 8);
              await apiSend('POST', '/api/imglib', { image, name: files.length === 1 ? nameIn.value : '', nsfw: nsfwIn.checked });
              ok++;
            } catch (e) { fl.show(`${f.name}: ${errText(e)}`, false); }
          }
          if (ok) { fl.show(`تمت إضافة ${ok} صورة ✅`); await load(); }
        });
        upload = el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'bar' }), el('div', {}, el('h2', {}, 'إضافة صور للمكتبة'), el('small', { class: 'muted' }, 'متاح لمالكي البوت فقط — PNG, JPG, WebP, GIF حتى 8MB'))),
          nameIn,
          el('label', { class: 'checkrow', for: 'nsfwchk' }, nsfwIn, 'محتوى +18 (يتم تعتيم المعاينة)'),
          fileIn,
          el('button', { class: 'btn primary small', type: 'button', disabled: !d.guildPremium, onclick: () => fileIn.click() }, icon('upload'), 'اختيار صور ورفعها'),
          el('p', { class: 'fine start' }, 'الفحص يعتمد على مطابقة الملف نفسه (بصمة SHA-256)، فالصورة لازم تكون نفس الملف الأصلي.'));
      }

      put(box,
        el('p', { class: 'eyebrow' }, 'OPS SYSTEM · Security Module'),
        el('h1', { class: 'greet' }, 'حماية الصور'),
        el('p', { class: 'lead' }, 'فحص الصور المرفوعة ومطابقتها مع مكتبة الصور الاحتيالية وتنفيذ العقوبة تلقائياً.'),
        d.guildPremium ? null : premLock(gid, 'قم بترقية السيرفر لتفعيل حماية الصور ومكتبة الصور الاحتيالية.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' },
            el('div', {}, el('h2', {}, 'تفعيل حماية الصور'), el('small', { class: 'muted' }, 'حذف الصور الاحتيالية فور رفعها ومعاقبة صاحبها')),
            sw)),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('grid')),
            el('div', {}, el('div', { class: 'btnrow' }, el('h2', {}, 'مكتبة الصور الاحتيالية العامة'), badge),
              el('small', { class: 'muted' }, 'يمكنك تعطيل أو تفعيل أي صورة احتيالية محددة لسيرفرك من القائمة التالية'))),
          el('div', { class: 'imgtools' }, search,
            el('button', { class: 'btn ghost small good', type: 'button', disabled: ro, onclick: () => toggleAll(true) }, 'تفعيل الجميع'),
            el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, onclick: () => toggleAll(false) }, 'تعطيل الجميع')),
          grid),
        upload,
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('shield')),
            el('div', {}, el('h2', {}, 'إعدادات العقوبات والمحيط الأمن'), el('small', { class: 'muted' }, 'حدد نوع الإجراء المتخذ عند اكتشاف الصور الاحتيالية'))),
          el('label', { class: 'flabel' }, 'الإجراء المتخذ فور اكتشاف الصورة الاحتيالية'), act,
          el('label', { class: 'flabel' }, 'الرتب المستثناة من فحص الصور الاحتيالية'), rp,
          el('label', { class: 'flabel' }, 'الشاتات المستثناة من فحص الصور الاحتيالية'), cp,
          el('button', { class: 'btn primary wide', type: 'button', disabled: ro, onclick: saveCfg }, 'حفظ الإعدادات')));
      drawGrid();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }

  // =====================  اللوقات + الترحيب  =====================
  Object.assign(ICONS, {
    doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>',
    userplus: '<circle cx="9" cy="8" r="4"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M19 6v6M16 9h6"/>',
    userminus: '<circle cx="9" cy="8" r="4"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 9h6"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><path d="M7.5 11h.01M10 7.5h.01M15 8h.01"/>',
    sliders: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
    hash: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
    alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    micoff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 11 5.7M12 18v3M3 3l18 18"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9zM17 9a4 4 0 0 1 0 6"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    
  });
  Object.assign(ERRS, {
    bad_cfg: 'الإعدادات غير صحيحة.',
    bad_url: 'رابط الخلفية غير صالح (لازم https ولا يقبل عناوين داخلية).',
    bad_text: 'النص أطول من الحد المسموح لسيرفرك.',
  });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // شريط "تغييرات غير محفوظة"
  function saveBar(isDirty, onSave, onIgnore) {
    const saveBtn = el('button', { class: 'btn primary', type: 'button', onclick: async () => { saveBtn.disabled = true; try { await onSave(); } finally { saveBtn.disabled = false; } } }, 'حفظ الإعدادات');
    const node = el('div', { class: 'savebar hidden', role: 'region', 'aria-live': 'polite' },
      el('div', { class: 'sbinfo' }, el('span', { class: 'sbico' }, icon('save')),
        el('div', {}, el('b', {}, 'تغييرات غير محفوظة ', el('i', { class: 'sbdot' })), el('small', { class: 'sbsub' }, 'يوجد إعدادات جديدة بانتظار التأكيد'))),
      el('div', { class: 'sbbtns' }, el('button', { class: 'btn ghost', type: 'button', onclick: onIgnore }, 'تجاهل'), saveBtn));
    const refresh = () => {
      const n = isDirty();
      node.classList.toggle('hidden', !n);
      document.body.classList.toggle('has-savebar', n);
      window.onbeforeunload = n ? () => true : null;
    };
    return { node, refresh };
  }

  // ======================= اللوقات =======================
  function pageLogs(r) {
    const cat = r.page === 'log-general' ? 'general' : 'admin';
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, base = {}, bar = null;
    let baseMain = { enabled: false, channel: null };
    const snap = (c) => JSON.stringify([c.enabled, c.channel || '', c.color]);
    const changed = () => d.items.filter((c) => snap(c) !== snap(base[c.key]));
    const mainDirty = () => JSON.stringify(d.main) !== JSON.stringify(baseMain);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/logs?cat=${cat}`); } catch (e) { put(box, errorBox(load)); return; }
      base = {};
      d.items.forEach((c) => { base[c.key] = clone(c); });
      baseMain = clone(d.main);
      build();
    }

    function card(c) {
      const ro = !d.canManage;
      const locked = c.premium && !d.guildPremium;
      const sel = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'قناة اللوق' },
        el('option', { value: '' }, 'اختر القناة...'),
        d.channels.map((ch) => el('option', { value: ch.id, selected: ch.id === c.channel }, '# ' + ch.name)));
      sel.addEventListener('change', () => { c.channel = sel.value || null; touch(); });
      const col = el('input', { type: 'color', class: 'colorin', value: c.color, disabled: ro, 'aria-label': 'لون الأيمبد' });
      col.addEventListener('input', () => { c.color = col.value; touch(); });
      const node = el('section', { class: 'lcard' + (c.enabled && !locked ? ' open' : '') });
      const sw = locked
        ? el('span', { class: 'lockedsw', title: 'يتطلب اشتراك بريميوم' }, icon('lock'))
        : toggle(c.enabled, (v) => { c.enabled = v; node.classList.toggle('open', v); touch(); }, ro);
      put(node,
        el('div', { class: 'lhead2' },
          el('div', { class: 'lico' }, icon(c.icon)),
          el('div', { class: 'ltext' },
            el('div', { class: 'tline' }, el('h3', {}, c.title), c.premium ? el('span', { class: 'pbadge' }, icon('crown'), 'بريميوم') : null),
            el('small', { class: 'muted' }, c.desc)),
          sw),
        el('div', { class: 'lbody' }, sel, el('label', { class: 'colorrow' }, el('span', {}, 'لون الأيمبد:'), col)));
      return node;
    }

    async function saveAll() {
      const list = changed();
      if (!list.length && !mainDirty()) return;
      const items = {};
      list.forEach((c) => { items[c.key] = { enabled: c.enabled, channel: c.channel || null, color: c.color }; });
      const payload = { items };
      if (mainDirty()) payload.main = { enabled: d.main.enabled, channel: d.main.channel || null };
      try {
        await apiSend('PUT', `/api/guild/${gid}/logs`, payload);
        list.forEach((c) => { base[c.key] = clone(c); });
        baseMain = clone(d.main);
        fl.show('تم حفظ الإعدادات ✅');
        touch();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const bulk = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'قناة لكل السجلات' },
        el('option', { value: '' }, 'اختر قناة لتطبيقها على كل السجلات...'),
        d.channels.map((ch) => el('option', { value: ch.id }, '# ' + ch.name)));
      const bulkBtn = el('button', {
        class: 'btn ghost small', type: 'button', disabled: ro,
        onclick: () => {
          if (!bulk.value) return fl.show('اختر القناة أولاً.', false);
          d.items.forEach((c) => { if (c.premium && !d.guildPremium) return; c.channel = bulk.value; c.enabled = true; });
          build();
        },
      }, 'تطبيق على الكل');
      const mainSel = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'روم اللوقات الموحد' },
        el('option', { value: '' }, 'اختر الروم...'),
        d.channels.map((ch) => el('option', { value: ch.id, selected: ch.id === d.main.channel }, '# ' + ch.name)));
      mainSel.addEventListener('change', () => { d.main.channel = mainSel.value || null; touch(); });
      const mainSw = toggle(d.main.enabled, (v) => { d.main.enabled = v; touch(); }, ro);
      bar = saveBar(() => changed().length > 0 || mainDirty(), saveAll, () => { d.items.forEach((c) => Object.assign(c, clone(base[c.key]))); d.main = clone(baseMain); build(); });
      put(box,
        el('div', { class: 'phd' }, el('span', { class: 'bar' }),
          el('div', {}, el('h1', { class: 'greet' }, cat === 'admin' ? 'اللوقات الإدارية' : 'اللوقات العامة'),
            el('p', { class: 'lead' }, cat === 'admin' ? 'سجلات خاصة بالإدارة لمراقبة المشرفين.' : 'سجلات عامة لمراقبة نشاط الأعضاء.'))),
        fl,
        !d.canManage ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل اللوقات.') : null,
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' }, el('div', {}, el('h2', {}, 'إرسال كل اللوقات في روم واحد'),
            el('small', { class: 'muted' }, 'إذا فعّلته، كل السجلات (الإدارية والعامة) بتروح لهذا الروم بدل رومات كل سجل.')), mainSw),
          mainSel),
        el('section', { class: 'panelc' }, el('div', { class: 'btnrow' }, bulk, bulkBtn),
          el('small', { class: 'muted' }, 'إذا ما حددت قناة للسجل، بيستخدم قنوات setlog! تلقائياً (لو كنت منشئها).')),
        el('div', { class: 'stack' }, d.items.map(card)),
        bar.node);
      bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }

  // ======================= الترحيب والمغادرة =======================
  const JOIN_VARS = [['{user}', 'يمنشن العضو'], ['{userName}', 'اسم العضو'], ['{memberCount}', 'عدد الاعضاء'], ['{server}', 'اسم السيرفر'], ['{inviter}', 'يمنشن الداعي'], ['{inviterName}', 'اسم الداعي'], ['{invites}', 'عدد الدعوات'], ['{inviterId}', 'ايدي الداعي'], ['{inviteCode}', 'كود الدعوة'], ['{username}', 'يوزر العضو'], ['{userId}', 'ايدي العضو'], ['{accountCreated}', 'عمر الحساب'], ['{joinedAt}', 'وقت الدخول']];  const LEAVE_VARS = JOIN_VARS.slice(0, 4);

  function pageWelcome(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, tab = 'join', selEl = 'avatar', bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/welcome`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }

    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/welcome`, { cfg });
        if (cfg.image.bgUrl) d.hasBg = false; // السيرفر يحذف الخلفية المرفوعة عند استخدام رابط
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const pane = el('div', { class: 'stack' });
      const tabsBox = el('div', { class: 'ptabs', role: 'tablist' });
      const tabs = [['join', 'رسالة الترحيب', 'userplus'], ['image', 'تصميم الصورة', 'palette'], ['leave', 'رسالة المغادرة', 'userminus']];
      const drawTabs = () => put(tabsBox, tabs.map(([id, l, ic]) =>
        el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), class: 'ptab' + (tab === id ? ' on' : ''), onclick: () => { tab = id; drawTabs(); drawPane(); } }, icon(ic), l)));

      const green = (on, fn) => {
        const s = toggle(on, (v) => { fn(v); touch(); }, ro);
        s.classList.add('green');
        return s;
      };
      const chanSel = (val, fn, label) => {
        const s = el('select', { class: 'sel full', disabled: ro, 'aria-label': label },
          el('option', { value: '' }, 'اختر القناة...'),
          d.channels.map((c) => el('option', { value: c.id, selected: c.id === val }, '# ' + c.name)));
        s.addEventListener('change', () => { fn(s.value || null); touch(); });
        return s;
      };
      const section = (title, sub, on, fn, ...kids) =>
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' }, el('div', {}, el('h2', {}, title), el('small', { class: 'muted' }, sub)), green(on, fn)),
          el('div', { class: 'sep' }), kids);
      const radios = (list, cur, fn) => el('div', { class: 'ropts' }, list.map(([v, l]) =>
        el('button', { type: 'button', class: 'ropt' + (cur === v ? ' on' : ''), 'aria-pressed': String(cur === v), disabled: ro, onclick: () => { fn(v); touch(); drawPane(); } },
          el('span', { class: 'rdot' }), l)));

      const textEditor = (obj, vars) => {
        const ta = el('textarea', { class: 'inp ta', rows: 6, maxlength: d.maxLen, disabled: ro, 'aria-label': 'نص الرسالة' });
        ta.value = obj.text;
        const cnt = el('small', { class: 'muted mono' });
        const upd = () => { cnt.textContent = `${d.maxLen} / ${ta.value.length}`; };
        ta.addEventListener('input', () => { obj.text = ta.value; upd(); touch(); });
        upd();
        const ins = (t) => {
          if (ro) return;
          const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
          const e = ta.selectionEnd == null ? s : ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
          ta.selectionStart = ta.selectionEnd = s + t.length;
          ta.dispatchEvent(new Event('input'));
          ta.focus();
        };
        return [
          el('div', { class: 'rowbar' }, el('label', { class: 'flabel' }, 'نص الرسالة'), cnt), ta,
          el('section', { class: 'subc' }, el('div', { class: 'flabel' }, 'المتغيرات المتاحة'),
            el('div', { class: 'vgrid' }, vars.map(([k, t]) =>
              el('button', { type: 'button', class: 'vchip', disabled: ro, onclick: () => ins(k) }, el('code', { dir: 'ltr' }, k), el('small', {}, t))))),
        ];
      };

      const joinPane = () => [
        section('إعدادات رسالة الدخول', 'تخصيص الرسالة النصية عند دخول عضو جديد', cfg.join.enabled, (v) => { cfg.join.enabled = v; }, textEditor(cfg.join, JOIN_VARS)),
        el('section', { class: 'panelc' }, el('h3', {}, 'مكان الإرسال'),
          radios([['chat', 'روم بالسيرفر (Chat)'], ['dm', 'الخاص (DM)']], cfg.join.mode, (v) => { cfg.join.mode = v; })),
        cfg.join.mode === 'chat'
          ? el('section', { class: 'panelc' }, el('h3', {}, 'تحديد الروم'), chanSel(cfg.join.channel, (v) => { cfg.join.channel = v; }, 'روم الترحيب'))
          : null,
        el('section', { class: 'panelc' }, el('h3', {}, 'تجربة'),
          el('p', { class: 'muted' }, 'يرسل لك الترحيب كأنك دخلت السيرفر، حسب آخر إعدادات محفوظة (اضغط حفظ أول).'),
          el('button', {
            type: 'button', class: 'btn primary small', disabled: ro,
            onclick: async () => {
              try { await apiSend('POST', `/api/guild/${gid}/welcome/test`); fl.show('انرسل الترحيب التجريبي، شوف الروم ✅'); }
              catch (e) { fl.show(errText(e), false); }
            },
          }, 'جرّب الترحيب الآن')),
      ];

      const leavePane = () => [
        section('إعدادات رسالة المغادرة', 'تخصيص الرسالة عند خروج عضو', cfg.leave.enabled, (v) => { cfg.leave.enabled = v; }, textEditor(cfg.leave, LEAVE_VARS)),
        el('section', { class: 'panelc' }, el('h3', {}, 'روم المغادرة'), chanSel(cfg.leave.channel, (v) => { cfg.leave.channel = v; }, 'روم المغادرة')),
      ];

          const imagePane = () => {
        const im = cfg.image, E = im.elements;
        const NAMES = { avatar: 'Avatar', username: 'Username', text: 'Text' };
        const GRAD = 'linear-gradient(135deg, #16161c, #2a2110)';
        const bgSrc = () => (im.bgUrl ? im.bgUrl : (d.hasBg ? `/api/guild/${gid}/welcome/bg?v=${d.bgAt}` : ''));
        const stage = el('div', { class: 'wstage' });
        const nodes = {};
        const labs = {};
        const elsBox = el('div', { class: 'elgrid' });
        const propsBox = el('div', { class: 'propgrid' });

        const applyBg = () => {
          const s = bgSrc();
          stage.style.backgroundImage = s ? `url("${s.replace(/"/g, '%22')}"), ${GRAD}` : GRAD;
          stage.style.backgroundSize = '100% 100%, 100% 100%';
          if (!s) { stage.style.aspectRatio = '1024 / 450'; return; }
          const pic = new Image();
          pic.onload = () => {
            const h = Math.max(300, Math.min(1400, Math.round(1024 * pic.naturalHeight / pic.naturalWidth)));
            stage.style.aspectRatio = '1024 / ' + h;
          };
          pic.src = s;
        };

        const place = (k) => {
          const n = nodes[k], o = E[k];
          n.style.left = o.x + '%';
          n.style.top = o.y + '%';
          if (k === 'avatar') { n.style.width = o.size + '%'; n.style.aspectRatio = '1 / ' + (o.ar || 1); }
          else {
            n.style.fontSize = o.size + 'cqh';
            n.style.color = o.color;
            if (k === 'text') labs.text.textContent = o.content || ' ';
          }
        };
        const mark = () => {
          Object.keys(nodes).forEach((k) => {
            nodes[k].classList.toggle('selx', k === selEl);
            nodes[k]._rh.forEach((h) => { h.style.display = k === selEl && !ro ? 'block' : 'none'; });
          });
          drawEls();
        };

        const mk = (k) => {
          const node = k === 'avatar'
            ? el('div', { class: 'wel-av dragx', tabindex: '0', role: 'button', 'aria-label': 'Avatar', style: 'background:#5865f2' })
            : el('div', { class: 'wel-t dragx', tabindex: '0', role: 'button', 'aria-label': NAMES[k] });
          nodes[k] = node;
          if (k !== 'avatar') { labs[k] = el('span', {}, k === 'username' ? 'Username' : ''); node.append(labs[k]); }
                    node._rh = [['50%', '0', 'v'], ['0', '50%', 'h'], ['100%', '50%', 'h'], ['50%', '100%', 'v']].map(([lx, ly, dir]) => {
            const h = el('div', { 'aria-hidden': 'true', style: `position:absolute;left:${lx};top:${ly};width:18px;height:18px;border-radius:50%;background:#fbbf24;box-shadow:0 2px 8px rgba(0,0,0,.5);transform:translate(-50%,-50%);cursor:${k === 'avatar' ? (dir === 'v' ? 'ns-resize' : 'ew-resize') : 'nwse-resize'};touch-action:none;display:none` });
            h.addEventListener('pointerdown', (ev) => {
              ev.preventDefault(); ev.stopPropagation();
              if (ro) return;
              h.setPointerCapture(ev.pointerId);
              const b = node.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
              const sr = stage.getBoundingClientRect();
              const d0 = Math.max(8, Math.hypot(ev.clientX - cx, ev.clientY - cy)), s0 = E[k].size, h0 = b.height;
              const rnd = (v, lo, hi, p) => Math.round(Math.min(hi, Math.max(lo, v)) * p) / p;
              const move = (e) => {
                if (k === 'avatar') {
                  if (dir === 'h') {
                    const w = Math.max(6, Math.abs(e.clientX - cx) * 2);
                    E[k].size = rnd((w / sr.width) * 100, 3, 60, 10);
                    E[k].ar = rnd(h0 / w, 0.2, 5, 100);
                  } else {
                    const w = (E[k].size / 100) * sr.width;
                    E[k].ar = rnd((Math.abs(e.clientY - cy) * 2) / w, 0.2, 5, 100);
                  }
                } else {
                  E[k].size = rnd(s0 * (Math.hypot(e.clientX - cx, e.clientY - cy) / d0), 3, 60, 10);
                }
                place(k); touch();
              };
              const up = () => {
                h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
                drawProps();
              };
              h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
            });
            node.append(h);
            return h;
          });
          node.addEventListener('pointerdown', (ev) => {
            selEl = k; mark(); drawProps();
            if (ro) return;
            ev.preventDefault();
            node.setPointerCapture(ev.pointerId);
            node.classList.add('dragging');
            const move = (e) => {
              const r = stage.getBoundingClientRect();
              const cl = (v) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
              E[k].x = cl(((e.clientX - r.left) / r.width) * 100);
              E[k].y = cl(((e.clientY - r.top) / r.height) * 100);
              place(k); touch();
            };
            const up = () => {
              node.classList.remove('dragging');
              node.removeEventListener('pointermove', move);
              node.removeEventListener('pointerup', up);
              node.removeEventListener('pointercancel', up);
              drawProps();
            };
            node.addEventListener('pointermove', move);
            node.addEventListener('pointerup', up);
            node.addEventListener('pointercancel', up);
          });
          node.addEventListener('keydown', (e) => {
            if (ro) return;
            const st = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (!st) return;
            e.preventDefault();
            const cl = (v) => Math.min(100, Math.max(0, v));
            E[k].x = cl(E[k].x + st[0]); E[k].y = cl(E[k].y + st[1]);
            place(k); touch(); drawProps();
          });
          stage.append(node);
          place(k);
        };
        ['avatar', 'username', 'text'].forEach(mk);
        applyBg();

        function drawEls() {
          put(elsBox, ['avatar', 'username', 'text'].map((k) =>
            el('button', { type: 'button', class: 'elbtn' + (selEl === k ? ' on' : ''), onclick: () => { selEl = k; mark(); drawProps(); } },
              el('strong', {}, NAMES[k]), el('small', {}, 'تعديل الخصائص'))));
        }

        const numField = (label, prop, min, max) => {
          const i = el('input', { type: 'number', class: 'inp', min, max, step: '0.5', disabled: ro, 'aria-label': label });
          i.value = E[selEl][prop];
          const k = selEl;
          i.addEventListener('input', () => {
            const v = Number(i.value);
            if (i.value === '' || !Number.isFinite(v) || v < min || v > max) return;
            E[k][prop] = v; place(k); touch();
          });
          return el('label', { class: 'pf' }, label, i);
        };
        function drawProps() {
          const k = selEl, o = E[k];
          const kids = [numField('الموضع X (%)', 'x', 0, 100), numField('الموضع Y (%)', 'y', 0, 100), numField(k === 'avatar' ? 'الحجم (% من العرض)' : 'حجم الخط (% من الارتفاع)', 'size', 3, 60)];
          if (k === 'avatar') kids.push(numField('نسبة الارتفاع للعرض', 'ar', 0.2, 5));
          if (k !== 'avatar') {
            const c = el('input', { type: 'color', class: 'colorin', disabled: ro, 'aria-label': 'اللون' });
            c.value = o.color;
            c.addEventListener('input', () => { o.color = c.value; place(k); touch(); });
            kids.push(el('label', { class: 'pf' }, 'اللون', c));
          }
          if (k === 'text') {
            const t = el('input', { type: 'text', class: 'inp', maxlength: '60', disabled: ro, 'aria-label': 'النص' });
            t.value = o.content;
            t.addEventListener('input', () => { o.content = t.value; place(k); touch(); });
            kids.push(el('label', { class: 'pf wide2' }, 'النص (يدعم المتغيرات مثل {userName})', t));
          }
          put(propsBox, kids);
        }
        mark(); drawProps();

        // ---- الخلفية ----
        const url = el('input', { class: 'inp', type: 'url', dir: 'ltr', placeholder: 'رابط الخلفية (https://...)', disabled: ro, 'aria-label': 'رابط الخلفية' });
        url.value = im.bgUrl || '';
        url.addEventListener('input', () => { im.bgUrl = url.value.trim(); applyBg(); touch(); });
        const file = el('input', { type: 'file', accept: IMG_OK.join(','), hidden: true });
        file.addEventListener('change', async () => {
          const f = file.files[0]; file.value = '';
          if (!f) return;
          try {
            const data = await readImage(f, 5);
            await apiSend('POST', `/api/guild/${gid}/welcome/bg`, { image: data });
            d.hasBg = true; d.bgAt = Date.now(); im.bgUrl = ''; base.image.bgUrl = ''; url.value = '';
            applyBg(); touch(); fl.show('تم رفع الخلفية ✅');
          } catch (e) { fl.show(errText(e), false); }
        });
        const upBtn = el('button', { type: 'button', class: 'btn ghost small', disabled: ro, 'aria-label': 'رفع صورة', onclick: () => file.click() }, icon('upload'));
        const delBtn = el('button', {
          type: 'button', class: 'btn ghost small danger', disabled: ro,
          onclick: async () => {
            try {
              await apiSend('DELETE', `/api/guild/${gid}/welcome/bg`);
              d.hasBg = false; im.bgUrl = ''; base.image.bgUrl = ''; url.value = '';
              applyBg(); touch(); fl.show('تم حذف الخلفية');
            } catch (e) { fl.show(errText(e), false); }
          },
        }, 'حذف الخلفية');

        return [
          section('تصميم صورة الترحيب', 'صمم صورة الترحيب الخاصة بك بدقة', im.enabled, (v) => { im.enabled = v; },
            !d.canvas ? el('div', { class: 'notice show' }, 'لتوليد الصورة ثبّت المكتبة: npm i @napi-rs/canvas ثم أعد تشغيل البوت.') : null,
            el('section', { class: 'panelc' }, el('h3', {}, 'طريقة الإرسال'),
              radios([['embed', 'مع الرسالة (مدمج)'], ['separate', 'منفصلة (بعد الرسالة)'], ['channel', 'روم خاص']], im.method, (v) => { im.method = v; })),
            im.method === 'channel'
              ? el('section', { class: 'panelc' }, el('h3', {}, 'روم الصورة'), chanSel(im.channel, (v) => { im.channel = v; }, 'روم الصورة'))
              : null),
          el('section', { class: 'panelc' },
            el('h3', {}, 'المعاينة (اسحب العناصر لتحريكها)'),
            stage,
            el('div', { class: 'bgbar' }, upBtn, url, file),
            el('div', { class: 'rowbar' }, el('label', { class: 'flabel' }, 'ملاءمة الخلفية'), delBtn),
            radios([['contain', 'احتواء (بدون قص)'], ['cover', 'تغطية (مع قص)'], ['stretch', 'تمطيط']], im.fit, (v) => { im.fit = v; })),
          el('section', { class: 'panelc' }, el('h3', {}, 'اختر عنصراً للتعديل'), elsBox, propsBox),
        ];
      };
      const drawPane = () => put(pane, tab === 'join' ? joinPane() : tab === 'image' ? imagePane() : leavePane());

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'WELCOME MODULE'),
        el('h1', { class: 'greet' }, 'الترحيب والمغادرة'),
        el('p', { class: 'lead' }, 'نظام متكامل للتحكم برسائل الدخول، الخروج، والصور الترحيبية.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc masterc' },
          el('div', { class: 'trow' },
            el('div', { class: 'mrow' }, el('span', { class: 'mico' }, icon('sliders')),
              el('div', {}, el('h2', {}, 'تفعيل النظام'), el('small', { class: 'muted' }, 'تشغيل كافة خدمات الترحيب والمغادرة'))),
            green(cfg.enabled, (v) => { cfg.enabled = v; }))),
        tabsBox, pane, bar.node);
      drawTabs(); drawPane(); bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }



  // =====================  الرد التلقائي + الإيمبد  =====================
  Object.assign(ICONS, {
    embed: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    send: '<path d="M4 12l16-8-6 17-3-7z"/>',
  });
  Object.assign(ERRS, {
    bad_keyword: 'الكلمة المفتاحية مطلوبة (حتى 100 حرف).',
    bad_reply: 'الرد مطلوب (حتى 1000 حرف).',
    limit_reached: 'وصلت للحد الأقصى المسموح لباقة سيرفرك.',
    emb_name: 'اكتب اسماً للإيمبد.',
    bad_field: 'كل حقل فرعي لازم يكون له اسم وقيمة.',
    bad_label: 'كل زر/خيار لازم يكون له نص.',
    bad_emoji: 'الإيموجي غير صالح.',
    embed_chars: 'عدد الأحرف تجاوز حد باقتك.',
    embed_bytes: 'حجم الإيمبد تجاوز حد باقتك.',
    empty_embed: 'الإيمبد فاضي، اكتب فيه محتوى.',
    no_channel: 'اختر القناة أولاً.',
    role_dangerous: 'ما بنسمح بربط رتبة فيها صلاحيات إدارية بزر.',
  });
  const rndId = () => [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const cutT = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

  // ---------------- الرد التلقائي ----------------
  function pageAutoReply(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, rules = [], base = [], selId = null, bar = null, showErr = false;
    const dirty = () => JSON.stringify(rules) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();
    const MATCH = [['exact', 'تطابق تام', 'سيرد البوت فقط إذا كانت الرسالة مطابقة تماماً.'], ['contains', 'يحتوي على', 'سيرد البوت إذا احتوت الرسالة على الكلمة.'], ['starts', 'يبدأ بـ', 'سيرد البوت إذا بدأت الرسالة بالكلمة.']];
    const mlabel = (x) => (MATCH.find((m) => m[0] === x.match) || MATCH[0])[1];
    const listBox = el('div', { class: 'arlist' });
    const edBox = el('div', {});

    async function load() {
      try { d = await api(`/api/guild/${gid}/autoreply`); } catch (e) { put(box, errorBox(load)); return; }
      rules = clone(d.rules); base = clone(d.rules); selId = null;
      build();
    }

    function drawList() {
      const ro = !d.canManage;
      put(listBox, rules.map((x) => {
        const empty = !x.keyword.trim();
        const bad = showErr && (empty || !x.reply.trim());
        const del = el('button', {
          class: 'btn ghost small danger', type: 'button', 'aria-label': 'حذف الرد', disabled: ro,
          onclick: (e) => { e.stopPropagation(); if (!confirm('حذف هذا الرد؟')) return; rules = rules.filter((y) => y !== x); if (selId === x.id) selId = null; drawList(); drawEditor(); touch(); },
        }, icon('trash'));
        const sw = toggle(x.enabled !== false, (v) => { x.enabled = v; touch(); }, ro);
        sw.addEventListener('click', (e) => e.stopPropagation());
        const pick = () => { selId = x.id; drawList(); drawEditor(); };
        return el('div', {
          class: 'arcard' + (selId === x.id ? ' on' : '') + (bad ? ' bad' : ''), role: 'button', tabindex: '0', onclick: pick,
          onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(); } },
        },
          el('div', { class: 'arhead' },
            el('div', { class: 'artitle' },
              empty ? el('span', { class: 'redt' }, icon('alert'), 'كلمة مفتاحية فارغة') : el('b', {}, cutT(x.keyword, 40)),
              el('span', { class: 'mbadge' }, mlabel(x))),
            el('div', { class: 'arctl' }, sw, del)),
          el('small', { class: 'muted' }, x.reply.trim() ? cutT(x.reply, 90) : 'لا يوجد رد...'));
      }));
    }

    function drawEditor() {
      const ro = !d.canManage;
      const x = rules.find((y) => y.id === selId);
      if (!x) { put(edBox, el('div', { class: 'empty boxed' }, icon('chat'), el('p', {}, 'اختر رداً من القائمة أو أضف جديداً للبدء'))); return; }
      const tabs = el('div', { class: 'mtabs', role: 'tablist' });
      const hint = el('small', { class: 'fine' });
      const kwErr = el('small', { class: 'errt hidden' });
      const rpErr = el('small', { class: 'errt hidden' });
      const kw = el('input', { class: 'inp', type: 'text', maxlength: 100, placeholder: 'مثال: السلام عليكم', disabled: ro, 'aria-label': 'الكلمة المفتاحية' });
      kw.value = x.keyword;
      const rp = el('textarea', { class: 'inp ta', rows: 5, maxlength: 1000, placeholder: 'اكتب رد البوت هنا...', disabled: ro, 'aria-label': 'الرد' });
      rp.value = x.reply;
      const cnt = el('small', { class: 'muted mono' });
      const validate = () => {
        const k = !x.keyword.trim(), p = !x.reply.trim();
        kw.classList.toggle('bad', showErr && k); rp.classList.toggle('bad', showErr && p);
        kwErr.classList.toggle('hidden', !(showErr && k)); rpErr.classList.toggle('hidden', !(showErr && p));
        cnt.textContent = `1000 / ${x.reply.length}`;
      };
      const drawTabs = () => {
        put(tabsBox, MATCH.map(([id, l]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(x.match === id), class: 'mtab' + (x.match === id ? ' on' : ''), disabled: ro, onclick: () => { x.match = id; drawTabs(); drawList(); touch(); } }, l)));
        hint.textContent = (MATCH.find((m) => m[0] === x.match) || MATCH[0])[2];
      };
      const tabsBox = tabs;
      kw.addEventListener('input', () => { x.keyword = kw.value; validate(); drawList(); touch(); });
      rp.addEventListener('input', () => { x.reply = rp.value; validate(); drawList(); touch(); });
      kwErr.textContent = 'الكلمة المفتاحية حقل إجباري ولا يمكن تركه فارغاً.';
      rpErr.textContent = 'الرد حقل إجباري ولا يمكن تركه فارغاً.';
      const roles = d.roles, chans = d.channels.map((c) => ({ id: c.id, name: '# ' + c.name }));
      const lbl = (t, c) => el('div', { class: 'plabel ' + c }, t);
      put(edBox,
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' }, el('div', {}, el('h2', {}, 'تعديل الرد'), el('small', { class: 'muted' }, 'متغيرات الرد: {user} {userName} {server} {memberCount}')),
            toggle(x.enabled !== false, (v) => { x.enabled = v; drawList(); touch(); }, ro)),
          el('div', { class: 'sep' }),
          el('div', { class: 'rowbar' }, el('label', { class: 'flabel' }, 'الكلمة المفتاحية (Keyword) *'), tabs),
          kw, kwErr, hint,
          el('div', { class: 'rowbar' }, el('label', { class: 'flabel' }, 'الرد (Reply) *'), cnt),
          rp, rpErr),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('shield')),
            el('div', {}, el('h2', {}, 'الصلاحيات المتقدمة'), el('small', { class: 'muted' }, 'تحكم بدقة من يستطيع تفعيل هذا الرد وأين.'))),
          el('div', { class: 'sep' }),
          el('div', { class: 'csec' },
            el('div', { class: 'phd' }, el('span', { class: 'hbox blue' }, icon('shield')), el('h3', {}, 'صلاحيات الرتب')),
            lbl('المسموح لهم (WhiteList)', 'okc'), multiPick(roles, x.allowRoles, 'الجميع مسموح', ro, (v) => { x.allowRoles = v; touch(); }),
            lbl('المحظورين (BlackList)', 'badc'), multiPick(roles, x.blockRoles, 'لا يوجد حظر', ro, (v) => { x.blockRoles = v; touch(); })),
          el('div', { class: 'csec' },
            el('div', { class: 'phd' }, el('span', { class: 'hbox orange' }, icon('chat')), el('h3', {}, 'صلاحيات الشاتات')),
            lbl('شاتات مسموحة (WhiteList)', 'okc'), multiPick(chans, x.allowChannels, 'الجميع مسموح', ro, (v) => { x.allowChannels = v; touch(); }),
            lbl('شاتات محظورة (BlackList)', 'badc'), multiPick(chans, x.blockChannels, 'لا يوجد حظر', ro, (v) => { x.blockChannels = v; touch(); }))));
      drawTabs(); validate();
    }

    async function save() {
      if (rules.some((x) => !x.keyword.trim() || !x.reply.trim())) {
        showErr = true; drawList(); drawEditor();
        fl.show('عبّي الكلمة المفتاحية والرد لكل القواعد قبل الحفظ.', false);
        return;
      }
      try {
        const j = await apiSend('PUT', `/api/guild/${gid}/autoreply`, { rules });
        const idx = rules.findIndex((y) => y.id === selId);
        rules = j.rules; base = clone(rules);
        selId = idx >= 0 && rules[idx] ? rules[idx].id : null;
        showErr = false;
        fl.show('تم حفظ الردود التلقائية ✅');
        drawList(); drawEditor(); bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      bar = saveBar(dirty, save, () => { rules = clone(base); showErr = false; if (!rules.some((y) => y.id === selId)) selId = null; build(); });
      const add = el('button', {
        class: 'addbox', type: 'button', disabled: ro || rules.length >= d.max,
        onclick: () => {
          const x = { id: rndId(), keyword: '', match: 'exact', reply: '', enabled: true, allowRoles: [], blockRoles: [], allowChannels: [], blockChannels: [] };
          rules.unshift(x); selId = x.id; drawList(); drawEditor(); touch();
        },
      }, icon('plus'), 'إضافة رد جديد');
      put(box,
        el('p', { class: 'eyebrow' }, 'REPLY MODULE'),
        el('h1', { class: 'greet' }, 'الرد التلقائي'),
        el('p', { class: 'lead' }, 'نظام ذكي للرد على الرسائل تلقائياً بناءً على كلمات مفتاحية معينة.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل الردود.') : null,
        add,
        el('small', { class: 'muted' }, `${rules.length} / ${d.max} رد${d.guildPremium ? '' : ' (الباقة العادية — البريميوم بيرفع الحد)'}`),
        listBox, edBox, bar.node);
      drawList(); drawEditor(); bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }

  // ---------------- الإيمبد ----------------
  function embCore(d) {
    const e = {};
    const c = parseInt(String(d.color || '').slice(1), 16);
    if (Number.isFinite(c)) e.color = c;
    const au = d.author || {}, ft = d.footer || {};
    if (au.name) e.author = Object.assign({ name: au.name }, au.icon ? { icon_url: au.icon } : {}, au.url ? { url: au.url } : {});
    if (d.title) { e.title = d.title; if (d.titleUrl) e.url = d.titleUrl; }
    if (d.description) e.description = d.description;
    if (d.thumbnail) e.thumbnail = { url: d.thumbnail };
    if (d.fields && d.fields.length) e.fields = d.fields.map((f) => ({ name: f.name, value: f.value, inline: !!f.inline }));
    if (d.image) e.image = { url: d.image };
    if (ft.text) e.footer = Object.assign({ text: ft.text }, ft.icon ? { icon_url: ft.icon } : {});
    const filled = Object.keys(e).some((k) => k !== 'color');
    return { content: d.content || '', embed: filled ? e : null };
  }
  function embMeasure(d) {
    const core = embCore(d);
    const e = core.embed || {};
    let chars = core.content.length + String(e.title || '').length + String(e.description || '').length + String((e.author || {}).name || '').length + String((e.footer || {}).text || '').length;
    for (const f of e.fields || []) chars += f.name.length + f.value.length;
    for (const a of (d.kind !== 'none' ? d.actions || [] : [])) chars += String(a.label || '').length;
    const s = JSON.stringify({ content: core.content, embed: core.embed });
    const bytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(s) : new TextEncoder().encode(s).length;
    return { chars, bytes };
  }

  function pageEmbeds(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, list = [], cur = null, baseCur = null;
    const PAL = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f98a77', '#2b2d31', '#ffffff'];
    const STYLES = [['primary', '#5865f2'], ['secondary', '#4f545c'], ['success', '#57f287'], ['danger', '#ed4245']];
    const KIND_L = { none: 'بدون', button: 'زر', select: 'قائمة' };
    const blank = () => ({ id: '', name: 'إيمبد جديد', channel: null, content: '', mode: 'classic', color: '#fbbf24', author: { name: '', icon: '', url: '' }, title: '', titleUrl: '', description: '', thumbnail: '', fields: [], image: '', footer: { text: '', icon: '' }, timestamp: false, kind: 'none', placeholder: '', actions: [] });
    const dirty = () => cur && JSON.stringify(cur) !== JSON.stringify(baseCur);
    const touch = () => { window.onbeforeunload = dirty() ? () => true : null; };
    const listBox = el('div', { class: 'embgrid' });
    const edBox = el('div', {});

    async function load() {
      try { d = await api(`/api/guild/${gid}/embeds`); } catch (e) { put(box, errorBox(load)); return; }
      list = d.embeds;
      build();
    }

    function drawList() {
      const ro = !d.canManage;
      put(listBox,
        el('button', { class: 'addbox big', type: 'button', disabled: ro || list.length >= d.limits.count, onclick: () => { cur = blank(); baseCur = clone(cur); drawList(); drawEditor(); } },
          el('span', { class: 'plusb' }, icon('plus')), 'إنشاء إيمبد جديد'),
        list.map((e) => el('div', {
          class: 'embcard' + (cur && cur.id === e.id ? ' on' : ''), role: 'button', tabindex: '0',
          onclick: () => { cur = clone(e); baseCur = clone(e); drawList(); drawEditor(); },
          onkeydown: (ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); cur = clone(e); baseCur = clone(e); drawList(); drawEditor(); } },
        }, el('h3', {}, e.name),
          el('div', { class: 'embtags' }, el('span', { class: 'mbadge gold' }, KIND_L[e.kind] || 'بدون'), el('span', { class: 'mbadge' }, `${e.actions.length} إجراء`)))));
    }

    function drawEditor() {
      if (!cur) { put(edBox); return; }
      const ro = !d.canManage, lim = d.limits;
      const chars = el('span', {}), bytes = el('span', {});
      const upd = () => {
        const m = embMeasure(cur);
        chars.textContent = `${m.chars}/${lim.chars}`; bytes.textContent = `${(m.bytes / 1024).toFixed(1)}KB/${(lim.bytes / 1024).toFixed(1)}KB`;
        chars.parentNode && chars.parentNode.classList.toggle('over', m.chars > lim.chars);
        bytes.parentNode && bytes.parentNode.classList.toggle('over', m.bytes > lim.bytes);
        touch();
      };
      const bind = (node, obj, key, after) => { node.value = obj[key] || ''; node.disabled = ro; node.addEventListener('input', () => { obj[key] = node.value; if (after) after(); upd(); }); return node; };
      const tin = (obj, key, ph, max, type) => bind(el('input', { class: 'inp', type: type || 'text', placeholder: ph, maxlength: max, 'aria-label': ph }), obj, key);
      const embbox = el('div', { class: 'embbox' });
      const paintBox = () => { embbox.style.borderInlineStartColor = cur.color; };
      const colorIn = el('input', { type: 'color', class: 'colorin big', value: cur.color, disabled: ro, 'aria-label': 'لون الشريط الجانبي' });
      const sw = el('div', { class: 'swatches' });
      const drawSw = () => put(sw, PAL.map((c) => el('button', { type: 'button', class: 'swatch' + (cur.color === c ? ' on' : ''), style: 'background:' + c, disabled: ro, 'aria-label': c, onclick: () => { cur.color = c; colorIn.value = c; paintBox(); drawSw(); upd(); } })));
      colorIn.addEventListener('input', () => { cur.color = colorIn.value; paintBox(); drawSw(); upd(); });

      const modeBox = el('div', { class: 'mtabs' });
      const drawMode = () => put(modeBox,
        el('button', { type: 'button', class: 'mtab' + (cur.mode === 'classic' ? ' on' : ''), disabled: ro, onclick: () => { cur.mode = 'classic'; drawMode(); upd(); } }, icon('grid'), 'إيمبد كلاسيك'),
        el('button', { type: 'button', class: 'mtab' + (cur.mode === 'v2' ? ' on' : ''), disabled: ro, onclick: () => { cur.mode = 'v2'; drawMode(); upd(); } }, icon('grid'), 'مكونات V2', el('em', { class: 'newb' }, 'جديد')));

      const fieldsBox = el('div', { class: 'stack' });
      const drawFields = () => put(fieldsBox, cur.fields.map((f, i) => el('div', { class: 'subrow' },
        tin(f, 'name', 'اسم الحقل', 256), tin(f, 'value', 'قيمة الحقل', 1024),
        el('label', { class: 'chk' }, (() => { const c = el('input', { type: 'checkbox', disabled: ro }); c.checked = !!f.inline; c.addEventListener('change', () => { f.inline = c.checked; upd(); }); return c; })(), 'بجانب بعض'),
        el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف الحقل', onclick: () => { cur.fields.splice(i, 1); drawFields(); drawAddField(); upd(); } }, icon('trash')))));
      const addFieldBtn = el('div', {});
      const drawAddField = () => put(addFieldBtn, el('button', { class: 'btn primary small', type: 'button', disabled: ro || cur.fields.length >= 10, onclick: () => { cur.fields.push({ name: '', value: '', inline: false }); drawFields(); drawAddField(); upd(); } }, icon('plus'), `أضف حقل فرعي (${cur.fields.length}/10)`));

      const actBox = el('div', { class: 'stack' });
      const kindBox = el('div', { class: 'mtabs' });
      const phBox = el('div', {});
      const addActBox = el('div', {});
      const drawKind = () => {
        put(kindBox, [['none', 'بدون'], ['button', 'أزرار'], ['select', 'قائمة منسدلة']].map(([k, l]) =>
          el('button', { type: 'button', class: 'mtab' + (cur.kind === k ? ' on' : ''), disabled: ro, onclick: () => { cur.kind = k; drawKind(); drawActs(); upd(); } }, l)));
        put(phBox, cur.kind === 'select' ? [el('label', { class: 'flabel' }, 'النص الظاهر على القائمة'), tin(cur, 'placeholder', 'اختر...', 150)] : null);
      };
      const drawActs = () => {
        if (cur.kind === 'none') { put(actBox); put(addActBox); return; }
        put(actBox, cur.actions.map((a, i) => {
          const rs = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'رتبة عند الضغط' }, el('option', { value: '' }, 'بدون رتبة (رد فقط)'),
            d.roles.map((x) => el('option', { value: x.id, selected: x.id === a.roleId }, '@ ' + x.name)));
          rs.addEventListener('change', () => { a.roleId = rs.value; upd(); });
          const rep = bind(el('textarea', { class: 'inp ta', rows: 2, maxlength: 2000, placeholder: 'الرد عند الضغط (يظهر للعضو فقط)', 'aria-label': 'الرد' }), a, 'reply');
          const sws = cur.kind === 'button' ? el('div', { class: 'swatches' }, STYLES.map(([s, c]) => el('button', { type: 'button', class: 'swatch' + (a.style === s ? ' on' : ''), style: 'background:' + c, disabled: ro, 'aria-label': s, onclick: () => { a.style = s; drawActs(); upd(); } }))) : null;
          return el('div', { class: 'actrow' },
            el('div', { class: 'subrow' }, tin(a, 'emoji', '😀', 64), tin(a, 'label', 'نص الزر / الخيار', 80)),
            rep, rs,
            el('div', { class: 'actctl' }, sws,
              el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف الإجراء', onclick: () => { cur.actions.splice(i, 1); drawActs(); upd(); } }, icon('trash'))));
        }));
        put(addActBox, el('button', { class: 'addbox', type: 'button', disabled: ro || cur.actions.length >= lim.actions, onclick: () => { cur.actions.push({ label: '', emoji: '', style: 'primary', reply: '', roleId: '' }); drawActs(); upd(); } },
          icon('plus'), `إضافة إجراء (${cur.actions.length}/${lim.actions})`));
      };

      const chSel = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'القناة' }, el('option', { value: '' }, 'اختر القناة...'),
        d.channels.map((c) => el('option', { value: c.id, selected: c.id === cur.channel }, '# ' + c.name)));
      chSel.addEventListener('change', () => { cur.channel = chSel.value || null; upd(); });
      const ta = (obj, key, ph, max, rows) => bind(el('textarea', { class: 'inp ta', rows, placeholder: ph, maxlength: max, 'aria-label': ph }), obj, key);

      put(embbox,
        el('div', { class: 'subrow' }, tin(cur.author, 'name', 'اسم الكاتب', 256), tin(cur.author, 'icon', 'رابط أيقونة الكاتب', 500), tin(cur.author, 'url', 'رابط الكاتب', 500)),
        el('div', { class: 'subrow' }, tin(cur, 'title', 'عنوان الإيمبد', 256), tin(cur, 'titleUrl', 'رابط العنوان (اختياري)', 500)),
        ta(cur, 'description', 'وصف الإيمبد', 4096, 5),
        tin(cur, 'thumbnail', 'رابط الصورة المصغرة (Thumbnail)', 500),
        fieldsBox, addFieldBtn,
        tin(cur, 'image', 'رابط الصورة الكبيرة', 500),
        el('div', { class: 'subrow' }, tin(cur.footer, 'text', 'نص الفوتر', 2048), tin(cur.footer, 'icon', 'رابط أيقونة الفوتر', 500)),
        el('label', { class: 'chk' }, (() => { const c = el('input', { type: 'checkbox', disabled: ro }); c.checked = !!cur.timestamp; c.addEventListener('change', () => { cur.timestamp = c.checked; upd(); }); return c; })(), 'إظهار وقت الإرسال'));

      async function saveCur() {
        try {
          const isNew = !cur.id;
          const j = isNew ? await apiSend('POST', `/api/guild/${gid}/embeds`, { embed: cur }) : await apiSend('PUT', `/api/guild/${gid}/embeds/${cur.id}`, { embed: cur });
          cur = clone(j.embed); baseCur = clone(j.embed);
          const i = list.findIndex((e) => e.id === cur.id);
          if (i >= 0) list[i] = clone(cur); else list.push(clone(cur));
          fl.show('تم حفظ الإيمبد ✅'); touch(); drawList(); drawEditor();
          return true;
        } catch (e) { fl.show(errText(e), false); return false; }
      }
      async function sendCur() {
        if (!cur.channel) { fl.show(ERRS.no_channel, false); return; }
        if ((dirty() || !cur.id) && !(await saveCur())) return;
        try { await apiSend('POST', `/api/guild/${gid}/embeds/${cur.id}/send`); fl.show('تم الإرسال للقناة ✅'); }
        catch (e) { fl.show(errText(e), false); }
      }
      async function delCur() {
        if (!cur.id) { cur = null; drawList(); drawEditor(); touch(); return; }
        if (!confirm('حذف هذا الإيمبد؟ الرسائل المرسلة سابقاً بتبقى بس أزرارها بتوقف.')) return;
        try { await apiSend('DELETE', `/api/guild/${gid}/embeds/${cur.id}`); list = list.filter((e) => e.id !== cur.id); cur = null; fl.show('تم الحذف'); touch(); drawList(); drawEditor(); }
        catch (e) { fl.show(errText(e), false); }
      }

      put(edBox,
        el('section', { class: 'panelc edpanel' },
          el('div', { class: 'trow' },
            el('div', { class: 'phd' }, icon('pen', 'goldc'), el('h2', {}, 'تعديل الإيمبد')),
            el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'إغلاق', onclick: () => { if (dirty() && !confirm('في تغييرات غير محفوظة، إغلاق؟')) return; cur = null; touch(); drawList(); drawEditor(); } }, icon('close'))),
          el('div', { class: 'sep' }),
          el('div', { class: 'twocol' },
            el('label', { class: 'pf' }, el('span', {}, 'اسم الإيمبد'), tin(cur, 'name', 'اسم الإيمبد', 60)),
            el('label', { class: 'pf' }, el('span', {}, 'القناة'), chSel)),
          el('div', { class: 'flabel' }, 'الرسالة'),
          el('div', { class: 'statbar' },
            el('span', { class: 'sbadge' }, 'باقة السيرفر: ', d.guildPremium ? 'بريميوم' : 'الباقة العادية (حد مجاني)'),
            el('span', { class: 'stat' }, 'الأحرف: ', chars), el('span', { class: 'stat' }, 'الحجم: ', bytes)),
          el('label', { class: 'flabel' }, 'محتوى الرسالة ', el('small', { class: 'muted' }, '(اختياري — نص فوق الإيمبد)')),
          ta(cur, 'content', 'اكتب نص الرسالة هنا...', 2000, 3),
          modeBox,
          el('div', { class: 'colorrow2' }, el('span', { class: 'flabel' }, 'لون الشريط الجانبي'), sw, colorIn),
          embbox,
          el('div', { class: 'flabel' }, 'الأزرار والقوائم (رد تلقائي عند الضغط)'),
          kindBox, phBox, actBox, addActBox,
          el('div', { class: 'btnrow end' },
            el('button', { class: 'btn ghost danger', type: 'button', disabled: ro, onclick: delCur }, icon('trash'), 'حذف'),
            el('button', { class: 'btn ghost', type: 'button', disabled: ro, onclick: sendCur }, icon('send'), 'إرسال للقناة'),
            el('button', { class: 'btn primary', type: 'button', disabled: ro, onclick: saveCur }, 'حفظ'))));
      paintBox(); drawSw(); drawMode(); drawFields(); drawAddField(); drawKind(); drawActs(); upd();
    }

    function build() {
      const ro = !d.canManage;
      put(box,
        el('p', { class: 'eyebrow' }, 'SYSTEM MODULE'),
        el('h1', { class: 'greet' }, 'إيمبد'),
        el('p', { class: 'lead' }, 'إنشاء رسائل إيمبد مع أزرار رد تلقائي أو قوائم منسدلة'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل الإيمبد.') : null,
        listBox, edBox,
        el('small', { class: 'muted' }, `${list.length} / ${d.limits.count} إيمبد`));
      drawList(); drawEditor();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
  // ---------------- الرتب التلقائية ----------------
  function pageAutoRoles(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, tab = 'join', bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/autoroles`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/autoroles`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const pane = el('div', { class: 'stack' });
      const tabsBox = el('div', { class: 'ptabs', role: 'tablist' });
      const tabs = [['join', 'رتب الدخول التلقائية', 'userplus', false], ['activity', 'مزامنة الألعاب (Activity)', 'grid', true]];
      const drawTabs = () => put(tabsBox, tabs.map(([id, l, ic, prem]) =>
        el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), class: 'ptab' + (tab === id ? ' on' : ''), onclick: () => { tab = id; drawTabs(); drawPane(); } },
          icon(ic), l, prem ? el('span', { class: 'pbadge' }, icon('crown'), 'بريميوم') : null)));

      const sw = toggle(cfg.enabled, (v) => { cfg.enabled = v; touch(); }, ro);
      sw.classList.add('green');

      const roleBlock = (title, ic, cls, key) =>
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox ' + cls }, icon(ic)), el('h2', {}, title)),
          multiPick(d.roles, cfg[key], 'لم يتم اختيار رتب', ro, (v) => { cfg[key] = v; touch(); }));

      const joinPane = () => [
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' },
            el('div', { class: 'mrow' }, el('span', { class: 'hbox gold' }, icon('bolt')),
              el('div', {}, el('h2', {}, 'تفعيل نظام رتب الدخول'), el('small', { class: 'muted' }, 'منح الرتب تلقائياً فور انضمام العضو'))),
            sw)),
        roleBlock('رتب الأعضاء (Users)', 'users', 'blue', 'users'),
        roleBlock('رتب البوتات (Bots)', 'bot', 'orange', 'bots'),
        el('p', { class: 'fine start' }, 'لازم تكون رتبة البوت أعلى من الرتب المختارة. الرتب اللي فيها صلاحيات إدارية أو رتب البوتات المدارة (managed) ما بتنقبل.'),
      ];

      const activityPane = () => [
        el('div', { class: 'lockbox' },
          el('div', { class: 'phd' }, icon('crown', 'goldc'), el('h2', {}, d.guildPremium ? 'مزامنة الألعاب قيد التجهيز 🚧' : 'هذه الميزة تتطلب اشتراك بريميوم نشط')),
          el('p', { class: 'muted' }, 'منح رتبة للعضو تلقائياً حسب اللعبة اللي بلعبها.'),
          d.guildPremium ? null : el('a', { class: 'btn primary small', href: `#/g/${gid}/premium` }, 'ترقية إلى البريميوم')),
      ];

      const drawPane = () => put(pane, tab === 'join' ? joinPane() : activityPane());

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'JOIN MODULE'),
        el('h1', { class: 'greet' }, 'الرتب التلقائية'),
        el('p', { class: 'lead' }, 'إدارة منح الرتب للأعضاء بشكل آلي عند الدخول أو بناءً على النشاط.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        tabsBox, pane, bar.node);
      drawTabs(); drawPane(); bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
    // =====================  الرتب القابلة للأخذ  =====================
  Object.assign(ICONS, { tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>' });
  Object.assign(ERRS, {
    bad_role: 'اختر رتبة صالحة لكل عنصر.',
    dup_role: 'نفس الرتبة مكررة بنفس اللوحة.',
    no_roles: 'أضف رتبة وحدة على الأقل قبل الإرسال.',
  });

  function pageRolePanels(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, list = [], cur = null, baseCur = null;
    const PAL = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f98a77', '#2b2d31', '#ffffff'];
    const STY = [['primary', 'أزرق'], ['secondary', 'رمادي'], ['success', 'أخضر'], ['danger', 'أحمر']];
    const TYPES = [['button', 'أزرار'], ['select', 'قائمة'], ['reaction', 'ردود فعل']];
    const blank = () => ({ id: '', name: 'لوحة جديدة', type: 'button', channel: null, content: '', mode: 'classic', color: '#fbbf24', author: { name: '', icon: '', url: '' }, title: 'اختر رتبتك', titleUrl: '', description: 'اضغط على الزر أو اختر من القائمة للحصول على الرتبة المطلوبة.', thumbnail: '', fields: [], image: '', footer: { text: '', icon: '' }, timestamp: false, placeholder: '', roles: [] });
    const isRO = () => !d.canManage;
    const dirty = () => !!cur && JSON.stringify(cur) !== JSON.stringify(baseCur);
    const touch = () => { window.onbeforeunload = dirty() ? () => true : null; };
    const tabsBox = el('div', { class: 'ptabs', role: 'tablist' });
    const edBox = el('div', {});

    async function load() {
      try { d = await api(`/api/guild/${gid}/rolepanels`); } catch (e) { put(box, errorBox(load)); return; }
      list = d.panels;
      cur = list[0] ? clone(list[0]) : null;
      baseCur = cur ? clone(cur) : null;
      build();
    }
    function openPanel(p) {
      if (dirty() && !confirm('في تغييرات غير محفوظة، تتجاهلها؟')) return;
      cur = p ? clone(p) : blank();
      baseCur = clone(cur);
      touch(); drawTabs(); drawEditor();
    }
    function drawTabs() {
      const newUnsaved = cur && !cur.id;
      put(tabsBox,
        list.map((p) => el('button', { type: 'button', role: 'tab', class: 'ptab' + (cur && cur.id === p.id ? ' on' : ''), onclick: () => openPanel(p) }, icon('star'), p.name)),
        newUnsaved ? el('button', { type: 'button', class: 'ptab on' }, icon('star'), cur.name) : null,
        el('button', { type: 'button', class: 'ptab dashed', disabled: isRO() || newUnsaved || list.length >= d.limits.panels, onclick: () => openPanel(null) }, icon('plus'), 'لوحة جديدة'));
    }

    function drawEditor() {
      if (!cur) { put(edBox, el('div', { class: 'empty boxed' }, icon('tag'), el('p', {}, 'ما في لوحات بعد. اضغط «لوحة جديدة» للبدء'))); return; }
      const ro = isRO(), lim = d.limits;
      const chars = el('span', {}), bytes = el('span', {});
      const prev = el('div', { class: 'rpprev' });
      const cap = () => Math.min(lim.roles, cur.type === 'reaction' ? 20 : 25);
      const cnt = el('small', { class: 'muted' });
      const embbox = el('div', { class: 'embbox' });
      const paintBox = () => { embbox.style.borderInlineStartColor = cur.color; };

      const drawPrev = () => {
        const c = cur, e = embCore(c).embed;
        const lab = (x) => [x.emoji, x.label].filter(Boolean).join(' ') || '…';
        put(prev, el('div', { class: 'rpmsg' },
          el('div', { class: 'rpname' }, 'البوت', el('span', { class: 'rpbot' }, 'BOT')),
          c.content ? el('div', {}, c.content) : null,
          e ? el('div', { class: 'rpemb', style: 'border-inline-start-color:' + c.color },
            c.author.name ? el('small', {}, c.author.name) : null,
            c.title ? el('b', {}, c.title) : null,
            c.description ? el('p', {}, c.description) : null,
            c.fields.map((f) => el('div', { class: 'rpfield' }, el('b', {}, f.name), el('span', {}, f.value))),
            /^https:\/\//i.test(c.image) ? el('img', { class: 'rpimg', src: c.image, alt: '' }) : null,
            c.footer.text ? el('small', {}, c.footer.text) : null) : null,
          c.type === 'button' ? el('div', { class: 'rpbtns' }, c.roles.map((x) => el('span', { class: 'rpbtn s-' + x.style }, lab(x)))) : null,
          c.type === 'select' ? el('div', { class: 'rpsel' }, c.placeholder || 'اختر...') : null,
          c.type === 'reaction' ? el('div', { class: 'rpbtns' }, c.roles.map((x) => el('span', { class: 'rpreact' }, x.emoji || '؟'))) : null));
      };
      const upd = () => {
        const m = embMeasure({ ...cur, kind: cur.type === 'reaction' ? 'none' : cur.type, actions: cur.roles });
        chars.textContent = `${m.chars}/${lim.chars}`;
        bytes.textContent = `${(m.bytes / 1024).toFixed(1)}KB/${(lim.bytes / 1024).toFixed(1)}KB`;
        if (chars.parentNode) chars.parentNode.classList.toggle('over', m.chars > lim.chars);
        if (bytes.parentNode) bytes.parentNode.classList.toggle('over', m.bytes > lim.bytes);
        cnt.textContent = `(${cur.roles.length}/${cap()})`;
        drawPrev(); touch();
      };
      const bind = (node, obj, key, after) => { node.value = obj[key] || ''; node.disabled = ro; node.addEventListener('input', () => { obj[key] = node.value; if (after) after(); upd(); }); return node; };
      const tin = (obj, key, ph, max, type) => bind(el('input', { class: 'inp', type: type || 'text', placeholder: ph, maxlength: max, 'aria-label': ph }), obj, key);
      const ta = (obj, key, ph, max, rows) => bind(el('textarea', { class: 'inp ta', rows, placeholder: ph, maxlength: max, 'aria-label': ph }), obj, key);

      // اللون + الوضع
      const colorIn = el('input', { type: 'color', class: 'colorin big', value: cur.color, disabled: ro, 'aria-label': 'لون الشريط' });
      const sw = el('div', { class: 'swatches' });
      const drawSw = () => put(sw, PAL.map((c) => el('button', { type: 'button', class: 'swatch' + (cur.color === c ? ' on' : ''), style: 'background:' + c, disabled: ro, 'aria-label': c, onclick: () => { cur.color = c; colorIn.value = c; paintBox(); drawSw(); upd(); } })));
      colorIn.addEventListener('input', () => { cur.color = colorIn.value; paintBox(); drawSw(); upd(); });
      const modeBox = el('div', { class: 'mtabs' });
      const drawMode = () => put(modeBox,
        el('button', { type: 'button', class: 'mtab' + (cur.mode === 'classic' ? ' on' : ''), disabled: ro, onclick: () => { cur.mode = 'classic'; drawMode(); upd(); } }, icon('grid'), 'إيمبد كلاسيك'),
        el('button', { type: 'button', class: 'mtab' + (cur.mode === 'v2' ? ' on' : ''), disabled: ro, onclick: () => { cur.mode = 'v2'; drawMode(); upd(); } }, icon('grid'), 'مكونات V2', el('em', { class: 'newb' }, 'جديد')));

      // الحقول الفرعية
      const fieldsBox = el('div', { class: 'stack' });
      const addFieldBtn = el('div', {});
      const drawFields = () => put(fieldsBox, cur.fields.map((f, i) => el('div', { class: 'subrow' },
        tin(f, 'name', 'اسم الحقل', 256), tin(f, 'value', 'قيمة الحقل', 1024),
        el('label', { class: 'chk' }, (() => { const c = el('input', { type: 'checkbox', disabled: ro }); c.checked = !!f.inline; c.addEventListener('change', () => { f.inline = c.checked; upd(); }); return c; })(), 'بجانب بعض'),
        el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف الحقل', onclick: () => { cur.fields.splice(i, 1); drawFields(); drawAddField(); upd(); } }, icon('trash')))));
      const drawAddField = () => put(addFieldBtn, el('button', { class: 'btn primary small', type: 'button', disabled: ro || cur.fields.length >= 10, onclick: () => { cur.fields.push({ name: '', value: '', inline: false }); drawFields(); drawAddField(); upd(); } }, icon('plus'), `أضف حقل فرعي (${cur.fields.length}/10)`));

      // نوع اللوحة + الرتب
      const typeBox = el('div', { class: 'mtabs' });
      const phBox = el('div', {});
      const rolesBox = el('div', { class: 'stack' });
      const addRoleBox = el('div', {});
      const drawType = () => {
        put(typeBox, TYPES.map(([k, l]) => el('button', { type: 'button', class: 'mtab' + (cur.type === k ? ' on' : ''), disabled: ro, onclick: () => { cur.type = k; drawType(); drawRoles(); upd(); } }, l)));
        put(phBox,
          cur.type === 'select' ? [el('label', { class: 'flabel' }, 'النص الظاهر على القائمة'), tin(cur, 'placeholder', 'اختر رتبتك...', 150)] : null,
          cur.type === 'reaction' ? el('small', { class: 'muted' }, 'البوت بيحط الإيموجيات تحت الرسالة. العضو بيضغط عليها بياخد الرتبة، ولما يشيل الإيموجي بتنسحب منه.') : null);
      };
      const drawRoles = () => {
        put(rolesBox, cur.roles.map((x, i) => {
          const rs = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'الرتبة' },
            el('option', { value: '' }, '-- اختر الرتبة --'),
            d.roles.map((o) => el('option', { value: o.id, selected: o.id === x.roleId }, o.name)));
          rs.addEventListener('change', () => {
            x.roleId = rs.value;
            const o = d.roles.find((z) => z.id === rs.value);
            if (o && !x.label.trim() && cur.type !== 'reaction') { x.label = o.name; drawRoles(); }
            upd();
          });
          const sty = cur.type === 'button'
            ? el('div', { class: 'rpstyles' }, STY.map(([s, l]) => el('button', { type: 'button', class: 'rpst s-' + s + (x.style === s ? ' on' : ''), disabled: ro, onclick: () => { x.style = s; drawRoles(); upd(); } }, l)))
            : null;
          return el('div', { class: 'actrow' },
            el('div', { class: 'subrow' },
              tin(x, 'emoji', '😀', 64),
              cur.type === 'reaction' ? null : tin(x, 'label', 'اسم الرتبة (النص الظاهر)', cur.type === 'select' ? 100 : 80),
              el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف', onclick: () => { cur.roles.splice(i, 1); drawRoles(); upd(); } }, icon('trash'))),
            rs, sty);
        }));
        put(addRoleBox, el('button', {
          class: 'addbox', type: 'button', disabled: ro || cur.roles.length >= cap(),
          onclick: () => { cur.roles.push({ label: '', emoji: '', style: 'primary', roleId: '' }); drawRoles(); upd(); },
        }, icon('plus'), 'إضافة رتبة'));
        upd();
      };

      const chSel = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'القناة' }, el('option', { value: '' }, 'اختر القناة...'),
        d.channels.map((c) => el('option', { value: c.id, selected: c.id === cur.channel }, '# ' + c.name)));
      chSel.addEventListener('change', () => { cur.channel = chSel.value || null; upd(); });

      put(embbox,
        el('div', { class: 'subrow' }, tin(cur.author, 'name', 'اسم الكاتب', 256), tin(cur.author, 'icon', 'رابط أيقونة الكاتب', 500), tin(cur.author, 'url', 'رابط الكاتب', 500)),
        el('div', { class: 'subrow' }, tin(cur, 'title', 'عنوان الإيمبد', 256), tin(cur, 'titleUrl', 'رابط العنوان (اختياري)', 500)),
        ta(cur, 'description', 'وصف الإيمبد', 4096, 5),
        tin(cur, 'thumbnail', 'رابط الصورة المصغرة (Thumbnail)', 500),
        fieldsBox, addFieldBtn,
        tin(cur, 'image', 'رابط الصورة الكبيرة', 500),
        el('div', { class: 'subrow' }, tin(cur.footer, 'text', 'نص الفوتر', 2048), tin(cur.footer, 'icon', 'رابط أيقونة الفوتر', 500)),
        el('label', { class: 'chk' }, (() => { const c = el('input', { type: 'checkbox', disabled: ro }); c.checked = !!cur.timestamp; c.addEventListener('change', () => { cur.timestamp = c.checked; upd(); }); return c; })(), 'إظهار وقت الإرسال'));

      async function saveCur() {
        try {
          const isNew = !cur.id;
          const j = isNew ? await apiSend('POST', `/api/guild/${gid}/rolepanels`, { panel: cur }) : await apiSend('PUT', `/api/guild/${gid}/rolepanels/${cur.id}`, { panel: cur });
          cur = clone(j.panel); baseCur = clone(j.panel);
          const i = list.findIndex((p) => p.id === cur.id);
          if (i >= 0) list[i] = clone(cur); else list.push(clone(cur));
          fl.show('تم حفظ اللوحة ✅'); touch(); drawTabs(); drawEditor();
          return true;
        } catch (e) { fl.show(errText(e), false); return false; }
      }
      async function sendCur() {
        if (!cur.channel) return fl.show(ERRS.no_channel, false);
        if (!cur.roles.length) return fl.show(ERRS.no_roles, false);
        if ((dirty() || !cur.id) && !(await saveCur())) return;
        try {
          const j = await apiSend('POST', `/api/guild/${gid}/rolepanels/${cur.id}/send`);
          if (j.failed) fl.show(`انرسلت الرسالة بس فشل ${j.failed} إيموجي (تأكد من صلاحية Add Reactions)`, false);
          else fl.show('تم إرسال اللوحة للقناة ✅');
        } catch (e) { fl.show(errText(e), false); }
      }
      async function delCur() {
        if (!cur.id) { cur = null; baseCur = null; touch(); drawTabs(); drawEditor(); return; }
        if (!confirm('حذف هذه اللوحة؟ الرسالة المرسلة سابقاً بتبقى بس بتوقف.')) return;
        try {
          await apiSend('DELETE', `/api/guild/${gid}/rolepanels/${cur.id}`);
          list = list.filter((p) => p.id !== cur.id);
          cur = list[0] ? clone(list[0]) : null; baseCur = cur ? clone(cur) : null;
          fl.show('تم الحذف'); touch(); drawTabs(); drawEditor();
        } catch (e) { fl.show(errText(e), false); }
      }

      put(edBox,
        el('section', { class: 'panelc edpanel' },
          el('div', { class: 'phd' }, icon('tag', 'goldc'), el('h2', {}, cur.name || 'لوحة')),
          el('div', { class: 'sep' }),
          el('div', { class: 'twocol' },
            el('div', { class: 'pf' }, el('span', {}, 'نوع اللوحة'), typeBox),
            el('label', { class: 'pf' }, el('span', {}, 'القناة'), chSel)),
          el('label', { class: 'pf' }, el('span', {}, 'اسم اللوحة'), tin(cur, 'name', 'اسم اللوحة', 60)),
          phBox,
          el('div', { class: 'flabel' }, 'رسالة اللوحة'),
          el('div', { class: 'statbar' },
            el('span', { class: 'sbadge' }, 'باقة السيرفر: ', d.guildPremium ? 'بريميوم' : 'الباقة العادية (حد مجاني)'),
            el('span', { class: 'stat' }, 'الأحرف: ', chars), el('span', { class: 'stat' }, 'الحجم: ', bytes)),
          el('label', { class: 'flabel' }, 'محتوى الرسالة ', el('small', { class: 'muted' }, '(اختياري — نص فوق الإيمبد)')),
          ta(cur, 'content', 'اكتب نص الرسالة هنا...', 2000, 3),
          modeBox,
          el('div', { class: 'colorrow2' }, el('span', { class: 'flabel' }, 'لون الشريط الجانبي'), sw, colorIn),
          embbox,
          el('div', { class: 'flabel' }, 'الرتب ', cnt),
          rolesBox, addRoleBox,
          el('div', { class: 'flabel' }, 'معاينة'),
          prev,
          el('small', { class: 'muted' }, 'بعد أي تعديل اضغط «إرسال الرسالة» مرة ثانية عشان تنحدّث الرسالة بالقناة (بتنرسل رسالة جديدة).'),
          el('div', { class: 'btnrow end' },
            el('button', { class: 'btn ghost danger', type: 'button', disabled: ro, onclick: delCur }, icon('trash'), 'حذف'),
            el('button', { class: 'btn ghost', type: 'button', disabled: ro, onclick: sendCur }, icon('send'), 'إرسال الرسالة'),
            el('button', { class: 'btn primary', type: 'button', disabled: ro, onclick: saveCur }, 'حفظ'))));
      paintBox(); drawSw(); drawMode(); drawFields(); drawAddField(); drawType(); drawRoles();
    }

    function build() {
      put(box,
        el('div', { class: 'rowbar' },
          el('div', {}, el('p', { class: 'eyebrow' }, 'SYSTEM MODULE'), el('h1', { class: 'greet' }, 'الرتب القابلة للأخذ')),
          el('span', { class: 'sbadge' }, `الحد ${d.guildPremium ? '' : 'المجاني'}: ${d.limits.panels} لوحات | ${d.limits.roles} رتب للرسالة`)),
        fl,
        isRO() ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل اللوحات.') : null,
        tabsBox, edBox);
      drawTabs(); drawEditor();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
    // =====================  نظام المستويات  =====================
  Object.assign(ICONS, { trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>' });
  Object.assign(ERRS, {
    bad_role: 'اختر رتبة صالحة لكل مكافأة.',
    dup_role: 'نفس الرتبة مكررة بأكثر من مكافأة.',
    no_reward_role: 'اختر رتبة لكل مكافأة قبل الحفظ.',
  });

  function pageLevels(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/levels`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      if (cfg.rewards.some((x) => !x.roleId)) return fl.show(ERRS.no_reward_role, false);
      try {
        await apiSend('PUT', `/api/guild/${gid}/levels`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;

      const sw = toggle(cfg.enabled, (v) => { cfg.enabled = v; touch(); }, ro);
      sw.classList.add('green');

      const chSel = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'قناة التهنئة' },
        el('option', { value: '' }, '— بدون قناة —'),
        d.channels.map((c) => el('option', { value: c.id, selected: c.id === cfg.channel }, '# ' + c.name)));
      chSel.addEventListener('change', () => { cfg.channel = chSel.value || null; touch(); });

      const ta = el('textarea', { class: 'inp ta', rows: 4, maxlength: 1000, disabled: ro, 'aria-label': 'نص الرسالة' });
      ta.value = cfg.message;
      ta.addEventListener('input', () => { cfg.message = ta.value; touch(); });
      const ins = (t) => {
        if (ro) return;
        const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        const e = ta.selectionEnd == null ? s : ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
        ta.selectionStart = ta.selectionEnd = s + t.length;
        ta.dispatchEvent(new Event('input'));
        ta.focus();
      };

      const stepper = (obj, key, lo, hi, label, ic) => {
        const inp = el('input', { type: 'number', min: lo, max: hi, value: obj[key], disabled: ro, 'aria-label': label });
        const set = (v) => { v = Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo)); obj[key] = v; inp.value = v; touch(); };
        inp.addEventListener('change', () => set(inp.value));
        return el('div', { class: 'pf' },
          el('span', { class: 'iconlbl' }, icon(ic), label),
          el('div', { class: 'nstep' },
            el('button', { type: 'button', disabled: ro, 'aria-label': 'زيادة', onclick: () => set(obj[key] + 1) }, '+'),
            inp,
            el('button', { type: 'button', disabled: ro, 'aria-label': 'نقصان', onclick: () => set(obj[key] - 1) }, '−')));
      };

      const rewardsBox = el('div', { class: 'stack' });
      const addBtn = el('button', { class: 'btn ghost small', type: 'button', onclick: () => {
        cfg.rewards.push({ roleId: '', text: 1, voice: 0, dm: true, removePrev: true });
        drawRewards(); touch();
      } }, icon('plus'), 'إضافة مكافأة');

      const drawRewards = () => {
        addBtn.disabled = ro || cfg.rewards.length >= 25;
        put(rewardsBox, cfg.rewards.length
          ? cfg.rewards.map((x, i) => {
              const rs = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'الرتبة الممنوحة' },
                el('option', { value: '' }, 'اختر رتبة...'),
                d.roles.map((o) => el('option', { value: o.id, selected: o.id === x.roleId }, o.name)));
              rs.addEventListener('change', () => { x.roleId = rs.value; touch(); });
              const tg = (label, key) => el('label', { class: 'rwt' }, toggle(x[key], (v) => { x[key] = v; touch(); }, ro), label);
              return el('div', { class: 'rwcard' },
                el('div', { class: 'rowbar' },
                  el('b', { class: 'goldc' }, `مكافأة #${i + 1}`),
                  el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف المكافأة', onclick: () => { cfg.rewards.splice(i, 1); drawRewards(); touch(); } }, icon('trash'))),
                el('div', { class: 'pf' }, el('span', { class: 'iconlbl' }, icon('shield'), 'الرتبة الممنوحة'), rs),
                el('div', { class: 'rwgrid' },
                  stepper(x, 'text', 1, 1000, 'مستوى كتابي مطلوب', 'chat'),
                  stepper(x, 'voice', 0, 1000, 'مستوى صوتي مطلوب (0 = غير مطلوب)', 'mic')),
                el('div', { class: 'rwtog' }, tg('إرسال رسالة خاصة', 'dm'), tg('إزالة الرتب السابقة', 'removePrev')));
            })
          : el('div', { class: 'empty' }, icon('trophy'), el('p', {}, 'لا توجد مكافآت — أضف مكافأة بالضغط أعلاه')));
      };

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'XP & LEVELLING SYSTEM'),
        el('h1', { class: 'greet' }, 'نظام المستويات'),
        el('p', { class: 'lead' }, 'مكافأة الأعضاء بالخبرة (XP) والرتب التلقائية للنشاط الكتابي والصوتي.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' },
            el('div', { class: 'mrow' }, el('span', { class: 'hbox gold' }, icon('bolt')),
              el('div', {}, el('h2', {}, 'تفعيل نظام المستويات'), el('small', { class: 'muted' }, 'يحصل الأعضاء على XP بعد التفعيل'))),
            sw)),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox blue' }, icon('chat')),
            el('div', {}, el('h2', {}, 'رسالة التهنئة'), el('small', { class: 'muted' }, 'تُرسل تلقائياً عند وصول عضو لمستوى جديد'))),
          el('div', { class: 'sep' }),
          el('label', { class: 'flabel' }, '# قناة إرسال رسالة التهنئة'), chSel,
          el('label', { class: 'flabel' }, 'نص الرسالة'), ta,
          el('div', { class: 'vgrid' }, [['[user]', 'يمنشن العضو'], ['[userName]', 'اسم العضو'], ['[level]', 'المستوى'], ['[type]', 'كتابي/صوتي'], ['[server]', 'اسم السيرفر']].map(([k, t]) =>
            el('button', { type: 'button', class: 'vchip', disabled: ro, onclick: () => ins(k) }, el('code', { dir: 'ltr' }, k), el('small', {}, t))))),
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' },
            el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('trophy')),
              el('div', {}, el('h2', {}, 'مكافآت المستويات'), el('small', { class: 'muted' }, 'رتبة تُمنح تلقائياً عند بلوغ شرط معين'))),
            addBtn),
          el('div', { class: 'sep' }),
          rewardsBox),
        el('p', { class: 'fine start' }, 'المستوى الكتابي من رسائلك (XP مرة كل دقيقة)، والصوتي من الدقائق بالفويس (10 XP لكل دقيقة). الرتبة بتنعطى لما يحقق العضو الشرطين معاً. رتبة البوت لازم تكون فوق الرتب المختارة، والرتب الإدارية ما بتنقبل.'),
        bar.node);
      drawRewards(); bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
    // =====================  تنظيم القنوات  =====================
  Object.assign(ICONS, {
    broom: '<path d="M19 3l-7 7M9 9l6 6-4 5c-2 1-5 1-7 0 2-1 2-4 3-6z"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z"/>',
    textT: '<path d="M5 5h14M12 5v14M9 19h6"/>',
    dashed: '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 3"/>',
    pointer: '<path d="M9 11V5a2 2 0 0 1 4 0v6M13 10a2 2 0 0 1 4 0v3a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2-3a2 2 0 0 1 3-2l1 1"/>',
  });

  function pageChannelSync(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    const openSet = new Set();
    let d = null, cfg = null, base = null, bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();
    const FILTERS = [
      ['none', 'بدون تصفية', 'السماح بكل شيء', 'dashed'],
      ['images', 'صور فقط', 'حذف النصوص والفيديوهات', 'image'],
      ['videos', 'فيديو فقط', 'حذف الصور والنصوص', 'film'],
      ['media', 'صور وفيديو', 'حذف النصوص فقط', 'dashed'],
      ['text', 'نصوص فقط', 'حذف الصور والفيديوهات', 'textT'],
    ];

    async function load() {
      try { d = await api(`/api/guild/${gid}/chsync`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/chsync`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const list = el('div', { class: 'stack' });
      const count = el('span', {});
      const addSel = el('select', { class: 'sel', 'aria-label': 'إضافة قناة' });
      addSel.addEventListener('change', () => {
        if (!addSel.value) return;
        cfg.channels.push({ id: addSel.value, filter: 'none', line: false, reactions: [] });
        openSet.add(addSel.value);
        drawAll(); touch();
      });
      const sw = toggle(cfg.enabled, (v) => { cfg.enabled = v; touch(); }, ro);
      sw.classList.add('green');

      function card(c) {
        const used = new Set(cfg.channels.map((x) => x.id));
        const chSel = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'القناة' },
          d.channels.filter((x) => x.id === c.id || !used.has(x.id)).map((x) => el('option', { value: x.id, selected: x.id === c.id }, '# ' + x.name)));
        chSel.addEventListener('change', () => {
          const old = c.id; c.id = chSel.value;
          if (openSet.delete(old)) openSet.add(c.id);
          drawAll(); touch();
        });

        const body = el('div', { class: 'cbody' + (openSet.has(c.id) ? '' : ' hidden') });
        const rxIn = el('input', { class: 'inp', type: 'text', maxlength: 64, placeholder: 'أضف إيموجي...', disabled: ro, 'aria-label': 'إيموجي' });
        function addRx() {
          const v = rxIn.value.trim();
          if (!v) return;
          if (!/^<a?:\w{1,32}:\d{15,25}>$/.test(v) && !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(v)) return fl.show(ERRS.bad_emoji, false);
          if (c.reactions.includes(v)) { rxIn.value = ''; return; }
          if (c.reactions.length >= 5) return fl.show('الحد الأقصى 5 إيموجيات.', false);
          c.reactions.push(v); rxIn.value = '';
          drawBody(); touch();
        }
        rxIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addRx(); } });

        function drawBody() {
          put(body,
            el('div', { class: 'csec' },
              el('div', { class: 'phd' }, icon('broom', 'goldc'), el('h3', {}, 'تصفية المحتوى')),
              el('div', { class: 'fgrid' }, FILTERS.map(([k, t, s, ic]) =>
                el('button', { type: 'button', class: 'fopt' + (c.filter === k ? ' on' : ''), disabled: ro, 'aria-pressed': String(c.filter === k),
                  onclick: () => { c.filter = k; drawBody(); touch(); } },
                  icon(ic), el('b', {}, t), el('small', {}, s))))),
            el('div', { class: 'sep' }),
            el('div', { class: 'trow' },
              el('div', { class: 'phd' }, icon('dashed', 'goldc'), el('h3', {}, 'الخط الفاصل')),
              toggle(c.line, (v) => { c.line = v; touch(); }, ro)),
            el('div', { class: 'sep' }),
            el('div', { class: 'csec' },
              el('div', { class: 'phd' }, icon('pointer', 'goldc'), el('h3', {}, 'التفاعلات التلقائية'), el('small', { class: 'muted' }, `${c.reactions.length}/5`)),
              el('div', { class: 'chips' }, c.reactions.map((e, i) =>
                el('span', { class: 'achip' }, e,
                  el('button', { type: 'button', class: 'x', disabled: ro, 'aria-label': 'إزالة', onclick: () => { c.reactions.splice(i, 1); drawBody(); touch(); } }, '×')))),
              el('div', { class: 'addrow' }, rxIn,
                el('button', { class: 'plus', type: 'button', disabled: ro, 'aria-label': 'إضافة', onclick: addRx }, icon('plus')))));
        }
        drawBody();

        const flip = () => {
          if (openSet.has(c.id)) openSet.delete(c.id); else openSet.add(c.id);
          body.classList.toggle('hidden', !openSet.has(c.id));
        };
        return el('section', { class: 'ccard' },
          el('div', { class: 'chrow' },
            el('span', { class: 'hbox gold' }, icon('hash')),
            chSel,
            el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'تعديل', onclick: flip }, icon('pen')),
            el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف', onclick: () => {
              if (!confirm('حذف هذه القناة من التنظيم؟')) return;
              cfg.channels = cfg.channels.filter((x) => x !== c); openSet.delete(c.id); drawAll(); touch();
            } }, icon('trash'))),
          body);
      }

      function drawAll() {
        const used = new Set(cfg.channels.map((c) => c.id));
        put(addSel, el('option', { value: '' }, '# إضافة قناة'), d.channels.filter((c) => !used.has(c.id)).map((c) => el('option', { value: c.id }, '# ' + c.name)));
        addSel.disabled = ro || cfg.channels.length >= d.max;
        count.textContent = `(${cfg.channels.length})`;
        put(list, cfg.channels.length
          ? cfg.channels.map(card)
          : el('div', { class: 'empty boxed' }, icon('broom'), el('p', {}, 'لا توجد قنوات منظمة حالياً'),
              el('small', { class: 'muted' }, 'ابدأ بإضافة قناة وتخصيص الفلتر والخط الفاصل لها')));
      }

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'CHANNEL SYNC'),
        el('h1', { class: 'greet' }, 'تنظيم القنوات'),
        el('p', { class: 'lead' }, 'تحكم كامل في محتوى القنوات، الخطوط الفاصلة، والرياكشنات التلقائية.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc masterc' },
          el('div', { class: 'trow' },
            el('div', { class: 'mrow' }, el('span', { class: 'mico' }, icon('broom')),
              el('div', {}, el('h2', {}, 'تفعيل النظام العام'), el('small', { class: 'muted' }, 'تشغيل إعدادات تنظيم السيرفر'))),
            sw)),
        el('div', { class: 'rowbar' },
          el('div', { class: 'phd' }, icon('gear', 'goldc'), el('h2', {}, 'إعدادات القنوات ', count),
            el('span', { class: 'pbadge' }, `${d.guildPremium ? 'الحد' : 'الحد المجاني'}: ${d.max} قنوات`)),
          addSel),
        list, bar.node);
      drawAll(); bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
    // =====================  الروم المؤقت  =====================
  Object.assign(ICONS, {
    gamepad: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5M16 11h.01M18.5 14h.01"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  });

  function pageTempVoice(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, bar = null, top = 'general', sub = 'general';
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/tempvoice`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/tempvoice`, { cfg });
        fl.show('تم حفظ الإعدادات ✅');
        await load(); // عشان تظهر القنوات اللي انعملت تلقائياً
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const main = el('div', { class: 'stack' });
      const topTabs = el('div', { class: 'ptabs', role: 'tablist' });
      const subTabs = el('div', { class: 'mtabs' });
      const pane = el('div', { class: 'stack' });
      const green = (on, fn) => { const s = toggle(on, (v) => { fn(v); touch(); }, ro); s.classList.add('green'); return s; };

      const chanSel = (key, list, label, ic, optional, emptyText) => {
        const s = el('select', { class: 'sel full', disabled: ro, 'aria-label': label },
          el('option', { value: '' }, emptyText || 'تُنشأ تلقائياً...'),
          list.map((c) => el('option', { value: c.id, selected: c.id === cfg[key] }, (key === 'category' ? '' : '# ') + c.name)));
        s.addEventListener('change', () => { cfg[key] = s.value || null; touch(); });
        return el('div', { class: 'stack tight' },
          el('label', { class: 'flabel iconlbl' }, icon(ic), label, optional ? el('small', { class: 'muted' }, '(اختياري)') : null), s);
      };

      const nstep = (key, lo, hi, label, ic, hint) => {
        const inp = el('input', { type: 'number', min: lo, max: hi, value: cfg[key], disabled: ro, 'aria-label': label });
        const set = (v) => { v = Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo)); cfg[key] = v; inp.value = v; touch(); };
        inp.addEventListener('change', () => set(inp.value));
        return el('div', { class: 'pf' },
          el('span', { class: 'iconlbl' }, icon(ic), label),
          el('div', { class: 'nstep' },
            el('button', { type: 'button', disabled: ro, 'aria-label': 'زيادة', onclick: () => set(cfg[key] + 1) }, '+'),
            inp,
            el('button', { type: 'button', disabled: ro, 'aria-label': 'نقصان', onclick: () => set(cfg[key] - 1) }, '−')),
          el('small', { class: 'muted' }, hint));
      };

      const bhv = (title, hint, key) =>
        el('div', { class: 'bhv' }, el('div', {}, el('b', {}, title), el('small', { class: 'muted' }, hint)), green(cfg[key], (v) => { cfg[key] = v; }));

      // ---- الإعدادات العامة ----
      const generalPane = () => {
        const nameIn = el('input', { class: 'inp', type: 'text', maxlength: 100, disabled: ro, 'aria-label': 'قالب اسم الغرفة' });
        nameIn.value = cfg.nameTpl;
        nameIn.addEventListener('input', () => { cfg.nameTpl = nameIn.value; touch(); });
        const ins = (t) => {
          if (ro) return;
          const s = nameIn.selectionStart == null ? nameIn.value.length : nameIn.selectionStart;
          const e = nameIn.selectionEnd == null ? s : nameIn.selectionEnd;
          nameIn.value = nameIn.value.slice(0, s) + t + nameIn.value.slice(e);
          nameIn.dispatchEvent(new Event('input'));
          nameIn.focus();
        };
        const lock = !d.guildPremium;
        const logSel = el('select', { class: 'sel full', disabled: ro || lock, 'aria-label': 'سجل المحادثات' },
          el('option', { value: '' }, 'اختر قناة السجلات...'),
          d.channels.map((c) => el('option', { value: c.id, selected: c.id === cfg.logChannel }, '# ' + c.name)));
        logSel.addEventListener('change', () => { cfg.logChannel = logSel.value || null; touch(); });

        return el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox purple' }, icon('sliders')),
            el('div', {}, el('h2', {}, 'القنوات والفئات'), el('small', { class: 'muted' }, 'تهيئة أماكن تشغيل نظام الروم المؤقت'))),
          chanSel('joinChannel', d.voiceChannels, 'قناة "انضم للإنشاء"', 'mic', false),
          el('small', { class: 'fine start' }, 'الانضمام لهذه القناة يُنشئ غرفة خاصة تلقائياً'),
          chanSel('controlChannel', d.channels, 'قناة التحكم النصية', 'hash', true),
          chanSel('category', d.categories, 'الفئة (Category)', 'folder', true),
          el('div', { class: 'stack tight' },
            el('div', { class: 'rowbar' },
              el('label', { class: 'flabel iconlbl' }, icon('doc'), 'سجل المحادثات', el('small', { class: 'muted' }, '(اختياري)')),
              lock ? el('span', { class: 'pbadge' }, icon('crown'), 'بريميوم') : null),
            logSel,
            el('small', { class: 'fine start' }, 'يُرسل النص الكامل لدردشة الغرفة عند الحذف'),
            lock ? el('small', { class: 'warnt' }, 'يتطلب اشتراك بريميوم نشط لتحديد قناة وتفعيل سجل المحادثات.') : null),
          el('div', { class: 'sep' }),
          el('div', { class: 'phd' }, el('span', { class: 'hbox orange' }, icon('volume')),
            el('div', {}, el('h2', {}, 'إعدادات الغرفة الافتراضية'), el('small', { class: 'muted' }, 'يمكن لصاحب الغرفة تعديلها لاحقاً'))),
          el('label', { class: 'flabel' }, 'قالب اسم الغرفة'), nameIn,
          el('section', { class: 'subc' },
            el('div', { class: 'flabel' }, 'المتغيرات المتاحة لقالب الاسم • اضغط على أي اختصار لإضافته'),
            el('div', { class: 'vgrid' }, [['{user}', 'اسم العضو الظاهر'], ['{username}', 'اسم مستخدم العضو'], ['{userid}', 'آيدي العضو'], ['{server}', 'اسم السيرفر']].map(([k, t]) =>
              el('button', { type: 'button', class: 'vchip', disabled: ro, onclick: () => ins(k) }, el('code', { dir: 'ltr' }, k), el('small', {}, t))))),
          nstep('limit', 0, 99, 'الحد الأقصى للأعضاء', 'users', '0 = بلا حد'),
          nstep('bitrate', 8, 384, 'البت ريت الافتراضي (kbps)', 'activity', 'حسب مستوى السيرفر'),
          el('div', { class: 'sep' }),
          el('div', { class: 'flabel' }, 'السلوك التلقائي'),
          bhv('حذف الغرفة عند خلوها', 'تُحذف تلقائياً حين لا يتبقى أحد', 'deleteEmpty'),
          bhv('نقل الملكية عند مغادرة المالك', 'تنتقل لأول عضو في الغرفة تلقائياً', 'transferOwner'),
          el('div', { class: 'infobox' },
            el('b', {}, '💡 كيف يعمل النظام؟'),
            el('ul', {},
              el('li', {}, 'عضو ينضم لقناة "انضم للإنشاء" ← تُنشأ غرفة خاصة + رسالة تحكم بـ 9 أزرار'),
              el('li', {}, 'الغرفة تُحذف تلقائياً عند مغادرة جميع الأعضاء'),
              el('li', {}, 'إذا غادر المالك ← تنتقل الملكية للعضو التالي تلقائياً'),
              el('li', {}, 'الفئة والقناة النصية تُنشآن تلقائياً إذا تركتهما فارغتين'))));
      };

      // ---- رسالة التحكم ----
      const ctlPane = () => {
        const c = cfg.ctl;
        const title = el('input', { class: 'inp', type: 'text', maxlength: 256, disabled: ro, 'aria-label': 'عنوان الرسالة' });
        const desc = el('textarea', { class: 'inp ta', rows: 5, maxlength: 2000, disabled: ro, 'aria-label': 'وصف الرسالة' });
        const col = el('input', { type: 'color', class: 'colorin big', disabled: ro, 'aria-label': 'لون الشريط' });
        title.value = c.title; desc.value = c.description; col.value = c.color;
        const prev = el('div', { class: 'rpprev' });
        const drawPrev = () => put(prev, el('div', { class: 'rpmsg' },
          el('div', { class: 'rpname' }, 'البوت', el('span', { class: 'rpbot' }, 'BOT')),
          el('div', { class: 'rpemb', style: 'border-inline-start-color:' + c.color },
            el('b', {}, c.title),
            el('p', {}, c.description.replace(/\{user\}/g, '@أنت').replace(/\{userName\}/g, 'أنت').replace(/\{channel\}/g, '#Room'))),
          el('div', { class: 'rpbtns' }, ['🔒 قفل / فتح', '👁️ إخفاء / إظهار', '✏️ الاسم', '👥 الحد', '👢 طرد', '✅ سماح', '🔁 نقل الملكية', '👑 استلام', '🗑️ حذف']
            .map((t) => el('span', { class: 'rpbtn s-secondary' }, t)))));
        title.addEventListener('input', () => { c.title = title.value; drawPrev(); touch(); });
        desc.addEventListener('input', () => { c.description = desc.value; drawPrev(); touch(); });
        col.addEventListener('input', () => { c.color = col.value; drawPrev(); touch(); });
        drawPrev();
        return el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox blue' }, icon('hash')),
            el('div', {}, el('h2', {}, 'رسالة التحكم'), el('small', { class: 'muted' }, 'تُرسل بقناة التحكم عند إنشاء كل غرفة (المتغيرات: {user} {userName} {channel})'))),
          el('label', { class: 'flabel' }, 'العنوان'), title,
          el('label', { class: 'flabel' }, 'الوصف'), desc,
          el('div', { class: 'colorrow2' }, el('span', { class: 'flabel' }, 'لون الشريط'), col),
          el('div', { class: 'flabel' }, 'معاينة'), prev);
      };

      // ---- الصلاحيات ----
      const permPane = () => {
        const lbl = (t, cls) => el('div', { class: 'plabel ' + cls }, t);
        return el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('lock')),
            el('div', {}, el('h2', {}, 'من يقدر ينشئ غرفة؟'), el('small', { class: 'muted' }, 'إذا تركت المسموح فاضي، الكل يقدر ينشئ'))),
          lbl('المسموح لهم (WhiteList)', 'okc'),
          multiPick(d.roles, cfg.perms.allowRoles, 'الجميع مسموح', ro, (v) => { cfg.perms.allowRoles = v; touch(); }),
          lbl('المحظورين (BlackList)', 'badc'),
          multiPick(d.roles, cfg.perms.blockRoles, 'لا يوجد حظر', ro, (v) => { cfg.perms.blockRoles = v; touch(); }));
      };

      const drawPane = () => put(pane, sub === 'general' ? generalPane() : sub === 'ctl' ? ctlPane() : permPane());
      const master = el('section', { class: 'panelc masterc' },
        el('div', { class: 'trow' },
          el('div', { class: 'mrow' }, el('span', { class: 'mico' }, icon('mic')),
            el('div', {}, el('h2', {}, 'تفعيل النظام'), el('small', { class: 'muted' }, 'تشغيل كافة خدمات الروم المؤقت'))),
          green(cfg.enabled, (v) => { cfg.enabled = v; })));

      const draw = () => {
        put(topTabs, [['general', 'الروم المؤقت العام', 'mic'], ['games', 'روم الألعاب المؤقت', 'gamepad']].map(([id, l, ic]) =>
          el('button', { type: 'button', role: 'tab', 'aria-selected': String(top === id), class: 'ptab' + (top === id ? ' on' : ''), onclick: () => { top = id; draw(); } }, icon(ic), l)));
        if (top === 'games') {
          put(main, el('div', { class: 'empty boxed' }, icon('gamepad'), el('p', {}, 'روم الألعاب المؤقت قيد التجهيز 🚧')));
          return;
        }
        put(subTabs, [['general', 'الإعدادات العامة', 'sliders'], ['ctl', 'رسالة التحكم', 'hash'], ['perm', 'الصلاحيات', 'lock']].map(([id, l, ic]) =>
          el('button', { type: 'button', class: 'mtab' + (sub === id ? ' on' : ''), onclick: () => { sub = id; draw(); } }, icon(ic), l)));
        put(main, master, subTabs, pane);
        drawPane();
      };

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'VOICE NEXUS'),
        el('h1', { class: 'greet' }, 'الروم المؤقت'),
        el('p', { class: 'lead' }, 'إنشاء غرف صوتية خاصة ومؤقتة عند انضمام الأعضاء لقناة مخصصة.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        topTabs, main, bar.node);
      draw(); bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
    // =====================  نظام الفضفضة  =====================
  function pageVent(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/vent`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/vent`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      // المعاينة
      const emb = el('div', { class: 'vemb' });
      const paint = () => { emb.style.borderInlineStartColor = cfg.color; };
      const thumb = userImg(56);
      thumb.className = 'vthumb';
      put(emb, thumb,
        el('div', { class: 'vcode' }, 'هذا نص تجريبي لمعاينة كيف سيظهر الكلام داخل نظام الفضفضة...'),
        el('div', { class: 'vfoot' }, d.guildName + ' · الآن'));
      paint();

      const col = el('input', { type: 'color', class: 'colorin big', value: cfg.color, disabled: ro, 'aria-label': 'لون الإيمبد' });
      col.addEventListener('input', () => { cfg.color = col.value; paint(); touch(); });

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'FEEL PROTOCOL'),
        el('h1', { class: 'greet' }, 'إعدادات نظام الفضفضة'),
        el('p', { class: 'lead' }, 'تخصيص قنوات الفضفضة ولون الإيمبد الخاص بها.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('chat')),
            el('div', {}, el('h2', {}, 'قنوات الفضفضة'), el('small', { class: 'muted' }, 'أي رسالة في هذه القنوات سيتم تحويلها لفضفضة'))),
          el('label', { class: 'flabel' }, 'اختيار الشات:'),
          multiPick(d.channels.map((c) => ({ id: c.id, name: '# ' + c.name })), cfg.channels, 'اختر القنوات...', ro, (v) => { cfg.channels = v; touch(); })),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox blue' }, icon('palette')),
            el('div', {}, el('h2', {}, 'المظهر والألوان'), el('small', { class: 'muted' }, 'تغيير لون إيمبد الفضفضة'))),
          el('div', { class: 'rowbar' }, el('label', { class: 'flabel' }, 'لون الإيمبد:'), col)),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, icon('gear', 'goldc'), el('h2', {}, 'معاينة التصميم')),
          el('div', { class: 'vprev' },
            el('img', { class: 'vav', src: d.bot.avatar, alt: '' }),
            el('div', { class: 'vbody' },
              el('div', { class: 'vhead' }, el('b', {}, d.bot.name), el('span', { class: 'vapp' }, 'APP'), el('span', { class: 'vtime' }, 'Today at ' + time)),
              emb))),
        bar.node);
      bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }  // =====================  التذاكر  =====================
  Object.assign(ICONS, {
    ticket: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 7v10"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    send: '<path d="M4 12l16-8-6 17-3-7z"/>',
  });
  Object.assign(ERRS, { bad_options: 'لازم يكون في خيار واحد على الأقل (الحد الأقصى 25).', no_channel: 'اختر القناة أولاً.' });

  function pageTickets(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    const openSet = new Set();
    let d = null, cfg = null, base = null, bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();
    const STY = [['primary', 'أزرق (Primary)'], ['secondary', 'رمادي (Secondary)'], ['success', 'أخضر (Success)'], ['danger', 'أحمر (Danger)']];
    const newOptId = () => [...crypto.getRandomValues(new Uint8Array(5))].map((x) => x.toString(16).padStart(2, '0')).join('');

    // ---- الإيموجيات ----
    let emojiList = null;
    const getEmojis = async () => emojiList || (emojiList = (await api(`/api/guild/${gid}/emojis`)).list);
    const STD_EMOJIS = ['🎫', '🎧', '🛠️', '💬', '❓', '📩', '🙋', '⚠️', '💰', '🛒', '🤝', '📢', '🔧', '📝', '⭐', '🔒', '👑', '🚨', '🎁', '💡'];
    const emojiUrl = (id, animated) => `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=48`;
    const emojiView = (v) => {
      const m = /^<(a?):(\w+):(\d+)>$/.exec(v || '');
      return m ? el('img', { src: emojiUrl(m[3], m[1]), alt: m[2], width: 24, height: 24 }) : document.createTextNode(v || '');
    };

    // ---- رفع صورة بدل الرابط ----
    function imgPicker(obj, key, disabled) {
      const holder = el('div', { class: 'stack tight' });
      const file = el('input', { type: 'file', accept: IMG_OK.join(','), class: 'hidden' });
      const draw = () => {
        const v = obj[key] || '';
        const src = v.startsWith('up:') ? `/api/guild/${gid}/tickets/img/${v.slice(3)}` : (/^https:\/\//i.test(v) ? v : '');
        put(holder, file,
          src ? el('img', { class: 'upprev', src, alt: '' }) : el('small', { class: 'muted' }, 'لا توجد صورة'),
          el('div', { class: 'btnrow' },
            el('button', { class: 'btn ghost small', type: 'button', disabled, onclick: () => file.click() }, icon('upload'), src ? 'تغيير الصورة' : 'رفع صورة'),
            src ? el('button', { class: 'btn ghost small danger', type: 'button', disabled, onclick: () => { obj[key] = ''; draw(); touch(); } }, icon('trash'), 'إزالة') : null));
      };
      file.addEventListener('change', async () => {
        const f = file.files[0];
        file.value = '';
        if (!f) return;
        try {
          const image = await readImage(f, 5);
          const j = await apiSend('POST', `/api/guild/${gid}/tickets/upload`, { image });
          obj[key] = j.ref; draw(); touch();
        } catch (e) { fl.show(`${errText(e)} (الحد الأقصى 5MB)`, false); }
      });
      draw();
      return holder;
    }

    async function load() {
      try { d = await api(`/api/guild/${gid}/tickets`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/tickets`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
        return true;
      } catch (e) { fl.show(errText(e), false); return false; }
    }
    async function sendPanel() {
      if (!cfg.panel.channel) return fl.show(ERRS.no_channel, false);
      if (dirty() && !(await save())) return;
      try { await apiSend('POST', `/api/guild/${gid}/tickets/send`); fl.show('تم إرسال البانل للقناة ✅'); }
      catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const green = (on, fn) => { const s = toggle(on, (v) => { fn(v); touch(); }, ro); s.classList.add('green'); return s; };
      const lbl = (t) => el('label', { class: 'flabel' }, t);
      const sec = (title, sub, ic, cls, ...kids) =>
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox ' + cls }, icon(ic)),
            el('div', {}, el('h2', {}, title), el('small', { class: 'muted' }, sub))), kids);
      const chanSel = (val, list, ph, fn, prefix, off) => {
        const s = el('select', { class: 'sel full', disabled: ro || off, 'aria-label': ph },
          el('option', { value: '' }, ph),
          list.map((c) => el('option', { value: c.id, selected: c.id === val }, prefix + c.name)));
        s.addEventListener('change', () => { fn(s.value || null); touch(); });
        return s;
      };
      // قسم فيه زر تشغيل + اختيار قناة (يعيد رسم نفسه عند التبديل)
      const togChan = (title, sub, onKey, chKey, ph, extra) => {
        const holder = el('div', {});
        const draw = () => put(holder, el('section', { class: 'panelc' },
          el('div', { class: 'trow' }, el('div', {}, el('h2', {}, title), el('small', { class: 'muted' }, sub)),
            green(cfg[onKey], (v) => { cfg[onKey] = v; draw(); })),
          chanSel(cfg[chKey], d.channels, ph, (v) => { cfg[chKey] = v; }, '# ', !cfg[onKey]),
          extra ? extra() : null));
        draw();
        return holder;
      };

      const master = el('section', { class: 'panelc masterc' },
        el('div', { class: 'trow' },
          el('div', { class: 'mrow' }, el('span', { class: 'mico' }, icon('ticket')),
            el('div', {}, el('h2', {}, 'تفعيل نظام التذاكر'), el('small', { class: 'muted' }, 'تشغيل البانل وفتح التذاكر'))),
          green(cfg.enabled, (v) => { cfg.enabled = v; })));

      const rating = togChan('التقييمات (Rating)', 'القناة المخصصة لإرسال تقييمات الدعم الفني.', 'ratingEnabled', 'ratingChannel', 'تحديد قناة التقييمات', () => {
        const s = toggle(cfg.autoRating, (v) => { cfg.autoRating = v; touch(); }, ro || !cfg.ratingEnabled);
        s.classList.add('green');
        return [el('div', { class: 'sep' }), el('div', { class: 'trow' },
          el('div', {}, el('h3', {}, 'التقييمات التلقائية'), el('small', { class: 'muted' }, 'إرسال التقييم تلقائياً بعد إغلاق التذكرة بدون انتظار العضو.')), s)];
      });
      const logs = togChan('سجل التذاكر (Logs)', 'القناة المخصصة لحفظ نسخة من التذكرة بعد حذفها.', 'logEnabled', 'logChannel', 'تحديد قناة السجل');

      // ---- الخيارات (الأزرار) ----
      const optsBox = el('div', { class: 'stack' });
      const addBtn = el('button', {
        class: 'addbox', type: 'button',
        onclick: () => {
          const o = { id: newOptId(), name: 'خيار جديد', emoji: '🎫', style: 'primary', message: '', image: '', roles: [] };
          cfg.options.push(o); openSet.add(o.id); drawOpts(); touch();
        },
      }, icon('plus'), 'إضافة خيار جديد');

      const optCard = (o, i) => {
        const body = el('div', { class: 'cbody' + (openSet.has(o.id) ? '' : ' hidden') });
        const titleEl = el('b', {}, o.name || 'خيار');
        // زر الإيموجي (المربع الذهبي): يفتح قائمة إيموجيات السيرفر
        const emo = el('button', { class: 'hbox gold emobtn', type: 'button', disabled: ro, 'aria-label': 'اختيار إيموجي' });
        const paintEmo = () => put(emo, emojiView(o.emoji || '🎫'));
        paintEmo();
        const emoWrap = el('div', { class: 'emowrap' }, emo);
        const tin = (key, ph, max) => {
          const x = el('input', { class: 'inp', type: 'text', maxlength: max, placeholder: ph, disabled: ro, 'aria-label': ph });
          x.value = o[key] || '';
          x.addEventListener('input', () => { o[key] = x.value; titleEl.textContent = o.name || 'خيار'; paintEmo(); touch(); });
          return x;
        };
        const emoInput = tin('emoji', '🎫', 64);
        emo.addEventListener('click', async (e) => {
          e.stopPropagation();
          const old = emoWrap.querySelector('.emopop');
          if (old) { old.remove(); return; }
          const pop = el('div', { class: 'emopop' }, el('small', { class: 'muted' }, 'جاري التحميل...'));
          pop.addEventListener('click', (ev) => ev.stopPropagation());
          emoWrap.append(pop);
          const close = () => pop.remove();
          document.addEventListener('click', close, { once: true });
          const choose = (v) => { o.emoji = v; emoInput.value = v; paintEmo(); touch(); close(); };
          let list = [];
          try { list = await getEmojis(); } catch (_) {}
          put(pop,
            el('div', { class: 'emotitle' }, 'إيموجيات السيرفر'),
            list.length
              ? el('div', { class: 'emogrid' }, list.map((x) =>
                  el('button', { type: 'button', class: 'emoit', title: x.name, onclick: () => choose(x.tag) },
                    el('img', { src: emojiUrl(x.id, x.animated), alt: x.name, width: 28, height: 28 }))))
              : el('small', { class: 'muted' }, 'ما في إيموجيات مخصصة بالسيرفر'),
            el('div', { class: 'emotitle' }, 'إيموجيات عادية'),
            el('div', { class: 'emogrid' }, STD_EMOJIS.map((s) => el('button', { type: 'button', class: 'emoit', onclick: () => choose(s) }, s))));
        });

        const msg = el('textarea', { class: 'inp ta', rows: 4, maxlength: 2000, disabled: ro, 'aria-label': 'الرسالة الداخلية' });
        msg.value = o.message;
        msg.addEventListener('input', () => { o.message = msg.value; touch(); });
        const styles = el('div', { class: 'rpstyles' });
        const drawStyles = () => put(styles, STY.map(([s, l]) =>
          el('button', { type: 'button', class: 'rpst s-' + s + (o.style === s ? ' on' : ''), disabled: ro, onclick: () => { o.style = s; drawStyles(); touch(); } }, l)));
        drawStyles();
        put(body,
          lbl('اسم الزر / التذكرة'), tin('name', 'دعم فني', 80),
          lbl('الأيموجي (اضغط على المربع الذهبي للاختيار)'), emoInput,
          lbl('لون ونمط الزر (Style)'), styles,
          lbl('الرسالة الداخلية (عند فتح التكت)'), msg,
          lbl('صورة تفتح مع التذكرة (اختياري)'), imgPicker(o, 'image', ro),
          lbl('رتب الدعم المخصصة للزر (اختياري)'),
          multiPick(d.roles, o.roles, 'نفس رتب الدعم العامة', ro, (v) => { o.roles = v; touch(); }),
          el('div', { class: 'btnrow end' },
            el('button', {
              class: 'btn ghost danger', type: 'button', disabled: ro || cfg.options.length <= 1,
              onclick: () => { if (!confirm('حذف هذا الخيار؟')) return; cfg.options.splice(i, 1); openSet.delete(o.id); drawOpts(); touch(); },
            }, icon('trash'), 'حذف الخيار')));
        const flip = () => {
          if (openSet.has(o.id)) openSet.delete(o.id); else openSet.add(o.id);
          body.classList.toggle('hidden', !openSet.has(o.id));
        };
        return el('section', { class: 'ccard' },
          el('div', { class: 'chrow' }, el('span', { class: 'dot on' }), emoWrap,
            el('div', { style: 'flex:1;min-width:0' }, titleEl),
            el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'تعديل', onclick: flip }, icon('gear'))),
          body);
      };
      const drawOpts = () => {
        addBtn.disabled = ro || cfg.options.length >= 25;
        put(optsBox, cfg.options.map(optCard));
      };

      // ---- نمط العرض ----
      const modeBox = el('div', { class: 'fgrid' });
      const drawMode = () => put(modeBox, [['button', 'أزرار', 'grid'], ['select', 'قائمة', 'chevron']].map(([k, t, ic]) =>
        el('button', { type: 'button', class: 'fopt' + (cfg.mode === k ? ' on' : ''), disabled: ro, 'aria-pressed': String(cfg.mode === k), onclick: () => { cfg.mode = k; drawMode(); touch(); } },
          icon(ic), el('b', {}, t))));

      // ---- نصوص البانل ----
      const pin = (key, ph, max, rows) => {
        const x = rows
          ? el('textarea', { class: 'inp ta', rows, maxlength: max, disabled: ro, 'aria-label': ph })
          : el('input', { class: 'inp', type: 'text', maxlength: max, placeholder: ph, disabled: ro, 'aria-label': ph });
        x.value = cfg.panel[key] || '';
        x.addEventListener('input', () => { cfg.panel[key] = x.value; touch(); });
        return x;
      };

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'TICKET SYSTEM'),
        el('h1', { class: 'greet' }, 'نظام التذاكر'),
        el('p', { class: 'lead' }, 'إعداد قسم الدعم الفني وفتح التذاكر وإدارتها.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        master,
        sec('رتب الدعم الفني', 'الرتب القادرة على استلام التذكرة.', 'users', 'blue',
          multiPick(d.roles, cfg.supportRoles, 'لم يتم اختيار رتب (الإدارة فقط)', ro, (v) => { cfg.supportRoles = v; touch(); })),
        sec('فئة التذاكر (Category)', 'الفئة التي ستظهر بداخلها جميع التذاكر الجديدة.', 'folder', 'orange',
          chanSel(cfg.category, d.categories, 'اختر الفئة...', (v) => { cfg.category = v; }, '', false)),
        logs, rating,
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' }, el('div', {}, el('h2', {}, 'تفعيل السبب'), el('small', { class: 'muted' }, 'كتابة السبب عند فتح التكت.')),
            green(cfg.askReason, (v) => { cfg.askReason = v; }))),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('sliders')),
            el('div', {}, el('h2', {}, 'تخصيص الأزرار والخيارات'), el('small', { class: 'muted' }, 'اضغط على الترس للتعديل بشكل متقدم.'))),
          optsBox, addBtn),
        el('section', { class: 'panelc' }, el('h3', {}, 'نمط عرض الـ Panel'), modeBox),
        el('section', { class: 'panelc' },
          el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('send')),
            el('div', {}, el('h2', {}, 'إرسال Panel التذاكر'), el('small', { class: 'muted' }, 'عدّل العنوان والوصف وحدد القناة اللي بينرسل إلها البانل.'))),
          lbl('عنوان الـ Panel'), pin('title', 'عنوان البانل', 256),
          lbl('وصف الـ Panel'), pin('description', 'وصف البانل', 4000, 6),
          lbl('صورة الـ Panel (اختياري)'), imgPicker(cfg.panel, 'image', ro),
          lbl('القناة المستهدفة لإرسال الـ Panel'),
          chanSel(cfg.panel.channel, d.channels, 'اختر القناة...', (v) => { cfg.panel.channel = v; }, '# ', false),
          el('button', { class: 'btn primary wide', type: 'button', disabled: ro, onclick: sendPanel }, icon('send'), 'إرسال البانل')),
        el('p', { class: 'fine start' }, 'لو ما حددت رتب دعم (لا عامة ولا للزر) فبس أصحاب صلاحية Manage Server بيقدروا يستلموا ويديروا التذاكر. بعد أي تعديل على الأزرار اضغط «إرسال البانل» مرة ثانية عشان تنحدّث الرسالة بالقناة.'),
        bar.node);
      drawOpts(); drawMode(); bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }  // =====================  القسم الجديد  =====================
  function pageMySec(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/mysec`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/mysec`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const sw = toggle(cfg.enabled, (v) => { cfg.enabled = v; touch(); }, ro);
      sw.classList.add('green');

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'MY MODULE'),
        el('h1', { class: 'greet' }, 'اسم القسم'),
        el('p', { class: 'lead' }, 'وصف القسم هون.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc' },
          el('div', { class: 'trow' },
            el('div', {}, el('h2', {}, 'تفعيل القسم'), el('small', { class: 'muted' }, 'وصف قصير')),
            sw)),
        bar.node);
      bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }  // =====================  نظام العملات  =====================
  Object.assign(ICONS, {
    coin: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.7 2.5 1.8c0 2.4-5 1.2-5 3.7 0 1.1 1 1.8 2.5 1.8s2.5-.6 2.5-1.6"/>',
  });
  Object.assign(ERRS, { bad_name: 'اسم العملة مطلوب (حتى 20 حرف).' });

  function pageEconomy(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/economy`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/economy`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const sw = toggle(cfg.enabled, (v) => { cfg.enabled = v; touch(); }, ro);
      sw.classList.add('green');

      const nameIn = el('input', { class: 'inp', type: 'text', maxlength: 20, disabled: ro || !d.guildPremium, 'aria-label': 'اسم العملة' });
      nameIn.value = cfg.currencyName;
      nameIn.addEventListener('input', () => { cfg.currencyName = nameIn.value; touch(); });

      const cnt = el('label', { class: 'flabel' }, `قنوات الردود والأوامر (${cfg.channels.length}/${d.max})`);
      const chPick = multiPick(d.channels.map((c) => ({ id: c.id, name: '# ' + c.name })), cfg.channels, 'اختر قناة لإضافتها...', ro, (v) => {
        if (v.length > d.max) {
          fl.show(`الحد الأقصى ${d.max} ${d.max === 1 ? 'قناة' : 'قنوات'} (تم استبدال الأقدم).`, false);
          v = v.slice(-d.max);
          cfg.channels = v; build(); touch();
          return;
        }
        cfg.channels = v;
        cnt.textContent = `قنوات الردود والأوامر (${v.length}/${d.max})`;
        touch();
      });

      const roleSel = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'رتبة استخدام الأوامر' },
        el('option', { value: '' }, 'الجميع (بدون رتبة)'),
        d.roles.map((o) => el('option', { value: o.id, selected: o.id === cfg.role }, o.name)));
      roleSel.addEventListener('change', () => { cfg.role = roleSel.value || null; touch(); });

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'ECONOMY MODULE'),
        el('h1', { class: 'greet' }, 'إعدادات نظام العملات'),
        el('p', { class: 'lead' }, 'تخصيص القنوات والرتب والصلاحيات الخاصة بنظام الاقتصاد.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc masterc' },
          el('div', { class: 'trow' },
            el('div', { class: 'mrow' }, el('span', { class: 'mico' }, icon('coin')),
              el('div', {}, el('h2', {}, 'تفعيل نظام العملات'), el('small', { class: 'muted' }, 'تشغيل أوامر الرصيد والمكافأة والتحويل والتوب'))),
            sw)),
        el('section', { class: 'panelc' },
          el('div', { class: 'rowbar' },
            el('div', { class: 'phd' }, el('span', { class: 'hbox gold' }, icon('gear')),
              el('div', {}, el('h2', {}, 'إعدادات النظام الأساسية'), el('small', { class: 'muted' }, 'قم بتخصيص قنوات ورتب تفاعل النظام مع سيرفرك'))),
            d.guildPremium ? null : el('a', { class: 'btn primary small', href: `#/g/${gid}/premium` }, icon('crown'), 'ترقية إلى البريميوم')),
          d.guildPremium ? null : el('div', { class: 'notice show' }, 'ترقية السيرفر إلى البريميوم تتيح لك إضافة حتى 5 قنوات تلقي للأوامر بدلاً من قناة واحدة.'),
          el('div', { class: 'sep' }),
          el('div', { class: 'rowbar' }, cnt, el('span', { class: 'pbadge' }, d.guildPremium ? `بريميوم (${d.max} قنوات)` : 'مجاني (قناة 1)')),
          el('small', { class: 'muted' }, 'القنوات المسموح فيها بالرد على الأوامر المتعلقة بنظام العملات.'),
          chPick,
          el('div', { class: 'sep' }),
          el('div', { class: 'rowbar' }, el('label', { class: 'flabel' }, 'اسم العملة'), d.guildPremium ? null : el('span', { class: 'pbadge' }, icon('crown'), 'بريميوم')),
          nameIn,
          d.guildPremium ? null : el('small', { class: 'warnt' }, 'تغيير اسم العملة يتطلب اشتراك بريميوم نشط.'),
          el('div', { class: 'sep' }),
          el('div', { class: 'rowbar' }, el('label', { class: 'flabel' }, 'رتبة استخدام الأوامر'), el('span', { class: 'pbadge' }, 'رتبة واحدة')),
          el('small', { class: 'muted' }, 'حدد رتبة معينة لاستخدام الأوامر داخل السيرفر (الأدمن يستخدمها دائماً).'),
          roleSel),
        el('p', { class: 'fine start' }, 'لازم تفعّل النظام وتختار قناة وحدة على الأقل عشان الأوامر تشتغل. الأوامر: رصيد، مكافأة، تحويل، توب، معلومات، اعطي، سحب.'),
        bar.node);
      bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
  function pageTransactions() {
    const box = el('div', { class: 'page' });
    let d = null, src = 'all', sort = 'new', mode = 'table';
    const SRC = { daily: 'المكافأة اليومية', transfer: 'تحويل', admin: 'إدارة', premium: 'اشتراك بريميوم' };
    const dt = (t) => new Date(t).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
    const out = el('div', {});

    async function load() {
      try { d = await api('/api/me/transactions'); } catch (e) { put(box, errorBox(load)); return; }
      build();
    }
    function drawList() {
      let l = d.list.filter((x) => src === 'all' || x.src === src);
      l = l.slice().sort((a, b) => sort === 'old' ? a.at - b.at : sort === 'high' ? Math.abs(b.amt) - Math.abs(a.amt) : b.at - a.at);
      if (!l.length) return put(out, el('div', { class: 'empty boxed' }, icon('coin'), el('p', {}, 'لا توجد عمليات بعد')));
      const amtEl = (x) => el('b', { class: x.amt > 0 ? 'okc' : 'badc' }, (x.amt > 0 ? '+' : '−') + NF(Math.abs(x.amt)) + ' OPS');
      if (mode === 'grid') {
        put(out, el('div', { class: 'cards4' }, l.map((x) => el('div', { class: 'scard' },
          el('div', { class: 'stext' }, amtEl(x), el('small', {}, SRC[x.src] || x.src), el('small', { class: 'muted' }, dt(x.at)))))));
      } else {
        put(out, el('div', { class: 'tblwrap' }, el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, el('th', {}, 'المبلغ'), el('th', {}, 'المصدر'), el('th', {}, 'التاريخ'))),
          el('tbody', {}, l.map((x) => el('tr', {}, el('td', {}, amtEl(x)), el('td', {}, SRC[x.src] || x.src), el('td', { class: 'muted' }, dt(x.at))))))));
      }
    }
    function build() {
      const sSel = el('select', { class: 'sel full', 'aria-label': 'فلترة حسب المصدر' },
        el('option', { value: 'all' }, 'الكل'), Object.entries(SRC).map(([k, v]) => el('option', { value: k }, v)));
      sSel.addEventListener('change', () => { src = sSel.value; drawList(); });
      const oSel = el('select', { class: 'sel full', 'aria-label': 'ترتيب حسب' },
        [['new', 'الأحدث أولاً'], ['old', 'الأقدم أولاً'], ['high', 'الأعلى مبلغاً']].map(([v, t]) => el('option', { value: v }, t)));
      oSel.addEventListener('change', () => { sort = oSel.value; drawList(); });
      const modes = el('div', { class: 'mtabs' });
      const drawModes = () => put(modes, [['table', 'جدول', 'menu'], ['grid', 'شبكة', 'grid']].map(([k, t, ic]) =>
        el('button', { type: 'button', class: 'mtab' + (mode === k ? ' on' : ''), onclick: () => { mode = k; drawModes(); drawList(); } }, icon(ic), t)));
      put(box,
        el('p', { class: 'eyebrow' }, 'ECONOMY MODULE'),
        el('h1', { class: 'greet' }, 'سجل عمليات OPS Coin'),
        el('p', { class: 'lead' }, 'تتبع جميع معاملات OPS الخاصة بك في سيرفر الدعم بكل شفافية.'),
        el('div', { class: 'cards4' },
          statCard('trend', NF(d.deposits) + ' OPS', 'إجمالي الإيداعات'),
          statCard('swap', NF(d.withdrawals) + ' OPS', 'إجمالي السحوبات'),
          statCard('coin', NF(d.count), 'عدد العمليات'),
          statCard('star', NF(d.balance) + ' OPS', 'الرصيد الحالي')),
        el('section', { class: 'panelc' },
          el('label', { class: 'flabel' }, 'فلترة حسب المصدر'), sSel,
          el('label', { class: 'flabel' }, 'ترتيب حسب'), oSel,
          el('label', { class: 'flabel' }, 'نمط العرض'), modes),
        out);
      drawModes(); drawList();
    }
    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
  function pageEcoTop(r, type) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    async function load() {
      let j;
      try { j = await api(`/api/guild/${gid}/economy/top?type=${type}`); } catch (e) { put(box, errorBox(load)); return; }
      put(box,
        el('h1', { class: 'greet' }, type === 'xp' ? 'توب 100 خبرة' : `أغنى 100 في ${j.currency}`),
        el('section', { class: 'panelc' },
          j.list.length
            ? j.list.map((u) => el('div', { class: 'lrow' + (u.id === me.id ? ' me' : '') },
                el('span', { class: 'rk' }, '#' + u.rank),
                u.avatar ? el('img', { src: u.avatar, alt: '', width: 40, height: 40 }) : el('span', { class: 'fb' }, '؟'),
                el('span', { class: 'nm' }, u.name),
                el('b', {}, type === 'xp' ? `${NF(u.value)} XP · مستوى ${u.level}` : `${NF(u.value)} ${j.currency}`)))
            : el('div', { class: 'empty' }, 'لا تتوفر بيانات لعرض المتصدرين.')));
    }
    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
  // ---- عناصر القائمة الجانبية الجديدة ----
      function guildExtra(r) {
    const base = `#/g/${r.gid}`;
    return [
      { id: 'botprofile', label: 'بروفايل البوت', ic: 'user', href: `${base}/botprofile` },
      { id: 'economy', label: 'نظام OPS Coin', ic: 'coin', children: [
        { id: 'eco-settings', label: 'إعدادات المالية', href: `${base}/eco-settings` },
        { id: 'eco-xp', label: 'توب 100 خبرة', href: `${base}/eco-xp` },
        { id: 'eco-rich', label: 'أغنى 100 في OPS', href: `${base}/eco-rich` },
      ] },
      { id: 'security', label: 'الحماية', ic: 'shield', children: [
        { id: 'smart', label: 'الحماية الذكية', href: `${base}/smart` },
        { id: 'general', label: 'الحماية العامة', href: `${base}/general` },
        { id: 'private', label: 'الحماية الخاصة', href: `${base}/private` },
        { id: 'images', label: 'حماية الصور', href: `${base}/images` },
      ] },
      { id: 'commands', label: 'إدارة الأوامر', ic: 'bolt', children: [
        { id: 'cmd-admin', label: 'الأوامر الإدارية', href: `${base}/cmd-admin` },
        { id: 'cmd-general', label: 'الأوامر العامة', href: `${base}/cmd-general` },
        { id: 'cmd-roles', label: 'أوامر الرولات', href: `${base}/cmd-roles` },
        { id: 'cmd-security', label: 'أوامر الحماية', href: `${base}/cmd-security` },
        { id: 'cmd-settings', label: 'أوامر الإعدادات', href: `${base}/cmd-settings` },
        { id: 'cmd-chat', label: 'أوامر الشات', href: `${base}/cmd-chat` },
      ] },
      { id: 'logs', label: 'اللوق', ic: 'doc', children: [
        { id: 'log-admin', label: 'اللوقات الإدارية', href: `${base}/log-admin` },
        { id: 'log-general', label: 'اللوقات العامة', href: `${base}/log-general` },
      ] },
      { id: 'welcome', label: 'الترحيب والمغادرة', ic: 'userplus', href: `${base}/welcome` },
      { id: 'autoroles', label: 'الرتب التلقائية', ic: 'userplus', href: `${base}/autoroles` },
      { id: 'rolepanels', label: 'الرتب القابلة للأخذ', ic: 'tag', href: `${base}/rolepanels` },
      { id: 'autoreply', label: 'الرد التلقائي', ic: 'chat', href: `${base}/autoreply` },
      { id: 'autoline', label: 'الخط التلقائي', ic: 'image', href: `${base}/autoline` },
            { id: 'autoreact', label: 'التفاعل التلقائي', ic: 'smileplus', href: `${base}/autoreact` },
      { id: 'colorsys', label: 'نظام الألوان', ic: 'palette', children: [
        { id: 'colors', label: 'إعدادات الألوان', href: `${base}/colors` },
        { id: 'cmd-colors', label: 'أوامر الألوان', href: `${base}/cmd-colors` },
      ] },
      { id: 'embeds', label: 'إيمبد', ic: 'embed', href: `${base}/embeds` },
      { id: 'vent', label: 'نظام الفضفضة', ic: 'chat', href: `${base}/vent` },
      { id: 'levels', label: 'نظام المستويات', ic: 'trend', href: `${base}/levels` },
      { id: 'chsync', label: 'تنظيم القنوات', ic: 'broom', href: `${base}/chsync` },
      { id: 'tempvoice', label: 'الروم المؤقت', ic: 'mic', href: `${base}/tempvoice` },
      { id: 'tickets', label: 'التذاكر', ic: 'ticket', href: `${base}/tickets` },
    ];
  }
  function menuGroup(it, r) {
    const inside = it.children.some((c) => c.id === r.page);
    const open = secOpen[it.id] === undefined ? inside : secOpen[it.id];
    return el('div', { class: 'mgroup' },
      el('button', {
        type: 'button', class: 'mitem mhead' + (inside ? ' active' : ''), 'aria-expanded': String(open),
        onclick: () => { secOpen[it.id] = !open; drawDrawer(parse()); },
      }, icon(it.ic), el('span', {}, it.label), icon('chevron', 'chev' + (open ? ' up' : ''))),
      open ? el('div', { class: 'msub' }, it.children.map((c) =>
        el('a', { class: 'msubitem' + (r.page === c.id ? ' active' : ''), href: c.href, onclick: () => document.body.classList.remove('open') }, c.label))) : null);
  }
  const premLock = (gid, text) =>
    el('div', { class: 'lockbox' },
      el('div', { class: 'phd' }, icon('crown', 'goldc'), el('h2', {}, 'هذه الميزة تتطلب اشتراك بريميوم نشط بالسيرفر')),
      el('p', { class: 'muted' }, text),
      el('a', { class: 'btn primary small', href: `#/g/${gid}/premium` }, 'ترقية إلى البريميوم'));
  function pagePrivate(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, rules = [], base = [], bar = null;
    const dirty = () => JSON.stringify(rules) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/private`); } catch (e) { put(box, errorBox(load)); return; }
      rules = clone(d.rules); base = clone(d.rules);
      build();
    }
    async function save() {
      try {
        const j = await apiSend('PUT', `/api/guild/${gid}/private`, { rules });
        rules = j.rules; base = clone(rules);
        fl.show('تم حفظ القوانين ✅');
        build();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const list = el('div', { class: 'stack' });
      const num = (obj, key, label, lo, hi) => {
        const inp = el('input', { class: 'inp', type: 'number', min: lo, max: hi, value: obj[key], disabled: ro, 'aria-label': label });
        inp.addEventListener('input', () => { const v = parseInt(inp.value, 10); if (v >= lo && v <= hi) { obj[key] = v; touch(); } });
        return el('label', { class: 'pf' }, label, inp);
      };
      const card = (x) => {
        const name = el('input', { class: 'inp', type: 'text', maxlength: 60, value: x.name, disabled: ro, 'aria-label': 'اسم القانون' });
        name.addEventListener('input', () => { x.name = name.value; touch(); });
        const drop = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'طريقة الخفض' },
          [['gradual', 'خفض تدريجي'], ['instant', 'خفض فوري']].map(([v, t]) => el('option', { value: v, selected: v === x.drop }, t)));
        drop.addEventListener('change', () => { x.drop = drop.value; touch(); });
        return el('section', { class: 'ccard' },
          el('div', { class: 'chrow' }, name,
            toggle(x.enabled !== false, (v) => { x.enabled = v; touch(); }, ro),
            el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro, 'aria-label': 'حذف', onclick: () => { rules = rules.filter((y) => y !== x); draw(); touch(); } }, icon('trash'))),
          el('div', { class: 'cbody' },
            el('div', { class: 'flabel' }, 'القنوات المراقبة'),
            multiPick(d.channels.map((c) => ({ id: c.id, name: '# ' + c.name })), x.channels, 'اختر القنوات...', ro, (v) => { x.channels = v; touch(); }),
            el('div', { class: 'propgrid' }, num(x, 'msgs', 'عدد الرسائل', 2, 500), num(x, 'secs', 'خلال (ثانية)', 3, 300), num(x, 'slow', 'السلومود (ثانية)', 1, 21600)),
            el('div', { class: 'flabel' }, 'طريقة الخفض بعد 5 دقائق هادئة'), drop));
      };
      const draw = () => put(list, rules.length ? rules.map(card) : el('div', { class: 'empty boxed' }, icon('shield'), el('p', {}, 'لا توجد قوانين بعد')));
      const add = el('button', {
        class: 'addbox', type: 'button', disabled: ro || rules.length >= 20,
        onclick: () => { rules.push({ id: '', name: 'قانون جديد', enabled: true, channels: [], msgs: 10, secs: 10, slow: 5, drop: 'gradual' }); draw(); touch(); },
      }, icon('plus'), 'إنشاء قانون');
      bar = saveBar(dirty, save, () => { rules = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'SPECIAL SECURITY'),
        el('h1', { class: 'greet' }, 'الحماية الخاصة ', el('span', { class: 'tag' }, 'بريميوم')),
        el('p', { class: 'lead' }, 'سلومود تلقائي يرتفع لما تزيد الرسائل عن حد معين، وينزل بعد 5 دقائق هادئة متتالية.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        add, list, bar.node);
      draw(); bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
  function pageNoBot(g) {
    return el('div', { class: 'page' },
      el('div', { class: 'nbbox' },
        el('div', { class: 'nbicon' }, guildIcon(g, 84)),
        el('h1', { class: 'greet' }, 'البوت غير موجود في ', g.name),
        el('p', { class: 'lead' }, 'لإدارة هذا السيرفر، يجب عليك أولاً دعوة البوت إليه ومنحه الصلاحيات اللازمة.'),
        el('div', { class: 'btnrow' },
          el('a', { class: 'btn primary small', href: `${me.inviteUrl}&guild_id=${g.id}&disable_guild_select=true`, target: '_blank', rel: 'noopener' }, 'دعوة البوت الآن 🚀'),
          el('a', { class: 'btn ghost small', href: '#/servers' }, 'العودة'))));
  }
  function pageServers() {
    return el('div', { class: 'page' },
      el('h1', { class: 'greet' }, 'اختر السيرفر'),
      el('p', { class: 'lead' }, 'السيرفرات اللي أنت مالك أو أدمن فيها.'),
      allGuilds.length
        ? el('div', { class: 'srvgrid' }, allGuilds.map((g) =>
            el('a', { class: 'srvcard', href: '#/g/' + g.id },
              el('span', { class: 'srvico' }, guildIcon(g, 56)),
              el('b', {}, g.name),
              el('small', { class: 'muted' }, g.botIn ? 'البوت موجود · إدارة' : 'البوت غير موجود · دعوة'))))
        : el('div', { class: 'empty' }, 'ما لقينا سيرفرات أنت مالك أو أدمن فيها.'));
  }
  const premPage = (gid, eyebrow, title) =>
    el('div', { class: 'page' },
      el('p', { class: 'eyebrow' }, eyebrow),
      el('h1', { class: 'greet' }, title, ' ', el('span', { class: 'tag' }, 'بريميوم')),
      el('div', { class: 'lockbox' },
        el('div', { class: 'phd' }, icon('crown', 'goldc'), el('h2', {}, 'هذه الميزة تتطلب اشتراك بريميوم نشط بالسيرفر')),
        el('p', { class: 'muted' }, 'قم بترقية السيرفر لفتح هذه الصفحة واستخدام ميزاتها.'),
        el('a', { class: 'btn primary small', href: `#/g/${gid}/premium` }, 'ترقية إلى البريميوم')));
  function guildPage(r) {
    switch (r.page) {
      case 'premium': return pagePremium(r);
      case 'botprofile': return pageBotProfile(r);
      case 'smart': return pageSmart(r);
      case 'general': return pageGeneral(r);
      case 'private': {
        const pg = guilds.find((x) => x.id === r.gid);
        return pg && pg.premium ? pagePrivate(r) : premPage(r.gid, 'SPECIAL SECURITY', 'الحماية الخاصة');
      }
            case 'images': return pageImages(r);
      case 'welcome': return pageWelcome(r);
      case 'levels': return pageLevels(r);
      case 'rolepanels': return pageRolePanels(r);
      case 'autoroles': return pageAutoRoles(r);
      case 'autoreply': return pageAutoReply(r);
      case 'embeds': return pageEmbeds(r);
            case 'eco-settings': return pageEconomy(r);
      case 'eco-xp': return pageEcoTop(r, 'xp');
      case 'eco-rich': return pageEcoTop(r, 'rich');
      case 'mysec': return pageMySec(r);
      case 'log-admin': case 'log-general': return pageLogs(r);
      case 'chsync': return pageChannelSync(r);
      case 'tempvoice': return pageTempVoice(r);
      case 'vent': return pageVent(r);
      case 'tickets': return pageTickets(r);
            case 'autoline': return pageAutoLine(r);
                  case 'autoreact': return pageAutoReact(r);      
      case 'colors': return pageColors(r);
      default: return r.page.startsWith('cmd-') ? pageCommands({ gid: r.gid, cat: r.page.slice(4) }) : pageGuild(r.gid);
    }
  }
  // =====================  نظام الألوان  =====================
    // =====================  الخط التلقائي (VIP)  =====================
  function pageAutoLine(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();
    const pad = (c) => {
      while (c.items.length < c.count) c.items.push({ channelId: '', image: '' });
      c.items = c.items.slice(0, c.count);
    };

    async function load() {
      try { d = await api(`/api/guild/${gid}/autoline`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); pad(cfg);
      base = clone(cfg);
      build();
    }
    async function save() {
      if (cfg.items.some((x) => x.image && !x.channelId)) return fl.show('اختر الروم لكل صورة قبل الحفظ.', false);
      try {
        await apiSend('PUT', `/api/guild/${gid}/autoline`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function imgPicker(obj, disabled) {
      const holder = el('div', { class: 'stack tight' });
      const file = el('input', { type: 'file', accept: IMG_OK.join(','), class: 'hidden' });
      const draw = () => {
        const v = obj.image || '';
        const src = v.startsWith('up:') ? `/api/guild/${gid}/autoline/img/${v.slice(3)}` : '';
        put(holder, file,
          src ? el('img', { class: 'upprev', src, alt: '' }) : el('small', { class: 'muted' }, 'لا توجد صورة'),
          el('div', { class: 'btnrow' },
            el('button', { class: 'btn ghost small', type: 'button', disabled, onclick: () => file.click() }, icon('upload'), src ? 'تغيير الصورة' : 'رفع صورة'),
            src ? el('button', { class: 'btn ghost small danger', type: 'button', disabled, onclick: () => { obj.image = ''; draw(); touch(); } }, icon('trash'), 'إزالة') : null));
      };
      file.addEventListener('change', async () => {
        const f = file.files[0];
        file.value = '';
        if (!f) return;
        try {
          const image = await readImage(f, 5);
          const j = await apiSend('POST', `/api/guild/${gid}/autoline/upload`, { image });
          obj.image = j.ref; draw(); touch();
        } catch (e) { fl.show(`${errText(e)} (الحد الأقصى 5MB)`, false); }
      });
      draw();
      return holder;
    }

    function build() {
      const ro = !d.canManage;
      if (!d.guildPremium) {
        put(box,
          el('p', { class: 'eyebrow' }, 'AUTO LINE'),
          el('h1', { class: 'greet' }, 'الخط التلقائي'),
          el('section', { class: 'panelc vlock' },
            el('span', { class: 'pbadge' }, icon('crown'), 'بريميوم'),
            el('div', { class: 'vlockico' }, icon('image'), el('span', { class: 'mini' }, icon('lock'))),
            el('h2', { class: 'h2' }, 'الخط التلقائي ميزة بريميوم'),
            el('p', { class: 'muted' }, 'عيّن صورة لكل روم محدد، ليقوم البوت بإرسالها بعد كل رسالة من الأعضاء.'),
            el('a', { class: 'btn primary small', href: `#/g/${gid}/premium` }, 'ترقية إلى البريميوم'),
            el('div', { class: 'vfeats' }, ['صورة مخصصة لكل روم', 'إعدادات مرنة تناسب سيرفرك', 'تفعيل فوري بعد الاشتراك']
              .map((t) => el('div', {}, icon('check', 'goldc'), t)))));
        return;
      }
      const sw = toggle(cfg.enabled, (v) => { cfg.enabled = v; touch(); }, ro);
      sw.classList.add('green');
      const slots = el('div', { class: 'stack' });
      const cnt = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'اختر عدد الرومات' },
        Array.from({ length: 50 }, (_, i) => el('option', { value: String(i + 1), selected: cfg.count === i + 1 }, String(i + 1))));
      cnt.addEventListener('change', () => { cfg.count = Number(cnt.value); pad(cfg); drawSlots(); touch(); });
      const drawSlots = () => put(slots, cfg.items.map((it, i) => {
        const used = new Set(cfg.items.filter((_, j) => j !== i).map((x) => x.channelId).filter(Boolean));
        const sel = el('select', { class: 'sel full', disabled: ro, 'aria-label': `الروم ${i + 1}` },
          el('option', { value: '' }, '# اختر الروم...'),
          d.channels.filter((c) => !used.has(c.id)).map((c) => el('option', { value: c.id, selected: c.id === it.channelId }, '# ' + c.name)));
        sel.addEventListener('change', () => { it.channelId = sel.value; drawSlots(); touch(); });
        return el('section', { class: 'panelc' }, el('b', { class: 'goldc' }, `روم #${i + 1}`), sel, imgPicker(it, ro));
      }));
      drawSlots();

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'AUTO LINE'),
        el('h1', { class: 'greet' }, 'الخط التلقائي ', el('span', { class: 'vipbadge' }, 'VIP ', icon('crown'))),
        el('p', { class: 'lead' }, 'عيّن صورة لكل روم، والبوت يرسلها بعد كل رسالة من الأعضاء.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc masterc' },
          el('div', { class: 'trow' },
            el('div', { class: 'mrow' }, el('span', { class: 'mico' }, icon('image')),
              el('div', {}, el('h2', {}, 'تفعيل الخط التلقائي'), el('small', { class: 'muted' }, 'إرسال صورة الروم بعد كل رسالة'))),
            sw)),
        el('section', { class: 'panelc' }, el('label', { class: 'flabel' }, 'اختر عدد الرومات'), cnt),
        slots,
        bar.node);
      bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }  // =====================  التفاعل التلقائي (VIP)  =====================
  Object.assign(ICONS, {
    smileplus: '<path d="M20 12a8 8 0 1 1-8-8M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01M18 3v6M15 6h6"/>',
  });
  function pageAutoReact(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, bar = null, emojiList = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();
    const pad = (c) => {
      while (c.items.length < c.count) c.items.push({ channelId: '', emojis: [] });
      c.items = c.items.slice(0, c.count);
    };
    const STD = ['😀', '😂', '😍', '🔥', '👍', '❤️', '💯', '🎉', '😎', '🥰', '😭', '🙏', '👏', '✨', '⭐', '💎', '👑', '🤝', '😮', '🤔'];
    const emojiUrl = (id, animated) => `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=48`;
    const emojiView = (v) => {
      const m = /^<(a?):(\w+):(\d+)>$/.exec(v || '');
      return m ? el('img', { src: emojiUrl(m[3], m[1]), alt: m[2], width: 24, height: 24 }) : document.createTextNode(v || '');
    };
    const getEmojis = async () => emojiList || (emojiList = (await api(`/api/guild/${gid}/emojis`)).list);

    async function load() {
      try { d = await api(`/api/guild/${gid}/autoreact`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); pad(cfg);
      base = clone(cfg);
      build();
    }
    async function save() {
      if (cfg.items.some((x) => x.emojis.length && !x.channelId)) return fl.show('اختر الروم لكل مجموعة إيموجيات قبل الحفظ.', false);
      try {
        await apiSend('PUT', `/api/guild/${gid}/autoreact`, { cfg });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      if (!d.guildPremium) {
        put(box,
          el('p', { class: 'eyebrow' }, 'AUTO REACT'),
          el('h1', { class: 'greet' }, 'التفاعل التلقائي'),
          el('section', { class: 'panelc vlock' },
            el('span', { class: 'vipbadge' }, 'VIP ', icon('crown')),
            el('div', { class: 'vlockico' }, icon('smile'), el('span', { class: 'mini' }, icon('lock'))),
            el('h2', { class: 'h2' }, 'التفاعل التلقائي ميزة بريميوم'),
            el('p', { class: 'muted' }, 'اختر روماً ومجموعة إيموجيات، وسيضيف البوت التفاعلات إلى كل رسالة جديدة تلقائياً.'),
            el('div', { class: 'vfeats' }, ['قواعد مستقلة لكل روم', 'مجموعات إيموجيات تناسب مجتمعك', 'تفعيل فوري بعد الاشتراك']
              .map((t) => el('div', {}, icon('check', 'goldc'), t))),
            el('a', { class: 'btn primary small', href: `#/g/${gid}/premium` }, icon('crown'), 'احصل على بريميوم')));
        return;
      }

      const sw = toggle(cfg.enabled, (v) => { cfg.enabled = v; touch(); }, ro);
      sw.classList.add('green');
      const slots = el('div', { class: 'stack' });
      const cnt = el('select', { class: 'sel full', disabled: ro, 'aria-label': 'اختر عدد الرومات' },
        Array.from({ length: 50 }, (_, i) => el('option', { value: String(i + 1), selected: cfg.count === i + 1 }, String(i + 1))));
      cnt.addEventListener('change', () => { cfg.count = Number(cnt.value); pad(cfg); drawSlots(); touch(); });

      const drawSlots = () => put(slots, cfg.items.map((it, i) => {
        const used = new Set(cfg.items.filter((_, j) => j !== i).map((x) => x.channelId).filter(Boolean));
        const sel = el('select', { class: 'sel full', disabled: ro, 'aria-label': `الروم ${i + 1}` },
          el('option', { value: '' }, '# اختر الروم...'),
          d.channels.filter((c) => !used.has(c.id)).map((c) => el('option', { value: c.id, selected: c.id === it.channelId }, '# ' + c.name)));
        sel.addEventListener('change', () => { it.channelId = sel.value; touch(); });

        const chips = el('div', { class: 'chips' });
        const small = el('small', { class: 'muted' });
        const drawChips = () => {
          small.textContent = `${it.emojis.length}/20 إيموجي`;
          put(chips, it.emojis.map((e, k) => el('span', { class: 'achip' }, emojiView(e),
            el('button', { type: 'button', class: 'x', disabled: ro, 'aria-label': 'إزالة', onclick: () => { it.emojis.splice(k, 1); drawChips(); touch(); } }, '×'))));
        };

        const wrap = el('div', { class: 'emowrap' });
        const addBtn = el('button', {
          class: 'btn ghost small', type: 'button', disabled: ro,
          onclick: async (e) => {
            e.stopPropagation();
            const old = wrap.querySelector('.emopop');
            if (old) { old.remove(); return; }
            const pop = el('div', { class: 'emopop' }, el('small', { class: 'muted' }, 'جاري التحميل...'));
            pop.addEventListener('click', (ev) => ev.stopPropagation());
            wrap.append(pop);
            document.addEventListener('click', () => pop.remove(), { once: true });
            const choose = (v) => {
              if (it.emojis.includes(v)) return;
              if (it.emojis.length >= 20) return fl.show('الحد الأقصى 20 إيموجي لكل روم.', false);
              it.emojis.push(v); drawChips(); touch();
            };
            let list = [];
            try { list = await getEmojis(); } catch (_) {}
            put(pop,
              el('div', { class: 'emotitle' }, 'إيموجيات السيرفر'),
              list.length
                ? el('div', { class: 'emogrid' }, list.map((x) =>
                    el('button', { type: 'button', class: 'emoit', title: x.name, onclick: () => choose(x.tag) },
                      el('img', { src: emojiUrl(x.id, x.animated), alt: x.name, width: 28, height: 28 }))))
                : el('small', { class: 'muted' }, 'ما في إيموجيات مخصصة بالسيرفر'),
              el('div', { class: 'emotitle' }, 'إيموجيات عادية'),
              el('div', { class: 'emogrid' }, STD.map((s) => el('button', { type: 'button', class: 'emoit', onclick: () => choose(s) }, s))));
          },
        }, icon('plus'), 'إضافة إيموجي');
        wrap.append(addBtn);
        drawChips();

        return el('section', { class: 'panelc' },
          el('b', { class: 'goldc' }, `روم #${i + 1}`), sel,
          el('div', { class: 'rowbar' }, el('label', { class: 'flabel' }, 'الإيموجيات'), small),
          chips, wrap);
      }));
      drawSlots();

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'AUTO REACT'),
        el('h1', { class: 'greet' }, 'التفاعل التلقائي ', el('span', { class: 'vipbadge' }, 'VIP ', icon('crown'))),
        el('p', { class: 'lead' }, 'اختر رومات وإيموجيات، والبوت يضيف التفاعلات لكل رسالة جديدة فيها.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc masterc' },
          el('div', { class: 'trow' },
            el('div', { class: 'mrow' }, el('span', { class: 'mico' }, icon('smileplus')),
              el('div', {}, el('h2', {}, 'تفعيل التفاعل التلقائي'), el('small', { class: 'muted' }, 'إضافة الإيموجيات تحت كل رسالة جديدة'))),
            sw)),
        el('section', { class: 'panelc' }, el('label', { class: 'flabel' }, 'اختر عدد الرومات'), cnt),
        slots,
        bar.node);
      bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
  function pageColors(r) {
    const gid = r.gid;
    const box = el('div', { class: 'page' });
    const fl = flasher();
    let d = null, cfg = null, base = null, bar = null;
    const dirty = () => JSON.stringify(cfg) !== JSON.stringify(base);
    const touch = () => bar && bar.refresh();

    async function load() {
      try { d = await api(`/api/guild/${gid}/colors`); } catch (e) { put(box, errorBox(load)); return; }
      cfg = clone(d.cfg); base = clone(d.cfg);
      build();
    }
    async function save() {
      try {
        await apiSend('PUT', `/api/guild/${gid}/colors`, { cfg: { enabled: cfg.enabled, title: cfg.title, shape: cfg.shape, bg: cfg.bg } });
        base = clone(cfg);
        fl.show('تم حفظ الإعدادات ✅');
        bar.refresh();
      } catch (e) { fl.show(errText(e), false); }
    }

    function build() {
      const ro = !d.canManage;
      const sw = toggle(cfg.enabled, (v) => { cfg.enabled = v; touch(); }, ro);
      sw.classList.add('green');
      const title = el('input', { class: 'inp', type: 'text', maxlength: 60, disabled: ro, 'aria-label': 'نص قائمة الألوان' });
      title.value = cfg.title;
      title.addEventListener('input', () => { cfg.title = title.value; touch(); });
      const sel = (key, opts, label) => {
        const s = el('select', { class: 'sel full', disabled: ro, 'aria-label': label },
          opts.map(([v, t]) => el('option', { value: v, selected: v === cfg[key] }, t)));
        s.addEventListener('change', () => { cfg[key] = s.value; touch(); });
        return s;
      };

      async function applySet(s) {
        if (!confirm(`تطبيق مجموعة "${s.name}"؟ بتنحذف رتب الألوان القديمة (لو موجودة) وبتنشأ ${s.colors.length} رتبة جديدة.`)) return;
        fl.show('جاري إنشاء الرتب، استنى شوي...');
        try {
          const j = await apiSend('POST', `/api/guild/${gid}/colors/apply`, { set: s.id });
          d.count = j.count; cfg.set = s.id; base.set = s.id;
          fl.show(`تم إنشاء ${j.count} رتبة ✅`);
          build();
        } catch (e) { fl.show(errText(e), false); }
      }
      async function clearAll() {
        if (!confirm('حذف كل رتب الألوان من السيرفر؟')) return;
        try {
          await apiSend('DELETE', `/api/guild/${gid}/colors/roles`);
          d.count = 0; cfg.set = null; base.set = null;
          fl.show('تم حذف رتب الألوان');
          build();
        } catch (e) { fl.show(errText(e), false); }
      }

      const grid = el('div', { class: 'setgrid' }, d.sets.map((s) =>
        el('button', { type: 'button', class: 'setcard' + (cfg.set === s.id ? ' on' : ''), disabled: ro, onclick: () => applySet(s) },
          el('div', { class: 'rowbar' }, el('b', {}, s.name), el('span', { class: 'mbadge' }, `${s.colors.length} ألوان`)),
          el('div', { class: 'sdots' },
            s.colors.slice(0, 5).map((c) => el('i', { class: 'sdot', style: 'background:' + c })),
            s.colors.length > 5 ? el('span', { class: 'mbadge' }, `+${s.colors.length - 5}`) : null))));

      bar = saveBar(dirty, save, () => { cfg = clone(base); build(); });
      put(box,
        el('p', { class: 'eyebrow' }, 'COLORS MODULE'),
        el('h1', { class: 'greet' }, 'نظام الألوان'),
        el('p', { class: 'lead' }, 'إدارة وتخصيص رتب الألوان في السيرفر وتطبيق المجموعات الجاهزة.'),
        fl,
        ro ? el('div', { class: 'notice show' }, 'تحتاج صلاحية إدارة السيرفر لتعديل هذه الإعدادات.') : null,
        el('section', { class: 'panelc masterc' },
          el('div', { class: 'trow' },
            el('div', { class: 'mrow' }, el('span', { class: 'mico' }, icon('palette')),
              el('div', {}, el('h2', {}, 'تفعيل النظام'), el('small', { class: 'muted' }, 'إعداد الرتب الملونة وأوامر الاختيار'))),
            sw)),
        el('section', { class: 'panelc' },
          el('label', { class: 'flabel' }, 'نص قائمة الألوان (العنوان الرئيسي في الصورة)'), title),
        el('section', { class: 'panelc' },
          el('label', { class: 'flabel' }, 'شكل الألوان'), sel('shape', [['square', 'مربعة'], ['circle', 'دائرية']], 'شكل الألوان')),
        el('section', { class: 'panelc' },
          el('label', { class: 'flabel' }, 'خلفية قائمة الألوان'), sel('bg', [['transparent', 'شفافة'], ['dark', 'داكنة'], ['light', 'فاتحة']], 'الخلفية')),
        el('div', { class: 'rowbar' },
          el('div', { class: 'phd' }, el('h2', {}, 'مجموعات الألوان'), el('span', { class: 'mbadge' }, `${d.sets.length} مجموعات`)),
          el('button', { class: 'btn ghost small danger', type: 'button', disabled: ro || !d.count, onclick: clearAll }, icon('trash'), `حذف رتب الألوان (${d.count})`)),
        el('p', { class: 'muted' }, 'اختر مجموعة لتطبيقها تلقائياً وإنشاء رتب الألوان في السيرفر.'),
        grid, bar.node);
      bar.refresh();
    }

    put(box, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    load();
    return box;
  }
  // ---- القائمة الجانبية ----
  const parse = () => {
    const p = (location.hash || '#/').slice(1).split('/').filter(Boolean);
    if (p[0] === 'g' && p[1]) return { ctx: 'guild', gid: p[1], page: p[2] || 'overview' };
    return { ctx: 'home', page: p[0] || 'overview' };
  };
  function drawDrawer(r) {
    put($('#rail'), 
      el('a', { class: 'ritem' + (r.ctx === 'home' ? ' active' : ''), href: '#/', title: me.name }, userImg(56)),
      guilds.map((g) => el('a', { class: 'ritem' + (r.ctx === 'guild' && r.gid === g.id ? ' active' : ''), href: '#/g/' + g.id, title: g.name }, guildIcon(g, 56))),
      el('a', { class: 'ritem add', href: '#/servers', title: 'كل السيرفرات' }, icon('plus')));

    let head, items;
    if (r.ctx === 'guild') {
      const g = guilds.find((x) => x.id === r.gid);
      head = [el('span', { class: 'hav' }, g ? guildIcon(g, 52) : null), el('span', {}, g ? g.name : 'السيرفر')];
      items = [
        { id: 'overview', label: 'نظرة عامة', ic: 'grid', href: `#/g/${r.gid}` },
        { id: 'premium', label: 'البريميوم', ic: 'crown', href: `#/g/${r.gid}/premium`, badge: g && g.premium ? 'مفعّل' : 'غير مفعّل' },
      ];
    } else {
      head = [el('span', { class: 'hav' }, userImg(52)), el('span', {}, me.name)];
      items = [
        { id: 'overview', label: 'نظرة عامة', ic: 'grid', href: '#/' },
        { id: 'premium', label: 'الاشتراكات والبريميوم', ic: 'crown', href: '#/premium' },
        { id: 'servers', label: 'السيرفرات', ic: 'grid', href: '#/servers' },
        { id: 'leaders', label: 'لوحة المتصدرين', ic: 'trophy', href: '#/leaders' },
        { id: 'transactions', label: 'سجل عمليات OPS', ic: 'coin', href: '#/transactions' },
        { id: 'support', label: 'الدعم الفني', ic: 'lifebuoy', href: 'https://discord.gg/XN6RfY4nc', ext: true },
      ];
    }
    if (r.ctx === 'guild') items = items.concat(guildExtra(r));
    put($('#panel'), 
      el('div', { class: 'phead' }, head),
      el('nav', { class: 'menu' }, items.map((it) => it.children ? menuGroup(it, r) :
        el('a', { class: 'mitem' + (r.page === it.id ? ' active' : ''), href: it.href, target: it.ext ? '_blank' : null, rel: it.ext ? 'noopener' : null, onclick: () => document.body.classList.remove('open') },
          icon(it.ic), el('span', {}, it.label), it.badge ? el('em', { class: 'badge' }, it.badge) : null))),
      el('form', { method: 'post', action: '/logout' }, el('button', { class: 'logout', type: 'submit' }, icon('logout'), 'تسجيل خروج')));
      
  }

  // ---- التنقل ----
  async function route() {
    clearInterval(timer);
    window.onbeforeunload = null;
    document.body.classList.remove('has-savebar');
    const r = parse();
    const my = ++token;
    const miss = r.ctx === 'guild' ? allGuilds.find((x) => x.id === r.gid && !x.botIn) : null;
    drawDrawer(miss ? { ctx: 'home', page: 'servers' } : r);
    put(view, el('p', { class: 'muted center' }, 'جاري التحميل...'));
    try {
      let node;
      if (r.ctx === 'guild') {
        node = miss ? pageNoBot(miss) : guilds.some((x) => x.id === r.gid)
          ? guildPage(r)
          : el('div', { class: 'empty' }, 'هذا السيرفر غير متاح. تأكد أن البوت موجود فيه وأنك عضو فيه.');
      } else {
        node = r.page === 'premium' ? pagePremium(r) : r.page === 'transactions' ? pageTransactions() : r.page === 'leaders' ? await pageLeaders() : r.page === 'servers' ? pageServers() : await pageHome();
      }
      if (my !== token) return;
      put(view, node);
      window.scrollTo(0, 0);
    } catch (e) {
      if (my === token) put(view, errorBox(route));
    }
  }

  (async function init() {
    $('#burger').append(icon('menu'));
        try { localStorage.setItem('opsAuthed', '1'); } catch (_) {}
    try {
      [me, allGuilds] = await Promise.all([api('/api/me'), api('/api/guilds').catch(() => [])]);
      guilds = allGuilds.filter((g) => g.botIn);
      guilds.forEach((g) => { g.premiumUntil = g.premiumUntil || 0; });
    } catch (e) { put(view, errorBox(() => location.reload())); return; }
    $('#burger').addEventListener('click', () => document.body.classList.toggle('open'));
    $('#scrim').addEventListener('click', () => document.body.classList.remove('open'));
    document.addEventListener('keydown', (e) => e.key === 'Escape' && document.body.classList.remove('open'));
    window.addEventListener('hashchange', route);
    route();
  })();
}

const CSS = `
:root {
  --bg: #07080c;
  --card: #0b0c11;
  --text: #ffffff;
  --muted: #8b8f9c;
  --accent: #3b82f6;
  --accent-2: #2563eb;
  --line: color-mix(in srgb, var(--accent) 28%, transparent);
  --glow: color-mix(in srgb, var(--accent) 35%, transparent);
  --font: "Cairo", "Tajawal", "Segoe UI", Tahoma, sans-serif;
}
:root[data-theme="pink"] { --accent: #ec4899; --accent-2: #db2777; }
:root[data-theme="red"] { --accent: #ef4444; --accent-2: #dc2626; }
:root[data-theme="discord"] { --accent: #5865f2; --accent-2: #4752c4; }

* { box-sizing: border-box; margin: 0; }
html, body { min-height: 100%; }
body {
  font-family: var(--font);
  background: radial-gradient(ellipse at 50% 18%, color-mix(in srgb, var(--accent) 10%, var(--bg)) 0%, var(--bg) 55%);
  background-color: var(--bg);
  color: var(--text);
  overflow-x: hidden;
}

/* floating coins in the background */
#bubbles { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
.bubble {
  position: absolute; display: grid; place-items: center; border-radius: 50%;
  border: 1px solid var(--line); color: var(--line); font-weight: 800;
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  animation: drift 14s ease-in-out infinite alternate;
}
@keyframes drift { from { transform: translateY(0); } to { transform: translateY(-22px); } }

/* top bar */
.topbar {
  position: relative; z-index: 5; display: flex; align-items: center;
  justify-content: space-between; padding: 22px clamp(16px, 4vw, 40px);
}
.brand { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 1.35rem; }
.brand .accent, .accent { color: var(--accent); }
.brand-mark {
  width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid var(--accent); color: var(--accent); font-size: .9rem; font-weight: 800;
  box-shadow: 0 0 22px var(--glow);
}
.controls { display: flex; gap: 10px; align-items: center; position: relative; }
.pill {
  height: 52px; border-radius: 26px; border: 1px solid var(--line);
  background: var(--card); color: var(--accent); font: 700 .9rem var(--font);
  padding: 0 18px; cursor: pointer;
}
select.pill { appearance: none; padding-inline: 18px 14px; }
.pill.icon { width: 52px; padding: 0; font-size: 1.3rem; }
.pill:focus-visible, .btn:focus-visible, .theme-item:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 3px;
}

.theme-menu {
  position: absolute; top: 62px; inset-inline-end: 0; min-width: 200px; z-index: 20;
  background: var(--card); border: 1px solid var(--line); border-radius: 18px;
  padding: 8px; display: none; box-shadow: 0 18px 40px rgba(0,0,0,.6);
}
.theme-menu.open { display: block; }
.theme-item {
  display: flex; align-items: center; gap: 12px; width: 100%; background: none;
  border: 0; color: #c9ccd6; font: 700 .9rem var(--font); padding: 12px 14px;
  border-radius: 12px; cursor: pointer; text-align: start;
}
.theme-item:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.swatch { width: 22px; height: 22px; border-radius: 50%; flex: none; }
.sw-blue { background: linear-gradient(135deg, #3b82f6 50%, #000 50%); }
.sw-pink { background: linear-gradient(135deg, #ec4899 50%, #000 50%); }
.sw-red { background: linear-gradient(135deg, #ef4444 50%, #000 50%); }
.sw-discord { background: #5865f2; }

/* page body */
main {
  position: relative; z-index: 2; width: min(760px, 100% - 32px);
  margin: 0 auto; padding-bottom: 60px; text-align: center;
}

.coin-wrap { display: grid; place-items: center; margin: 8px 0 34px; }
.coin {
  position: relative; width: 172px; height: 172px; border-radius: 50%;
  display: grid; place-items: center; background: #08090d;
  border: 1px solid var(--accent); box-shadow: 0 0 60px var(--glow), inset 0 0 30px rgba(0,0,0,.8);
}
.coin::before {
  content: ""; position: absolute; inset: -14px; border-radius: 50%;
  border: 1px solid var(--line);
}
.coin span { color: var(--accent); font-size: 2.2rem; font-weight: 800; letter-spacing: 1px; }
.orbit { position: absolute; inset: -14px; border-radius: 50%; animation: spin 7s linear infinite; }
.orbit i {
  position: absolute; top: 6px; left: 50%; width: 10px; height: 10px; margin-left: -5px;
  border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent);
}
@keyframes spin { to { transform: rotate(360deg); } }

.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 52px; }
.card {
  background: color-mix(in srgb, var(--card) 92%, transparent); border: 1px solid var(--line);
  border-radius: 22px;
}
.stat { padding: 22px 12px; }
.stat small { display: block; color: #b8bbc7; font-weight: 700; font-size: .95rem; margin-bottom: 8px; }
.stat strong { color: var(--accent); font-size: 1.9rem; font-weight: 800; }

h1 { font-size: clamp(2rem, 6vw, 3rem); font-weight: 800; line-height: 1.3; }
.sub { color: var(--muted); margin: 14px 0 34px; font-size: 1rem; }

.feature { padding: 30px 20px; margin-bottom: 18px; }
.feature h2 { font-size: 1.35rem; font-weight: 800; }
.feature h2 .spark { color: var(--accent); }
.feature p { color: var(--muted); margin-top: 8px; }

.actions { padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.btn {
  display: grid; place-items: center; height: 62px; border-radius: 16px;
  font: 800 1rem var(--font); text-decoration: none; cursor: pointer; border: 1px solid transparent;
  transition: transform .15s ease, filter .15s ease;
}
.btn:hover { transform: translateY(-2px); filter: brightness(1.1); }
.btn.primary { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #06070b; }
.btn.ghost { background: #111214; color: var(--accent); border-color: var(--line); }

.notice {
  display: none; margin: 0 0 18px; padding: 12px 16px; border-radius: 14px;
  border: 1px solid #ef4444; color: #fca5a5; background: rgba(239,68,68,.08); font-weight: 700;
}
.notice.show { display: block; }

/* "coming soon" page */
.soon-card { padding: 38px 22px; }
.soon-card h1 { margin-bottom: 10px; }
.user-chip {
  display: inline-flex; align-items: center; gap: 12px; padding: 8px 18px 8px 8px;
  border: 1px solid var(--line); border-radius: 40px; margin-bottom: 26px; background: var(--card);
}
.user-chip img { width: 44px; height: 44px; border-radius: 50%; }
.user-chip b { font-weight: 800; }
.soon-card form { margin-top: 28px; display: grid; place-items: center; }
.soon-card .btn { width: min(260px, 100%); }

@media (max-width: 520px) {
  .coin { width: 150px; height: 150px; }
  .stat strong { font-size: 1.6rem; }
  .actions { padding: 12px; gap: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .orbit, .bubble { animation: none; }
  .btn { transition: none; }
}

/* ================= dashboard ================= */
:root[data-theme="gold"] { --accent: #fbbf24; --accent-2: #f59e0b; }
.sw-gold { background: linear-gradient(135deg, #fbbf24 50%, #000 50%); }

body.dash {
  background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--accent) 8%, #0a0a0d) 0%, #08080b 62%);
  background-color: #08080b;
}
.ico { display: inline-grid; place-items: center; width: 24px; height: 24px; flex: none; }
.ico svg { width: 100%; height: 100%; }
.goldc { color: var(--accent); }
.muted { color: #8f94a3; line-height: 1.8; }
.center { text-align: center; padding: 60px 0; }

.dtop {
  position: sticky; top: 0; z-index: 30; display: flex; align-items: center; justify-content: space-between;
  padding: 14px clamp(14px, 3vw, 32px); background: rgba(8,8,11,.88); backdrop-filter: blur(10px);
  border-bottom: 1px solid #191a21;
}
.dtop .brand-mark { width: 52px; height: 52px; }
.burger {
  width: 54px; height: 54px; border-radius: 50%; border: 1px solid #2a2b33; background: #0c0c10;
  color: #fff; display: grid; place-items: center; cursor: pointer;
}
.burger:focus-visible, .ritem:focus-visible, .mitem:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.dmain { position: relative; z-index: 2; width: min(1000px, 100% - 28px); margin: 0 auto; padding: 28px 0 90px; }
.page { display: grid; gap: 18px; }
.greet { font-size: clamp(1.7rem, 5vw, 2.6rem); font-weight: 800; line-height: 1.4; }
.gold { background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #fff)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lead { color: #9aa0ae; line-height: 1.9; margin-top: -6px; }
.eyebrow { color: var(--accent); font-weight: 700; }
.h2 { font-size: 1.3rem; font-weight: 800; }

.status {
  display: flex; align-items: center; gap: 12px; padding: 18px 24px; border: 1px solid #1d1e25;
  border-radius: 30px; background: #0b0b0e; font-weight: 800; letter-spacing: .6px;
}
.dot { width: 10px; height: 10px; border-radius: 50%; background: #5b5f6b; flex: none; }
.dot.on { background: var(--accent); box-shadow: 0 0 10px var(--accent); }
.dot.pos { position: absolute; bottom: -2px; inset-inline-end: -2px; width: 14px; height: 14px; background: #22c55e; box-shadow: none; border: 2px solid #08080b; }

.cards3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.cards4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; }
.scard {
  display: flex; align-items: center; gap: 16px; padding: 20px; background: #0c0c10;
  border: 1px solid #1b1c23; border-radius: 22px;
}
.sico { width: 64px; height: 64px; border-radius: 18px; border: 1px solid #23242c; display: grid; place-items: center; color: var(--accent); flex: none; background: #0a0a0d; }
.stext strong { display: block; font-size: 1.9rem; font-weight: 800; line-height: 1.2; }
.stext small { color: #a1a5b3; font-weight: 700; }

.panelc { background: #0c0c10; border: 1px solid #1b1c23; border-radius: 26px; padding: 22px; display: grid; gap: 12px; align-content: start; }
.phd { display: flex; align-items: center; gap: 14px; }
.phd h2 { font-size: 1.3rem; font-weight: 800; }
.hico { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: #0a0a0d; box-shadow: 0 0 22px var(--glow); }
.hico.white { background: #fff; box-shadow: 0 0 22px rgba(255,255,255,.25); }
.bar { width: 6px; height: 26px; border-radius: 3px; background: var(--accent); }
.arow { display: flex; justify-content: space-between; align-items: center; padding: 18px 16px; background: #0e0e12; border: 1px solid #14151b; border-radius: 14px; }
.arow span { color: #9aa0ae; font-weight: 700; }
.arow b { font-size: 1.1rem; }
.arow.col { flex-direction: column; align-items: flex-start; gap: 6px; }
.upsell { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, #0c0c10), #0c0c10); border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
.upsell .btn { height: 58px; }

.ghead { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.gtitle h1 { font-size: clamp(1.4rem, 4vw, 2rem); font-weight: 800; }
.sub2 { color: var(--accent); opacity: .8; font-weight: 700; font-size: .9rem; }
.gicon { position: relative; width: 64px; height: 64px; flex: none; }
.gicon img, .gicon .fb { width: 64px; height: 64px; border-radius: 18px; object-fit: cover; }
.fb { display: grid; place-items: center; width: 100%; height: 100%; background: #25262d; color: #fff; font-weight: 800; }
.rangebar { display: flex; align-items: center; gap: 14px; }
.gold2 { color: var(--accent); font-weight: 700; opacity: .85; }
.sel {
  background: #09090c; color: #fff; border: 1px solid #23242c; border-radius: 14px; padding: 12px 16px;
  font: 700 .95rem var(--font); min-width: 190px;
}

.tabs { display: flex; flex-wrap: wrap; gap: 10px; }
.tab { background: none; border: 1px solid transparent; color: #8a7a3a; font: 800 .95rem var(--font); padding: 10px 18px; border-radius: 14px; cursor: pointer; }
.tab.on { background: color-mix(in srgb, var(--accent) 16%, transparent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); color: var(--accent); }
.tab:focus-visible, .sel:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.chartbox { position: relative; background: #09090c; border: 1px solid #15161c; border-radius: 18px; padding: 18px 22px 12px; }
.svgwrap svg { width: 100%; height: 200px; display: block; }
.chart-svg .grid { stroke: #17181e; stroke-width: 1; vector-effect: non-scaling-stroke; }
.chart-svg .line { stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.chart-svg .l1 { stroke: var(--accent); }
.chart-svg .l2 { stroke: #ef4444; }
.xlabels { position: relative; height: 26px; margin-top: 8px; color: #b8bbc7; font-weight: 800; font-size: .85rem; }
.xlabels span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.xlabels span:first-child { transform: none; }
.legend { display: flex; gap: 18px; margin-top: 8px; color: #b8bbc7; font-weight: 700; font-size: .85rem; }
.legend span::before { content: ""; display: inline-block; width: 12px; height: 4px; border-radius: 2px; margin-inline-end: 8px; vertical-align: middle; }
.legend .k1::before { background: var(--accent); } .legend .k2::before { background: #ef4444; }

.lrow { display: flex; align-items: center; gap: 14px; padding: 12px 14px; background: #0e0e12; border: 1px solid #14151b; border-radius: 14px; margin-top: 8px; }
.lrow.me { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.lrow img, .lrow .fb { width: 40px; height: 40px; border-radius: 50%; flex: none; object-fit: cover; }
.lrow .rk { min-width: 44px; color: var(--accent); font-weight: 800; }
.lrow .nm { flex: 1; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty { text-align: center; color: #5f6370; font-weight: 800; padding: 46px 10px; display: grid; gap: 14px; justify-items: center; }
.empty a, .notice a { color: var(--accent); }
.dmain .notice { margin: 0; }

.btn.small { height: 46px; padding: 0 22px; border-radius: 14px; }
.btn.wide { width: 100%; }
.rowbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }

.featgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
.fcard { background: #0c0c10; border: 1px solid #1b1c23; border-radius: 20px; padding: 20px; }
.fcard h3 { color: var(--accent); margin-bottom: 8px; }
.tblwrap { overflow-x: auto; border-radius: 16px; border: 1px solid #14151b; }
.tbl { width: 100%; min-width: 680px; border-collapse: collapse; text-align: start; }
.tbl th, .tbl td { padding: 16px 18px; text-align: start; vertical-align: top; border-bottom: 1px solid #14151b; line-height: 1.7; }
.tbl th { background: #0e0e12; font-weight: 800; }
.tbl td:first-child { font-weight: 800; }
.tbl tr:last-child td { border-bottom: 0; }

.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 16px; }
.plan { position: relative; background: #09090c; border: 1px solid #1f2027; border-radius: 22px; padding: 22px; display: grid; gap: 10px; cursor: pointer; align-content: start; }
.plan.sel { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), 0 0 30px var(--glow); }
.plan:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.plan h3 { font-size: 1.2rem; }
.plan .pr strong { color: var(--accent); font-size: 2rem; }
.plan ul { list-style: none; padding: 0; display: grid; gap: 10px; color: #c9ccd6; }
.plan li { display: flex; gap: 10px; align-items: flex-start; line-height: 1.6; }
.plan li .ico { width: 20px; height: 20px; margin-top: 3px; }
.ribbon { position: absolute; top: 16px; inset-inline-end: 16px; background: var(--accent); color: #0a0a0d; font-weight: 800; font-size: .8rem; padding: 4px 12px; border-radius: 12px; }
.stepper { display: inline-flex; align-items: center; gap: 14px; width: fit-content; padding: 6px; border: 1px solid #23242c; border-radius: 14px; }
.stepper button { width: 38px; height: 38px; border-radius: 10px; border: 0; background: #17181d; color: #fff; font: 800 1.2rem var(--font); cursor: pointer; }
.stepper span { min-width: 70px; text-align: center; font-weight: 800; }
.totalrow { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-radius: 14px; background: #0e0e12; border: 1px solid #14151b; font-weight: 800; }
.totalrow b { color: var(--accent); font-size: 1.4rem; }
.fine { color: #6c7080; font-size: .85rem; line-height: 1.7; text-align: center; }

/* drawer */
.scrim { position: fixed; inset: 0; background: rgba(0,0,0,.6); opacity: 0; pointer-events: none; transition: opacity .2s; z-index: 40; }
.drawer {
  position: fixed; top: 0; bottom: 0; inset-inline-start: 0; z-index: 50; display: flex; width: min(430px, 100vw);
  background: #0a0a0d; border-inline-end: 1px solid #1b1c23; transform: translateX(100%); transition: transform .25s ease;
  visibility: hidden;
}
body.open .drawer { transform: none; visibility: visible; }
body.open .scrim { opacity: 1; pointer-events: auto; }
.rail { width: 88px; flex: none; overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 18px 0; background: #08080b; border-inline-start: 1px solid #1b1c23; }
.ritem { width: 56px; height: 56px; border-radius: 16px; overflow: hidden; display: grid; place-items: center; background: #25262d; color: #fff; font-weight: 800; border: 2px solid transparent; flex: none; text-decoration: none; }
.ritem img { width: 100%; height: 100%; object-fit: cover; }
.ritem.active { border-color: var(--accent); }
.ritem.add { background: none; border: 1px dashed #3a3b45; color: #a1a5b3; }
.panel { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.phead { display: flex; align-items: center; gap: 14px; padding: 26px 18px; font-weight: 800; font-size: 1.15rem; }
.phead span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hav { width: 52px; height: 52px; border-radius: 50%; overflow: hidden; flex: none; display: grid; }
.hav img { width: 100%; height: 100%; object-fit: cover; }
.menu { flex: 1; overflow-y: auto; padding: 0 12px; }
.mitem { display: flex; align-items: center; gap: 14px; padding: 16px 14px; border-radius: 14px; color: #a6aab8; font-weight: 800; text-decoration: none; margin-bottom: 6px; position: relative; }
.mitem:hover { background: #121217; }
.mitem.active { color: #fff; background: linear-gradient(270deg, color-mix(in srgb, var(--accent) 24%, transparent), transparent); }
.mitem.active::before { content: ""; position: absolute; inset-inline-start: -12px; top: 12px; bottom: 12px; width: 4px; border-radius: 2px; background: var(--accent); }
.mitem .ico { color: #a6aab8; }
.mitem.active .ico, .mitem:has(.ico):first-child.active .ico { color: var(--accent); }
.badge { margin-inline-start: auto; font-style: normal; font-size: .72rem; padding: 3px 10px; border-radius: 12px; background: #17181d; border: 1px solid #2a2b33; color: #b8bbc7; }
.panel form { border-top: 1px solid #1b1c23; }
.logout { display: flex; align-items: center; gap: 12px; width: 100%; padding: 20px 22px; background: none; border: 0; color: #ef4444; font: 800 1rem var(--font); cursor: pointer; }

@media (max-width: 520px) {
  .scard { padding: 16px; } .sico { width: 56px; height: 56px; }
  .panelc { padding: 16px; border-radius: 22px; }
  .rangebar { flex-direction: column; align-items: stretch; } .sel { width: 100%; }
}
/* ===== بروفايل البوت + الحماية ===== */
.hidden { display: none !important; }
button.mitem { width: 100%; background: none; border: 0; font: inherit; font-weight: 800; cursor: pointer; text-align: start; }
.mitem .chev { margin-inline-start: auto; width: 18px; height: 18px; transition: transform .2s; }
.mitem .chev.up { transform: rotate(180deg); }
.msub { margin-inline-start: 22px; border-inline-start: 1px solid #23242c; padding-inline-start: 14px; display: grid; gap: 2px; margin-bottom: 6px; }
.msubitem { display: block; padding: 12px 14px; border-radius: 12px; color: #8f94a3; font-weight: 800; text-decoration: none; }
.msubitem:hover { background: #121217; }
.msubitem.active { color: var(--accent); }
.msubitem:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button.mitem:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.flash { display: none; padding: 12px 16px; border-radius: 14px; font-weight: 800; }
.flash.show { display: block; position: sticky; top: 76px; z-index: 20; backdrop-filter: blur(8px); }
.flash.ok { border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, #0a0a0d); }
.flash.bad { border: 1px solid #ef4444; color: #fca5a5; background: rgba(40,10,10,.92); }

.inp { width: 100%; background: #09090c; color: #fff; border: 1px solid #23242c; border-radius: 14px; padding: 12px 16px; font: 700 .95rem var(--font); }
.inp.num { width: 96px; text-align: center; }
.inp:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.inp:disabled, .sel:disabled, .btn:disabled { opacity: .45; cursor: not-allowed; }
.sel.full { width: 100%; }
.btn.small { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.btn .ico { width: 20px; height: 20px; }
.btn.danger { color: #f87171; }
.btnrow { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.btnrow .inp { flex: 1; min-width: 180px; }
.tag { font-size: .8rem; vertical-align: middle; background: var(--accent); color: #0a0a0d; padding: 3px 12px; border-radius: 12px; font-weight: 800; }
.split { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.stack { display: grid; gap: 18px; }
.preview { position: sticky; top: 90px; }
.assetrow { display: flex; align-items: center; gap: 14px; }
.thumb { width: 64px; height: 64px; border-radius: 16px; object-fit: cover; background: #17181d; }
.thumb.wide { width: 112px; height: 63px; background-size: cover; background-position: center; }
.chip { display: inline-block; width: fit-content; padding: 6px 14px; border-radius: 12px; background: #17181d; border: 1px solid #2a2b33; color: #b8bbc7; font-weight: 800; font-size: .85rem; }
.fine.start { text-align: start; }
.lockbox { display: grid; gap: 12px; padding: 22px; border-radius: 22px; border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, #0c0c10), #0c0c10); }
.lockbox .btn { justify-self: start; }

.pv { border: 1px solid #23242c; border-radius: 18px; overflow: hidden; background: #111214; }
.pv-top { padding: 10px 14px; color: #8f94a3; font-weight: 800; font-size: .85rem; background: #0a0a0d; }
.pv-banner { height: 110px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 45%, #111), #1a1b20); background-size: cover; background-position: center; }
.pv-body { padding: 0 18px 18px; display: grid; gap: 4px; }
.pv-av { width: 84px; height: 84px; border-radius: 50%; border: 5px solid #111214; margin-top: -44px; object-fit: cover; background: #25262d; }
.pv-name { font-weight: 800; font-size: 1.2rem; }
.pv-tag { color: #8f94a3; font-weight: 700; }
.pv-srv { margin-top: 10px; padding-top: 10px; border-top: 1px solid #23242c; color: #a1a5b3; font-size: .9rem; line-height: 1.7; }

.switch { width: 52px; height: 30px; border-radius: 15px; border: 1px solid #2a2b33; background: #17181d; position: relative; cursor: pointer; flex: none; padding: 0; }
.switch i { position: absolute; top: 3px; inset-inline-start: 3px; width: 22px; height: 22px; border-radius: 50%; background: #8f94a3; transition: inset-inline-start .2s, background .2s; }
.switch.on { background: color-mix(in srgb, var(--accent) 30%, #0c0c10); border-color: var(--accent); }
.switch.on i { inset-inline-start: 25px; background: var(--accent); }
.switch:disabled { opacity: .45; cursor: not-allowed; }
.switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.trow { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.trow small { display: block; }

.limits { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.limit { background: #0e0e12; border: 1px solid #14151b; border-radius: 18px; padding: 16px; display: grid; gap: 10px; }
.lhead { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.lhead small { display: block; }
.flabel { color: #9aa0ae; font-weight: 700; font-size: .9rem; }
.rule { display: flex; align-items: center; gap: 14px; padding: 16px; background: #0e0e12; border: 1px solid #14151b; border-radius: 16px; margin-top: 8px; }
.rinfo { flex: 1; min-width: 0; display: grid; gap: 2px; }
.rinfo small { display: block; }
.lrow .nm small { margin-inline-start: 8px; }
textarea.inp { resize: vertical; }
@media (max-width: 860px) { .split { grid-template-columns: 1fr; } .preview { position: static; } }

@media (prefers-reduced-motion: reduce) { .drawer, .scrim { transition: none; } }

/* ===== أوامر + حماية الصور ===== */
.ccard { background: #0c0c10; border: 1px solid #1b1c23; border-radius: 26px; overflow: hidden; }
.ccard:has(.switch.on) { border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
.chead { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 22px; cursor: pointer; }
.chead:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.ctitle h3 { font-size: 1.2rem; font-weight: 800; }
.ctitle small { display: block; }
.cctl { display: flex; align-items: center; gap: 14px; }
.cctl .chev, .mp-head .chev { width: 20px; height: 20px; color: #8f94a3; transition: transform .2s; }
.cctl .chev.up, .mp-head .chev.up { transform: rotate(180deg); }
.cbody { border-top: 1px solid #17181e; padding: 20px 22px 24px; display: grid; gap: 24px; }
.csec { display: grid; gap: 10px; }
.hbox { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; flex: none; }
.hbox .ico { width: 22px; height: 22px; }
.hbox.blue { background: #1c1f45; color: #818cf8; }
.hbox.orange { background: #3a1d0a; color: #fb923c; }
.hbox.gold { background: color-mix(in srgb, var(--accent) 14%, #0c0c10); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
.plabel { font-weight: 800; font-size: .85rem; }
.plabel.okc { color: #22c55e; } .plabel.badc { color: #f87171; }

.mp { position: relative; }
.mp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; background: #0e0e12; border: 1px solid #1b1c23; border-radius: 16px; padding: 14px 16px; color: #fff; font: 700 .95rem var(--font); cursor: pointer; text-align: start; }
.mp-head:disabled { opacity: .6; cursor: not-allowed; }
.mp-head:focus-visible, .mp-opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.mp-chips { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; }
.mchip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 12px; background: #1a1b21; border: 1px solid #2a2b33; font-weight: 800; font-size: .85rem; }
.cdot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
.mp-list { margin-top: 8px; background: #09090c; border: 1px solid #23242c; border-radius: 16px; padding: 10px; display: grid; gap: 8px; }
.mp-opts { max-height: 220px; overflow-y: auto; display: grid; gap: 4px; }
.mp-opt { display: flex; align-items: center; gap: 10px; background: none; border: 0; color: #c9ccd6; font: 700 .9rem var(--font); padding: 10px 12px; border-radius: 10px; cursor: pointer; text-align: start; }
.mp-opt span { flex: 1; }
.mp-opt:hover { background: #121217; }
.mp-opt.on { color: #fff; background: color-mix(in srgb, var(--accent) 12%, transparent); }
.mp-opt .ico { width: 18px; height: 18px; }

.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.achip { display: inline-flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 14px; background: #0e0e12; border: 1px solid #1b1c23; color: var(--accent); font-weight: 800; }
.achip .x { background: none; border: 0; color: #8f94a3; font-size: 1.2rem; line-height: 1; cursor: pointer; }
.achip .x:hover { color: #f87171; }
.addrow { display: flex; gap: 10px; align-items: center; }
.addrow .inp { flex: 1; border-radius: 16px; padding: 14px 18px; }
.plus { width: 44px; height: 44px; border-radius: 12px; border: 0; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #0a0a0d; cursor: pointer; display: grid; place-items: center; flex: none; }
.plus:disabled { opacity: .45; cursor: not-allowed; }

.btn.good { color: #4ade80; }
.checkrow { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #c9ccd6; }
.imgtools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.imgtools .inp { flex: 1; min-width: 200px; }
.cbadge { padding: 4px 14px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 14%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); color: var(--accent); font-weight: 800; font-size: .85rem; }
.imggrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.icard { background: #09090c; border: 1px solid #1b1c23; border-radius: 20px; padding: 14px; display: grid; gap: 10px; align-content: start; }
.icard h4 { font-weight: 800; }
.ithumb { position: relative; height: 170px; border-radius: 14px; background: #0e0e12; border: 1px solid #14151b; overflow: hidden; display: grid; place-items: center; }
.ithumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
.ithumb.nsfw img { filter: blur(14px); transition: filter .2s; }
.ithumb.nsfw:hover img { filter: none; }
.ibadge { position: absolute; top: 10px; inset-inline-start: 10px; padding: 3px 12px; border-radius: 10px; font-size: .78rem; font-weight: 800; }
.ibadge.ok { background: rgba(34,197,94,.16); color: #4ade80; border: 1px solid rgba(34,197,94,.4); }
.ibadge.off { background: rgba(239,68,68,.14); color: #f87171; border: 1px solid rgba(239,68,68,.4); }
.nbadge { position: absolute; bottom: 10px; inset-inline-end: 10px; background: #ef4444; color: #fff; font-weight: 800; font-size: .75rem; padding: 2px 10px; border-radius: 10px; }

/* ===== شريط "تغييرات غير محفوظة" + بريميوم ===== */
/* ===== logs + welcome ===== */

.lcard { background: #0c0c10; border: 1px solid #1b1c23; border-radius: 26px; padding: 20px 22px; display: grid; gap: 16px; }
.lcard.open { border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
.lhead2 { display: flex; align-items: center; gap: 16px; }
.lico { width: 56px; height: 56px; border-radius: 16px; background: #17181b; display: grid; place-items: center; color: #8f94a3; flex: none; }
.lico .ico { width: 26px; height: 26px; }
.lcard.open .lico { background: color-mix(in srgb, var(--accent) 14%, #0c0c10); color: var(--accent); }
.ltext { flex: 1; min-width: 0; display: grid; gap: 2px; }
.ltext h3 { font-size: 1.15rem; font-weight: 800; }
.ltext small { display: block; }
.lbody { display: grid; gap: 14px; }
.lcard:not(.open) .lbody { display: none; }
.colorin { width: 38px; height: 38px; border: 1px solid #23242c; border-radius: 10px; padding: 2px; background: #09090c; cursor: pointer; }
.colorin:disabled { opacity: .45; cursor: not-allowed; }
.colorrow { display: flex; align-items: center; gap: 12px; color: #9aa0ae; font-weight: 700; }

.switch.green.on { background: #22c55e; border-color: #22c55e; box-shadow: 0 0 16px rgba(34,197,94,.45); }
.switch.green.on i { background: #fff; }
.sep { height: 1px; background: #17181e; }
.mrow { display: flex; align-items: center; gap: 16px; }
.mico { width: 60px; height: 60px; border-radius: 18px; display: grid; place-items: center; background: var(--accent); color: #0a0a0d; flex: none; box-shadow: 0 6px 22px var(--glow); }
.mico .ico { width: 28px; height: 28px; }
.masterc { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, #0c0c10), #0c0c10); border-color: color-mix(in srgb, var(--accent) 25%, transparent); }

.ptabs { display: flex; gap: 6px; background: #0a0a0d; border: 1px solid #1b1c23; border-radius: 22px; padding: 8px; width: fit-content; max-width: 100%; margin-inline: auto; overflow-x: auto; }
.ptab { display: flex; align-items: center; gap: 8px; padding: 12px 22px; border-radius: 16px; background: none; border: 0; color: #a6aab8; font: 800 .95rem var(--font); cursor: pointer; white-space: nowrap; }
.ptab .ico { width: 18px; height: 18px; }
.ptab.on { background: #fff; color: #0a0a0d; }
.ptab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.ta { min-height: 150px; resize: vertical; line-height: 1.8; }
.mono { font-family: ui-monospace, Consolas, monospace; }
.subc { background: #09090c; border: 1px solid #17181e; border-radius: 20px; padding: 18px; display: grid; gap: 12px; }
.vgrid { display: flex; flex-wrap: wrap; gap: 10px; }
.vchip { background: #0e0e12; border: 1px solid #1b1c23; border-radius: 14px; padding: 10px 16px; color: #c9ccd6; cursor: pointer; display: grid; gap: 2px; text-align: center; font-family: var(--font); }
.vchip:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.vchip:disabled { opacity: .5; cursor: not-allowed; }
.vchip small { color: #6c7080; }
.vchip code { font-weight: 800; }

.ropts { display: grid; gap: 10px; }
.ropt { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-radius: 14px; background: #0e0e12; border: 1px solid #1b1c23; color: #a6aab8; font: 800 .95rem var(--font); cursor: pointer; text-align: start; }
.ropt:disabled { opacity: .5; cursor: not-allowed; }
.ropt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ropt.on { background: color-mix(in srgb, var(--accent) 16%, #0c0c10); border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent); }
.rdot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #5b5f6b; flex: none; }
.ropt.on .rdot { border-color: var(--accent); background: radial-gradient(circle, var(--accent) 45%, transparent 50%); }

.wstage { position: relative; width: 100%; aspect-ratio: 1024 / 450; container-type: size; border-radius: 20px; overflow: hidden; border: 1px solid #1b1c23; background: linear-gradient(135deg, #16161c, #2a2110) center / cover no-repeat; }
.dragx { cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
.dragx:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.dragx.selx { outline: 2px dashed color-mix(in srgb, var(--accent) 70%, transparent); outline-offset: 4px; }
.dragx.dragging { cursor: grabbing; }
.wel-av { position: absolute; transform: translate(-50%, -50%); aspect-ratio: 1; border-radius: 50%; border: 3px solid #fff; object-fit: cover; }
.wel-t { position: absolute; transform: translate(-50%, -50%); font-weight: 800; white-space: nowrap; text-shadow: 0 2px 8px rgba(0,0,0,.6); line-height: 1.2; }
.bgbar { display: flex; align-items: center; gap: 10px; background: #17181b; border: 1px solid #23242c; border-radius: 16px; padding: 8px 10px; }
.bgbar .inp { border: 0; background: transparent; }
.elgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.elbtn { display: grid; gap: 2px; justify-items: center; padding: 16px; border-radius: 16px; background: #101013; border: 1px solid transparent; color: #fff; font: inherit; cursor: pointer; }
.elbtn small { color: #6c7080; }
.elbtn.on { border-color: var(--accent); }
.elbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.propgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.pf { display: grid; gap: 6px; color: #9aa0ae; font-weight: 700; font-size: .85rem; align-content: start; }
.pf.wide2 { grid-column: 1 / -1; }
@media (max-width: 520px) { .lcard { padding: 16px; } .ptab { padding: 10px 14px; } }

/* ===== autoreply + embeds ===== */

.addbox { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 18px; border-radius: 20px; background: transparent; border: 2px dashed #2a2b33; color: #b8bbc7; font: 800 1rem var(--font); cursor: pointer; }
.addbox:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: #fff; }
.addbox:disabled { opacity: .45; cursor: not-allowed; }
.addbox:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.addbox.big { flex-direction: column; min-height: 150px; }
.plusb { width: 54px; height: 54px; border-radius: 16px; background: #17181d; display: grid; place-items: center; }
.arlist { display: grid; gap: 12px; }
.arcard { background: #0c0c10; border: 1px solid #1b1c23; border-radius: 20px; padding: 16px 18px; display: grid; gap: 6px; cursor: pointer; }
.arcard.on { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 7%, #0c0c10); }
.arcard.bad { border-color: #ef4444; }
.arcard:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.arhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.artitle { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 1.1rem; }
.arctl { display: flex; align-items: center; gap: 8px; }
.redt { color: #f87171; font-weight: 800; display: inline-flex; align-items: center; gap: 6px; }
.mbadge { display: inline-flex; padding: 3px 12px; border-radius: 12px; background: #17181d; border: 1px solid #2a2b33; color: #b8bbc7; font-size: .75rem; font-weight: 800; }
.mbadge.gold { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 10%, #0c0c10); }
.mtabs { display: flex; gap: 6px; background: #09090c; border: 1px solid #17181e; border-radius: 14px; padding: 5px; width: fit-content; max-width: 100%; flex-wrap: wrap; }
.mtab { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 10px; background: none; border: 1px solid transparent; color: #a6aab8; font: 800 .9rem var(--font); cursor: pointer; }
.mtab .ico { width: 16px; height: 16px; }
.mtab.on { background: var(--accent); color: #0a0a0d; }
.mtab:disabled { opacity: .5; cursor: not-allowed; }
.mtab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.newb { font-style: normal; font-size: .65rem; background: var(--accent); color: #0a0a0d; border-radius: 6px; padding: 1px 6px; }
.mtab.on .newb { background: #0a0a0d; color: var(--accent); }
.inp.bad { border-color: #ef4444; }
.errt { color: #f87171; font-weight: 800; }
.fine { color: #6c7080; }
.empty.boxed { background: #0b0c10; border: 1px dashed #1b1c23; border-radius: 20px; }
.rowbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.embgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.embcard { background: #0c0c10; border: 1px solid #1b1c23; border-radius: 22px; padding: 22px; display: grid; gap: 14px; cursor: pointer; align-content: start; }
.embcard.on { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.embcard:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.embtags { display: flex; gap: 8px; flex-wrap: wrap; }
.edpanel { display: grid; gap: 16px; }
.twocol { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.statbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; background: #09090c; border: 1px solid #17181e; border-radius: 14px; padding: 10px 14px; }
.sbadge, .stat { background: #17181d; border: 1px solid #23242c; border-radius: 10px; padding: 5px 12px; font-size: .8rem; font-weight: 800; color: #c9ccd6; }
.stat { font-family: ui-monospace, Consolas, monospace; }
.stat.over { border-color: #ef4444; color: #fca5a5; }
.colorrow2 { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.colorin.big { width: 54px; height: 54px; border-radius: 14px; }
.swatches { display: flex; gap: 8px; flex-wrap: wrap; }
.swatch { width: 34px; height: 34px; border-radius: 10px; border: 2px solid transparent; cursor: pointer; padding: 0; }
.swatch.on { border-color: #fff; }
.swatch:disabled { opacity: .5; cursor: not-allowed; }
.swatch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.embbox { background: #2b2d31; border-radius: 10px; border-inline-start: 5px solid var(--accent); padding: 16px; display: grid; gap: 12px; }
.embbox .inp { background: #232428; border-color: #383a40; }
.subrow { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.subrow > .inp { flex: 1 1 160px; min-width: 0; }
.chk { display: inline-flex; align-items: center; gap: 8px; color: #c9ccd6; font-weight: 700; }
.actrow { background: #0b0b0f; border: 1px solid #17181e; border-radius: 16px; padding: 14px; display: grid; gap: 10px; }
.actrow .subrow > .inp:first-child { flex: 0 0 90px; }
.actctl { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.btnrow.end { justify-content: flex-end; flex-wrap: wrap; }

body.has-savebar .dmain { padding-bottom: 230px; }
.savebar {
  position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 35;
  width: min(900px, calc(100% - 28px)); display: grid; gap: 14px; padding: 18px 20px;
  background: rgba(12,12,16,.96); backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 24px;
  box-shadow: 0 18px 50px rgba(0,0,0,.7), 0 0 30px var(--glow);
}
.sbinfo { display: flex; align-items: center; gap: 14px; }
.sbinfo b { display: flex; align-items: center; gap: 8px; font-size: 1.05rem; }
.sbinfo small { display: block; color: #a1a5b3; font-weight: 700; margin-top: 2px; }
.sbico { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; flex: none; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, #0c0c10); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
.sbdot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); display: inline-block; }
.sbbtns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.sbbtns .btn { height: 50px; }
.tline { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pbadge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 12px; border-radius: 12px; background: #17181d; border: 1px solid #2a2b33; color: #b8bbc7; font-size: .75rem; font-weight: 800; }
.pbadge .ico { width: 14px; height: 14px; }
.lockedsw { width: 66px; height: 36px; border-radius: 18px; border: 1px solid #2a2b33; background: #0c0c10; display: grid; place-items: center; color: #8f94a3; flex: none; }
.lockedsw .ico { width: 18px; height: 18px; }

/* ===== role panels ===== */
.ptab.dashed { border: 1px dashed #3a3b45; }
.ptab:disabled { opacity: .45; cursor: not-allowed; }
.rpprev { background: #313338; border-radius: 12px; padding: 16px; }
.rpmsg { display: grid; gap: 8px; }
.rpname { font-weight: 800; display: flex; align-items: center; gap: 8px; }
.rpbot { background: #5865f2; border-radius: 6px; padding: 1px 6px; font-size: .7rem; }
.rpemb { background: #2b2d31; border-radius: 8px; border-inline-start: 5px solid var(--accent); padding: 12px 14px; display: grid; gap: 6px; }
.rpemb p { color: #dbdee1; white-space: pre-wrap; line-height: 1.7; }
.rpemb small { color: #949ba4; }
.rpfield { display: grid; gap: 2px; }
.rpimg { max-width: 100%; border-radius: 8px; }
.rpbtns { display: flex; flex-wrap: wrap; gap: 8px; }
.rpbtn { padding: 8px 16px; border-radius: 8px; font-weight: 800; font-size: .85rem; color: #fff; }
.rpsel { background: #1e1f22; border-radius: 8px; padding: 12px 14px; color: #949ba4; }
.rpreact { background: #2b2d31; border: 1px solid #3f4147; border-radius: 8px; padding: 4px 10px; }
.rpstyles { display: flex; flex-wrap: wrap; gap: 8px; }
.rpst { flex: 1; min-width: 70px; padding: 10px; border-radius: 10px; border: 1px solid transparent; color: #fff; font: 800 .85rem var(--font); opacity: .45; cursor: pointer; }
.rpst.on { opacity: 1; border-color: rgba(255,255,255,.5); }
.rpst:disabled { cursor: not-allowed; }
.rpbtn.s-primary, .rpst.s-primary { background: #5865f2; }
.rpbtn.s-secondary, .rpst.s-secondary { background: #4f545c; }
.rpbtn.s-success, .rpst.s-success { background: #248046; }
.rpbtn.s-danger, .rpst.s-danger { background: #da373c; }
.rpbtn.s-danger, .rpst.s-danger { background: #da373c; }
.rpbtn.s-danger, .rpst.s-danger { background: #da373c; }
/* ===== levels ===== */
.iconlbl { display: flex; align-items: center; gap: 6px; }
.iconlbl .ico { width: 16px; height: 16px; }
.nstep { display: flex; align-items: center; background: #09090c; border: 1px solid #23242c; border-radius: 14px; overflow: hidden; }
.nstep button { width: 52px; height: 50px; background: none; border: 0; color: #c9ccd6; font: 800 1.2rem var(--font); cursor: pointer; }
.nstep button:hover:not(:disabled) { background: #121217; }
.nstep button:disabled { opacity: .45; cursor: not-allowed; }
.nstep input { flex: 1; min-width: 0; text-align: center; background: none; border: 0; color: #fff; font: 800 1rem var(--font); -moz-appearance: textfield; }
.nstep input::-webkit-outer-spin-button, .nstep input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.nstep input:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.rwcard { background: #09090c; border: 1px solid #17181e; border-radius: 20px; padding: 18px; display: grid; gap: 14px; }
.rwgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.rwtog { display: flex; gap: 26px; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid #17181e; }
.rwt { display: flex; align-items: center; gap: 12px; font-weight: 700; color: #a6aab8; }
.chrow { display: flex; align-items: center; gap: 10px; padding: 16px 18px; }
.chrow .sel { flex: 1; }
.fgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.fopt { display: grid; gap: 4px; justify-items: center; padding: 20px 14px; border-radius: 18px; background: #09090c; border: 1px solid #1b1c23; color: #a6aab8; font: inherit; cursor: pointer; }
.fopt small { color: #6c7080; }
.fopt.on { background: color-mix(in srgb, var(--accent) 12%, #0c0c10); border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); }
.fopt.on small { color: color-mix(in srgb, var(--accent) 70%, #fff); }
.fopt:disabled { opacity: .5; cursor: not-allowed; }
.fopt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.hbox.purple { background: #2a1b45; color: #a78bfa; }
.stack.tight { gap: 8px; }
.warnt { color: #fbbf24; font-weight: 800; }
.bhv { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 18px; border-radius: 16px; background: #09090c; border: 1px solid #17181e; }
.bhv small { display: block; }
.infobox { background: #0d1424; border: 1px solid #1b2a4a; border-radius: 16px; padding: 18px; display: grid; gap: 10px; }
.infobox b { color: #93c5fd; }
.infobox ul { margin: 0; padding-inline-start: 22px; color: #9aa0ae; line-height: 2; }
.rwt { display: flex; align-items: center; gap: 12px; font-weight: 700; color: #a6aab8; }

/* إخفاء السكرول بالقائمة الجانبية */
.menu, .rail { scrollbar-width: none; -ms-overflow-style: none; }
.menu::-webkit-scrollbar, .rail::-webkit-scrollbar { display: none; }
.vprev { display: flex; gap: 14px; align-items: flex-start; padding: 8px 4px; }
.vav { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; flex: none; background: #25262d; }
.vbody { flex: 1; min-width: 0; display: grid; gap: 6px; }
.vhead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.vapp { background: #5865f2; border-radius: 6px; padding: 1px 7px; font-size: .7rem; font-weight: 800; }
.vtime { color: #949ba4; font-size: .8rem; }
.vemb { background: #2b2d31; border-radius: 8px; border-inline-start: 5px solid #0099ff; padding: 14px; display: grid; gap: 12px; }
.vthumb { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; justify-self: start; }
.vcode { background: #0d0d10; border-radius: 6px; padding: 12px 14px; color: #dbdee1; line-height: 1.8; }
.vfoot { color: #949ba4; font-size: .8rem; font-weight: 700; }
.upprev { max-width: 100%; max-height: 170px; border-radius: 14px; object-fit: contain; background: #09090c; border: 1px solid #1b1c23; justify-self: start; }
.emowrap { position: relative; flex: none; }
.emobtn { cursor: pointer; font-size: 1.3rem; color: #fff; }
.emobtn img { width: 24px; height: 24px; }
.emopop { position: absolute; top: calc(100% + 8px); inset-inline-start: 0; z-index: 60; width: 320px; max-height: 320px; overflow-y: auto; background: #09090c; border: 1px solid #23242c; border-radius: 16px; padding: 12px; display: grid; gap: 10px; box-shadow: 0 18px 40px rgba(0,0,0,.6); }
.emotitle { font-weight: 800; color: #9aa0ae; font-size: .85rem; }
.emogrid { display: flex; flex-wrap: wrap; gap: 6px; }
.emoit { width: 40px; height: 40px; border-radius: 10px; background: #0e0e12; border: 1px solid #1b1c23; cursor: pointer; display: grid; place-items: center; font-size: 1.3rem; color: #fff; }
.emoit:hover { border-color: var(--accent); }
.ccard:has(.emopop) { overflow: visible; }
.penrow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.penrow .inp:not(.num) { flex: 1; min-width: 160px; }
.penrow .sel { min-width: 120px; }
.clrow { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 16px; background: #0e0e12; border: 1px solid #14151b; border-radius: 16px; }
.clrow .nstep { width: 170px; flex: none; }
.wel-avw { position: absolute; transform: translate(-50%, -50%); aspect-ratio: 1; }
.wel-avi { width: 100%; height: 100%; border-radius: 50%; border: 3px solid #fff; object-fit: cover; display: block; pointer-events: none; background: #5865f2; }
.wel-avw.selx { outline: none; }
.wel-avw.selx::after { content: ""; position: absolute; inset: -8px; border: 2px dashed var(--accent); border-radius: 50%; pointer-events: none; }
.hnd { display: none; position: absolute; width: 20px; height: 20px; border-radius: 50%; background: #fbbf24; box-shadow: 0 2px 8px rgba(0,0,0,.5); cursor: nwse-resize; touch-action: none; z-index: 2; }
.selx > .hnd { display: block; }
.hnd-t { top: 0; left: 50%; transform: translate(-50%, -50%); }
.hnd-b { bottom: 0; left: 50%; transform: translate(-50%, 50%); }
.hnd-l { left: 0; top: 50%; transform: translate(-50%, -50%); }
.hnd-r { right: 0; top: 50%; transform: translate(50%, -50%); }
.nbbox { max-width: 560px; margin: 8vh auto 0; display: grid; gap: 16px; justify-items: center; text-align: center; }
.nbicon { width: 112px; height: 112px; border-radius: 30px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); }
.nbicon img, .nbicon .fb { width: 84px; height: 84px; border-radius: 22px; object-fit: cover; }
.srvgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.srvcard { display: grid; gap: 8px; justify-items: center; padding: 22px; border-radius: 22px; border: 1px solid #1b1c23; background: rgba(8,8,10,.72); color: #fff; text-decoration: none; text-align: center; }
.srvcard:hover { border-color: #fff; }
.srvico img, .srvico .fb { width: 56px; height: 56px; border-radius: 16px; object-fit: cover; }
/* ===== أبيض وأسود + خلفية موحدة ===== */
:root, :root[data-theme="gold"], :root[data-theme="pink"], :root[data-theme="red"], :root[data-theme="discord"] {
  --accent: #ffffff; --accent-2: #d4d4d8;
}
body, body.dash {
  background: #050506 url('/bg.jpg') center / contain no-repeat fixed !important;
}
body::before {
  content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: rgba(0,0,0,.45);
}
#bubbles { display: none !important; }

html { background: #050506; }
body, body.dash {
  background: transparent !important;
}
body::before {
  content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: #050506 url('/bg.jpg') center / cover no-repeat;
}
body::after {
  content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: rgba(0,0,0,.15);
}

/* اللوجو */
.brand { gap: 14px; }
.brand-text { font-weight: 800; font-size: 1.25rem; letter-spacing: 2px; color: #fff; }
.brand-logo {
  width: 54px; height: 54px; border-radius: 50%; object-fit: cover; cursor: pointer;
  border: 1px solid rgba(255,255,255,.25);
  transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
}
.brand-logo:hover {
  transform: scale(1.12) rotate(-8deg);
  border-color: #fff;
  box-shadow: 0 0 22px rgba(255,255,255,.55);
}
.brand-logo:active { transform: scale(.9) rotate(8deg); }
.brand-logo:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.topbar { position: absolute; inset-inline: 0; top: 0; z-index: 5; }
.dtop { background: rgba(5,5,6,.75) !important; }
.drawer { background: rgba(8,8,10,.92) !important; }
.rail { background: rgba(5,5,6,.9) !important; }
.panelc, .scard, .ccard, .lcard, .fcard, .card, .plan, .arcard, .embcard, .rwcard, .xcard, .status, .limit, .rule, .lrow, .arow {
  background: rgba(8,8,10,.72) !important;
  backdrop-filter: blur(6px);
}
.hbox.blue, .hbox.orange, .hbox.purple { background: #17181b; color: #fff; }

/* ===== الصفحة الرئيسية ===== */
.hero { min-height: 100vh; display: flex; align-items: center; justify-content: flex-start; padding: 40px clamp(20px, 6vw, 90px); position: relative; z-index: 2; }
.hero-in { max-width: 580px; display: grid; gap: 22px; justify-items: start; text-align: start; }
.tagpill { direction: ltr; display: inline-flex; gap: 10px; align-items: center; padding: 10px 20px; border-radius: 22px; border: 1px solid #2a2a2e; background: rgba(0,0,0,.65); font-weight: 800; font-size: .85rem; letter-spacing: 1px; }
.hero-title { direction: ltr; text-align: right; font-size: clamp(3.2rem, 11vw, 6rem); font-weight: 800; line-height: 1; display: grid; }
.hero-title em { font-style: italic; color: #a1a1aa; }
.hero-desc { color: #c4c6cf; line-height: 2; border-inline-start: 3px solid #fff; padding-inline-start: 18px; }
.hero-btns { display: flex; gap: 14px; flex-wrap: wrap; }
.hbtn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 64px; padding: 0 42px; border-radius: 32px; font: 800 1.05rem var(--font); text-decoration: none; transition: transform .15s; }
.hbtn:hover { transform: translateY(-2px); }
.hbtn.solid { background: #fff; color: #000; }
.hbtn.line { background: rgba(0,0,0,.45); color: #fff; border: 1px solid #4b4b52; }
.explore { position: relative; z-index: 2; padding: 80px clamp(20px, 6vw, 90px); display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.xcard { border: 1px solid #2a2a2e; border-radius: 22px; padding: 26px; }
.xcard h3 { margin-bottom: 8px; }
.xcard p { color: #a1a1aa; line-height: 1.9; }
.setgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.setcard { display: grid; gap: 16px; padding: 20px; border-radius: 20px; background: rgba(8,8,10,.72); border: 1px solid #1b1c23; color: #fff; font: inherit; cursor: pointer; text-align: start; }
.setcard:hover:not(:disabled) { border-color: #fff; }
.setcard.on { border-color: #fff; box-shadow: 0 0 0 1px #fff; }
.setcard:disabled { opacity: .5; cursor: not-allowed; }
.setcard:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sdots { display: flex; align-items: center; gap: 8px; }
.sdot { width: 30px; height: 30px; border-radius: 50%; display: inline-block; }
.vipbadge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 12px; border-radius: 10px; background: #2a2110; border: 1px solid #6b5a1e; color: #fbbf24; font-weight: 800; font-size: .75rem; }
.vipbadge .ico { width: 14px; height: 14px; }
.vlock { justify-items: center; text-align: center; padding: 36px 20px; gap: 18px; }
.vlockico { position: relative; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; background: #17181b; border: 1px solid #3a3320; color: #fbbf24; }
.vlockico > .ico { width: 40px; height: 40px; }
.vlockico .mini { position: absolute; bottom: -4px; inset-inline-start: -4px; width: 34px; height: 34px; border-radius: 50%; background: #0c0c10; border: 1px solid #3a3320; display: grid; place-items: center; }
.vlockico .mini .ico { width: 16px; height: 16px; }
.vfeats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); width: 100%; border-top: 1px solid #17181e; margin-top: 8px; }
.vfeats div { display: flex; gap: 8px; align-items: center; justify-content: center; padding: 16px; color: #c9ccd6; font-weight: 700; border-inline-start: 1px solid #17181e; }
/* زر "دخول النظام": نص أبيض ونص أسود */
.hbtn.entered {
  background: linear-gradient(90deg, #fff 50%, #000 50%);
  color: #fff;
  border: 1px solid #fff;
}
.hbtn.entered .bt { mix-blend-mode: difference; }
`;


const INDEX_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OPS COIN</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body data-page="landing">
  <header class="topbar">
    <div class="brand">
      <span class="brand-text">𝗢𝗣𝗦 𝗦𝗬𝗦𝗧𝗘𝗠</span>
      <img class="brand-logo" src="/logo.png" alt="OPS" title="تحديث الصفحة" role="button" tabindex="0" onclick="location.reload()" onkeydown="if(event.key==='Enter')location.reload()">
    </div>
  </header>
  <section class="hero">
    <div class="hero-in">
      <span class="tagpill">THE NEXT GENERATION BOT <i>✦</i></span>
      <h1 class="hero-title"><span>SYSTEM</span><em>.ONLINE</em></h1>
      <p class="hero-desc">ارتقِ بمجتمعك مع أقوى نظام إدارة ذكي لسيرفرات ديسكورد. تصميم جريء، أداء فائق، وتحكم مطلق في كل التفاصيل.</p>
      <div id="notice" class="notice" role="alert">تعذّر تسجيل الدخول. حاول مرة أخرى.</div>
      <div class="hero-btns">
        <a class="hbtn solid" id="enterBtn" href="/login"><span class="bt">⚡ <span id="enterT">تفعيل النظام</span></span></a>
        <a class="hbtn line" href="#explore">↓ استكشاف</a>
      </div>
    </div>
  </section>

  <section id="explore" class="explore">
    <div class="xcard"><h3>حماية ذكية</h3><p>حماية تلقائية ضد التخريب والريد مع حدود قابلة للتخصيص.</p></div>
    <div class="xcard"><h3>أوامر ولوقات</h3><p>أوامر إدارية كاملة وسجلات مفصلة لكل حدث بالسيرفر.</p></div>
    <div class="xcard"><h3>تذاكر وترحيب</h3><p>نظام تذاكر، ترحيب بصور، رتب تلقائية، ومستويات.</p></div>
  </section>

  <script src="/app.js"></script>
</body>
</html>`;

const DASH_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OPS COIN</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body class="dash" data-page="dash">
  <header class="dtop">
    <div class="brand">
      <span class="brand-text">𝗢𝗣𝗦 𝗦𝗬𝗦𝗧𝗘𝗠</span>
      <img class="brand-logo" src="/logo.png" alt="OPS" title="تحديث الصفحة" role="button" tabindex="0" onclick="location.reload()" onkeydown="if(event.key==='Enter')location.reload()">
    </div>
    <button id="burger" class="burger" type="button" aria-label="القائمة"></button>
  </header>
  <div id="scrim" class="scrim"></div>
  <aside class="drawer" aria-label="القائمة">
    <div id="rail" class="rail"></div>
    <div id="panel" class="panel"></div>
  </aside>
  <main id="view" class="dmain"></main>
  <script src="/dash.js"></script>
</body>
</html>`;